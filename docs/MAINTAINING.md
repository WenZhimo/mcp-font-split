# Maintainer Structure Guide

This document is for maintainers and AI agents taking over the repository. It does not repeat the API reference; it explains where project facts live, how files are layered, and how to land structure improvements safely.

## Reading Order

| Need | Start here |
|------|------------|
| User-facing overview, installation, common workflows | `README.md` |
| English entry point | `README.en.md` |
| MCP arguments, response fields, error shapes | `API.md` / `API.zh-CN.md` |
| High-risk and non-intuitive behavior | `BEHAVIOR.zh-CN.md` |
| Maintainer structure, verification, slicing order | This document |
| Follow-up structural issue categories and backlog | `docs/STRUCTURE-ACTION-PLAN.md` |
| Local handoff log | `.font-split-worklog/YYYY-MM-DD.md`, never commit |

## Current Code Layers

| File or directory | Responsibility |
|-------------------|----------------|
| `src/server.js` | MCP schema and public tool descriptions. Confirm input types and user-visible tool wording here. |
| `src/font-split.js` | Runtime facade that re-exports `splitFont`, `splitFontBatch`, `inspectFontInputs`, `organizeFontDirectory`, guidance, runtime, and status helpers. Keep this file light; new runtime boundaries should live in dedicated modules. |
| `src/config.js` | Defaults, workflow presets, explicit option validation, and configuration traces. |
| `src/batch-runtime.js`, `src/batch.js` | `split_font_batch` runtime orchestration, batch scanning, naming, dedupe, skip checks, batch decisions, and debug decision logs. |
| `src/font-identity.js` | Font identity, OpenType name data, WOFF/WOFF2 decompression, glyph and kern helpers. |
| `src/font-identity-response-field-catalog.js` | Font identity response field entries, including `identityBasis`. |
| `src/single-runtime.js`, `src/single-split-output.js`, `src/split-config.js` | `split_font` single-font runtime orchestration, fallback / copy-original output writing, and cn-font-split config generation. |
| `src/input-preflight.js`, `src/input-*.js` | `inspect_font_inputs` runtime orchestration, input scanning, source layout preflight, ignored-file summaries, and input decisions. |
| `src/organization-runtime.js`, `src/organization-*.js` | `organize_font_directory` runtime orchestration, copy-only organization planning, organization manifests, and source-layout route decisions. |
| `src/output-audit.js` | Output role detection and split-output structure audits. |
| `src/agent-response-fields-to-check.js` | Agent-facing `get_agent_guidance.responseFieldsToCheck` checklist. Keep this focused on field names agents should inspect. |
| `src/project-status-notice.js` | Agent-facing `get_agent_guidance.projectStatusNotice` release status facts. Keep formal release status, current-source authority, and forward-compatibility policy here. |
| `src/tool-safety-quick-reference.js` | Agent-facing `get_agent_guidance.toolSafetyQuickReference` facts. Keep write-scope, source-destructive, and organizer-staging safety claims here. |
| `src/output-result-shape-quick-reference.js` | Agent-facing `get_agent_guidance.outputResultShapeQuickReference` facts. Keep `ok:true`, fallback, `copy-original`, skip, and collected-error interpretation here. |
| `src/guidance.js` | Guidance view and section selection only. Do not put catalog builders or returned guidance facts here. |
| `src/workflow-preset-catalog.js` | Workflow preset facts plus `get_agent_guidance.workflowPresets` catalog builder. |
| `src/unsupported-file-catalog.js` | Unsupported-file category facts plus `get_agent_guidance.unsupportedFileCategoryCatalog` builder. |
| `src/warning-code-catalog.js`, `src/error-response-catalog.js`, `src/diagnostic-catalogs.js` | Warning-code and structured error-response facts. `warning-code-catalog.js` owns `warningCodeCatalog` entries only; `error-response-catalog.js` owns `errorResponseCatalog` entries only; `diagnostic-catalogs.js` stays a light re-export layer so existing import paths do not drift. |
| `src/guidance*.js`, `src/agent-workflow-guidance.js`, `src/local-verification-guidance.js`, `src/local-verification-response-field-catalog.js`, `src/core-response-field-catalog.js`, `src/directory-organization-quick-answer.js`, `src/guidance-inspect-fields.js`, `src/safe-invocation-templates.js`, `src/workflow-quick-start.js`, `src/workflow-plan.js`, `src/next-tool-decision-summary.js`, `src/source-input-response-field-catalog.js`, `src/batch-response-field-catalog.js`, `src/batch-policy-response-field-catalog.js`, `src/batch-shared-response-field-catalog.js`, `src/output-audit-response-field-catalog.js`, `src/directory-workflow-guidance.js`, `src/configuration-recipes-guidance.js`, `src/guidance-response-field-catalog.js`, `src/runtime-status-response-field-catalog.js`, `src/catalogs.js`, `src/font-format-catalog.js`, `src/guidance-section-catalog.js`, `src/tool-response-field-catalog.js`, `src/tool-option-catalog.js`, `src/tool-option-enum-catalog.js`, `src/workflow-preset-catalog.js`, `src/diagnostic-catalogs.js`, `src/font-identity-basis-catalog.js`, `src/output-structure-catalog.js`, `src/unsupported-file-catalog.js`, `src/directory-handling-catalog.js` | Machine-readable guidance, agent workflow guidance, local verification guidance, local verification response field facts, tool-level core response field facts, directory organization quick-answer facts, shared guidance inspect-field helper facts, safe invocation templates, workflow quick-start examples, recommended workflow plans, next-tool decision summaries, source input scan response field facts, batch response field facts, shared batch policy response field facts, shared batch dedupe and recommendation response field facts, output audit response field facts, directory workflow routing guidance, configuration recipes, get-agent-guidance and runtime-status response field facts, supported font format facts, guidance section catalogs, field catalogs, warning catalogs, option catalogs, option enum facts, workflow preset catalogs, unsupported-file category catalogs, directory handling catalogs, and agent examples. `src/agent-guidance.js` remains the final `get_agent_guidance` assembly layer; `src/agent-workflow-guidance.js` owns concise path rules and per-workflow recommended step strings; `src/local-verification-guidance.js` owns maintenance checklists and real-corpus output interpretation; `src/local-verification-response-field-catalog.js` owns npm-script verification output field entries; `src/core-response-field-catalog.js` owns `ALL_TOOL_NAMES`, `ok`, and `workspace`; `src/directory-organization-quick-answer.js` owns the compact source-layout mismatch answer and safety contract; `src/guidance-inspect-fields.js` owns reusable inspect-field sets and source-layout decision checklist injection used by guidance builders; `src/safe-invocation-templates.js` owns reusable safe tool-call templates for source preflight, organization previews, reviewed writes, and output audits; `src/workflow-quick-start.js` owns quick-start call examples and per-workflow recommended example routing; `src/workflow-plan.js` owns recommended workflow plans for overview, single, batch, inspect, and organization modes; `src/next-tool-decision-summary.js` owns the compact first-tool routing index returned by `get_agent_guidance`; `src/source-input-response-field-catalog.js` owns source scan, unsupported-file, and input count response field entries shared by inspect, batch, and organization flows; `src/batch-response-field-catalog.js` owns split_font_batch-only decision, plan, result, skip, and incremental-reprocess fields; `src/batch-policy-response-field-catalog.js` owns batch/organization-shared policy, configuration trace, dedupe summary, workflow preset, and batch mode fields; `src/batch-shared-response-field-catalog.js` owns shared batch dedupe and recommendation response fields such as `skippedDuplicates` and `recommendedBatchOptions`; `src/output-audit-response-field-catalog.js` owns inspect_split_output response field entries and keeps the adjacent output-structure guidance catalog in aggregate order; `src/directory-workflow-guidance.js` owns source-layout routing matrices and examples; `src/configuration-recipes-guidance.js` owns `configurationRecipes`; `src/guidance-response-field-catalog.js` owns `get_agent_guidance`-only field catalog entries; `src/runtime-status-response-field-catalog.js` owns `get_runtime_status`-only field catalog entries. `src/catalogs.js` remains the public catalog aggregation and re-export layer; `src/tool-response-field-catalog.js` remains the aggregated response-field catalog and imports split field groups as they are extracted. |
| `src/core-response-field-catalog.js` | Tool-level response field entries shared by all or foundational tools, including `ALL_TOOL_NAMES`, `ok`, and `workspace`. |
| `src/input-preflight-response-field-catalog.js` | `inspect_font_inputs` route response field entries, including `inputDirectoryDecision` and `inputDirectoryDecision.directoryOrganizationSafety`. |
| `src/inspection-warning-response-field-catalog.js` | Shared inspect-input/output-audit warning response field entries, including `inspectionWarnings` and `inspectionWarningCount`. |
| `src/source-layout-response-field-catalog.js` | Shared source-layout and preview-argument response field entries, including `recommendedBatchPreviewArgs`, `layout`, and `layout.layoutKind`. |
| `src/workflow-action-response-field-catalog.js` | Shared workflow/action response field entries for scan truncation, dry-run state, recommended next actions, suggested-args provenance, and plan visibility. |
| `src/result-shape-response-field-catalog.js` | Shared split result-shape response field entries, including `resultType`, `outputMode`, fallback/skipped signals, per-font warnings, and `manifestPath`. |
| `src/source-safety-response-field-catalog.js` | Batch/organization shared source-safety and write-scope response field entries, including non-destructive source guarantees and output tree write signals. |
| `src/organization-response-field-catalog.js` | `organize_font_directory` response field entries for organization warnings, copy/staging state, layout decisions, source-layout mismatch workflow, plan visibility, and parse-limited dedupe signals. |
| `src/smoke/` | Local verification scenarios. Add smoke guards here when changing user-visible behavior, field contracts, or real-corpus interpretation. |

