# API Reference

This server exposes six MCP tools. All paths are resolved inside `FONT_SPLIT_ROOT`; if that environment variable is not set, paths are resolved from the process working directory.

## `get_agent_guidance`

Return machine-readable usage guidance for AI coding assistants.

| Field | Type / values | Default | Description |
|-------|---------------|---------|-------------|
| `workflow` | `overview`, `single`, `batch`, `inspect` | `overview` | Guidance focus. |

The response includes workspace path rules, supported extensions, default policies, recommended batch options, response fields to inspect, and a recommended tool order. AI agents should call this first when they need to choose a workflow instead of guessing from local paths or stale assumptions.

## `get_runtime_status`

Return a read-only runtime diagnostic summary.

This tool checks the resolved font workspace, package version, Node runtime, platform, supported extensions, the cn-font-split package, and the cn-font-split WASM file. It returns `ok`, `checks[]`, `workspace`, `wasm`, `cnFontSplit`, and `recommendedActions[]` fields so agents can diagnose setup problems before calling a splitting tool.

If `FONT_SPLIT_WASM_PATH` is set, the `wasm` object reports `fontSplitWasmPathConfigured: true`, the raw `configuredPath`, and the resolved runtime `path`.

## `split_font`

Split one font file into cn-font-split output.

Required:

| Field | Type | Description |
|-------|------|-------------|
| `fontPath` | string | Font file path inside `FONT_SPLIT_ROOT`. Supports `.ttf`, `.otf`, `.ttc`, `.otc`, `.woff`, `.woff2`. |

Common optional fields:

| Field | Type / values | Default | Description |
|-------|---------------|---------|-------------|
| `outDir` | string | `split-output/<family>` | Output directory. |
| `fontFamily` | string | internal family name | CSS `font-family`. |
| `fontWeight` | string | unset | CSS `font-weight`. |
| `fontStyle` | string | unset | CSS `font-style`. |
| `fontDisplay` | string | `swap` for fallback CSS | CSS `font-display`. |
| `cssFileName` | string | `result.css` | Generated CSS filename. |
| `chunkSize` | positive integer | cn-font-split default | Target subset size in bytes. |
| `testHtml` | boolean | cn-font-split default | Generate an HTML preview when supported. |
| `reporter` | boolean | cn-font-split default | Generate reporter output when supported. |
| `oversizedKernAction` | `preserve`, `strip` | `preserve` | Whether to strip unusually large `kern` tables before splitting. |
| `smallGlyphAction` | `subset`, `single-woff2`, `copy-original` | `subset` | What to do when `glyphCount <= smallGlyphThreshold`. |
| `smallGlyphThreshold` | positive integer | `50` | Glyph threshold for `single-woff2` and `copy-original` small-font handling. |
| `splitFailureAction` | `error`, `single-woff2` | `error` | Whether split failures should error or fall back to one WOFF2. |

Advanced cn-font-split options:

| Field | Type / values | Default | Description |
|-------|---------------|---------|-------------|
| `chunkSizeTolerance` | positive number | cn-font-split default | Allowed chunk-size tolerance passed to cn-font-split. |
| `maxAllowSubsetsCount` | positive integer | cn-font-split default | Maximum subset count allowed by cn-font-split. |
| `languageAreas` | boolean | cn-font-split default | Enable cn-font-split language-area optimization. |
| `previewText` | string | unset | Text used for generated preview assets when supported. |
| `previewName` | string | unset | Name for generated preview assets when supported. |
| `renameOutputFont` | string | unset | Output font filename template, for example `font_[hash:6].[ext]`. |
| `buildMode` | string | cn-font-split default | cn-font-split build mode. |
| `multiThreads` | boolean | cn-font-split default | Enable multi-thread processing when supported by the runtime. |
| `fontFeature` | boolean | cn-font-split default | Enable font feature processing. |
| `reduceMins` | boolean | cn-font-split default | Reduce minimum subset sizes when supported. |
| `autoSubset` | boolean | cn-font-split default | Let cn-font-split automatically create subsets. |
| `subsetRemainChars` | boolean | cn-font-split default | Include remaining undeclared characters when supported. |
| `subsets` | array of codepoint arrays | unset | Explicit unicode codepoint groups to keep in each subset. |

Key result fields:

| Field | Meaning |
|-------|---------|
| `resultType` | One of `subset`, `single-woff2-small-glyph`, `single-woff2-split-failure`, `single-woff2`, `copy-original-small-glyph`. |
| `outputMode` | One of `subset`, `single-woff2`, `copy-original`. |
| `performedSplit` | `true` only when multi-subset splitting actually ran. |
| `usedFallback` | `true` for single-WOFF2 fallback paths. |
| `manifestPath` | Path to `split-meta.json`. |

## `inspect_font_inputs`

Scan input files before splitting, without writing output.

| Field | Type / values | Default | Description |
|-------|---------------|---------|-------------|
| `inputDir` | string | `.` | Directory to scan inside `FONT_SPLIT_ROOT`. |
| `maxFiles` | positive integer, MCP max `50000` | `50000` | Maximum source files to scan. |
| `includeFiles` | boolean | `true` | Include per-font `files[]`; set `false` for compact summaries. |

Important result fields:

| Field | Meaning |
|-------|---------|
| `supportedFontCount` | Files with supported font extensions. |
| `validFontCount` | Supported files whose basic metadata can be parsed. |
| `invalidFontCount` | Supported extension files that failed parsing. |
| `missingIdentityCount` | Parseable fonts without a usable batch identity key. |
| `maxFilesHit` | `true` only when more source files existed beyond `maxFiles`. |
| `invalidFonts[]` | Compact list of invalid font-like files and parse errors. |
| `files[]` | Optional per-font entries with extension, container, identity, identity key, glyph count, and parse status. |

## `split_font_batch`

Scan a directory, deduplicate equivalent fonts, group outputs, and process selected fonts.

| Field | Type / values | Default | Description |
|-------|---------------|---------|-------------|
| `inputDir` | string | `.` | Directory to scan inside `FONT_SPLIT_ROOT`. |
| `outputRoot` | string | `split-output` | Root output directory. |
| `limit` | positive integer, MCP max `50000` | `20` | Maximum fonts to process after dedupe. |
| `maxFiles` | positive integer, MCP max `50000` | `5000` | Maximum source files to scan. |
| `includeResults` | boolean | `true` | Include per-font `results[]`; set `false` for compact large-batch responses. |
| `dryRun` | boolean | `false` | Preview scan, dedupe, naming, and skip decisions without writing output files. |
| `strictMode` | boolean | `false` | Convenience strict defaults. Unset `skipMode` becomes `manifest` and unset `batchErrorMode` becomes `fail-after`; explicit options still override it. |
| `skipMode` | `legacy-css`, `manifest`, `force` | `legacy-css` | Existing-output skip policy. |
| `batchGroupBy` | `auto`, `source-dir`, `font-family` | `auto` | First-level family directory strategy. |
| `batchNamingMode` | `plain`, `numeric-suffix`, `source-suffix` | `numeric-suffix` | Per-font output directory naming strategy. |
| `batchDedupeMode` | `none`, `same-path`, `font-identity` | `font-identity` | Pre-processing dedupe strategy. |
| `batchErrorMode` | `collect`, `fail-fast`, `fail-after` | `collect` | Per-font error handling strategy. |
| `debugBatchDecisions` | boolean | `false` | Emit structured decision logs for dedupe, naming, skip, and errors. |

`split_font_batch` also accepts the split options from `split_font`, except `fontPath` and `outDir`. Batch mode applies those processing options to every selected font and uses `inputDir` / `outputRoot` for paths.

Batch responses include `scannedFileCount`, `maxFiles`, and `maxFilesHit`. `maxFilesHit: true` means the source scan was truncated and the caller should rerun with a higher `maxFiles` before treating the summary as complete.

Batch dedupe priority is `.otf`, `.ttf`, `.woff2`, `.ttc`, `.otc`, `.woff`.

`font-identity` compares normalized font identity across formats. It uses typographic family/subfamily when available, then legacy family/subfamily, then full name or PostScript name. `glyphCount` is diagnostic only and does not split otherwise equivalent OTF/TTF/WOFF inputs.
If identity extraction fails for a file, batch dedupe falls back to that file's path stem so scanning can continue and the processing phase can report the actual per-font error.

`batchErrorMode` defaults to `collect`, which keeps compatibility by returning `ok: true` with `errors[]`. Use `fail-fast` to throw on the first per-font error, or `fail-after` to finish selected fonts and then throw if any errors occurred.
`strictMode: true` changes only unresolved batch defaults; it does not prevent explicit overrides.
When `fail-fast` or `fail-after` throws through the MCP server, the error response text is JSON with `ok: false`, `name`, `error`, and `details` so agents can still read `details.errors[]` and `details.summary`.

Compact full-library example:

```json
{
  "inputDir": ".",
  "outputRoot": "split-output",
  "limit": 50000,
  "maxFiles": 50000,
  "includeResults": false,
  "strictMode": true,
  "batchNamingMode": "numeric-suffix",
  "batchDedupeMode": "font-identity",
  "skipMode": "manifest",
  "splitFailureAction": "single-woff2"
}
```

Dry-run responses use `planned[]` instead of `results[]` when `includeResults` is true. Each planned item includes `input`, `groupName`, `splitDir`, `copiedOriginalPath`, `wouldProcess`, and `skipReason`.

## `inspect_split_output`

Inspect a generated output directory.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `outDir` | string | `split-output` | Output directory to inspect. |
| `maxFiles` | positive integer, MCP max `200000` | `200000` | Maximum output files to scan. |
| `includeFiles` | boolean | `true` | Include flat `files[]`; set `false` for compact summaries. |
| `includeFamilies` | boolean | `true` | Include structured `families[]`; set `false` for compact summaries. |

Important result fields:

| Field | Meaning |
|-------|---------|
| `familyCount` | Number of detected family directories. |
| `maxFilesHit` | `true` only when more output files existed beyond `maxFiles`. |
| `filesIncluded` / `familiesIncluded` | Whether `files[]` and `families[]` are present. |
| `fontEntryCount` | Number of detected per-font output entries. |
| `manifestCount` | Number of entries with `split-meta.json`. |
| `legacyOutputCount` | Number of entries inferred without manifest. |
| `families[]` | Structured family and font-entry inventory. |
