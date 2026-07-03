export const WARNING_CODE_CATALOG = {
  'dry-run-no-write': {
    sources: ['batchWarnings'],
    severity: 'info',
    suggestedAction: 'Treat the response as a preview only; rerun with dryRun:false after reviewing planned output.',
  },
  'input-scan-truncated': {
    sources: ['batchWarnings', 'inspectionWarnings', 'organizationWarnings'],
    severity: 'action-required',
    suggestedAction: 'Rerun with a higher maxFiles before trusting counts, plans, or audit summaries.',
  },
  'batch-limit-truncated': {
    sources: ['batchWarnings'],
    severity: 'warning',
    suggestedAction: 'Increase limit or acknowledge that only the selected subset of deduplicated fonts was processed.',
  },
  'batch-plan-omitted': {
    sources: ['batchWarnings'],
    severity: 'info',
    suggestedAction: 'Rerun with includeResults:true when a dry-run plan must be inspected.',
  },
  'batch-results-omitted': {
    sources: ['batchWarnings'],
    severity: 'info',
    suggestedAction: 'Use summary counts for large runs, or rerun with includeResults:true when per-font results are needed.',
  },
  'existing-output-skipped': {
    sources: ['batchWarnings'],
    severity: 'warning',
    suggestedAction: 'Inspect skipMode and manifests; use skipMode:force only when reprocessing existing output is intentional.',
  },
  'errors-collected': {
    sources: ['batchWarnings'],
    severity: 'action-required',
    suggestedAction: 'Inspect errors[] before claiming the batch fully succeeded; use fail-after for stricter automation.',
  },
  'input-files-omitted': {
    sources: ['inspectionWarnings'],
    severity: 'info',
    suggestedAction: 'Rerun with includeFiles:true if per-font inspection details are needed.',
  },
  'invalid-fonts-found': {
    sources: ['inspectionWarnings'],
    severity: 'warning',
    suggestedAction: 'Inspect invalidFonts[] or files[] before processing; decide whether broken font-like files should be preserved.',
  },
  'font-identity-missing': {
    sources: ['inspectionWarnings'],
    severity: 'warning',
    suggestedAction: 'Expect identity dedupe to fall back for those fonts; inspect files[] when dedupe precision matters.',
  },
  'output-scan-truncated': {
    sources: ['inspectionWarnings'],
    severity: 'action-required',
    suggestedAction: 'Rerun inspect_split_output with a higher maxFiles before treating the audit as complete.',
  },
  'output-files-omitted': {
    sources: ['inspectionWarnings'],
    severity: 'info',
    suggestedAction: 'Rerun with includeFiles:true if flat output file details are needed.',
  },
  'output-families-omitted': {
    sources: ['inspectionWarnings'],
    severity: 'info',
    suggestedAction: 'Rerun with includeFamilies:true if structured family output details are needed.',
  },
  'missing-manifests': {
    sources: ['inspectionWarnings'],
    severity: 'warning',
    suggestedAction: 'Treat manifest-free output entries as conservatively inferred; rerun or regenerate output with split-meta.json manifests for strict audits.',
  },
  'output-structure-issues': {
    sources: ['inspectionWarnings'],
    severity: 'action-required',
    suggestedAction: 'Inspect structureSummary.conforms, issues[], and unexpectedFileExamples[] before treating generated output as valid.',
  },
  'organized-staging-not-split-output': {
    sources: ['inspectionWarnings'],
    severity: 'action-required',
    suggestedAction: 'Inspect this directory as source-like staging with inspect_font_inputs, then run split_font_batch safe-preview before auditing generated split output.',
  },
  'organization-dry-run': {
    sources: ['organizationWarnings'],
    severity: 'info',
    suggestedAction: 'Review planActionSummary, plan[], and recommendedNextActions before rerunning with dryRun:false.',
  },
  'organization-writes-output': {
    sources: ['organizationWarnings'],
    severity: 'info',
    suggestedAction: 'Confirm writesOutputTree and mayOverwriteOutputTree; source files are still preserved.',
  },
  'font-parsing-skipped': {
    sources: ['organizationWarnings'],
    severity: 'warning',
    suggestedAction: 'Rerun with parseFonts:true before relying on invalid-font counts, glyph counts, identity dedupe, or metadata grouping.',
  },
  'output-overwrite-enabled': {
    sources: ['organizationWarnings'],
    severity: 'action-required',
    suggestedAction: 'Confirm overwriting files in outputDir is acceptable before proceeding.',
  },
  'unsupported-files-ignored': {
    sources: ['organizationWarnings'],
    severity: 'info',
    suggestedAction: 'No action needed unless non-font assets must be preserved separately.',
  },
  'invalid-fonts-skipped': {
    sources: ['organizationWarnings'],
    severity: 'warning',
    suggestedAction: 'Use copyInvalidFonts:true only when preserving broken font-like files is intentional.',
  },
  'duplicate-fonts-skipped': {
    sources: ['organizationWarnings'],
    severity: 'info',
    suggestedAction: 'Inspect plan[] when representative choice matters; adjust batchDedupeMode if duplicates should be kept.',
  },
  'mixed-layout-detected': {
    sources: ['organizationWarnings'],
    severity: 'warning',
    suggestedAction: 'Review layout and recommendedBatchPreviewArgs before direct batch splitting.',
  },
  'output-inside-input': {
    sources: ['batchWarnings', 'organizationWarnings'],
    severity: 'action-required',
    suggestedAction: 'Use the nested output directory intentionally as a later input or exclude it from future broad scans.',
  },
};
