import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { PlannerDebugRecord, PlannerDebugTimings, PlannerSpanRecord } from '../types'
import {
  clearDebugRecords,
  deleteDebugRecord,
  getDebugSpansForTrace,
  getPlannerDebugRecords,
} from '../lib/db'
import { CopyIcon, DownloadIcon, RefreshIcon, TrashIcon } from './icons'

const TIMING_LABELS: Array<{ key: keyof PlannerDebugTimings; label: string }> = [
  { key: 'prepareMs', label: '前置准备' },
  { key: 'buildRequestMs', label: '组装请求' },
  { key: 'networkMs', label: '网络等待' },
  { key: 'readResponseMs', label: '读取响应' },
  { key: 'parseJsonMs', label: '解析 JSON' },
  { key: 'normalizeMs', label: '规范化' },
  { key: 'totalMs', label: '总计' },
]

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function formatMs(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`
}

function prettyJson(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([prettyJson(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function statusBadgeClass(status: PlannerDebugRecord['status']): string {
  if (status === 'success') return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
  if (status === 'aborted') return 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
  return 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
}

function statusLabel(status: PlannerDebugRecord['status']): string {
  if (status === 'success') return '成功'
  if (status === 'aborted') return '已中止'
  return '失败'
}

function DebugTextBlock({
  title,
  description,
  text,
  onCopy,
}: {
  title: string
  description?: string
  text: string
  onCopy: (text: string, label: string) => void
}) {
  return (
    <details className="group rounded-xl border border-gray-200/70 bg-white dark:border-white/[0.07] dark:bg-white/[0.02]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5">
        <span className="min-w-0">
          <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100">{title}</span>
          {description && <span className="ml-2 text-[11px] text-gray-400 dark:text-gray-500">{description}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              onCopy(text, title)
            }}
            className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            title={`复制${title}`}
            aria-label={`复制${title}`}
          >
            <CopyIcon className="h-3.5 w-3.5" />
          </button>
          <svg className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </summary>
      <pre data-selectable-text className="max-h-72 overflow-auto overscroll-contain border-t border-gray-100 px-3.5 py-3 text-[11px] leading-5 text-gray-600 custom-scrollbar dark:border-white/[0.06] dark:text-gray-300 whitespace-pre-wrap break-words">{text || '（空）'}</pre>
    </details>
  )
}

export default function PlannerDebugPanel() {
  const showToast = useStore((state) => state.showToast)
  const [records, setRecords] = useState<PlannerDebugRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [spans, setSpans] = useState<PlannerSpanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clearArmed, setClearArmed] = useState(false)

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const nextRecords = await getPlannerDebugRecords(50)
      setRecords(nextRecords)
      setSelectedId((current) => (current && nextRecords.some((record) => record.id === current) ? current : nextRecords[0]?.id ?? null))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRecords()
  }, [loadRecords])

  const selected = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId],
  )

  useEffect(() => {
    let cancelled = false
    if (!selected) {
      setSpans([])
      return () => { cancelled = true }
    }
    void getDebugSpansForTrace(selected.traceId)
      .then((nextSpans) => {
        if (!cancelled) setSpans(nextSpans)
      })
      .catch(() => {
        if (!cancelled) setSpans([])
      })
    return () => { cancelled = true }
  }, [selected])

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`${label}已复制`, 'success')
    } catch {
      showToast('复制失败，请手动选择文本', 'error')
    }
  }, [showToast])

  const exportAll = () => {
    if (!records.length) return
    downloadJson(`planner_debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, {
      exportedAt: new Date().toISOString(),
      count: records.length,
      records,
    })
  }

  const handleClearAll = async () => {
    if (!clearArmed) {
      setClearArmed(true)
      window.setTimeout(() => setClearArmed(false), 4000)
      return
    }
    setClearArmed(false)
    try {
      await clearDebugRecords()
      setRecords([])
      setSelectedId(null)
      setSpans([])
      showToast('planner_debug 记录已清空', 'success')
    } catch (clearError) {
      showToast(`清空失败：${clearError instanceof Error ? clearError.message : String(clearError)}`, 'error')
    }
  }

  const handleDelete = async (record: PlannerDebugRecord) => {
    try {
      await deleteDebugRecord(record.id)
      setRecords((current) => current.filter((item) => item.id !== record.id))
      setSelectedId((current) => (current === record.id ? null : current))
      showToast('已删除该条 planner_debug 记录', 'success')
    } catch (deleteError) {
      showToast(`删除失败：${deleteError instanceof Error ? deleteError.message : String(deleteError)}`, 'error')
    }
  }

  const pt03 = selected?.plans.find((plan) => plan.slot.toUpperCase() === 'PT03')

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-100/70 bg-blue-50/50 p-4 dark:border-blue-400/10 dark:bg-blue-500/[0.06]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <div className="min-w-0 text-[12px] leading-5 text-gray-600 dark:text-gray-300">
            <p className="font-semibold text-gray-800 dark:text-gray-100">planner_debug：AI 策划请求全量记录</p>
            <p>每次 AI 策划会把原始 listing、系统提示、请求体、模型原始 JSON、响应体与各阶段耗时写入本机 IndexedDB（由 OpenTelemetry span 记录阶段）。所有内容仅保存在浏览器本地，最多保留最近 30 条。</p>
            <p className="mt-1 text-gray-500 dark:text-gray-400">回归对比提示：导出两次记录的 JSON 后 diff 对应槽位（例如 PT03）的 prompt 即可定位是哪次改动改变了画面内容。</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void loadRecords()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100/80 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]">
          <RefreshIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
        <button type="button" onClick={exportAll} disabled={!records.length} className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100/80 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]">
          <DownloadIcon className="h-3.5 w-3.5" />
          导出全部 JSON
        </button>
        <button type="button" onClick={() => void handleClearAll()} disabled={!records.length} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${clearArmed ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20'}`}>
          <TrashIcon className="h-3.5 w-3.5" />
          {clearArmed ? '再次点击确认清空' : '清空记录'}
        </button>
        <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">共 {records.length} 条</span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-500 dark:border-red-500/10 dark:bg-red-500/10 dark:text-red-300">
          读取 planner_debug 失败：{error}
        </div>
      )}

      {!loading && !records.length ? (
        <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-400 dark:border-white/[0.08] dark:text-gray-500">
          暂无 planner_debug 记录。回到首页点击「AI 策划」生成一次，即可在这里查看完整请求与响应。
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="max-h-[58vh] space-y-2 overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
            {records.map((record) => {
              const recordPt03 = record.plans.find((plan) => plan.slot.toUpperCase() === 'PT03')
              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => setSelectedId(record.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${record.id === selectedId ? 'border-blue-300 bg-blue-50/70 shadow-sm dark:border-blue-400/30 dark:bg-blue-500/10' : 'border-gray-200/70 bg-white hover:bg-gray-50 dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-semibold text-gray-800 dark:text-gray-100">
                      {record.mode === 'aplus' ? 'A+ 策划' : 'Listing 策划'}
                    </span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClass(record.status)}`}>
                      {statusLabel(record.status)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">{record.model}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                    <span>{formatTime(record.createdAt)}</span>
                    <span className="font-mono">{formatMs(record.timings.totalMs)}</span>
                  </div>
                  {recordPt03 && <div className="mt-1 truncate text-[10px] text-gray-400 dark:text-gray-500">PT03 · {recordPt03.prompt}</div>}
                </button>
              )
            })}
          </aside>

          <section className="min-w-0 space-y-3">
            {selected ? (
              <>
                <div className="rounded-2xl border border-gray-200/70 bg-white p-4 dark:border-white/[0.07] dark:bg-white/[0.02]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                          {selected.mode === 'aplus' ? 'A+ 策划请求' : 'Listing 策划请求'}
                        </h4>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(selected.status)}`}>{statusLabel(selected.status)}</span>
                        {selected.httpStatus != null && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">HTTP {selected.httpStatus}</span>}
                      </div>
                      <div className="mt-1 break-all text-[11px] text-gray-500 dark:text-gray-400">
                        {formatTime(selected.createdAt)} · {selected.model} · {selected.apiMode} · {selected.marketplaceId} · trace {selected.traceId.slice(0, 12)}…
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" onClick={() => void copyText(prettyJson(selected), 'planner_debug JSON')} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200" title="复制整条记录 JSON" aria-label="复制整条记录 JSON">
                        <CopyIcon className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => downloadJson(`planner_debug-${selected.id}.json`, selected)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200" title="下载该条记录" aria-label="下载该条记录">
                        <DownloadIcon className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => void handleDelete(selected)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-300" title="删除该条记录" aria-label="删除该条记录">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {selected.error && (
                    <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-500 dark:border-red-500/10 dark:bg-red-500/10 dark:text-red-300">
                      {selected.error}
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {TIMING_LABELS.map(({ key, label }) => {
                      const value = selected.timings[key]
                      if (value == null) return null
                      return (
                        <div key={key} className="rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-white/[0.04]">
                          <div className="text-[10px] text-gray-400 dark:text-gray-500">{label}</div>
                          <div className="mt-0.5 font-mono text-[12px] font-semibold text-gray-700 dark:text-gray-200">{formatMs(value)}</div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                    <span>参考图 {selected.referenceImageCount} 张</span>
                    <span>Plans {selected.plans.length}</span>
                    <span>App v{selected.appVersion}</span>
                    <span>基础地址 {selected.baseUrl}</span>
                  </div>

                  {pt03 && (
                    <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 dark:border-amber-400/10 dark:bg-amber-500/[0.06]">
                      <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">PT03 · {pt03.label}</div>
                      <p className="mt-0.5 line-clamp-3 text-[11px] leading-5 text-amber-800/80 dark:text-amber-100/70">{pt03.prompt}</p>
                    </div>
                  )}
                </div>

                {spans.length > 0 && (
                  <div className="rounded-2xl border border-gray-200/70 bg-white p-3.5 dark:border-white/[0.07] dark:bg-white/[0.02]">
                    <div className="mb-2 flex items-center justify-between">
                      <h5 className="text-[12px] font-semibold text-gray-800 dark:text-gray-100">阶段追踪（OpenTelemetry span）</h5>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">{spans.length} 个 span</span>
                    </div>
                    <div className="space-y-1.5">
                      {spans.map((span) => (
                        <div key={span.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] dark:bg-white/[0.04]">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${span.statusCode === 2 ? 'bg-red-400' : span.statusCode === 1 ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                          <span className="min-w-0 flex-1 truncate font-mono text-gray-600 dark:text-gray-300">{span.name}</span>
                          <span className="shrink-0 font-mono text-gray-500 dark:text-gray-400">{formatMs(span.durationMs)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <DebugTextBlock
                  title="PT 槽位提示词"
                  description="规范化后的结果，直接对比 PT03 等槽位"
                  text={selected.plans.map((plan) => `## ${plan.slot} · ${plan.label}\n\n${plan.prompt}\n\nNegative prompt:\n${plan.negativePrompt}`).join('\n\n---\n\n')}
                  onCopy={copyText}
                />
                <DebugTextBlock title="系统提示" description={`${selected.systemPrompt.length} 字符`} text={selected.systemPrompt} onCopy={copyText} />
                <DebugTextBlock title="原始 listing" description={`${selected.rawListing.length} 字符`} text={selected.rawListing} onCopy={copyText} />
                <DebugTextBlock title="请求体" description="已省略图片 data URL" text={prettyJson(selected.requestBody)} onCopy={copyText} />
                <DebugTextBlock title="模型原始输出" description="JSON.parse 之前" text={selected.rawOutputText} onCopy={copyText} />
                <DebugTextBlock title="原始 JSON" description="模型返回、规范化之前" text={prettyJson(selected.rawJson)} onCopy={copyText} />
                <DebugTextBlock title="响应体" description={`${selected.responseText.length} 字符`} text={selected.responseText} onCopy={copyText} />
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-400 dark:border-white/[0.08] dark:text-gray-500">
                选择左侧一条记录查看详情
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
