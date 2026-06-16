export const SOURCE_SAFETY_SUMMARY_RESPONSE_FIELD_CATALOG = {
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
};

export const SOURCE_SAFETY_WRITE_SCOPE_RESPONSE_FIELD_CATALOG = {
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
};
