# Full Behavior Notes (High-Risk / Non-Intuitive Behavior)

> [!WARNING]
> **This file describes the current behavior of `mcp-font-split`.**
>
> It documents what the tool does today, not an idealized font-splitting model. It covers capabilities, safety defaults, fallback behavior, manifest semantics, batch skip policy, output audits, and behavior that may surprise callers.

## Reading Map

| Need | Start here |
|------|------------|
| What the MCP server exposes | Sections 1-3 |
| Configuration defaults, invalid values, `workflowPreset`, and batch policy | Section 4; invalid explicit values are rejected by MCP schema or by `FontSplitConfigurationError` in direct module calls |
| Single-font, batch, organization, and output-audit workflows | Sections 5-9 |
| Non-intuitive behavior that needs review | Sections 10-11 |
| Recommended batch option combinations | Section 12 |

Field-level API details live in [API.md](./API.md). The README stays an entry point for installation, common workflows, and major risks.

---

## 1. Capability Overview

The MCP server exposes 7 tools, 6 documentation resources, and 1 workflow prompt.

| Tool | Purpose |
|------|---------|
| `get_agent_guidance` | Returns machine-readable workflow guidance for AI coding assistants. |
| `get_runtime_status` | Returns read-only diagnostics for workspace, Node engine compatibility, package versions, platform, and WASM availability. |
| `split_font` | Processes one font file. |
| `inspect_font_inputs` | Scans source fonts without writing output; reports parse status, identity hints, invalid fonts, layout, ignored files, and recommended next steps. |
| `split_font_batch` | Scans, dedupes, groups, names, skips, and processes many font files. |
| `organize_font_directory` | Plans or copy-organizes source fonts into source-like staging when the source layout is not suitable for direct batch processing. |
| `inspect_split_output` | Summarizes and structurally audits generated split output. |

Documentation resources are `font-split://docs/readme.zh-CN`, `font-split://docs/readme.en`, `font-split://docs/api.en`, `font-split://docs/api.zh-CN`, `font-split://docs/behavior.zh-CN`, and `font-split://docs/behavior.en`. The `safe-batch-workflow` prompt generates the inspect -> safe-preview -> reviewed-write -> output-audit route.

Tool calls return both `structuredContent` and backward-compatible JSON text in `content[0].text`. New clients should prefer `structuredContent`; older clients can continue parsing the JSON text. Tool errors use the same dual shape with `isError: true`, so callers should route by `structuredContent.errorType` when available.

`get_agent_guidance.interfaceContract` is the machine-readable stability index. `stable` fields are the core machine contract for formal 1.0 releases and appear in tool `outputSchema`; `diagnostic` fields are troubleshooting and audit evidence that may grow or become more precise; `experimental` fields are unstable helper details outside the stable contract.

`split_font` does not always produce normal multi-subset web-font output. Depending on options and font state, the result may be:

- Normal subset output: `outputMode = "subset"`
- Single WOFF2 fallback: `outputMode = "single-woff2"`
- Copy-original record only: `outputMode = "copy-original"`

---

## 2. Path and Workspace Rules

All paths are constrained to `FONT_SPLIT_ROOT`.

If `FONT_SPLIT_ROOT` is not set, the workspace defaults to the MCP server process working directory.

When responses need to represent the workspace root, they use `.` rather than an empty string. This includes `inputDir`, `outputDir`, and follow-up arguments under `recommendedNextActions[].suggestedArgs`.

Users should explicitly configure `FONT_SPLIT_ROOT` for their font workspace. AI agents should not guess or hardcode private local paths.

---

## 3. Agent-Facing Guidance

`get_agent_guidance` is read-only. In compact mode it returns the decision-critical sections used by agents:

- Workspace and path rules
- Supported extensions
- `interfaceContract`
- `projectStatusNotice`
- Safe defaults and workflow presets
- `toolSafetyQuickReference`
- `directoryOrganizationQuickAnswer`
- `batchPolicyGuide`
- `batchCustomizationQuickReference[]`
- `outputResultShapeQuickReference`
- `unsupportedFileCategoryCatalog`
- `fontIdentityBasisCatalog`
- `outputStructureCatalog`
- `safeInvocationTemplates[]`
- `nextToolDecisionSummary`
- `recommendedWorkflowPlan`
- `localVerificationOutputGuide`
- `errorResponseCatalog`
- `responseFieldsToCheck`

