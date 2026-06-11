# API 参考

本 MCP Server 暴露 6 个工具。所有路径都会限制在 `FONT_SPLIT_ROOT` 内；如果没有设置该环境变量，则基于 MCP Server 进程启动时的当前工作目录解析。

## `get_agent_guidance`

返回面向 AI 编程助理的机器可读使用指南。

| 字段 | 类型 / 可选值 | 默认值 | 说明 |
|------|---------------|--------|------|
| `workflow` | `overview`, `single`, `batch`, `inspect` | `overview` | 指南侧重点。 |

响应会包含工作区路径规则、支持扩展名、默认策略、推荐批量参数、需要检查的响应字段、完成验证清单，以及推荐工具调用顺序。AI agent 在不确定该走单文件、批量、预检还是审计流程时，应该先调用这个工具，而不是猜测本机路径或依赖过期记忆。

## `get_runtime_status`

返回只读运行时诊断摘要。

这个工具会检查解析后的字体工作区、包版本、Node 运行时、平台、支持扩展名、cn-font-split 包信息，以及 cn-font-split WASM 文件。响应包含 `ok`、`checks[]`、`workspace`、`wasm`、`cnFontSplit` 和 `recommendedActions[]` 字段，方便 agent 在调用分割工具前先定位环境问题。

如果设置了 `FONT_SPLIT_WASM_PATH`，`wasm` 对象会返回 `fontSplitWasmPathConfigured: true`、原始 `configuredPath` 和解析后的运行时 `path`。

## `split_font`

处理单个字体文件，生成 cn-font-split 输出。

必填参数：

| 字段 | 类型 | 说明 |
|------|------|------|
| `fontPath` | string | `FONT_SPLIT_ROOT` 内的字体文件路径。支持 `.ttf`、`.otf`、`.ttc`、`.otc`、`.woff`、`.woff2`。 |

常用可选参数：

| 字段 | 类型 / 可选值 | 默认值 | 说明 |
|------|---------------|--------|------|
| `outDir` | string | `split-output/<family>` | 输出目录。 |
| `fontFamily` | string | 字体内部 family 名 | CSS `font-family`。 |
| `fontWeight` | string | 不设置 | CSS `font-weight`。 |
| `fontStyle` | string | 不设置 | CSS `font-style`。 |
| `fontDisplay` | string | fallback CSS 中为 `swap` | CSS `font-display`。 |
| `cssFileName` | string | `result.css` | 生成的 CSS 文件名。 |
| `chunkSize` | 正整数 | cn-font-split 默认值 | 目标分片大小，单位 byte。 |
| `testHtml` | boolean | cn-font-split 默认值 | 在支持时生成预览 HTML。 |
| `reporter` | boolean | cn-font-split 默认值 | 在支持时生成 reporter 输出。 |
| `oversizedKernAction` | `preserve`, `strip` | `preserve` | 是否在分割前移除异常巨大的 `kern` 表。 |
| `smallGlyphAction` | `subset`, `single-woff2`, `copy-original` | `subset` | 当 `glyphCount <= smallGlyphThreshold` 时如何处理。 |
| `smallGlyphThreshold` | 正整数 | `50` | `single-woff2` 和 `copy-original` 小字形处理的判断阈值。 |
| `splitFailureAction` | `error`, `single-woff2` | `error` | 分割失败时报错，还是回退为单 WOFF2。 |

高级 cn-font-split 参数：

