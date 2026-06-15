# API Reference

This server exposes seven MCP tools. All paths are resolved inside `FONT_SPLIT_ROOT`; if that environment variable is not set, paths are resolved from the process working directory. Response paths use `.` for the workspace root instead of an empty string, including suggested follow-up arguments.

Invalid explicit configuration values are rejected instead of silently falling back. MCP calls are guarded by the tool schema; direct module calls that bypass the MCP schema throw `FontSplitConfigurationError` with `details.summaryType: "configuration-error"`, `details.option`, `details.received`, `details.allowedValues` or `details.expectedType`, `details.defaultWhenOmitted`, and `details.omitForDefaultBehavior: true`. To use defaults, omit the option rather than passing an invalid enum, boolean, or numeric value.

## `get_agent_guidance`

Return machine-readable usage guidance for AI coding assistants.

| Field | Type / values | Default | Description |
|-------|---------------|---------|-------------|
| `workflow` | `overview`, `single`, `batch`, `inspect`, `organize` | `overview` | Guidance focus. |
| `detailLevel` | `compact`, `full` | `compact` | Response size. `compact` keeps the workflow-critical sections and omits bulky catalogs/examples; `full` returns every guidance section. |
| `sections` | array of section names | unset | Focused section filter. When set, it overrides the default section set from `detailLevel`. |

The response always includes `guidanceView`, which tells the caller which sections were included, which sections were omitted, and which section names are available. By default the response is compact: it includes workspace path rules, supported extensions, default policies, `configurationRecipes[]`, `batchCustomizationQuickReference[]`, `batchPolicyGuide`, `toolOptionCatalog`, `fontIdentityBasisCatalog`, `outputStructureCatalog`, `unsupportedFileCategoryCatalog`, `directoryHandlingModeCatalog`, recommended batch and organization options, response fields to inspect, a verification checklist, `errorResponseCatalog`, `localVerificationOutputGuide`, `directoryWorkflowDecisionMatrix[]`, `safeInvocationTemplates[]`, `nextToolDecisionSummary`, `recommendedWorkflowPlan`, and a recommended tool order. AI agents should call this first when they need to choose a workflow instead of guessing from local paths or stale assumptions.

Use `detailLevel: "full"` when the agent needs every catalog and example in one response. Use `sections` when it only needs specific data, for example `["error-catalog", "warning-catalog", "field-catalog", "option-catalog", "identity-catalog", "output-catalog"]`. Available sections are reported in `guidanceView.availableSections`.

For a minimal routing response, request `workflow: "organize"` with `sections: ["workflow"]` and inspect `nextToolDecisionSummary.workflowQuickStart.recommendedCallExample`. The nested `workflowQuickStart.recommendedCallExample` object is the copyable first call. For an uncertain source directory, that recommended call is the no-write `organize_font_directory` safe preview (`workflowPreset: "safe-preview"`), with `writesFiles: false` and `sourceDestructive: false`. Use its `alternateCallExamples[]` only after the user asks for staging or the inspected response requires a different branch.

`configurationRecipes[]` maps common user intent to preset-first calls and tradeoffs. Recipes cover safe default batch work, preserving every source font, grouping by source folders, grouping by font metadata, fast structure-first scans, copy-only staging directories, and large reviewed writes. Each recipe includes `inspectFields` and `successCriteria`. A recipe is guidance, not proof of success: agents must still run the preview/write tools, inspect those fields, and satisfy the criteria.

`batchCustomizationQuickReference[]` is the compact entrypoint for common batch customizations. It maps user intents to the smallest explicit `overrideArgs`, copyable `previewArgs` with `workflowPreset: "safe-preview"`, copyable `writeArgsAfterReview` with `workflowPreset: "reviewed-write"`, required `inspectFields`, `successCriteria`, and non-intuitive behavior. Use it first for common overrides, then consult `batchPolicyGuide` when the user asks for less common behavior or you need value-by-value details.

`batchPolicyGuide` is a machine-readable customization guide for batch policy options. It covers `batchGroupBy`, `batchNamingMode`, `batchDedupeMode`, and `batchErrorMode`; each policy value includes `useWhen`, `avoidWhen`, `inspectFields`, and `successCriteria`. Use it when the user asks for behavior different from the recommended presets, then preview before writing.

`toolOptionCatalog` is returned by default and with `sections: ["option-catalog"]`. It is a machine-readable catalog for high-impact tool inputs, including raw defaults, preset-first customization routes, allowed values, write/source safety behavior, response-size controls, non-intuitive behavior, and the response fields to inspect after an override. Use it before changing options such as `dryRun`, `includeResults`, `maxFiles`, `batchGroupBy`, `batchNamingMode`, `batchDedupeMode`, `parseFonts`, `smallGlyphAction`, `splitFailureAction`, or `includeFiles`.

`configurationTrace` is returned by `split_font_batch` and `organize_font_directory`. It records high-impact option provenance (`raw-default`, `workflow-preset`, or `explicit-argument`), `rawDefault`, optional `presetDefault`, optional `explicitValue`, final `effectiveValue`, plus `explicitOverrideFields[]` and `presetDefaultFields[]`. Use it when explaining preset behavior or confirming whether a same-call explicit argument overrode the preset; explicit `undefined` values are ignored and do not erase preset defaults.

`fontIdentityBasisCatalog` is returned by default and with `sections: ["identity-catalog"]`. It explains the values emitted as `identityBasis` by `inspect_font_inputs` and summarized as `dedupeDecisionSummary.identityEvidenceSummary.identityBasisCounts` by dedupe responses. Each entry identifies the OpenType name IDs used, confidence, whether the basis is semantic identity evidence, and how strongly agents may describe duplicate decisions.

`outputStructureCatalog` is returned by default and with `sections: ["output-catalog"]`. It explains `inspect_split_output` audit statuses, `structureSummary.layoutKind`, `structureSummary.issues[].code`, output modes, pass criteria, and non-intuitive behavior such as `ok:true` not proving structural success, `includeFiles:false` / `includeFamilies:false` omitting arrays while preserving the audit, and `copy-original` intentionally lacking CSS/WOFF2 output.