## Source Of Truth Rules

- Runtime behavior is proven by code and smoke results; docs should describe verified behavior.
- MCP input schema is governed by `src/server.js` and `src/config.js`.
- Response-field meaning must align across actual responses, `toolResponseFieldCatalog`, `outputResultShapeQuickReference`, and the API docs.
- Keep README as an entry point and risk index; do not move field-level definitions back into it.
- `BEHAVIOR.zh-CN.md` can explain non-intuitive behavior in depth, but it should not be the only source of a contract.
- After changing guidance or catalogs, smoke checks should prove referenced fields exist and are explained.

## Response Field Catalog Boundaries

When adding or moving response-field explanations, decide which catalog owns the fact before editing. Do not move detailed field facts back into aggregate layers.

| File | Boundary |
|------|----------|
| `src/tool-response-field-catalog.js` | Aggregated response-field catalog entry point. It should import and merge field groups, not carry large amounts of concrete field meaning. Add new fields to a tool-specific or shared catalog first. |
| `src/*-response-field-catalog.js` | Primary home for tool-specific or domain-specific field facts. For example, `output-audit-response-field-catalog.js` owns `inspect_split_output` fields, `source-input-response-field-catalog.js` owns shared input-scan fields, and `batch-response-field-catalog.js` owns `split_font_batch`-only fields. |
| shared / core / result-shape / source-safety catalogs | Put cross-tool shared field facts here, such as `core-response-field-catalog.js`, `source-safety-response-field-catalog.js`, `result-shape-response-field-catalog.js`, `batch-policy-response-field-catalog.js`, and `batch-shared-response-field-catalog.js`. |
| `src/guidance-response-field-catalog.js` | Owns `get_agent_guidance`-only fields, guidance shape fields, guidance catalog entry explanations, and agent workflow guidance fields. Do not mix runtime tool-specific response fields into this file. |
| `src/runtime-status-response-field-catalog.js` | Owns `get_runtime_status`-only fields such as Node, package, WASM, and runtime availability facts. |
| `src/catalogs.js` | Public catalog aggregation and re-export layer. Keep it lightweight; do not use it as a fact dump. |

