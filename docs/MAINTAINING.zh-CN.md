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
| `src/font-identity-response-field-catalog.js` | 字体 identity 响应字段条目，包括 `identityBasis`。 |
| `src/single-runtime.js`、`src/single-split-output.js`、`src/split-config.js` | `split_font` 单字体运行时编排、fallback / copy-original 输出写入和 cn-font-split 配置生成。 |
| `src/input-preflight.js`、`src/input-*.js` | `inspect_font_inputs` 运行时编排、输入扫描、输入目录判断、忽略文件摘要和目录结构预检。 |
| `src/organization-runtime.js`、`src/organization-*.js` | `organize_font_directory` 运行时编排、copy-only 计划、manifest 和目录路线判断。 |
| `src/output-audit.js` | `inspect_split_output` 输出目录角色判断和结构审计。 |
| `src/agent-response-fields-to-check.js` | 面向 agent 的 `get_agent_guidance.responseFieldsToCheck` 检查清单。这里只放建议检查的字段名。 |
| `src/project-status-notice.js` | 面向 agent 的 `get_agent_guidance.projectStatusNotice` 预发布状态事实。正式发布状态、当前事实来源和前向兼容策略放在这里。 |
| `src/tool-safety-quick-reference.js` | 面向 agent 的 `get_agent_guidance.toolSafetyQuickReference` 安全速查事实。写入范围、是否破坏源文件和整理暂存安全结论放在这里。 |
| `src/output-result-shape-quick-reference.js` | 面向 agent 的 `get_agent_guidance.outputResultShapeQuickReference` 输出形态速查事实。`ok:true`、fallback、`copy-original`、skip 和收集错误的解释放在这里。 |
| `src/guidance.js` | 只负责 guidance view 构造和 section 选择。不要把 catalog builder 或返回事实放回这里。 |
| `src/workflow-preset-catalog.js` | workflow preset 事实，以及 `get_agent_guidance.workflowPresets` catalog builder。 |
| `src/unsupported-file-catalog.js` | 忽略文件分类事实，以及 `get_agent_guidance.unsupportedFileCategoryCatalog` builder。 |
| `src/guidance*.js`、`src/agent-workflow-guidance.js`、`src/local-verification-guidance.js`、`src/local-verification-response-field-catalog.js`、`src/core-response-field-catalog.js`、`src/directory-organization-quick-answer.js`、`src/guidance-inspect-fields.js`、`src/safe-invocation-templates.js`、`src/workflow-quick-start.js`、`src/workflow-plan.js`、`src/next-tool-decision-summary.js`、`src/source-input-response-field-catalog.js`、`src/batch-response-field-catalog.js`、`src/batch-policy-response-field-catalog.js`、`src/batch-shared-response-field-catalog.js`、`src/output-audit-response-field-catalog.js`、`src/directory-workflow-guidance.js`、`src/configuration-recipes-guidance.js`、`src/guidance-response-field-catalog.js`、`src/runtime-status-response-field-catalog.js`、`src/catalogs.js`、`src/font-format-catalog.js`、`src/guidance-section-catalog.js`、`src/tool-response-field-catalog.js`、`src/tool-option-catalog.js`、`src/tool-option-enum-catalog.js`、`src/workflow-preset-catalog.js`、`src/diagnostic-catalogs.js`、`src/font-identity-basis-catalog.js`、`src/output-structure-catalog.js`、`src/unsupported-file-catalog.js`、`src/directory-handling-catalog.js` | 面向 AI agent 的机器可读指南、agent 工作流指南、本地验证指南、本地验证响应字段事实、工具级核心响应字段事实、目录整理短答案事实、共享 guidance inspect-field 辅助事实、安全调用模板、工作流 quick-start 示例、推荐 workflow plan、下一工具决策摘要、源输入扫描响应字段事实、批量响应字段事实、共享批量策略响应字段事实、共享批量去重和推荐响应字段事实、输出审计响应字段事实、目录工作流路由指南、配置 recipes、get-agent-guidance 与 runtime-status 响应字段事实、支持字体格式事实、guidance section 目录、字段目录、警告目录、选项目录、选项枚举事实、工作流 preset 目录、忽略文件分类目录、目录处理目录和示例。`src/agent-guidance.js` 保留最终 `get_agent_guidance` 组装层；`src/agent-workflow-guidance.js` 负责简短路径规则和按 workflow 返回的推荐步骤文本；`src/local-verification-guidance.js` 负责维护检查清单和真实语料输出解释；`src/local-verification-response-field-catalog.js` 负责 npm 脚本验证输出字段目录条目；`src/core-response-field-catalog.js` 负责 `ALL_TOOL_NAMES`、`ok` 和 `workspace`；`src/directory-organization-quick-answer.js` 负责源目录结构不匹配的紧凑答案和安全契约；`src/guidance-inspect-fields.js` 负责 guidance builder 复用的 inspect-field 集合和源目录决策 checklist 注入；`src/safe-invocation-templates.js` 负责源预检、目录整理预览、reviewed write 和输出审计等可复用安全调用模板；`src/workflow-quick-start.js` 负责 quick-start 调用示例和按 workflow 推荐示例的路由；`src/workflow-plan.js` 负责 overview、single、batch、inspect 和 organization 模式的推荐 workflow plan；`src/next-tool-decision-summary.js` 负责 `get_agent_guidance` 返回的紧凑首个工具路由索引；`src/source-input-response-field-catalog.js` 负责 inspect、batch 和 organization 共享的源扫描、忽略文件、输入计数字段目录条目；`src/batch-response-field-catalog.js` 负责 split_font_batch 专属的决策、计划、结果、skip 和增量重处理字段；`src/batch-policy-response-field-catalog.js` 负责 batch / organization 共享的策略、配置来源、去重摘要、workflow preset 和批量模式字段；`src/batch-shared-response-field-catalog.js` 负责 `skippedDuplicates` 和 `recommendedBatchOptions` 等共享批量去重与推荐响应字段；`src/output-audit-response-field-catalog.js` 负责 inspect_split_output 响应字段目录条目，并保持相邻输出结构 guidance catalog 的聚合顺序；`src/directory-workflow-guidance.js` 负责源目录布局路由矩阵和示例；`src/configuration-recipes-guidance.js` 负责 `configurationRecipes`；`src/guidance-response-field-catalog.js` 负责 `get_agent_guidance` 专属字段目录条目；`src/runtime-status-response-field-catalog.js` 负责 `get_runtime_status` 专属字段目录条目。`src/catalogs.js` 保留公共目录聚合与 re-export；`src/tool-response-field-catalog.js` 保留聚合后的响应字段目录，并随着拆分继续导入已抽出的字段组。 |
| `src/core-response-field-catalog.js` | 工具级核心响应字段条目，包括 `ALL_TOOL_NAMES`、`ok` 和 `workspace`。 |
| `src/input-preflight-response-field-catalog.js` | `inspect_font_inputs` 路由响应字段条目，包括 `inputDirectoryDecision` 和 `inputDirectoryDecision.directoryOrganizationSafety`。 |
| `src/inspection-warning-response-field-catalog.js` | inspect input / output audit 共享 warning 响应字段条目，包括 `inspectionWarnings` 和 `inspectionWarningCount`。 |
| `src/source-layout-response-field-catalog.js` | 共享的源目录布局和 preview 参数响应字段条目，包括 `recommendedBatchPreviewArgs`、`layout` 和 `layout.layoutKind`。 |
| `src/workflow-action-response-field-catalog.js` | 共享 workflow/action 响应字段条目，包括扫描截断、dry-run 状态、recommended next actions、suggested args 来源和 plan 可见性。 |
| `src/result-shape-response-field-catalog.js` | 共享的 split 结果形状响应字段条目，包括 `resultType`、`outputMode`、fallback / skipped 信号、单字体 warnings 和 `manifestPath`。 |
| `src/source-safety-response-field-catalog.js` | batch / organization 共享的 source-safety 与 write-scope 响应字段条目，包括不破坏源文件的保证和输出目录写入信号。 |
| `src/organization-response-field-catalog.js` | `organize_font_directory` 专属响应字段条目，包括 organization warnings、copy/staging 状态、layout decision、source-layout mismatch 工作流、plan 可见性和 parse-limited dedupe 信号。 |
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