`unsupportedFileCategoryCatalog` explains the categories used by `unsupportedFileSummary.byCategory[]`, including representative extensions, category meaning, and handling behavior. Tool responses also include `unsupportedFileDecision` for quick triage, plus `unsupportedFileSummary.categoryDetails[]` and `unsupportedFileSummary.handlingSummary` for evidence, so agents can interpret the current scan without a second guidance lookup. In particular, `archive` files are reported for awareness but are not extracted, copied, or split.

`directoryHandlingModeCatalog` is a machine-readable catalog for `layoutDecision.directoryHandling.recommendedMode`. Each entry explains `meaning`, `whenSeen`, `recommendedNextStep`, `writesFilesBeforeReview`, `sourceDestructive`, `mustInspectFields`, and `nonIntuitiveBehavior`, so agents can interpret directory handling modes without guessing from strings.

`directoryWorkflowDecisionMatrix[]` is a machine-readable decision table for common directory scenarios. Each entry includes `id`, `useWhen`, `firstTool`, default write/source-safety flags, `recommendedOptions`, optional follow-up tool/options, `mustInspectFields`, `successCriteria`, and `nonIntuitiveBehavior`. Options prefer `workflowPreset` and only add path, scale, or directory-shape overrides.

`directoryWorkflowExamples[]` is returned with `detailLevel: "full"` or `sections: ["examples"]`. It gives concrete source-tree patterns such as flat vendor dumps, archive-per-family folders, mixed root+nested libraries, large/noisy first-pass scans, a compact `sourceLayoutMismatchSummary` comparison for flat/nested/mixed/output-inside-input cases, and the `copy-only-staging-to-audited-split` route for organization preview -> copy-only staging -> staged batch preview -> reviewed write -> `inspect_split_output` audit. Example calls follow the same preset-first style and include `mustInspectFields` plus `successCriteria`.

`safeInvocationTemplates[]` gives copyable starting calls for common agent workflows, including runtime diagnostics, compact source preflight, source-layout mismatch planning, structure-first scans for large directories, copy-only staging, batch dry-run preview, reviewed batch processing, and compact output audit. Each template declares whether it writes files, whether it can modify source files, which arguments are meant to be customized, which response fields must be inspected, and which `successCriteria` must be satisfied before continuing. Templates intentionally keep `args` minimal: defaults supplied by `workflowPreset` are not repeated in every template, and the expanded preset defaults are available in `workflowPresets[]`.

`recommendedWorkflowPlan` is an ordered plan for the selected `workflow`. It composes the safe template IDs into phases such as preflight, layout decision, batch preview, reviewed write, and output audit. Every `orderedSteps[]` and `decisionPoints[]` entry includes `inspectFields` and `successCriteria`. It is a route map, not a replacement for checking each tool response: agents should still inspect every listed field and satisfy the criteria before moving from preview to write or claiming completion.

`nextToolDecisionSummary` is a compact routing index for agents asking "which tool should I call next?". It maps common situations to the first tool and, when available, a `safeInvocationTemplates[]` template ID. Its `workflowQuickStart` points to the recommended first quick-start call for the selected `workflow` and includes alternate call examples for common branch points. Its `quickStartCallExamples[]` are generated from the safe templates and provide minimal placeholder args for common routes such as single-font processing, input preflight, layout planning, copy-only staging, batch preview, reviewed write, and output audit. It is intentionally shorter than `recommendedWorkflowPlan`; use it to choose the route, then inspect the referenced template or real tool response fields and satisfy `successCriteria`.

`verificationChecklist[]` also includes local maintenance gates for agents maintaining this package. `local-compact-check-passed` points to `npm run check:compact` and `npm run --silent check:compact -- --json`; it is the low-noise wrapper around the standard syntax/smoke checks and returns `compact-check-result` with failed-step stdout/stderr tails when a child gate fails. After functionality-affecting code changes, `local-real-corpus-suite-passed` still requires `npm run smoke:real-corpus-suite -- <font-corpus-dir>` against a local real corpus before calling the change complete. This is a representative reliability gate; it is not a per-directory acceptance audit and is not a runtime MCP tool call. `localVerificationOutputGuide` is the machine-readable companion for interpreting these local command outputs: it names `standardCommand` for the compact check and `reliabilityGateDecision` as the real-corpus primary decision field, lists required output fields, pass criteria, status meanings, and non-intuitive scope warnings. The suite output prints a short `real-corpus suite summary` and includes the same information in JSON `humanSummary`; use it to avoid confusing fixed target counts with the full corpus scan. The JSON also includes top-level `reliabilityGateDecision` and `corpusCountGuide`: check `status`, `reliabilityGatePassed`, `blockingReasonCodes`, `fullCorpusFontCountField`, and `targetCountsAreFullCorpusCounts` before interpreting the run, then use `corpusCountGuide.fullCorpus` and `corpusCountGuide.representativeTargets` for the shortest machine-readable count explanation. `status: "pass"` means the representative feature chain passed, not that every font directory was manually accepted. The JSON also includes `testScope`: `corpusScan` is the full bounded root scan, `targetSampling` is representative dry-run sampling, and `representativeWriteAudit` is one bounded real write plus output audit path. Its default compact `coverageSummary.functionalCoverage[]` keeps feature IDs and pass/fail status while omitting large evidence, and `coverageSummary.toolCoverageSummary` maps those feature paths to public MCP tools; `allRequiredToolsCovered: true` means `get_agent_guidance`, `get_runtime_status`, `inspect_font_inputs`, `organize_font_directory`, `split_font`, `split_font_batch`, and `inspect_split_output` were all covered through representative real-corpus paths. `runSummaries[]` replaces full child `runs`; `omittedDetailFields` lists those intentionally omitted large fields. Use `--verbose` when child summaries or full evidence are needed. `coverageSummary.functionalCoverage[]` includes `input-count-guide`, `input-directory-decision`, `source-safety-decision`, and `source-layout-mismatch-summary` when the real-corpus run has exercised `inputCountGuide`, `inputDirectoryDecision`, `sourceSafetyDecision`, `sourceLayoutMismatchSummary` layout guidance, direct-preview requirements, and copy-only source safety.

The real-corpus suite also reports `coverageSummary.unsupportedFileCategoryCoverage`, `coverageSummary.archiveHandlingScope`, and `coverageSummary.outputStructureAuditSummary`. Use the first to confirm ignored-file statistics covered extension/category summaries beyond a narrow `.zip`/`.txt` view; use `archiveHandlingScope` to confirm archives were counted as ignored files only, not extracted, and fonts inside archives were not counted as covered; use the last to confirm the representative single and batch write outputs passed `inspect_split_output` with `outputStructureDecision.status: "pass"` and `structureSummary.conforms: true`.

