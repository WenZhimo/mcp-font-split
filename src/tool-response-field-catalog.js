import {
  OUTPUT_AUDIT_COMPLETION_CRITERIA,
} from './output-audit-criteria.js';
import {
  GUIDANCE_BATCH_RECOMMENDATION_FIELD_CATALOG,
  GUIDANCE_CONFIGURATION_FIELD_CATALOG,
  GUIDANCE_DIRECTORY_HANDLING_FIELD_CATALOG,
  GUIDANCE_DIRECTORY_WORKFLOW_FIELD_CATALOG,
  GUIDANCE_HEADER_FIELD_CATALOG,
  GUIDANCE_IDENTITY_FIELD_CATALOG,
  GUIDANCE_OUTPUT_STRUCTURE_FIELD_CATALOG,
  GUIDANCE_REFERENCE_FIELD_CATALOG,
  GUIDANCE_SAFE_WORKFLOW_FIELD_CATALOG,
  GUIDANCE_WARNING_FIELD_CATALOG,
  GUIDANCE_WORKFLOW_PRESET_FIELD_CATALOG,
} from './guidance-response-field-catalog.js';

export const ALL_TOOL_NAMES = [
  'get_agent_guidance',
  'get_runtime_status',
  'inspect_font_inputs',
  'organize_font_directory',
  'split_font',
  'split_font_batch',
  'inspect_split_output',
];

