# API 参考

本 MCP Server 暴露 7 个工具。所有路径都会限制在 `FONT_SPLIT_ROOT` 内；如果没有设置该环境变量，则基于 MCP Server 进程启动时的当前工作目录解析。响应路径会用 `.` 表示工作区根目录，而不是空字符串；推荐后续调用参数也遵循这个规则。

显式传入的无效配置会被拒绝，而不是静默回退。MCP 调用会先经过工具 schema；绕过 MCP schema 直接调用模块函数时，会抛出 `FontSplitConfigurationError`，并在 `details.summaryType: "configuration-error"`、`details.option`、`details.received`、`details.allowedValues` 或 `details.expectedType`、`details.defaultWhenOmitted`、`details.omitForDefaultBehavior: true` 中给出机器可读细节。需要默认行为时应省略该选项，而不是传入无效的枚举、布尔或数字值。

## `get_agent_guidance`

返回面向 AI 编程助理的机器可读使用指南。

| 字段 | 类型 / 可选值 | 默认值 | 说明 |
|------|---------------|--------|------|
| `workflow` | `overview`, `single`, `batch`, `inspect`, `organize` | `overview` | 指南侧重点。 |
| `detailLevel` | `compact`, `full` | `compact` | 响应体量。`compact` 保留工作流关键 section，并默认省略较大的 catalog / 示例；`full` 返回全部指南 section。 |
| `sections` | section 名称数组 | 不设置 | 聚焦返回指定 section。设置后会覆盖 `detailLevel` 的默认 section 集。 |

响应始终包含 `guidanceView`，用于说明本次返回了哪些 section、省略了哪些 section，以及可请求的 section 名称。默认响应是紧凑版：包含工作区路径规则、支持扩展名、默认策略、`configurationRecipes[]`、`batchPolicyGuide`、`unsupportedFileCategoryCatalog`、推荐批量和目录整理参数、需要检查的响应字段、完成验证清单、`errorResponseCatalog`、`localVerificationOutputGuide`、`directoryWorkflowDecisionMatrix[]`、`safeInvocationTemplates[]`、`nextToolDecisionSummary`、`recommendedWorkflowPlan`，以及推荐工具调用顺序。AI agent 在不确定该走单文件、批量、预检、整理还是审计流程时，应该先调用这个工具，而不是猜测本机路径或依赖过期记忆。

当 agent 需要一次拿到全部 catalog 和示例时，使用 `detailLevel: "full"`。当只需要某些数据时，使用 `sections`，例如 `["error-catalog", "warning-catalog", "field-catalog"]`。可选 section 名称见 `guidanceView.availableSections`。

如果只需要最小路线响应，可用 `workflow: "organize"` 搭配 `sections: ["workflow"]`，然后检查 `nextToolDecisionSummary.workflowQuickStart.recommendedCallExample`。其中嵌套的 `workflowQuickStart.recommendedCallExample` 对象就是可复制的第一步调用。对于结构不确定的源目录，推荐调用应是无写入的 `organize_font_directory` safe preview（`workflowPreset: "safe-preview"`），并且 `writesFiles: false`、`sourceDestructive: false`。只有当用户明确需要暂存目录，或实际响应要求切换分支时，才使用其中的 `alternateCallExamples[]`。

`configurationRecipes[]` 会把常见用户意图映射成 preset-first 调用和取舍说明。当前覆盖默认安全批量、保留每个源字体、按源目录分组、按字体 metadata 分组、快速结构优先扫描、copy-only 暂存整理，以及大库审查后写入。每个配方都会包含 `inspectFields` 和 `successCriteria`。配方只是指南，不是成功证明；agent 仍必须实际运行预览/写入工具，检查这些字段，并满足对应条件。

`batchPolicyGuide` 是批量策略选项的机器可读自定义指南。它覆盖 `batchGroupBy`、`batchNamingMode`、`batchDedupeMode` 和 `batchErrorMode`；每个策略值都会包含 `useWhen`、`avoidWhen`、`inspectFields` 和 `successCriteria`。当用户要求偏离默认 preset 的行为时，先参考它选择最小显式覆盖，然后先预览再写入。

`unsupportedFileCategoryCatalog` 会解释 `unsupportedFileSummary.byCategory[]` 使用的分类，包括代表性扩展名、分类含义和处理行为。工具响应也会提供用于快速判断的 `unsupportedFileDecision`，以及作为证据的 `unsupportedFileSummary.categoryDetails[]` 和 `unsupportedFileSummary.handlingSummary`，agent 不必再次查 guidance 也能解释它们。尤其是 `archive` 文件只会被报告用于提醒，不会被解压、复制或拆分。

`directoryWorkflowDecisionMatrix[]` 是面向常见目录场景的机器可读决策表。每个条目包含 `id`、`useWhen`、`firstTool`、默认写入/源目录安全标记、`recommendedOptions`、可选后续工具/参数、`mustInspectFields`、`successCriteria` 和 `nonIntuitiveBehavior`。其中的参数会优先使用 `workflowPreset`，只额外列出路径、规模或目录形态导致的覆盖项。

