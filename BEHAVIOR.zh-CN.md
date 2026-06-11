# 工具完整行为说明（含高风险 / 非直觉行为）

> [!WARNING]
> **本文件描述的是 `mcp-font-split` 当前代码的“实际行为”，不是理想行为。**
>
> 也就是说，这里列出的内容中包含：
> - 正常功能
> - 自动规范化
> - 可选降级处理
> - 默认跳过策略
> - 可能与用户预期不一致的行为
> - 已知限制与风险
>
> 如果你把这个工具提供给最终用户，请务必先阅读本文件。

---

## 1. 工具能力总览

当前 MCP 服务暴露 3 个工具：

| 工具 | 作用 |
|------|------|
| `split_font` | 分割单个字体文件 |
| `split_font_batch` | 批量扫描目录并分割字体文件 |
| `inspect_split_output` | 汇总和检查输出目录中的文件 |

---

## 2. 路径与访问范围限制

### 2.1 只允许访问工作区内的路径

工具只允许访问 `FONT_SPLIT_ROOT` 指定的目录。
默认值为：

```text
C:/Users/LENOVO/Downloads/字体
```

任何传入路径如果解析后超出这个根目录，工具会直接报错。

> [!WARNING]
> **所有相对路径都相对于 `FONT_SPLIT_ROOT` 解释。**
>
> 如果你修改了 `FONT_SPLIT_ROOT`，相同的 `fontPath` / `outDir` / `inputDir` 会指向完全不同的位置。

### 2.2 批量扫描时会自动忽略这些目录

`split_font_batch` 递归扫描时，会跳过：

- `node_modules`
- `.git`
- `font-split-mcp`
- `split-output`
- 所有 `split-output-*` 目录

作用：
- 避免把工具自身源码和依赖扫进去
- 避免把之前分割后的输出再次当作输入处理

---

## 3. 支持的输入扩展名

当前识别这些扩展名：

- `.ttf`
- `.otf`
- `.ttc`
- `.otc`
- `.woff`
- `.woff2`

> [!NOTE]
> “支持输入”不代表“原样传给 cn-font-split”。
> 某些格式会先被解压或转换后再处理。

---

## 4. 当前版本最重要的策略变化

> [!WARNING]
> **当前版本已经不再默认静默删除超大 `kern`，也不再默认静默把小字体或失败结果降级成单个 WOFF2。**
>
> 这些行为现在都要由调用方显式允许。

### 4.1 新增的可配置开关

#### `oversizedKernAction`

可选值：
- `preserve`（默认）
- `strip`

含义：
- `preserve`：检测并报告超大 `kern`，但不删除它
- `strip`：当 `kern` 表超过阈值时，允许工具删除该表后再分割

#### `smallGlyphAction`

可选值：
- `subset`（默认）
- `single-woff2`

含义：
- `subset`：即使字形数很小，也继续尝试正常分割
- `single-woff2`：允许工具把小字形字体直接降级为单个 WOFF2 + CSS

#### `smallGlyphThreshold`

- 默认值：`50`
- 仅在 `smallGlyphAction = single-woff2` 时生效

#### `splitFailureAction`

可选值：
- `error`（默认）
- `single-woff2`

含义：
- `error`：`cn-font-split` 失败时直接报错
- `single-woff2`：允许工具在分割失败后回退成单个 WOFF2 + CSS

---

## 5. 单文件 `split_font` 的完整处理流程

对每个输入字体，当前流程如下：

1. 校验路径合法且文件存在
2. 将整个字体文件读入内存
3. 根据 magic number 判断格式
4. 若是 WOFF1：先解压为 sfnt/TTF-like 数据
5. 若是 WOFF2：先解压为 sfnt/TTF-like 数据
6. 检查是否存在异常大的 `kern` 表
7. 根据 `oversizedKernAction` 决定是否删除超大 `kern`
8. 读取字形数（glyph count）
9. 若满足小字形条件，且 `smallGlyphAction = single-woff2`，则走降级输出
10. 否则交给 `cn-font-split` 的 WASM 核心处理
11. 如果核心处理失败，且 `splitFailureAction = single-woff2`，则退化为“单文件 woff2 输出”
12. 把原始字体文件复制到输出根目录
13. 把生成文件写入输出目录
14. 汇总输出目录文件并返回结果 JSON

