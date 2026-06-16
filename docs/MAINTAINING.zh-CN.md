# 维护者结构指南

这份文档面向维护者和接手本仓库的 AI agent。目标不是重复 API 细节，而是说明项目文件怎样分层、事实来源该改哪里，以及每个结构切片怎样验证。

## 先读哪里

| 场景 | 入口 |
|------|------|
| 用户快速使用、安装、常见工作流 | `README.md` |
| 英文入口 | `README.en.md` |
| MCP 参数、返回字段、错误形态 | `API.zh-CN.md` / `API.md` |
| 高风险和非直觉行为 | `BEHAVIOR.zh-CN.md` |
| 维护者结构、验证和切片顺序 | 本文档 |
| 本地交接记录 | `.font-split-worklog/YYYY-MM-DD.md`，不提交 |

## 当前代码分层

| 文件或目录 | 责任 |
|------------|------|
| `src/server.js` | MCP schema 和工具入口描述。参数枚举、类型约束和用户可见工具说明先从这里确认。 |
| `src/font-split.js` | 公共运行时 facade，重新导出 `splitFont`、`splitFontBatch`、`inspectFontInputs`、`organizeFontDirectory`、guidance/runtime/status。保持这里轻量，新增运行时边界优先落到独立模块。 |
| `src/config.js` | 默认值、preset、显式配置校验和 configuration trace。无效配置拒绝语义应从这里和 `src/server.js` 一起验证。 |
| `src/batch-runtime.js`、`src/batch.js` | `split_font_batch` 运行时编排、批量扫描、命名、去重、skip、batch decision 和调试日志。 |
| `src/font-identity.js` | 字体身份、name table、WOFF/WOFF2 解包、glyph/kern 相关逻辑。 |
| `src/single-runtime.js`、`src/single-split-output.js`、`src/split-config.js` | `split_font` 单字体运行时编排、fallback / copy-original 输出写入和 cn-font-split 配置生成。 |
| `src/input-preflight.js`、`src/input-*.js` | `inspect_font_inputs` 运行时编排、输入扫描、输入目录判断、忽略文件摘要和目录结构预检。 |
| `src/organization-runtime.js`、`src/organization-*.js` | `organize_font_directory` 运行时编排、copy-only 计划、manifest 和目录路线判断。 |
| `src/output-audit.js` | `inspect_split_output` 输出目录角色判断和结构审计。 |
| `src/guidance*.js`、`src/catalogs.js`、`src/tool-response-field-catalog.js`、`src/tool-option-catalog.js` | 面向 AI agent 的机器可读指南、字段目录、警告目录、选项目录和示例。`src/catalogs.js` 保留公共目录聚合与 re-export，体量较大的响应字段目录和选项目录放在独立文件。 |
| `src/smoke/` | 本地验证场景。涉及用户可见行为、字段契约或真实语料解释时，应优先补这里的 smoke guard。 |

## 事实来源规则

- 运行时行为以代码和 smoke 结果为准，文档只描述已经验证的行为。
- MCP 输入 schema 以 `src/server.js` 和 `src/config.js` 为准。
- 响应字段解释以实际返回对象、`toolResponseFieldCatalog`、`outputResultShapeQuickReference` 和 API 文档共同对齐。
- README 只做入口和高风险提示；不要把字段级解释塞回首页。
- `BEHAVIOR.zh-CN.md` 可以详细解释非直觉行为，但不要成为唯一事实来源。
- 修改 guidance/catalog 后，必须让 smoke 检查能证明引用字段存在且有解释。

## 结构问题行动顺序

1. **收口当前切片**
   - 工作树干净。
   - `npm run --silent check:compact -- --json` 通过。
   - 行为相关改动跑真实语料 suite。
   - 清理生成的 `.font-split-*` 目录，保留 `.font-split-worklog`。
   - 更新 worklog，提交并推送。

2. **降低文档漂移**
   - 为 README、API、BEHAVIOR、guidance/catalog 中重复出现的高风险说法增加 smoke guard。
   - 优先保护这些主题：目录整理是否破坏源文件、整理输出是否是最终拆分输出、`ok:true` 是否能代表成功、`copy-original` / fallback / skip 的区别。

3. **拆薄 `src/font-split.js`**
   - 每次只移动一个边界，例如单字体处理、批量编排、输入预检或目录整理。
   - 保持公开导出和 MCP schema 不变。
   - 先增加或确认 smoke 覆盖，再做移动。

4. **拆分大型 catalog / guidance 文件**
   - `src/catalogs.js` 和 `src/agent-guidance.js` 是当前 AI 友好性的核心，但体积偏大。
   - 只在有明确边界时拆分，例如 field catalog、option catalog、warning catalog、output catalog。
   - 拆分后必须保证 `get_agent_guidance` 返回形态不漂移。

5. **扩展真实语料门禁**
   - 真实语料 suite 是代表性可靠性门禁，不是逐字体或逐目录验收。
   - 保持对忽略文件分类、压缩包只计数不解压、copy-only organization、batch preview/write、输出结构审计的覆盖。
   - 不要把 4 个 fixed targets 或 10 个 sampled targets 误读成全量字体数；全量字体数来自 `testScope.corpusScan.supportedFontCount`。

## 每个切片的完成标准

- 只解决一个结构问题。
- 有对应 smoke 或文档检查，至少能防止同类误读回归。
- `npm run --silent check:compact -- --json` 通过。
- 涉及运行时行为、目录安全、批量语义或输出结构时，运行：

```sh
npm run smoke:real-corpus-suite -- <font-corpus-dir>
```

- 删除生成的 `.font-split-*` 测试目录，但保留 `.font-split-worklog`。
- 在 `.font-split-worklog/YYYY-MM-DD.md` 记录：
  - 改了什么。
  - 验证命令和关键结果。
  - 清理了哪些生成物。
  - 下一步目标。
  - 重要文件位置。
- 提交并推送。不要提交 `.font-split-worklog`、`HANDOFF.local.md`、测试输出目录或真实字体资源。

## 不要做的事

- 不要把 `organize_font_directory.outputDir` 当成最终 web-font 拆分输出。
- 不要只凭 `ok:true` 报告完成。
- 不要在没有 smoke guard 的情况下改多处重复文案。
- 不要在同一个 commit 里混合运行时重构、文档重写和测试框架调整。
- 不要为了前向兼容保留已经无用或会误导 agent 的冗余路径；项目尚未正式发布，可以直接修正。
