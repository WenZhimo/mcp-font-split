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
| Local handoff log | `.font-split-worklog/YYYY-MM-DD.md`, never commit |

## Current Code Layers

| File or directory | Responsibility |
|-------------------|----------------|
| `src/server.js` | MCP schema and public tool descriptions. Confirm input types and user-visible tool wording here. |
| `src/font-split.js` | Runtime facade that re-exports `splitFont`, `splitFontBatch`, `inspectFontInputs`, `organizeFontDirectory`, guidance, runtime, and status helpers. Keep this file light; new runtime boundaries should live in dedicated modules. |
| `src/config.js` | Defaults, workflow presets, explicit option validation, and configuration traces. |
| `src/batch-runtime.js`, `src/batch.js` | `split_font_batch` runtime orchestration, batch scanning, naming, dedupe, skip checks, batch decisions, and debug decision logs. |
| `src/font-identity.js` | Font identity, OpenType name data, WOFF/WOFF2 decompression, glyph and kern helpers. |
| `src/single-runtime.js`, `src/single-split-output.js`, `src/split-config.js` | `split_font` single-font runtime orchestration, fallback / copy-original output writing, and cn-font-split config generation. |
| `src/input-preflight.js`, `src/input-*.js` | `inspect_font_inputs` runtime orchestration, input scanning, source layout preflight, ignored-file summaries, and input decisions. |
| `src/organization-runtime.js`, `src/organization-*.js` | `organize_font_directory` runtime orchestration, copy-only organization planning, organization manifests, and source-layout route decisions. |
| `src/output-audit.js` | Output role detection and split-output structure audits. |
| `src/guidance*.js`, `src/catalogs.js`, `src/font-format-catalog.js`, `src/guidance-section-catalog.js`, `src/tool-response-field-catalog.js`, `src/tool-option-catalog.js`, `src/tool-option-enum-catalog.js`, `src/workflow-preset-catalog.js`, `src/diagnostic-catalogs.js`, `src/font-identity-basis-catalog.js`, `src/output-structure-catalog.js`, `src/unsupported-file-catalog.js`, `src/directory-handling-catalog.js` | Machine-readable guidance, supported font format facts, guidance section catalogs, field catalogs, warning catalogs, option catalogs, option enum facts, workflow preset catalogs, unsupported-file category catalogs, directory handling catalogs, and agent examples. `src/catalogs.js` remains the public catalog aggregation and re-export layer; the large font-format, guidance-section, response-field, option, option-enum, workflow-preset, diagnostic, identity-basis, output-structure, unsupported-file, and directory-handling catalogs live in dedicated files. |
| `src/smoke/` | Local verification scenarios. Add smoke guards here when changing user-visible behavior, field contracts, or real-corpus interpretation. |

## Source Of Truth Rules

- Runtime behavior is proven by code and smoke results; docs should describe verified behavior.
- MCP input schema is governed by `src/server.js` and `src/config.js`.
- Response-field meaning must align across actual responses, `toolResponseFieldCatalog`, `outputResultShapeQuickReference`, and the API docs.
- Keep README as an entry point and risk index; do not move field-level definitions back into it.
- `BEHAVIOR.zh-CN.md` can explain non-intuitive behavior in depth, but it should not be the only source of a contract.
- After changing guidance or catalogs, smoke checks should prove referenced fields exist and are explained.

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
   - `src/agent-guidance.js`, `src/tool-response-field-catalog.js`, and `src/guidance-workflows.js` are central to AI friendliness but remain large.
   - Split only along clear boundaries such as field catalog, option catalog, warning catalog, or output catalog.
   - Preserve `get_agent_guidance` response shape.

5. **Extend the real-corpus gate**
   - The real-corpus suite is a representative reliability gate, not per-font or per-directory acceptance.
   - Preserve coverage for ignored-file categories, count-only archive handling, copy-only organization, batch preview/write, and output structure audits.
   - Do not mistake fixed or sampled target counts for the full font count; the full count comes from `testScope.corpusScan.supportedFontCount`.

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
- Do not keep misleading compatibility paths only for forward compatibility; the project is not formally released yet.