---

## 6. 批量 `split_font_batch` 的完整处理流程

批量模式会在单文件流程基础上增加：

1. 递归扫描 `inputDir`
2. 过滤出支持的字体扩展名
3. 对“同名不同格式”的字体做去重
4. 使用源文件夹名作为家族目录名（优先于字体内部 metadata）
5. 检查该字体是否已经处理过（看 `result.css` 是否存在）
6. 已处理则跳过
7. 未处理则调用 `split_font`
8. 返回批量汇总结果：
   - `discoveredFontCount`
   - `deduplicatedCount`
   - `skippedDuplicates`
   - `skippedExisting`
   - `processedFontCount`
   - `errorCount`
   - `errors`
   - `processingSummary`
   - `results`

---

## 7. 输出目录结构

当前输出结构为：

```text
split-output/
  <FamilyName>/
    <OriginalFontFile>          # 原字体副本
    <FontBaseName>/             # 该字体的分割输出目录
      *.woff2
      result.css
      index.html?               # 启用 testHtml 时
      reporter.bin?             # 正常分割路径且启用 reporter 时
      index.proto?              # 正常分割路径下可能由核心工具生成
```

示例：

```text
split-output/
  26F Galaxy Hebrew/
    26FGalaxyHebrew-Black.otf
    26FGalaxyHebrew-Black/
      *.woff2
      result.css
    26FGalaxyHebrew-Regular.otf
    26FGalaxyHebrew-Regular/
      *.woff2
      result.css
```

---

# 8. 所有需要重点警告用户的“非预期 / 非直觉行为”

## 8.1 超大 `kern` 表默认只检测，不再默认自动删除

> [!WARNING]
> **当前版本默认不会自动删除超大 `kern` 表。只有传入 `oversizedKernAction: "strip"` 时，工具才会删除它。**

触发检测逻辑：
- 仅对 sfnt/TTF/OTF 类字体生效
- `kern` 表长度 ≥ 文件总长度的 80%

为什么之前会删：
- 为了防止 `cn-font-split` WASM 核心在处理这类字体时 panic / `unreachable`

风险：
- 如果你保留默认 `preserve`，某些病态字体可能直接分割失败
- 如果你改为 `strip`，字偶距信息可能丢失，排版细节可能变化

也就是说：
- `preserve` 更可预测、更不擅自改输入
- `strip` 更偏向“尽量处理成功”

---

## 8.2 小字形字体默认继续尝试分割，不再默认直接降级

> [!WARNING]
> **当前版本默认不会因为 `glyph count <= 50` 就自动降级成单个 WOFF2。只有 `smallGlyphAction: "single-woff2"` 时才会这样做。**

相关参数：
- `smallGlyphAction`
- `smallGlyphThreshold`（默认 50）

当显式允许降级时，降级产物通常只有：
- 一个 `.woff2`
- 一个 `result.css`
- 可选 `index.html`

不会有：
- 多个子集分片
- `reporter.bin`
- `index.proto`
- 真正的 chunk 拆分结果

这意味着：
- `chunkSize`
- `chunkSizeTolerance`
- `maxAllowSubsetsCount`
- `autoSubset`
- `subsetRemainChars`

在这种降级路径下**实际上不起作用**。

---

## 8.3 分割失败默认报错，不再默认静默回退成单文件 WOFF2

> [!WARNING]
> **当前版本默认在 `cn-font-split` 失败时直接报错。只有 `splitFailureAction: "single-woff2"` 时，工具才会自动回退成单个 WOFF2 + CSS。**

