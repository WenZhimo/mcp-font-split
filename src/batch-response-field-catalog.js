export const BATCH_DECISION_RESPONSE_FIELD_CATALOG = {
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
};

export const BATCH_PLAN_RESPONSE_FIELD_CATALOG = {
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
};

export const BATCH_RESULT_RESPONSE_FIELD_CATALOG = {
  resultsIncluded: {
    sourceTools: ['split_font_batch'],
    meaning: 'Whether per-font batch results[] are included.',
    agentAction: 'If false, rely on summary counters or rerun with includeResults:true when per-font details are needed.',
  },
};

export const BATCH_SKIP_MODE_RESPONSE_FIELD_CATALOG = {
  skipMode: {
    sourceTools: ['split_font_batch'],
    meaning: 'Resolved existing-output skip policy for batch runs: manifest accepts matching existing output, while force reprocesses selected fonts.',
    agentAction: 'Use manifest for incremental reruns; use force only when the user intentionally wants to rewrite existing output, then audit the output root.',
  },
};

export const BATCH_ERROR_AND_INCREMENTAL_RESPONSE_FIELD_CATALOG = {
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
};
