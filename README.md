# mcp-font-split

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
- 提供 `get_agent_guidance`，让 AI 编程助理用机器可读指南、安全调用模板、warning code 含义和响应字段含义选择安全工作流；默认返回紧凑指南，也可按 section 请求完整 catalog。
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
- 对 AI 编程助理来说，当工作流不明确时应先调用 `get_agent_guidance`。它默认返回紧凑指南：推荐工具顺序、默认策略、路径规则、必须检查的响应字段和完成验证清单。响应里的 `guidanceView` 会说明本次包含和省略了哪些 section。
- `get_agent_guidance` 还会返回 `directoryWorkflowDecisionMatrix[]`，这是机器可读的目录工作流决策表，用于在直接批量拆分、dry-run 整理、copy-only 整理和结构优先计划之间做选择。
- `get_agent_guidance` 包含 `safeInvocationTemplates[]`，提供运行时检查、输入预检、目录不匹配整理计划、copy-only 暂存整理、批量 dry-run 预览、已审查计划后的真实批量处理和紧凑输出审计等可复制起步调用。每个模板都会声明是否写文件、是否可能修改源文件。
- 需要 warning code 或响应字段的完整机器可读目录时，调用 `get_agent_guidance` 并设置 `detailLevel: "full"`，或只请求 `sections: ["warning-catalog", "field-catalog"]`。
- 当安装或运行环境不确定时，使用 `get_runtime_status`；它会只读检查解析后的工作区、Node engine 兼容性、包版本、cn-font-split 运行时版本和 WASM 文件，并返回便于 agent 执行/提示的 `recommendedActions[]`。
- 当源目录是扁平、混合或与预期 family 分组不一致时，先用 `organize_font_directory` 的默认 `dryRun: true` 生成整理计划。它对源目录非破坏：不会移动或删除源文件；真正执行时也只是复制选中的字体到 `outputDir`。
- 批量扫描会跳过依赖目录、已生成输出目录、`__MACOSX` 和 AppleDouble `._*` 资源叉文件。
- `.woff` / `.woff2` 输入会先解压成 sfnt-like 数据，再进入处理流程。
- 批量模式会按照 `batchDedupeMode` 去重；默认 `font-identity` 会在任意格式之间比较等价字体身份，并按 `.otf` → `.ttf` → `.woff2` → `.ttc` → `.otc` → `.woff` 的优先级保留一个代表。
- 批量分组默认是 `batchGroupBy: "auto"`，会保留之前的目录优先行为。
- 批量命名默认是 `batchNamingMode: "numeric-suffix"`：先用裸 `fontBaseName`，只有真实冲突时才分配稳定的 `-1`、`-2`、`-3`。
- 当 OTF / TTF 仅容器不同但字体身份相同时，批量模式会去重并只保留一个代表。
- 批量处理不会移动、删除或重写源字体文件：`sourceDestructive` 应始终为 `false`。如果 `outputRoot` 位于 `inputDir` 内，真实写入仍会落在输入目录树里，因此描述“源目录树无写入”前必须检查 `writesSourceTree` 和 `outputTreeInsideInputTree`。
- 批量增量跳过默认是 `skipMode: "manifest"`，会用 `split-meta.json` 比较源文件和有效配置。
- 旧版只看 `result.css` 的跳过行为需要显式选择 `skipMode: "legacy-css"`；需要强制重跑时使用 `skipMode: "force"`。
- 批量错误处理默认是 `batchErrorMode: "fail-after"`，会处理完选中的字体后把任何单字体错误升级为批量错误。
- `strictMode: true` 现在主要是自说明开关；默认已经采用 `manifest` 跳过和 `fail-after` 错误策略，显式参数仍优先生效。
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

这会读取字体元数据并给出 `batchGroupBy` 建议。如果计划合理，可以直接把 `recommendedBatchOptions` 用到原目录的 `split_font_batch`；如果用户希望得到更干净的暂存源目录，再执行 copy-only 整理到 `organized-fonts`。

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