风险：
- 如果你保持默认 `error`，某些异常字体会显式失败
- 如果你允许 fallback，调用方可能把“保底导出成功”误认为“真正分片成功”

因此调用方需要检查：
- `outputMode`
- `skipped`
- `skipReason`
- `splitFailureFallbackApplied`

---

## 8.4 WOFF1 / WOFF2 输入不会原样处理，而是先解压再处理

> [!WARNING]
> **`.woff` 和 `.woff2` 输入在进入核心分割引擎前，会先被解压回 sfnt/TTF-like 结构。**

具体行为：
- `.woff` → 本地 zlib 解压后重建 sfnt
- `.woff2` → 使用 `wawoff2` 解压为 sfnt

这意味着：
- 工具不是直接“分割 woff/woff2”
- 而是先把它们“还原成 TTF/OTF 结构”后再处理

可能的副作用：
- 输入格式被标准化
- 某些原始容器级特性不会被保留

---

## 8.5 批量模式会自动跳过同名不同格式的字体文件

> [!WARNING]
> **如果同一路径下存在同名不同格式的字体文件，工具只会处理一个，其他全部自动跳过。**

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
- `Foo.woff` 通常最后才会被考虑

风险：
- 如果不同格式之间其实不是完全等价，这个策略会隐藏差异
- 用户不能手工选择优先使用哪种格式（除非改目录内容）

---

## 8.6 批量模式按“源文件夹名”分组，而不是优先使用字体内部 family name

> [!WARNING]
> **`split_font_batch` 默认优先使用“源文件所在的第一层父目录名”作为家族目录名，而不是字体内部的 family name。**

这样做的原因：
- 修复同一家族被 `nameID=1` 拆成多个目录的问题

带来的语义变化：
- 工具相信用户的目录组织
- 不完全相信字体文件自身 metadata

风险：
- 如果你的源目录本身组织不正确，输出分组也会跟着错

只有当字体文件直接放在输入根目录时，才会回退到字体内部 family name。

---

## 8.7 批量模式会根据 `result.css` 判断“已处理”，即使配置已改变也可能直接跳过

> [!WARNING]
> **批量模式的增量跳过逻辑只检查 `result.css` 是否存在，不会比较处理参数是否变化。**

也就是说，只要存在：

```text
<family>/<fontBaseName>/result.css
```

这个字体就会被视为“已处理”，直接跳过。

即使你改了：
- `chunkSize`
- `fontDisplay`
- `fontFamily`
- `autoSubset`
- `reporter`
- `testHtml`
- `buildMode`
- `oversizedKernAction`
- `smallGlyphAction`
- `smallGlyphThreshold`
- `splitFailureAction`
- 工具版本

它依然可能不重跑。

风险：
- 输出可能和你当前的新配置不一致
- 但工具不会提醒你

如果需要强制重跑，你必须先删掉输出目录。

---

## 8.8 原字体文件会被复制到输出根目录，不是引用而是副本

> [!WARNING]
> **每个字体处理后，原始字体文件都会被复制到输出根目录。**

这意味着：
- 输出不仅包含 web-font 结果
- 还包含原字体副本
- 重跑时这些副本会被覆盖
- 会额外增加磁盘占用

这不是软链接，也不是“仅保留路径信息”，而是实际复制。

---

## 8.9 正常分割路径和降级路径的输出文件集合不一致

> [!WARNING]
> **相同参数在不同处理路径下，不保证生成同样的文件集合。**

### 正常分割路径可能产生：
- 多个 `.woff2`
- `result.css`
- `index.html`（若启用）
- `reporter.bin`（若启用）
- `index.proto`

### 单文件 WOFF2 路径通常只有：
- 一个 `.woff2`
- `result.css`
- 可选 `index.html`

不会有：
- `reporter.bin`
- `index.proto`
- 多个子集分片

所以用户**不能仅靠传参**推断最终一定会有哪些产物。

---

## 8.10 MCP 调用不会流式返回进度，CLI 进度只是终端层行为

