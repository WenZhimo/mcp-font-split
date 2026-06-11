# mcp-font-split

> **AI 生成代码声明**
>
> 本项目完全由 AI (Claude, Anthropic) 生成。作者不对代码做任何保证，也不承担任何使用责任。代码按"原样"提供，不附带任何形式的担保。

---

一个 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 服务器，将 [cn-font-split](https://github.com/KonghaYao/cn-font-split) 封装为可由 AI agent 调用的字体分割工具。

## 功能

> [!WARNING]
> 使用前请先阅读：[工具完整行为说明（含高风险 / 非直觉行为）](./BEHAVIOR.zh-CN.md)

## 重要：实际行为与可选自动降级

> [!WARNING]
> 这个工具**不是**“输入什么就原样透明分割什么”的封装。
>
> 当前仍然存在这些重要行为：
> - `split_font_batch` 会优先按源文件夹名分组，而不是优先按字体内部 family name 分组。
> - 同名多格式字体会按固定优先级自动去重：`.otf` → `.ttf` → `.woff2` → `.ttc` → `.otc` → `.woff`。
> - `.woff` / `.woff2` 会先解压成 sfnt-like 数据，再交给核心分割流程。
> - 批量增量跳过只检查 `<family>/<fontBaseName>/result.css` 是否已存在，不比较参数变化。
> - `ok: true` 不代表一定发生了真正的多子集分割；请结合 `outputMode`、`skipped`、`skipReason` 一起判断。
>
> 当前版本最重要的策略变化：
> - 超大 `kern` 表删除改为**显式 opt-in**：`oversizedKernAction: "strip"`
> - 小字形字体单文件 WOFF2 降级改为**显式 opt-in**：`smallGlyphAction: "single-woff2"`
> - 分割失败后的单文件 WOFF2 fallback 改为**显式 opt-in**：`splitFailureAction: "single-woff2"`

- 将 TTF/OTF/TTC/WOFF/WOFF2 字体分割为优化的 web 字体子集（woff2 分片 + CSS）
- 自动从字体二进制中提取字体家族名，按家族分组输出
- 批量处理字体目录
- 检查和汇总已生成的输出文件
- 通过 WASM 后端实现跨平台运行（无需本地编译）

## 工具列表

| 工具 | 说明 |
|------|------|
| `split_font` | 将单个字体文件分割为 web 字体分片 |
| `split_font_batch` | 批量分割目录下的字体文件 |
| `inspect_split_output` | 汇总已生成的输出文件信息 |

## 输出目录结构

```
split-output/
  <字体家族名>/
    <字体文件名>.ttf          # 保留原始字体
    <字体文件名>/             # 分割输出子目录
      *.woff2
      result.css
      index.html
      reporter.bin
```

同一字体家族的多个字重/样式会归入同一目录。

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

### 作为 MCP 服务器（Claude Code）

```sh
claude mcp add font-split -- node "/path/to/mcp-font-split/src/server.js"
```

### 独立运行

```sh
npm start
```

### 环境变量

| 变量名 | 说明 |
|--------|------|
| `FONT_SPLIT_ROOT` | 覆盖默认的字体工作空间根目录 |

### 行为控制示例

保守 / 默认行为：不静默删除超大 `kern`，不静默把小字体降级成单个 WOFF2，分割失败直接报错。

```json
{
  "fontPath": "SomeFamily/SomeFont.ttf"
}
```

兼容 / 宽松行为：显式允许旧版本那类“尽量处理成功”的自动策略。

```json
{
  "fontPath": "SomeFamily/SomeFont.ttf",
  "oversizedKernAction": "strip",
  "smallGlyphAction": "single-woff2",
  "splitFailureAction": "single-woff2"
}
```

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
