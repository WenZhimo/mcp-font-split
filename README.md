# mcp-font-split

[English](./README.en.md) | [API 参考](./API.zh-CN.md) | [English API](./API.md) | [行为说明](./BEHAVIOR.zh-CN.md)

> **AI 生成代码声明**
>
> 本项目由 AI 编程助理生成并持续维护。作者不对代码做任何保证，也不承担任何使用责任。代码按“原样”提供，不附带任何形式的担保。

> [!NOTE]
> **?????????? 1.0.0?**
>
> ?? MCP ?????????????????????????????????????????????????????????????????????????????? MCP schema?`get_agent_guidance` ????API ??? release notes ???

---

一个 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 服务器，将 [cn-font-split](https://github.com/KonghaYao/cn-font-split) 封装为可由 AI agent 调用的字体分割、批量处理、目录整理和输出审计工具。

> [!WARNING]
> 使用前请先阅读：[工具完整行为说明（含高风险 / 非直觉行为）](./BEHAVIOR.zh-CN.md)。README 只保留入口、常见工作流和关键风险；字段级细节以 [API 参考](./API.zh-CN.md) 为准。

## 文档导航

| 你要解决的问题 | 建议先看 |
|----------------|----------|
| 快速了解项目、安装和常见调用方式 | 当前 README |
| 查 MCP 工具参数、返回字段和字段语义 | [API 参考](./API.zh-CN.md)；英文版见 [API Reference](./API.md) |
| 判断批量去重、目录整理、fallback、输出审计等高风险行为 | [工具完整行为说明](./BEHAVIOR.zh-CN.md) |
| 让 AI agent 选择下一步工具和安全参数 | 先调用 `get_agent_guidance`，再检查 `inspectFields` 和 `successCriteria` |
| 维护项目、理解结构并验证改动 | [维护者结构指南](./docs/MAINTAINING.zh-CN.md)；`npm run check:compact`；涉及行为时再跑 `npm run smoke:real-corpus-suite -- <字体语料目录>` |

## 目录结构不匹配速查

如果字体来自多个网站、压缩包解包目录、vendor dump 或混合根目录，先不要直接写入批量输出。推荐顺序是：

1. 用 `inspect_font_inputs` 只读预检目录。
2. 查看 `inputDirectoryDecision.directoryOrganizationSafety` 和 `sourceLayoutMismatchSummary`。
3. 如果需要整理，先调用 `organize_font_directory` + `workflowPreset: "safe-preview"`。
4. 只有审查计划后才使用 `reviewed-write`；它仍然只是 copy-only 写入 `outputDir`，不会移动、删除或重写源字体。
5. 对整理后的暂存目录重新执行 `inspect_font_inputs`，再进入 `split_font_batch` safe-preview 和最终输出审计。

非直觉点：`organize_font_directory` 的输出是“整理后的源目录暂存”，不是最终 web-font 拆分结果；最终结果仍必须由 `split_font_batch` 写出，并用 `inspect_split_output` 审计目录结构。
如果这个暂存目录里有 `font-organization-manifest.json`，`inspect_split_output` 会把它识别为 `organized-font-source-staging`，这时它仍然是暂存目录，不是最终拆分输出。

## 功能

- 将 TTF/OTF/TTC/OTC/WOFF/WOFF2 字体处理为 web-font 输出。
- 扫描、预检和批量处理字体目录。
- 在源目录混乱时生成整理计划，或非破坏性复制到暂存源目录。
- 使用 manifest 支持增量跳过和输出审计。
- 提供 `get_agent_guidance`，让 AI agent 用机器可读指南选择安全工作流。
- 提供 MCP 文档 resources 和 `safe-batch-workflow` prompt，让客户端可以直接发现项目文档和安全批量流程。
- 工具响应同时提供 `structuredContent` 和兼容旧客户端的 JSON 文本内容。
- 提供真实语料库 smoke suite，用复杂本地字体集合做代表性可靠性验证。

## 工具列表

| 工具 | 用途 |
|------|------|
| `get_agent_guidance` | 返回面向 agent 的工作流指南、工具安全速查表、字段检查清单、目录/identity catalog 和推荐调用模板。 |
| `get_runtime_status` | 只读检查工作区、Node engine、包版本、平台和 WASM 可用性。 |
| `inspect_font_inputs` | 不写输出地扫描输入目录，报告字体计数、坏字体、忽略文件、目录布局和推荐第一步。 |
| `organize_font_directory` | 规划或 copy-only 整理源字体目录；默认 dry-run，不移动、不删除、不重写源字体。 |
| `split_font` | 处理单个字体，可能得到正常分片、单 WOFF2 fallback 或 copy-original 登记。 |
| `split_font_batch` | 批量扫描、去重、命名、跳过已有输出并处理字体。 |
| `inspect_split_output` | 审计生成的拆分输出目录，检查目录角色、manifest 覆盖和结构问题。 |

## MCP 资源和 Prompt

除工具外，服务还通过 MCP resources 暴露 README、API 和行为说明文档；通过 `safe-batch-workflow` prompt 提供“预检 → safe-preview → reviewed-write → 输出审计”的安全批量流程提示。支持 resources / prompts 的客户端可以直接从 MCP schema 发现这些入口。

## 常见工作流

### 1. 先让 agent 自我定位

```json
{
  "tool": "get_agent_guidance",
  "arguments": {
    "workflow": "batch",
    "detailLevel": "compact"
  }
}
```

当目录形态、写入风险或下一步工具不确定时，先看 `recommendedWorkflowPlan`、`nextToolDecisionSummary`、`toolSafetyQuickReference` 和 `responseFieldsToCheck`。

### 2. 预检输入目录

```json
{
  "tool": "inspect_font_inputs",
  "arguments": {
    "inputDir": "fonts",
    "maxFiles": 50000,
    "includeFiles": false
  }
}
```

先看 `inputCountGuide`、`inputDirectoryDecision`、`inputDirectoryDecision.directoryOrganizationSafety`、`unsupportedFileDecision`、`unsupportedFileSummary`、`layout` 和 `maxFilesHit`。压缩包和非字体文件会被报告为忽略项，不会被自动解压、复制或拆分。

### 3. 批量 safe-preview

```json
{
  "tool": "split_font_batch",
  "arguments": {
    "inputDir": "fonts",
    "outputRoot": "split-output",
    "workflowPreset": "safe-preview",
    "limit": 50000,
    "maxFiles": 50000
  }
}
```

确认 `dryRun: true`、`batchWarnings[]`、`dedupeDecisionSummary`、`batchPolicySummary`、`sourceSafetyDecision`、`recommendedNextActions[]` 和 `errors[]` 后，再决定是否写入。

### 4. 审查后写入并审计输出

```json
{
  "tool": "split_font_batch",
  "arguments": {
    "inputDir": "fonts",
    "outputRoot": "split-output",
    "workflowPreset": "reviewed-write",
    "limit": 50000,
    "maxFiles": 50000
  }
}
```

写入后运行：

```json
{
  "tool": "inspect_split_output",
  "arguments": {
    "outDir": "split-output",
    "maxFiles": 200000,
    "includeFiles": false,
    "includeFamilies": false
  }
}
```

只有输出目录审计明确通过、没有扫描截断，并且结构诊断确认这是合格的拆分输出时，才把结果视为完成。字段级判定请看 [API 参考](./API.zh-CN.md) 和 [行为说明](./BEHAVIOR.zh-CN.md)。

### 5. 源目录需要整理时

```json
{
  "tool": "organize_font_directory",
  "arguments": {
    "inputDir": "fonts",
    "workflowPreset": "safe-preview",
    "includePlan": true,
    "maxFiles": 50000
  }
}
```

整理工具默认只返回计划。即使 `reviewed-write`，也只是 copy-only 写入 `outputDir`；它的输出是源目录式暂存，不是最终拆分输出。先用 `inspect_font_inputs` 检查暂存目录，再用 `split_font_batch` safe-preview。

## 关键风险

- `ok: true` 只表示工具按所选策略完成，不代表一定发生了正常多子集分片；优先看 `resultType`、`outputMode`、`performedSplit`、`usedFallback`、`skipped` 和 `warnings`。
- 所有路径都限制在 `FONT_SPLIT_ROOT` 内；工具响应里用 `.` 表示工作区根目录。
- 写入类工具完成后，不要只看 `ok`；还要看 `sourceSafetyDecision`、`safetySummary`、`recommendedNextActions[]` 和必要时的 `inspect_split_output` 审计结果。
- `inputDirectoryDecision.directoryOrganizationSafety` 是判断 `organize_font_directory` 是否可用、是否可能改动源文件的最短答案。
- `organize_font_directory` 不移动、不删除、不重写源字体；它写出的 `outputDir` 只是 copy-only 暂存源目录。
- `split_font_batch` 默认 `batchNamingMode: "numeric-suffix"`：先用裸名，只有真实冲突时才加 `-1`、`-2` 等稳定数字后缀。
- `batchDedupeMode: "same-path"` 只是路径/stem 级去重；`batchDedupeMode: "font-identity"` 会跨格式比较字体身份。
- `font-identity` 会按字体身份跨格式收敛等价 OTF/TTF/WOFF 输入；具体 name table 回退规则和诊断字段请看 API / 行为文档。
- `.woff` / `.woff2` 输入会先解压成 sfnt-like 数据，再进入处理流程。
- 显式传入的无效配置会被拒绝，而不是静默回退；需要默认行为时请省略该选项。
- 如果 `outputRoot` 位于 `inputDir` 内，真实写入仍会落在输入目录树里；描述“源目录树无写入”前必须检查 `writesSourceTree` 和 `outputTreeInsideInputTree`。

## 常用参数速览

| 参数 | 入口级说明 |
|------|----------|
| `workflowPreset` | `safe-preview`、`reviewed-write`、`structure-first`、`source-layout`、`metadata-family`、`preserve-all`。只是起点，显式参数仍可覆盖。 |
| `batchGroupBy` | `auto`、`source-dir`、`font-family`。决定家族目录来自源结构还是字体元数据。 |
| `batchNamingMode` | `plain`、`numeric-suffix`、`source-suffix`。默认 `numeric-suffix`。 |
| `batchDedupeMode` | `none`、`same-path`、`font-identity`。默认 `font-identity`。 |
| `batchErrorMode` | `collect`、`fail-fast`、`fail-after`。默认 `fail-after`。 |
| `dryRun` | `true` 只预览，`false` 实际写出。 |
| `limit` / `maxFiles` | 控制批量规模和扫描上限；大目录通常需要显式调高。 |
| `includeResults` | 大批量只需要摘要、warning 和错误时可设为 `false`。 |

## 批量自定义速查

| 目标 | 最小参数起点 | 必须注意 |
|------|--------------|----------|
| 保留每个源字体 | `workflowPreset: "preserve-all"` 或 `batchDedupeMode: "none"` | 不做 identity 去重；同名输出仍可能需要 `numeric-suffix` 避免互相覆盖。 |
| 按源目录分家族 | `workflowPreset: "source-layout"` 或 `batchGroupBy: "source-dir"` | 适合来源目录本身有意义的字体包；目录结构混乱时先做 `organize_font_directory` safe-preview。 |
| 按字体 metadata 分家族 | `workflowPreset: "metadata-family"` 或 `batchGroupBy: "font-family"` | 依赖字体内部 name 表；metadata 错乱时结果也会错。 |
| 快速扫大而杂的目录 | `workflowPreset: "structure-first"`、`includeResults: false` | 适合先看规模和结构；字体解析被推迟时，identity 去重和坏字体判断会受限。 |
| 强制裸输出名 | `batchNamingMode: "plain"` | 不自动加后缀，只在确认没有同名冲突或外部已处理冲突时使用。 |
| 保留错误报告继续跑 | `batchErrorMode: "collect"` | 批量可能仍返回 `ok: true`；必须检查 `errorCount` 和 `errors[]`。 |

完整参数、返回字段和错误形态请看 [API 参考](./API.zh-CN.md)。

## 如何解释返回结果

| 工具 | 优先检查 |
|------|----------|
| `split_font` | `outputMode`、`resultType`、`performedSplit`、`usedFallback`、`skipReason`、`warnings` |
| `inspect_font_inputs` | `inputCountGuide`、`inputDirectoryDecision`、`inputDirectoryDecision.directoryOrganizationSafety`、`unsupportedFileSummary`、`layout` |
| `split_font_batch` | `batchDecision`、`batchWarnings`、`batchPolicySummary`、`dedupeDecisionSummary`、`recommendedNextActions`、`sourceSafetyDecision`、`safetySummary` |
| `organize_font_directory` | `layoutDecision`、`sourceSafetyDecision`、`stagingDirectoryDecision`、`recommendedNextActions` |
| `inspect_split_output` | 输出角色判断、结构审计状态、阻塞原因、manifest 覆盖和输出结构摘要 |

这些字段是入口级阅读顺序，不替代 API 文档里的字段定义。

## 输出形态速查

| 看到的字段 | 含义 | 下一步 |
|------------|------|--------|
| `outputMode: "subset"`、`performedSplit: true` | 正常生成 web-font 分片。 | 真实写入后继续用 `inspect_split_output` 审计结构。 |
| `outputMode: "single-woff2"`、`usedFallback: true` | 没有正常多分片，退化为单个 WOFF2。 | 向用户说明 fallback，并检查 `warnings[]`。 |
| `outputMode: "copy-original"`、`skipped: true`、`usedFallback: false` | 没有生成 web-font 分片，只复制/登记原字体。 | 不要当成正常拆分结果；检查 manifest、`resultType` 和 `skipReason`。 |
| `skipped: true` 且有 `skipReason` | 单字体处理主动绕过正常多分片，例如小字形 fallback 或 copy-original。 | 结合 `outputMode` 和 `usedFallback` 解释；不要把它误当成批量已有输出跳过。 |
| `skippedExisting > 0` 或 `planned[].wouldProcess: false` | 批量 skip 逻辑接受了已有输出，或 dry-run 计划跳过该条目。 | 检查 `skipMode`、`skippedByManifest`、`planned[].skipReason` 并审计已有输出。 |
| `ok: true` 但 `errorCount > 0` | 批量按错误策略完成，但仍有单字体失败。 | 检查 `batchErrorMode`、`errorCount` 和 `errors[]`。 |

## 安装

```sh
git clone https://github.com/WenZhimo/mcp-font-split.git
cd mcp-font-split
npm install
```

依赖的 `cn-font-split` WASM 资源会通过 `postinstall` 脚本准备；也可以手动运行：

```sh
npm run install:wasm
```

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

`batch:run` 是给 agent 和维护者使用的安全批量入口。默认真实运行走 `reviewed-write`；`--dry-run` 或 `FONT_SPLIT_DRY_RUN=true` 会走 `safe-preview`。需要稳定 JSON 时用 `--json` 或 `FONT_SPLIT_JSON=true`。无效 preset、环境变量、位置参数或配置值会被拒绝；完整 CLI 参数和错误字段以 [API 参考](./API.zh-CN.md) 为准。

### 验证

```sh
npm run check
npm run check:compact
npm run --silent check:compact -- --json
npm run smoke:api-docs
npm run smoke:behavior-docs
npm run smoke:real-corpus-suite -- <字体语料目录>
```

`npm run check` 是推荐给 AI agent / CI 的入口。`check:compact` 用于快速看 syntax + smoke 是否都通过；`smoke:real-corpus-suite` 用真实语料做代表性可靠性门禁，不是逐字体或逐目录人工验收。真实语料 suite 会区分全库扫描数量和代表性抽样数量，并明确压缩包只作为忽略文件统计，不会被自动解压验证。

## 环境变量

| 变量名 | 说明 |
|--------|------|
| `FONT_SPLIT_ROOT` | 字体工作区根目录。未设置时默认使用 MCP Server 进程启动时的当前工作目录。 |
| `FONT_SPLIT_WASM_PATH` | 可选的自定义 `libffi-wasm32-wasip1.wasm` 运行时路径。 |

## 致谢与来源

本项目封装并调用 [cn-font-split](https://github.com/KonghaYao/cn-font-split)，核心字体分割能力来自该项目。

## 许可证

本项目采用 [Apache License 2.0](./LICENSE)。使用依赖项时也请遵守其各自许可证。