> [!NOTE]
> **`batch-run.js` 有实时进度输出，但 MCP 工具调用本身不会给你流式进度事件。**

CLI 脚本会输出：

```text
[123/912] 13.5% + some-font.ttf
```

但这只是终端层 `stdout` 行为，不是 MCP 的结构化流式反馈。

所以：
- 直接跑 `batch-run.js` 能看到进度
- 通过 MCP 调 `split_font_batch` 不会实时收到进度事件

---

## 8.11 工具会主动规范化 / 改写输入，而不是严格做“无损处理”

> [!WARNING]
> **这个工具不是纯透明处理器，它会主动修复、转换、删除、降级或跳过某些输入。**

包括：
- WOFF1 解压
- WOFF2 解压
- 可选删除异常 `kern` 表
- 可选把小字形字体降级成单文件 WOFF2
- 可选把分割失败结果降级成单文件 WOFF2
- 同名多格式自动去重
- 已处理结果自动跳过

如果用户期望“输入什么，就严格按原格式/原结构做分片，不做任何假设和修复”，那么当前工具**仍然不满足这个要求**，只是其中一部分策略现在已经变成显式 opt-in。

---

# 9. 正常行为（非风险项）

## 9.1 `split_font`

- 处理单个字体文件
- 返回 JSON 结果
- 默认输出到 `split-output/<family>/...`
- 保留原字体副本
- 返回文件列表、字形数、是否走单文件 WOFF2 路径、失败 fallback 是否触发等信息

## 9.2 `split_font_batch`

- 递归扫描目录中的字体
- 自动去重同名多格式
- 自动跳过已处理字体
- 按源目录名分组
- 返回整体统计信息、`processingSummary` 与每个成功条目的结果

## 9.3 `inspect_split_output`

- 遍历输出目录
- 汇总：
  - 文件总数
  - 总字节数
  - 各扩展名数量
  - 全部文件路径清单

---

# 10. 已知限制

## 10.1 仍然没有“完全严格模式”

虽然超大 `kern` 删除与自动降级已经变成显式开关，但工具仍然没有一个“一键严格模式”来同时禁止所有自动行为。

例如仍然没有开关来禁止：
- WOFF/WOFF2 先解压后处理
- 同名多格式自动去重
- 已处理文件自动跳过
- 批量模式按目录名分组

## 10.2 批量模式对“家族分组”依赖目录组织

如果输入目录结构乱，输出目录结构也会乱。

## 10.3 增量判断不感知配置变化

如果参数改了但 `result.css` 还在，工具也可能直接跳过。

## 10.4 单文件 WOFF2 输出与真正分割在语义上不同

虽然两者都可能返回 `ok: true`，但含义不一样：
- 一种是真的做了分片
- 一种只是生成了一个单文件 woff2

调用方如果不检查 `outputMode` / `skipped` / `skipReason` / `splitFailureFallbackApplied`，很容易误判。

---

# 11. 建议在 README 中明确提示用户的重点

建议至少公开强调以下内容：

1. **批量模式按源文件夹名分组，不优先按字体内部 family name 分组**
2. **同名多格式字体会自动去重，只处理一个**
3. **`.woff` / `.woff2` 会先解压后再处理**
4. **异常大的 `kern` 表默认只检测，只有显式允许时才会删除**
5. **极小字体或分割失败结果只有在显式允许时才会降级为单文件 woff2 输出**
6. **批量模式增量跳过只看 `result.css` 是否存在，不看参数是否变化**
7. **`ok: true` 不代表一定发生了真正的“分片分割”**

---

# 12. 一句话总结

> [!WARNING]
> **`mcp-font-split` 当前是一个“带自动规范化、选择性修复与可选降级逻辑的实用型工具”，不是“严格无损、完全可预测”的字体分割器。**
>
> 它的目标仍然是“尽量把更多字体处理成功”，但其中最容易违反用户直觉的 `kern` 删除和单文件 fallback 已经改为显式 opt-in。