The real-corpus suite also exposes `staging-directory-decision` in `coverageSummary.functionalCoverage[]` when representative organizer paths have exercised `stagingDirectoryDecision`. This confirms that `organize_font_directory.outputDir` was treated as source-like staging, not as generated split output.

`localVerificationOutputGuide.completionReportGuide` gives agents a safe completion-report shape after local gates pass. The nested field `completionReportGuide` lists `requiredClaims[]` with evidence fields such as `corpusCountGuide.fullCorpus.supportedFontCount`, `coverageSummary.archiveHandlingScope`, and `coverageSummary.outputStructureAuditSummary`, `forbiddenClaims[]` that prevent overstating representative testing as every-font or every-directory acceptance or archive-internal font coverage, and `conciseReportTemplate[]` for low-noise final summaries. Use `forbiddenClaims` and `conciseReportTemplate` as the short field names when reporting or checking this guide.

`errorResponseCatalog` is returned by default and with `sections: ["error-catalog"]`. It explains MCP error response shapes: structured errors are returned as JSON text with `ok: false`, `name`, `errorType`, `error`, and `details`, while plain errors without `details` remain concise plain text. `errorType` is the shortest routing field: `FontSplitConfigurationError` uses `errorType: "configuration-error"` from `details.summaryType`, and `BatchSplitError` uses `errorType: "batch-split-error"`. Treat configuration errors as caller configuration failures rather than retrying the same invalid value.

`warningCodeCatalog` is returned with `detailLevel: "full"` or `sections: ["warning-catalog"]`. It maps machine-readable warning codes from `batchWarnings[]`, `inspectionWarnings[]`, and `organizationWarnings[]` to their response sources, severity, and suggested agent action.

`toolResponseFieldCatalog` is returned with `detailLevel: "full"` or `sections: ["field-catalog"]`. It maps important response field paths to the tools that emit them, their meaning, and the action an AI agent should take before reporting success. It is intended as a runtime companion to this API document, especially for fields whose meaning is easy to misread such as `ok`, `performedSplit`, `usedFallback`, `sourceDestructive`, `writesOutputTree`, `maxFilesHit`, and `recommendedNextActions`.

`toolOptionCatalog` is the companion input-side catalog. It explains which options change safety, output shape, response size, dedupe/naming semantics, or audit compactness, and it highlights non-intuitive defaults such as raw `split_font_batch.dryRun: false`, `organize_font_directory.dryRun: true`, `parseFonts: false` limiting identity dedupe, and `includeResults: false` / `includeFiles: false` producing compact responses.

`fontIdentityBasisCatalog` is the companion identity-side catalog. Use it before interpreting `identityBasis` or `dedupeDecisionSummary.identityEvidenceSummary.identityBasisCounts`; path-only, missing, or low-confidence family-only bases should not be reported as complete semantic dedupe proof.

`outputStructureCatalog` is the companion output-audit catalog. Use it before interpreting `outputStructureDecision`, `structureSummary.layoutKind`, or `structureSummary.issues[].code`; `ok:true` only means the inspection call completed, not that the output tree passed.

Guidance section names:

| Section | Contents |
|---------|----------|
| `workspace` | Workspace root and path-base information. |
| `tools` | Tool inventory and when each tool should be called. |
| `defaults` | Important default policies and supported extensions. |
| `recommendations` | Recommended batch, inspect, and organization options, plus `workflowPresets[]`, `batchCustomizationQuickReference[]`, `batchPolicyGuide`, `configurationRecipes[]`, `fontIdentityBasisCatalog`, `outputStructureCatalog`, and `unsupportedFileCategoryCatalog`. |
| `directory-workflows` | Directory workflow decision matrix for flat, nested, mixed, noisy, and staging scenarios. |
| `examples` | Concrete source-tree examples; returned in `full` detail or when explicitly requested. |
| `verification` | Checklist items an agent should verify before reporting success. |
| `error-catalog` | Error-response catalog for structured MCP errors such as `FontSplitConfigurationError` and `BatchSplitError`. |
| `warning-catalog` | Warning-code catalog for `batchWarnings[]`, `inspectionWarnings[]`, and `organizationWarnings[]`. |
| `field-catalog` | Response-field catalog mapping fields to meanings and agent actions. |
| `option-catalog` | Tool input option catalog mapping high-impact options to defaults, allowed values, safety behavior, non-intuitive behavior, and fields to inspect. |
| `identity-catalog` | Font identity basis catalog mapping `identityBasis` values to OpenType name ID sources, confidence, semantic identity status, and agent actions. |
| `output-catalog` | Output structure audit catalog mapping audit statuses, `structureSummary.layoutKind`, `structureSummary.issues[].code`, output modes, pass criteria, and non-intuitive audit behavior. |
| `safe-templates` | Copyable safe invocation templates for common workflows. |
| `response-fields` | Short list of response fields agents should inspect. |
| `path-rules` | Path containment and relative-path rules. |
| `workflow` | Recommended workflow text, `nextToolDecisionSummary`, and `recommendedWorkflowPlan` for the requested guidance focus. |

Workflow presets:

| Preset | Write behavior | Batch defaults | Organization defaults | Use when |
|--------|----------------|----------------|------------------------|----------|
| `safe-preview` | No batch or organization writes. | `dryRun: true`, `includeResults: true`, `skipMode: "manifest"`, `batchNamingMode: "numeric-suffix"`, `batchDedupeMode: "font-identity"`, `batchErrorMode: "fail-after"`, `splitFailureAction: "single-woff2"`. | `dryRun: true`, `includePlan: true`, `parseFonts: true`, `batchGroupBy: "auto"`, `batchNamingMode: "numeric-suffix"`, `batchDedupeMode: "font-identity"`, `copyInvalidFonts: false`, `overwriteExisting: false`. | First call on unfamiliar sources, before any write. |
| `reviewed-write` | Batch writes output; organization copies into `outputDir`. | `dryRun: false`, `includeResults: false`, `skipMode: "manifest"`, `batchNamingMode: "numeric-suffix"`, `batchDedupeMode: "font-identity"`, `batchErrorMode: "fail-after"`, `splitFailureAction: "single-woff2"`. | `dryRun: false`, `includePlan: true`, `parseFonts: true`, `batchGroupBy: "auto"`, `batchNamingMode: "numeric-suffix"`, `batchDedupeMode: "font-identity"`, `copyInvalidFonts: false`, `overwriteExisting: false`. | After reviewing a no-write preview. |
| `structure-first` | No batch or organization writes. | `dryRun: true`, `includeResults: false`, `skipMode: "manifest"`, `batchNamingMode: "numeric-suffix"`, `batchDedupeMode: "same-path"`, `batchErrorMode: "fail-after"`. | `dryRun: true`, `includePlan: false`, `parseFonts: false`, `batchGroupBy: "auto"`, `batchNamingMode: "numeric-suffix"`, `batchDedupeMode: "font-identity"`, `copyInvalidFonts: false`, `overwriteExisting: false`. | Very large or noisy first-pass scans where metadata parsing should be deferred. |
| `source-layout` | Depends on explicit `dryRun`. | `batchGroupBy: "source-dir"`, `batchNamingMode: "numeric-suffix"`, `batchDedupeMode: "font-identity"`. | Same grouping, naming, and dedupe defaults. | Archive-per-family or nested source folders already express grouping. |
| `metadata-family` | Depends on explicit `dryRun`. | `batchGroupBy: "font-family"`, `batchNamingMode: "numeric-suffix"`, `batchDedupeMode: "font-identity"`. | Same grouping, naming, and dedupe defaults. | Flat source folders where internal font metadata should decide family grouping. |
| `preserve-all` | Depends on explicit `dryRun`. | `batchNamingMode: "numeric-suffix"`, `batchDedupeMode: "none"`. | `batchNamingMode: "numeric-suffix"`, `batchDedupeMode: "none"`. | Every supported font file must be kept, even apparent duplicates. |

## `get_runtime_status`

Return a read-only runtime diagnostic summary.

This tool checks the resolved font workspace, package version, Node runtime compatibility with `package.json` engines, platform, supported extensions, the cn-font-split package, and the cn-font-split WASM file. It returns `ok`, `checks[]`, `node`, `workspace`, `wasm`, `cnFontSplit`, and `recommendedActions[]` fields so agents can diagnose setup problems before calling a splitting tool.

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
| `inputCountGuide` | Compact guide for interpreting `scannedFileCount`, supported/unsupported counts, `maxFilesHit`, whether file details were included or intentionally omitted, and unsupported-file handling. |
| `inputDirectoryDecision` | No-write first-pass route for this input directory: rerun the scan, review invalid fonts, run direct `split_font_batch` safe-preview, or run non-destructive `organize_font_directory` safe-preview first. It includes `safeBatchPreviewArgs`, `safeOrganizationPreviewArgs`, `mustInspectFields`, and `nonIntuitiveBehavior`. |
| `layout` | Directory shape summary: `empty`, `flat`, `nested`, or `mixed`, with root/nested counts and recommended batch grouping. |
| `recommendedBatchPreviewArgs` | Copyable no-write `split_font_batch` preview arguments derived from the detected layout, including `recommendedBatchPreviewArgs.maxFiles` to preserve the current scan cap. |
| `supportedFontCount` | Files with supported font extensions. |
| `unsupportedFileDecision` | Quick machine-readable triage derived from `unsupportedFileSummary`: ignored-file status, category/extension counts, archive presence, `.zip` / `.txt`-only versus broader noise, and handling flags showing unsupported files are ignored rather than extracted, copied, or split. |
| `unsupportedFileSummary` | Compact summary of all ignored non-font files, including exact `byExtension`, overview `byCategory`, handling-aware `categoryDetails`, overall `handlingSummary`, `<none>` for extensionless files, and a small set of example paths. Useful when a source tree mixes fonts with archives, docs, screenshots, or generated assets. |
| `validFontCount` | Supported files whose basic metadata can be parsed. |
| `invalidFontCount` | Supported extension files that failed parsing. |
| `missingIdentityCount` | Parseable fonts without a usable batch identity key. |
| `maxFilesHit` | `true` only when more source files existed beyond `maxFiles`. |
| `inspectionWarningCount` / `inspectionWarnings[]` | Summary-level inspection notices with machine-readable `code` and human-readable `message`. |
| `invalidFonts[]` | Compact list of invalid font-like files and parse errors. |
| `files[]` | Optional per-font entries with extension, container, identity, identity key, glyph count, and parse status. |

`inputCountGuide` is the shortest count route for agents: check `countCompleteness`, `maxFilesHit`, `fileDetailsVisibility`, `recommendedAction`, and `unsupportedFilesHandling` before treating source counts as complete. `inputDirectoryDecision` is the shortest directory-route hint from input inspection; treat it as triage, not proof of success, and still inspect `layout`, `inspectionWarnings`, unsupported-file summaries, and the suggested safe-preview response before writing. `unsupportedFileDecision` is the shortest ignored-file route: check `status`, `totalUnsupportedFileCount`, `hasArchives`, `extensionsBeyondZipTxtCount`, `reviewRecommended`, `recommendedAction`, and `handlingSummary` first. `unsupportedFileSummary` exposes `unsupportedFileSummary.total`, `unsupportedFileSummary.byExtension[]`, `unsupportedFileSummary.byCategory[]`, `unsupportedFileSummary.categoryDetails[]`, `unsupportedFileSummary.handlingSummary`, `unsupportedFileSummary.examples[]`, and `unsupportedFileSummary.examplesTruncated`. `byCategory[]` uses coarse categories for agent triage: `archive`, `document`, `image`, `web`, `metadata`, `signature`, `unsupported-font`, `extensionless`, and `other`. `categoryDetails[]` repeats the meaning, representative extensions, and handling behavior for categories present in this scan. `handlingSummary.archivesExtracted` is always `false`; unsupported files remain ignored.

## `split_font_batch`

Scan a directory, deduplicate equivalent fonts, group outputs, and process selected fonts.

If the source directory shape is uncertain, first request `get_agent_guidance` with `sections: ["examples"]` and review `source-layout-mismatch-comparison`, or run `organize_font_directory` with `workflowPreset: "safe-preview"`. Use the organizer's `recommendedBatchPreviewArgs` for a no-write original-input preview before choosing a real batch write or copy-only staging. When the intended route is to create a cleaner copied staging tree first, use `copy-only-staging-to-audited-split` as the checklist: preview the organization plan, run `organize_font_directory` with `workflowPreset: "reviewed-write"`, use `sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs` for the staged `split_font_batch` preview, then write and audit the split output.