export const TOOL_RESPONSE_FIELD_CATALOG = {
  ok: {
    sourceTools: ALL_TOOL_NAMES,
    meaning: 'Tool-level success flag. It means the selected policy completed, not necessarily that a normal multi-subset split happened.',
    agentAction: 'Inspect tool-specific outcome, warning, truncation, and error fields before claiming success.',
  },
  node: {
    sourceTools: ['get_runtime_status'],
    meaning: 'Node.js runtime details, including whether the current version satisfies package.json engines.',
    agentAction: 'If node.ok is false, handle recommendedActions before processing fonts.',
  },
  workspace: {
    sourceTools: ['get_agent_guidance', 'get_runtime_status'],
    meaning: 'Resolved FONT_SPLIT_ROOT workspace and configuration status.',
    agentAction: 'Confirm paths are inside the intended workspace before reading or writing local fonts.',
  },
  ...GUIDANCE_HEADER_FIELD_CATALOG,
  wasm: {
    sourceTools: ['get_runtime_status'],
    meaning: 'Resolved cn-font-split WASM runtime path and filesystem status.',
    agentAction: 'If missing or not a file, follow recommendedActions before splitting.',
  },
  'wasm.fontSplitWasmPathConfigured': {
    sourceTools: ['get_runtime_status'],
    meaning: 'Whether FONT_SPLIT_WASM_PATH overrides the packaged cn-font-split WASM runtime.',
    agentAction: 'Disclose custom-runtime use when debugging compatibility or reproducibility.',
  },
  cnFontSplit: {
    sourceTools: ['get_runtime_status'],
    meaning: 'cn-font-split package and WASM runtime version metadata.',
    agentAction: 'Use this to diagnose version drift between the wrapper, package, and WASM runtime.',
  },
  'cnFontSplit.packageVersion': {
    sourceTools: ['get_runtime_status'],
    meaning: 'Installed cn-font-split package version.',
    agentAction: 'Compare with expected dependency versions when reproducing behavior.',
  },
  'cnFontSplit.runtimeVersion': {
    sourceTools: ['get_runtime_status'],
    meaning: 'Recorded cn-font-split WASM runtime release, when available.',
    agentAction: 'Record or repair the runtime when runtimeVersion is missing unexpectedly.',
  },
  recommendedActions: {
    sourceTools: ['get_runtime_status'],
    meaning: 'Machine-readable setup remediation actions.',
    agentAction: 'Handle action-required items before calling writing tools.',
  },
  supportedFontCount: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Number of scanned files with supported font extensions.',
    agentAction: 'Use with maxFilesHit and warning fields before trusting source coverage.',
  },
  unsupportedFileSummary: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Compact summary of all ignored non-font files, including precise extension counts, coarse categories, extensionless files, and example paths.',
    agentAction: 'Use this when source directories include archives, docs, generated files, or other noise that will not be organized or split; inspect the subfields before judging corpus coverage.',
  },
  unsupportedFileDecision: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Compact machine-readable triage of ignored non-font files derived from unsupportedFileSummary.',
    agentAction: 'Use this first to see whether ignored files exist, whether archive files or non-.zip/.txt noise are present, and whether the tool will extract, copy, or split those files; use unsupportedFileSummary for exact evidence.',
  },
  inputCountGuide: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Compact machine-readable guide for interpreting source scan counts, maxFiles truncation, omitted file details, and unsupported-file handling.',
    agentAction: 'Check this before treating count fields as complete; if countCompleteness is truncated, rerun with a higher maxFiles before reporting corpus totals.',
  },
  'unsupportedFileSummary.total': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Total number of scanned files ignored because their extensions are not supported font formats.',
    agentAction: 'Use with maxFilesHit before treating the ignored-file count as complete.',
  },
  'unsupportedFileSummary.byExtension': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Exact ignored-file counts by normalized extension, with <none> for extensionless files.',
    agentAction: 'Use this when deciding whether unexpected file types are present; do not infer that archives are processed just because they are counted.',
  },
  'unsupportedFileSummary.byCategory': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Coarse ignored-file categories for agent triage, such as archive, document, image, web, metadata, signature, unsupported-font, extensionless, and other.',
    agentAction: 'Use this for noisy real corpora where exact extensions are too fragmented; archive entries are reported but still ignored.',
  },
  'unsupportedFileSummary.categoryDetails': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Category counts enriched with category meaning, representative extensions, and handling behavior.',
    agentAction: 'Use this to explain ignored archives, docs, images, unsupported font-adjacent files, and extensionless files without separately calling get_agent_guidance.',
  },
  'unsupportedFileSummary.handlingSummary': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Response-local handling policy for unsupported files in the current scan.',
    agentAction: 'Use this to confirm unsupported files are reported for context only; archives are not extracted and unsupported files are not copied or split.',
  },
  'unsupportedFileSummary.examples': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Small sample of ignored file paths, relative to the workspace when possible.',
    agentAction: 'Use examples to explain what was ignored without expanding every non-font file in a large corpus.',
  },
  'unsupportedFileSummary.examplesTruncated': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Whether more ignored-file examples existed than were returned.',
    agentAction: 'If true and exact examples matter, inspect the source tree directly or rerun with a focused smaller input directory.',
  },
  validFontCount: {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Number of supported-extension files whose basic font metadata was parsed successfully.',
    agentAction: 'Treat null as unknown when metadata parsing was intentionally skipped.',
  },
  invalidFontCount: {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Number of supported-extension files that failed font metadata parsing.',
    agentAction: 'Inspect invalidFonts[] or organization warnings before deciding whether broken font-like files should be preserved.',
  },
  missingIdentityCount: {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Number of parseable fonts without a usable batch identity key.',
    agentAction: 'Expect identity dedupe to fall back for these fonts when precision matters.',
  },
  resultType: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Specific processing result classification, including subset, fallback, and copy-original cases.',
    agentAction: 'Use this instead of ok alone when reporting what was produced.',
  },
  outputMode: {
    sourceTools: ['split_font', 'split_font_batch', 'inspect_split_output'],
    meaning: 'Broad output category: subset, single-woff2, or copy-original.',
    agentAction: 'Disclose non-subset modes because they are not normal multi-subset output.',
  },
  performedSplit: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'True only when normal cn-font-split multi-subset processing actually ran.',
    agentAction: 'Do not claim multi-subset splitting when this is false.',
  },
  usedFallback: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'True when the result used a fallback path such as single-WOFF2 output.',
    agentAction: 'Tell the user fallback output was used and inspect warnings.',
  },
  skipped: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Per-font signal that normal multi-subset splitting was intentionally bypassed, such as for small-glyph single-WOFF2 fallback or copy-original handling.',
    agentAction: 'Interpret together with outputMode, resultType, usedFallback, and skipReason; do not confuse it with batch existing-output skip counters.',
  },
  skipReason: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Per-font or dry-run plan reason for bypassing normal processing or for a skip decision, such as small-glyph fallback, copy-original, manifest, missing-manifest, stale-manifest, or force.',
    agentAction: 'Use this to explain why a font was not normally split; if the reason is manifest, audit existing output or use skipMode force only when reprocessing is intentional.',
  },
  warnings: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Per-font warnings from processing one selected font.',
    agentAction: 'Review before treating a font as cleanly processed.',
  },
  manifestPath: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Path to the split-meta.json manifest for a processed font entry.',
    agentAction: 'Use this as the strongest per-font evidence of what options and source file produced the output.',
  },
  ...GUIDANCE_WARNING_FIELD_CATALOG,
  safetySummary: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Compact source/output safety summary for batch or directory organization calls.',
    agentAction: 'Inspect this before treating a call as non-destructive, dry-run only, or output-writing.',
  },
  sourceSafetyDecision: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Top-level compact answer for whether source font files are moved, deleted, or rewritten, whether the call writes output, and whether output is inside the input tree.',
    agentAction: 'Use this as the first source-safety triage field, then inspect safetySummary, writesSourceTree, writesOutputTree, outputTreeInsideInputTree, and output audit fields when output was written.',
  },
  ...GUIDANCE_REFERENCE_FIELD_CATALOG,
  'compact-check-result.ok': {
    sourceTools: ['npm run check:compact'],
    meaning: 'Boolean pass/fail result from the compact local syntax/smoke gate wrapper.',
    agentAction: 'Require true before treating the standard local gate as passed; if false, inspect failedStepId and steps[].',
  },
  'compact-check-result.failedStepId': {
    sourceTools: ['npm run check:compact'],
    meaning: 'Identifier of the failed compact-check child step, or null when every step passed.',
    agentAction: 'Use this to rerun the failing npm script directly or inspect the corresponding step tail.',
  },
  'compact-check-result.steps': {
    sourceTools: ['npm run check:compact'],
    meaning: 'Per-step compact check metadata, including ok, exitCode, elapsedMs, output byte counts, and stdout/stderr tails only for failing steps.',
    agentAction: 'Use failed step tails for quick triage; rerun the failed npm script directly for full output.',
  },
  'coverageSummary.archiveHandlingScope': {
    sourceTools: ['npm run smoke:real-corpus-suite'],
    meaning: 'Machine-readable scope statement for archive files in the real-corpus suite: archives are counted as ignored files, but archive contents are not extracted, scanned, or counted as tested fonts.',
    agentAction: 'Use this field before reporting real-corpus coverage when the corpus contains zip/rar/7z/tar files; do not imply fonts inside archives were tested unless they were extracted outside this tool and scanned as normal files.',
  },
  ...GUIDANCE_SAFE_WORKFLOW_FIELD_CATALOG,
  batchWarnings: {
    sourceTools: ['split_font_batch'],
    meaning: 'Summary-level batch notices with machine-readable codes.',
    agentAction: 'Inspect every action-required or warning item before claiming the batch fully succeeded.',
  },
  batchWarningCount: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of batchWarnings entries.',
    agentAction: 'Use as a compact signal that batchWarnings needs attention.',
  },
  batchDecision: {
    sourceTools: ['split_font_batch'],
    meaning: 'Compact machine-readable route recommendation after a batch run, such as review a dry-run plan, rerun with a higher maxFiles, inspect errors, audit written output, or handle an empty batch.',
    agentAction: 'Use this to choose the next batch workflow branch, then inspect batchWarnings, recommendedNextActions, errors, and output audit fields before reporting success.',
  },
  errorCount: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of per-font processing errors collected by the batch run.',
    agentAction: 'If nonzero, inspect errors[] and do not report full success.',
  },
  errors: {
    sourceTools: ['split_font_batch'],
    meaning: 'Collected per-font processing errors when batchErrorMode allows collection.',
    agentAction: 'Summarize failed inputs and consider rerunning with fail-after for stricter automation.',
  },
  maxFilesHit: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory', 'inspect_split_output'],
    meaning: 'True when a scan stopped at maxFiles before covering all files.',
    agentAction: 'Rerun with a higher maxFiles before trusting counts, plans, or audits.',
  },
  inputDirectoryDecision: {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Compact first-pass route after input inspection: whether to rerun the scan, review invalid fonts, preview batch splitting directly, or run a non-destructive organization preview first.',
    agentAction: 'Use this as a no-write triage hint only. Inspect layout, recommendedBatchPreviewArgs, unsupported file summaries, and inspectionWarnings before splitting or organizing.',
  },
  'inputDirectoryDecision.directoryOrganizationSafety': {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Scan-local directory organization safety contract. It names organize_font_directory, gives no-write safePreviewArgs with the current inputDir and maxFiles, and states that reviewed organization is copy-only staging rather than final split output.',
    agentAction: 'Use this when input inspection has already run; copy safePreviewArgs for a no-write organization preview, then inspect the organizer response before any reviewed copy or split write.',
  },
  dryRun: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the call only planned work instead of writing output.',
    agentAction: 'Confirm this explicitly because split_font_batch defaults to false while organize_font_directory defaults to true.',
  },
  planned: {
    sourceTools: ['split_font_batch'],
    meaning: 'Per-font dry-run plan entries for batch output paths and skip decisions.',
    agentAction: 'Review before rerunning a batch with dryRun:false.',
  },
  'planned[].wouldProcess': {
    sourceTools: ['split_font_batch'],
    meaning: 'Per-plan-entry flag showing whether that selected font would be processed on a reviewed write.',
    agentAction: 'When false, inspect planned[].skipReason and skipMode before deciding whether to rely on existing output or rerun with skipMode force.',
  },
  'planned[].skipReason': {
    sourceTools: ['split_font_batch'],
    meaning: 'Per-plan-entry reason from the batch skip check, such as manifest, missing-manifest, stale-manifest, or force.',
    agentAction: 'Use this to explain dry-run no-op entries and to decide whether existing output should be audited or force-reprocessed.',
  },
  plannedCount: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of planned batch entries returned for a dry-run.',
    agentAction: 'Use with planIncluded and batchWarnings to decide whether per-font planning was visible.',
  },
  wouldProcessCount: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of selected fonts that would be processed in a dry-run.',
    agentAction: 'Check before writing to avoid surprising no-op or oversized runs.',
  },
  skippedDuplicates: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Number of equivalent fonts skipped by the selected dedupe policy.',
    agentAction: 'Inspect dedupe mode and plans when representative choice matters.',
  },
  inspectionWarnings: {
    sourceTools: ['inspect_font_inputs', 'inspect_split_output'],
    meaning: 'Summary-level inspection notices with machine-readable codes.',
    agentAction: 'Inspect before trusting source or output audit results.',
  },
  inspectionWarningCount: {
    sourceTools: ['inspect_font_inputs', 'inspect_split_output'],
    meaning: 'Number of inspectionWarnings entries.',
    agentAction: 'Use as a compact signal that inspectionWarnings needs attention.',
  },
  organizationWarnings: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Summary-level organization notices with machine-readable codes.',
    agentAction: 'Review before using recommendedBatchPreviewArgs or running a real copy.',
  },
  organizationWarningCount: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Number of organizationWarnings entries.',
    agentAction: 'Use as a compact signal that organizationWarnings needs attention.',
  },
  recommendedNextActions: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Machine-readable follow-up checklist for batch and directory organization workflows. Each action includes inspectFields and successCriteria; actions with copyable args may also include suggestedArgs and, when those args mirror another response field, suggestedArgsField.',
    agentAction: 'Treat as guidance, inspect each action inspectFields, and satisfy successCriteria before proceeding or reporting completion. Prefer suggestedArgsField when present to cite the canonical args source; when suggestedArgs.maxFiles is present, preserve it unless intentionally changing the scan cap.',
  },
  'recommendedNextActions[].suggestedArgsField': {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Canonical response field that supplied a recommended next action suggestedArgs object, such as batchDecision.reviewedWriteArgs, batchDecision.auditArgs, recommendedBatchPreviewArgs, or sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs.',
    agentAction: 'Use this pointer before copying recommendedNextActions[].suggestedArgs so you know whether the action mirrors a reviewed-write route, an output audit route, direct original-input preview args, or organized staging safe-preview args.',
  },
  'recommendedNextActions[].suggestedArgs.maxFiles': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Current scan cap copied into organization follow-up actions that rescan source or staging directories. The explicit higher-cap rerun action may use a placeholder instead.',
    agentAction: 'Keep this value when copying suggestedArgs into the next inspect_font_inputs, organize_font_directory, or split_font_batch call so the follow-up covers the same bounded scan scope.',
  },
  operationMode: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Organization mode: plan-only for dry runs, copy-only for real organization runs.',
    agentAction: 'Use it to confirm the organizer did not split fonts and did not modify source files.',
  },
  copiedCount: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Number of font files copied into the organization output directory.',
    agentAction: 'Use with planActionSummary and organizationManifestPath to verify copy-only work.',
  },
  organizationManifestPath: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Path to the font-organization-manifest.json written by a non-dry-run organization call.',
    agentAction: 'Use this as evidence of the copied staging layout when dryRun is false.',
  },
  stagingDirectoryDecision: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Compact input-side decision for the organizer outputDir: whether it is only a planned staging directory, a ready source-like staging directory, existing targets needing review, or blocked by errors.',
    agentAction: 'Use this after organize_font_directory to distinguish organized source staging from split output. Inspect the staging with inspect_font_inputs, then run split_font_batch safe-preview before any split write; do not use inspect_split_output until split output has been generated.',
  },
  planActionSummary: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Compact counts of planned or executed organization actions.',
    agentAction: 'Use it when plan[] is omitted or too large, but do not treat it as a substitute for detailed review when copying.',
  },
  organizationDecision: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Compact machine-readable route recommendation after directory layout analysis, such as rerun with parsing, decide on invalid fonts, preview the original layout, or preview the organized staging output.',
    agentAction: 'Use this to choose the next workflow branch, then inspect recommendedNextActions, organizationWarnings, and planActionSummary before writing or reporting success.',
  },
  layoutDecision: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Top-level compact route summary for directory organization responses, including detected layout, preferred route, directoryHandling, source-safety signals, direct original-input preview readiness, and copy-only staging status.',
    agentAction: 'Use it as a first-pass routing index only; start with layoutDecision.directoryHandling, then inspect safetySummary, sourceLayoutMismatchSummary, organizationDecision, warnings, plan visibility, and output audits before writing or reporting success.',
  },
  'layoutDecision.directoryHandling': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Short answer for how to treat the current source directory: preview original input, review mixed layout, use an organized copy-only output, rerun organization, or stop because no copyable fonts were found.',
    agentAction: 'Use this as the first answer to "what should I do with this directory?", then verify the referenced suggestedArgs, sourceSafetyDecision, organizationWarnings, and plan fields.',
  },
  'layoutDecision.directoryHandling.recommendedMode': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Stable mode value inside layoutDecision.directoryHandling, such as preview-original-input, review-original-input-safe-preview, or preview-organized-output.',
    agentAction: 'Look up the value in get_agent_guidance.directoryHandlingModeCatalog, then inspect the catalog mustInspectFields before continuing.',
  },
  ...GUIDANCE_DIRECTORY_HANDLING_FIELD_CATALOG,
  directoryWorkflowSummary: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Response-local navigation summary for source-layout mismatch handling, safe staging, batch preview, reviewed write, and output audit.',
    agentAction: 'Use it to explain the current layout workflow in one pass, then verify the referenced safety, warning, plan, batch preview, and audit fields.',
  },
  'directoryWorkflowSummary.workflowSteps[].suggestedArgsField': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Canonical response field that supplied a workflow step suggestedArgs object, such as recommendedBatchPreviewArgs or sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs.',
    agentAction: 'Use this before copying workflowSteps[].suggestedArgs so you can cite the stable source field and avoid mixing policy fragments with runnable safe-preview calls.',
  },
  sourceLayoutMismatchSummary: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Compact response-local answer for whether the current source layout matches recommended batch grouping, whether direct original-input preview is safe, whether copy-only staging is optional or needed, and a decisionChecklist for agent routing.',
    agentAction: 'Use decisionChecklist first when choosing between direct split_font_batch preview, route-resolution reruns, and copy-only staging; still verify safetySummary, organizationWarnings, planActionSummary, and plan[] when available.',
  },
  'sourceLayoutMismatchSummary.decisionChecklist': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Machine-readable checklist inside sourceLayoutMismatchSummary for source safety, direct preview readiness, copy-only staging need, plan visibility, warnings, and required output audit.',
    agentAction: 'Inspect splitWriteReadiness, copyOnlyStagingReadiness, and items[] before writing; treat pass/ready signals as routing guidance, then satisfy the referenced evidence fields and successCriteria.',
  },
  'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Copyable split_font_batch safe-preview arguments for the organized staging directory after a copy-only organization write has already produced outputDir.',
    agentAction: 'When copyOnlyStaging.need is already-written-copy-only, copy these args to split_font_batch before any reviewed batch write; verify maxFiles, sourceSafetyDecision, batchWarnings, and planned output.',
  },
  'sourceLayoutMismatchSummary.decisionChecklist.items[].safePreviewArgs': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Checklist-item-local safe-preview arguments. The copy-only-staging item exposes these when the next safe step is previewing an already-written organized output directory.',
    agentAction: 'Prefer the item suggestedArgsField to locate the canonical args, then run the preview and satisfy the item evidenceFields and successCriteria before writing.',
  },
  planVisibility: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Explains whether the organizer response includes detailed plan[] entries or only compact summary fields.',
    agentAction: 'When planIncluded is false, use the listed summary fields for triage and rerun with includePlan:true before copying if exact per-file targets matter.',
  },
  plan: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Per-font copy or skip plan entries for directory organization.',
    agentAction: 'Review before running with dryRun:false, especially when overwriteExisting or duplicate skipping is involved.',
  },
  sourceDestructive: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether source files can be moved, deleted, or rewritten. Batch and organization calls should report false.',
    agentAction: 'Verify this remains false before calling a workflow source-safe.',
  },
  sourceFilesPreserved: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the source tree is preserved by the call. Batch and organization calls should report true.',
    agentAction: 'Use with sourceDestructive and writesSourceTree to verify source non-destructiveness.',
  },
  writesSourceTree: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the input directory tree is written by the call. This can be true when outputRoot/outputDir is inside inputDir, even though source font files are preserved.',
    agentAction: 'If true, explain that writes are limited to the nested output tree and verify sourceDestructive remains false.',
  },
  writesOutputTree: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the call may write generated output, copies, or manifests into its output tree.',
    agentAction: 'Confirm this before telling the user a call was dry-run only.',
  },
  outputTreeInsideInputTree: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the configured output tree is inside or equal to the input directory tree.',
    agentAction: 'When true, future broad scans of the inputDir can reprocess generated or organized copies unless the output directory is excluded or used intentionally.',
  },
  mayOverwriteOutputTree: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the call may replace existing files in its output tree.',
    agentAction: 'Warn or verify intent when true.',
  },
  parsedFontMetadata: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Whether the organizer parsed font metadata during planning.',
    agentAction: 'If false, do not rely on invalid-font counts, glyph counts, identity dedupe, or metadata family grouping.',
  },
  unparsedFontCount: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Number of supported-extension files intentionally not parsed because parseFonts was false.',
    agentAction: 'Rerun with parseFonts:true when metadata-sensitive decisions matter.',
  },
  effectiveBatchDedupeMode: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Actual dedupe mode used after accounting for parseFonts limitations.',
    agentAction: 'Check for same-path fallback when font-identity was requested but parsing was skipped.',
  },
  dedupeLimitedByParsing: {
    sourceTools: ['organize_font_directory'],
    meaning: 'True when identity dedupe could not run because font parsing was skipped.',
    agentAction: 'Rerun with parseFonts:true before trusting identity dedupe.',
  },
  recommendedBatchOptions: {
    sourceTools: ['organize_font_directory', 'get_agent_guidance'],
    meaning: 'Suggested split_font_batch option fragment from guidance or layout analysis. It is not a complete safe invocation by itself.',
    agentAction: 'Prefer recommendedBatchPreviewArgs for a copyable no-write preview call after organize_font_directory; use this field only as policy overrides after reviewing layout and warnings.',
  },
  ...GUIDANCE_BATCH_RECOMMENDATION_FIELD_CATALOG,
  batchPolicySummary: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Compact echo of the batch-related policies selected for this call, linked to the relevant batchPolicyGuide success criteria.',
    agentAction: 'Use this first to explain the effective grouping, naming, dedupe, and error policy for the response; then inspect the listed fields and satisfy policySuccessCriteria.',
  },
  configurationTrace: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Machine-readable provenance for high-impact configuration values: raw tool default, workflowPreset default, or explicit argument.',
    agentAction: 'Inspect this when explaining why a preset behaved a certain way or whether an explicit option overrode the preset. Undefined explicit values are ignored and do not erase preset defaults.',
  },
  dedupeDecisionSummary: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Compact explanation of the dedupe pass: requested/effective mode, selected representative count, skipped duplicate count, identity-key gaps, path fallback, representative format priority, and capped identity evidence.',
    agentAction: 'Use this with skippedDuplicates and identityEvidenceSummary before claiming semantic dedupe worked; if pathFallbackUsed or dedupeLimitedByParsing is true, disclose the limitation or rerun with parsing enabled.',
  },
  ...GUIDANCE_IDENTITY_FIELD_CATALOG,
  identityBasis: {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Machine-readable basis used to build a font identity key, such as typographic-family-subfamily, opentype-family-subfamily, full-name, postscript-name, family-only, or a fallback basis.',
    agentAction: 'Look up this value in fontIdentityBasisCatalog before claiming semantic equivalence or explaining dedupe results.',
  },
  'dedupeDecisionSummary.identityEvidenceSummary.identityBasisCounts': {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Compact count of identity basis values seen across selected and duplicate inputs during the dedupe pass.',
    agentAction: 'Use with fontIdentityBasisCatalog, pathFallbackUsed, and dedupeLimitedByParsing to decide how strongly identity dedupe can be described.',
  },
  ...GUIDANCE_CONFIGURATION_FIELD_CATALOG,
  recommendedBatchPreviewArgs: {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Copyable no-write split_font_batch preview arguments for the detected layout. It includes inputDir, workflowPreset safe-preview, layout-specific overrides, and the current scan maxFiles as recommendedBatchPreviewArgs.maxFiles.',
    agentAction: 'Use this before writing batch output, then inspect safetySummary, batchWarnings, maxFilesHit, unsupportedFileDecision, unsupportedFileSummary, skippedDuplicates, and errors.',
  },
  layout: {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Detected source directory shape and recommended batch grouping.',
    agentAction: 'Use it when the source directory may not match the desired family grouping.',
  },
  'layout.layoutKind': {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Detected source layout kind: empty, flat, nested, or mixed.',
    agentAction: 'Use flat or mixed as a signal to dry-run organization before direct batch splitting.',
  },
  ...GUIDANCE_DIRECTORY_WORKFLOW_FIELD_CATALOG,
  resultsIncluded: {
    sourceTools: ['split_font_batch'],
    meaning: 'Whether per-font batch results[] are included.',
    agentAction: 'If false, rely on summary counters or rerun with includeResults:true when per-font details are needed.',
  },
  planIncluded: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether per-item planned actions are included.',
    agentAction: 'If false, use summary fields or rerun with includeResults/includePlan true before detailed review.',
  },
  workflowPreset: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Named configuration preset applied before explicit arguments. Explicit tool arguments override preset values.',
    agentAction: 'Use this to explain why effective defaults such as dryRun, parseFonts, skip mode, or dedupe mode were selected.',
  },
  skipMode: {
    sourceTools: ['split_font_batch'],
    meaning: 'Resolved existing-output skip policy for batch runs: manifest accepts matching existing output, while force reprocesses selected fonts.',
    agentAction: 'Use manifest for incremental reruns; use force only when the user intentionally wants to rewrite existing output, then audit the output root.',
  },
  batchGroupBy: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Resolved first-level family/group directory policy: auto, source-dir, or font-family.',
    agentAction: 'Confirm the grouping mode matches the source layout and user intent before writing or copying output.',
  },
  batchNamingMode: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Resolved batch output naming policy: plain, numeric-suffix, or source-suffix.',
    agentAction: 'Confirm numeric suffixes only appear when the selected naming mode and real output-name conflicts require them.',
  },
  batchDedupeMode: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Resolved batch pre-processing dedupe policy: none, same-path, or font-identity.',
    agentAction: 'Confirm the mode matches user intent, especially when preserving every source font or deduping equivalent cross-format fonts matters.',
  },
  batchErrorMode: {
    sourceTools: ['split_font_batch'],
    meaning: 'Resolved per-font batch error handling mode: collect, fail-fast, or fail-after.',
    agentAction: 'Use collect only when the caller will inspect errors[] and errorCount; require errorCount zero before treating a batch as successful.',
  },
  skippedExisting: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of selected batch fonts skipped because existing output matched the selected skipMode.',
    agentAction: 'If nonzero, inspect skippedByManifest, batchDecision, batchWarnings, and audit existing output before reporting the batch as complete.',
  },
  skippedByManifest: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of selected batch fonts skipped specifically because a split-meta.json manifest matched the source file, effective config, tool version, and manifest version.',
    agentAction: 'Use this as evidence for manifest-based incremental reuse, then audit the output directory if relying on reused output.',
  },
  reprocessedBecauseSourceChanged: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of stale-manifest entries reprocessed because the source file no longer matched the existing manifest.',
    agentAction: 'Use this to explain why an incremental rerun wrote new output even when a manifest existed.',
  },
  reprocessedBecauseOptionsChanged: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of stale-manifest entries reprocessed because effective processing options changed while the source file still matched.',
    agentAction: 'Use this to explain option-driven reprocessing in incremental batch runs.',
  },
  ...GUIDANCE_WORKFLOW_PRESET_FIELD_CATALOG,
  manifestCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of output entries backed by split-meta.json manifests.',
    agentAction: 'Prefer manifest-backed counts for strict output audits.',
  },
  missingManifestCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of output entries that do not include split-meta.json manifests and were conservatively inferred from file structure.',
    agentAction: 'Treat these as less certain and consider regenerating output with manifest-backed entries before strict audits.',
  },
  structureSummary: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Machine-readable check for whether output files fit the documented split-output directory structure, including unexpected files, manifest coverage, and per-entry output-mode requirements.',
    agentAction: 'Check outputRoleDecision and outputStructureDecision.status first, then require structureSummary.conforms true before claiming the output directory is structurally valid; inspect issues[] and unexpectedFileExamples[] when false.',
  },
  ...GUIDANCE_OUTPUT_STRUCTURE_FIELD_CATALOG,
  'structureSummary.layoutKind': {
    sourceTools: ['inspect_split_output'],
    meaning: 'Detected output layout kind, such as single-family, family-tree, mixed, empty, or unknown.',
    agentAction: 'Look up this value in outputStructureCatalog.layoutKinds before deciding whether the inspected outDir points at the correct output root.',
  },
  'structureSummary.issues[].code': {
    sourceTools: ['inspect_split_output'],
    meaning: 'Machine-readable output structure issue code, such as missing-manifests, unexpected-output-files, or web-output-missing.',
    agentAction: 'Look up each code in outputStructureCatalog.issueCodes, then inspect unexpectedFileExamples or entryIssueExamples for evidence.',
  },
  outputRoleDecision: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Compact machine-readable decision about whether the inspected outDir is a valid target for split-output auditing or appears to be organizer staging.',
    agentAction: 'Check this before outputStructureDecision. If isSplitOutput is false or auditAppliesToThisDirectory is false, inspect the directory as source-like staging with inspect_font_inputs and run split_font_batch safe-preview before auditing generated output.',
  },
  outputStructureDecision: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Compact machine-readable decision derived from outputRoleDecision, auditStatus, auditBlockingReasons, maxFilesHit, and structureSummary.',
    agentAction: 'Use this after outputRoleDecision to decide whether the output tree passed, needs a higher maxFiles rerun, points at organizer staging, or needs structureSummary issue review.',
  },
  auditStatus: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Compact output audit status: pass, incomplete, or action-required.',
    agentAction: OUTPUT_AUDIT_COMPLETION_CRITERIA,
  },
  auditPassed: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Boolean shortcut for auditStatus === pass.',
    agentAction: 'Treat false as a signal to inspect auditBlockingReasons and structureSummary before reporting completion.',
  },
  auditBlockingReasons: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Compact list of machine-readable reasons that prevent the output audit from passing.',
    agentAction: 'Inspect each code and follow issueCodes when structureSummary contains detailed structure failures.',
  },
  subsetOutputCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of inspected output entries that look like normal subset output.',
    agentAction: 'Use with singleWoff2OutputCount and copyOriginalOutputCount when summarizing output modes.',
  },
  singleWoff2OutputCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of inspected output entries that look like single-WOFF2 fallback output.',
    agentAction: 'Disclose these separately from normal multi-subset output.',
  },
  copyOriginalOutputCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of inspected output entries that only recorded copy-original handling.',
    agentAction: 'Disclose that these entries do not contain generated WOFF2/CSS output.',
  },
  filesIncluded: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Whether flat output files[] details are included.',
    agentAction: 'Rerun with includeFiles:true when file-level audit details are required.',
  },
  familiesIncluded: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Whether structured families[] details are included.',
    agentAction: 'Rerun with includeFamilies:true when family-level audit details are required.',
  },
};
