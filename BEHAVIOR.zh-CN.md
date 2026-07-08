# 工具完整行为说明（含高风险 / 非直觉行为）

> [!WARNING]
> **本文件描述的是 `mcp-font-split` 当前代码的实际行为。**
>
> 这里写的是工具现在会怎么做，不是理想行为，也不是字体分割的一般原则。它包含正常功能、默认策略、可选 fallback、manifest 语义、批量跳过策略，以及可能违反用户直觉的地方。

## 阅读导航

| 你要判断的行为 | 建议先看 |
|----------------|----------|
| 工具能做什么、路径为什么会被拒绝 | 1-3 节 |
| 参数默认值、无效配置、`workflowPreset` 和批量策略 | 4 节；显式传入的无效配置会被拒绝，MCP schema 错误会返回 `mcp-schema-validation-error` JSON 工具错误，绕过 MCP schema 时会抛出 `FontSplitConfigurationError`，并带有 `details.summaryType: "configuration-error"` |
| 单文件、批量、目录整理和输出审计流程 | 5-9 节 |
| 最容易误解或需要人工复核的行为 | 10-11 节 |
| 推荐批量参数组合 | 12 节 |

字段级 API 说明请看 [API 参考](./API.zh-CN.md)；README 只保留入口、常见工作流和关键风险索引。

---

## 1. 工具能力总览

当前 MCP 服务暴露 7 个工具、6 个文档 resources 和 1 个工作流 prompt。

| 工具 | 作用 |
|------|------|
| `get_agent_guidance` | 返回面向 AI 编程助理的机器可读工作流指南 |
| `get_runtime_status` | 返回工作区、Node engine 兼容性、包版本、平台和 WASM 可用性的只读诊断信息 |
| `split_font` | 处理单个字体文件 |
| `inspect_font_inputs` | 不写输出地扫描输入字体，报告解析状态、identity key、glyph count、坏字体清单、目录布局和第一步路线建议 |
| `split_font_batch` | 批量扫描目录、去重、分组并处理字体文件 |
| `organize_font_directory` | 当源目录结构不适合直接批量处理时，生成整理计划，或把字体非破坏性复制到暂存目录 |
| `inspect_split_output` | 汇总和结构化检查输出目录 |

文档 resources 包括 `font-split://docs/readme.zh-CN`、`font-split://docs/readme.en`、`font-split://docs/api.en`、`font-split://docs/api.zh-CN`、`font-split://docs/behavior.zh-CN` 和 `font-split://docs/behavior.en`。`safe-batch-workflow` prompt 用于生成“预检 → safe-preview → reviewed-write → 输出审计”的安全批量流程提示。

所有工具响应都会保留兼容旧客户端的 JSON 文本 `content[0].text`，同时提供 `structuredContent` 作为字段级消费入口。工具错误也会带 `isError: true` 和结构化错误载荷，调用方应优先按 `structuredContent.errorType` 判断错误类型。

`get_agent_guidance.interfaceContract` 是当前响应稳定性的机器可读索引。`stable` 字段是面向正式 1.0 版本的核心机器契约，并会出现在工具 `outputSchema` 中；`diagnostic` 字段用于排障和审计，可能继续增加或变得更精确；`experimental` 字段是不属于稳定契约的不稳定辅助细节。

`split_font` 的结果不一定是多分片 web-font。根据参数和字体状态，它可能产生：

- 正常多子集分片：`outputMode = subset`
- 单 WOFF2 fallback：`outputMode = single-woff2`
- 只复制原字体并写 manifest：`outputMode = copy-original`

---

## 2. 路径与访问范围限制

### 2.1 只允许访问工作区内的路径

工具只允许访问 `FONT_SPLIT_ROOT` 指定的目录。

如果没有设置 `FONT_SPLIT_ROOT`，默认值为 MCP Server 进程启动时的当前工作目录。

当工具响应需要表示工作区根目录时，会返回 `.`，包括 `inputDir`、`outputDir` 以及 `recommendedNextActions[].suggestedArgs` 中的后续调用参数。它不会用空字符串表示根目录，避免 AI agent 复制参数时产生歧义。

建议使用者根据自己的字体存放位置显式设置：

```text
FONT_SPLIT_ROOT=/path/to/your/font-workspace
```

如果使用者是 AI agent，不应猜测或硬编码用户的本机路径；在处理用户私有/本地字体前，应该先询问用户希望把 `FONT_SPLIT_ROOT` 设置到哪个目录。

### 2.1.1 AI agent 专用适配

本项目是给 AI 编程助理调用的 MCP Server，因此除了普通参数 schema，还提供了 `get_agent_guidance` 和 `get_runtime_status`。

`get_agent_guidance` 不读写字体文件。默认 `detailLevel: "compact"`，只返回工作流决策所需的核心 section：

- 当前 `FONT_SPLIT_ROOT` 解析结果
- 路径使用规则
- 支持扩展名
- 默认批量策略
- `projectStatusNotice`：说明项目已正式发布、当前代码/schema/文档/release notes 是权威来源、稳定契约需要兼容性维护
- 推荐批量参数
- 完成验证清单
- 推荐工具调用顺序
- 调用方应该检查的关键响应字段
- `configurationRecipes[]`：把常见用户意图映射到 preset-first 参数和取舍说明
- `batchCustomizationQuickReference[]`：用更短的速查入口解释常见批量自定义该加哪些最小覆盖参数
- `directoryOrganizationQuickAnswer`：直接回答是否有目录整理工具、它是否会破坏源目录、第一步和审查后写入该用什么参数
- `toolSafetyQuickReference`：用紧凑表汇总每个公开工具默认是否写文件、是否会移动/删除/重写源字体、写入范围和必须检查的安全字段
- `batchPolicyGuide`：解释批量策略自定义项该如何选择
- `fontIdentityBasisCatalog`：解释 `identityBasis` 与 `dedupeDecisionSummary.identityEvidenceSummary.identityBasisCounts` 的取值、OpenType name ID 来源、置信度和语义 identity 证据强度
- `unsupportedFileCategoryCatalog`：解释 `unsupportedFileSummary.byCategory[]` 中各分类的代表扩展名、含义和处理行为
- `unsupportedFileDecision`：每次输入扫描响应里的快速判断，说明是否存在被忽略文件、是否包含压缩包、是否存在 `.zip` / `.txt` 之外的噪声，以及这些文件是否会被解压、复制或拆分
- `inputCountGuide`：每次输入扫描类响应里的计数解释，说明扫描了多少文件、支持和忽略数量、计数是否被 `maxFiles` 截断、明细是否被故意省略，以及非字体文件的处理方式
- `inputDirectoryDecision`：`inspect_font_inputs` 返回的第一步目录路线提示，说明应重扫、复核坏字体、直接做 `split_font_batch` safe-preview，还是先做非破坏性的 `organize_font_directory` safe-preview
- `inputDirectoryDecision.directoryOrganizationSafety`：当前输入目录检查响应里的目录整理安全短答案，说明整理工具是 `organize_font_directory`、默认无写入、reviewed-write 也只是 copy-only 写入 `outputDir`、不会移动/删除/重写源字体，并提醒整理输出不是最终 split 输出
- `safeInvocationTemplates[]`：常见工作流的安全起步调用模板
- `nextToolDecisionSummary`：更短的“下一步该调用哪个工具”路由索引
- `recommendedWorkflowPlan`：把安全模板编排成有序阶段的推荐路线图
- `toolOptionCatalog`：高影响工具输入参数的机器可读选项目录
- `errorResponseCatalog`：解释结构化 MCP 错误和普通错误的响应形态
- `guidanceView`：说明本次返回了哪些 section、省略了哪些 section，以及可请求的 section 名称
- `outputStructureCatalog`：解释 `inspect_split_output` 的 `outputRoleDecision`、审计状态、`structureSummary.layoutKind`、`structureSummary.issues[].code`、输出模式和结构通过条件
- `outputResultShapeQuickReference`：解释 `split_font` / `split_font_batch` 的结果形态，避免把 `ok:true`、fallback、copy-original、单字体绕过处理、批量已有输出跳过或收集错误误报成正常多子集输出

当 agent 需要完整错误响应目录、warning code 目录、响应字段目录、工具选项目录、identity basis 目录、输出结构目录或示例时，应设置 `detailLevel: "full"`，或用 `sections` 精确请求，例如 `["error-catalog", "warning-catalog", "field-catalog", "option-catalog", "identity-catalog", "output-catalog"]`。

当 AI agent 不确定应使用单文件、批量、输入预检还是输出审计流程时，应先调用 `get_agent_guidance`，再选择后续工具。响应里的 `verificationChecklist[]` 是给 agent 用的防误判清单；在向用户宣称完成前，应检查其中适用于当前工作流的项目。

`projectStatusNotice` 是给 agent 用的正式发布状态说明：

- `formalRelease: true`
- 稳定工具、默认值、文档化错误类型和稳定响应字段是兼容性承诺
- 当前仓库代码、实时 MCP schema、`get_agent_guidance`、`get_agent_guidance.interfaceContract`、API 文档和本行为文档是权威来源
- 诊断字段可以增加或变得更精确；实验字段不属于稳定契约，不应被客户端作为必需字段
- 改动后重新运行 `get_agent_guidance` 和本地门禁

本地门禁分两类：

| 门禁 | 何时使用 | 命令 / 字段 | 边界 |
|------|----------|-------------|------|
| `local-compact-check-passed` | 面向本包维护者的普通本地门禁 | `npm run check:compact`；纯 JSON 用 `npm run --silent check:compact -- --json`；结果是 `compact-check-result` | 低噪声执行标准 syntax/smoke 检查 |
| `local-real-corpus-suite-passed` | 功能行为改动后的代表性真实语料门禁 | `smoke:real-corpus-suite`，即 `npm run smoke:real-corpus-suite -- <font-corpus-dir>` | 不是逐个字体目录人工验收，也不是运行时 MCP 工具调用 |