`directoryWorkflowExamples[]` 在 `detailLevel: "full"` 或请求 `sections: ["examples"]` 时返回，提供具体源目录树模式，例如扁平 vendor dump、每个压缩包/家族一个目录、根目录和子目录混合、超大/嘈杂目录第一遍扫描，以及一个面向 flat/nested/mixed/output-inside-input 的 `sourceLayoutMismatchSummary` 对照示例。示例调用也遵循 preset-first 风格，并包含 `mustInspectFields` 和 `successCriteria`。

`safeInvocationTemplates[]` 提供常见 agent 工作流的可复制起步调用，包括运行时诊断、紧凑输入预检、源目录结构不匹配时的整理计划、大目录结构优先扫描、copy-only 暂存整理、批量 dry-run 预览、已审查计划后的真实批量处理，以及紧凑输出审计。每个模板都会声明是否写文件、是否可能修改源文件、哪些参数应该由调用方自定义、必须检查哪些响应字段，以及继续前必须满足哪些 `successCriteria`。模板会刻意保持 `args` 精简：`workflowPreset` 已提供的默认项不会在每个模板中重复展开，需要查看完整展开值时使用 `workflowPresets[]`。

`recommendedWorkflowPlan` 是当前 `workflow` 对应的有序执行计划。它把安全模板 ID 编排成输入预检、目录形态决策、批量预览、审查后写入和输出审计等阶段。每个 `orderedSteps[]` 和 `decisionPoints[]` 条目都会包含 `inspectFields` 与 `successCriteria`。它是路线图，不替代工具响应检查；agent 从预览进入写入、或向用户宣称完成前，仍然必须检查列出的字段并满足对应条件。

`nextToolDecisionSummary` 是面向“下一步该调用哪个工具？”的紧凑路由索引。它把常见情形映射到首选工具，并在可用时给出 `safeInvocationTemplates[]` 的模板 ID。其中的 `workflowQuickStart` 会针对当前 `workflow` 给出推荐的第一条可复制 quick-start 调用，并列出常见分支的备用调用；`quickStartCallExamples[]` 会从安全模板生成常见路线的最小占位参数，例如单字体处理、输入预检、目录规划、copy-only 暂存、批量预览、审查后写入和输出审计。它比 `recommendedWorkflowPlan` 更短，只用于选择路线；继续前仍要查看引用的模板或实际工具响应字段，并满足 `successCriteria`。

`verificationChecklist[]` 也包含面向本包维护者的本地门禁。`local-compact-check-passed` 指向 `npm run check:compact` 和 `npm run --silent check:compact -- --json`；它是标准 syntax/smoke 检查的低噪声包装器，子门禁失败时会返回带失败步骤 stdout/stderr 尾部的 `compact-check-result`。当 agent 修改了会影响功能行为的代码后，`local-real-corpus-suite-passed` 仍要求在本机真实语料库上运行 `npm run smoke:real-corpus-suite -- <font-corpus-dir>`，再宣称本阶段完成。这是代表性可靠性门禁，不是逐个目录验收，也不是运行时 MCP 工具调用。`localVerificationOutputGuide` 是解读这些本地命令输出的机器可读伴随指南：它会给出 compact 检查的 `standardCommand`，并把真实语料 suite 的 `reliabilityGateDecision` 标为主判断字段，列出必查输出字段、通过条件、状态含义和容易误解的范围边界。suite 会先打印简短的 `real-corpus suite summary`，并在 JSON `humanSummary` 中保留同样信息，用于避免把固定目标数量误读成全库扫描数量。最终 JSON 还包含顶层 `reliabilityGateDecision`：先检查 `status`、`reliabilityGatePassed`、`blockingReasonCodes`、`fullCorpusFontCountField` 和 `targetCountsAreFullCorpusCounts`。`status: "pass"` 表示代表性功能链通过，不表示每个字体目录都已人工验收。suite 输出里的 `testScope` 会把范围拆清楚：`corpusScan` 是全库有界根扫描，`targetSampling` 是代表性 dry-run 抽样，`representativeWriteAudit` 是一个有界真实写入和输出审计路径。`coverageSummary.functionalCoverage[]` 中的 `source-layout-mismatch-summary` 表示真实语料运行已经覆盖了 `sourceLayoutMismatchSummary` 的布局提示、直接预览要求和 copy-only 源安全语义。

真实语料 suite 还会返回 `coverageSummary.unsupportedFileCategoryCoverage` 和 `coverageSummary.outputStructureAuditSummary`。前者用于确认忽略文件统计覆盖了扩展名/类别摘要，而不是只看 `.zip` / `.txt`；后者用于确认代表性单字体写入和批量写入都已经通过 `inspect_split_output`，且 `outputStructureDecision.status: "pass"`、`structureSummary.conforms: true`。

`errorResponseCatalog` 默认返回，也可通过 `sections: ["error-catalog"]` 聚焦请求。它解释 MCP 错误响应形态：带结构化 `details` 的错误会以 JSON 文本返回，包含 `ok: false`、`name`、`errorType`、`error` 和 `details`；没有 `details` 的普通错误则保持简短纯文本。`errorType` 是最短路由字段：`FontSplitConfigurationError` 会从 `details.summaryType` 得到 `errorType: "configuration-error"`，`BatchSplitError` 会使用 `errorType: "batch-split-error"`。配置错误应被视为调用方配置错误，而不是用同一个无效值重试。

`warningCodeCatalog` 在 `detailLevel: "full"` 或请求 `sections: ["warning-catalog"]` 时返回，会把 `batchWarnings[]`、`inspectionWarnings[]` 和 `organizationWarnings[]` 中的机器可读 warning code 映射到响应来源、严重度和建议 agent 动作。