| 字段 | 类型 / 可选值 | 默认值 | 说明 |
|------|---------------|--------|------|
| `chunkSizeTolerance` | 正数 | cn-font-split 默认值 | 传给 cn-font-split 的分片大小容差。 |
| `maxAllowSubsetsCount` | 正整数 | cn-font-split 默认值 | cn-font-split 允许生成的最大 subset 数。 |
| `languageAreas` | boolean | cn-font-split 默认值 | 启用 cn-font-split 的语言区域优化。 |
| `previewText` | string | 不设置 | 在支持时用于生成预览资产的文本。 |
| `previewName` | string | 不设置 | 在支持时用于生成预览资产的名称。 |
| `renameOutputFont` | string | 不设置 | 输出字体文件名模板，例如 `font_[hash:6].[ext]`。 |
| `buildMode` | string | cn-font-split 默认值 | cn-font-split 构建模式。 |
| `multiThreads` | boolean | cn-font-split 默认值 | 在运行时支持时启用多线程处理。 |
| `fontFeature` | boolean | cn-font-split 默认值 | 启用字体特性处理。 |
| `reduceMins` | boolean | cn-font-split 默认值 | 在支持时降低最小 subset 大小。 |
| `autoSubset` | boolean | cn-font-split 默认值 | 让 cn-font-split 自动创建 subsets。 |
| `subsetRemainChars` | boolean | cn-font-split 默认值 | 在支持时包含未显式声明的剩余字符。 |
| `subsets` | codepoint 数组的数组 | 不设置 | 显式指定每个 subset 保留的 Unicode codepoint 组。 |

关键返回字段：

| 字段 | 含义 |
|------|------|
| `resultType` | `subset`、`single-woff2-small-glyph`、`single-woff2-split-failure`、`single-woff2`、`copy-original-small-glyph` 之一。 |
| `outputMode` | `subset`、`single-woff2`、`copy-original` 之一。 |
| `performedSplit` | 只有真正执行多分片分割时才是 `true`。 |
| `usedFallback` | 单 WOFF2 fallback 路径为 `true`。 |
| `manifestPath` | `split-meta.json` 路径。 |

## `inspect_font_inputs`

在分割前扫描输入文件，不写任何输出。

| 字段 | 类型 / 可选值 | 默认值 | 说明 |
|------|---------------|--------|------|
| `inputDir` | string | `.` | `FONT_SPLIT_ROOT` 内要扫描的目录。 |
| `maxFiles` | 正整数，MCP 最大 `50000` | `50000` | 最多扫描多少个源文件。 |
| `includeFiles` | boolean | `true` | 是否返回每个字体的 `files[]` 详情；大库只看摘要时可设为 `false`。 |

重要返回字段：

| 字段 | 含义 |
|------|------|
| `supportedFontCount` | 扩展名属于受支持字体格式的文件数。 |
| `validFontCount` | 基础字体元数据可解析的文件数。 |
| `invalidFontCount` | 扩展名像字体、但解析失败的文件数。 |
| `missingIdentityCount` | 可解析、但没有可用于批量去重的身份 key 的字体数。 |
| `maxFilesHit` | 只有当 `maxFiles` 之外确实还存在更多源文件时才为 `true`。 |
| `invalidFonts[]` | 解析失败字体的紧凑清单和错误信息。 |
| `files[]` | 可选的逐字体详情，包含扩展名、容器、身份信息、identity key、glyph count 和解析状态。 |

## `split_font_batch`

扫描目录、去重等价字体、分组输出，并处理选中的字体。

| 字段 | 类型 / 可选值 | 默认值 | 说明 |
|------|---------------|--------|------|
| `inputDir` | string | `.` | `FONT_SPLIT_ROOT` 内要扫描的目录。 |
| `outputRoot` | string | `split-output` | 批量输出根目录。 |
| `limit` | 正整数，MCP 最大 `50000` | `20` | 去重后最多处理多少个字体。 |
| `maxFiles` | 正整数，MCP 最大 `50000` | `5000` | 扫描阶段最多读取多少个源文件。 |
| `includeResults` | boolean | `true` | 是否返回每个字体的 `results[]` 详情；全量跑建议设为 `false`。 |
| `dryRun` | boolean | `false` | 只预览扫描、去重、命名和 skip 决策，不写任何输出文件。 |
| `strictMode` | boolean | `false` | 一键严格默认值。未显式设置的 `skipMode` 会变为 `manifest`，未显式设置的 `batchErrorMode` 会变为 `fail-after`；显式参数仍可覆盖。 |
| `skipMode` | `legacy-css`, `manifest`, `force` | `legacy-css` | 已有输出的跳过策略。 |
| `batchGroupBy` | `auto`, `source-dir`, `font-family` | `auto` | 第一层 family 目录策略。 |
| `batchNamingMode` | `plain`, `numeric-suffix`, `source-suffix` | `numeric-suffix` | 每个字体输出目录的命名策略。 |
| `batchDedupeMode` | `none`, `same-path`, `font-identity` | `font-identity` | 处理前的去重策略。 |
| `batchErrorMode` | `collect`, `fail-fast`, `fail-after` | `collect` | 单字体错误的处理策略。 |
| `debugBatchDecisions` | boolean | `false` | 输出结构化调试日志，覆盖 dedupe、naming、skip 和 error 决策。 |