`localVerificationOutputGuide` 是 `get_agent_guidance` 返回的本地验证输出解读指南。它用于维护本包时解释 `check:compact` 和 `smoke:real-corpus-suite` 的最终 JSON，给出 `standardCommand` / `standardJsonCommand`，并把真实语料 suite 的 `reliabilityGateDecision` 作为主判断字段。

真实语料 suite 的输出按下面几层看：

- `real-corpus suite summary`
- `reliabilityGateDecision`
- `corpusCountGuide`
- `humanSummary`
- `testScope`
- `coverageSummary.functionalCoverage[]`
- `coverageSummary.toolCoverageSummary`
- `runSummaries` / `runSummaries[]`
- `omittedDetailFields`

先看这些判断字段：

- `status`
- `reliabilityGatePassed`
- `blockingReasonCodes`
- `fullCorpusFontCountField`
- `targetCountsAreFullCorpusCounts`

`status: "pass"` 表示代表性功能链通过，不表示每个字体目录都已人工验收。
`corpusCountGuide.fullCorpus` 指向全库根扫描数量。
`corpusCountGuide.representativeTargets` 指向固定回归点和代表性抽样目标数量，后者不是全库字体数量。
`humanSummary` 用自然语言说明全库字体数量、固定/抽样目标数量和代表性写入审计状态，避免把 `4` 或 `10` 之类的小数字误读成全库字体数量。

`testScope` 用来说明真实语料 suite 到底测了什么：

- `testScope.corpusScan` 表示全库有界根扫描。
- `testScope.targetSampling` 表示固定回归点加自适应代表性抽样。
- `testScope.representativeWriteAudit` 表示一个真实写入和输出审计样本。
- `functionalCoverage[]` 用于说明真实语料运行实际覆盖了哪些功能路径。
- 代表性功能路径包括全根输入扫描、`input-count-guide` / `input-directory-decision`（对应响应字段 `inputCountGuide` / `inputDirectoryDecision`）、非字体噪声分类、目录整理预览、`sourceSafetyDecision` 源安全结论、`sourceLayoutMismatchSummary` 布局判断摘要、copy-only 写入、单字体拆分、批量写入和输出结构审计。
- `coverageSummary.toolCoverageSummary` 则把这些功能路径汇总成公开 MCP 工具覆盖。
- `allRequiredToolsCovered: true` 表示 `get_agent_guidance`、`get_runtime_status`、`inspect_font_inputs`、`organize_font_directory`、`split_font`、`split_font_batch` 和 `inspect_split_output` 都在真实语料代表性路径中被实际覆盖，但仍不代表逐字体或逐目录验收。

真实语料覆盖摘要里有三个容易误读的字段：

- `coverageSummary.unsupportedFileCategoryCoverage` 单独列出忽略文件类别数、扩展名数，以及 `.zip` / `.txt` 之外的扩展名类型数。
- `coverageSummary.archiveHandlingScope` 单独说明压缩包只会作为忽略文件计数，不会被解压，压缩包内部字体也不会计入已覆盖字体。
- `coverageSummary.outputStructureAuditSummary` 单独列出代表性单字体写入和批量写入的 `outputRoleDecision`、`outputStructureDecision`、`auditStatus`、`auditPassed` 与 `structureSummary.conforms`。

这些字段用于避免三类误读：把忽略统计误读成只支持压缩包/文本文件，把压缩包内部字体夸大为已测试，或只看写入成功而漏掉输出目录结构审计。

真实语料 suite 的 `coverageSummary.functionalCoverage[]` 包含 `staging-directory-decision` 时，表示代表性路径已经实际检查 `stagingDirectoryDecision`。
整理工具的 `outputDir` 是源目录式暂存，不是已经生成的拆分输出。
这个结论只能证明代表性链路覆盖了该行为，不能扩展成每个目录都已人工验收。

`localVerificationOutputGuide.completionReportGuide` 是本地门禁通过后的汇报指南。
其中 `completionReportGuide` 会给出 `requiredClaims[]`、`forbiddenClaims[]` 和 `conciseReportTemplate[]`。
agent 应报告 compact 检查、代表性真实语料门禁、全库根扫描计数、忽略文件覆盖、压缩包处理范围、功能覆盖和代表性输出审计。
agent 不得把代表性测试夸大成每个字体或每个目录都已人工验收，也不得暗示压缩包已经被解压验证或包内字体已经被覆盖。

Agent guidance 里的常用辅助对象可以按用途阅读。

配置和策略：

- `configurationRecipes[]` 把“保留每个源字体”“按源目录分组”“按字体 metadata 分组”“快速结构优先扫描”“copy-only 暂存整理”“大库审查后写入”等意图映射到最小 preset-first 参数。
  它会列出写入行为、源目录安全性、取舍、`inspectFields` 和 `successCriteria`，但不是成功证明。
- `batchCustomizationQuickReference[]` 是比 `batchPolicyGuide` 更短的批量自定义速查表。它给出最小 `overrideArgs`、带 `workflowPreset: "safe-preview"` 的 `previewArgs`、带 `workflowPreset: "reviewed-write"` 的 `writeArgsAfterReview`、`inspectFields`、`successCriteria` 和非直觉行为。
- `batchPolicyGuide` 覆盖 `batchGroupBy`、`batchNamingMode`、`batchDedupeMode` 和 `batchErrorMode`。当用户想偏离默认 preset 行为时，应优先参考它选择最小显式覆盖，并先运行 safe-preview。
- `toolOptionCatalog` 是输入侧目录，默认 compact 指南会返回，也可用 `sections: ["option-catalog"]` 单独请求。它覆盖 `split_font_batch`、`organize_font_directory`、`split_font`、`inspect_font_inputs` 和 `inspect_split_output` 的高影响参数。
  它尤其用于避免误读 `split_font_batch.dryRun` 和 `organize_font_directory.dryRun` 的默认预览语义、`workflowPreset: "reviewed-write"` / 显式 `dryRun: false` 才会写输出、`parseFonts: false` 会限制 identity 去重，以及 `includeResults: false` / `includeFiles: false` 会省略大块明细。

安全和输出解释：

- `toolSafetyQuickReference` 覆盖 7 个公开工具，逐项列出 `defaultWritesFiles`、`sourceDestructive`、`sourceFilesMovedDeletedOrRewritten`、写入范围、备份预期、safe-preview 参数和 `mustInspectFields`。
  真实写入完成后，仍要以工具响应里的 `sourceSafetyDecision`、`safetySummary`、`outputStructureDecision` 和审计字段为准。
- `fontIdentityBasisCatalog` 是字体 identity basis 目录，可用 section `identity-catalog`（例如 `sections: ["identity-catalog"]`）单独请求。
  它解释 `typographic-family-subfamily`、`opentype-family-subfamily`、`full-name`、`postscript-name`、family-only、`path-stem`、`path-fallback`、`missing` 等 basis 的 OpenType name ID 来源、置信度和语义 identity 证据强度。
- `outputStructureCatalog` 是输出结构审计目录，可用 section `output-catalog`（例如 `sections: ["output-catalog"]`）单独请求。它解释 `outputRoleDecision`、`outputStructureDecision.status`、`auditStatus`、`structureSummary.layoutKind`、`structureSummary.issues[].code`、`subset` / `single-woff2` / `copy-original` 输出模式和通过条件。
- `outputResultShapeQuickReference` 是输出结果形态速查目录，可用 section `output-catalog` 单独请求。它的 `summaryType: "output-result-shape-quick-reference"`，覆盖正常 `subset` 输出、单 WOFF2 fallback、`copy-original` 记录、单字体 `skipped`、批量 `skippedExisting` / `skippedByManifest`、dry-run 计划跳过，以及 `batchErrorMode: "collect"` 下 `ok:true` 但 `errorCount > 0` 的批量响应。
- `ok:true` 只表示 `inspect_split_output` 调用完成，不代表输出结构通过。
- 包含 `font-organization-manifest.json` 的目录是整理暂存，而不是生成后的拆分输出。
- `includeFiles:false` 和 `includeFamilies:false` 只省略大数组，不会跳过结构审计。
- `copy-original` 本来就不会生成 CSS 或 WOFF2。
- `unsupportedFileCategoryCatalog` 解释 `archive`、`document`、`image`、`web`、`metadata`、`signature`、`unsupported-font`、`extensionless` 和 `other` 的代表扩展名与处理行为。
  每次工具响应中的 `unsupportedFileDecision` 给出快速判断，`unsupportedFileSummary.categoryDetails[]` 和 `unsupportedFileSummary.handlingSummary` 重复当前扫描实际出现分类的处理语义；`archive` 不会触发解压、复制或拆分。

目录路线：

- `directoryOrganizationQuickAnswer` 是目录整理短答案。它说明 `organize_font_directory` 可用、默认 `workflowPreset: "safe-preview"`、审查后 `workflowPreset: "reviewed-write"` 也只是 copy-only 写入 `outputDir`，不会移动、删除或重写源字体。
- `directoryOrganizationQuickAnswer` 还会标出 `outputDir` 是源目录式暂存，并列出必须检查的 `sourceSafetyDecision`、`layoutDecision`、`stagingDirectoryDecision`、`sourceLayoutMismatchSummary`、`organizationWarnings` 和 `planActionSummary`。
- `directoryOrganizationQuickAnswer.directoryOrganizationSafety` 与 `inputDirectoryDecision.directoryOrganizationSafety` 使用同一安全契约；前者适合还没跑输入预检时快速回答，后者适合在 `inspect_font_inputs` 当前响应中结合真实目录证据继续决策。
- `toolResponseFieldCatalog` 会分别列出这两个嵌套安全字段，避免 agent 把指南级占位参数和当前输入目录的真实 `safePreviewArgs` 混为一谈。
- `directoryHandlingModeCatalog` 解释 `layoutDecision.directoryHandling.recommendedMode` 的 mode 含义、下一步建议、写入安全性、必查字段和非直觉行为。
- `directoryWorkflowDecisionMatrix[]` 把常见目录场景映射到首选工具、推荐参数、后续工具、写入安全、源目录安全、`successCriteria` 和非直觉行为。
  它不能替代工具实际响应检查，尤其不能跳过 `organizationWarnings[]`、`batchWarnings[]`、`maxFilesHit`、`errorCount` 等字段。