这是最容易误判的结构。先调用 `organize_font_directory` 并保持 `dryRun: true`，重点检查 `safetySummary`、`layout.layoutKind`、`recommendedBatchOptions`、`organizationWarnings`、`sourceDestructive`、`writesSourceTree` 和 `outputTreeInsideInputTree`。

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
| `workflowPreset` | `default`, `safe-preview`, `reviewed-write`, `structure-first`, `source-layout`, `metadata-family`, `preserve-all` | `default` | 命名配置预设，会先展开为一组批量/整理参数；显式传入的具体参数仍会覆盖预设。 |
| `skipMode` | `legacy-css`, `manifest`, `force` | `manifest` | 批量模式如何判断已有输出是否可跳过。 |
| `batchGroupBy` | `auto`, `source-dir`, `font-family` | `auto` | 批量模式如何决定家族目录名。 |
| `batchNamingMode` | `plain`, `numeric-suffix`, `source-suffix` | `numeric-suffix` | 批量模式如何决定每个字体输出目录的命名冲突策略。 |
| `batchDedupeMode` | `none`, `same-path`, `font-identity` | `font-identity` | 批量模式如何在处理前对等价字体做去重。 |
| `batchErrorMode` | `collect`, `fail-fast`, `fail-after` | `fail-after` | 每个字体处理失败时，是收集到响应里，还是为自动化场景直接抛错。 |
| `limit` | 正整数，MCP 最大 `50000` | `20` | 去重后最多处理多少个字体。全量跑时需要显式调高。 |
| `maxFiles` | 正整数，MCP 最大 `50000` | `5000` | 扫描阶段最多读取多少个源文件，再过滤字体扩展名。 |
| `includeResults` | `true`, `false` | `true` | 是否返回每个字体的详细 `results[]`。大批量只需要摘要和错误时可设为 `false`。 |
| `dryRun` | `true`, `false` | `false` | 只预览扫描、去重、命名和 skip 决策，不写任何输出文件。 |
| `strictMode` | `true`, `false` | `false` | 自说明严格开关。批量默认已经使用 `manifest` 和 `fail-after`；显式参数仍优先生效。 |

`skipMode` 说明：

- `legacy-css`：只要当前批量输出目录里的 `result.css` 存在就跳过。仅在明确需要旧行为时使用；它不感知参数变化。
- `manifest`：读取 `split-meta.json`，比较源文件路径、大小、mtime、有效参数、manifest 版本和工具版本。
- `force`：永远不跳过，始终重跑。

`workflowPreset` 说明：

- `safe-preview`：无写入预览。批量时等价于 `dryRun: true`、`includeResults: true`、`strictMode: true`、`skipMode: "manifest"` 等安全默认值；整理时等价于解析字体并返回完整计划。
- `reviewed-write`：用于已经审查过预览后的真实写入。批量会写拆分输出；整理会 copy-only 写入 `outputDir`，仍不会改动源文件。
- `structure-first`：无写入、偏结构/路径的快速第一遍扫描，适合超大或嘈杂目录；批量侧使用 `same-path` 去重，目录整理侧跳过字体元数据解析。
- `source-layout`：优先按源目录分组，适合每个压缩包/家族一个目录的来源结构。
- `metadata-family`：优先按字体内部 family metadata 分组，适合扁平 vendor dump。
- `preserve-all`：关闭预处理去重，并保留 `numeric-suffix` 命名，适合必须保留每个源字体文件的场景。

预设只是起点，不是锁定配置；例如 `{"workflowPreset":"safe-preview","batchDedupeMode":"none"}` 会保留无写入预览，但覆盖为不去重。

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
- `same-path`：保留旧的“同路径、同 stem 多格式去重”行为。
- `font-identity`：按归一化后的字体身份跨格式去重，保留优先级最高的代表。身份键优先使用 typographic family/subfamily，缺失时回退到 legacy family/subfamily，再回退到 full name 或 PostScript name；`glyphCount` 只作为诊断信息，不会把等价的 OTF/TTF/WOFF 输入拆开。
- 如果身份解析失败，去重会回退到基于路径的 key，并把真实错误留给处理阶段和 `batchErrorMode`。

`batchErrorMode` 说明：

- `collect`：继续处理，并返回 `ok: true`、`errors[]` 和 `errorCount`；仅在调用方会主动检查错误列表时使用。
- `fail-fast`：遇到第一个单字体错误就抛错。
- `fail-after`：继续处理选中的字体，最后如果存在任何单字体错误则抛错。

当 `fail-fast` 或 `fail-after` 通过 MCP 抛错时，错误文本是 JSON，包含 `ok: false`、`name`、`error` 和 `details`；AI agent 应解析它来恢复 `details.errors[]` 和 `details.summary`。

## 如何解释返回结果

`split_font` 返回兼容字段，也返回更明确的分类字段：

