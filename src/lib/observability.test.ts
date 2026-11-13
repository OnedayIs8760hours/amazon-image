import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultOpenAIProfile } from './apiProfiles'
import { DEFAULT_AMAZON_PROMPT_DRAFT } from './amazonPrompt'
import { callAmazonPlannerApi } from './listingPlannerApi'
import { clearDebugRecords, getDebugSpansForTrace, getPlannerDebugRecords, pruneDebugRecords, putDebugRecord } from './db'
import { nowMs, sanitizeForDebug } from './observability'

const SAMPLE_LISTING = [
  'Title: 40 oz Stainless Steel Insulated Tumbler with Handle and Straw Lid, Matte Black',
  '',
  'About this item',
  '- Keeps drinks cold for 24 hours with double wall vacuum insulation',
  '- Ergonomic handle fits most car cup holders',
].join('\n')

const LISTING_SLOTS = ['MAIN', 'PT01', 'PT02', 'PT03', 'PT04', 'PT05', 'PT06']

function createPlannerPayload() {
  return {
    product: {
      title: '40 oz insulated tumbler',
      category: 'Kitchen / Drinkware',
      brand: '',
      color: 'matte black',
      material: 'stainless steel',
      audience: 'commuters',
      packageIncludes: '1 tumbler, 1 straw',
    },
    sellingPoints: ['Cold for 24 hours'],
    seriesStyleGuide: 'Use a cohesive warm commercial style across the set.',
    imagePlans: LISTING_SLOTS.map((slot) => ({
      slot,
      label: `${slot} 方案`,
      planMarkdown: `## ${slot} 策划说明\n\n中文说明。`,
      prompt: slot === 'PT03' ? 'PT03 printable fabric texture close-up prompt' : `Create ${slot} product image.`,
      negativePrompt: `negative ${slot}`,
    })),
  }
}

function createPlannerProfile() {
  return createDefaultOpenAIProfile({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'user-api-key',
    apiMode: 'responses',
    model: 'gpt-planner-profile',
  })
}

async function waitForSpans(traceId: string, minimum: number) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const spans = await getDebugSpansForTrace(traceId)
    if (spans.length >= minimum) return spans
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return getDebugSpansForTrace(traceId)
}

beforeEach(async () => {
  await clearDebugRecords()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('planner_debug observability', () => {
  it('sanitizes image data URLs and sensitive fields before persistence', () => {
    const sanitized = sanitizeForDebug({
      apiKey: 'sk-secret',
      authorization: 'Bearer secret',
      image: 'data:image/png;base64,AAAA',
      nested: { prompt: 'fabric texture', access_token: 'abc' },
    }) as Record<string, unknown>

    expect(sanitized.apiKey).toBe('[已脱敏]')
    expect(sanitized.authorization).toBe('[已脱敏]')
    expect(sanitized.image).toContain('[已省略 image/png data URL')
    expect((sanitized.nested as Record<string, unknown>).access_token).toBe('[已脱敏]')
    expect((sanitized.nested as Record<string, unknown>).prompt).toBe('fabric texture')
  })

  it('persists request, response, raw JSON, plan digests, timings and OpenTelemetry spans', async () => {
    const payload = createPlannerPayload()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output_text: JSON.stringify(payload),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      referenceImageDataUrls: ['data:image/png;base64,reference'],
      profile: createPlannerProfile(),
      requestStartedAt: nowMs() - 120,
    })

    const records = await getPlannerDebugRecords(10)
    expect(records).toHaveLength(1)
    const record = records[0]!

    expect(record.kind).toBe('planner_debug')
    expect(record.status).toBe('success')
    expect(record.mode).toBe('listing')
    expect(record.model).toBe('gpt-planner-profile')
    expect(record.httpStatus).toBe(200)
    expect(record.rawListing).toBe(SAMPLE_LISTING)
    expect(record.systemPrompt).toContain('You are an Amazon image-planning agent')
    expect(record.responseText).toContain('output_text')
    expect(record.rawOutputText).toContain('imagePlans')
    expect(record.rawJson).toEqual(payload)
    expect(record.plans.find((plan) => plan.slot === 'PT03')?.prompt).toContain('printable fabric texture')
    expect(record.referenceImageCount).toBe(1)
    expect(record.timings.prepareMs).toBeGreaterThan(0)
    expect(record.timings.totalMs).toBeGreaterThan(0)
    expect(record.timings).toEqual(expect.objectContaining({
      buildRequestMs: expect.any(Number),
      networkMs: expect.any(Number),
      readResponseMs: expect.any(Number),
      parseJsonMs: expect.any(Number),
      normalizeMs: expect.any(Number),
    }))

    const requestBody = record.requestBody as {
      input: Array<{ content: Array<{ type: string; image_url?: string }> }>
    }
    expect(requestBody.input[0]?.content[1]?.image_url).toContain('[已省略 image/png data URL')
    expect(JSON.stringify(record.requestBody)).not.toContain('base64,reference')

    const spans = await waitForSpans(record.traceId, 5)
    const spanNames = spans.map((span) => span.name)
    expect(spanNames).toEqual(expect.arrayContaining([
      'planner.request',
      'planner.network',
      'planner.read_response',
      'planner.parse_json',
      'planner.normalize',
    ]))
  })

  it('records HTTP failures together with the error response body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'planner quota exceeded' },
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      profile: createPlannerProfile(),
    })).rejects.toThrow('HTTP 429')

    const records = await getPlannerDebugRecords(10)
    expect(records).toHaveLength(1)
    const record = records[0]!
    expect(record.status).toBe('error')
    expect(record.httpStatus).toBe(429)
    expect(record.error).toContain('HTTP 429')
    expect(record.responseText).toContain('planner quota exceeded')
    expect(record.plans).toEqual([])
    expect(record.timings.totalMs).toBeGreaterThan(0)
  })

  it('prunes the oldest planner_debug records with an index key cursor', async () => {
    for (let index = 0; index < 6; index += 1) {
      await putDebugRecord({
        id: `record-${index}`,
        kind: 'planner_debug',
        createdAt: index,
        traceId: `trace-${index}`,
        status: 'success',
        mode: 'listing',
        marketplaceId: 'us',
        model: 'mock',
        apiMode: 'responses',
        baseUrl: 'https://api.example.com/v1',
        rawListing: '',
        systemPrompt: '',
        requestBody: null,
        responseText: '',
        rawOutputText: '',
        rawJson: null,
        plans: [],
        timings: { buildRequestMs: 0, networkMs: 0, readResponseMs: 0, parseJsonMs: 0, normalizeMs: 0, totalMs: 0 },
        referenceImageCount: 0,
        appVersion: '0.2.0',
      })
    }

    await pruneDebugRecords('planner_debug', 3)

    const records = await getPlannerDebugRecords(10)
    expect(records.map((record) => record.id)).toEqual(['record-5', 'record-4', 'record-3'])
  })

  it('captures the raw SSE response body without breaking streaming parsing', async () => {
    const payload = createPlannerPayload()
    const sseText = [
      `data: ${JSON.stringify({ type: 'response.completed', response: { output_text: JSON.stringify(payload) } })}`,
      '',
      '',
    ].join('\n')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sseText, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })))

    const result = await callAmazonPlannerApi({
      listingText: SAMPLE_LISTING,
      baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
      profile: createPlannerProfile(),
    })

    expect(result.plans).toHaveLength(LISTING_SLOTS.length)
    const records = await getPlannerDebugRecords(10)
    const record = records[0]!
    expect(record.responseText).toContain('response.completed')
    expect(record.rawJson).toEqual(payload)
  })
})