| Field | Type / values | Default | Description |
|-------|---------------|---------|-------------|
| `inputDir` | string | `.` | Directory to scan inside `FONT_SPLIT_ROOT`. |
| `outputRoot` | string | `split-output` | Root output directory. |
| `limit` | positive integer, MCP max `50000` | `20` | Maximum fonts to process after dedupe. |
| `maxFiles` | positive integer, MCP max `50000` | `5000` | Maximum source files to scan. |
| `includeResults` | boolean | `true` | Include per-font `results[]`; set `false` for compact large-batch responses. |
| `dryRun` | boolean | `false` | Preview scan, dedupe, naming, and skip decisions without writing output files. |
| `workflowPreset` | `safe-preview`, `reviewed-write`, `structure-first`, `source-layout`, `metadata-family`, `preserve-all` | unset | Named preset applied before explicit options. Omit it to use raw tool defaults. Explicit options override preset values. |
| `skipMode` | `manifest`, `force` | `manifest` | Existing-output skip policy. |
| `batchGroupBy` | `auto`, `source-dir`, `font-family` | `auto` | First-level family directory strategy. |
| `batchNamingMode` | `plain`, `numeric-suffix`, `source-suffix` | `numeric-suffix` | Per-font output directory naming strategy. |
| `batchDedupeMode` | `none`, `same-path`, `font-identity` | `font-identity` | Pre-processing dedupe strategy. `same-path` is path/stem-level only; `font-identity` is semantic cross-format identity. |
| `batchErrorMode` | `collect`, `fail-fast`, `fail-after` | `fail-after` | Per-font error handling strategy. |
| `debugBatchDecisions` | boolean | `false` | Emit structured decision logs for dedupe, naming, skip, and errors. |

`split_font_batch` also accepts the split options from `split_font`, except `fontPath` and `outDir`. Batch mode applies those processing options to every selected font and uses `inputDir` / `outputRoot` for paths.

`workflowPreset` is a shorthand for common configurations. Omit it when you want raw tool defaults without a preset:

- `safe-preview`: no-write safety preview.
- `reviewed-write`: write settings for after a reviewed preview.
- `structure-first`: no-write compact first pass for large/noisy directories; batch mode uses `same-path` dedupe, and organization mode skips font metadata parsing.
- `source-layout`: prefer source-directory grouping.
- `metadata-family`: prefer internal font-family metadata grouping.
- `preserve-all`: disable dedupe while keeping collision-safe names.

Presets are expanded first; any explicit argument in the same call overrides the preset value.

Batch responses include `sourceSafetyDecision`, `safetySummary`, `sourceDestructive`, `writesSourceTree`, `writesOutputTree`, `outputTreeInsideInputTree`, `mayOverwriteOutputTree`, `batchPolicySummary`, `dedupeDecisionSummary`, `inputCountGuide`, `scannedFileCount`, `maxFiles`, `maxFilesHit`, `unsupportedFileDecision`, `unsupportedFileSummary`, and `batchDecision`. Inspect `sourceSafetyDecision` first for the short source-safety answer: source fonts are not moved/deleted/rewritten, `sourceBackupRequired` should be `false`, and `requiresOutputAudit` is true after real batch writes. `sourceDestructive` should always be `false`: batch processing does not move, delete, or rewrite source fonts. With `dryRun: false`, `writesOutputTree: true` means the tool writes generated files, original-font copies, and manifests under `outputRoot`, and may replace existing output files. `writesSourceTree` is true only when that real output tree is inside `inputDir`; in that case source font files are still preserved, but the input tree receives generated output. `mayOverwriteOutputTree` applies only to generated output paths. `inputCountGuide.countCompleteness` explains whether source counts are complete for the scanned root or truncated by `maxFiles`; `maxFilesHit: true` means the caller should rerun with a higher `maxFiles` before treating the summary as complete. `unsupportedFileDecision` gives a compact ignored-file route; `unsupportedFileSummary` gives exact scanned non-font evidence.

Batch dedupe priority is `.otf`, `.ttf`, `.woff2`, `.ttc`, `.otc`, `.woff`.

`font-identity` compares normalized font identity across formats. It first uses OpenType name IDs 16/17 (typographic family/subfamily), falls back to name IDs 1/2 (family/subfamily) when a complete typographic pair is not available, then falls back to name ID 4 (full name), name ID 6 (PostScript name), or family-only. `identityBasis` reports which source was used, and `glyphCount` is diagnostic only; glyph count does not split otherwise equivalent OTF/TTF/WOFF inputs.
If identity extraction fails for a file, batch dedupe falls back to that file's path stem so scanning can continue and the processing phase can report the actual per-font error.

`dedupeDecisionSummary` is the compact agent-facing explanation of the dedupe pass. It reports requested/effective mode, `keyStrategy`, `deduplicatedCount`, `skippedDuplicateCount`, `identityKeyMissingCount`, `pathFallbackUsed`, `dedupeLimitedByParsing`, `representativePriority`, and capped `identityEvidenceSummary` basis counts plus duplicate examples. If `pathFallbackUsed` or `dedupeLimitedByParsing` is true, do not claim semantic identity dedupe was fully available.

`batchErrorMode` defaults to `fail-after`, which finishes selected fonts and then throws if any per-font errors occurred. Use `collect` only when the caller will inspect `errors[]` and `errorCount` itself, or `fail-fast` to throw on the first per-font error.
When `fail-fast` or `fail-after` throws through the MCP server, the error response text is JSON with `ok: false`, `name`, `errorType`, `error`, and `details` so agents can route on `errorType: "batch-split-error"` and still read `details.errors[]` and `details.summary`.

Compact full-library example:

```json
{
  "inputDir": ".",
  "outputRoot": "split-output",
  "limit": 50000,
  "maxFiles": 50000,
  "includeResults": false,
  "batchNamingMode": "numeric-suffix",
  "batchDedupeMode": "font-identity",
  "skipMode": "manifest",
  "splitFailureAction": "single-woff2"
}
```

Dry-run responses use `planned[]` instead of `results[]` when `includeResults` is true. Each planned item includes `input`, `groupName`, `splitDir`, `copiedOriginalPath`, `wouldProcess`, and `skipReason`.