- `outputMode`：`subset`、`single-woff2` 或 `copy-original`
- `resultType`：`subset`、`single-woff2-small-glyph`、`single-woff2-split-failure`、`single-woff2` 或 `copy-original-small-glyph`
- `performedSplit`：只有真正执行多子集分割时才为 true
- `usedFallback`：单 WOFF2 fallback 路径为 true
- `skipped`：主动绕过分割器时为 true
- `skipReason`：主动绕过或 fallback 的原因
- `warnings`：非透明行为的人类可读说明
- `manifestPath` / `manifestWritten`：manifest 输出状态

`inspect_font_inputs` 是不写输出的输入预检：

- `supportedFontCount`、`validFontCount`、`invalidFontCount`
- `unsupportedFileSummary`：所有被忽略的非字体文件扩展名统计、无扩展 `<none>` 计数和少量示例路径
- `missingIdentityCount`
- `maxFilesHit`：只有当 `maxFiles` 之外确实还有更多文件时才为 true
- `inspectionWarningCount`、`inspectionWarnings[]`，每项包含机器可读的 `code` 和 `message`
- `invalidFonts[]`
- 可选 `files[]` 条目，包含 `container`、`identity`、`identityKey`、`identityBasis` 和 `glyphCount`

`split_font_batch` 还会返回聚合统计，例如：

- `resultsIncluded`：是否包含每个字体的 `results[]` 详情
- `scannedFileCount`、`maxFiles`、`maxFilesHit`
- `unsupportedFileSummary`：所有已扫描但被忽略的非字体文件扩展名统计、无扩展 `<none>` 计数和少量示例路径
- `dryRun`、`plannedCount`、`wouldProcessCount`、`planIncluded`
- `batchWarningCount`、`batchWarnings[]`，每项包含机器可读的 `code` 和 `message`
- `batchErrorMode`、`errorCount`、`errors[]`
- `safetySummary`：批量源目录/输出目录安全摘要。判断批量调用是否写文件、是否影响源目录树时优先看它；源字体文件应始终保留，写入范围只限 `outputRoot`。
- `sourceDestructive`：批量工具应始终返回 `false`
- `writesSourceTree`：只有真实批量写入且 `outputRoot` 位于 `inputDir` 内时才为 `true`
- `writesOutputTree`：`dryRun: false` 时为 `true`
- `outputTreeInsideInputTree`：`outputRoot` 是否位于或等于 `inputDir`；为 `true` 时，后续宽泛扫描可能再次处理生成输出
- `mayOverwriteOutputTree`：非 dry-run 且有选中字体时为 `true`，表示可能替换 `outputRoot` 中已有输出
- `skippedExisting`、`skippedLegacy`、`skippedByManifest`
- `reprocessedBecauseSourceChanged`、`reprocessedBecauseOptionsChanged`
- `processingSummary.subsetOutputs`
- `processingSummary.singleWoff2Outputs`
- `processingSummary.copyOriginalOutputs`
- `processingSummary.smallGlyphDowngrades`
- `processingSummary.smallGlyphCopyOriginals`
- `processingSummary.failureFallbacks`

`organize_font_directory` 会返回源目录安全性摘要和可选整理计划：

- `safetySummary`：紧凑的源目录/输出目录安全摘要。判断整理工具是否破坏性时优先看它；它会确认源文件会被保留，并把任何覆盖风险限定到 `outputDir`。
- `operationMode`：默认 dry-run 时为 `plan-only`，`dryRun: false` 时为 `copy-only`
- `destructive`：只有当前非 dry-run 调用可能覆盖 `outputDir` 中的文件时才为 true
- `sourceDestructive`：恒为 `false`
- `writesSourceTree`：只有真实整理复制且 `outputDir` 位于 `inputDir` 内时才为 `true`
- `writesOutputTree`：只有 `dryRun: false` 时为 true
- `outputTreeInsideInputTree`：`outputDir` 是否位于或等于 `inputDir`；为 `true` 时，后续宽泛扫描可能再次处理整理副本
- `mayOverwriteOutputTree`：只有 `dryRun: false` 且 `overwriteExisting: true` 时为 true
- `sourceFilesPreserved`：恒为 `true`
- `parsedFontMetadata`：`parseFonts: false` 时为 false；此时 `validFontCount` / `invalidFontCount` 是 `null`
- `effectiveBatchDedupeMode`、`dedupeLimitedByParsing`：说明 identity 去重是否真正可用
- `unsupportedFileSummary`：所有被忽略的非字体文件扩展名统计、无扩展 `<none>` 计数和少量示例路径；源目录混有压缩包、图片、文档或生成产物时优先看它
- `layout.layoutKind`：`empty`、`flat`、`nested` 或 `mixed`
- `recommendedBatchOptions`：根据目录形态给出的后续 `split_font_batch` 建议配置
- `recommendedNextActionCount`、`recommendedNextActions[]`：面向 agent 的机器可读后续动作，每项包含 `id`、`priority`、`tool`、`reason`、可选 `suggestedArgs` 和 `inspectFields`
- `organizationWarningCount`、`organizationWarnings[]`，每项包含机器可读的 `code` 和 `message`
- `planActionSummary`：始终返回；按动作统计 `would-copy`、`copied`、`skipped-duplicate`、`skipped-invalid`、`skipped-target-exists` 和 `error` 等数量，即使 `includePlan: false` 省略明细也会保留
- 可选 `plan[]` 条目，包含 `source`、`targetPath`、`groupName`、`action`、`identityKey` 和 `glyphCount`

