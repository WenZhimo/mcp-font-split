# Structure Action Plan

This document tracks the structural issues that should be handled separately. It is for maintainers and AI agents taking over the project. The goal is to keep future work in independently verified, independently committed slices instead of mixing documentation cleanup, runtime refactors, tests, and real-corpus validation in one large change.

## How To Use This Plan

- Pick one small slice from one category at a time.
- State which user-visible behavior or maintainer boundary the slice protects.
- Add or reuse a smoke / docs check that prevents the same confusion from returning.
- After verification, clean generated files, update the local worklog, then commit and push the slice independently.
- Do not commit `.font-split-worklog`, real font corpora, or generated `.font-split-*` output directories.

## Issue Categories

| Category | Problem to solve | Next action | Verification evidence |
|----------|------------------|-------------|-----------------------|
| Documentation organization | README, English entry, behavior docs, API docs, and maintainer docs can drift back into mixed responsibilities. | Keep `README.md` as the Chinese homepage and quick entry, keep `README.en.md` as the English entry, and keep configuration errors, field contracts, and non-intuitive behavior in API / BEHAVIOR / maintainer docs. | `node src/smoke-test.js behavior-docs`, `node src/smoke-test.js api-docs`, plus a README check showing it has not become a field reference manual again. |
| API / guidance organization | `get_agent_guidance` carries a lot of value, so catalogs, quick references, workflow plans, and next-tool summaries can duplicate facts. | Continue extracting tool safety notes, output result field explanations, agent workflow advice, configuration-error guidance, and directory-structure guidance by responsibility while preserving top-level response paths. | `node src/smoke-test.js agent-guidance`, plus checks that extracted fields still appear at the same top-level guidance paths. |
| Output directory structure | Single-file, batch, skipped, deduped, naming-collision, and stale-residue outputs need stable auditable directory shapes. | Continue strengthening compact `inspect_split_output()` diagnostics for output-root depth, family/style/source layers, manifest coverage, stale residue, and organizer-staging misuse. | `node src/smoke-test.js inspect-structure`, `node src/smoke-test.js inspect-organized-staging`, and real-corpus representative write audits. |
| Test organization | Smoke tests, real-corpus tests, structure audits, and docs checks can blur as more guards are added. | Keep scenarios grouped by behavior surface: docs contracts, guidance contracts, real-corpus reliability, output structure, batch semantics, and organization safety; move or add one scenario family at a time. | `node scripts/check-syntax.js`, `node scripts/run-check-compact.js --json`, and unchanged scenario naming in `src/smoke/scenarios.js`. |
| Real-corpus coverage | The user corpus has 500+ font directories, so tests should represent real complexity without becoming manual per-font acceptance. | Keep the full-root scan plus representative sampling: count all supported/ignored files, keep fixed regression targets for `aexpective`, `tiny5`, `agu_display`, and `architectural`, and preserve one bounded write/audit sample. | `node src/smoke-test.js real-corpus-suite <font-corpus-dir>` reports full-root counts, target counts, 16/16 functional coverage, and 7/7 tool coverage. |
| Ignored-file statistics | Ignored-file reporting must not stop at `.zip` / `.txt`; it needs documents, images, web files, signatures, extensionless files, and unsupported font-like files. | Keep runtime summaries, unsupported-file catalogs, and real-corpus output aligned around category count, extension count, extensions beyond `.zip` / `.txt`, and archive handling scope. | Real-corpus suite reports ignored category count, extension count, `extensionsBeyondZipTxtCount`, archive count, and archivesExtracted/archiveInternalFontsCovered flags. |

## Backlog

| Priority | Area | Suggested slice | Verification evidence |
|----------|------|-----------------|-----------------------|
| P0 | Documentation entry points | Preserve `README.md` as the Chinese homepage, `README.en.md` as the English entry, and API / BEHAVIOR as the detail surfaces; add or reuse smoke guards before changing repeated high-risk prose. | `behavior-docs`, `api-docs`, plus a targeted README grep / diff check. |
| P0 | Agent / API guidance shape | Continue extracting stable quick-reference / catalog / workflow boundaries without changing `get_agent_guidance` top-level response paths. | `agent-guidance`, plus exact field-path alignment assertions. |
| P0 | Output directory structure | Strengthen output-root role detection, `structureSummary.conforms`, manifest coverage, organizer-staging misuse, and layout-kind diagnostics. | `inspect-structure`, `inspect-organized-staging`, and real-corpus representative write audit. |
| P1 | Real-corpus coverage interpretation | Keep `corpusCountGuide`, `reliabilityGateDecision`, and docs aligned so output clearly separates full-root scan counts from fixed/adaptive target counts. | `real-corpus-suite` reports full supported/ignored counts, target counts, `perDirectoryAcceptanceAudit:false`, and 16/16 functional coverage. |
| P1 | Ignored-file compatibility | Keep ignored-file categorization in catalogs and runtime summaries aligned; add regression coverage whenever a new category or extension handling rule is introduced. | Real-corpus suite reports category count, extension count, `extensionsBeyondZipTxtCount`, archive count, and archive handling flags. |
| P1 | Test organization | Keep scenario files grouped by behavior surface; move only one scenario family at a time so test cleanup does not become a broad rearrangement. | `check-syntax`, `run-check-compact --json`, and `src/smoke/scenarios.js` scenario-name checks. |
| P2 | Runtime module boundaries | Extract only clear behavior units, such as naming, dedupe, skip checks, source safety, output role detection, or organization planning. | Targeted smoke for the touched runtime surface; real-corpus suite when batch semantics, directory safety, or output structure changes. |

## Slice Completion Standard

1. Solve one structure problem.
2. Add or reuse a smoke / docs check that prevents the same misunderstanding from returning.
3. Run `node scripts/run-check-compact.js --json`.
4. If runtime behavior, directory safety, batch semantics, real-corpus interpretation, or output structure changed, run `node src/smoke-test.js real-corpus-suite <font-corpus-dir>`.
5. Remove generated `.font-split-*` test directories, preserving `.font-split-worklog`.
6. Update `.font-split-worklog/YYYY-MM-DD.md` with what changed, verification results, cleanup status, and the next target.
7. Commit and push independently.