`toolResponseFieldCatalog` 在 `detailLevel: "full"` 或请求 `sections: ["field-catalog"]` 时返回，会把重要响应字段路径映射到产生这些字段的工具、字段含义，以及 AI agent 在宣称成功前应该采取的动作。它是本文档的运行时补充，尤其用于避免误读 `ok`、`performedSplit`、`usedFallback`、`sourceDestructive`、`writesOutputTree`、`maxFilesHit` 和 `recommendedNextActions` 这类容易违反直觉的字段。

指南 section 名称：

| Section | 内容 |
|---------|------|
| `workspace` | 工作区根目录和路径基准信息。 |
| `tools` | 工具清单，以及每个工具适合在什么时候调用。 |
| `defaults` | 重要默认策略和支持的字体扩展名。 |
| `recommendations` | 推荐的批量、检查和目录整理参数，以及 `workflowPresets[]`、`batchPolicyGuide`、`configurationRecipes[]` 和 `unsupportedFileCategoryCatalog`。 |
| `directory-workflows` | 面向扁平、嵌套、混合、嘈杂和暂存目录场景的目录工作流决策表。 |
| `examples` | 具体源目录示例；在 `full` 详情或显式请求时返回。 |
| `verification` | agent 在宣称成功前应该验证的检查清单。 |
| `error-catalog` | `FontSplitConfigurationError`、`BatchSplitError` 等结构化 MCP 错误的错误响应目录。 |
| `warning-catalog` | `batchWarnings[]`、`inspectionWarnings[]` 和 `organizationWarnings[]` 的 warning code 目录。 |
| `field-catalog` | 把响应字段映射到含义和 agent 动作的字段目录。 |
| `safe-templates` | 常见工作流的可复制安全调用模板。 |
| `response-fields` | agent 应检查的响应字段短清单。 |
| `path-rules` | 路径限制和相对路径规则。 |
| `workflow` | 针对当前指南重点推荐的工作流文本、`nextToolDecisionSummary` 和 `recommendedWorkflowPlan`。 |

工作流预设：

| Preset | 写入行为 | 批量默认值 | 目录整理默认值 | 适用场景 |
|--------|----------|------------|----------------|----------|
| `safe-preview` | 批量和目录整理都不写文件。 | `dryRun: true`、`includeResults: true`、`skipMode: "manifest"`、`batchNamingMode: "numeric-suffix"`、`batchDedupeMode: "font-identity"`、`batchErrorMode: "fail-after"`、`splitFailureAction: "single-woff2"`。 | `dryRun: true`、`includePlan: true`、`parseFonts: true`、`batchGroupBy: "auto"`、`batchNamingMode: "numeric-suffix"`、`batchDedupeMode: "font-identity"`、`copyInvalidFonts: false`、`overwriteExisting: false`。 | 陌生源目录的第一次调用，先于任何写入。 |
| `reviewed-write` | 批量会写输出；目录整理会复制到 `outputDir`。 | `dryRun: false`、`includeResults: false`、`skipMode: "manifest"`、`batchNamingMode: "numeric-suffix"`、`batchDedupeMode: "font-identity"`、`batchErrorMode: "fail-after"`、`splitFailureAction: "single-woff2"`。 | `dryRun: false`、`includePlan: true`、`parseFonts: true`、`batchGroupBy: "auto"`、`batchNamingMode: "numeric-suffix"`、`batchDedupeMode: "font-identity"`、`copyInvalidFonts: false`、`overwriteExisting: false`。 | 已经审查过无写入预览之后。 |
| `structure-first` | 批量和目录整理都不写文件。 | `dryRun: true`、`includeResults: false`、`skipMode: "manifest"`、`batchNamingMode: "numeric-suffix"`、`batchDedupeMode: "same-path"`、`batchErrorMode: "fail-after"`。 | `dryRun: true`、`includePlan: false`、`parseFonts: false`、`batchGroupBy: "auto"`、`batchNamingMode: "numeric-suffix"`、`batchDedupeMode: "font-identity"`、`copyInvalidFonts: false`、`overwriteExisting: false`。 | 超大或嘈杂目录的第一遍结构扫描，暂时推迟元数据解析。 |
| `source-layout` | 取决于显式 `dryRun`。 | `batchGroupBy: "source-dir"`、`batchNamingMode: "numeric-suffix"`、`batchDedupeMode: "font-identity"`。 | 使用相同的分组、命名和去重默认值。 | 每个压缩包或每个 family 已经有独立源目录。 |
| `metadata-family` | 取决于显式 `dryRun`。 | `batchGroupBy: "font-family"`、`batchNamingMode: "numeric-suffix"`、`batchDedupeMode: "font-identity"`。 | 使用相同的分组、命名和去重默认值。 | 扁平源目录，需要由字体内部 metadata 决定 family 分组。 |
| `preserve-all` | 取决于显式 `dryRun`。 | `batchNamingMode: "numeric-suffix"`、`batchDedupeMode: "none"`。 | `batchNamingMode: "numeric-suffix"`、`batchDedupeMode: "none"`。 | 所有受支持字体文件都必须保留，即使看起来是重复字体。 |

## `get_runtime_status`

返回只读运行时诊断摘要。