- `directoryWorkflowExamples[]` 在 `detailLevel: "full"` 或 `sections: ["examples"]` 时返回，覆盖扁平 vendor dump、每个压缩包/家族一个目录、根目录和子目录混合、超大/嘈杂扫描、`sourceLayoutMismatchSummary` 对照示例和 `copy-only-staging-to-audited-split`。
- `copy-only-staging-to-audited-split` 的顺序是：`organize_font_directory` safe-preview，复核计划，reviewed-write 做 copy-only 暂存，用 `sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs` 对暂存目录做 `split_font_batch` safe-preview，最后 reviewed-write 并通过 `inspect_split_output` 审计。

起步模板和路由：

- `safeInvocationTemplates[]` 是可复制的安全起步调用模板，包括运行时诊断、单字体处理、输入预检、目录整理计划、结构优先扫描、copy-only 暂存、批量 dry-run 预览、审查后真实批量处理和输出审计。
  模板声明 `writesFiles`、`sourceDestructive`、可自定义参数、必须检查的响应字段和继续前的 `successCriteria`；`workflowPreset` 已提供的默认项不会重复写入模板。
- `nextToolDecisionSummary` 是更短的路由索引，用于回答“下一步该调用哪个工具？”。它会引用 `safeInvocationTemplates[]` 的模板 ID，并通过 `workflowQuickStart` 和 `quickStartCallExamples[]` 给出常见路线的最小起步参数。
- 如果只需要判断目录整理工作流下一步，可以请求 `workflow: "organize"` 和 `sections: ["workflow"]`，然后读取 `nextToolDecisionSummary.workflowQuickStart.recommendedCallExample`。
  其中 `workflowQuickStart.recommendedCallExample` 是可复制的第一步调用对象；结构不确定时应保持 `workflowPreset: "safe-preview"`、`writesFiles: false`、`sourceDestructive: false`。
- `recommendedWorkflowPlan` 是当前 `workflow` 的有序路线图。它用 `templateId` 引用 `safeInvocationTemplates[]`，把输入预检、目录形态决策、批量预览、审查后写入和输出审计串成阶段；每个 `orderedSteps[]` 和 `decisionPoints[]` 都包含 `inspectFields` 与 `successCriteria`。

错误和字段目录：

- `errorResponseCatalog` 解释 MCP 错误响应载荷。工具错误会在 `structuredContent` 和 JSON 文本里提供同一份信息，都会包含 `ok: false` 和 `error`；结构化错误还会包含 `name`、`errorType` 和 `details`。
- `errorType` 是 agent 最短路由字段；如果存在 `details.summaryType`，会优先使用它作为 `errorType`。
  MCP schema 校验错误的 `errorType` 是 `mcp-schema-validation-error`，应检查 `details.validationIssues[]`；`FontSplitConfigurationError` 的 `errorType` 是 `configuration-error`；`BatchSplitError` 的 `errorType` 是 `batch-split-error`，继续前应检查 `details.errors[]` 和 `details.summary`。
- `toolResponseFieldCatalog` 在 `detailLevel: "full"` 或 `sections: ["field-catalog"]` 时返回。它解释 `ok`、`performedSplit`、`usedFallback`、`skipped`、`skipReason`、`skippedExisting`、`skippedByManifest`、`sourceDestructive`、`writesSourceTree`、`outputTreeInsideInputTree`、`writesOutputTree`、`maxFilesHit`、`stagingDirectoryDecision`、`outputStructureDecision`、`auditStatus`、`recommendedNextActions` 等关键字段。
  它用于降低 agent 误把“工具调用成功”理解成“字体已按用户想象完成处理”的风险，也用于避免把 `organize_font_directory.outputDir` 误当作已经生成的拆分输出。

`get_runtime_status` 也是只读工具。它会检查：

- 当前解析到的工作区是否存在且是目录
- cn-font-split WASM 文件是否存在且是文件
- 是否通过 `FONT_SPLIT_WASM_PATH` 使用了自定义 WASM 文件
- mcp-font-split 包名和版本
- cn-font-split 包版本和已记录的 WASM runtime 版本
- Node 版本、是否满足 `package.json` engines 要求、平台和 CPU 架构
- 支持的字体扩展名

当 agent 遇到安装、路径或 WASM 相关问题时，应先调用 `get_runtime_status`，再决定是否提示用户修正环境。
如果响应里的 `recommendedActions[]` 非空，agent 应优先根据其中的 `code`、`severity`、`message` 和可选 `command` 处理环境问题。

所有相对路径都相对于 `FONT_SPLIT_ROOT` 解释。

如果 `FONT_SPLIT_ROOT` 变化，相同的：

- `fontPath`
- `outDir`
- `inputDir`
- `outputRoot`
- `outputDir`

都会指向不同位置。

### 2.2 批量扫描会主动忽略这些目录

`inspect_font_inputs` 和 `split_font_batch` 递归扫描时会跳过：

- `node_modules`
- `.git`
- `font-split-mcp`
- `__MACOSX`
- 所有以 `._` 开头的 AppleDouble 资源叉文件
- `split-output`
- 所有 `split-output-*` 目录

作用：

- 避免扫描工具自身源码和依赖
- 避免把已生成的输出再次当作输入
- 避免把 macOS 压缩包里的资源叉伪文件误当成字体

未被这些规则跳过、但扩展名不是受支持字体格式的文件，会计入 `inputCountGuide`、`unsupportedFileDecision` 和 `unsupportedFileSummary`。

- `inputCountGuide` 是计数解释入口，包含 `scannedFileCount`、`supportedFontCount`、`unsupportedFileCount`、`countCompleteness`、`fileDetailsVisibility` 和 `unsupportedFilesHandling`。当 `maxFilesHit: true` 时，不能把本次计数当作完整语料库数量。
- `unsupportedFileDecision` 是快速判断，包含 `status`、`totalUnsupportedFileCount`、`hasArchives`、`extensionsBeyondZipTxtCount`、`recommendedAction` 和处理标志。
- `unsupportedFileSummary` 是详细证据，包含 `unsupportedFileSummary.byExtension[]` 精确扩展名统计、`unsupportedFileSummary.byCategory[]` 概览分类、带处理语义的 `unsupportedFileSummary.categoryDetails[]`、总体 `unsupportedFileSummary.handlingSummary`、`unsupportedFileSummary.examples[]` 少量示例路径、无扩展文件的 `<none>` 计数，以及 `unsupportedFileSummary.examplesTruncated` 示例截断标记。
- 忽略文件统计不是只统计 `.zip` 或 `.txt`。
- 压缩包会归入 `archive` 分类，但仍然只是被忽略，不会被解压、复制或拆分，且 `unsupportedFileDecision.handlingSummary.archivesExtracted` 与 `unsupportedFileSummary.handlingSummary.archivesExtracted` 恒为 `false`。

---

## 3. 支持识别的输入扩展名

当前识别这些字体扩展名：

- `.ttf`
- `.otf`
- `.ttc`
- `.otc`
- `.woff`
- `.woff2`

> [!NOTE]
> “支持识别”不等于“原样传给 cn-font-split”。`.woff` / `.woff2` 会先被解压成 sfnt-like 数据。

### 3.1 输入预检

`inspect_font_inputs` 只扫描输入目录并尝试读取基础字体元数据，不会创建输出目录，也不会调用 cn-font-split 分割器。

它用于在大批量处理前发现：

- 扩展名像字体但无法解析的文件
- 可解析但缺少批量去重 identity key 的字体
- 每个字体的容器类型、identity key 和 `glyphCount`
- 源目录是 `empty`、`flat`、`nested` 还是 `mixed`
- 本目录应先直接批量 safe-preview，还是先用非破坏性整理工具做 safe-preview

限制：

- `inputDirectoryDecision` 只是第一步 triage，不是整理计划，也不是分割成功证明；继续前仍要检查它列出的 `mustInspectFields`、`inputDirectoryDecision.directoryOrganizationSafety` 和后续 safe-preview 响应
- 预检通过不保证后续分割一定成功，因为 cn-font-split 仍可能在真正分片阶段失败
- 预检失败的字体会进入 `invalidFonts[]`，不会让整个检查工具直接中断

---

## 4. 关键参数

### 4.1 `oversizedKernAction`

可选值：

- `preserve`（默认）
- `strip`

行为：

- `preserve`：检测超大 `kern` 表，但不删除
- `strip`：当 `kern` 表异常大时，删除该表后再继续处理

触发检测条件：

- 仅对 sfnt/TTF/OTF 类数据生效
- `kern` 表长度 ≥ 字体数据长度的 80%

风险：

- `preserve` 更忠实，但异常字体可能导致核心分割失败
- `strip` 更容易处理成功，但会丢失字偶距信息，排版可能变化

### 4.2 `smallGlyphAction`

可选值：

- `subset`（默认）
- `single-woff2`
- `copy-original`

当 `glyphCount > 0 && glyphCount <= smallGlyphThreshold` 时生效。

行为：

