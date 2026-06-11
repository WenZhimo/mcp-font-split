# 工具完整行为说明（含高风险 / 非直觉行为）

> [!WARNING]
> **本文件描述的是 `mcp-font-split` 当前代码的实际行为。**
>
> 这里写的是工具现在会怎么做，不是理想行为，也不是字体分割的一般原则。它包含正常功能、默认策略、可选 fallback、manifest 语义、批量跳过策略，以及可能违反用户直觉的地方。

---

## 1. 工具能力总览

当前 MCP 服务暴露 6 个工具：

| 工具 | 作用 |
|------|------|
| `get_agent_guidance` | 返回面向 AI 编程助理的机器可读工作流指南 |
| `get_runtime_status` | 返回工作区、包版本、Node、平台和 WASM 可用性的只读诊断信息 |
| `split_font` | 处理单个字体文件 |
| `inspect_font_inputs` | 不写输出地扫描输入字体，报告解析状态、identity key、glyph count 和坏字体清单 |
| `split_font_batch` | 批量扫描目录、去重、分组并处理字体文件 |
| `inspect_split_output` | 汇总和结构化检查输出目录 |

`split_font` 的结果不一定是多分片 web-font。根据参数和字体状态，它可能产生：

- 正常多子集分片：`outputMode = subset`
- 单 WOFF2 fallback：`outputMode = single-woff2`
- 只复制原字体并写 manifest：`outputMode = copy-original`

---

## 2. 路径与访问范围限制

### 2.1 只允许访问工作区内的路径

工具只允许访问 `FONT_SPLIT_ROOT` 指定的目录。

如果没有设置 `FONT_SPLIT_ROOT`，默认值为 MCP Server 进程启动时的当前工作目录。

建议使用者根据自己的字体存放位置显式设置：

```text
FONT_SPLIT_ROOT=/path/to/your/font-workspace
```

如果使用者是 AI agent，不应猜测或硬编码用户的本机路径；在处理用户私有/本地字体前，应该先询问用户希望把 `FONT_SPLIT_ROOT` 设置到哪个目录。

### 2.1.1 AI agent 专用适配

本项目是给 AI 编程助理调用的 MCP Server，因此除了普通参数 schema，还提供了 `get_agent_guidance` 和 `get_runtime_status`。

`get_agent_guidance` 不读写字体文件，只返回：

- 当前 `FONT_SPLIT_ROOT` 解析结果
- 路径使用规则
- 支持扩展名
- 默认批量策略
- 推荐批量参数
- 推荐工具调用顺序
- 调用方应该检查的关键响应字段

当 AI agent 不确定应使用单文件、批量、输入预检还是输出审计流程时，应先调用 `get_agent_guidance`，再选择后续工具。

`get_runtime_status` 也是只读工具。它会检查：

- 当前解析到的工作区是否存在且是目录
- cn-font-split WASM 文件是否存在且是文件
- 包名和版本
- Node 版本、平台和 CPU 架构
- 支持的字体扩展名

当 agent 遇到安装、路径或 WASM 相关问题时，应先调用 `get_runtime_status`，再决定是否提示用户修正环境。

所有相对路径都相对于 `FONT_SPLIT_ROOT` 解释。

如果 `FONT_SPLIT_ROOT` 变化，相同的：

- `fontPath`
- `outDir`
- `inputDir`
- `outputRoot`

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

限制：

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
> 代码内部仍接受旧别名 `skip`，并映射为 `copy-original`。公开 schema 和文档使用 `copy-original`。

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

### 4.5 `strictMode`

`strictMode: true` 是一键严格默认值：

- 批量模式下，如果没有显式设置 `skipMode`，默认变为 `manifest`
- 批量模式下，如果没有显式设置 `batchErrorMode`，默认变为 `fail-after`
- 显式参数优先级高于 `strictMode`，所以仍可手动覆盖
- 单文件模式下，当前默认已经偏严格：`splitFailureAction` 默认 `error`，`smallGlyphAction` 默认 `subset`

### 4.6 `skipMode`（批量专用）

可选值：

- `legacy-css`（默认）
- `manifest`
- `force`

行为：

- `legacy-css`：只要当前批量输出目录里的 `result.css` 存在就跳过
- `manifest`：读取 `split-meta.json`，比较源文件和有效参数，只有一致才跳过
- `force`：永远不跳过，始终重跑

说明：`skipMode` 与 `batchNamingMode` / `batchDedupeMode` 组合使用；当后两者变化时，manifest 模式会把它们当作有效配置变化。

风险：