这个工具会检查解析后的字体工作区、包版本、Node 运行时是否满足 `package.json` engines 要求、平台、支持扩展名、cn-font-split 包信息，以及 cn-font-split WASM 文件。响应包含 `ok`、`checks[]`、`node`、`workspace`、`wasm`、`cnFontSplit` 和 `recommendedActions[]` 字段，方便 agent 在调用分割工具前先定位环境问题。

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
| `unsupportedFileDecision` | 从 `unsupportedFileSummary` 派生的快速机器可读判断：忽略文件状态、类别/扩展名数量、是否有压缩包、是否存在 `.zip` / `.txt` 之外的噪声，以及“不解压、不复制、不拆分”的处理标志。 |
| `unsupportedFileSummary` | 所有被忽略的非字体文件摘要，包含精确 `byExtension`、概览 `byCategory`、带处理语义的 `categoryDetails`、总体 `handlingSummary`、无扩展文件的 `<none>` 计数，以及少量示例路径。源目录混有压缩包、说明文档、截图或生成产物时优先看它。 |
| `validFontCount` | 基础字体元数据可解析的文件数。 |
| `invalidFontCount` | 扩展名像字体、但解析失败的文件数。 |
| `missingIdentityCount` | 可解析、但没有可用于批量去重的身份 key 的字体数。 |
| `maxFilesHit` | 只有当 `maxFiles` 之外确实还存在更多源文件时才为 `true`。 |
| `inspectionWarningCount` / `inspectionWarnings[]` | 摘要级预检提示，每项包含机器可读 `code` 和人类可读 `message`。 |
| `invalidFonts[]` | 解析失败字体的紧凑清单和错误信息。 |
| `files[]` | 可选的逐字体详情，包含扩展名、容器、身份信息、identity key、glyph count 和解析状态。 |

`unsupportedFileDecision` 是给 agent 的最短判断路线：先看 `status`、`totalUnsupportedFileCount`、`hasArchives`、`extensionsBeyondZipTxtCount`、`reviewRecommended`、`recommendedAction` 和 `handlingSummary`。`unsupportedFileSummary` 暴露 `unsupportedFileSummary.total`、`unsupportedFileSummary.byExtension[]`、`unsupportedFileSummary.byCategory[]`、`unsupportedFileSummary.categoryDetails[]`、`unsupportedFileSummary.handlingSummary`、`unsupportedFileSummary.examples[]` 和 `unsupportedFileSummary.examplesTruncated`。其中 `byCategory[]` 使用面向 agent 的粗分类：`archive`、`document`、`image`、`web`、`metadata`、`signature`、`unsupported-font`、`extensionless` 和 `other`。`categoryDetails[]` 会为本次扫描中出现的分类重复含义、代表扩展名和处理行为；`handlingSummary.archivesExtracted` 恒为 `false`。这不改变处理行为；不支持文件仍会被忽略。

## `split_font_batch`

扫描目录、去重等价字体、分组输出，并处理选中的字体。

如果源目录形态不确定，先调用 `get_agent_guidance` 并设置 `sections: ["examples"]`，查看 `source-layout-mismatch-comparison`；或先运行 `organize_font_directory` 的 `workflowPreset: "safe-preview"`。在决定真实批量写入或 copy-only 暂存前，优先使用 organizer 返回的 `recommendedBatchPreviewArgs` 对原目录做无写入预览。

| 字段 | 类型 / 可选值 | 默认值 | 说明 |
|------|---------------|--------|------|
| `inputDir` | string | `.` | `FONT_SPLIT_ROOT` 内要扫描的目录。 |
| `outputRoot` | string | `split-output` | 批量输出根目录。 |
| `limit` | 正整数，MCP 最大 `50000` | `20` | 去重后最多处理多少个字体。 |
| `maxFiles` | 正整数，MCP 最大 `50000` | `5000` | 扫描阶段最多读取多少个源文件。 |
| `includeResults` | boolean | `true` | 是否返回每个字体的 `results[]` 详情；全量跑建议设为 `false`。 |
| `dryRun` | boolean | `false` | 只预览扫描、去重、命名和 skip 决策，不写任何输出文件。 |
| `workflowPreset` | `safe-preview`, `reviewed-write`, `structure-first`, `source-layout`, `metadata-family`, `preserve-all` | 不设置 | 命名预设，会先展开为一组常用配置；省略时使用原始工具默认值，显式参数仍会覆盖预设值。 |
| `skipMode` | `manifest`, `force` | `manifest` | 已有输出的跳过策略。 |
| `batchGroupBy` | `auto`, `source-dir`, `font-family` | `auto` | 第一层 family 目录策略。 |
| `batchNamingMode` | `plain`, `numeric-suffix`, `source-suffix` | `numeric-suffix` | 每个字体输出目录的命名策略。 |
| `batchDedupeMode` | `none`, `same-path`, `font-identity` | `font-identity` | 处理前的去重策略；`same-path` 只做路径/stem 级去重，`font-identity` 做跨格式语义身份去重。 |
| `batchErrorMode` | `collect`, `fail-fast`, `fail-after` | `fail-after` | 单字体错误的处理策略。 |
| `debugBatchDecisions` | boolean | `false` | 输出结构化调试日志，覆盖 dedupe、naming、skip 和 error 决策。 |

