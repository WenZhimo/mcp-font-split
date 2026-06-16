import {
  GUIDANCE_BATCH_RECOMMENDATION_FIELD_CATALOG,
  GUIDANCE_CONFIGURATION_FIELD_CATALOG,
  GUIDANCE_DIRECTORY_HANDLING_FIELD_CATALOG,
  GUIDANCE_DIRECTORY_WORKFLOW_FIELD_CATALOG,
  GUIDANCE_HEADER_FIELD_CATALOG,
  GUIDANCE_IDENTITY_FIELD_CATALOG,
  GUIDANCE_REFERENCE_FIELD_CATALOG,
  GUIDANCE_SAFE_WORKFLOW_FIELD_CATALOG,
  GUIDANCE_WARNING_FIELD_CATALOG,
  GUIDANCE_WORKFLOW_PRESET_FIELD_CATALOG,
} from './guidance-response-field-catalog.js';
import {
  RUNTIME_STATUS_NODE_FIELD_CATALOG,
  RUNTIME_STATUS_RUNTIME_FIELD_CATALOG,
} from './runtime-status-response-field-catalog.js';
import {
  COMPACT_CHECK_RESPONSE_FIELD_CATALOG,
  REAL_CORPUS_CHECK_RESPONSE_FIELD_CATALOG,
} from './local-verification-response-field-catalog.js';
import {
  SOURCE_INPUT_SCAN_RESPONSE_FIELD_CATALOG,
} from './source-input-response-field-catalog.js';
import {
  OUTPUT_AUDIT_RESPONSE_FIELD_CATALOG,
} from './output-audit-response-field-catalog.js';
import {
  BATCH_DECISION_RESPONSE_FIELD_CATALOG,
  BATCH_ERROR_AND_INCREMENTAL_RESPONSE_FIELD_CATALOG,
  BATCH_PLAN_RESPONSE_FIELD_CATALOG,
  BATCH_RESULT_RESPONSE_FIELD_CATALOG,
  BATCH_SKIP_MODE_RESPONSE_FIELD_CATALOG,
} from './batch-response-field-catalog.js';

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
  ...RUNTIME_STATUS_NODE_FIELD_CATALOG,
  workspace: {
    sourceTools: ['get_agent_guidance', 'get_runtime_status'],
    meaning: 'Resolved FONT_SPLIT_ROOT workspace and configuration status.',
    agentAction: 'Confirm paths are inside the intended workspace before reading or writing local fonts.',
  },
  ...GUIDANCE_HEADER_FIELD_CATALOG,
  ...RUNTIME_STATUS_RUNTIME_FIELD_CATALOG,
  ...SOURCE_INPUT_SCAN_RESPONSE_FIELD_CATALOG,
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
  ...COMPACT_CHECK_RESPONSE_FIELD_CATALOG,
  ...REAL_CORPUS_CHECK_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_SAFE_WORKFLOW_FIELD_CATALOG,
  ...BATCH_DECISION_RESPONSE_FIELD_CATALOG,
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
  ...BATCH_PLAN_RESPONSE_FIELD_CATALOG,
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
  ...BATCH_RESULT_RESPONSE_FIELD_CATALOG,
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
  ...BATCH_SKIP_MODE_RESPONSE_FIELD_CATALOG,
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
  ...BATCH_ERROR_AND_INCREMENTAL_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_WORKFLOW_PRESET_FIELD_CATALOG,
  ...OUTPUT_AUDIT_RESPONSE_FIELD_CATALOG,
};
