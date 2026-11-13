import { SpanStatusCode, trace, type Span, type Tracer } from '@opentelemetry/api'
import { ExportResultCode } from '@opentelemetry/core'
import {
  BasicTracerProvider,
  RandomIdGenerator,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base'
import type { PlannerDebugRecord, PlannerSpanRecord } from '../types'
import { putDebugRecord, pruneDebugRecords } from './db'

/**
 * AI 请求可观测层。
 *
 * - 使用 OpenTelemetry（@opentelemetry/api + sdk-trace-base）记录请求各阶段 span；
 *   自定义 SpanExporter 把 span 落到浏览器 IndexedDB，而不是上传到远端 collector。
 * - planner_debug 记录保存完整上下文（原始 listing、系统提示、请求/响应体、原始 JSON、
 *   各阶段耗时），用于提示词/模型回归时对比具体槽位（例如 PT03）的变化。
 * - 所有写入都是 best-effort：IndexedDB 不可用或配额不足时只告警，不影响策划请求本身。
 */

const SCOPE_NAME = 'amazon-image-studio/planner'
const MAX_PLANNER_DEBUG_RECORDS = 30
const MAX_PLANNER_SPAN_RECORDS = 600
const MAX_LISTING_TEXT_LENGTH = 400_000
const MAX_SYSTEM_PROMPT_LENGTH = 400_000
const MAX_RESPONSE_TEXT_LENGTH = 1_000_000
const MAX_ERROR_LENGTH = 8_000
const MAX_DEBUG_STRING_LENGTH = 200_000
const MAX_DEBUG_ARRAY_ITEMS = 300
const MAX_DEBUG_OBJECT_KEYS = 300
const MAX_DEBUG_DEPTH = 10
const PERSIST_TIMEOUT_MS = 2_500
const DATA_URL_PATTERN = /data:([a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*);base64,[a-z0-9+/=]+/gi
const SENSITIVE_KEY_PATTERN = /^(?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|cookie|set-cookie)$/i

const idGenerator = new RandomIdGenerator()
let provider: BasicTracerProvider | null = null
let tracer: Tracer = trace.getTracer(SCOPE_NAME, getAppVersion())
let warnedAboutPersistence = false

function getAppVersion(): string {
  try {
    return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
  } catch {
    return 'dev'
  }
}

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function warnPersistenceFailure(error: unknown) {
  if (warnedAboutPersistence) return
  warnedAboutPersistence = true
  console.warn('[planner_debug] 调试记录持久化失败，本次及后续记录可能不会保存到 IndexedDB。', error)
}

export function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
}

export function createPlannerTraceId(): string {
  return idGenerator.generateTraceId()
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n\n…[已截断 ${text.length - maxLength} 字符]`
}

function summarizeDataUrl(match: string, mimeType: string): string {
  return `[已省略 ${mimeType} data URL，共 ${match.length} 字符，避免调试库占满 IndexedDB]`
}

function sanitizeText(value: string, maxLength: number): string {
  return truncateText(value.replace(DATA_URL_PATTERN, summarizeDataUrl), maxLength)
}

/** 把任意可 JSON 化的值整理成可安全落库的结构：省略图片 data URL、脱敏常见密钥字段、限制长度与深度。 */
export function sanitizeForDebug(value: unknown, depth = 0): unknown {
  if (value == null) return value
  if (typeof value === 'string') {
    const withoutDataUrls = value.replace(DATA_URL_PATTERN, summarizeDataUrl)
    return truncateText(withoutDataUrls, MAX_DEBUG_STRING_LENGTH)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (depth >= MAX_DEBUG_DEPTH) return '[超出最大深度]'
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_DEBUG_ARRAY_ITEMS).map((item) => sanitizeForDebug(item, depth + 1))
    if (value.length > MAX_DEBUG_ARRAY_ITEMS) {
      items.push(`…[已省略 ${value.length - MAX_DEBUG_ARRAY_ITEMS} 项]`)
    }
    return items
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    const entries = Object.entries(value as Record<string, unknown>)
    for (const [key, entryValue] of entries.slice(0, MAX_DEBUG_OBJECT_KEYS)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[已脱敏]' : sanitizeForDebug(entryValue, depth + 1)
    }
    if (entries.length > MAX_DEBUG_OBJECT_KEYS) {
      result.__truncatedKeys = entries.length - MAX_DEBUG_OBJECT_KEYS
    }
    return result
  }
  return String(value)
}

function hrTimeToMs(hrTime: [number, number]): number {
  return Math.round((hrTime[0] * 1000 + hrTime[1] / 1e6) * 100) / 100
}

function toPlannerSpanRecord(span: ReadableSpan): PlannerSpanRecord {
  const attributes: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(span.attributes)) {
    if (value == null) continue
    if (typeof value === 'string') {
      attributes[key] = value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      attributes[key] = value
    } else {
      attributes[key] = String(value).slice(0, 2_000)
    }
  }
  const spanContext = span.spanContext()
  const correlatedTraceId = typeof attributes['app.trace_id'] === 'string'
    ? attributes['app.trace_id']
    : spanContext.traceId

  return {
    id: spanContext.spanId,
    kind: 'planner_span',
    createdAt: Date.now(),
    traceId: correlatedTraceId,
    spanId: spanContext.spanId,
    otelTraceId: spanContext.traceId,
    ...(span.parentSpanContext?.spanId ? { parentSpanId: span.parentSpanContext.spanId } : {}),
    name: span.name,
    durationMs: hrTimeToMs(span.duration),
    statusCode: span.status.code,
    ...(span.status.message ? { statusMessage: span.status.message } : {}),
    attributes,
  }
}

class IndexedDbSpanExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: { code: ExportResultCode }) => void): void {
    if (!hasIndexedDb()) {
      resultCallback({ code: ExportResultCode.SUCCESS })
      return
    }

    const records = spans.map(toPlannerSpanRecord)
    void Promise.all(records.map((record) => putDebugRecord(record)))
      .then(() => pruneDebugRecords('planner_span', MAX_PLANNER_SPAN_RECORDS))
      .catch(warnPersistenceFailure)
      .finally(() => resultCallback({ code: ExportResultCode.SUCCESS }))
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }
}

function getPlannerTracer(): Tracer {
  if (provider || !hasIndexedDb()) return tracer
  try {
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(new IndexedDbSpanExporter())],
      spanLimits: {
        attributeCountLimit: 64,
        attributeValueLengthLimit: 10_000,
        eventCountLimit: 64,
      },
    })
    tracer = provider.getTracer(SCOPE_NAME, getAppVersion())
  } catch (error) {
    warnPersistenceFailure(error)
    provider = null
  }
  return tracer
}

/** 开启一个阶段 span；调用方负责 endPlannerSpan。IndexedDB 不可用时返回 null。 */
export function startPlannerSpan(
  name: string,
  traceId: string,
  attributes: Record<string, string | number | boolean> = {},
): Span | null {
  if (!hasIndexedDb()) return null
  try {
    return getPlannerTracer().startSpan(name, {
      attributes: {
        'app.trace_id': traceId,
        ...attributes,
      },
    })
  } catch (error) {
    warnPersistenceFailure(error)
    return null
  }
}

export function endPlannerSpan(span: Span | null, error?: unknown): void {
  if (!span) return
  if (error !== undefined) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    })
    if (error instanceof Error) span.recordException(error)
  } else {
    span.setStatus({ code: SpanStatusCode.OK })
  }
  span.end()
}

export async function recordPlannerDebug(
  input: Omit<PlannerDebugRecord, 'id' | 'kind' | 'createdAt' | 'appVersion'> & { id?: string },
): Promise<void> {
  if (!hasIndexedDb()) return

  const record: PlannerDebugRecord = {
    ...input,
    id: input.id ?? `planner-${input.traceId}`,
    kind: 'planner_debug',
    createdAt: Date.now(),
    appVersion: getAppVersion(),
    rawListing: truncateText(input.rawListing, MAX_LISTING_TEXT_LENGTH),
    systemPrompt: truncateText(input.systemPrompt, MAX_SYSTEM_PROMPT_LENGTH),
    requestBody: sanitizeForDebug(input.requestBody),
    responseText: sanitizeText(input.responseText, MAX_RESPONSE_TEXT_LENGTH),
    rawOutputText: sanitizeText(input.rawOutputText, MAX_RESPONSE_TEXT_LENGTH),
    rawJson: sanitizeForDebug(input.rawJson),
    plans: input.plans.map((plan) => ({
      slot: plan.slot,
      label: plan.label,
      prompt: truncateText(plan.prompt, MAX_DEBUG_STRING_LENGTH),
      negativePrompt: truncateText(plan.negativePrompt, MAX_DEBUG_STRING_LENGTH),
    })),
    ...(input.error ? { error: truncateText(input.error, MAX_ERROR_LENGTH) } : {}),
  }

  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), PERSIST_TIMEOUT_MS)
    })
    const result = await Promise.race([
      putDebugRecord(record).then(() => pruneDebugRecords('planner_debug', MAX_PLANNER_DEBUG_RECORDS)).then(() => 'done' as const),
      timeout,
    ])
    if (timer) clearTimeout(timer)
    if (result === 'timeout') {
      warnPersistenceFailure(new Error(`IndexedDB 写入超过 ${PERSIST_TIMEOUT_MS}ms 未完成`))
    }
  } catch (error) {
    warnPersistenceFailure(error)
  }
}