3. **保持运行时 facade 边界轻量**
   - `src/font-split.js` 现在是公共 facade，不再往里放新的运行时逻辑。
   - 如果大型运行时文件还需要拆薄，每次只移动一个行为边界，例如批量命名、去重、skip 检查、输出角色判断、输入预检或目录整理计划。
   - 保持公开导出和 MCP schema 不变，并先增加或确认 smoke 覆盖，再做移动。

4. **拆分大型 catalog / guidance 文件**
   - `src/catalogs.js` 应保持为轻量聚合与 re-export 层。
   - `src/agent-guidance.js`、`src/tool-response-field-catalog.js` 和 workflow guidance 模块是当前 AI 友好性的核心，但体积仍偏大。
   - `src/agent-response-fields-to-check.js` 只维护字段名检查清单；字段含义应放在响应字段目录和 API 文档里。
   - 只在有明确边界时拆分，例如 field catalog、option catalog、warning catalog、output catalog。
   - 拆分后必须保证 `get_agent_guidance` 返回形态不漂移。

5. **扩展真实语料门禁**
   - 真实语料 suite 是代表性可靠性门禁，不是逐字体或逐目录验收。
   - 保持对忽略文件分类、压缩包只计数不解压、copy-only organization、batch preview/write、输出结构审计的覆盖。
   - 不要把 4 个 fixed targets 或 10 个 sampled targets 误读成全量字体数；全量字体数来自 `testScope.corpusScan.supportedFontCount`。