`split_font_batch` 也接受 `split_font` 的处理参数，但不接受 `fontPath` 和 `outDir`。批量模式会把这些处理参数应用到每个选中的字体，并使用 `inputDir` / `outputRoot` 控制路径。

`workflowPreset` 是常见配置的简写；需要原始工具默认值时直接省略它：

- `safe-preview`：无写入安全预览。
- `reviewed-write`：审查预览后用于真实写入的配置。
- `structure-first`：无写入、紧凑、适合超大/嘈杂目录的第一遍结构扫描；批量侧使用 `same-path` 去重，目录整理侧跳过字体元数据解析。
- `source-layout`：优先按源目录分组。
- `metadata-family`：优先按字体内部 family metadata 分组。
- `preserve-all`：关闭去重，同时保留冲突安全命名。

预设会先展开；同一次调用里显式传入的参数会覆盖预设值。

批量响应会包含 `safetySummary`、`sourceDestructive`、`writesSourceTree`、`writesOutputTree`、`outputTreeInsideInputTree`、`mayOverwriteOutputTree`、`batchPolicySummary`、`scannedFileCount`、`maxFiles`、`maxFilesHit`、`unsupportedFileDecision`、`unsupportedFileSummary` 和 `batchDecision`。`sourceDestructive` 应始终为 `false`：批量处理不会移动、删除或重写源字体。`dryRun: false` 时 `writesOutputTree: true`，表示会在 `outputRoot` 下写生成文件、原字体副本和 manifest，并且可能替换已有输出文件。只有当真实输出树位于 `inputDir` 内时，`writesSourceTree` 才为 `true`；此时源字体文件仍会保留，但输入目录树会新增生成输出。`maxFilesHit: true` 表示源文件扫描被截断，调用方应该调高 `maxFiles` 后重跑，再把摘要视为完整结果。`unsupportedFileDecision` 给出忽略文件的压缩判断路线；`unsupportedFileSummary` 则提供精确证据。

批量格式代表优先级为：`.otf`、`.ttf`、`.woff2`、`.ttc`、`.otc`、`.woff`。

`font-identity` 会跨格式比较归一化后的字体身份。身份键优先使用 typographic family/subfamily，再回退到 legacy family/subfamily，再回退到 full name 或 PostScript name。`glyphCount` 只用于诊断，不参与等价判定，因此不会把等价的 OTF/TTF/WOFF 输入拆开。
如果某个文件的身份解析失败，批量去重会回退到该文件的路径 stem，保证扫描继续进行，并把真正的单字体错误留到处理阶段报告。

`batchErrorMode` 默认是 `fail-after`，会处理完选中的字体后，如果存在任何单字体错误就抛错。只有当调用方会主动检查 `errors[]` 和 `errorCount` 时才建议显式使用 `collect`；需要首个错误立刻失败时使用 `fail-fast`。
当 `fail-fast` 或 `fail-after` 通过 MCP Server 抛错时，错误响应文本是 JSON，包含 `ok: false`、`name`、`errorType`、`error` 和 `details`，因此 agent 可以先按 `errorType: "batch-split-error"` 路由，再读取 `details.errors[]` 与 `details.summary`。

全量字体库的简洁响应示例：

```json
{
  "inputDir": ".",
  "outputRoot": "split-output",
  "limit": 50000,
  "maxFiles": 50000,
  "includeResults": false,
  "batchNamingMode": "numeric-suffix",
  "batchDedupeMode": "font-identity",
  "skipMode": "manifest",
  "splitFailureAction": "single-woff2"
}
```

`dryRun: true` 且 `includeResults: true` 时，响应使用 `planned[]` 而不是 `results[]`。每个计划条目包含 `input`、`groupName`、`splitDir`、`copiedOriginalPath`、`wouldProcess` 和 `skipReason`。

批量响应包含 `batchWarningCount` 和 `batchWarnings[]`，用于提示 dry-run 未写文件、扫描被 `maxFiles` 截断、`limit` 截断、每字体详情被省略、已有输出被跳过、错误被收集等摘要级状态。每个 warning 都包含机器可读的 `code` 和人类可读的 `message`。

`batchDecision` 是批量响应的压缩主线路由。它可能建议 `review-dry-run-plan`、`rerun-batch-with-higher-maxFiles`、`inspect-batch-errors`、`audit-written-output`、`review-existing-output-skips`、`no-supported-fonts` 或 `no-selected-fonts`，并可能附带 `reviewedWriteArgs`、`rerunArgs` 或 `auditArgs`。它只是路由提示，不是成功证明；仍要检查 `batchWarnings[]`、`errors[]`、`recommendedNextActions[]` 和输出审计字段。

`batchPolicySummary` 会回显本次批量调用实际采用的分组、命名、去重和错误策略，并把它们关联回 `get_agent_guidance.batchPolicyGuide`。它包含 `values`、可选的 `effectiveValues`、`selectedPolicies[]`、当前响应可直接检查的 `inspectFields`、完整来源字段 `policyGuideInspectFields` 和 `policySuccessCriteria[]`。用它先解释本次调用的策略，再解释计数或计划路径。

## `organize_font_directory`

为源字体目录生成整理计划，或把字体复制整理到一个更规整的暂存目录。

