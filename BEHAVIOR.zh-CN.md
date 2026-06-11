# 工具完整行为说明（含高风险 / 非直觉行为）

> [!WARNING]
> **本文件描述的是 `mcp-font-split` 当前代码的实际行为。**
>
> 这里写的是工具现在会怎么做，不是理想行为，也不是字体分割的一般原则。它包含正常功能、默认策略、可选 fallback、manifest 语义、批量跳过策略，以及可能违反用户直觉的地方。

---

## 1. 工具能力总览

当前 MCP 服务暴露 3 个工具：

| 工具 | 作用 |
|------|------|
| `split_font` | 处理单个字体文件 |
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
默认值为：

```text
C:/Users/LENOVO/Downloads/字体
```

所有相对路径都相对于 `FONT_SPLIT_ROOT` 解释。

如果 `FONT_SPLIT_ROOT` 变化，相同的：

- `fontPath`
- `outDir`
- `inputDir`
- `outputRoot`

都会指向不同位置。

### 2.2 批量扫描会主动忽略这些目录

`split_font_batch` 递归扫描时会跳过：

- `node_modules`
- `.git`
- `font-split-mcp`
- `split-output`
- 所有 `split-output-*` 目录

作用：

- 避免扫描工具自身源码和依赖
- 避免把已生成的输出再次当作输入

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

### 4.5 `skipMode`（批量专用）

可选值：

- `legacy-css`（默认）
- `manifest`
- `force`

行为：

- `legacy-css`：只要 `<family>/<fontBaseName>/result.css` 存在就跳过
- `manifest`：读取 `split-meta.json`，比较源文件和有效参数，只有一致才跳过
- `force`：永远不跳过，始终重跑

风险：

- `legacy-css` 兼容旧行为，但不感知参数变化、源文件变化、工具版本变化
- `manifest` 更安全，但旧输出目录第一次使用时通常会重跑以生成 manifest

### 4.6 `batchGroupBy`（批量专用）

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
4. 对同路径同 basename 的多格式字体去重
5. 根据 `batchGroupBy` 计算家族目录名
6. 根据 `skipMode` 判断是否跳过已有输出
7. 未跳过时调用 `split_font`
8. 汇总成功、错误、跳过和处理模式统计

### 6.1 同名多格式去重优先级

当前优先级：

1. `.otf`
2. `.ttf`
3. `.woff2`
4. `.ttc`
5. `.otc`
6. `.woff`

例如：

- `Foo.otf` + `Foo.ttf` → 只处理 `Foo.otf`
- `Foo.ttf` + `Foo.woff2` → 只处理 `Foo.ttf`

这个行为目前不能通过参数关闭。

---

## 7. 输出目录结构

### 7.1 正常多分片输出

```text
split-output/
  <FamilyName>/
    <OriginalFontFile>
    <FontBaseName>/
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
    <OriginalFontFile>
    <FontBaseName>/
      <FontBaseName>.woff2
      result.css
      index.html?
      split-meta.json
```

### 7.3 小字形 `copy-original` 输出

```text
split-output/
  <FamilyName>/
    <OriginalFontFile>
    <FontBaseName>/
      split-meta.json
```

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

保留基础统计：

- `fileCount`
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

### 10.5 `ok: true` 不是“真正分片成功”的同义词

`ok: true` 可能对应：

- 真正多分片
- 单 WOFF2 fallback
- copy-original metadata-only 处理

必须结合 `outputMode` / `resultType` 判断。

---

## 11. 当前仍然存在的限制

1. 没有“一键严格模式”。
2. 同名多格式去重策略不能关闭。
3. WOFF/WOFF2 解压不能关闭。
4. `copy-original` 输出没有 web-font CSS，不能直接作为 web-font 使用。
5. 对 TTC/OTC 的 glyph count 基于当前实现读取逻辑，集合字体可能需要额外确认。
6. `inspect_split_output` 对无 manifest 的旧输出只能保守推断。

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