- `legacy-css` 兼容旧行为，但不感知参数变化、源文件变化、工具版本变化
- `manifest` 更安全，但旧输出目录第一次使用时通常会重跑以生成 manifest

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
- `same-path`：保留旧的“同路径同 stem 多格式去重”行为
- `font-identity`：按归一化后的字体身份跨任意格式去重，保留优先级最高的代表。身份键优先使用 typographic family/subfamily，缺失时回退到 legacy family/subfamily，再回退到 full name 或 PostScript name；`glyphCount` 只作为诊断信息，不参与等价判定。

### 4.10 `batchErrorMode`（批量专用）

可选值：

- `collect`（默认）
- `fail-fast`
- `fail-after`

行为：

- `collect`：单字体错误会进入 `errors[]`，批量工具仍返回 `ok: true`，调用方必须检查 `errorCount`。
- `fail-fast`：遇到第一个单字体错误后立即抛出 `BatchSplitError`。
- `fail-after`：继续处理选中的字体；如果最终存在任何单字体错误，则抛出 `BatchSplitError`，错误对象包含 `details.errors` 和 `details.summary`。

通过 MCP Server 返回时，带 `details` 的错误会被序列化为 JSON 文本，包含 `ok: false`、`name`、`error` 和 `details`。这能避免 AI agent 只看到一句错误消息却丢失失败文件清单。

### 4.11 `limit` / `maxFiles` / `includeResults` / `dryRun`（批量专用）

- `limit`：去重后最多处理多少个字体；默认 `20`，MCP 入口最大 `50000`。
- `maxFiles`：递归扫描阶段最多读取多少个源文件；默认 `5000`，MCP 入口最大 `50000`。
- `maxFilesHit`：批量响应中的机器可读截断信号；只有当 `maxFiles` 之外确实还存在更多源文件时才为 `true`。
- `includeResults`：是否在批量响应中返回每个字体的 `results[]` 详情；默认 `true`。设为 `false` 时仍返回汇总统计、错误列表和 `resultsIncluded: false`，适合全量字体库处理。
- `dryRun`：只执行扫描、去重、命名和 skip 判断，不调用 `split_font`，也不写任何输出文件。`includeResults: true` 时返回 `planned[]` 计划清单。

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
9. 汇总成功、错误、跳过和处理模式统计
10. 如果 `includeResults: false`，响应中省略每个字体的 `results[]` 详情，只保留汇总和错误
11. 如果 `dryRun: true`，第 8 步不会真正执行，而是返回 `planned[]`、`plannedCount` 和 `wouldProcessCount`
12. 如果 `batchErrorMode` 是 `fail-fast` 或 `fail-after`，按对应策略把单字体错误升级为批量工具错误

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
| `usedFallback` | 是否使用 fallback 输出 |
| `skipped` | 是否主动绕过分割器 |
| `skipReason` | 绕过或 fallback 的原因 |
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
- `skippedLegacy`
- `skippedByManifest`
- `reprocessedBecauseSourceChanged`
- `reprocessedBecauseOptionsChanged`
- `processedFontCount`
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

### 9.3 `inspect_split_output`

`maxFiles` 默认是 `200000`。它只影响输出检查阶段的文件扫描上限，不影响批量处理阶段的 `maxFiles`。

`maxFilesHit` 只有当 `maxFiles` 之外确实还有更多输出文件时才为 `true`。如果它为 `true`，不要把本次输出审计视为完整结果，应调高 `maxFiles` 后重跑。

`includeFiles: false` 会省略扁平 `files[]` 清单；`includeFamilies: false` 会省略结构化 `families[]` 清单。它们只影响响应体大小，不影响 `fileCount`、`familyCount`、`fontEntryCount`、manifest 数量或输出模式计数。

保留基础统计：

- `fileCount`
- `maxFilesHit`
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
- `legacyOutputCount`
- `families`

如果有 manifest，检查结果优先使用 manifest 分类。
如果没有 manifest，会使用文件结构做保守推断；无法判断时应视为 legacy / unknown 状态。

---

## 10. 非直觉 / 高风险行为

### 10.1 WOFF/WOFF2 会先解压

`.woff` / `.woff2` 不是原样交给 cn-font-split，而是先转换成 sfnt-like 数据。

### 10.2 原字体会被复制到输出目录

每个处理过的字体都会把原文件复制到输出 family 根目录。
这不是软链接，是实体副本。

### 10.3 默认批量跳过仍偏兼容

默认 `skipMode = legacy-css` 只看 `result.css`，不比较参数。
如果你希望更严格，请显式使用：

```json
{
  "skipMode": "manifest"
}
```

或：

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
- copy-original metadata-only 处理

必须结合 `outputMode` / `resultType` 判断。

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
