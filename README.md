# mcp-font-split

显式传入的无效配置会被拒绝，而不是静默回退。MCP schema 会先拦截非法参数；如果绕过 MCP 直接调用模块函数，则会抛出带 `details.summaryType: "configuration-error"` 的 `FontSplitConfigurationError`。需要默认行为时请省略该选项，而不是传入无效枚举、布尔或数字值。

[English](./README.en.md) | [API 参考](./API.zh-CN.md) | [English API](./API.md) | [行为说明](./BEHAVIOR.zh-CN.md)

> **AI 生成代码声明**
>
> 本项目完全由 AI (Claude, Anthropic) 生成。作者不对代码做任何保证，也不承担任何使用责任。代码按"原样"提供，不附带任何形式的担保。

> [!CAUTION]
> **项目状态：仍在完善中，尚未正式发布。**
>
> 当前接口、默认参数、输出字段、目录整理策略和文档说明都可能随时调整。使用或集成时请以当前仓库代码、`get_agent_guidance` 返回值和 API 文档为准。

---

一个 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 服务器，将 [cn-font-split](https://github.com/KonghaYao/cn-font-split) 封装为可由 AI agent 调用的字体分割、批量处理和输出检查工具。

> [!WARNING]
> 使用前请先阅读：[工具完整行为说明（含高风险 / 非直觉行为）](./BEHAVIOR.zh-CN.md)。这个封装层包含批量分组、增量跳过、WOFF 解压、fallback 输出和 manifest 元数据等策略行为。

## 功能

- 将 TTF/OTF/TTC/OTC/WOFF/WOFF2 字体处理为 web-font 输出。
- 批量扫描并处理字体目录。
- 在大批量处理前预检输入目录，先发现坏字体或身份解析问题。
- 当源字体目录结构与预期批量分组不一致时，生成整理计划，或把字体非破坏性复制到更规整的暂存目录。
- 提供 `get_agent_guidance`，让 AI 编程助理用机器可读指南、安全调用模板、错误响应形态、warning code 含义和响应字段含义选择安全工作流；默认返回紧凑指南，也可按 section 请求完整 catalog。
- 提供 `get_runtime_status`，让 agent 在处理前确认工作区、Node engine 兼容性、包版本和 WASM 是否可用。
- 在输出目录中保留原字体副本。
- 为每个处理过的字体写入 `split-meta.json`。
- 检查输出目录，返回基础文件统计和结构化 family/font 汇总。
- 通过 cn-font-split WASM 后端跨平台运行。

## 工具列表

| 工具 | 说明 |
|------|------|
| `get_agent_guidance` | 返回面向 AI agent 的工作流指南、路径规则、默认策略、需要检查的响应字段和完成验证清单；默认紧凑，可用 `detailLevel` / `sections` 请求完整 catalog 或指定 section。 |
| `get_runtime_status` | 返回工作区、Node engine 兼容性、包版本、平台、cn-font-split 运行时和 WASM 可用性的只读诊断信息。 |
| `split_font` | 处理单个字体。根据参数，结果可能是真正分片、单 WOFF2 fallback，或 copy-original 元数据登记。 |
| `inspect_font_inputs` | 不写输出地扫描输入字体，报告解析状态、identity key、glyph count 和坏字体清单。 |
| `split_font_batch` | 扫描目录、按 `batchDedupeMode` 去重、按家族目录分组，并处理每个选中的字体。 |
| `organize_font_directory` | 生成目录整理计划，或把源字体复制整理到暂存目录。默认 `dryRun: true`；不会移动或删除源文件。 |
| `inspect_split_output` | 汇总输出目录，并优先使用 `split-meta.json` 对 family/font 条目做结构化分类。 |

## 重要行为摘要

> [!WARNING]
> `ok: true` 只表示工具按所选策略完成，不代表一定发生了多子集分割。解释结果时应优先看 `resultType`、`outputMode`、`performedSplit`、`usedFallback`、`skipped` 和 `warnings`。

关键默认行为：

- 所有路径都限制在 `FONT_SPLIT_ROOT` 内；相对路径基于该根目录解析。如果未设置该变量，默认使用 MCP Server 进程启动时的当前工作目录。工具响应和 `recommendedNextActions[].suggestedArgs` 中会用 `.` 表示工作区根目录，不会用空字符串表示根目录。
- 对 AI 编程助理来说，当工作流不明确时应先调用 `get_agent_guidance`。它默认返回紧凑指南：推荐工具顺序、默认策略、路径规则、必须检查的响应字段、完成验证清单、`errorResponseCatalog`，以及用于解读本地真实语料 smoke 输出的 `localVerificationOutputGuide`。响应里的 `guidanceView` 会说明本次包含和省略了哪些 section。
- 对维护本包的 agent，`get_agent_guidance.verificationChecklist[]` 包含 `local-compact-check-passed` 和 `local-real-corpus-suite-passed`：前者指向 `npm run check:compact`，用于低噪声读取普通本地门禁；后者指向 `npm run smoke:real-corpus-suite -- <font-corpus-dir>`，作为影响功能行为的改动完成前的本机真实语料可靠性门禁。
- `get_agent_guidance` 会返回 `configurationRecipes[]`，把常见意图映射成 preset-first 参数，例如保留全部源字体、按源目录分组、按字体 metadata 分组、快速结构扫描、copy-only 暂存整理或大库审查后写入。配方只是安全起点，仍必须运行预览/写入工具，检查列出的 `inspectFields`，并满足 `successCriteria`。
- `get_agent_guidance` 会返回 `batchPolicyGuide`，这是批量策略自定义指南，覆盖 `batchGroupBy`、`batchNamingMode`、`batchDedupeMode` 和 `batchErrorMode`。每个选项值都会说明何时使用、何时避免、必须检查哪些字段，以及继续前的 `successCriteria`。
- `get_agent_guidance` 还会返回 `unsupportedFileCategoryCatalog`，解释 `unsupportedFileSummary.byCategory[]` 中 `archive`、`document`、`unsupported-font` 等分类的代表扩展名和处理行为；每个工具响应里的 `unsupportedFileDecision` 会给出快速判断，`unsupportedFileSummary.categoryDetails[]` 和 `unsupportedFileSummary.handlingSummary` 则提供证据，压缩包只会被报告，不会被解压、复制或拆分。
- 输入扫描类工具会返回 `inputCountGuide`，用一个紧凑对象解释扫描文件数、支持字体数、忽略文件数、`maxFilesHit` 是否导致计数不完整、文件明细是否被故意省略，以及非字体文件的处理方式。把真实语料计数当作完整结论前应先看它。
- `get_agent_guidance` 还会返回 `directoryHandlingModeCatalog`，解释每个 `layoutDecision.directoryHandling.recommendedMode` 取值，包括它何时出现、下一步建议、是否会在复核前写文件、源目录安全性、必须检查的字段和容易误解的行为。
- `get_agent_guidance` 还会返回 `directoryWorkflowDecisionMatrix[]`，这是机器可读的目录工作流决策表，用于在直接批量拆分、dry-run 整理、copy-only 整理和结构优先计划之间做选择。决策表和 `directoryWorkflowExamples[]` 示例也会优先使用 `workflowPreset`，只额外列出路径、规模或目录形态导致的覆盖参数，并提供必须检查的字段和 `successCriteria`；完整示例里还包含 flat/nested/mixed/output-inside-input 的 `sourceLayoutMismatchSummary` 对照。
- `get_agent_guidance` 包含 `safeInvocationTemplates[]`，提供运行时检查、单字体处理、输入预检、目录不匹配整理计划、copy-only 暂存整理、批量 dry-run 预览、已审查计划后的真实批量处理和紧凑输出审计等可复制起步调用。每个模板都会声明是否写文件、是否可能修改源文件、必须检查的 `inspectFields` 和继续前要满足的 `successCriteria`；模板会尽量保持最小参数，`workflowPreset` 已提供的默认项可从 `workflowPresets[]` 查看。
- `get_agent_guidance` 包含 `recommendedWorkflowPlan`，这是当前 `workflow` 的有序路线图。它会引用安全模板 ID，把输入预检、目录形态决策、预览、审查后写入和输出审计串起来；每个步骤和决策点都会列出 `inspectFields` 与 `successCriteria`，但仍不替代实际工具响应检查。
- `get_agent_guidance.nextToolDecisionSummary` 是更短的“下一步该调用哪个工具”索引：它会按 setup、单字体处理、输入预检、目录结构判断、copy-only 暂存、批量预览、审查后写入和输出审计给出首选工具与模板 ID。其 `workflowQuickStart` 会直接给出当前 `workflow` 推荐的第一条可复制调用，`quickStartCallExamples[]` 则由 `safeInvocationTemplates[]` 派生，用于给出最常见路线的最小调用参数；它只用于快速路由，不能替代实际工具响应字段和 `successCriteria`。
- 当 agent 只想快速知道目录整理工作流的下一步时，可调用 `get_agent_guidance` 并传入 `workflow: "organize"` 与 `sections: ["workflow"]`，然后读取 `nextToolDecisionSummary.workflowQuickStart.recommendedCallExample`。对于目录结构不确定的来源，这个推荐首步应是 `organize_font_directory` 的 `workflowPreset: "safe-preview"`：不写文件、`sourceDestructive: false`，只生成整理/预览路线。
- `get_agent_guidance` 会返回 `errorResponseCatalog`，说明什么时候应把 MCP 错误文本当作 JSON 解析，以及如何按 `errorType: "configuration-error"` 路由 `FontSplitConfigurationError`、按 `errorType: "batch-split-error"` 路由 `BatchSplitError`，以及如何处理普通非结构化错误。
- 需要错误响应、warning code 或响应字段的完整机器可读目录时，调用 `get_agent_guidance` 并设置 `detailLevel: "full"`，或只请求 `sections: ["error-catalog", "warning-catalog", "field-catalog"]`。
- 当安装或运行环境不确定时，使用 `get_runtime_status`；它会只读检查解析后的工作区、Node engine 兼容性、包版本、cn-font-split 运行时版本和 WASM 文件，并返回便于 agent 执行/提示的 `recommendedActions[]`。
- 当源目录是扁平、混合或与预期 family 分组不一致时，先用 `organize_font_directory` 的默认 `dryRun: true` 生成整理计划。它对源目录非破坏：不会移动或删除源文件；真正执行时也只是复制选中的字体到 `outputDir`。响应里的 `sourceSafetyDecision` 是第一层源安全结论，先看它，再看 `safetySummary` 和详细 warning。如果不确定该直接对原目录做批量预览，还是先复制到暂存目录，调用 `get_agent_guidance` 并请求 `sections: ["examples"]`，查看 `source-layout-mismatch-comparison`。
- 批量扫描会跳过依赖目录、已生成输出目录、`__MACOSX` 和 AppleDouble `._*` 资源叉文件。
- `.woff` / `.woff2` 输入会先解压成 sfnt-like 数据，再进入处理流程。
- 批量模式会按照 `batchDedupeMode` 去重；默认 `font-identity` 会在任意格式之间比较等价字体身份，并按 `.otf` → `.ttf` → `.woff2` → `.ttc` → `.otc` → `.woff` 的优先级保留一个代表。
- 批量分组默认是 `batchGroupBy: "auto"`，会保留之前的目录优先行为。
- 批量命名默认是 `batchNamingMode: "numeric-suffix"`：先用裸 `fontBaseName`，只有真实冲突时才分配稳定的 `-1`、`-2`、`-3`。
- 当 OTF / TTF 仅容器不同但字体身份相同时，批量模式会去重并只保留一个代表。
- 批量处理不会移动、删除或重写源字体文件：`sourceDestructive` 应始终为 `false`，`sourceSafetyDecision.sourceBackupRequired` 应为 `false`。如果 `outputRoot` 位于 `inputDir` 内，真实写入仍会落在输入目录树里，因此描述“源目录树无写入”前必须检查 `sourceSafetyDecision`、`writesSourceTree` 和 `outputTreeInsideInputTree`。
- 批量增量跳过默认是 `skipMode: "manifest"`，会用 `split-meta.json` 比较源文件和有效配置。
- 只有明确需要重跑时才使用 `skipMode: "force"`；默认 manifest 跳过是安全的增量路径。
- 批量错误处理默认是 `batchErrorMode: "fail-after"`，会处理完选中的字体后把任何单字体错误升级为批量错误。
- 删除超大 `kern` 表必须显式设置 `oversizedKernAction: "strip"`。
- 分割失败后回退为单 WOFF2 必须显式设置 `splitFailureAction: "single-woff2"`。
- 小字形字体由 `smallGlyphAction` 控制：`subset`、`single-woff2` 或 `copy-original`。

## 输出目录结构

正常分片输出：

```text
split-output/
  <FamilyName>/
    <OriginalFontFile> 或 <OriginalFontFile-1>   # 只有冲突时才追加数字后缀
    <FontBaseName>/ 或 <FontBaseName-1>/         # 只有真实冲突时才追加数字后缀
      *.woff2
      result.css
      index.html?               # testHtml=true 时
      reporter.bin?             # reporter=true 且正常分片时
      index.proto?              # 正常分片路径下由核心工具生成
      split-meta.json           # 本次处理 manifest
```

单 WOFF2 fallback 输出：

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

小字体 `copy-original` 输出：

```text
split-output/
  <FamilyName>/
    <OriginalFontFile> 或 <OriginalFontFile-1>
    <FontBaseName>/ 或 <FontBaseName-1>/
      split-meta.json
```

在批量模式下，默认先使用裸名。只有当同一 family 目录里确实已有别的源文件占用了这个名字时，才会分配 `-1`、`-2` 这类数字后缀，并通过 manifest 在后续重复运行中稳定复用。

`copy-original` 不会生成 `.woff2` 或 `result.css`；它只表示该字体已经被处理流程登记，并明确跳过了分片。

`organize_font_directory` 整理后的暂存结构：

```text
organized-fonts/
  <GroupName>/
    <OriginalFontFile> 或 <OriginalFontFile-1>
  font-organization-manifest.json   # 仅 dryRun=false 时写入
```

这个暂存目录不是拆分结果，也不包含 CSS。它只是一个 copy-only 的整理辅助输出，用于在后续 `split_font_batch` 前准备更稳定的源目录。

## 常见源目录形态

当源目录结构不明确、扁平、混合，或与期望的 family 分组不一致时，优先使用 `organize_font_directory`。保持默认 `dryRun: true`，它只返回整理计划和安全摘要。

扁平 vendor dump：

```text
fonts/
  BrandSans-Regular.ttf
  BrandSans-Bold.otf
  readme.txt
```

推荐首次调用：

```json
{
  "inputDir": "fonts",
  "dryRun": true,
  "parseFonts": true,
  "includePlan": true
}
```

这会读取字体元数据并给出 `batchGroupBy` 建议。如果计划合理，优先复制返回的 `recommendedBatchPreviewArgs` 先对原目录做 `split_font_batch` safe-preview；`recommendedBatchOptions` 只是策略片段，不应单独当作完整安全调用。如果用户希望得到更干净的暂存源目录，再执行 copy-only 整理到 `organized-fonts`。

每个压缩包/家族一个目录：

```text
fonts/
  BrandSans/
    Regular.ttf
    Bold.ttf
  OtherSerif/
    Regular.otf
```

这类目录通常可以直接对 `split_font_batch` 做 dry-run，并设置 `batchGroupBy: "source-dir"`。只有当用户明确想要复制出暂存目录时，才需要整理工具。

根目录和子目录混合：

```text
fonts/
  LooseDisplay.ttf
  BrandSans/
    Regular.ttf
  OtherSerif/
    Regular.otf
```

这是最容易误判的结构。先调用 `organize_font_directory` 并保持 `dryRun: true`，重点检查 `safetySummary`、`layout.layoutKind`、`sourceLayoutMismatchSummary`、`recommendedBatchOptions`、`recommendedBatchPreviewArgs`、`organizationWarnings`、`sourceDestructive`、`writesSourceTree` 和 `outputTreeInsideInputTree`。

超大或嘈杂字体库的第一遍扫描：

```json
{
  "inputDir": "fonts",
  "dryRun": true,
  "parseFonts": false,
  "includePlan": false
}
```

这只适合快速了解目录形态。由于跳过了字体解析，`validFontCount` 和 `invalidFontCount` 是 `null`，没有 `glyphCount`，identity 去重也会退化为基于路径的模式。依赖坏字体数量、metadata family 分组或 identity 去重前，应使用 `parseFonts: true` 再跑一次。

## 关键参数

### 单文件和批量通用参数

| 参数 | 可选值 | 默认值 | 含义 |
|------|--------|--------|------|
| `oversizedKernAction` | `preserve`, `strip` | `preserve` | 默认只检测超大 `kern`，只有显式设置 `strip` 时才删除。 |
| `smallGlyphAction` | `subset`, `single-woff2`, `copy-original` | `subset` | 当 `glyphCount <= smallGlyphThreshold` 时的处理策略。 |
| `smallGlyphThreshold` | 正整数 | `50` | 小字形策略使用的字形数阈值。 |
| `splitFailureAction` | `error`, `single-woff2` | `error` | 默认暴露 cn-font-split 错误；可显式回退为单 WOFF2。 |

`smallGlyphAction` 说明：

- `subset`：继续尝试正常 cn-font-split 分片。
- `single-woff2`：不做多分片，生成一个 WOFF2 文件和 CSS。
- `copy-original`：复制原字体到输出家族目录，创建字体输出目录，写 `split-meta.json`，不生成 web-font 文件。

### 批量专用参数

| 参数 | 可选值 | 默认值 | 含义 |
|------|--------|--------|------|
| `workflowPreset` | `safe-preview`, `reviewed-write`, `structure-first`, `source-layout`, `metadata-family`, `preserve-all` | 不设置 | 命名配置预设，会先展开为一组批量/整理参数；省略时使用原始工具默认值，显式传入的具体参数仍会覆盖预设。 |
| `skipMode` | `manifest`, `force` | `manifest` | 批量模式如何判断已有输出是否可跳过。 |
| `batchGroupBy` | `auto`, `source-dir`, `font-family` | `auto` | 批量模式如何决定家族目录名。 |
| `batchNamingMode` | `plain`, `numeric-suffix`, `source-suffix` | `numeric-suffix` | 批量模式如何决定每个字体输出目录的命名冲突策略。 |
| `batchDedupeMode` | `none`, `same-path`, `font-identity` | `font-identity` | 批量模式如何在处理前去重；`same-path` 是路径/stem 级策略，`font-identity` 是跨格式语义身份策略。 |
| `batchErrorMode` | `collect`, `fail-fast`, `fail-after` | `fail-after` | 每个字体处理失败时，是收集到响应里，还是为自动化场景直接抛错。 |
| `limit` | 正整数，MCP 最大 `50000` | `20` | 去重后最多处理多少个字体。全量跑时需要显式调高。 |
| `maxFiles` | 正整数，MCP 最大 `50000` | `5000` | 扫描阶段最多读取多少个源文件，再过滤字体扩展名。 |
| `includeResults` | `true`, `false` | `true` | 是否返回每个字体的详细 `results[]`。大批量只需要摘要和错误时可设为 `false`。 |
| `dryRun` | `true`, `false` | `false` | 只预览扫描、去重、命名和 skip 决策，不写任何输出文件。 |

`skipMode` 说明：

- `manifest`：读取 `split-meta.json`，比较源文件路径、大小、mtime、有效参数、manifest 版本和工具版本。
- `force`：永远不跳过，始终重跑。

`workflowPreset` 说明：

- `safe-preview`：无写入预览。批量时等价于 `dryRun: true`、`includeResults: true`、`skipMode: "manifest"`、`batchErrorMode: "fail-after"` 等安全默认值；整理时等价于解析字体并返回完整计划。
- `reviewed-write`：用于已经审查过预览后的真实写入。批量会写拆分输出；整理会 copy-only 写入 `outputDir`，仍不会改动源文件。
- `structure-first`：无写入、偏结构/路径的快速第一遍扫描，适合超大或嘈杂目录；批量侧使用 `same-path` 去重，目录整理侧跳过字体元数据解析。
- `source-layout`：优先按源目录分组，适合每个压缩包/家族一个目录的来源结构。
- `metadata-family`：优先按字体内部 family metadata 分组，适合扁平 vendor dump。
- `preserve-all`：关闭预处理去重，并保留 `numeric-suffix` 命名，适合必须保留每个源字体文件的场景。

预设只是起点，不是锁定配置；需要原始工具默认值时直接省略 `workflowPreset`。例如 `{"workflowPreset":"safe-preview","batchDedupeMode":"none"}` 会保留无写入预览，但覆盖为不去重。

在批量模式下，输出目录 key 默认就是裸 `fontBaseName`；只有当该名字已经被别的源文件占用时，工具才会分配稳定的数字后缀，并在后续 rerun 中通过 manifest 复用。

`batchGroupBy` 说明：

- `auto`：嵌套字体使用第一层源目录名；输入根目录下的字体使用内部 family metadata。
- `source-dir`：尽量按源目录名分组。
- `font-family`：尽量按字体内部 family metadata 分组，无法提取时回退 basename。

`batchNamingMode` 说明：

- `plain`：始终使用裸 `fontBaseName` 和原始文件名，不自动追加冲突后缀。
- `numeric-suffix`：默认先用裸名；只有当该名字已经被别的源文件占用时，才分配稳定的 `-1`、`-2` 等数字后缀。
- `source-suffix`：显式使用基于来源的 `--<ext>-<hash8>` 后缀，让不同来源在未真正冲突前也先分开。

`batchDedupeMode` 说明：

- `none`：完全不去重。
- `same-path`：只对同一源路径 stem 的多格式文件去重；它是快速路径级策略，不会跨目录判断语义等价字体。
- `font-identity`：按归一化后的字体身份跨格式去重，保留优先级最高的代表。身份键优先使用 typographic family/subfamily，缺失时回退到 legacy family/subfamily，再回退到 full name 或 PostScript name；`glyphCount` 只作为诊断信息，不会把等价的 OTF/TTF/WOFF 输入拆开。
- 如果身份解析失败，去重会回退到基于路径的 key，并把真实错误留给处理阶段和 `batchErrorMode`。

`batchErrorMode` 说明：

- `collect`：继续处理，并返回 `ok: true`、`errors[]` 和 `errorCount`；仅在调用方会主动检查错误列表时使用。
- `fail-fast`：遇到第一个单字体错误就抛错。
- `fail-after`：继续处理选中的字体，最后如果存在任何单字体错误则抛错。

当 `fail-fast` 或 `fail-after` 通过 MCP 抛错时，错误文本是 JSON，包含 `ok: false`、`name`、`errorType`、`error` 和 `details`；AI agent 应优先按 `errorType: "batch-split-error"` 路由，再解析 `details.errors[]` 和 `details.summary`。

## 如何解释返回结果

`split_font` 返回更明确的分类字段：

- `outputMode`：`subset`、`single-woff2` 或 `copy-original`
- `resultType`：`subset`、`single-woff2-small-glyph`、`single-woff2-split-failure`、`single-woff2` 或 `copy-original-small-glyph`
- `performedSplit`：只有真正执行多子集分割时才为 true
- `usedFallback`：单 WOFF2 fallback 路径为 true
- `skipped`：主动绕过分割器时为 true
- `skipReason`：主动绕过或 fallback 的原因
- `warnings`：非透明行为的人类可读说明
- `manifestPath` / `manifestWritten`：manifest 输出状态

`inspect_font_inputs` 是不写输出的输入预检：

- `inputCountGuide`：解释扫描计数、`maxFilesHit`、`filesIncluded` 和非字体文件处理方式的紧凑指南
- `supportedFontCount`、`validFontCount`、`invalidFontCount`
- `unsupportedFileDecision`：从 `unsupportedFileSummary` 派生的快速判断，直接说明是否有忽略文件、是否包含压缩包、是否存在 `.zip` / `.txt` 之外的噪声，以及这些文件是否会被解压、复制或拆分
- `unsupportedFileSummary`：所有被忽略的非字体文件摘要，包含精确 `unsupportedFileSummary.byExtension[]`、概览 `unsupportedFileSummary.byCategory[]`、带处理语义的 `unsupportedFileSummary.categoryDetails[]`、总体 `unsupportedFileSummary.handlingSummary`、无扩展 `<none>` 计数、`unsupportedFileSummary.examples[]` 和 `unsupportedFileSummary.examplesTruncated`
- `missingIdentityCount`
- `maxFilesHit`：只有当 `maxFiles` 之外确实还有更多文件时才为 true
- `inspectionWarningCount`、`inspectionWarnings[]`，每项包含机器可读的 `code` 和 `message`
- `invalidFonts[]`
- 可选 `files[]` 条目，包含 `container`、`identity`、`identityKey`、`identityBasis` 和 `glyphCount`

`split_font_batch` 还会返回聚合统计，例如：

- `resultsIncluded`：是否包含每个字体的 `results[]` 详情
- `inputCountGuide`、`scannedFileCount`、`maxFiles`、`maxFilesHit`
- `unsupportedFileDecision`：快速判断忽略文件是否存在、是否包含压缩包或更复杂的非字体噪声，以及“不解压、不复制、不拆分”的处理结论
- `unsupportedFileSummary`：所有已扫描但被忽略的非字体文件摘要，包含精确 `unsupportedFileSummary.byExtension[]`、概览 `unsupportedFileSummary.byCategory[]`、带处理语义的 `unsupportedFileSummary.categoryDetails[]`、总体 `unsupportedFileSummary.handlingSummary`、无扩展 `<none>` 计数、`unsupportedFileSummary.examples[]` 和 `unsupportedFileSummary.examplesTruncated`；压缩包会归入 `archive` 并保持忽略
- `dryRun`、`plannedCount`、`wouldProcessCount`、`planIncluded`
- `batchWarningCount`、`batchWarnings[]`，每项包含机器可读的 `code` 和 `message`
- `batchPolicySummary`：本次实际采用的批量分组、命名、去重和错误策略摘要，并附带对应 `batchPolicyGuide` 成功标准
- `batchDecision`：批量响应的紧凑主线路由建议，用于区分 dry-run 计划审查、提高 `maxFiles` 重跑、错误检查、输出审计、已有输出跳过和空批量等分支
- `batchErrorMode`、`errorCount`、`errors[]`
- `sourceSafetyDecision`：第一层源安全结论。它直接说明源字体是否会被移动/删除/重写、是否需要源文件备份、是否写文件、写入是否位于输入目录树内，以及写入后是否需要输出审计；它不替代 `safetySummary` 的细节字段。
- `safetySummary`：批量源目录/输出目录安全摘要。判断批量调用是否写文件、是否影响源目录树时先看 `sourceSafetyDecision`，再看它；源字体文件应始终保留，写入范围只限 `outputRoot`。
- `sourceDestructive`：批量工具应始终返回 `false`
- `writesSourceTree`：只有真实批量写入且 `outputRoot` 位于 `inputDir` 内时才为 `true`
- `writesOutputTree`：`dryRun: false` 时为 `true`
- `outputTreeInsideInputTree`：`outputRoot` 是否位于或等于 `inputDir`；为 `true` 时，后续宽泛扫描可能再次处理生成输出
- `mayOverwriteOutputTree`：非 dry-run 且有选中字体时为 `true`，表示可能替换 `outputRoot` 中已有输出
- `skippedExisting`、`skippedByManifest`
- `reprocessedBecauseSourceChanged`、`reprocessedBecauseOptionsChanged`
- `processingSummary.subsetOutputs`
- `processingSummary.singleWoff2Outputs`
- `processingSummary.copyOriginalOutputs`
- `processingSummary.smallGlyphDowngrades`
- `processingSummary.smallGlyphCopyOriginals`
- `processingSummary.failureFallbacks`

应把 `batchDecision` 当作路由提示，而不是成功证明。它帮助 agent 选择下一步分支；真正继续前仍要检查 `batchWarnings[]`、`errors[]`、`recommendedNextActions[]`，以及写入输出后的审计字段。

`organize_font_directory` 会返回源目录安全性摘要和可选整理计划：

- `sourceSafetyDecision`：第一层源安全结论。整理工具的 `sourceBackupRequired` 应为 `false`，因为它不会移动、删除或重写源字体；`dryRun: false` 也只是 copy-only 写入 `outputDir`。
- `safetySummary`：紧凑的源目录/输出目录安全摘要。判断整理工具是否写文件、是否影响源目录树时先看 `sourceSafetyDecision`，再看它；它会确认源文件会被保留，并把任何覆盖风险限定到 `outputDir`。
- `operationMode`：默认 dry-run 时为 `plan-only`，`dryRun: false` 时为 `copy-only`
- `sourceDestructive`：恒为 `false`
- `writesSourceTree`：只有真实整理复制且 `outputDir` 位于 `inputDir` 内时才为 `true`
- `writesOutputTree`：只有 `dryRun: false` 时为 true
- `outputTreeInsideInputTree`：`outputDir` 是否位于或等于 `inputDir`；为 `true` 时，后续宽泛扫描可能再次处理整理副本
- `mayOverwriteOutputTree`：只有 `dryRun: false` 且 `overwriteExisting: true` 时为 true
- `sourceFilesPreserved`：恒为 `true`
- `parsedFontMetadata`：`parseFonts: false` 时为 false；此时 `validFontCount` / `invalidFontCount` 是 `null`
- `effectiveBatchDedupeMode`、`dedupeLimitedByParsing`：说明 identity 去重是否真正可用
- `batchPolicySummary`：本次整理调用采用的分组、命名和去重策略摘要；当 `parseFonts: false` 限制 identity 去重时，`effectiveValues.batchDedupeMode` 会显示实际回退值
- `layoutDecision`：顶层紧凑路线摘要，汇总 `shortAnswer`、`layoutKind`、推荐分组、主线路由、源安全信号、原目录安全预览状态和 copy-only 暂存状态。先看其中的 `layoutDecision.directoryHandling`，它会用 `recommendedMode` 和 `shortAnswer` 直接回答“原目录能否预览、是否要 copy-only 暂存、下一步用哪个输入目录”。它适合 agent 先快速判断“下一步看哪里”，但不是整理或拆分已经成功的证明。
- `directoryWorkflowSummary`：本次响应里的目录工作流导航摘要，用来串起布局复核、安全批量预览、可选 copy-only 暂存、reviewed 批量写入和必须执行的输出审计。它会重复源目录安全信号、路线选择、`planVisibility`、`workflowSteps[]`、成功标准和非直觉行为提示。
- `sourceLayoutMismatchSummary`：直接回答“当前源目录结构和推荐批量分组是否匹配、能否直接对原目录做安全预览、copy-only 暂存是不需要/可选/已经写出、为什么暂存不会破坏源文件”等常见判断。其中的 `sourceLayoutMismatchSummary.decisionChecklist` 是更短的 agent 决策清单，用于集中检查源安全、直接预览是否就绪、copy-only 暂存需求、plan 可见性、warning 复核和写入后的输出审计。任何目录路由相关的 `inspectFields` / `mustInspectFields` / `responseFields` 只要列出 `sourceLayoutMismatchSummary`，也会同时列出 `sourceLayoutMismatchSummary.decisionChecklist`。
- `directoryWorkflowSummary.planVisibility`：说明本次响应是否包含详细 `plan[]`。当 `includePlan: false` 时，`plan[]` 会被省略，但 `planActionSummary`、`layoutDecision`、`layoutDecision.directoryHandling`、`organizationDecision`、`sourceLayoutMismatchSummary`、`recommendedNextActions[]`、`organizationWarnings[]`、`layout`、`safetySummary` 和 `batchPolicySummary` 仍可用于大目录 triage；如果写入前需要确认每个文件的目标路径，应按其中的 `rerunWithPlanArgs` 重新 dry-run。
- `inputCountGuide`：在信任整理计划前，解释源目录扫描计数、计数完整性和非字体文件处理方式
- `unsupportedFileDecision`：快速判断忽略文件是否存在、是否包含压缩包或更复杂的非字体噪声，以及这些文件是否会被解压、复制或拆分
- `unsupportedFileSummary`：所有被忽略的非字体文件摘要，包含精确 `unsupportedFileSummary.byExtension[]`、概览 `unsupportedFileSummary.byCategory[]`、带处理语义的 `unsupportedFileSummary.categoryDetails[]`、总体 `unsupportedFileSummary.handlingSummary`、无扩展 `<none>` 计数、`unsupportedFileSummary.examples[]` 和 `unsupportedFileSummary.examplesTruncated`；源目录混有压缩包、图片、文档或生成产物时优先看它
- `layout.layoutKind`：`empty`、`flat`、`nested` 或 `mixed`
- `recommendedBatchOptions`：根据目录形态给出的后续 `split_font_batch` 策略片段，不是完整安全调用
- `recommendedBatchPreviewArgs`：可直接复制的 `split_font_batch` 无写入预览参数，包含 `inputDir`、`workflowPreset: "safe-preview"` 和必要的目录形态覆盖项
- `recommendedNextActionCount`、`recommendedNextActions[]`：面向 agent 的机器可读后续动作，每项包含 `id`、`priority`、`tool`、`reason`、可选 `suggestedArgs`、`inspectFields` 和 `successCriteria`
- `organizationDecision`：整理响应的紧凑主线路由建议，用于区分应重扫、开启字体解析、处理坏字体、预览原目录、审查 mixed layout，还是预览已复制的暂存目录
- `organizationWarningCount`、`organizationWarnings[]`，每项包含机器可读的 `code` 和 `message`
- `planActionSummary`：始终返回；按动作统计 `would-copy`、`copied`、`skipped-duplicate`、`skipped-invalid`、`skipped-target-exists` 和 `error` 等数量，即使 `includePlan: false` 省略明细也会保留
- 可选 `plan[]` 条目，包含 `source`、`targetPath`、`groupName`、`action`、`identityKey` 和 `glyphCount`

应把 `layoutDecision`、`layoutDecision.directoryHandling`、`organizationDecision`、`directoryWorkflowSummary`、`sourceLayoutMismatchSummary` 和 `sourceLayoutMismatchSummary.decisionChecklist` 当作主线提示，而不是成功证明。它们帮助 agent 选择下一步分支；真正继续前仍要检查 `recommendedNextActions[]`、`organizationWarnings[]`、`planActionSummary`、`directoryWorkflowSummary.planVisibility` 和可用时的 `plan[]`。
应把 `recommendedNextActions[]` 当作检查清单，而不是自动执行结果。Agent 仍然要检查每项里的 `inspectFields`，并满足 `successCriteria` 后再继续或报告完成，尤其是当某个动作建议写文件、审计输出或用不同扫描/解析上限重跑时。`suggestedArgs` 会优先使用 `workflowPreset`，只保留相对 preset 的差异覆盖。批量 dry-run 可能返回 `run-reviewed-batch-write`；真实批量写入可能返回 `audit-split-output`，其建议的下一步工具是 `inspect_split_output`。
应把 `planActionSummary` 当作压缩概览，而不是无需审查详细计划就可以写文件的许可。

`inspect_split_output` 保留基础文件统计，并增加结构化输出清单：

- `maxFiles` 可以调整输出扫描上限；默认是 `200000`，避免大型批量输出在检查时被截断。
- `maxFilesHit` 只有当 `maxFiles` 之外确实还有更多输出文件时才为 true。
- `outputStructureDecision` 是从 `auditStatus`、`auditBlockingReasons`、`maxFilesHit` 和 `structureSummary` 派生的快速判断；先看 `status`、`recommendedAction`、`blockingReasonCodes` 和 `issueCodes`。
- `auditStatus` 是紧凑审计门禁，取值为 `pass`、`action-required` 或 `incomplete`；真实输出审计只有在它为 `pass` 时才应视为完成。
- `auditPassed` 是 `auditStatus === "pass"` 的布尔快捷字段。
- `auditBlockingReasons[]` 会列出阻止审计通过的机器可读原因；结构问题会带上来自 `structureSummary.issues[]` 的 `issueCodes`。
- `includeFiles: false` 会省略扁平 `files[]`，但保留摘要计数。
- `includeFamilies: false` 会省略结构化 `families[]`，但保留 family 和输出模式计数。
- `inspectionWarningCount` 和 `inspectionWarnings[]` 会用机器可读 `code` 汇总截断、详情数组省略、legacy 输出推断和结构问题等状态。
- `structureSummary` 检查输出目录是否符合文档化结构；真实批量写入后应调用 `inspect_split_output`，只有 `outputStructureDecision.status: "pass"`、`auditStatus: "pass"`、`auditPassed: true`、`structureSummary.conforms: true` 且 `maxFilesHit: false` 时，才表示没有发现杂项文件、manifest 缺失或输出模式文件缺失等结构问题。
- `familyCount`
- `fontEntryCount`
- `manifestCount`
- `subsetOutputCount`
- `singleWoff2OutputCount`
- `copyOriginalOutputCount`
- `legacyOutputCount`
- `families[]`

## 示例

保守单文件行为：

```json
{
  "fontPath": "SomeFamily/SomeFont.ttf"
}
```

宽松单文件行为：

```json
{
  "fontPath": "SomeFamily/SomeFont.ttf",
  "oversizedKernAction": "strip",
  "smallGlyphAction": "single-woff2",
  "splitFailureAction": "single-woff2"
}
```

小字体 copy-original 行为：

```json
{
  "fontPath": "SomeFamily/AsciiOnly.ttf",
  "smallGlyphAction": "copy-original"
}
```

适合“每个压缩包解压成同名字体家族目录”的批量行为：

```json
{
  "inputDir": ".",
  "outputRoot": "split-output",
  "batchGroupBy": "source-dir",
  "batchNamingMode": "numeric-suffix",
  "batchDedupeMode": "font-identity",
  "skipMode": "manifest",
  "smallGlyphAction": "copy-original"
}
```

全量字体库批量处理，并保持响应简洁：

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

预览一次全量处理，但不写文件：

```json
{
  "inputDir": ".",
  "outputRoot": "split-output",
  "limit": 50000,
  "maxFiles": 50000,
  "dryRun": true,
  "includeResults": true,
  "batchNamingMode": "numeric-suffix",
  "batchDedupeMode": "font-identity",
  "skipMode": "manifest"
}
```

预览一次非破坏性的目录整理计划：

```json
{
  "inputDir": ".",
  "outputDir": "organized-fonts",
  "dryRun": true,
  "includePlan": true,
  "batchGroupBy": "auto",
  "batchNamingMode": "numeric-suffix",
  "batchDedupeMode": "font-identity"
}
```

预览一次不读取字体元数据的结构优先整理计划：

```json
{
  "inputDir": ".",
  "outputDir": "organized-fonts",
  "dryRun": true,
  "parseFonts": false,
  "includePlan": true
}
```

执行已经审阅过的 copy-only 整理计划：

```json
{
  "inputDir": ".",
  "outputDir": "organized-fonts",
  "dryRun": false,
  "batchGroupBy": "auto",
  "batchNamingMode": "numeric-suffix",
  "batchDedupeMode": "font-identity",
  "overwriteExisting": false
}
```

按字体 metadata 分组：

```json
{
  "inputDir": ".",
  "outputRoot": "split-output",
  "batchGroupBy": "font-family",
  "batchNamingMode": "numeric-suffix",
  "batchDedupeMode": "font-identity",
  "skipMode": "manifest"
}
```

使用裸名并仅做路径级去重：

```json
{
  "inputDir": ".",
  "outputRoot": "split-output",
  "batchNamingMode": "plain",
  "batchDedupeMode": "same-path"
}
```

完全关闭去重：

```json
{
  "inputDir": ".",
  "outputRoot": "split-output",
  "batchDedupeMode": "none"
}
```

## 安装

需要 Node.js 18 或更高版本。

```sh
git clone https://github.com/WenZhimo/mcp-font-split.git
cd mcp-font-split
npm install
```

如果你的环境禁用了 npm lifecycle scripts，可以先安装依赖，再下载 cn-font-split WASM 后端：

```sh
npm install --ignore-scripts
npm run install:wasm
```

如果需要固定特定 cn-font-split 运行时版本，可以使用 `npm run install:wasm -- --version 7.6.8`。

## 使用方式

### 作为 MCP Server

```sh
claude mcp add font-split -- node "/path/to/mcp-font-split/src/server.js"
```

### 独立运行

```sh
npm start
npm run batch:run -- . split-output 50000 50000 --dry-run
```

`batch:run` 是给 agent 和维护者使用的安全批量辅助入口。默认真实运行使用 `workflowPreset: "reviewed-write"`；带 `--dry-run` 或 `FONT_SPLIT_DRY_RUN=true` 时使用 `workflowPreset: "safe-preview"`。位置参数依次是 `inputDir`、`outputRoot`、`limit` 和 `maxFiles`；也可以用 `FONT_SPLIT_INPUT_DIR`、`FONT_SPLIT_OUTPUT_ROOT`、`FONT_SPLIT_LIMIT`、`FONT_SPLIT_MAX_FILES` 和 `FONT_SPLIT_WORKFLOW_PRESET` 提供相同配置。`FONT_SPLIT_WORKFLOW_PRESET` 只接受 `safe-preview`、`reviewed-write`、`structure-first`、`source-layout`、`metadata-family`、`preserve-all`；`default` 不是有效值，需要默认行为时不要设置这个环境变量。环境变量覆盖项只有显式设置时才会覆盖 preset 默认值，包括 `FONT_SPLIT_DRY_RUN`、`FONT_SPLIT_INCLUDE_RESULTS`、`FONT_SPLIT_SKIP_MODE`、`FONT_SPLIT_BATCH_GROUP_BY`、`FONT_SPLIT_BATCH_NAMING_MODE`、`FONT_SPLIT_BATCH_DEDUPE_MODE`、`FONT_SPLIT_BATCH_ERROR_MODE`、`FONT_SPLIT_SPLIT_FAILURE_ACTION` 和 `FONT_SPLIT_CHUNK_SIZE`。这些枚举型、布尔型或数字型配置如果填了无效值，会以 `BatchRunConfigurationError` 失败并返回允许值或期望类型，而不是静默回退；枚举型环境变量错误还会返回 `details.source: "env"`、`details.targetField` 和 `details.allowedValues`，方便 agent 把环境变量映射回核心工具参数。位置参数里的 `limit` / `maxFiles` 也必须是正整数。它会在控制台摘要里打印 `batchWarnings[]` 的 code/message；`npm run smoke:batch-run` 会验证 `--dry-run`、`FONT_SPLIT_WORKFLOW_PRESET`、无效 preset 拒绝、无效环境变量拒绝、无效数字位置参数拒绝和 `FONT_SPLIT_INCLUDE_RESULTS` 的覆盖行为。

需要给 agent 或脚本稳定解析时，使用 `--json` 或 `FONT_SPLIT_JSON=true`。JSON 模式不会输出进度条或人类摘要；成功时 stdout 是 `{ ok: true, runner, options, result }`，失败时 stdout 是 `{ ok: false, runner, options, name, errorType, error, details? }` 且进程退出码仍为非零。`errorType` 是最短路由字段：配置错误使用 `configuration-error`，批量处理错误使用 `batch-split-error`。大批量运行只需要判断状态、计数、warning、error 和后续动作时，可使用 `--json-summary` 或 `FONT_SPLIT_JSON_SUMMARY=true`；它会省略可能很大的 `planned[]` / `results[]` 明细，返回 `{ ok, runner, options, summary }` 或带 `errorType` 的紧凑错误摘要。

### Smoke 检查

```sh
npm run check
npm run check:compact
npm run check:syntax
npm run check:smoke
npm run smoke
npm run smoke:agent-guidance
npm run smoke:runtime-status
npm run smoke:incremental
npm run smoke:font-inputs
npm run smoke:scan-limits
npm run smoke:organize
npm run smoke:organize-copy
npm run smoke:organize-valid
npm run smoke:organize-structure
npm run smoke:organize-output-inside
npm run smoke:batch-run
npm run smoke:batch-dry-run
npm run smoke:batch-defaults
npm run smoke:real-corpus-suite -- <字体语料目录>
npm run smoke:real-corpus-readonly -- <字体语料目录>
npm run smoke:real-corpus-targets -- <字体语料目录>
npm run smoke:real-corpus-integration -- <字体语料目录>
npm run smoke:inspect-compact
npm run smoke:mcp-error
npm run smoke:api-docs
npm run smoke:behavior-docs
npm run smoke:inspect
npm run smoke:small-copy-original
```

`npm run check` 是推荐给 AI agent / CI 的入口。它会运行语法检查和一组能自造最小输入的 smoke 场景，不依赖真实字体库。需要低噪声输出时使用 `npm run check:compact`；它顺序运行同一组 syntax/smoke 门禁，成功时只打印步骤摘要和 `compact-check-result`，失败时返回失败步骤的 stdout/stderr 尾部。需要纯 JSON 给 agent 解析时使用 `npm run --silent check:compact -- --json`。

`smoke:real-corpus-suite` 是功能改动告一段落时推荐的本机真实语料可靠性门禁，不包含在 `npm run check` 中。`get_agent_guidance.localVerificationOutputGuide` 是解读这个本地命令输出的机器可读伴随指南。suite 会顺序运行只读全库预览、`smoke:real-corpus-targets` 和 `smoke:real-corpus-integration`，覆盖全库 compact 扫描、代表性只读抽样、目录整理预览、源安全结论、源目录结构判断摘要、copy-only 写入、单字体拆分、批量写入和输出结构审计。默认输出为 compact，只打印每个子检查的成功状态、耗时、人类可读 `real-corpus suite summary` 和低噪声最终 JSON；JSON 里的 `humanSummary` 会重复这组短摘要，便于 agent 直接读取。最终 JSON 还包含顶层 `reliabilityGateDecision` 和 `corpusCountGuide`：先检查 `reliabilityGateDecision.status`、`reliabilityGatePassed`、`blockingReasonCodes`、`fullCorpusFontCountField` 和 `targetCountsAreFullCorpusCounts`，再用 `corpusCountGuide.fullCorpus` / `corpusCountGuide.representativeTargets` 区分“全库扫描数量”和“代表性抽样目标数量”。`status: "pass"` 表示代表性功能链通过，不表示每个字体目录都已人工验收。最终总览里的 `testScope` 会把范围拆成 `corpusScan`（全库根扫描）、`targetSampling`（固定回归点 + 自适应代表性抽样）和 `representativeWriteAudit`（一个真实写入/审计样本），`coverageSummary` 会直接列出全库字体/忽略文件计数、抽样目标数量、已选目标、代表性写入审计状态，以及省略大证据的 `functionalCoverage[]` 功能覆盖清单；其中 `input-count-guide`、`source-safety-decision`、`source-layout-mismatch-summary` 和 `layout-decision-route-summary` 会确认真实语料路径实际检查了 `inputCountGuide`、`sourceSafetyDecision`、`sourceLayoutMismatchSummary` 与 `layoutDecision` 的计数完整性、源文件保留、布局匹配、直接预览、路线摘要和 copy-only 源安全语义。默认 JSON 只保留 `runSummaries[]`，并通过 `omittedDetailFields` 标明省略了子检查详情和大块 evidence；需要展开完整子检查输出时加 `--verbose`，或设置 `FONT_SPLIT_REAL_CORPUS_SUITE_VERBOSE=true`。它使用真实复杂语料证明功能链可靠，不是逐个字体目录人工验收。可选参数为 `<字体语料目录> [maxFiles] [targetLimit] [integrationLimit] [sampleCount] [--verbose]`。

`coverageSummary.unsupportedFileCategoryCoverage` 会把忽略文件覆盖面单独列出，包括类别数、扩展名数，以及 `.zip` / `.txt` 之外的扩展名类型数；`coverageSummary.outputStructureAuditSummary` 会单独列出代表性单字体写入和批量写入的 `outputStructureDecision`、`auditStatus`、`auditPassed` 与 `structureSummary.conforms`。这两个字段用于快速确认“忽略统计不是只看压缩包/文本文件”和“输出目录结构已经被审计”。

`smoke:real-corpus-readonly` 是显式的本机真实语料只读检查，不包含在 `npm run check` 中。它会把传入目录作为 `FONT_SPLIT_ROOT`，先对语料根目录运行 `includeFiles:false` 的 `inspect_font_inputs`，再自动选择一个含字体的样本目录执行 `structure-first` 的 `organize_font_directory` 和无写入 `split_font_batch` 预览检查。它会验证全库范围的 `unsupportedFileSummary`、`sourceLayoutMismatchSummary`、`recommendedBatchPreviewArgs`、批量 `recommendedNextActions` 和安全字段，不会创建输出目录。可选第二个参数指定样本目录；可选第三个参数覆盖 `maxFiles`（默认 `50000`）。这个检查的目标是用复杂真实语料覆盖发现、统计和预览路径，不是逐个字体目录做验收。

`smoke:real-corpus-targets` 是显式的真实语料定向回归和自动抽样检查，也不包含在 `npm run check` 中。默认会先保留 `aexpective`、`tiny5`、`agu_display` 和 `architectural` 这些已知问题家族作为固定回归点，再从语料根目录自动选择若干有代表性的顶层字体目录，覆盖字体数量较多、格式组合较多、非字体噪声较多或 WOFF/WOFF2 较多的场景。它验证目录结构建议、`font-identity` 去重、默认命名不混入 `source-suffix`、固定回归样本不出现意外数字后缀，以及 `run-reviewed-batch-write` 后续动作，同时不创建任何输出目录。它的目标是用真实复杂语料扩大功能链覆盖面，不是逐目录检查整个语料库。可选参数为 `<字体语料目录> [逗号分隔的目标目录|auto] [maxFiles] [limit] [sampleCount]`；默认 `sampleCount` 为 `10`，也可用 `FONT_SPLIT_REAL_CORPUS_TARGET_SAMPLE_COUNT` 设置。

`smoke:real-corpus-integration` 是显式的真实语料代表性写入/审计集成检查，也不包含在 `npm run check` 中。它会检查运行时和 agent 指南，对语料根目录做 compact 输入扫描，选择一个真实样本目录，依次运行目录整理 dry-run、目录整理 copy-only 写入、单字体 `split_font` 写入、批量 dry-run、批量 reviewed-write 和 `inspect_split_output` 输出审计。它只会删除并重建传入语料目录下生成用的 `.font-split-*` 输出根，不会移动、删除或重写源字体。可选参数为 `<字体语料目录> [样本输入目录] [输出根目录] [maxFiles] [limit]`；默认输出根是 `font-split-mcp/.font-split-real-corpus-integration-output`。

`smoke:api-docs` 会启动 MCP server 读取真实工具 schema，并检查 `API.md` / `API.zh-CN.md` 是否覆盖所有工具、输入参数、`get_agent_guidance` section、`workflowPreset` 和关键安全/审计字段。它包含在 `npm run check` 中，用来防止实现变化后 API 文档静默漂移。

`smoke:behavior-docs` 会检查 `BEHAVIOR.zh-CN.md` 是否覆盖当前工具清单、`workflowPreset`、关键安全/审计字段、批量调试事件和高风险 warning code。它包含在 `npm run check` 中，用来防止行为说明漏掉反直觉或 agent 容易误判的行为。

`smoke:small-copy-original` 验证的是 `copy-original` 小字体策略。`smoke:incremental` 也会额外打印一个示例 `splitDir`，用于确认新的批量命名在重复运行时仍然稳定。

### 环境变量

| 变量名 | 说明 |
|--------|------|
| `FONT_SPLIT_ROOT` | 字体工作区根目录。请根据自己的字体存放位置显式设置；未设置时默认使用 MCP Server 进程启动时的当前工作目录。如果使用者是 AI，应先询问用户希望使用哪个目录，不要猜测或硬编码用户的本机路径。 |
| `FONT_SPLIT_WASM_PATH` | 可选的自定义 `libffi-wasm32-wasip1.wasm` 运行时路径，支持绝对路径或相对路径。未设置时使用本包依赖中的默认 `cn-font-split/dist` 路径。 |

## 致谢与来源

本项目是以下开源项目的 MCP 封装层：

- **[cn-font-split](https://github.com/KonghaYao/cn-font-split)** — 作者 [KonghaYao](https://github.com/KonghaYao)，核心字体分割引擎。许可证：[Apache License 2.0](https://github.com/KonghaYao/cn-font-split/blob/release/LICENSE)。
- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)** — 作者 Anthropic，MCP 服务器 SDK。许可证：[MIT License](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/LICENSE)。

运行时使用的 WASM 二进制文件 (`libffi-wasm32-wasip1.wasm`) 由 cn-font-split 项目构建和分发，遵循 Apache-2.0 许可证。

## 许可证

本项目使用 [Apache License 2.0](./LICENSE) 许可证。

```
Copyright 2025 WenZhimo

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