应把 `recommendedNextActions[]` 当作检查清单，而不是自动执行结果。Agent 仍然要检查每项里的 `inspectFields`，尤其是当某个动作建议写文件或用不同解析参数重跑时。
应把 `planActionSummary` 当作压缩概览，而不是无需审查详细计划就可以写文件的许可。

`inspect_split_output` 保留基础文件统计，并增加结构化输出清单：

- `maxFiles` 可以调整输出扫描上限；默认是 `200000`，避免大型批量输出在检查时被截断。
- `maxFilesHit` 只有当 `maxFiles` 之外确实还有更多输出文件时才为 true。
- `includeFiles: false` 会省略扁平 `files[]`，但保留摘要计数。
- `includeFamilies: false` 会省略结构化 `families[]`，但保留 family 和输出模式计数。
- `inspectionWarningCount` 和 `inspectionWarnings[]` 会用机器可读 `code` 汇总截断、详情数组省略、legacy 输出推断和结构问题等状态。
- `structureSummary` 检查输出目录是否符合文档化结构；只有 `structureSummary.conforms: true` 时，才表示没有发现杂项文件、manifest 缺失或输出模式文件缺失等结构问题。
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
  "strictMode": true,
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

显式切回旧式批量行为：

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

`batch:run` 是给 agent 和维护者使用的安全批量辅助入口。它默认使用 `strictMode: true`（自说明；核心批量默认已经是 `skipMode: "manifest"` 和 `batchErrorMode: "fail-after"`）、`includeResults: false`、`batchNamingMode: "numeric-suffix"`、`batchDedupeMode: "font-identity"` 和 `splitFailureAction: "single-woff2"`。位置参数依次是 `inputDir`、`outputRoot`、`limit` 和 `maxFiles`；也可以用 `FONT_SPLIT_INPUT_DIR`、`FONT_SPLIT_OUTPUT_ROOT`、`FONT_SPLIT_LIMIT`、`FONT_SPLIT_MAX_FILES` 和 `FONT_SPLIT_DRY_RUN` 提供相同配置。它会在控制台摘要里打印 `batchWarnings[]` 的 code/message。高级覆盖项可使用 `FONT_SPLIT_STRICT_MODE`、`FONT_SPLIT_INCLUDE_RESULTS`、`FONT_SPLIT_SKIP_MODE`、`FONT_SPLIT_BATCH_GROUP_BY`、`FONT_SPLIT_BATCH_NAMING_MODE`、`FONT_SPLIT_BATCH_DEDUPE_MODE`、`FONT_SPLIT_BATCH_ERROR_MODE`、`FONT_SPLIT_SPLIT_FAILURE_ACTION` 和 `FONT_SPLIT_CHUNK_SIZE`。

### Smoke 检查

```sh
npm run check
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
npm run smoke:inspect-compact
npm run smoke:mcp-error
npm run smoke:inspect
npm run smoke:small-skip
```

`npm run check` 是推荐给 AI agent / CI 的入口。它会运行语法检查和一组能自造最小输入的 smoke 场景，不依赖真实字体库。

`smoke:small-skip` 当前验证的是 `copy-original` 小字体策略；脚本名保留是为了兼容。`smoke:incremental` 也会额外打印一个示例 `splitDir`，用于确认新的批量命名在重复运行时仍然稳定。

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