`split_font_batch` 也接受 `split_font` 的处理参数，但不接受 `fontPath` 和 `outDir`。批量模式会把这些处理参数应用到每个选中的字体，并使用 `inputDir` / `outputRoot` 控制路径。

批量响应会包含 `scannedFileCount`、`maxFiles` 和 `maxFilesHit`。`maxFilesHit: true` 表示源文件扫描被截断，调用方应该调高 `maxFiles` 后重跑，再把摘要视为完整结果。

批量格式代表优先级为：`.otf`、`.ttf`、`.woff2`、`.ttc`、`.otc`、`.woff`。

`font-identity` 会跨格式比较归一化后的字体身份。身份键优先使用 typographic family/subfamily，再回退到 legacy family/subfamily，再回退到 full name 或 PostScript name。`glyphCount` 只用于诊断，不参与等价判定，因此不会把等价的 OTF/TTF/WOFF 输入拆开。
如果某个文件的身份解析失败，批量去重会回退到该文件的路径 stem，保证扫描继续进行，并把真正的单字体错误留到处理阶段报告。

`batchErrorMode` 默认是 `collect`，会保持兼容：即使存在单字体错误，也返回 `ok: true` 和 `errors[]`。自动化场景可以用 `fail-fast` 在首个错误时抛错，或用 `fail-after` 处理完选中字体后如果有错误再抛错。
`strictMode: true` 只改变未显式设置的批量默认值，不会禁止显式覆盖。
当 `fail-fast` 或 `fail-after` 通过 MCP Server 抛错时，错误响应文本是 JSON，包含 `ok: false`、`name`、`error` 和 `details`，因此 agent 仍可读取 `details.errors[]` 与 `details.summary`。

全量字体库的简洁响应示例：

```json
{
  "inputDir": ".",
  "outputRoot": "split-output",
  "limit": 50000,
  "maxFiles": 50000,
  "includeResults": false,
  "strictMode": true,
  "batchNamingMode": "numeric-suffix",
  "batchDedupeMode": "font-identity",
  "skipMode": "manifest",
  "splitFailureAction": "single-woff2"
}
```

`dryRun: true` 且 `includeResults: true` 时，响应使用 `planned[]` 而不是 `results[]`。每个计划条目包含 `input`、`groupName`、`splitDir`、`copiedOriginalPath`、`wouldProcess` 和 `skipReason`。

## `inspect_split_output`

检查已生成的输出目录。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `outDir` | string | `split-output` | 要检查的输出目录。 |
| `maxFiles` | 正整数，MCP 最大 `200000` | `200000` | 输出检查阶段最多扫描多少个文件。 |
| `includeFiles` | boolean | `true` | 是否返回扁平 `files[]` 清单；大库只看摘要时可设为 `false`。 |
| `includeFamilies` | boolean | `true` | 是否返回结构化 `families[]` 清单；大库只看摘要时可设为 `false`。 |

重要返回字段：

| 字段 | 含义 |
|------|------|
| `familyCount` | 检测到的 family 目录数量。 |
| `maxFilesHit` | 只有当 `maxFiles` 之外确实还存在更多输出文件时才为 `true`。 |
| `filesIncluded` / `familiesIncluded` | 响应中是否包含 `files[]` 和 `families[]`。 |
| `fontEntryCount` | 检测到的字体输出条目数量。 |
| `manifestCount` | 带 `split-meta.json` 的条目数量。 |
| `legacyOutputCount` | 没有 manifest、只能保守推断的旧输出数量。 |
| `families[]` | 结构化 family / font entry 清单。 |