When an agent is unsure whether to use a single-font, batch, input-preflight, organization, or output-audit workflow, it should call `get_agent_guidance` first and inspect the relevant `successCriteria` before reporting completion.

`projectStatusNotice` is the formal release status notice:

- `formalRelease: true`
- Stable tools, defaults, documented error types, and stable response fields are compatibility commitments.
- Authoritative sources are current repository code, live MCP schema, `get_agent_guidance`, `get_agent_guidance.interfaceContract`, API docs, and behavior docs.
- Diagnostic fields may grow or become more precise, and experimental fields remain outside the stable contract.

---

## 4. Configuration and Stability

Invalid explicit configuration is rejected. MCP calls are validated by the tool schema first. If a caller bypasses MCP and calls module functions directly, invalid enum, boolean, or numeric values throw `FontSplitConfigurationError` with `details.summaryType: "configuration-error"`.

To use default behavior, omit the option. Do not pass placeholder enum values, string booleans, or invalid numbers.

### Field Stability Tiers

| Tier | Meaning | Compatibility expectation |
|------|---------|---------------------------|
| `stable` | Core machine-consumption contract exposed through `outputSchema`. | Do not remove, rename, or change type without a breaking-change note and version bump. |
| `diagnostic` | Troubleshooting evidence, warnings, summaries, catalogs, and audit detail. | May grow or become more precise; clients should not depend on exact membership or wording. |
| `experimental` | Unstable helper details for agent iteration and local debugging. | Outside the stable contract; may change with release notes. |

Starting with 1.0.0, treat these as breaking changes for the stable core: removing a tool, renaming a tool, removing or renaming a stable field, changing a stable field type, changing a default write policy, or changing documented error `errorType` values. Additive fields, new diagnostic warnings, new resources, and stricter validation for previously invalid input are non-breaking when the stable core remains intact.

---

## 5. Batch Workflow

`split_font_batch` scans source files, filters supported font extensions, applies batch dedupe, calculates group/output names, checks existing output, and then either returns a dry-run plan or writes output.

Important defaults:

- Raw `split_font_batch` defaults to `dryRun: true`.
- `workflowPreset: "safe-preview"` is the normal first call for unfamiliar sources.
- `workflowPreset: "reviewed-write"` is the write-oriented preset after preview review.
- `batchNamingMode` defaults to `numeric-suffix`.
- `batchDedupeMode` defaults to `font-identity`.
- `batchErrorMode` defaults to `fail-after`.
- `skipMode` defaults to `manifest`.

`ok: true` only means the selected policy completed. It does not mean every font produced normal subset output, and it does not mean warnings/errors are absent. Inspect `batchDecision`, `batchWarnings`, `errorCount`, `errors`, `dedupeDecisionSummary`, `sourceSafetyDecision`, and `safetySummary`.

---

## 6. Batch Naming and Dedupe

`batchNamingMode`:

- `plain`: use bare names; no automatic suffixes.
- `numeric-suffix`: use bare names first; add `-1`, `-2`, and so on only on real collisions.
- `source-suffix`: use source-derived suffixes only when explicitly selected.

`batchDedupeMode`:

- `none`: keep every supported source font.
- `same-path`: path/stem-level dedupe for multi-format files with the same source path stem.
- `font-identity`: semantic cross-format dedupe for equivalent fonts.

`font-identity` compares normalized font identity across formats. It first uses OpenType name IDs 16/17, falls back to name IDs 1/2, then to name ID 4, name ID 6, or family-only. `glyphCount` is diagnostic only; it does not split otherwise equivalent OTF/TTF/WOFF inputs.

---

## 7. Directory Organization

`organize_font_directory` is not a split tool. It never calls cn-font-split, never generates web-font chunks, and never creates `result.css`.

It is source-non-destructive:

- It does not move source font files.
- It does not delete source font files.
- It does not rewrite source font files.
- In `reviewed-write` or `dryRun:false`, it copies selected fonts into `outputDir`.

