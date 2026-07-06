export const WORKFLOW_SCAN_LIMIT_RESPONSE_FIELD_CATALOG = {
  maxFilesHit: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory', 'inspect_split_output'],
    meaning: 'True when a scan stopped at maxFiles before covering all files.',
    agentAction: 'Rerun with a higher maxFiles before trusting counts, plans, or audits.',
  },
};

export const SHARED_DRY_RUN_RESPONSE_FIELD_CATALOG = {
  dryRun: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the call only planned work instead of writing output.',
    agentAction: 'Confirm this explicitly because both split_font_batch and organize_font_directory default to no-write dry-run previews; real writes require reviewed-write or explicit dryRun false.',
  },
};

export const SHARED_RECOMMENDED_NEXT_ACTIONS_RESPONSE_FIELD_CATALOG = {
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
};

export const SHARED_PLAN_VISIBILITY_RESPONSE_FIELD_CATALOG = {
  planIncluded: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether per-item planned actions are included.',
    agentAction: 'If false, use summary fields or rerun with includeResults/includePlan true before detailed review.',
  },
};
