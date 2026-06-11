# mcp-font-split

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
- 在输出目录中保留原字体副本。
- 为每个处理过的字体写入 `split-meta.json`。
- 检查输出目录，返回基础文件统计和结构化 family/font 汇总。
- 通过 cn-font-split WASM 后端跨平台运行。

## 工具列表

| 工具 | 说明 |
|------|------|
| `split_font` | 处理单个字体。根据参数，结果可能是真正分片、单 WOFF2 fallback，或 copy-original 元数据登记。 |
| `split_font_batch` | 扫描目录、对同名多格式字体去重、按家族目录分组，并处理每个选中的字体。 |
| `inspect_split_output` | 汇总输出目录，并优先使用 `split-meta.json` 对 family/font 条目做结构化分类。 |

## 重要行为摘要

> [!WARNING]
> `ok: true` 只表示工具按所选策略完成，不代表一定发生了多子集分割。解释结果时应优先看 `resultType`、`outputMode`、`performedSplit`、`usedFallback`、`skipped` 和 `warnings`。

关键默认行为：

- 所有路径都限制在 `FONT_SPLIT_ROOT` 内；相对路径基于该根目录解析。
- `.woff` / `.woff2` 输入会先解压成 sfnt-like 数据，再进入处理流程。
- 批量模式会对同路径、同 basename 的多格式字体自动去重，优先级为：`.otf` → `.ttf` → `.woff2` → `.ttc` → `.otc` → `.woff`。
- 批量分组默认是 `batchGroupBy: "auto"`，会保留之前的目录优先行为。
- 批量增量跳过默认是 `skipMode: "legacy-css"`，会保留旧版只看 `result.css` 的行为。
- 更安全的批量重跑建议使用 `skipMode: "manifest"` 或 `skipMode: "force"`。
- 删除超大 `kern` 表必须显式设置 `oversizedKernAction: "strip"`。
- 分割失败后回退为单 WOFF2 必须显式设置 `splitFailureAction: "single-woff2"`。
- 小字形字体由 `smallGlyphAction` 控制：`subset`、`single-woff2` 或 `copy-original`。

## 输出目录结构

正常分片输出：

```text
split-output/
  <FamilyName>/
    <OriginalFontFile>          # 原字体副本
    <FontBaseName>/             # 处理输出目录
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
    <OriginalFontFile>
    <FontBaseName>/
      <FontBaseName>.woff2
      result.css
      index.html?
      split-meta.json
```

小字体 `copy-original` 输出：

```text
split-output/
  <FamilyName>/
    <OriginalFontFile>
    <FontBaseName>/
      split-meta.json
```

`copy-original` 不会生成 `.woff2` 或 `result.css`；它只表示该字体已经被处理流程登记，并明确跳过了分片。

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
| `skipMode` | `legacy-css`, `manifest`, `force` | `legacy-css` | 批量模式如何判断已有输出是否可跳过。 |
| `batchGroupBy` | `auto`, `source-dir`, `font-family` | `auto` | 批量模式如何决定家族目录名。 |

`skipMode` 说明：

- `legacy-css`：只要 `<family>/<fontBaseName>/result.css` 存在就跳过。兼容旧行为，但不感知参数变化。
- `manifest`：读取 `split-meta.json`，比较源文件路径、大小、mtime、有效参数、manifest 版本和工具版本。
- `force`：永远不跳过，始终重跑。

`batchGroupBy` 说明：

- `auto`：嵌套字体使用第一层源目录名；输入根目录下的字体使用内部 family metadata。
- `source-dir`：尽量按源目录名分组。
- `font-family`：尽量按字体内部 family metadata 分组，无法提取时回退 basename。

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

`split_font_batch` 还会返回聚合统计，例如：

- `skippedExisting`、`skippedLegacy`、`skippedByManifest`
- `reprocessedBecauseSourceChanged`、`reprocessedBecauseOptionsChanged`
- `processingSummary.subsetOutputs`
- `processingSummary.singleWoff2Outputs`
- `processingSummary.copyOriginalOutputs`
- `processingSummary.smallGlyphDowngrades`
- `processingSummary.smallGlyphCopyOriginals`
- `processingSummary.failureFallbacks`

`inspect_split_output` 保留基础文件统计，并增加结构化输出清单：

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
  "skipMode": "manifest",
  "smallGlyphAction": "copy-original"
}
```

按字体 metadata 分组：

```json
{
  "inputDir": ".",
  "outputRoot": "split-output",
  "batchGroupBy": "font-family",
  "skipMode": "manifest"
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
npm run smoke:incremental
npm run smoke:inspect
npm run smoke:small-skip
```

`smoke:small-skip` 当前验证的是 `copy-original` 小字体策略；脚本名保留是为了兼容。

### 环境变量

| 变量名 | 说明 |
|--------|------|
| `FONT_SPLIT_ROOT` | 覆盖默认字体工作区根目录。 |

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
