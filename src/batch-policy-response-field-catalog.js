export const SHARED_BATCH_POLICY_RESPONSE_FIELD_CATALOG = {
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
};

export const SHARED_BATCH_IDENTITY_EVIDENCE_RESPONSE_FIELD_CATALOG = {
  'dedupeDecisionSummary.identityEvidenceSummary.identityBasisCounts': {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Compact count of identity basis values seen across selected and duplicate inputs during the dedupe pass.',
    agentAction: 'Use with fontIdentityBasisCatalog, pathFallbackUsed, and dedupeLimitedByParsing to decide how strongly identity dedupe can be described.',
  },
};

export const SHARED_BATCH_WORKFLOW_RESPONSE_FIELD_CATALOG = {
  workflowPreset: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Named configuration preset applied before explicit arguments. Explicit tool arguments override preset values.',
    agentAction: 'Use this to explain why effective defaults such as dryRun, parseFonts, skip mode, or dedupe mode were selected.',
  },
};

export const SHARED_BATCH_MODE_RESPONSE_FIELD_CATALOG = {
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
};