- `subset`：仍然尝试正常 cn-font-split 分片
- `single-woff2`：不做多分片，输出一个 WOFF2 + CSS
- `copy-original`：不调用分割器，不生成 web-font，只复制原字体并写 `split-meta.json`

> [!NOTE]
> `smallGlyphAction` 只接受上面的公开取值；需要保留小字形原文件时，请显式使用 `copy-original`。

### 4.3 `smallGlyphThreshold`

默认值：`50`

用途：

- 控制小字形策略触发阈值
- 只在 `glyphCount` 可读且大于 0 时触发

### 4.4 `splitFailureAction`

可选值：

- `error`（默认）
- `single-woff2`

行为：

- `error`：`cn-font-split` 失败时直接报错
- `single-woff2`：分割失败后输出单 WOFF2 + CSS fallback

风险：

- `single-woff2` 会把失败恢复成 `ok: true`，调用方必须检查 `resultType`、`usedFallback` 和 `warnings`

### 4.5 批量安全默认值

批量模式默认已经采用适合自动化的安全策略：

- 批量模式默认已经使用 `skipMode: "manifest"`
- 批量模式默认已经使用 `batchErrorMode: "fail-after"`
- 只有明确需要重跑时才显式传 `skipMode: "force"`；只有调用方会检查 `errors[]` 和 `errorCount` 时才显式传 `batchErrorMode: "collect"`
- 单文件模式下，当前默认已经偏严格：`splitFailureAction` 默认 `error`，`smallGlyphAction` 默认 `subset`

### 4.6 `skipMode`（批量专用）

可选值：

- `manifest`（默认）
- `force`

行为：

- `manifest`：读取 `split-meta.json`，比较源文件和有效参数，只有一致才跳过
- `force`：永远不跳过，始终重跑

说明：`skipMode` 与 `batchNamingMode` / `batchDedupeMode` 组合使用；当后两者变化时，manifest 模式会把它们当作有效配置变化。

风险：

- `manifest` 比只看旧输出文件更安全，但旧输出目录第一次使用时通常会重跑以生成 manifest

### 4.7 `batchGroupBy`（批量专用）

可选值：

- `auto`（默认）
- `source-dir`
- `font-family`

行为：

- `auto`：嵌套字体使用第一层源目录名；输入根目录字体使用内部 family metadata
- `source-dir`：尽量按源目录名分组
- `font-family`：尽量按字体内部 family metadata 分组

风险：

- `auto` / `source-dir` 更适合“一个目录就是一个字体家族”的整理方式
- `font-family` 更相信字体 metadata，但 metadata 可能不符合用户整理意图

### 4.8 `batchNamingMode`（批量专用）

可选值：

- `plain`
- `numeric-suffix`（默认）
- `source-suffix`

行为：

- `plain`：始终使用裸 `fontBaseName` 和原始文件名，不自动追加冲突后缀
- `numeric-suffix`：默认先用裸名；只有真实冲突时才分配稳定的 `-1`、`-2`、`-3`
- `source-suffix`：显式使用基于来源的稳定后缀，让不同来源在未真正冲突前也先分开

### 4.9 `batchDedupeMode`（批量专用）

可选值：

- `none`
- `same-path`
- `font-identity`（默认）

行为：

- `none`：完全不去重
- `same-path`：只对同一源路径 stem 的多格式文件去重；这是快速路径级策略，不会跨目录判断语义等价字体
- `font-identity`：按归一化后的字体身份跨任意格式去重，保留优先级最高的代表。身份键优先使用 OpenType name IDs 16/17（typographic family/subfamily），缺失完整 typographic 成对字段时回退到 name IDs 1/2（family/subfamily），再回退到 name ID 4（full name）、name ID 6（PostScript name）或 family-only；`identityBasis` 会标明实际采用的来源，`glyphCount` 只作为诊断信息，不参与等价判定。

`dedupeDecisionSummary` 是批量和目录整理响应里的紧凑去重结论。它会给出请求/实际去重模式、`keyStrategy`、`deduplicatedCount`、`skippedDuplicateCount`、`identityKeyMissingCount`、`pathFallbackUsed`、`dedupeLimitedByParsing`、`representativePriority`，以及嵌套的 `identityEvidenceSummary`。`identityEvidenceSummary` 只给出 identity basis 计数和少量重复样例，用来低噪声解释“为什么这些输入被视为重复”；它不是完整 per-file 明细。当 `pathFallbackUsed` 或 `dedupeLimitedByParsing` 为 true 时，agent 不能把结果说成完整的语义 identity 去重；应说明已经回退到路径/stem，或建议用 `parseFonts: true` 重新预检。
解释 `identityBasis` 或 `dedupeDecisionSummary.identityEvidenceSummary.identityBasisCounts` 时，应优先查 `get_agent_guidance.fontIdentityBasisCatalog`。如果 basis 是 `path-stem`、`path-fallback`、`missing` 或低置信度 family-only，则不能把它描述成完整语义 identity 去重证据。

### 4.10 `batchErrorMode`（批量专用）

可选值：

- `collect`
- `fail-fast`
- `fail-after`（默认）

行为：

- `collect`：单字体错误会进入 `errors[]`，批量工具仍返回 `ok: true`，调用方必须检查 `errorCount`。
- `fail-fast`：遇到第一个单字体错误后立即抛出 `BatchSplitError`。
- `fail-after`：继续处理选中的字体；如果最终存在任何单字体错误，则抛出 `BatchSplitError`，错误对象包含 `details.errors` 和 `details.summary`。

通过 MCP Server 返回时，工具错误会同时放入 `structuredContent` 和兼容旧客户端的 JSON 文本。带 `details` 的批量错误包含 `ok: false`、`name`、`errorType`、`error` 和 `details`；MCP schema 校验错误包含 `errorType: "mcp-schema-validation-error"` 和 `details.validationIssues[]`。这能让 AI agent 先按 `errorType` 路由，再读取失败文件清单或参数校验问题，避免只看到一句错误消息。

### 4.11 `limit` / `maxFiles` / `includeResults` / `dryRun`（批量专用）

- `limit`：去重后最多处理多少个字体；默认 `20`，MCP 入口最大 `50000`。
- `maxFiles`：递归扫描阶段最多读取多少个源文件；默认 `5000`，MCP 入口最大 `50000`。
- `maxFilesHit`：批量响应中的机器可读截断信号；只有当 `maxFiles` 之外确实还存在更多源文件时才为 `true`。
- `inputCountGuide`：批量响应中的计数解释入口；先看 `countCompleteness` 和 `recommendedAction`，再把 `discoveredFontCount`、`scannedFileCount` 或忽略文件数量当作完整结论。
- `unsupportedFileDecision`：批量扫描中忽略文件的快速判断，说明是否存在被忽略文件、是否包含压缩包、是否有 `.zip` / `.txt` 之外的噪声，以及这些文件是否会被解压、复制或拆分。
- `unsupportedFileSummary`：批量扫描中所有已扫描但被忽略的非字体文件摘要，包含精确 `unsupportedFileSummary.byExtension[]`、概览 `unsupportedFileSummary.byCategory[]`、带处理语义的 `unsupportedFileSummary.categoryDetails[]`、总体 `unsupportedFileSummary.handlingSummary`、无扩展 `<none>` 计数、`unsupportedFileSummary.examples[]` 和 `unsupportedFileSummary.examplesTruncated`。
- `includeResults`：是否在批量响应中返回每个字体的 `results[]` 详情；默认 `true`。设为 `false` 时仍返回汇总统计、错误列表和 `resultsIncluded: false`，适合全量字体库处理。
- `dryRun`：只执行扫描、去重、命名和 skip 判断，不调用 `split_font`，也不写任何输出文件。`includeResults: true` 时返回 `planned[]` 计划清单；其中 `planned[].wouldProcess` 表示该条目在真实写入时是否会处理，`planned[].skipReason` 解释 dry-run 为什么计划跳过该条目。

### 4.11.1 `debugBatchDecisions`（批量调试专用）

`debugBatchDecisions: true` 会在批量处理过程中输出结构化调试日志，用来定位为什么某个字体被去重、为什么选择某个输出名、为什么跳过已有输出，或为什么某个文件进入错误路径。

当前事件类型包括：

- `dedupe-drop`
- `dedupe-replace`
- `naming`
- `skip-check`
- `error`

这个开关只影响调试输出，不改变 `batchDedupeMode`、`batchNamingMode`、`skipMode`、`dryRun` 或写入行为。它适合在少数样本上定位问题；大规模真实语料运行时通常保持 `false`，避免日志过大。调试日志也不能替代正式响应字段，agent 仍必须检查 `safetySummary`、`planned[]` / `results[]`、`batchWarnings[]`、`errorCount`、`errors[]` 和后续 `inspect_split_output` 审计结果。

### 4.12 `workflowPreset`（批量和目录整理）

`workflowPreset` 是给 agent 使用的常见工作流快捷配置，当前用于 `split_font_batch` 和 `organize_font_directory`。需要原始工具默认值时直接省略 `workflowPreset`。

可选值：

- `safe-preview`：第一次查看陌生目录时使用的无写入预览。批量模式会启用 `dryRun: true`、`includeResults: true`、`skipMode: "manifest"`、`batchErrorMode: "fail-after"`、`batchDedupeMode: "font-identity"` 等安全默认值；目录整理会保持 `dryRun: true`、解析字体并返回完整计划。
- `reviewed-write`：已经审查过预览后使用的写入配置。批量模式会真实写拆分输出；目录整理只会 copy-only 写入 `outputDir`，仍不会移动或删除源文件。
- `structure-first`：面向超大或嘈杂目录的快速无写入第一遍扫描。批量模式使用 `batchDedupeMode: "same-path"`，只做路径/stem 级去重；目录整理会使用 `parseFonts: false` 和 `includePlan: false`，此时 identity 去重会受限并回退到结构/路径级判断。
- `source-layout`：优先按源目录分组，适合“每个压缩包/家族一个目录”的来源结构。
- `metadata-family`：优先按字体内部 family metadata 分组，适合扁平 vendor dump。
- `preserve-all`：关闭批量预处理去重，同时保留 `numeric-suffix` 冲突安全命名，适合必须保留每个源字体文件的场景。