When adding a public response field, also check:

- The actual tool response, API docs, and `toolResponseFieldCatalog` use the same field path.
- If the field belongs to `get_agent_guidance`, it appears from the guidance catalog or guidance builder, and `npm run smoke:agent-guidance` proves the top-level path did not drift.
- If the field belongs to a runtime tool, add or reuse the relevant targeted smoke; field-contract or documentation-entry changes should also run `npm run smoke:api-docs`.
- Aggregate layers connect fact sources; they should not duplicate field meanings that already live in owned catalogs.

## Structure Action Order

1. **Close the current slice**
   - Clean worktree.
   - `npm run --silent check:compact -- --json` passes.
   - Behavior-facing changes run the real-corpus suite.
   - Generated `.font-split-*` directories are cleaned, preserving `.font-split-worklog`.
   - Worklog is updated, then the slice is committed and pushed.

2. **Reduce documentation drift**
   - Add smoke guards for high-risk statements repeated across README, API, BEHAVIOR, guidance, and catalogs.
   - Prioritize source-destructive safety, organization staging versus final output, `ok:true`, and copy-original / fallback / skip semantics.

3. **Keep runtime facade boundaries thin**
   - `src/font-split.js` is now a public facade. Keep new runtime logic out of it.
   - When a large runtime file needs to shrink, move one behavior boundary at a time: batch naming, dedupe, skip checks, output role detection, input preflight, or organization planning.
   - Keep public exports and MCP schema stable within the slice, and confirm smoke coverage before moving code.