当 agent 需要在“直接对原目录做批量预览”和“先复制到暂存目录再处理”之间选择时，使用这个工具。对于 flat/nested/mixed/output-inside-input 路由，`get_agent_guidance` 的 `sections: ["examples"]` 会返回 `source-layout-mismatch-comparison` 示例；但实际决策仍必须来自当前响应的 `sourceLayoutMismatchSummary`、`recommendedBatchPreviewArgs`、`organizationWarnings` 和安全字段。

### `two-call-layout-preview` 示例

当源目录结构不明确，且用户没有明确要求复制出暂存目录时，优先使用这条路线。

1. 先做无写入目录形态预览：

```json
{
  "inputDir": "fonts",
  "workflowPreset": "safe-preview"
}
```

检查 `safetySummary`、`layout.layoutKind`、`sourceLayoutMismatchSummary`、`recommendedBatchPreviewArgs`、`organizationWarnings` 和 `planActionSummary`。

2. 如果适合直接对原目录做预览，把返回的预览参数交给 `split_font_batch`：

```js
{
  ...organization.recommendedBatchPreviewArgs,
  outputRoot: "split-output"
}
```

不要把 `recommendedBatchOptions` 当作完整安全调用。只有在预览已被检查、且用户希望得到更干净的暂存源目录时，才使用 copy-only 整理（`workflowPreset: "reviewed-write"`）。

> [!WARNING]
> 这个工具对源目录是非破坏性的：它不会移动、删除或重写源字体文件。默认 `dryRun: true`，只返回计划；只有显式设置 `dryRun: false` 时才会在 `outputDir` 中创建目录并复制字体。如果设置 `overwriteExisting: true`，可能会替换 `outputDir` 中的目标文件，但源文件仍不会被修改。

| 字段 | 类型 / 可选值 | 默认值 | 说明 |
|------|---------------|--------|------|
| `inputDir` | string | `.` | `FONT_SPLIT_ROOT` 内要扫描的目录。 |
| `outputDir` | string | `organized-fonts` | 整理后副本的目标目录，必须与 `inputDir` 不同。 |
| `maxFiles` | 正整数，MCP 最大 `50000` | `50000` | 最多扫描多少个源文件。 |
| `workflowPreset` | `safe-preview`, `reviewed-write`, `structure-first`, `source-layout`, `metadata-family`, `preserve-all` | 不设置 | 命名预设，会先展开为一组整理配置；省略时使用原始目录整理默认值，显式参数仍会覆盖预设值。 |
| `dryRun` | boolean | `true` | 只生成计划，不写文件；只有检查过 `plan[]` 和 `organizationWarnings[]` 后才建议设为 `false`。 |
| `includePlan` | boolean | `true` | 是否返回逐字体 `plan[]`；大目录只看摘要时可设为 `false`。 |
| `parseFonts` | boolean | `true` | 是否读取字体元数据，用于 identity 去重、glyph count、坏字体检测和 font-family 分组。设为 `false` 时只做更快的结构优先计划。 |
| `batchGroupBy` | `auto`, `source-dir`, `font-family` | `auto` | 整理副本的目录分组策略，含义与 `split_font_batch` 相同。 |
| `batchNamingMode` | `plain`, `numeric-suffix`, `source-suffix` | `numeric-suffix` | 复制字体文件名的冲突处理策略。 |
| `batchDedupeMode` | `none`, `same-path`, `font-identity` | `font-identity` | 复制计划前的去重策略；`same-path` 只做路径/stem 级去重，`font-identity` 做跨格式语义身份去重。 |
| `copyInvalidFonts` | boolean | `false` | 即使字体元数据解析失败，也复制扩展名受支持的文件。除非明确要保留坏字体/伪字体文件，否则保持 `false`。 |
| `overwriteExisting` | boolean | `false` | 是否允许替换 `outputDir` 中的匹配文件；源文件仍不会被修改。 |

重要返回字段：

| 字段 | 含义 |
|------|------|
| `safetySummary` | 紧凑的源目录/输出目录安全摘要。它会重复 operation mode，确认源文件会被保留，声明写入范围，并把覆盖风险限定到输出目录。解释单个安全布尔字段前，优先看这个字段。 |
| `operationMode` | `dryRun` 为 true 时是 `plan-only`，否则是 `copy-only`。 |
| `sourceDestructive` | 恒为 `false`；源文件不会被移动、删除或重写。 |
| `writesSourceTree` | 只有 `dryRun: false` 且 `outputDir` 位于 `inputDir` 内时才为 `true`；源文件仍会保留。 |
| `writesOutputTree` | 只有 `dryRun: false` 时才为 `true`。 |
| `outputTreeInsideInputTree` | `outputDir` 是否位于或等于 `inputDir`；为 `true` 时，后续宽泛扫描可能再次处理整理副本。 |
| `mayOverwriteOutputTree` | 只有当前非 dry-run 调用可能替换 `outputDir` 中的文件时才为 `true`。 |
| `sourceFilesPreserved` | 恒为 `true`；给需要直接判断源文件是否保留的 agent 使用。 |
| `parsedFontMetadata` | `parseFonts: false` 时为 `false`；此时 `validFontCount` 和 `invalidFontCount` 是 `null`，不是 0。 |
| `unparsedFontCount` | 因 `parseFonts: false` 而被有意跳过元数据解析的受支持扩展名文件数。 |
| `effectiveBatchDedupeMode` | 实际使用的去重策略。当 `parseFonts: false` 且请求 `batchDedupeMode: "font-identity"` 时，会回退到 `same-path`。 |
| `dedupeLimitedByParsing` | 请求 identity 去重但因为跳过字体解析而无法执行时为 `true`。 |
| `batchPolicySummary` | 本次整理调用所采用的分组、命名和去重策略摘要，以及对应的 `batchPolicyGuide` 成功标准。若 `parseFonts: false` 导致 identity 去重降级，`effectiveValues.batchDedupeMode` 会显示真实回退值。 |
| `directoryWorkflowSummary` | 本次响应里的目录工作流导航摘要，用来串起源布局复核、安全批量预览、可选 copy-only 暂存、reviewed 批量写入和必须执行的输出审计。它包含 `planVisibility`、`workflowSteps[]`、路线、安全信号、成功标准和非直觉行为提示。 |
| `sourceLayoutMismatchSummary` | 源目录结构判断摘要：当前布局与推荐分组是否匹配、能否直接对原目录做安全预览、copy-only 暂存是不需要/可选/已经写出、暂存为什么不破坏源文件，以及内嵌的 `sourceLayoutMismatchSummary.decisionChecklist`。 |
| `sourceLayoutMismatchSummary.decisionChecklist` | 面向 agent 的紧凑决策清单：集中检查源安全、直接预览是否就绪、copy-only 暂存需求、plan 可见性、warning 复核和写入后的输出审计。 |