## 结构问题分类行动计划

后续结构问题按下面类别推进。每次只选一个类别里的一个小切片，完成验证、清理、worklog、commit/push 后再进入下一项。

| 类别 | 要解决的问题 | 下一步行动 | 验证证据 |
|------|--------------|------------|----------|
| 文档组织 | README、英文入口、行为文档和维护者文档边界可能再次混杂。 | 保持 `README.md` 作为中文首页和快速入口，`README.en.md` 作为英文入口；配置错误、字段契约和非直觉行为继续放在 API / BEHAVIOR / 维护者文档中。 | `node src/smoke-test.js behavior-docs`、`node src/smoke-test.js api-docs`，并检查 README 没有重新变成字段参考手册。 |
| API / guidance 组织 | `get_agent_guidance` 信息量大，catalog、quick reference 和 workflow 建议容易重复事实。 | 继续按职责抽离工具安全提示、输出结果字段说明、agent 工作流建议、配置错误说明和目录结构说明；保持顶层返回字段不变。 | `node src/smoke-test.js agent-guidance`，并确认被抽离字段仍在原顶层路径。 |
| 输出目录结构 | 单文件、批量、跳过、去重、命名冲突后的目录形状需要稳定可审计。 | 继续增强 `inspect_split_output()` 的紧凑诊断，覆盖输出根层级、family/style/source 层级、manifest 覆盖和旧输出残留提示。 | `node src/smoke-test.js inspect-structure`、`node src/smoke-test.js inspect-organized-staging`，以及真实语料代表性写入审计。 |
| 测试组织 | smoke、真实语料、结构审计和文档检查边界可能随着新增 guard 变模糊。 | 按行为表面维护场景归属：文档契约、guidance 契约、真实语料可靠性、输出结构、批量语义、目录整理安全；每次只移动或新增一个场景家族。 | `node scripts/check-syntax.js`、`node scripts/run-check-compact.js --json`，并检查 `src/smoke/scenarios.js` 场景名不漂移。 |
| 真实语料覆盖 | 用户语料库有 500+ 字体目录，测试应代表真实复杂场景，而不是逐字体人工验收。 | 保持全根扫描加代表性采样：全量统计 supported/ignored，固定回归目标覆盖 `aexpective`、`tiny5`、`agu_display`、`architectural`，并保留一个 bounded write/audit 样本。 | `node src/smoke-test.js real-corpus-suite <font-corpus-dir>` 输出 full-root counts、target counts、16/16 functional coverage 和 7/7 tool coverage。 |
| 忽略文件统计 | 忽略文件不能只看 `.zip` / `.txt`，还要兼容文档、图片、网页、签名、无扩展名和 unsupported font-like 文件。 | 继续让 runtime summary、unsupported file catalog 和真实语料 suite 同步呈现 category count、extension count、extensions beyond `.zip` / `.txt` 和 archive handling scope。 | 真实语料 suite 输出 ignored category count、extension count、`extensionsBeyondZipTxtCount`、archive count 和 archivesExtracted/archiveInternalFontsCovered 标记。 |