Batch responses include `batchWarningCount` and `batchWarnings[]` for summary-level notices such as dry-run no-write mode, scan truncation, limit truncation, omitted per-font details, existing-output skips, and collected per-font errors. Each warning has a machine-readable `code` and a human-readable `message`.

`batchDecision` is the compact main route for a batch response. It can recommend `review-dry-run-plan`, `rerun-batch-with-higher-maxFiles`, `inspect-batch-errors`, `audit-written-output`, `review-existing-output-skips`, `no-supported-fonts`, or `no-selected-fonts`, and may include `reviewedWriteArgs`, `rerunArgs`, or `auditArgs`. Treat it as a route hint, not proof of success; still inspect `batchWarnings[]`, `errors[]`, `recommendedNextActions[]`, and output audit fields.

`batchPolicySummary` echoes the batch policies selected for this call and links them back to `get_agent_guidance.batchPolicyGuide`. It includes `values`, optional `effectiveValues`, `selectedPolicies[]`, response-local `inspectFields`, complete `policyGuideInspectFields`, and `policySuccessCriteria[]`. Use it to explain the effective grouping, naming, dedupe, and error policy before interpreting counts or planned paths.

## `organize_font_directory`

Plan or copy-organize a source font directory into a cleaner staging layout.

Use this when an agent must decide between direct original-input batch preview and copy-only staged output. For flat/nested/mixed/output-inside-input routing, `get_agent_guidance` with `sections: ["examples"]` includes the `source-layout-mismatch-comparison` example; the actual decision must still come from the current response's `sourceLayoutMismatchSummary`, `recommendedBatchPreviewArgs`, `organizationWarnings`, and safety fields.

### `two-call-layout-preview` example

Use this route when the source layout is unclear and the user has not explicitly asked for a copied staging directory.

1. Preview the directory layout without writing:

```json
{
  "inputDir": "fonts",
  "workflowPreset": "safe-preview"
}
```

Inspect `safetySummary`, `layout.layoutKind`, `sourceLayoutMismatchSummary`, `recommendedBatchPreviewArgs`, `organizationWarnings`, and `planActionSummary`.

2. If direct original-input preview is appropriate, call `split_font_batch` with the returned preview args:

```js
{
  ...organization.recommendedBatchPreviewArgs,
  outputRoot: "split-output"
}
```

Do not treat `recommendedBatchOptions` as a complete safe call. Use copy-only organization (`workflowPreset: "reviewed-write"`) only after the preview has been reviewed and the user wants a cleaner staging source.

> [!WARNING]
> This tool is source-non-destructive. It never moves, deletes, or rewrites source files. By default `dryRun` is `true`, so it only returns a plan. When `dryRun: false`, it creates directories and copies selected fonts into `outputDir`; if `overwriteExisting: true`, destination files in `outputDir` may be replaced.

| Field | Type / values | Default | Description |
|-------|---------------|---------|-------------|
| `inputDir` | string | `.` | Directory to scan inside `FONT_SPLIT_ROOT`. |
| `outputDir` | string | `organized-fonts` | Destination directory for organized copies. Must be different from `inputDir`. |
| `maxFiles` | positive integer, MCP max `50000` | `50000` | Maximum source files to scan. |
| `workflowPreset` | `safe-preview`, `reviewed-write`, `structure-first`, `source-layout`, `metadata-family`, `preserve-all` | unset | Named preset applied before explicit organization options. Omit it to use raw organization defaults. Explicit options override preset values. |
| `dryRun` | boolean | `true` | Plan only without writing files. Set `false` only after reviewing `plan[]` and `organizationWarnings[]`. |
| `includePlan` | boolean | `true` | Include per-font `plan[]` entries. Set `false` for compact summaries. |
| `parseFonts` | boolean | `true` | Read font metadata for identity dedupe, glyph counts, invalid-font detection, and font-family grouping. Set `false` for a faster structure-only plan. |
| `batchGroupBy` | `auto`, `source-dir`, `font-family` | `auto` | Folder grouping strategy for organized copies, using the same meanings as `split_font_batch`. |
| `batchNamingMode` | `plain`, `numeric-suffix`, `source-suffix` | `numeric-suffix` | Copied filename collision strategy. |
| `batchDedupeMode` | `none`, `same-path`, `font-identity` | `font-identity` | Dedupe strategy before copy planning. `same-path` is path/stem-level only; `font-identity` is semantic cross-format identity. |
| `copyInvalidFonts` | boolean | `false` | Copy supported-extension files even when font metadata parsing fails. Keep this `false` unless preserving broken font-like files is intentional. |
| `overwriteExisting` | boolean | `false` | Allow replacing matching files in `outputDir`. Source files are still never modified. |

Important result fields:

| Field | Meaning |
|-------|---------|
| `sourceSafetyDecision` | First source-safety triage field. It directly states whether source fonts are moved/deleted/rewritten, whether a source backup is required, whether the call writes files, whether output is inside the input tree, and whether output audit is required. It does not replace `safetySummary`. |
| `safetySummary` | Compact source/output safety summary. It repeats the operation mode, confirms source files are preserved, declares the write scope, and scopes overwrite risk to the output tree only. Check `sourceSafetyDecision` first, then use this field before interpreting individual safety booleans. |
| `operationMode` | `plan-only` when `dryRun` is true, otherwise `copy-only`. |
| `sourceDestructive` | Always `false`; source files are never moved, deleted, or rewritten. |
| `writesSourceTree` | `true` only when `dryRun: false` writes `outputDir` inside `inputDir`; source files are still preserved. |
| `writesOutputTree` | `true` only when `dryRun` is false. |
| `outputTreeInsideInputTree` | Whether `outputDir` is inside or equal to `inputDir`; future broad scans can reprocess organized copies when this is true. |
| `mayOverwriteOutputTree` | `true` only when the current non-dry-run call may replace files in `outputDir`. |
| `sourceFilesPreserved` | Always `true`; included for agents that need a direct source-preservation signal. |
| `parsedFontMetadata` | `false` when `parseFonts: false`; in that mode `validFontCount` and `invalidFontCount` are `null`, not zero. |
| `unparsedFontCount` | Number of supported-extension files intentionally not parsed because `parseFonts` was false. |
| `effectiveBatchDedupeMode` | Actual dedupe mode used. When `parseFonts: false` and `batchDedupeMode: "font-identity"`, this falls back to `same-path`. |
| `dedupeLimitedByParsing` | `true` when requested identity dedupe could not run because font parsing was skipped. |
| `dedupeDecisionSummary` | Compact dedupe explanation for organization planning/copying. Use `effectiveMode`, `pathFallbackUsed`, `dedupeLimitedByParsing`, and nested `identityEvidenceSummary` before claiming identity dedupe was available. |
| `batchPolicySummary` | Echo of the selected batch grouping, naming, and dedupe policies for this organization call, plus the relevant `batchPolicyGuide` success criteria. When `parseFonts: false` limits identity dedupe, `effectiveValues.batchDedupeMode` shows the actual fallback. |
| `layoutDecision` | Top-level compact route summary for `organize_font_directory`: `shortAnswer`, detected layout, recommended grouping, route, source-safety signals, direct original-input preview status, and copy-only staging status. Use it as a routing index, not success proof. |
| `layoutDecision.directoryHandling` | First-pass answer for how to treat the source directory: preview original input, review mixed layout, use a copy-only organized output, rerun organization, or stop when no copyable fonts exist. It also states that the helper tool is `organize_font_directory`, default mode is dry-run, and real organization is copy-only into `outputDir`. |
| `stagingDirectoryDecision` | Compact decision for `organize_font_directory.outputDir`: whether it is only planned, ready as source-like staging, blocked by errors, already occupied by existing targets, or empty/no-op. It explicitly says `isSplitOutput: false`, recommends `inspect_font_inputs` for the staging directory, `split_font_batch` safe-preview before split writes, and `inspect_split_output` only after generated split output exists. |
| `directoryWorkflowSummary` | Response-local navigation summary for source-layout review, safe batch preview, optional copy-only staging, reviewed batch write, and required output audit. It includes `planVisibility`, `workflowSteps[]`, route, safety, success criteria, and non-intuitive behavior notes. No-write `split_font_batch` preview steps include `directoryWorkflowSummary.workflowSteps[].suggestedArgsField` so agents can identify the canonical field behind the copyable args. |
| `sourceLayoutMismatchSummary` | Compact answer for source layout vs recommended grouping, direct original-input safe preview availability, copy-only staging need, source-safety of staging, and the nested `sourceLayoutMismatchSummary.decisionChecklist`. After a copy-only write, `sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs` is the copyable `split_font_batch` safe-preview call for the organized output and preserves the current `maxFiles`. |
| `sourceLayoutMismatchSummary.decisionChecklist` | Agent-facing checklist for source safety, direct preview readiness, copy-only staging need, plan visibility, warning review, and required post-write output audit. The `copy-only-staging` item repeats organized-output preview args as `sourceLayoutMismatchSummary.decisionChecklist.items[].safePreviewArgs` when that is the next safe route. |

Directory-routing `inspectFields`, `mustInspectFields`, and `responseFields` that list `sourceLayoutMismatchSummary` also list `sourceLayoutMismatchSummary.decisionChecklist`, so agents do not have to infer that the nested checklist is mandatory.
| `directoryWorkflowSummary.planVisibility` | Explains whether detailed `plan[]` entries are included. When `includePlan: false`, `plan[]` is omitted; use `availableSummaryFields`, including `layoutDecision` and `layoutDecision.directoryHandling`, for compact triage and `rerunWithPlanArgs` before writing when exact per-file targets matter. |
| `inputCountGuide` | Compact guide for interpreting source scan counts, count completeness, omitted details, and unsupported-file handling before trusting an organization plan. |
| `unsupportedFileDecision` | Quick machine-readable triage derived from `unsupportedFileSummary`: ignored-file status, category/extension counts, archive presence, `.zip` / `.txt`-only versus broader noise, and handling flags showing unsupported files are ignored rather than extracted, copied, or split. |
| `unsupportedFileSummary` | Compact summary of all ignored non-font files, including exact `byExtension`, overview `byCategory`, handling-aware `categoryDetails`, overall `handlingSummary`, `<none>` for extensionless files, and a small set of example paths. It explains noisy source trees where archives, documents, images, generated assets, or extensionless files are present but will not be copied or split. |
| `layout.layoutKind` | `empty`, `flat`, `nested`, or `mixed`. Mixed means fonts exist both at the input root and below subdirectories. |
| `recommendedBatchOptions` | Suggested `split_font_batch` policy fragment for the detected layout. Nested or mixed inputs usually recommend `batchGroupBy: "source-dir"`; flat inputs usually recommend `font-family`. This is not a complete safe invocation by itself. |
| `recommendedBatchPreviewArgs` | Copyable no-write `split_font_batch` preview arguments for the detected layout. It includes `inputDir`, `workflowPreset: "safe-preview"`, layout-specific overrides such as `batchGroupBy`, and `recommendedBatchPreviewArgs.maxFiles` for the current scan cap. Prefer this before any real batch write. |
| `recommendedNextActionCount` / `recommendedNextActions[]` | Machine-readable follow-up actions for agents. Batch dry-runs may suggest `run-reviewed-batch-write`; real batch writes may suggest `audit-split-output` with `inspect_split_output` args. Entries include `id`, `priority`, `tool`, `reason`, optional `suggestedArgs`, optional `recommendedNextActions[].suggestedArgsField`, `inspectFields`, and `successCriteria`. `suggestedArgsField` points to the canonical response field behind mirrored args, such as `batchDecision.reviewedWriteArgs`, `batchDecision.auditArgs`, `recommendedBatchPreviewArgs`, or `sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs`. `suggestedArgs` prefer `workflowPreset` and only keep overrides that differ from that preset. Organization follow-up actions that rescan a directory preserve the current scan cap as `recommendedNextActions[].suggestedArgs.maxFiles`, except for explicit higher-cap reruns. |
| `organizationDecision` | Compact route recommendation for the organizer response. It names the preferred branch, such as `rerun-with-font-parsing`, `decide-on-invalid-fonts`, `preview-original-layout`, `review-mixed-layout`, or `preview-organized-output`, and points at the preferred next action when one exists. |
| `organizationWarningCount` / `organizationWarnings[]` | Machine-readable notices such as `organization-dry-run`, `organization-writes-output`, `output-overwrite-enabled`, `mixed-layout-detected`, `invalid-fonts-skipped`, and `output-inside-input`. |
| `planActionSummary` | Always returned. Counts planned actions by `action`, including `would-copy`, `copied`, `skipped-duplicate`, `skipped-invalid`, `skipped-target-exists`, `would-skip-target-exists`, and `error`. Use this when `includePlan: false` omits detailed entries. |
| `plan[]` | Optional per-font copy/skip entries. Copy entries include `source`, `target`, `targetPath`, `groupName`, `action`, `identityKey`, and `glyphCount`. |
| `organizationManifestPath` | Written only when `dryRun: false`; points to `font-organization-manifest.json` in `outputDir`. |

