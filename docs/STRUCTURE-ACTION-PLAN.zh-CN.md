# 结构问题行动计划

这份文档只追踪“建议后续单独处理”的结构问题。它面向维护者和接手项目的 AI agent，目标是把后续工作拆成可独立验证、可独立提交的小切片，避免把文档、运行时、测试和真实语料验证混在一次大改里。

## 使用方式

- 每次只选择一个类别中的一个小切片。
- 先写清楚该切片要保护的用户可见行为或维护边界。
- 补充或复用能防止同类问题回归的 smoke / docs 检查。
- 通过验证后清理生成物、更新本地 worklog、单独 commit / push。
- 不把 `.font-split-worklog`、真实字体语料、生成的 `.font-split-*` 输出目录提交进仓库。

## 问题分类

| 类别 | 要解决的问题 | 下一步行动 | 验证证据 |
|------|--------------|------------|----------|
| 文档组织 | README、英文入口、行为文档、API 文档和维护者文档边界可能再次混杂。 | 保持 `README.md` 作为中文首页和快速入口，`README.en.md` 作为英文入口；配置错误、字段契约和非直觉行为继续放在 API / BEHAVIOR / 维护者文档中。 | `node src/smoke-test.js behavior-docs`、`node src/smoke-test.js api-docs`，并检查 README 没有重新变成字段参考手册。 |
| API / guidance 组织 | `get_agent_guidance` 信息量大，catalog、quick reference、workflow plan 和 next-tool summary 容易重复事实。 | 继续按职责抽离工具安全提示、输出结果字段说明、agent 工作流建议、配置错误说明和目录结构说明；保持顶层返回字段不变。 | `node src/smoke-test.js agent-guidance`，并确认被抽离字段仍在原顶层路径。 |
| 输出目录结构 | 单文件、批量、跳过、去重、命名冲突和旧输出残留后的目录形状需要稳定可审计。 | 继续增强 `inspect_split_output()` 的紧凑诊断，覆盖输出根层级、family/style/source 层级、manifest 覆盖、旧输出残留和整理暂存误用。 | `node src/smoke-test.js inspect-structure`、`node src/smoke-test.js inspect-organized-staging`，以及真实语料代表性写入审计。 |
| 测试组织 | smoke、真实语料、结构审计和文档检查边界可能随着新增 guard 变模糊。 | 按行为表面维护场景归属：文档契约、guidance 契约、真实语料可靠性、输出结构、批量语义、目录整理安全；每次只移动或新增一个场景家族。 | `node scripts/check-syntax.js`、`node scripts/run-check-compact.js --json`，并检查 `src/smoke/scenarios.js` 场景名不漂移。 |
| 真实语料覆盖 | 用户语料库有 500+ 字体目录，测试应代表真实复杂场景，而不是逐字体人工验收。 | 保持全根扫描加代表性采样：全量统计 supported/ignored，固定回归目标覆盖 `aexpective`、`tiny5`、`agu_display`、`architectural`，并保留一个 bounded write/audit 样本。 | `node src/smoke-test.js real-corpus-suite <font-corpus-dir>` 输出 full-root counts、target counts、16/16 functional coverage 和 7/7 tool coverage。 |
| 忽略文件统计 | 忽略文件不能只看 `.zip` / `.txt`，还要兼容文档、图片、网页、签名、无扩展名和 unsupported font-like 文件。 | 继续让 runtime summary、unsupported file catalog 和真实语料 suite 同步呈现 category count、extension count、extensions beyond `.zip` / `.txt` 和 archive handling scope。 | 真实语料 suite 输出 ignored category count、extension count、`extensionsBeyondZipTxtCount`、archive count 和 archivesExtracted/archiveInternalFontsCovered 标记。 |

## Backlog

| 优先级 | 范围 | 建议切片 | 验证证据 |
|--------|------|----------|----------|
| P0 | 文档入口 | 守住 `README.md` 中文首页、`README.en.md` 英文入口、API / BEHAVIOR 细节承载的边界；重复高风险文案先加或复用 smoke guard。 | `behavior-docs`、`api-docs`，加上针对 README 的 grep / diff 检查。 |
| P0 | Agent / API guidance 形态 | 继续抽离稳定 quick-reference / catalog / workflow 边界，但不改变 `get_agent_guidance` 顶层响应路径。 | `agent-guidance`，以及具体字段路径对齐断言。 |
| P0 | 输出目录结构 | 强化输出根角色判断、`structureSummary.conforms`、manifest 覆盖、organizer staging 误用和 layout kind 诊断。 | `inspect-structure`、`inspect-organized-staging`、真实语料代表性写入审计。 |
| P1 | 真实语料覆盖解释 | 保持 `corpusCountGuide`、`reliabilityGateDecision` 和文档一致，清楚区分全根扫描数量与 fixed/adaptive target 数量。 | `real-corpus-suite` 报告 full supported/ignored counts、target counts、`perDirectoryAcceptanceAudit:false` 和 16/16 功能覆盖。 |
| P1 | 忽略文件兼容性 | 保持忽略文件分类目录和运行时 summary 对齐；新增类别或扩展名处理规则时补回归覆盖。 | 真实语料 suite 报告 category count、extension count、`extensionsBeyondZipTxtCount`、archive count 和 archive handling flags。 |
| P1 | 测试组织 | 保持 scenario 文件按行为表面组织；每次只移动一个场景家族，避免测试清理变成大规模重排。 | `check-syntax`、`run-check-compact --json`，以及 `src/smoke/scenarios.js` 场景名检查。 |
| P2 | 运行时模块边界 | 只抽离边界明确的行为单元，例如命名、去重、skip 检查、source safety、输出角色判断或 organization planning。 | 被触及 runtime 表面的 targeted smoke；涉及批量语义、目录安全或输出结构时跑真实语料 suite。 |

## 每个切片的完成标准

1. 只解决一个结构问题。
2. 加入或复用能防止同类误读回归的 smoke / docs 检查。
3. 运行 `node scripts/run-check-compact.js --json`。
4. 涉及运行时行为、目录安全、批量语义、真实语料解释或输出结构时，运行 `node src/smoke-test.js real-corpus-suite <font-corpus-dir>`。
5. 清理生成的 `.font-split-*` 测试目录，保留 `.font-split-worklog`。
6. 更新 `.font-split-worklog/YYYY-MM-DD.md`，记录改动、验证、清理和下一步。
7. 单独 commit / push。
