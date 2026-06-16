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
  SOURCE_SAFETY_SUMMARY_RESPONSE_FIELD_CATALOG,
  SOURCE_SAFETY_WRITE_SCOPE_RESPONSE_FIELD_CATALOG,
} from './source-safety-response-field-catalog.js';
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
import {
  SHARED_BATCH_IDENTITY_EVIDENCE_RESPONSE_FIELD_CATALOG,
  SHARED_BATCH_MODE_RESPONSE_FIELD_CATALOG,
  SHARED_BATCH_POLICY_RESPONSE_FIELD_CATALOG,
  SHARED_BATCH_WORKFLOW_RESPONSE_FIELD_CATALOG,
} from './batch-policy-response-field-catalog.js';
import {
  ORGANIZATION_DIRECTORY_WORKFLOW_RESPONSE_FIELD_CATALOG,
  ORGANIZATION_OPERATION_RESPONSE_FIELD_CATALOG,
  ORGANIZATION_PARSING_RESPONSE_FIELD_CATALOG,
  ORGANIZATION_WARNING_RESPONSE_FIELD_CATALOG,
} from './organization-response-field-catalog.js';

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
  ...SOURCE_SAFETY_SUMMARY_RESPONSE_FIELD_CATALOG,
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
  ...ORGANIZATION_WARNING_RESPONSE_FIELD_CATALOG,
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
  ...ORGANIZATION_OPERATION_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_DIRECTORY_HANDLING_FIELD_CATALOG,
  ...ORGANIZATION_DIRECTORY_WORKFLOW_RESPONSE_FIELD_CATALOG,
  ...SOURCE_SAFETY_WRITE_SCOPE_RESPONSE_FIELD_CATALOG,
  ...ORGANIZATION_PARSING_RESPONSE_FIELD_CATALOG,
  recommendedBatchOptions: {
    sourceTools: ['organize_font_directory', 'get_agent_guidance'],
    meaning: 'Suggested split_font_batch option fragment from guidance or layout analysis. It is not a complete safe invocation by itself.',
    agentAction: 'Prefer recommendedBatchPreviewArgs for a copyable no-write preview call after organize_font_directory; use this field only as policy overrides after reviewing layout and warnings.',
  },
  ...GUIDANCE_BATCH_RECOMMENDATION_FIELD_CATALOG,
  ...SHARED_BATCH_POLICY_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_IDENTITY_FIELD_CATALOG,
  identityBasis: {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Machine-readable basis used to build a font identity key, such as typographic-family-subfamily, opentype-family-subfamily, full-name, postscript-name, family-only, or a fallback basis.',
    agentAction: 'Look up this value in fontIdentityBasisCatalog before claiming semantic equivalence or explaining dedupe results.',
  },
  ...SHARED_BATCH_IDENTITY_EVIDENCE_RESPONSE_FIELD_CATALOG,
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
  ...SHARED_BATCH_WORKFLOW_RESPONSE_FIELD_CATALOG,
  ...BATCH_SKIP_MODE_RESPONSE_FIELD_CATALOG,
  ...SHARED_BATCH_MODE_RESPONSE_FIELD_CATALOG,
  ...BATCH_ERROR_AND_INCREMENTAL_RESPONSE_FIELD_CATALOG,
  ...GUIDANCE_WORKFLOW_PRESET_FIELD_CATALOG,
  ...OUTPUT_AUDIT_RESPONSE_FIELD_CATALOG,
};
