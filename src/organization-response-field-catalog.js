export const ORGANIZATION_WARNING_RESPONSE_FIELD_CATALOG = {
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
};

export const ORGANIZATION_OPERATION_RESPONSE_FIELD_CATALOG = {
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
};

export const ORGANIZATION_DIRECTORY_WORKFLOW_RESPONSE_FIELD_CATALOG = {
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
};

export const ORGANIZATION_PARSING_RESPONSE_FIELD_CATALOG = {
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
};
