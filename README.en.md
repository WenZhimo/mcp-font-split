# mcp-font-split

[中文](./README.md) | [API Reference](./API.md) | [中文 API](./API.zh-CN.md) | [Behavior Notes / 行为说明](./BEHAVIOR.zh-CN.md)

> **AI-Generated Code Disclaimer**
>
> This project is generated and maintained with AI coding assistants. The author makes no warranties of any kind and assumes no responsibility for its use. It is provided "AS IS" without warranty of any kind.

> [!CAUTION]
> **Project status: actively being refined and not formally released yet.**
>
> Interfaces, defaults, response fields, directory-organization policy, and documentation may change at any time. When integrating or automating, treat the current repository code, live MCP schema, `get_agent_guidance`, and API docs as authoritative.

---

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that wraps [cn-font-split](https://github.com/KonghaYao/cn-font-split) as agent-callable tools for font splitting, batch processing, directory organization, and output audits.

> [!WARNING]
> Before using this tool, read the full behavior and risk notes in [BEHAVIOR.zh-CN.md](./BEHAVIOR.zh-CN.md). This README is only an entry point for workflows and key risks; field-level details belong in the [API Reference](./API.md).

## Documentation Map

| Need | Start here |
|------|------------|
| Understand the project, installation, and common calls | This README |
| Check MCP tool arguments, response fields, and field semantics | [API Reference](./API.md); Chinese version: [API 参考](./API.zh-CN.md) |
| Review high-risk behavior around batch dedupe, directory organization, fallbacks, and output audits | [BEHAVIOR.zh-CN.md](./BEHAVIOR.zh-CN.md) |
| Let an AI agent choose the next tool and safe arguments | Call `get_agent_guidance`, then inspect `inspectFields` and `successCriteria` |
| Maintain the project and verify changes | `npm run check:compact`; for behavior changes also run `npm run smoke:real-corpus-suite -- <font-corpus-dir>` |

## Source Layout Mismatch Quick Check

If fonts came from multiple websites, extracted archives, vendor dumps, or a mixed root directory, do not start with a batch write. Recommended order:

1. Run `inspect_font_inputs` as a read-only preflight.
2. Check `inputDirectoryDecision.directoryOrganizationSafety` and `sourceLayoutMismatchSummary`.
3. If organization is needed, call `organize_font_directory` with `workflowPreset: "safe-preview"` first.
4. Use `reviewed-write` only after reviewing the plan; it is still copy-only into `outputDir` and never moves, deletes, or rewrites source fonts.
5. Run `inspect_font_inputs` on the organized staging directory, then continue with `split_font_batch` safe-preview and final output audit.

Non-intuitive behavior: `organize_font_directory` produces organized source-like staging, not final web-font split output. Final output must still be written by `split_font_batch` and audited with `inspect_split_output`.

## Features

- Split TTF/OTF/TTC/OTC/WOFF/WOFF2 fonts into web-font output.
- Scan, preflight, and batch-process font directories.
- Plan or copy-organize source directories when the source layout is messy.
- Use manifests for incremental skipping and output audits.
- Provide `get_agent_guidance` so AI agents can choose safe workflows from machine-readable guidance.
- Provide a real-corpus smoke suite for representative reliability checks over complex local font collections.

## Tools

| Tool | Purpose |
|------|---------|
| `get_agent_guidance` | Return agent-oriented workflow guidance, a tool safety quick reference, field checklists, catalogs, and recommended call templates. |
| `get_runtime_status` | Read-only diagnostics for workspace, Node engine, package versions, platform, and WASM availability. |
| `inspect_font_inputs` | Scan an input directory without writing output; reports counts, invalid fonts, ignored files, layout, and the recommended first step. |
| `organize_font_directory` | Plan or copy-organize source fonts; defaults to dry-run and never moves, deletes, or rewrites source fonts. |
| `split_font` | Process one font; output may be normal subset output, a single WOFF2 fallback, or a copy-original metadata entry. |
| `split_font_batch` | Batch scan, dedupe, name, skip existing output, and process fonts. |
| `inspect_split_output` | Audit generated split output for directory role, manifest coverage, and structure issues. |

## Common Workflows

### 1. Let the Agent Orient Itself

```json
{
  "tool": "get_agent_guidance",
  "arguments": {
    "workflow": "batch",
    "detailLevel": "compact"
  }
}
```

When layout, write risk, or the next tool is unclear, inspect `recommendedWorkflowPlan`, `nextToolDecisionSummary`, `toolSafetyQuickReference`, and `responseFieldsToCheck`.

### 2. Preflight an Input Directory

```json
{
  "tool": "inspect_font_inputs",
  "arguments": {
    "inputDir": "fonts",
    "maxFiles": 50000,
    "includeFiles": false
  }
}
```

Start with `inputCountGuide`, `inputDirectoryDecision`, `inputDirectoryDecision.directoryOrganizationSafety`, `unsupportedFileDecision`, `unsupportedFileSummary`, `layout`, and `maxFilesHit`. Archives and non-font files are reported as ignored inputs; they are not extracted, copied, or split automatically.

### 3. Batch Safe Preview

```json
{
  "tool": "split_font_batch",
  "arguments": {
    "inputDir": "fonts",
    "outputRoot": "split-output",
    "workflowPreset": "safe-preview",
    "limit": 50000,
    "maxFiles": 50000
  }
}
```

Confirm `dryRun: true`, `batchWarnings[]`, `dedupeDecisionSummary`, `batchPolicySummary`, `sourceSafetyDecision`, `recommendedNextActions[]`, and `errors[]` before deciding to write.

### 4. Reviewed Write and Output Audit

```json
{
  "tool": "split_font_batch",
  "arguments": {
    "inputDir": "fonts",
    "outputRoot": "split-output",
    "workflowPreset": "reviewed-write",
    "limit": 50000,
    "maxFiles": 50000
  }
}
```

After writing, run:

```json
{
  "tool": "inspect_split_output",
  "arguments": {
    "outDir": "split-output",
    "maxFiles": 200000,
    "includeFiles": false,
    "includeFamilies": false
  }
}
```

Treat the output as audited only when `outputRoleDecision.auditAppliesToThisDirectory !== false`, `outputStructureDecision.status: "pass"`, `auditStatus: "pass"`, `auditPassed: true`, `structureSummary.conforms: true`, and `maxFilesHit: false`.

### 5. Organize the Source Layout When Needed

```json
{
  "tool": "organize_font_directory",
  "arguments": {
    "inputDir": "fonts",
    "workflowPreset": "safe-preview",
    "includePlan": true,
    "maxFiles": 50000
  }
}
```

The organizer returns a plan by default. Even with `reviewed-write`, it performs copy-only staging into `outputDir`; that output is source-like staging, not final split output. Inspect the staging directory with `inspect_font_inputs`, then run `split_font_batch` safe-preview.

## Key Risks

- `ok: true` only means the selected policy completed. It does not always mean normal multi-subset output happened. Prefer `resultType`, `outputMode`, `performedSplit`, `usedFallback`, `skipped`, and `warnings`.
- Paths are restricted to `FONT_SPLIT_ROOT`; tool responses use `.` for the workspace root.
- After any write-capable tool, do not trust `ok` alone. Inspect `sourceSafetyDecision`, `safetySummary`, `recommendedNextActions[]`, and, when applicable, an `inspect_split_output` audit.
- `inputDirectoryDecision.directoryOrganizationSafety` is the shortest answer for whether `organize_font_directory` is available and whether it can change source files.
- `organize_font_directory` never moves, deletes, or rewrites source fonts; its `outputDir` is copy-only source staging.
- `split_font_batch` defaults to `batchNamingMode: "numeric-suffix"`: bare names first, stable `-1`, `-2`, etc. only on real collisions.
- `batchDedupeMode: "same-path"` is path/stem-level dedupe; `batchDedupeMode: "font-identity"` compares font identity across formats.
- `font-identity` uses OpenType name IDs 16/17 first, then falls back to name IDs 1/2, name ID 4, and name ID 6; `glyphCount` is diagnostic only and should not split equivalent OTF/TTF/WOFF inputs.
- `.woff` and `.woff2` inputs are decompressed to sfnt-like data before processing.
- Invalid explicit configuration values are rejected instead of silently falling back. Omit an option to use its default.
- If `outputRoot` is inside `inputDir`, real writes still land inside the input tree; inspect `writesSourceTree` and `outputTreeInsideInputTree` before calling the run source-tree no-write.

## Common Options

| Option | Entry-Level Meaning |
|--------|---------------------|
| `workflowPreset` | `safe-preview`, `reviewed-write`, `structure-first`, `source-layout`, `metadata-family`, `preserve-all`. A starting point; explicit options still override it. |
| `batchGroupBy` | `auto`, `source-dir`, `font-family`. Chooses source structure or font metadata for family grouping. |
| `batchNamingMode` | `plain`, `numeric-suffix`, `source-suffix`. Default is `numeric-suffix`. |
| `batchDedupeMode` | `none`, `same-path`, `font-identity`. Default is `font-identity`. |
| `batchErrorMode` | `collect`, `fail-fast`, `fail-after`. Default is `fail-after`. |
| `dryRun` | `true` previews; `false` writes. |
| `limit` / `maxFiles` | Control batch size and scan bounds. Large directories usually need explicit higher values. |
| `includeResults` | Set to `false` for large batches when summaries, warnings, and errors are enough. |

For complete arguments, response fields, and error shapes, see the [API Reference](./API.md).

## Reading Results

| Tool | Check First |
|------|-------------|
| `split_font` | `outputMode`, `resultType`, `performedSplit`, `usedFallback`, `skipReason`, `warnings` |
| `inspect_font_inputs` | `inputCountGuide`, `inputDirectoryDecision`, `inputDirectoryDecision.directoryOrganizationSafety`, `unsupportedFileSummary`, `layout` |
| `split_font_batch` | `batchDecision`, `batchWarnings`, `batchPolicySummary`, `dedupeDecisionSummary`, `recommendedNextActions`, `sourceSafetyDecision`, `safetySummary` |
| `organize_font_directory` | `layoutDecision`, `sourceSafetyDecision`, `stagingDirectoryDecision`, `recommendedNextActions` |
| `inspect_split_output` | `outputRoleDecision`, `outputStructureDecision`, `auditStatus`, `auditPassed`, `structureSummary` |

This is the entry-level reading order, not a replacement for field definitions in the API docs.

## Installation

```sh
git clone https://github.com/WenZhimo/mcp-font-split.git
cd mcp-font-split
npm install
```

The `cn-font-split` WASM assets are prepared by the `postinstall` script. You can also run:

```sh
npm run install:wasm
```

## Usage

### As an MCP Server

```sh
claude mcp add font-split -- node "/path/to/mcp-font-split/src/server.js"
```

### Standalone

```sh
npm start
npm run batch:run -- . split-output 50000 50000 --dry-run
```

`batch:run` is a safe batch entry point for agents and maintainers. By default it uses `reviewed-write`; `--dry-run` or `FONT_SPLIT_DRY_RUN=true` uses `safe-preview`. `FONT_SPLIT_WORKFLOW_PRESET=default` is rejected because `default` is not valid; invalid preset rejection, invalid environment values, and invalid positional numbers fail with `BatchRunConfigurationError` and include `errorType`, allowed values, or the expected type. enum-like, boolean, or numeric values are rejected instead of silently falling back when invalid. Use `--json` or `FONT_SPLIT_JSON=true` for stable JSON output.

### Verification

```sh
npm run check
npm run check:compact
npm run --silent check:compact -- --json
npm run smoke:api-docs
npm run smoke:behavior-docs
npm run smoke:real-corpus-suite -- <font-corpus-dir>
```

`npm run check` is the recommended AI-agent / CI entry point. `check:compact` is the low-noise syntax + smoke gate. `smoke:real-corpus-suite` is a representative reliability gate over a real local corpus, not per-font or per-directory manual acceptance. It distinguishes full-root scan counts from representative sample counts and reports archives as ignored files rather than extracting them.

## Environment Variables

| Variable | Meaning |
|----------|---------|
| `FONT_SPLIT_ROOT` | Font workspace root. If unset, defaults to the current working directory used to start the MCP Server. |
| `FONT_SPLIT_WASM_PATH` | Optional custom `libffi-wasm32-wasip1.wasm` runtime path. |

## Credits

This project wraps [cn-font-split](https://github.com/KonghaYao/cn-font-split); the core font-splitting capability comes from that project.

## License

This project uses the [Apache License 2.0](./LICENSE). Also respect the licenses of its dependencies.