预设只是起点，不是锁定配置。工具会先展开 `workflowPreset`，再应用同一次调用中显式传入的参数；因此显式参数总是覆盖预设。例如 `workflowPreset: "safe-preview"` 加 `batchDedupeMode: "none"` 会保留无写入预览，但关闭去重。

响应会回显实际使用的 `workflowPreset`。批量响应还会回显 `batchNamingMode` 和 `batchDedupeMode`，用于确认预设和显式覆盖后的最终策略。批量和目录整理响应还会返回 `configurationTrace`：它会逐项说明高影响配置来自原始工具默认值、`workflowPreset` 默认值还是显式参数，并给出 `explicitOverrideFields[]`、`presetDefaultFields[]` 和最终 `effectiveValue`。当 agent 需要解释配置来源、确认显式参数是否覆盖预设，或确认 `undefined` 没有擦除预设默认值时，应优先检查这个字段。

---

## 5. 单文件 `split_font` 处理流程

当前流程：

1. 校验 `fontPath` 在工作区内且文件存在
2. 校验扩展名属于支持列表
3. 读取整个字体文件
4. 如果输入是 WOFF1，先解压为 sfnt-like 数据
5. 如果输入是 WOFF2，先解压为 sfnt-like 数据
6. 检测超大 `kern` 表
7. 根据 `oversizedKernAction` 决定是否删除 `kern`
8. 读取 glyph count
9. 根据 `smallGlyphAction` 判断是否走小字形策略
10. 如果继续分割，则调用 cn-font-split WASM
11. 如果分割失败，根据 `splitFailureAction` 决定报错还是单 WOFF2 fallback
12. 复制原字体到输出家族目录
13. 写生成文件
14. 写 `split-meta.json`
15. 返回 JSON 结果

---

## 6. 批量 `split_font_batch` 处理流程

当前流程：

1. 递归扫描 `inputDir`
2. 跳过工具自身、依赖和输出目录
3. 过滤支持的字体扩展名
4. 按 `batchDedupeMode` 决定是否去重，以及如何在不同格式之间去重
5. 根据 `batchGroupBy` 计算家族目录名
6. 按 `batchNamingMode` 解析批量输出目录名
7. 根据 `skipMode` 判断是否跳过已有输出
8. 未跳过时调用 `split_font`
9. 汇总成功、错误、跳过、处理模式统计和 `batchDecision`
10. 如果 `includeResults: false`，响应中省略每个字体的 `results[]` 详情，只保留汇总和错误
11. 如果 `dryRun: true`，第 8 步不会真正执行，而是返回 `planned[]`、`plannedCount` 和 `wouldProcessCount`
12. 如果 `batchErrorMode` 是 `fail-fast` 或 `fail-after`，按对应策略把单字体错误升级为批量工具错误

批量处理的源目录安全语义：

- 批量工具不会移动、删除或重写源字体文件。
- `sourceDestructive` 恒为 `false`。
- `sourceFilesPreserved` 恒为 `true`。
- `outputTreeInsideInputTree` 表示 `outputRoot` 是否位于或等于 `inputDir`。
- `writesSourceTree` 只有在 `dryRun: false` 且 `outputTreeInsideInputTree: true` 时才为 `true`；这表示输入目录树内会出现输出文件，不表示源字体文件被移动、删除或重写。
- `dryRun: true` 时 `writesOutputTree: false`，不会写 `outputRoot`。
- `dryRun: false` 时 `writesOutputTree: true`，只会在 `outputRoot` 下写生成文件、原字体副本和 `split-meta.json`。
- 非 dry-run 且有选中字体时 `mayOverwriteOutputTree: true`，表示已有输出文件可能被替换；这个风险只限输出目录，不表示源字体文件会被替换。
- `sourceSafetyDecision` 是第一层源安全结论，会直接给出 `status`、`sourceBackupRequired`、`writesFiles`、`requiresOutputAudit` 和 `mustInspectFields`。
- `safetySummary` 会集中重复这些字段，agent 判断批量工具是否破坏源目录时应先看 `sourceSafetyDecision`，再看它。

### 6.1 批量去重策略

格式优先级仍然是：

1. `.otf`
2. `.ttf`
3. `.woff2`
4. `.ttc`
5. `.otc`
6. `.woff`

但是否使用这套优先级、以及应用范围，取决于 `batchDedupeMode`：

- `none`：完全不去重
- `same-path`：只对同路径同 stem 的多格式文件按上面优先级去重
- `font-identity`：对任意格式，只要归一化后的字体身份相同，就按上面优先级保留一个代表
- 如果身份解析失败，会回退到基于路径 stem 的 key；这会避免扫描/去重阶段直接中断，真正的坏字体错误由处理阶段和 `batchErrorMode` 决定如何呈现

例如：

- `Foo.otf` + `Foo.ttf` 在 `same-path` / `font-identity` 下通常只保留 `Foo.otf`
- `Foo.ttf` + `Foo.woff2` 在 `font-identity` 下如果字体身份等价，也可以只保留一个代表
- `batchDedupeMode = none` 时，这些文件都不会被预先去重

### 6.2 批量输出目录自动防冲突

批量模式下，第一层 family 目录规则不变，但第二层字体输出目录默认仍然优先使用裸 `fontBaseName`。

当前行为是：

- 保留 `batchGroupBy` 决定的家族目录
- 默认先尝试直接使用 `<fontBaseName>`
- 如果同一 family 目录里已有别的源文件占用了这个名字，才继续分配稳定的数字后缀：`-1`、`-2`、`-3`
- 这个数字后缀会通过 manifest 绑定到源文件，后续 rerun 时会稳定复用

结果是：

- 没冲突时：`split-output/tiny5/Tiny5-CRTBold/`
- 真冲突时：`split-output/tiny5/Tiny5-CRTBold-1/`

同时，OTF / TTF / WOFF / WOFF2 如果在字体身份上等价（优先看 family/subfamily，缺失时回退到 full name 或 PostScript name），会在批量阶段先去重，只保留一个代表；`glyphCount` 不参与等价判定，因此不会仅仅因为容器差异或小幅 glyph count 差异就各自产生一个输出目录。

---

### 6.5 `organize_font_directory` 目录整理流程

`organize_font_directory` 用于处理“源字体目录结构和工具预期不一致”的情况。它不是字体拆分工具，不会调用 cn-font-split，也不会生成 `.woff2`、`result.css` 或 web-font 输出。

默认行为：

1. `dryRun` 默认是 `true`，只生成整理计划，不创建目录、不复制文件。
2. 所有路径仍限制在 `FONT_SPLIT_ROOT` 内。
3. 扫描支持的字体扩展名，并复用输入预检逻辑解析 identity 和 glyph count。
4. 根据 `batchDedupeMode` 对等价字体去重，默认仍是 `font-identity`。
5. 根据 `batchGroupBy` 计算整理后的分组目录。
6. 根据 `batchNamingMode` 计算整理后的目标文件名。
7. 返回 `layout`、`recommendedBatchOptions`、`recommendedBatchPreviewArgs`、`recommendedNextActions[]`、`organizationDecision`、`organizationWarnings[]`、`planActionSummary` 和可选 `plan[]`。

`parseFonts` 控制是否读取字体元数据：

- 默认 `parseFonts: true`，会读取 identity、glyph count，并能检测坏字体。
- `parseFonts: false` 是结构优先模式，只根据路径和扩展名生成计划，不读取字体内容。
- 在结构优先模式下，`validFontCount` 和 `invalidFontCount` 返回 `null`，表示“未检查”，不是 0。
- 在结构优先模式下，请求 `batchDedupeMode: "font-identity"` 会回退为 `effectiveBatchDedupeMode: "same-path"`，并返回 `dedupeLimitedByParsing: true`。
- 在结构优先模式下，`batchGroupBy: "font-family"` 无法读取真实 metadata，会使用文件 basename 作为 fallback。

`includePlan` 控制是否返回完整逐字体 `plan[]`：

- 默认 `includePlan: true`，适合人工或 agent 审查每个字体会被复制、跳过还是去重。
- `includePlan: false` 会省略详细 `plan[]`，但仍返回 `planActionSummary` 和 `sourceLayoutMismatchSummary`，并在 `directoryWorkflowSummary.planVisibility` 中标出可用摘要字段和 `rerunWithPlanArgs`，适合大目录的压缩响应。
- 写入前如果需要判断具体文件会落到哪里，应保留 `includePlan: true`，或按 `directoryWorkflowSummary.planVisibility.rerunWithPlanArgs` 重新运行一次包含计划详情的 dry-run。

真正执行时：

- 只有显式设置 `dryRun: false` 才会写入文件。
- 写入模式是 `copy-only`：只把选中的字体复制到 `outputDir`。
- 不会移动、删除或重写源目录中的任何文件。
- `sourceSafetyDecision` 是第一层源安全结论；`sourceBackupRequired` 应为 `false`，因为整理工具不会移动、删除或重写源字体。
- `safetySummary` 会用一个对象集中说明 operation mode、写入范围、覆盖范围和源目录保留状态。判断整理工具是否破坏源目录时，应先看 `sourceSafetyDecision`，再看这个字段。
- `sourceDestructive` 恒为 `false`。
- `outputTreeInsideInputTree` 表示 `outputDir` 是否位于或等于 `inputDir`。
- `writesSourceTree` 只有在 `dryRun: false` 且 `outputTreeInsideInputTree: true` 时才为 `true`；这表示输入目录树内会出现整理副本，不表示源字体文件被移动、删除或重写。
- `writesOutputTree` 只有在 `dryRun: false` 时才为 `true`。
- `mayOverwriteOutputTree` 只有在当前非 dry-run 调用可能覆盖 `outputDir` 文件时才为 `true`。
- 执行后会在 `outputDir` 写入 `font-organization-manifest.json`，记录本次整理摘要和条目。