目录路由相关的 `inspectFields`、`mustInspectFields` 和 `responseFields` 只要列出 `sourceLayoutMismatchSummary`，也会同时列出 `sourceLayoutMismatchSummary.decisionChecklist`，因此 agent 不需要从父字段中猜测是否还要检查嵌套清单。
| `directoryWorkflowSummary.planVisibility` | 说明本次响应是否包含详细 `plan[]`。当 `includePlan: false` 时，`plan[]` 会被省略；可用 `availableSummaryFields` 做压缩 triage，但如果写入前需要确认逐文件目标路径，应按 `rerunWithPlanArgs` 重跑。 |
| `unsupportedFileDecision` | 从 `unsupportedFileSummary` 派生的快速机器可读判断：忽略文件状态、类别/扩展名数量、是否有压缩包、是否存在 `.zip` / `.txt` 之外的噪声，以及“不解压、不复制、不拆分”的处理标志。 |
| `unsupportedFileSummary` | 所有被忽略的非字体文件摘要，包含精确 `byExtension`、概览 `byCategory`、带处理语义的 `categoryDetails`、总体 `handlingSummary`、无扩展文件的 `<none>` 计数，以及少量示例路径。它用于解释为什么嘈杂源目录里有很多压缩包、文档、图片、生成产物或无扩展文件，但不会被复制或拆分。 |
| `layout.layoutKind` | `empty`、`flat`、`nested` 或 `mixed`。`mixed` 表示输入根目录和子目录里都发现了字体。 |
| `recommendedBatchOptions` | 根据目录形态建议的 `split_font_batch` 策略片段；嵌套或混合目录通常建议 `batchGroupBy: "source-dir"`，扁平目录通常建议 `font-family`。它本身不是完整安全调用。 |
| `recommendedBatchPreviewArgs` | 可直接复制的 `split_font_batch` 无写入预览参数，包含 `inputDir`、`workflowPreset: "safe-preview"` 和 `batchGroupBy` 等目录形态覆盖项。真实批量写入前优先使用它。 |
| `recommendedNextActionCount` / `recommendedNextActions[]` | 面向 agent 的机器可读后续动作。批量 dry-run 可能建议 `run-reviewed-batch-write`；真实批量写入可能建议 `audit-split-output`，并附带 `inspect_split_output` 参数。每项包含 `id`、`priority`、`tool`、`reason`、可选 `suggestedArgs`、`inspectFields` 和 `successCriteria`。`suggestedArgs` 会优先使用 `workflowPreset`，只保留相对该 preset 的差异覆盖。 |
| `organizationDecision` | 整理响应的紧凑主线路由建议。它会给出 `rerun-with-font-parsing`、`decide-on-invalid-fonts`、`preview-original-layout`、`review-mixed-layout` 或 `preview-organized-output` 等分支，并在可用时指向首选后续动作。 |
| `organizationWarningCount` / `organizationWarnings[]` | 摘要级提示，例如 `organization-dry-run`、`organization-writes-output`、`output-overwrite-enabled`、`mixed-layout-detected`、`invalid-fonts-skipped`、`output-inside-input`。 |
| `planActionSummary` | 始终返回。按 `action` 统计计划动作数量，包括 `would-copy`、`copied`、`skipped-duplicate`、`skipped-invalid`、`skipped-target-exists`、`would-skip-target-exists` 和 `error`。当 `includePlan: false` 省略明细时，用它快速判断计划形态。 |
| `plan[]` | 可选的逐字体复制/跳过计划。复制条目包含 `source`、`target`、`targetPath`、`groupName`、`action`、`identityKey` 和 `glyphCount`。 |
| `organizationManifestPath` | 仅在 `dryRun: false` 时写入，指向 `outputDir` 中的 `font-organization-manifest.json`。 |

