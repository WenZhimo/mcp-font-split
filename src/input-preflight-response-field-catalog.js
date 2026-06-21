export const INPUT_PREFLIGHT_ROUTE_RESPONSE_FIELD_CATALOG = {
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
};