`unsupportedFileDecision` is the quick route; `unsupportedFileSummary` is the evidence route. `unsupportedFileSummary` uses the same subfields as `inspect_font_inputs`: `unsupportedFileSummary.total`, `unsupportedFileSummary.byExtension[]`, `unsupportedFileSummary.byCategory[]`, `unsupportedFileSummary.categoryDetails[]`, `unsupportedFileSummary.handlingSummary`, `unsupportedFileSummary.examples[]`, and `unsupportedFileSummary.examplesTruncated`. `archive` files such as `.zip` are reported but not extracted, copied, or split; this is also visible as `unsupportedFileDecision.handlingSummary.archivesExtracted: false` and `unsupportedFileSummary.handlingSummary.archivesExtracted: false`.

Non-intuitive behavior to watch:

- `dryRun` defaults to `true`, unlike `split_font_batch`, where `dryRun` defaults to `false`.
- The tool copies fonts into a staging directory; it does not split fonts and does not generate CSS.
- `parseFonts: false` is structure-only. It avoids metadata parsing, but cannot detect invalid fonts, cannot provide glyph counts, and cannot do true identity dedupe or metadata-driven family grouping.
- Non-font files are ignored; inspect `unsupportedFileSummary` when the source tree includes archives, docs, screenshots, or generated assets. Invalid font-like files are skipped unless `copyInvalidFonts: true`.
- If `outputDir` is inside `inputDir`, the response includes `output-inside-input` and `outputTreeInsideInputTree: true`; future scans should exclude that output directory to avoid processing organized copies as new source fonts.

Use `parseFonts: true` when you need trustworthy invalid-font counts, glyph counts, internal family names, or cross-format identity dedupe. Use `parseFonts: false` only for a quick structural first pass over a very large or noisy tree. In that mode, `font-parsing-skipped` should be treated as a warning that the plan is incomplete for metadata-sensitive decisions.

Common `recommendedNextActions[].id` values include batch actions such as `run-reviewed-batch-write`, `audit-split-output`, `rerun-batch-with-higher-maxFiles`, and `inspect-batch-errors`, plus organization actions such as `review-plan-before-writing`, `preview-batch-split-original-layout`, `copy-organized-staging-directory`, `inspect-organized-output`, `preview-batch-split-organized-output`, `rerun-with-font-parsing`, `rerun-with-higher-maxFiles`, `decide-on-invalid-fonts`, `review-mixed-layout-grouping`, and `avoid-reprocessing-organized-copies`. These are guidance, not proof of success; agents must still inspect the listed `inspectFields` and satisfy `successCriteria`. When `recommendedNextActions[].suggestedArgsField` is present, use it to explain which stable response field supplied the copyable args before running the next call.

`layoutDecision`, `layoutDecision.directoryHandling`, `stagingDirectoryDecision`, `organizationDecision`, `directoryWorkflowSummary`, `sourceLayoutMismatchSummary`, and `sourceLayoutMismatchSummary.decisionChecklist` are compact route hints, not proof that the route is complete. Use them to choose the branch, then inspect `recommendedNextActions[]`, `organizationWarnings[]`, `planActionSummary`, `directoryWorkflowSummary.planVisibility`, and `plan[]` when available.

`planActionSummary` is a compact overview, not a substitute for reviewing detailed `plan[]` entries before copying files. It is mainly for automation and large responses where `includePlan: false` is used. Organizer `recommendedNextActions[].inspectFields` includes `planActionSummary` whenever the action depends on understanding the copy/skip plan shape.

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
| `outputStructureDecision` | Quick machine-readable route derived from `auditStatus`, `auditBlockingReasons`, `maxFilesHit`, and `structureSummary`. Check `status`, `recommendedAction`, `blockingReasonCodes`, and `issueCodes` first; use `structureSummary` for exact evidence. |
| `auditStatus` | Compact audit gate: `pass`, `action-required`, or `incomplete`. Treat real output audits as complete only when this is `pass`. |
| `auditPassed` | Boolean shortcut for `auditStatus === "pass"`. |
| `auditBlockingReasons[]` | Machine-readable blockers such as `output-scan-truncated` or `output-structure-issues`; structure blockers include `issueCodes` from `structureSummary.issues[]`. |
| `filesIncluded` / `familiesIncluded` | Whether `files[]` and `families[]` are present. |
| `inspectionWarningCount` / `inspectionWarnings[]` | Summary-level audit notices for truncation, omitted detail arrays, missing manifests, and output structure issues. |
| `structureSummary` | Machine-readable output-structure audit. After real batch writes, treat the output directory as complete only when `outputStructureDecision.status: "pass"`, `auditStatus: "pass"`, `auditPassed: true`, `structureSummary.conforms: true`, and `maxFilesHit: false`. `conforms: true` means the scanned files fit the documented single-family or family-tree layout, every detected font entry has a manifest, and manifest-declared output modes have their required files. When false, inspect `issues[]`, `unexpectedFileExamples[]`, and `entryIssueExamples[]`. |
| `structureSummary.layoutKind` | Detected output layout such as `single-family`, `family-tree`, `mixed`, `empty`, or `unknown`; look it up in `outputStructureCatalog.layoutKinds` before deciding whether `outDir` points at the right level. |
| `structureSummary.issues[].code` | Machine-readable structure issue code such as `missing-manifests`, `unexpected-output-files`, or `web-output-missing`; look it up in `outputStructureCatalog.issueCodes` before explaining the audit result. |
| `fontEntryCount` | Number of detected per-font output entries. |
| `manifestCount` | Number of entries with `split-meta.json`. |
| `missingManifestCount` | Number of entries without `split-meta.json` manifests that were conservatively inferred from file structure. |
| `families[]` | Structured family and font-entry inventory. |