需要特别注意：

- `dryRun` 默认值与 `split_font_batch` 一样都是 `true`。真实整理或批量拆分写入需要 `workflowPreset: "reviewed-write"` 或显式 `dryRun: false`。
- `parseFonts: false` 会跳过坏字体检测和真实 identity 去重；不要把 `invalidFontCount: null` 解读为没有坏字体。
- 非字体文件会被忽略，但会进入 `inputCountGuide`、`unsupportedFileDecision` 和 `unsupportedFileSummary`。`inputCountGuide` 解释扫描数量是否完整、明细是否省略和忽略文件处理方式；`unsupportedFileDecision` 是快速判断，`unsupportedFileSummary` 是详细证据；后者统计所有非字体扩展名，包含 `unsupportedFileSummary.byExtension[]` 精确扩展名统计、`unsupportedFileSummary.byCategory[]` 概览分类、带处理语义的 `unsupportedFileSummary.categoryDetails[]`、总体 `unsupportedFileSummary.handlingSummary`、`unsupportedFileSummary.examples[]`、`unsupportedFileSummary.examplesTruncated` 和无扩展文件的 `<none>` 计数。
- 扩展名像字体但解析失败的文件默认跳过；只有显式启用 `copyInvalidFonts`（例如 `copyInvalidFonts: true`）时才会纳入复制计划。
- 如果 `outputDir` 位于 `inputDir` 里面，响应会给出 `output-inside-input` 警告和 `outputTreeInsideInputTree: true`；后续扫描应排除该目录，避免把整理后的副本再次当作源字体。
- 如果显式启用 `overwriteExisting`（例如 `overwriteExisting: true`），可能替换 `outputDir` 里的目标文件，但仍不会影响源文件。

推荐 agent 工作流：

1. 先调用 `organize_font_directory`，保持默认 `dryRun: true`。
2. 检查 `safetySummary`、`layout.layoutKind`、`recommendedBatchOptions`、`recommendedBatchPreviewArgs`、`recommendedNextActions[]`、`organizationWarnings[]`、`sourceDestructive`、`writesSourceTree`、`writesOutputTree`、`outputTreeInsideInputTree` 和 `mayOverwriteOutputTree`。
3. 如果用户只是想调整批量参数，不一定需要真的整理目录；优先把 `recommendedBatchPreviewArgs` 用于 `split_font_batch` 无写入预览。`recommendedBatchPreviewArgs.maxFiles` 会保留本次扫描上限，避免复制下一步调用时退回默认值；当 `recommendedNextActions[].suggestedArgsField` 存在时，它会指出该动作的可复制参数镜像了哪个权威响应字段；目录整理返回的后续扫描动作也会通过 `recommendedNextActions[].suggestedArgs.maxFiles` 保留本次上限，除非动作本身明确要求调高上限；`recommendedBatchOptions` 只是策略片段，不能单独当作完整安全调用。
4. 如果用户明确希望得到更规整的暂存目录，再用 `dryRun: false` 执行 copy-only 整理。
5. 整理完成后，对 `outputDir` 调用 `inspect_font_inputs` 或把它作为后续 `split_font_batch.inputDir`。
6. `recommendedNextActions[]` 是给 agent 的下一步清单；它不会自动执行，也不能替代对每项 `inspectFields` 的检查和 `successCriteria` 的确认。

---

## 7. 输出目录结构

### 7.1 正常多分片输出

```text
split-output/
  <FamilyName>/
    <OriginalFontFile> 或 <OriginalFontFile-1>
    <FontBaseName>/ 或 <FontBaseName-1>/
      *.woff2
      result.css
      index.html?
      reporter.bin?
      index.proto?
      split-meta.json
```

### 7.2 单 WOFF2 fallback 输出

```text
split-output/
  <FamilyName>/
    <OriginalFontFile> 或 <OriginalFontFile-1>
    <FontBaseName>/ 或 <FontBaseName-1>/
      <FontBaseName>.woff2
      result.css
      index.html?
      split-meta.json
```

### 7.3 小字形 `copy-original` 输出

```text
split-output/
  <FamilyName>/
    <OriginalFontFile> 或 <OriginalFontFile-1>
    <FontBaseName>/ 或 <FontBaseName-1>/
      split-meta.json
```

说明：

- 单文件 `split_font` 仍然通常使用裸 `fontBaseName`
- 批量 `split_font_batch` 默认优先使用裸名
- 只有真实冲突时，才会为目录名和原字体副本名分配 `-1`、`-2` 这类稳定数字后缀
- 数字后缀不会按每次扫描顺序重排，而是会通过 manifest 在后续 rerun 中稳定复用
`copy-original` 不生成：

- `.woff2`
- `result.css`
- `index.html`
- `reporter.bin`
- `index.proto`

### 7.4 `organize_font_directory` 暂存输出

```text
organized-fonts/
  <GroupName>/
    <OriginalFontFile> 或 <OriginalFontFile-1>
  font-organization-manifest.json
```

说明：

- 只有 `dryRun: false` 时才会创建这个结构。
- 这不是 web-font 输出，不包含 CSS 或拆分后的 WOFF2 分片。
- 它只用于把源字体复制到更适合后续批量处理的暂存目录。
- 源目录不会被移动、删除或重写。

---

## 8. `split-meta.json` manifest

每个被处理的字体都会在 split 目录写入：

```text
split-meta.json
```

它记录：

- manifest schema 版本
- 工具版本
- 源文件路径、大小、mtime
- 分组信息
- 有效处理参数
- 输出结果摘要

`skipMode: "manifest"` 会依赖这个文件判断输出是否仍然有效。

---

## 9. 返回值语义

### 9.1 `split_font`

关键字段：

| 字段 | 含义 |
|------|------|
| `ok` | 工具是否按所选策略完成 |
| `outputMode` | `subset` / `single-woff2` / `copy-original` |
| `resultType` | 更细的结果类型 |
| `performedSplit` | 是否真正执行了多子集分割 |
| `usedFallback` | 是否使用单 WOFF2 fallback 输出；`copy-original` 为 `false` |
| `skipped` | 单字体是否主动绕过正常多子集分割器；不等同于批量已有输出跳过 |
| `skipReason` | 绕过、fallback 或 dry-run skip 计划的原因 |
| `warnings` | 非透明行为提示 |
| `manifestPath` | manifest 路径 |
| `copiedOriginalPath` | 输出目录中的原字体副本路径 |

常见 `resultType`：

- `subset`
- `single-woff2-small-glyph`
- `single-woff2-split-failure`
- `single-woff2`
- `copy-original-small-glyph`

### 9.2 `split_font_batch`

关键统计：

- `discoveredFontCount`
- `deduplicatedCount`
- `skippedDuplicates`
- `skippedExisting`
- `skippedByManifest`
- `reprocessedBecauseSourceChanged`
- `reprocessedBecauseOptionsChanged`
- `processedFontCount`
- `sourceSafetyDecision`：第一层源安全结论；直接说明源字体是否会被移动/删除/重写、是否需要源文件备份、是否写文件、输出是否在输入树内、是否需要后续输出审计
- `safetySummary`：集中的源目录/输出目录安全摘要；用于在 `sourceSafetyDecision` 之后判断批量工具是否会写文件、是否影响源目录、覆盖风险是否只限输出目录
- `sourceDestructive`：恒为 `false`
- `sourceFilesPreserved`：恒为 `true`
- `writesSourceTree`：只有真实批量写入且 `outputRoot` 位于 `inputDir` 内时才为 `true`
- `writesOutputTree`：`dryRun: false` 时为 `true`
- `outputTreeInsideInputTree`：`outputRoot` 是否位于或等于 `inputDir`
- `mayOverwriteOutputTree`：当前非 dry-run 调用是否可能覆盖 `outputRoot` 中的文件
- `batchWarningCount`
- `batchWarnings[]`：批量摘要级提示，每项包含 `code` 和 `message`
- `batchPolicySummary`：本次实际采用的批量分组、命名、去重和错误策略摘要，并附带对应 `batchPolicyGuide` 成功标准
- `batchDecision`：当前批量响应的紧凑主线路由建议
- `recommendedNextActionCount`
- `recommendedNextActions[]`：面向 agent 的批量后续动作建议；dry-run 可能给出 `run-reviewed-batch-write`，真实写入可能给出 `audit-split-output`，要求继续用 `inspect_split_output` 审计输出结构
- `errorCount`
- `processingSummary`

`processingSummary` 包含：

- `subsetOutputs`
- `singleWoff2Outputs`
- `copyOriginalOutputs`
- `smallGlyphDowngrades`
- `smallGlyphCopyOriginals`
- `failureFallbacks`
- `decompressedInputs`
- `oversizedKernDetected`
- `oversizedKernStripped`

`batchPolicySummary` 是本次调用的策略回显，不是成功证明。它会列出 `values`、可选 `effectiveValues`、`selectedPolicies[]`、当前响应可直接检查的 `inspectFields`、完整来源字段 `policyGuideInspectFields` 和 `policySuccessCriteria[]`；agent 应用它解释当前策略，然后继续检查 `batchWarnings[]`、`errors[]`、`batchDecision` 和后续审计字段。