## 结构清理 Backlog

当前切片收口后，从这个 backlog 继续。每一行都应尽量成为一个小提交，或一组边界非常接近的提交；不要把多行混到一次改动里，除非同一个 smoke guard 能证明它们都没有漂移。

| 优先级 | 范围 | 要解决的问题 | 建议切片 | 验证证据 |
|--------|------|--------------|----------|----------|
| P0 | 文档入口 | README、英文 README、API 文档、行为说明和维护者文档里有重复高风险说法，容易漂移。 | 保持 `README.md` 是紧凑中文入口，`README.en.md` 是英文入口；字段级和配置错误细节放到 API / 行为文档。修改重复高风险文案前，先增加或复用 smoke guard。 | `node src/smoke-test.js behavior-docs`、`node src/smoke-test.js api-docs`，以及针对 README 的 grep/diff，证明首页仍是入口而不是字段参考。 |
| P0 | Agent / API guidance 形态 | `get_agent_guidance` 很有价值但体积较大，后续编辑容易改变响应形态或在 guidance 模块间重复事实。 | 继续从 `src/agent-guidance.js`、`src/guidance.js` 和 catalog 聚合层抽离稳定的 quick-reference / catalog 边界，同时保持公开响应形态不变。 | `node src/smoke-test.js agent-guidance`，并确认被抽离字段仍出现在相同的顶层 guidance 路径。 |
| P0 | 输出目录结构 | 单字体输出、批量输出、整理暂存、跳过输出、fallback / copy-original 路径都需要明确的结构审计。 | 强化 `inspect_split_output()` 和 smoke 场景，覆盖目录角色判断、`structureSummary.conforms`、manifest 覆盖、误把整理暂存当最终输出，以及输出 layout kind。 | `node src/smoke-test.js inspect-structure`、`node src/smoke-test.js inspect-organized-staging`，以及真实语料代表性写入审计中 single / batch 输出均通过。 |
| P1 | 真实语料覆盖解释 | corpus suite 会抽样目标目录，但用户容易把小的 target 数量误读成全库字体数。 | 保持 `corpusCountGuide`、`reliabilityGateDecision` 和文档一致，清楚区分全根扫描数量与 fixed/adaptive target 数量。 | `node src/smoke-test.js real-corpus-suite <字体语料目录>` 输出全量 supported/ignored 数量、target 数量、`perDirectoryAcceptanceAudit:false` 和 16/16 功能覆盖。 |
| P1 | 忽略文件兼容性 | 忽略文件统计不能只覆盖 `.zip` 和 `.txt`，还要覆盖文档、图片、网页文件、签名、无扩展文件和解析失败的字体状文件。 | 保持忽略文件分类目录和运行时 summary 对齐；新增类别或扩展名处理规则时补回归覆盖。 | 真实语料 suite 输出 category count、extension count、`extensionsBeyondZipTxtCount`、archive count 和 archive handling flags。 |
| P1 | 测试组织 | smoke 场景已经很广，但继续增加行为 guard 时，场景归属边界要保持清楚。 | 按行为表面组织场景：文档契约、guidance 契约、真实语料可靠性、输出结构、批量语义、目录整理安全。每次只移动一个场景家族。 | `node scripts/check-syntax.js`、`node scripts/run-check-compact.js --json`，并确认 `src/smoke/scenarios.js` 中场景名不漂移。 |
| P2 | 运行时模块边界 | runtime 已经开始拆分，但后续 batch、organization、input-preflight 或 output-audit 改动仍可能重新形成大而混杂的模块。 | 只抽离边界明确的行为单元，例如命名、去重、skip 检查、source safety、输出角色判断或 organization planning。避免在同一 commit 混合行为变更和结构重构。 | 被触及 runtime 表面的 targeted smoke；如果涉及批量语义、目录安全或输出结构，再跑真实语料 suite。 |

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
