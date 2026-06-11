# mcp-font-split

[English](./README.md) | [API 参考](./API.zh-CN.md)

> **AI 生成代码声明**
>
> 本项目完全由 AI (Claude, Anthropic) 生成。作者不对代码做任何保证，也不承担任何使用责任。代码按"原样"提供，不附带任何形式的担保。

---

一个 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 服务器，将 [cn-font-split](https://github.com/KonghaYao/cn-font-split) 封装为可由 AI agent 调用的字体分割、批量处理和输出检查工具。

> [!WARNING]
> 使用前请先阅读：[工具完整行为说明（含高风险 / 非直觉行为）](./BEHAVIOR.zh-CN.md)。这个封装层包含批量分组、增量跳过、WOFF 解压、fallback 输出和 manifest 元数据等策略行为。

## 功能

- 将 TTF/OTF/TTC/OTC/WOFF/WOFF2 字体处理为 web-font 输出。
- 批量扫描并处理字体目录。
- 在大批量处理前预检输入目录，先发现坏字体或身份解析问题。
- 提供 `get_agent_guidance`，让 AI 编程助理用机器可读指南选择安全工作流。
- 在输出目录中保留原字体副本。
- 为每个处理过的字体写入 `split-meta.json`。
- 检查输出目录，返回基础文件统计和结构化 family/font 汇总。
- 通过 cn-font-split WASM 后端跨平台运行。

## 工具列表

| 工具 | 说明 |
|------|------|
| `get_agent_guidance` | 返回面向 AI agent 的工作流指南、路径规则、默认策略和需要检查的响应字段。 |
| `split_font` | 处理单个字体。根据参数，结果可能是真正分片、单 WOFF2 fallback，或 copy-original 元数据登记。 |
| `inspect_font_inputs` | 不写输出地扫描输入字体，报告解析状态、identity key、glyph count 和坏字体清单。 |
| `split_font_batch` | 扫描目录、按 `batchDedupeMode` 去重、按家族目录分组，并处理每个选中的字体。 |
| `inspect_split_output` | 汇总输出目录，并优先使用 `split-meta.json` 对 family/font 条目做结构化分类。 |

## 重要行为摘要

> [!WARNING]
> `ok: true` 只表示工具按所选策略完成，不代表一定发生了多子集分割。解释结果时应优先看 `resultType`、`outputMode`、`performedSplit`、`usedFallback`、`skipped` 和 `warnings`。

关键默认行为：

- 所有路径都限制在 `FONT_SPLIT_ROOT` 内；相对路径基于该根目录解析。如果未设置该变量，默认使用 MCP Server 进程启动时的当前工作目录。
- 对 AI 编程助理来说，当工作流不明确时应先调用 `get_agent_guidance`。它会返回推荐工具顺序、默认策略、路径规则和必须检查的响应字段。
- 批量扫描会跳过依赖目录、已生成输出目录、`__MACOSX` 和 AppleDouble `._*` 资源叉文件。
- `.woff` / `.woff2` 输入会先解压成 sfnt-like 数据，再进入处理流程。
- 批量模式会按照 `batchDedupeMode` 去重；默认 `font-identity` 会在任意格式之间比较等价字体身份，并按 `.otf` → `.ttf` → `.woff2` → `.ttc` → `.otc` → `.woff` 的优先级保留一个代表。
- 批量分组默认是 `batchGroupBy: "auto"`，会保留之前的目录优先行为。
- 批量命名默认是 `batchNamingMode: "numeric-suffix"`：先用裸 `fontBaseName`，只有真实冲突时才分配稳定的 `-1`、`-2`、`-3`。
- 当 OTF / TTF 仅容器不同但字体身份相同时，批量模式会去重并只保留一个代表。
- 批量增量跳过默认是 `skipMode: "legacy-css"`，会保留旧版只看 `result.css` 的行为。
- 更安全的批量重跑建议使用 `skipMode: "manifest"` 或 `skipMode: "force"`。
- `strictMode: true` 是更安全批量默认值的快捷入口：未显式设置时使用 `skipMode: "manifest"` 和 `batchErrorMode: "fail-after"`。
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

## 关键参数

### 单文件和批量通用参数

| 参数 | 可选值 | 默认值 | 含义 |
|------|--------|--------|------|
| `oversizedKernAction` | `preserve`, `strip` | `preserve` | 默认只检测超大 `kern`，只有显式设置 `strip` 时才删除。 |
| `smallGlyphAction` | `subset`, `single-woff2`, `copy-original` | `subset` | 当 `glyphCount <= smallGlyphThreshold` 时的处理策略。 |
| `smallGlyphThreshold` | 正整数 | `50` | 小字形策略使用的字形数阈值。 |
| `splitFailureAction` | `error`, `single-woff2` | `error` | 默认暴露 cn-font-split 错误；可显式回退为单 WOFF2。 |
| `strictMode` | `true`, `false` | `false` | 一键严格默认值。批量模式下，未显式设置的 `skipMode` 会变为 `manifest`，未显式设置的 `batchErrorMode` 会变为 `fail-after`；显式参数仍优先生效。 |

`smallGlyphAction` 说明：

- `subset`：继续尝试正常 cn-font-split 分片。
- `single-woff2`：不做多分片，生成一个 WOFF2 文件和 CSS。
- `copy-original`：复制原字体到输出家族目录，创建字体输出目录，写 `split-meta.json`，不生成 web-font 文件。

### 批量专用参数

| 参数 | 可选值 | 默认值 | 含义 |
|------|--------|--------|------|
| `skipMode` | `legacy-css`, `manifest`, `force` | `legacy-css` | 批量模式如何判断已有输出是否可跳过。 |
| `batchGroupBy` | `auto`, `source-dir`, `font-family` | `auto` | 批量模式如何决定家族目录名。 |
| `batchNamingMode` | `plain`, `numeric-suffix`, `source-suffix` | `numeric-suffix` | 批量模式如何决定每个字体输出目录的命名冲突策略。 |
| `batchDedupeMode` | `none`, `same-path`, `font-identity` | `font-identity` | 批量模式如何在处理前对等价字体做去重。 |
| `batchErrorMode` | `collect`, `fail-fast`, `fail-after` | `collect` | 每个字体处理失败时，是收集到响应里，还是为自动化场景直接抛错。 |
| `limit` | 正整数，MCP 最大 `50000` | `20` | 去重后最多处理多少个字体。全量跑时需要显式调高。 |
| `maxFiles` | 正整数，MCP 最大 `50000` | `5000` | 扫描阶段最多读取多少个源文件，再过滤字体扩展名。 |
| `includeResults` | `true`, `false` | `true` | 是否返回每个字体的详细 `results[]`。大批量只需要摘要和错误时可设为 `false`。 |
| `dryRun` | `true`, `false` | `false` | 只预览扫描、去重、命名和 skip 决策，不写任何输出文件。 |

`skipMode` 说明：

- `legacy-css`：只要当前批量输出目录里的 `result.css` 存在就跳过。兼容旧行为，但不感知参数变化。
- `manifest`：读取 `split-meta.json`，比较源文件路径、大小、mtime、有效参数、manifest 版本和工具版本。
- `force`：永远不跳过，始终重跑。

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

- `collect`：继续处理，并返回 `ok: true`、`errors[]` 和 `errorCount`；这是兼容默认值。
- `fail-fast`：遇到第一个单字体错误就抛错。
- `fail-after`：继续处理选中的字体，最后如果存在任何单字体错误则抛错。

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
- `missingIdentityCount`
- `maxFilesHit`：只有当 `maxFiles` 之外确实还有更多文件时才为 true
- `invalidFonts[]`
- 可选 `files[]` 条目，包含 `container`、`identity`、`identityKey`、`identityBasis` 和 `glyphCount`

`split_font_batch` 还会返回聚合统计，例如：

- `resultsIncluded`：是否包含每个字体的 `results[]` 详情
- `scannedFileCount`、`maxFiles`、`maxFilesHit`
- `dryRun`、`plannedCount`、`wouldProcessCount`、`planIncluded`
- `batchErrorMode`、`errorCount`、`errors[]`
- `skippedExisting`、`skippedLegacy`、`skippedByManifest`
- `reprocessedBecauseSourceChanged`、`reprocessedBecauseOptionsChanged`
- `processingSummary.subsetOutputs`
- `processingSummary.singleWoff2Outputs`
- `processingSummary.copyOriginalOutputs`
- `processingSummary.smallGlyphDowngrades`
- `processingSummary.smallGlyphCopyOriginals`
- `processingSummary.failureFallbacks`

`inspect_split_output` 保留基础文件统计，并增加结构化输出清单：

- `maxFiles` 可以调整输出扫描上限；默认是 `200000`，避免大型批量输出在检查时被截断。
- `maxFilesHit` 只有当 `maxFiles` 之外确实还有更多输出文件时才为 true。
- `includeFiles: false` 会省略扁平 `files[]`，但保留摘要计数。
- `includeFamilies: false` 会省略结构化 `families[]`，但保留 family 和输出模式计数。
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

```sh
git clone https://github.com/WenZhimo/mcp-font-split.git
cd mcp-font-split
npm install --ignore-scripts

# 下载 WASM 后端：
gh release download 7.6.8 --repo KonghaYao/cn-font-split \
  --pattern 'libffi-wasm32-wasip1.wasm' \
  --dir './node_modules/cn-font-split/dist' --clobber
```

## 使用方式

### 作为 MCP Server

```sh
claude mcp add font-split -- node "/path/to/mcp-font-split/src/server.js"
```

### 独立运行

```sh
npm start
```

### Smoke 检查

```sh
npm run smoke
npm run smoke:agent-guidance
npm run smoke:incremental
npm run smoke:font-inputs
npm run smoke:scan-limits
npm run smoke:inspect-compact
npm run smoke:inspect
npm run smoke:small-skip
```

`smoke:small-skip` 当前验证的是 `copy-original` 小字体策略；脚本名保留是为了兼容。`smoke:incremental` 也会额外打印一个示例 `splitDir`，用于确认新的批量命名在重复运行时仍然稳定。

### 环境变量

| 变量名 | 说明 |
|--------|------|
| `FONT_SPLIT_ROOT` | 字体工作区根目录。请根据自己的字体存放位置显式设置；未设置时默认使用 MCP Server 进程启动时的当前工作目录。如果使用者是 AI，应先询问用户希望使用哪个目录，不要猜测或硬编码用户的本机路径。 |

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