`batchDecision` 会把复杂的批量响应压缩成主线路由，例如 `review-dry-run-plan`、`rerun-batch-with-higher-maxFiles`、`inspect-batch-errors`、`audit-written-output`、`review-existing-output-skips`、`no-supported-fonts` 或 `no-selected-fonts`。它只用于帮助 agent 选择下一步分支，不是成功证明；继续前仍要检查 `batchWarnings[]`、`errors[]`、`recommendedNextActions[]`，以及真实写入后的输出审计字段。

`recommendedNextActions[]` 是检查清单，不会自动执行。

- 每项的 `successCriteria` 是继续下一步或报告完成前的判断条件。
- 若某项带有 `suggestedArgsField`，它只是说明 `suggestedArgs` 镜像了哪个权威字段，例如 `batchDecision.reviewedWriteArgs`、`batchDecision.auditArgs`、`recommendedBatchPreviewArgs` 或 `sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs`，不是成功证明。
- 真实批量写入后，只有按 `audit-split-output.suggestedArgs` 调用 `inspect_split_output`，并确认 `outputStructureDecision.status: "pass"`、`auditStatus: "pass"`、`auditPassed: true`、`structureSummary.conforms: true`、`maxFilesHit: false` 且没有需要行动的 `inspectionWarnings[]`，才应把输出目录视为结构验收通过。

常见 `batchWarnings[].code`：

- `dry-run-no-write`：当前是 dry-run，没有写输出。
- `input-scan-truncated`：输入扫描命中 `maxFiles`，不能把本次统计视为完整。
- `batch-limit-truncated`：`limit` 只选中了去重后字体的一部分。
- `batch-plan-omitted`：dry-run 计划详情因 `includeResults: false` 被省略。
- `batch-results-omitted`：真实批量结果详情因 `includeResults: false` 被省略。
- `existing-output-skipped`：已有输出按 `skipMode` 被跳过。
- `errors-collected`：`batchErrorMode: "collect"` 收集了单字体错误，必须检查 `errors[]`。

### 9.3 `organize_font_directory`

关键字段：

| 字段 | 含义 |
|------|------|
| `sourceSafetyDecision` | 第一层源安全结论；直接说明源字体是否会被移动/删除/重写、是否需要源文件备份、是否写文件、输出是否在输入树内 |
| `safetySummary` | 集中的源目录/输出目录安全摘要；用于在 `sourceSafetyDecision` 之后判断整理工具是否会写文件、是否会影响源目录、覆盖风险是否只限输出目录 |
| `operationMode` | `plan-only` 或 `copy-only` |
| `sourceDestructive` | 恒为 `false` |
| `sourceFilesPreserved` | 恒为 `true` |
| `writesSourceTree` | 只有真实整理复制且 `outputDir` 位于 `inputDir` 内时才为 `true` |
| `writesOutputTree` | `dryRun: false` 时为 `true` |
| `outputTreeInsideInputTree` | `outputDir` 是否位于或等于 `inputDir` |
| `mayOverwriteOutputTree` | 当前非 dry-run 调用是否可能覆盖目标目录文件 |
| `parsedFontMetadata` | 是否读取了字体元数据 |
| `unparsedFontCount` | 被有意跳过元数据解析的受支持扩展名文件数 |
| `effectiveBatchDedupeMode` | 实际执行的整理去重策略 |
| `dedupeLimitedByParsing` | 是否因跳过解析而无法执行真实 identity 去重 |
| `batchPolicySummary` | 本次整理调用采用的分组、命名和去重策略摘要；若 `parseFonts: false` 导致 identity 去重降级，`effectiveValues.batchDedupeMode` 会显示实际回退值 |
| `layoutDecision` | 顶层紧凑路线摘要，汇总 `shortAnswer`、检测布局、推荐分组、主线路由、源安全信号、原目录安全预览状态和 copy-only 暂存状态；它是路线索引，不是成功证明 |
| `layoutDecision.directoryHandling` | 第一层目录处理答案；用 `recommendedMode` 和 `shortAnswer` 直接说明应预览原目录、复核 mixed 布局、使用 copy-only 整理输出、重跑整理，还是因为没有可复制字体而停止 |
| `directoryWorkflowSummary` | 本次整理响应里的目录工作流导航摘要，覆盖布局复核、安全批量预览、可选 copy-only 暂存、reviewed 批量写入和输出审计步骤 |
| `sourceLayoutMismatchSummary` | 源目录结构判断摘要，直接说明当前布局与推荐分组是否匹配、能否直接对原目录做安全预览、copy-only 暂存是不需要/可选/已经写出、暂存为什么不破坏源文件，并通过 `sourceLayoutMismatchSummary.decisionChecklist` 给出更短的 agent 决策清单 |
| `directoryWorkflowSummary.planVisibility` | 说明本次响应是否包含详细 `plan[]`；当 `includePlan: false` 时，列出仍可用于压缩判断的摘要字段，并提供需要逐文件审查时的 `rerunWithPlanArgs` |
| `layout.layoutKind` | `empty` / `flat` / `nested` / `mixed` |
| `recommendedBatchOptions` | 根据目录结构建议的后续批量策略片段，不是完整安全调用 |
| `recommendedBatchPreviewArgs` | 可直接复制的后续 `split_font_batch` 无写入预览参数；`recommendedBatchPreviewArgs.maxFiles` 会保留本次扫描上限 |
| `recommendedNextActions[]` | 面向 agent 的后续动作建议，包含 `id`、`priority`、`tool`、`reason`、可选 `suggestedArgs`、可选 `recommendedNextActions[].suggestedArgsField`、`inspectFields` 和 `successCriteria`；`suggestedArgsField` 指向这组参数对应的权威响应字段；`suggestedArgs` 会优先使用 `workflowPreset`，只保留相对该 preset 的差异覆盖；目录整理后续扫描动作会通过 `recommendedNextActions[].suggestedArgs.maxFiles` 保留本次扫描上限 |
| `organizationDecision` | 当前整理响应的紧凑主线路由建议 |
| `organizationWarnings[]` | 摘要级风险和状态提示 |
| `planActionSummary` | 计划动作汇总；即使 `includePlan: false` 也会返回 |
| `plan[]` | 可选的逐字体复制/跳过计划 |
| `organizationManifestPath` | 执行 copy-only 后的 manifest 路径 |

常见 `organizationWarnings[].code`：

- `organization-dry-run`：当前只是计划，不写文件。
- `organization-writes-output`：当前会写入 `outputDir`。
- `output-overwrite-enabled`：允许覆盖目标目录中的文件。
- `unsupported-files-ignored`：非字体文件被忽略。
- `invalid-fonts-skipped`：坏字体/伪字体文件被跳过。
- `duplicate-fonts-skipped`：等价字体被去重。
- `mixed-layout-detected`：根目录和子目录中都发现了字体。
- `output-inside-input`：批量或整理输出目录位于输入目录内，后续扫描需要排除它，或明确把该输出目录作为下一步输入。
- `font-parsing-skipped`：`parseFonts: false`，本次只做结构优先计划，没有读取字体元数据。

目录路线字段按下面层次阅读：

- `layoutDecision` 是最短的顶层路线索引，用于快速回答“当前布局是什么、推荐走哪条路、原目录能否先安全预览、是否需要 copy-only 暂存”。
- `layoutDecision.directoryHandling` 是更短的目录处理答案。它会用 `recommendedMode` 和 `shortAnswer` 说明应该直接预览原目录、复核 mixed 布局、使用已经写出的 copy-only 整理目录、重跑整理，还是停止等待输入/策略变化。
- `organizationDecision` 会把复杂的整理响应压缩成主线路由，例如 `rerun-with-font-parsing`、`decide-on-invalid-fonts`、`preview-original-layout`、`review-mixed-layout` 或 `preview-organized-output`。
- `directoryWorkflowSummary` 会把当前安全状态、布局复核原因、`planVisibility`、`workflowSteps[]`、成功标准和非直觉行为提示放在一起。其中 no-write `split_font_batch` 预览步骤会通过 `directoryWorkflowSummary.workflowSteps[].suggestedArgsField` 指向可复制参数的权威字段。
- `recommendedNextActions[].suggestedArgsField` 会在后续动作清单里提供同类来源指针，例如 `recommendedBatchPreviewArgs` 或 `sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs`。
- `sourceLayoutMismatchSummary` 专门回答“原目录可否直接预览、是否需要 copy-only 暂存、暂存是否破坏源文件”。其中 `sourceLayoutMismatchSummary.decisionChecklist` 会集中列出源安全、直接预览、暂存、plan 可见性、warning 和输出审计检查。
- copy-only 写出后，`sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs` 可以直接复制到 `split_font_batch`，并保留当前 `maxFiles`；同一组参数也会重复出现在 `sourceLayoutMismatchSummary.decisionChecklist.items[].safePreviewArgs`。
- 这些字段只用于帮助 agent 选择下一步分支，不是成功证明；继续前仍要检查 `recommendedNextActions[]`、`organizationWarnings[]`、`planActionSummary`、`directoryWorkflowSummary.planVisibility` 和可用时的 `plan[]`。

目录路由相关的 `inspectFields`、`mustInspectFields` 和 `responseFields` 只要列出 `sourceLayoutMismatchSummary`，也会同时列出 `sourceLayoutMismatchSummary.decisionChecklist`。这避免 agent 只检查父摘要而漏掉嵌套决策清单。

`planActionSummary.byAction` 会统计 `would-copy`、`copied`、`skipped-duplicate`、`skipped-invalid`、`skipped-target-exists`、`would-skip-target-exists` 和 `error` 等动作。它服务于 agent 快速判断计划形态；真正写文件前仍应审查 `plan[]` 明细和 `organizationWarnings[]`。

### 9.4 `inspect_split_output`

`maxFiles` 默认是 `200000`。它只影响输出检查阶段的文件扫描上限，不影响批量处理阶段的 `maxFiles`。

