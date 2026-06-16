export const COMPACT_CHECK_RESPONSE_FIELD_CATALOG = {
  'compact-check-result.ok': {
    sourceTools: ['npm run check:compact'],
    meaning: 'Boolean pass/fail result from the compact local syntax/smoke gate wrapper.',
    agentAction: 'Require true before treating the standard local gate as passed; if false, inspect failedStepId and steps[].',
  },
  'compact-check-result.failedStepId': {
    sourceTools: ['npm run check:compact'],
    meaning: 'Identifier of the failed compact-check child step, or null when every step passed.',
    agentAction: 'Use this to rerun the failing npm script directly or inspect the corresponding step tail.',
  },
  'compact-check-result.steps': {
    sourceTools: ['npm run check:compact'],
    meaning: 'Per-step compact check metadata, including ok, exitCode, elapsedMs, output byte counts, and stdout/stderr tails only for failing steps.',
    agentAction: 'Use failed step tails for quick triage; rerun the failed npm script directly for full output.',
  },
};

export const REAL_CORPUS_CHECK_RESPONSE_FIELD_CATALOG = {
  'coverageSummary.archiveHandlingScope': {
    sourceTools: ['npm run smoke:real-corpus-suite'],
    meaning: 'Machine-readable scope statement for archive files in the real-corpus suite: archives are counted as ignored files, but archive contents are not extracted, scanned, or counted as tested fonts.',
    agentAction: 'Use this field before reporting real-corpus coverage when the corpus contains zip/rar/7z/tar files; do not imply fonts inside archives were tested unless they were extracted outside this tool and scanned as normal files.',
  },
};