4. **Split large catalog and guidance files**
   - `src/catalogs.js` should stay a lightweight aggregation and re-export layer.
   - `src/agent-guidance.js`, `src/tool-response-field-catalog.js`, and the workflow guidance modules are central to AI friendliness but remain large.
   - Keep `src/agent-response-fields-to-check.js` as a field-name checklist only; detailed meanings belong in response-field catalogs and API docs.
   - Split only along clear boundaries such as field catalog, option catalog, warning catalog, or output catalog.
   - Preserve `get_agent_guidance` response shape.

5. **Extend the real-corpus gate**
   - The real-corpus suite is a representative reliability gate, not per-font or per-directory acceptance.
   - Preserve coverage for ignored-file categories, count-only archive handling, copy-only organization, batch preview/write, and output structure audits.
   - Do not mistake fixed or sampled target counts for the full font count; the full count comes from `testScope.corpusScan.supportedFontCount`.

## Structure Action Plan

Follow-up structural issue categories, priorities, and backlog now live in [`docs/STRUCTURE-ACTION-PLAN.md`](./STRUCTURE-ACTION-PLAN.md). This guide keeps code layering, source-of-truth rules, and slice completion standards.

## Verification Entry Quick Reference

Choose verification entry points by the surface changed. Keep these maintainer-level details out of README; README should stay a user entry point with only necessary risk notes.

| Change type | Recommended verification | Notes |
|-------------|--------------------------|-------|
| Fast general checks | `npm run check:syntax`; `npm run check:compact -- --json` | `check:syntax` checks syntax only; `check:compact` runs syntax plus the full smoke suite with compact output and is the default pre-close gate. |
| Documentation contract checks | `npm run smoke:api-docs`; `npm run smoke:behavior-docs` | Run when changing API field descriptions, behavior notes, README boundaries, or repeated high-risk prose. |
| Agent / guidance contract checks | `npm run smoke:agent-guidance` | Run when changing `get_agent_guidance`, catalogs, quick references, workflow guidance, or response-field explanations. |
| Output directory structure checks | `npm run smoke:inspect-structure`; `npm run smoke:inspect-organized-staging` | Run when changing `inspect_split_output`, output layouts, manifest coverage, stale-residue diagnostics, or organizer-staging misuse guidance. |
| Real-corpus reliability checks | `npm run smoke:real-corpus-suite -- C:\Users\LENOVO\Downloads\字体` | Run when runtime behavior, output structure, batch semantics, directory safety, ignored-file interpretation, or real-corpus explanations change; this is a representative gate, not per-font manual acceptance. |
| Close / pre-commit combination | `npm run check:compact -- --json`; relevant targeted smoke; real corpus suite when needed | Every slice should pass compact check; add targeted smoke for the changed surface. If runtime behavior, output structure, batch semantics, directory safety, or real-corpus interpretation changed, also run the real-corpus suite. |

`npm run check:compact -- --json` runs `check:syntax` and the full `check:smoke` suite internally. It suppresses noisy child output on success and returns the failing step plus stdout/stderr tails on failure. When debugging, rerun the failed npm script directly for full output.

## Slice Completion Standard

- Solve one structure problem.
- Add or reuse a smoke/doc check that prevents the same misunderstanding from returning.
- Pass `npm run --silent check:compact -- --json`.
- If runtime behavior, directory safety, batch semantics, or output structure changed, run:

```sh
npm run smoke:real-corpus-suite -- <font-corpus-dir>
```

- Remove generated `.font-split-*` test directories, preserving `.font-split-worklog`.
- Update `.font-split-worklog/YYYY-MM-DD.md` with what changed, verification results, cleanup status, next target, and important file paths.
- Commit and push. Never commit `.font-split-worklog`, `HANDOFF.local.md`, generated output directories, or real font resources.

## Do Not

- Do not treat `organize_font_directory.outputDir` as final web-font split output.
- Do not report completion from `ok:true` alone.
- Do not change repeated high-risk prose without a smoke guard.
- Do not mix runtime refactors, documentation rewrites, and test framework changes in one commit.
- Do not change stable MCP behavior without documenting the compatibility impact and updating the version appropriately.
