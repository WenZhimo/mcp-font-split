export const RESULT_SHAPE_RESPONSE_FIELD_CATALOG = {
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
};
