export const SOURCE_LAYOUT_RESPONSE_FIELD_CATALOG = {
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
};
