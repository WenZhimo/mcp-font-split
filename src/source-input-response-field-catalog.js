export const SOURCE_INPUT_SCAN_RESPONSE_FIELD_CATALOG = {
  supportedFontCount: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Number of scanned files with supported font extensions.',
    agentAction: 'Use with maxFilesHit and warning fields before trusting source coverage.',
  },
  unsupportedFileSummary: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Compact summary of all ignored non-font files, including precise extension counts, coarse categories, extensionless files, and example paths.',
    agentAction: 'Use this when source directories include archives, docs, generated files, or other noise that will not be organized or split; inspect the subfields before judging corpus coverage.',
  },
  unsupportedFileDecision: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Compact machine-readable triage of ignored non-font files derived from unsupportedFileSummary.',
    agentAction: 'Use this first to see whether ignored files exist, whether archive files or non-.zip/.txt noise are present, and whether the tool will extract, copy, or split those files; use unsupportedFileSummary for exact evidence.',
  },
  inputCountGuide: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Compact machine-readable guide for interpreting source scan counts, maxFiles truncation, omitted file details, and unsupported-file handling.',
    agentAction: 'Check this before treating count fields as complete; if countCompleteness is truncated, rerun with a higher maxFiles before reporting corpus totals.',
  },
  'unsupportedFileSummary.total': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Total number of scanned files ignored because their extensions are not supported font formats.',
    agentAction: 'Use with maxFilesHit before treating the ignored-file count as complete.',
  },
  'unsupportedFileSummary.byExtension': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Exact ignored-file counts by normalized extension, with <none> for extensionless files.',
    agentAction: 'Use this when deciding whether unexpected file types are present; do not infer that archives are processed just because they are counted.',
  },
  'unsupportedFileSummary.byCategory': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Coarse ignored-file categories for agent triage, such as archive, document, image, web, metadata, signature, unsupported-font, extensionless, and other.',
    agentAction: 'Use this for noisy real corpora where exact extensions are too fragmented; archive entries are reported but still ignored.',
  },
  'unsupportedFileSummary.categoryDetails': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Category counts enriched with category meaning, representative extensions, and handling behavior.',
    agentAction: 'Use this to explain ignored archives, docs, images, unsupported font-adjacent files, and extensionless files without separately calling get_agent_guidance.',
  },
  'unsupportedFileSummary.handlingSummary': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Response-local handling policy for unsupported files in the current scan.',
    agentAction: 'Use this to confirm unsupported files are reported for context only; archives are not extracted and unsupported files are not copied or split.',
  },
  'unsupportedFileSummary.examples': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Small sample of ignored file paths, relative to the workspace when possible.',
    agentAction: 'Use examples to explain what was ignored without expanding every non-font file in a large corpus.',
  },
  'unsupportedFileSummary.examplesTruncated': {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Whether more ignored-file examples existed than were returned.',
    agentAction: 'If true and exact examples matter, inspect the source tree directly or rerun with a focused smaller input directory.',
  },
  validFontCount: {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Number of supported-extension files whose basic font metadata was parsed successfully.',
    agentAction: 'Treat null as unknown when metadata parsing was intentionally skipped.',
  },
  invalidFontCount: {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Number of supported-extension files that failed font metadata parsing.',
    agentAction: 'Inspect invalidFonts[] or organization warnings before deciding whether broken font-like files should be preserved.',
  },
  missingIdentityCount: {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Number of parseable fonts without a usable batch identity key.',
    agentAction: 'Expect identity dedupe to fall back for these fonts when precision matters.',
  },
};