`unsupportedFileDecision` 是快速路线，`unsupportedFileSummary` 是证据路线。`unsupportedFileSummary` 使用与 `inspect_font_inputs` 相同的子字段：`unsupportedFileSummary.total`、`unsupportedFileSummary.byExtension[]`、`unsupportedFileSummary.byCategory[]`、`unsupportedFileSummary.categoryDetails[]`、`unsupportedFileSummary.handlingSummary`、`unsupportedFileSummary.examples[]` 和 `unsupportedFileSummary.examplesTruncated`；`.zip` 等 `archive` 文件只会被报告，不会被解压、复制或拆分，这一点也会体现为 `unsupportedFileDecision.handlingSummary.archivesExtracted: false` 和 `unsupportedFileSummary.handlingSummary.archivesExtracted: false`。

需要特别注意的非直觉行为：

- `dryRun` 默认是 `true`，这与 `split_font_batch` 的默认 `dryRun: false` 不同。
- 该工具只整理/复制字体，不会拆分字体，也不会生成 CSS。
- `parseFonts: false` 是结构优先模式：它会跳过字体元数据解析，因此不能检测坏字体、不能提供 glyph count，也不能做真正的 identity 去重或完全基于 metadata 的 family 分组。
- 非字体文件会被忽略；当源目录混有压缩包、文档、截图或生成产物时，先看 `unsupportedFileSummary`。扩展名像字体但解析失败的文件默认跳过，除非 `copyInvalidFonts: true`。
- 如果 `outputDir` 位于 `inputDir` 内，响应会包含 `output-inside-input` 和 `outputTreeInsideInputTree: true`；后续扫描应排除该输出目录，避免把整理后的副本再次当作源字体处理。

当你需要可信的坏字体数量、glyph count、内部 family 名或跨格式 identity 去重时，使用 `parseFonts: true`。只有在超大或嘈杂目录上先快速了解结构时，才使用 `parseFonts: false`。此时 `font-parsing-skipped` 应被视为警告：这个计划不适合直接支撑依赖字体元数据的判断。

常见 `recommendedNextActions[].id` 包括批量动作 `run-reviewed-batch-write`、`audit-split-output`、`rerun-batch-with-higher-maxFiles`、`inspect-batch-errors`，以及整理动作 `review-plan-before-writing`、`preview-batch-split-original-layout`、`copy-organized-staging-directory`、`inspect-organized-output`、`preview-batch-split-organized-output`、`rerun-with-font-parsing`、`rerun-with-higher-maxFiles`、`decide-on-invalid-fonts`、`review-mixed-layout-grouping` 和 `avoid-reprocessing-organized-copies`。这些是后续行动建议，不是成功证明；agent 仍必须检查每项列出的 `inspectFields`，并满足 `successCriteria`。

`organizationDecision`、`directoryWorkflowSummary`、`sourceLayoutMismatchSummary` 和 `sourceLayoutMismatchSummary.decisionChecklist` 是压缩路线提示，不是路线已经完成的证明。用它们选择下一步分支后，仍要检查 `recommendedNextActions[]`、`organizationWarnings[]`、`planActionSummary`、`directoryWorkflowSummary.planVisibility`，以及可用时的 `plan[]`。

`planActionSummary` 是压缩概览，不替代写文件前审查详细 `plan[]`。它主要服务自动化和大响应场景，尤其是使用 `includePlan: false` 时。当后续动作依赖理解复制/跳过计划形态时，organizer 的 `recommendedNextActions[].inspectFields` 会包含 `planActionSummary`。

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
| `outputStructureDecision` | 从 `auditStatus`、`auditBlockingReasons`、`maxFilesHit` 和 `structureSummary` 派生的快速机器可读判断。先看 `status`、`recommendedAction`、`blockingReasonCodes` 和 `issueCodes`；精确证据再看 `structureSummary`。 |
| `auditStatus` | 紧凑审计门禁：`pass`、`action-required` 或 `incomplete`。真实输出审计只有在它为 `pass` 时才应视为完成。 |
| `auditPassed` | `auditStatus === "pass"` 的布尔快捷字段。 |
| `auditBlockingReasons[]` | 阻止审计通过的机器可读原因，例如 `output-scan-truncated` 或 `output-structure-issues`；结构问题会带上来自 `structureSummary.issues[]` 的 `issueCodes`。 |
| `filesIncluded` / `familiesIncluded` | 响应中是否包含 `files[]` 和 `families[]`。 |
| `inspectionWarningCount` / `inspectionWarnings[]` | 摘要级审计提示，用于标记截断、详情数组省略、legacy 输出推断和输出结构问题等状态。 |
| `structureSummary` | 机器可读输出结构审计。真实批量写入后，只有 `outputStructureDecision.status: "pass"`、`auditStatus: "pass"`、`auditPassed: true`、`structureSummary.conforms: true` 且 `maxFilesHit: false` 时，才应把输出目录视为审计完成。`conforms: true` 表示已扫描文件符合文档化的 single-family 或 family-tree 结构，每个检测到的字体条目都有 manifest，并且 manifest 声明的输出模式具备所需文件。为 false 时检查 `issues[]`、`unexpectedFileExamples[]` 和 `entryIssueExamples[]`。 |
| `fontEntryCount` | 检测到的字体输出条目数量。 |
| `manifestCount` | 带 `split-meta.json` 的条目数量。 |
| `legacyOutputCount` | 没有 manifest、只能保守推断的旧输出数量。 |
| `families[]` | 结构化 family / font entry 清单。 |
