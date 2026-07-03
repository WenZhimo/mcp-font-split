export function buildBatchCustomizationQuickReference() {
  const basePreviewArgs = {
    inputDir: '<font-source-dir>',
    outputRoot: '<split-output-root>',
    workflowPreset: 'safe-preview',
  };
  const baseWriteArgs = {
    inputDir: '<font-source-dir>',
    outputRoot: '<split-output-root>',
    workflowPreset: 'reviewed-write',
  };
  const withArgs = (overrideArgs) => ({
    overrideArgs,
    previewArgs: {
      ...basePreviewArgs,
      ...overrideArgs,
    },
    writeArgsAfterReview: {
      ...baseWriteArgs,
      ...overrideArgs,
    },
  });

  return [
    {
      id: 'safe-defaults',
      userIntent: 'Use the agent-safe default batch behavior.',
      optionNames: ['workflowPreset', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode'],
      ...withArgs({}),
      inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'batchDecision', 'batchWarnings', 'dedupeDecisionSummary', 'errorCount', 'errors'],
      successCriteria: 'Preview first with safe-preview; reviewed-write only after planned paths, warnings, dedupe, maxFilesHit, and errors are acceptable.',
      nonIntuitiveBehavior: 'Defaults already use numeric-suffix naming, font-identity dedupe, and fail-after errors; do not add redundant explicit overrides unless user intent differs.',
    },
    {
      id: 'preserve-every-source-font',
      userIntent: 'Keep every supported source font even when files look like duplicate formats.',
      optionNames: ['batchDedupeMode'],
      ...withArgs({ batchDedupeMode: 'none' }),
      inspectFields: ['batchPolicySummary', 'dedupeDecisionSummary', 'skippedDuplicates', 'planned', 'batchWarnings', 'errorCount', 'errors'],
      successCriteria: 'The preview and reviewed write must intentionally use batchDedupeMode none, skippedDuplicates must reflect preserve-all intent, and output audit must pass after write.',
      nonIntuitiveBehavior: 'Disabling dedupe may increase output entries and naming collisions; keep numeric-suffix unless the user explicitly asks otherwise.',
    },
    {
      id: 'source-folder-families',
      userIntent: 'Use existing top-level source folders as family/group names.',
      optionNames: ['batchGroupBy'],
      ...withArgs({ batchGroupBy: 'source-dir' }),
      inspectFields: ['batchPolicySummary', 'batchGroupBy', 'planned', 'batchWarnings', 'sourceSafetyDecision', 'safetySummary', 'unsupportedFileSummary'],
      successCriteria: 'Preview paths must preserve intended source-folder grouping without mixing unrelated root-level files unexpectedly.',
      nonIntuitiveBehavior: 'source-dir trusts folder names even when internal font metadata says a different family.',
    },
    {
      id: 'metadata-family-groups',
      userIntent: 'Use internal font metadata to decide family/group names.',
      optionNames: ['batchGroupBy'],
      ...withArgs({ batchGroupBy: 'font-family' }),
      inspectFields: ['batchPolicySummary', 'batchGroupBy', 'planned', 'batchWarnings', 'missingIdentityCount', 'invalidFontCount', 'dedupeDecisionSummary'],
      successCriteria: 'Font metadata must be parsed and preview paths must match intended metadata families; missing identities or invalid fonts must be disclosed.',
      nonIntuitiveBehavior: 'metadata grouping depends on parsed font names and can differ from source folder names.',
    },
    {
      id: 'plain-output-names',
      userIntent: 'Use bare output names without automatic numeric suffixes.',
      optionNames: ['batchNamingMode'],
      ...withArgs({ batchNamingMode: 'plain' }),
      inspectFields: ['batchPolicySummary', 'batchNamingMode', 'planned', 'batchWarnings', 'errorCount', 'errors'],
      successCriteria: 'Plain naming must be explicit, planned paths must be reviewed for same-group collisions, and any collision/error risk must be disclosed.',
      nonIntuitiveBehavior: 'plain naming removes collision protection; same-group name collisions can overwrite, merge, or error depending on the path.',
    },
    {
      id: 'source-suffix-traceability',
      userIntent: 'Add source-derived suffixes for traceability across folders or similarly named files.',
      optionNames: ['batchNamingMode'],
      ...withArgs({ batchNamingMode: 'source-suffix' }),
      inspectFields: ['batchPolicySummary', 'batchNamingMode', 'planned', 'batchWarnings'],
      successCriteria: 'Source suffixes must be intentionally requested and preview paths must show the desired traceability without surprising extra suffixes.',
      nonIntuitiveBehavior: 'source-suffix is never implicit; default numeric-suffix keeps bare names until real conflicts require suffixes.',
    },
    {
      id: 'collect-errors-for-report',
      userIntent: 'Collect per-font errors in the response instead of failing the batch result immediately.',
      optionNames: ['batchErrorMode'],
      ...withArgs({ batchErrorMode: 'collect' }),
      inspectFields: ['batchPolicySummary', 'batchErrorMode', 'batchDecision', 'errorCount', 'errors', 'recommendedNextActions'],
      successCriteria: 'Every errors[] entry must be inspected or disclosed; require errorCount zero before reporting full success.',
      nonIntuitiveBehavior: 'collect can return ok:true with errors[], so ok:true alone is not proof that the batch fully succeeded.',
    },
  ];
}