The organizer output is source-like staging, not final split output. If the staging directory contains `font-organization-manifest.json`, `inspect_split_output` reports it as `organized-font-source-staging`; inspect it with `inspect_font_inputs`, then run `split_font_batch` safe-preview before any reviewed split write.

---

## 8. Output Audits

`inspect_split_output` audits generated split output. It is not the right validator for organizer staging.

Before reporting output as complete, inspect:

- `outputRoleDecision`
- `outputStructureDecision`
- `auditStatus`
- `auditPassed`
- `auditBlockingReasons`
- `structureSummary`
- `maxFilesHit`
- `inspectionWarnings`

For strict success, require `outputStructureDecision.status: "pass"`, `auditStatus: "pass"`, `auditPassed: true`, no scan truncation, and a conforming `structureSummary`.

`structureSummary.staleResidueDiagnosis` distinguishes ordinary stray files from generated-looking stale residue left by old output runs.

---

## 9. Real Corpus Testing

`smoke:real-corpus-suite` is a representative reliability gate over a rich local font corpus. It is not a promise that every directory has been manually inspected and it does not extract archives.

Read these fields first:

- `reliabilityGateDecision`
- `corpusCountGuide`
- `testScope`
- `coverageSummary.functionalCoverage[]`
- `coverageSummary.toolCoverageSummary`
- `coverageSummary.unsupportedFileCategoryCoverage`
- `coverageSummary.archiveHandlingScope`
- `coverageSummary.outputStructureAuditSummary`
- `runSummaries`
- `omittedDetailFields`

If archive files are present, they are counted and categorized as ignored unsupported files. `archivesExtracted` should remain false unless a future explicit archive workflow is added.

---

## 10. Common Misreads

- `ok: true` is not proof of normal subset output.
- `usedFallback: true` means fallback output was used; `copy-original` is not a normal subset result.
- `dryRun: true` previews and should not create output files.
- `writesSourceTree: true` can mean the configured output tree is inside the input tree; it does not mean source font files were modified.
- `organize_font_directory.outputDir` is staging, not final split output.
- `includeResults:false`, `includeFiles:false`, and `includeFamilies:false` intentionally omit large detail arrays.
- `maxFilesHit:true` means counts/audits may be incomplete.
- `batchErrorMode:"collect"` can return `ok:true` with `errorCount > 0`; callers must inspect `errors[]`.

---

## 11. Recommended Safe Route

1. Call `get_agent_guidance`.
2. Call `inspect_font_inputs` with `includeFiles:false`.
3. If layout is uncertain, call `organize_font_directory` with `workflowPreset:"safe-preview"`.
4. Call `split_font_batch` with `workflowPreset:"safe-preview"`.
5. Review `sourceSafetyDecision`, `safetySummary`, `batchDecision`, `planned`, `batchWarnings`, `maxFilesHit`, `dedupeDecisionSummary`, `errorCount`, and `errors`.
6. Only after review, call `split_font_batch` with `workflowPreset:"reviewed-write"`.
7. Call `inspect_split_output` with compact options and require audit pass before reporting success.

---

## 12. Recommended Batch Combinations

| Goal | Starting point | Must inspect |
|------|----------------|--------------|
| Safe default batch run | `workflowPreset: "safe-preview"` then `reviewed-write` | `batchDecision`, `batchWarnings`, `sourceSafetyDecision`, `safetySummary`, `errorCount`, `dedupeDecisionSummary` |
| Preserve every source font | `workflowPreset: "preserve-all"` or `batchDedupeMode: "none"` | `skippedDuplicates`, `planned`, output audit |
| Use source folders as families | `workflowPreset: "source-layout"` or `batchGroupBy: "source-dir"` | `layout`, `inputDirectoryDecision`, `batchPolicySummary` |
| Use font metadata as families | `workflowPreset: "metadata-family"` or `batchGroupBy: "font-family"` | `invalidFontCount`, `missingIdentityCount`, `batchWarnings` |
| Fast first pass over noisy directories | `workflowPreset: "structure-first"` | `parseFonts`, `dedupeLimitedByParsing`, rerun with parsing before relying on identity |
| Continue despite per-font failures | `batchErrorMode: "collect"` | `errorCount`, `errors[]`; do not report full success unless zero |