`maxFilesHit` 只有当 `maxFiles` 之外确实还有更多输出文件时才为 `true`。如果它为 `true`，不要把本次输出审计视为完整结果，应调高 `maxFiles` 后重跑。

`includeFiles: false` 会省略扁平 `files[]` 清单；`includeFamilies: false` 会省略结构化 `families[]` 清单。它们只影响响应体大小，不影响 `fileCount`、`familyCount`、`fontEntryCount`、manifest 数量、输出模式计数或 `structureSummary`。

解释输出审计状态、布局和问题代码前，应先查 `get_agent_guidance.outputStructureCatalog`。其中 `outputRoleDecision` 先判断目录是否适合作为拆分输出审计目标，`layoutKinds` 对应 `structureSummary.layoutKind`，`issueCodes` 对应 `structureSummary.issues[].code`，`outputModes` 说明 `subset`、`single-woff2` 和 `copy-original` 各自需要哪些文件；这比从字符串猜测更可靠。

`outputRoleDecision` 是输出审计的第一层目录角色判断。若 `outDir` 包含 `font-organization-manifest.json`，它会返回 `detectedRole: "organized-font-source-staging"`、`isSplitOutput: false` 和 `auditAppliesToThisDirectory: false`，表示这个目录是 `organize_font_directory` 写出的源目录式暂存，不是 `split_font` / `split_font_batch` 生成后的拆分输出。此时应按 `suggestedInspectInputArgs` 先调用 `inspect_font_inputs`，再按 `suggestedBatchPreviewArgs` 做 `split_font_batch` safe-preview；不要把该目录的输出审计当作通过。

`outputStructureDecision` 是输出结构审计的快速判断，派生自 `outputRoleDecision`、`auditStatus`、`auditBlockingReasons`、`maxFilesHit` 和 `structureSummary`。先看 `outputStructureDecision.status`、`recommendedAction`、`blockingReasonCodes` 和 `issueCodes`；若 `status` 不是 `pass`，再看 `outputRoleDecision` 和 `structureSummary` 中的详细证据。

`auditStatus` 是输出审计的紧凑门禁，取值为 `pass`、`action-required` 或 `incomplete`。`auditPassed` 是 `auditStatus === "pass"` 的布尔快捷字段。`auditBlockingReasons[]` 会列出阻止通过的机器可读原因，例如 `output-scan-truncated` 或 `output-structure-issues`；结构问题会带上来自 `structureSummary.issues[]` 的 `issueCodes`。

`structureSummary` 是输出目录结构验收摘要。它会检查：

- 输出是否是文档化的 `single-family` 或 `family-tree` 结构
- 是否有无法归类到 family/font entry 的杂项文件
- 每个字体条目是否都有 `split-meta.json`
- manifest 声明为 `subset` / `single-woff2` / `copy-original` 时是否具备对应文件

`structureSummary.layoutKind` 给出检测到的布局类型；`structureSummary.rootLevelDiagnosis` 给出对当前 `outDir` 根层级的紧凑诊断，包含 `status`、`likelyCause` 和 `recommendedAction`，用于快速判断期望根、空输出、混合根、未知根或异常深度；`structureSummary.staleResidueDiagnosis` 给出疑似旧生成物残留诊断，用于识别游离的 `result.css`、`split-meta.json`、WOFF2 文件，或 `copy-original` 条目里残留生成输出；`structureSummary.manifestCoverageDiagnosis` 给出 manifest 覆盖诊断，用于判断字体条目是否都有 `split-meta.json` 支撑；`structureSummary.depthProfile` 给出相对 `outDir` 的文件深度分布，即使 `includeFiles: false` / `includeFamilies: false` 也会返回，适合查看具体深度证据；`structureSummary.issues[].code` 给出机器可读问题代码。

真实批量写入后，只有下面条件全都成立时，才应把输出目录视为结构合格：

- `outputRoleDecision.auditAppliesToThisDirectory !== false`
- `outputStructureDecision.status: "pass"`
- `auditStatus: "pass"`
- `auditPassed: true`
- `structureSummary.conforms: true`
- `maxFilesHit: false`

若 `structureSummary.conforms` 为 false，优先查看 `outputRoleDecision`、`auditBlockingReasons[]`、`structureSummary.issues[]`、`unexpectedFileExamples[]`、`unexpectedDepthFileExamples[]` 和 `entryIssueExamples[]`；同时 `inspectionWarnings[]` 可能出现 `output-structure-issues` 或 `organized-staging-not-split-output`。

`copy-original` 条目是 manifest-only 的处理记录，故意不生成 web-font CSS 或 WOFF2 文件；只有 manifest 声明为 `subset` 或 `single-woff2` 却缺少对应 web 输出时，才应按 `web-output-missing` 之类的 issue 处理。

保留基础统计：

- `fileCount`
- `maxFilesHit`
- `auditStatus`
- `auditPassed`
- `auditBlockingReasons`
- `outputStructureDecision`
- `filesIncluded`
- `familiesIncluded`
- `totalBytes`
- `byExtension`
- `files`

并新增结构化统计：

- `familyCount`
- `fontEntryCount`
- `manifestCount`
- `subsetOutputCount`
- `singleWoff2OutputCount`
- `copyOriginalOutputCount`
- `missingManifestCount`
- `structureSummary`
- `families`

如果有 manifest，检查结果优先使用 manifest 分类。
如果没有 manifest，会使用文件结构做保守推断；无法判断时应视为 manifest-missing / unknown 状态。

常见 `inspectionWarnings[].code`：

- `output-scan-truncated`：输出扫描命中 `maxFiles`，不能把本次审计视为完整。
- `output-files-omitted`：因为 `includeFiles: false` 省略了扁平 `files[]`。
- `output-families-omitted`：因为 `includeFamilies: false` 省略了结构化 `families[]`。
- `missing-manifests`：发现缺少 `split-meta.json` 的输出条目，只能从文件结构保守推断。
- `output-structure-issues`：`structureSummary` 发现结构问题，必须检查 `issues[]`。
- `organized-staging-not-split-output`：被检查目录包含 `font-organization-manifest.json`，看起来是 `organize_font_directory` 的源目录式暂存，不是生成后的拆分输出；应改用 `inspect_font_inputs` 和 `split_font_batch` safe-preview。

---

## 10. 非直觉 / 高风险行为

### 10.1 WOFF/WOFF2 会先解压

`.woff` / `.woff2` 不是原样交给 cn-font-split，而是先转换成 sfnt-like 数据。

### 10.2 原字体会被复制到输出目录

每个处理过的字体都会把原文件复制到输出 family 根目录。
这不是软链接，是实体副本。

### 10.3 强制重跑需要显式选择

默认 `skipMode = manifest` 会读取 `split-meta.json` 并比较源文件和有效参数。
如果你明确需要忽略已有 manifest 并重跑，请显式使用：

```json
{
  "skipMode": "force"
}
```

### 10.4 默认批量分组仍偏目录优先

默认 `batchGroupBy = auto` 会优先相信目录结构。
如果你要完全按字体 metadata 分组，请显式使用：

```json
{
  "batchGroupBy": "font-family"
}
```

但要注意：即使家族分组仍然是目录优先，批量模式下第二层字体输出目录也可能带有稳定的数字后缀，以避免同一 family 目录里的同名字体互相覆盖。

### 10.5 `ok: true` 不是“真正分片成功”的同义词

`ok: true` 可能对应：

- 真正多分片
- 单 WOFF2 fallback
- copy-original metadata/copy 处理
- 批量已有输出被 `skipMode: "manifest"` 复用
- `batchErrorMode: "collect"` 下批量完成但 `errorCount > 0`

必须结合 `outputMode` / `resultType` / `skipped` / `skipReason` / `skippedExisting` / `errorCount` 判断。

---

### 10.6 目录整理工具不是破坏性重排工具

`organize_font_directory` 的名字容易让人以为它会“整理原目录”。实际不是：

- 默认 `dryRun: true`，只返回计划。
- `dryRun: false` 时也只是复制文件到 `outputDir`。
- 源目录不移动、不删除、不覆盖。
- `overwriteExisting: true` 只允许覆盖 `outputDir` 中的目标文件，不会影响源文件。
- 如果用户想真正移动/重命名源目录，当前工具不会做；应由用户另行确认并使用其他文件管理流程。

---

## 11. 当前仍然存在的限制

1. WOFF/WOFF2 解压不能关闭。
2. `copy-original` 输出没有 web-font CSS，不能直接作为 web-font 使用。
3. 对 TTC/OTC 的 glyph count 基于当前实现读取逻辑，集合字体可能需要额外确认。
4. `inspect_split_output` 对无 manifest 的旧输出只能保守推断。

---

## 12. 推荐批量参数

如果你的源目录是“每个压缩包解压成一个同名字体家族目录”，推荐：

```json
{
  "inputDir": ".",
  "outputRoot": "split-output",
  "batchGroupBy": "source-dir",
  "skipMode": "manifest",
  "smallGlyphAction": "copy-original"
}
```

含义：

- 按源目录名作为 family 目录
- 用 manifest 判断是否需要重跑
- 小字体保留在输出目录，但不生成 web-font

如果你更信任字体内部 family metadata，使用：

```json
{
  "inputDir": ".",
  "outputRoot": "split-output",
  "batchGroupBy": "font-family",
  "skipMode": "manifest",
  "smallGlyphAction": "copy-original"
}
```

---

## 13. 一句话总结

> [!WARNING]
> **`mcp-font-split` 是一个带显式策略参数、manifest 增量语义和多种输出模式的实用型字体处理工具，不是严格无损、完全透明的字体分割器。**
>
> 使用时应明确选择 `smallGlyphAction`、`skipMode`、`batchGroupBy`，并通过 `resultType` / `outputMode` 判断实际产物类型。
