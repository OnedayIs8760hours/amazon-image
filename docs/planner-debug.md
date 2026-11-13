# AI 策划请求可观测（planner_debug）

## 为什么

AI 策划的输入（listing、系统提示、参考图、JSON Schema）和输出（模型原始 JSON）以前只存在于浏览器 Network 面板里。请求一结束就无法回放，出现「PT03 从面料变成印花」这类回归时，只能靠记忆猜是哪次提示词改动导致的。

现在每次 `callAmazonPlannerApi` 都会写入一条 `planner_debug` 记录，保存在本机 IndexedDB，可导出后做 diff。

## 技术实现

- 使用 [OpenTelemetry](https://opentelemetry.io/)（`@opentelemetry/api` + `@opentelemetry/sdk-trace-base`）为「前置准备 / 组装请求 / 网络 / 读取响应 / 解析 JSON / 规范化」建立阶段 span。
- 自定义 `SpanExporter` 把 span 落到 IndexedDB（`debugRecords`，`kind: "planner_span"`），不上传任何远端 collector。
- `planner_debug` 记录（`kind: "planner_debug"`）保存完整请求上下文，与同一次请求的 span 通过 `traceId` 关联。
- 所有写入都是 best-effort：IndexedDB 不可用、隐私模式或配额不足时只输出一次 console 警告，不影响策划请求本身。

## 记录内容

| 字段 | 说明 |
| --- | --- |
| `rawListing` | 用户粘贴的原始 listing 文本 |
| `systemPrompt` | 实际发送的系统提示（Responses API 为 `instructions`） |
| `requestBody` | 实际请求体；图片 data URL 会被替换成摘要，避免占满 IndexedDB |
| `responseText` | 模型原始响应文本（SSE 时为原始事件流） |
| `rawOutputText` | 从响应中提取的模型输出文本（`JSON.parse` 之前，可能带 Markdown JSON 围栏） |
| `rawJson` | 模型返回、规范化之前的 JSON 对象 |
| `plans` | 规范化后的槽位摘要（`slot` / `label` / `prompt` / `negativePrompt`），用于直接对比 PT03 |
| `timings` | `prepareMs`、`buildRequestMs`、`networkMs`、`readResponseMs`、`parseJsonMs`、`normalizeMs`、`totalMs` |
| `traceId` | 关联同一次请求的 OpenTelemetry span |
| `status` / `httpStatus` / `error` | 成功、失败或中止，以及 HTTP 状态与错误信息 |

## 查看与回归对比

1. 打开「设置 → 调试日志」。
2. 左侧选择一次策划记录，右侧可查看阶段耗时、槽位提示词、系统提示、原始 listing、请求体、原始 JSON、响应体。
3. 点击「导出全部 JSON」，或单条记录的下载按钮，导出后与其他版本 diff。
4. 对比 `plans[].prompt` 中同一 `slot`（例如 `PT03`）即可定位是哪次提示词/模型/参数改动改变了画面描述。

## 存储与隐私

- 数据仅保存在浏览器 IndexedDB（`amazon-image-studio` / `debugRecords`），不会上传。
- 最多保留最近 30 条 `planner_debug` 与 600 个 span，超出后自动删除最旧记录。
- 图片 base64 data URL 不会落库，只保存 MIME 与字符数摘要；`apiKey`、`authorization`、`access_token` 等字段会被脱敏。
- 记录中包含 listing 与提示词原文，分享导出文件前请自行确认是否包含敏感商品信息。

## 扩展到其他模型请求

图片生成等其他请求也可以复用同一套设施：

```ts
const traceId = createPlannerTraceId()
const startedAt = nowMs()
const span = startPlannerSpan('image.request', traceId, { 'model.name': model })
let status: 'success' | 'error' = 'success'
try {
  const response = await fetch(url, requestInit)
  // ...读取并解析 response...
} catch (error) {
  status = 'error'
  throw error
} finally {
  const totalMs = Math.round(nowMs() - startedAt)
  endPlannerSpan(span)
  await recordPlannerDebug({
    traceId,
    status,
    mode: 'listing',
    marketplaceId: 'us',
    model,
    apiMode: 'images',
    baseUrl,
    rawListing: '',
    systemPrompt: '',
    requestBody,
    responseText,
    rawOutputText,
    rawJson,
    plans: [],
    timings: { buildRequestMs: 0, networkMs: totalMs, readResponseMs: 0, parseJsonMs: 0, normalizeMs: 0, totalMs },
    referenceImageCount,
  })
}
```

必要时可以把 `recordPlannerDebug` 拆成更通用的 `recordModelDebug`，并给记录增加 `operation` 字段区分 planner / image / agent。
