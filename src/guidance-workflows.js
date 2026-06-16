const SOURCE_LAYOUT_MISMATCH_FIELD = 'sourceLayoutMismatchSummary';
const SOURCE_LAYOUT_DECISION_CHECKLIST_FIELD = 'sourceLayoutMismatchSummary.decisionChecklist';
const SOURCE_LAYOUT_FIELD_LIST_KEYS = new Set(['inspectFields', 'mustInspectFields', 'responseFields']);
const DIRECTORY_ROUTE_REQUIRED_INSPECT_FIELDS = [
  'inputCountGuide',
  'layoutDecision',
  'layoutDecision.directoryHandling',
  'stagingDirectoryDecision',
  'organizationDecision',
  'directoryWorkflowSummary',
  SOURCE_LAYOUT_MISMATCH_FIELD,
  SOURCE_LAYOUT_DECISION_CHECKLIST_FIELD,
  'recommendedBatchPreviewArgs',
  'unsupportedFileDecision',
  'unsupportedFileSummary',
  'organizationWarnings',
  'planActionSummary',
];

export function withDirectoryRouteInspectFields(fields) {
  return uniqueStrings([
    ...(Array.isArray(fields) ? fields : []),
    ...DIRECTORY_ROUTE_REQUIRED_INSPECT_FIELDS,
  ]);
}

function withSourceLayoutDecisionChecklistField(fields) {
  if (!Array.isArray(fields)) return fields;
  const sourceLayoutIndex = fields.indexOf(SOURCE_LAYOUT_MISMATCH_FIELD);
  if (sourceLayoutIndex === -1 || fields.includes(SOURCE_LAYOUT_DECISION_CHECKLIST_FIELD)) return fields;
  return [
    ...fields.slice(0, sourceLayoutIndex + 1),
    SOURCE_LAYOUT_DECISION_CHECKLIST_FIELD,
    ...fields.slice(sourceLayoutIndex + 1),
  ];
}

export function attachSourceLayoutDecisionChecklistFields(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      attachSourceLayoutDecisionChecklistFields(item, seen);
    }
    return value;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SOURCE_LAYOUT_FIELD_LIST_KEYS.has(key)) {
      value[key] = withSourceLayoutDecisionChecklistField(child);
    } else {
      attachSourceLayoutDecisionChecklistFields(child, seen);
    }
  }
  return value;
}

export const SAFE_INVOCATION_TEMPLATES = [
  {
    id: 'runtime-diagnostic',
    tool: 'get_runtime_status',
    useWhen: 'Setup, workspace, Node version, package version, or WASM runtime availability is uncertain.',
    writesFiles: false,
    sourceDestructive: false,
    args: {},
    customizableFields: [],
    inspectFields: ['ok', 'recommendedActions', 'node', 'workspace', 'wasm', 'cnFontSplit'],
    nextStep: 'Handle recommendedActions before calling tools that write output.',
    successCriteria: 'Proceed to write-capable tools only when ok is true, or every recommendedActions item has been handled or disclosed.',
  },
  {
    id: 'source-preflight-compact',
    tool: 'inspect_font_inputs',
    useWhen: 'The source directory is large, unfamiliar, or may contain invalid font-like files.',
    writesFiles: false,
    sourceDestructive: false,
    args: {
      inputDir: '<font-source-dir>',
      maxFiles: 50000,
      includeFiles: false,
    },
    customizableFields: ['inputDir', 'maxFiles', 'includeFiles'],
    inspectFields: ['inputCountGuide', 'inputDirectoryDecision', 'layout', 'recommendedBatchPreviewArgs', 'maxFilesHit', 'inspectionWarnings', 'supportedFontCount', 'unsupportedFileDecision', 'unsupportedFileSummary', 'validFontCount', 'invalidFontCount', 'missingIdentityCount'],
    nextStep: 'Use inputDirectoryDecision to choose between rerun, invalid-font review, direct batch safe-preview, or non-destructive organization safe-preview.',
    successCriteria: 'Require maxFilesHit false before trusting counts, resolve or disclose invalid fonts and missing identities, then follow inputDirectoryDecision before any write.',
  },
  {
    id: 'single-font-process',
    tool: 'split_font',
    useWhen: 'The user named exactly one known supported font file and wants generated split output.',
    writesFiles: true,
    sourceDestructive: false,
    args: {
      fontPath: '<font-file>',
      outDir: '<split-output-root>',
    },
    customizableFields: ['fontPath', 'outDir', 'fontFamily', 'fontWeight', 'fontStyle', 'smallGlyphAction', 'splitFailureAction'],
    inspectFields: ['resultType', 'outputMode', 'performedSplit', 'usedFallback', 'warnings', 'manifestPath'],
    nextStep: 'Run inspect_split_output on outDir before reporting structural success.',
    successCriteria: 'manifestPath must exist; disclose any fallback, copy-original, or non-subset outputMode, then require an inspect_split_output audit before reporting completion.',
  },
  {
    id: 'directory-mismatch-plan',
    tool: 'organize_font_directory',
    useWhen: 'The source directory is flat, mixed, unfamiliar, or does not match the desired family grouping.',
    writesFiles: false,
    sourceDestructive: false,
    args: {
      inputDir: '<font-source-dir>',
      workflowPreset: 'safe-preview',
    },
    customizableFields: ['inputDir', 'outputDir', 'workflowPreset', 'maxFiles', 'parseFonts', 'includePlan', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode'],
    inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'dryRun', 'operationMode', 'layout', 'recommendedBatchOptions', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'plan']),
    nextStep: 'Use recommendedBatchPreviewArgs for a batch dry-run, or copy to a staging directory only after reviewing the plan.',
    successCriteria: 'The organization preview must remain no-write and sourceDestructive false, with layout, route decision, plan summary, warnings, and recommendedBatchPreviewArgs reviewed before any write.',
  },
  {
    id: 'structure-first-large-directory',
    tool: 'organize_font_directory',
    useWhen: 'The directory is very large/noisy and the agent first needs only directory shape, not metadata-sensitive decisions.',
    writesFiles: false,
    sourceDestructive: false,
    args: {
      inputDir: '<font-source-dir>',
      workflowPreset: 'structure-first',
    },
    customizableFields: ['inputDir', 'outputDir', 'workflowPreset', 'maxFiles', 'includePlan'],
    inspectFields: withDirectoryRouteInspectFields(['parsedFontMetadata', 'unparsedFontCount', 'effectiveBatchDedupeMode', 'dedupeLimitedByParsing', 'layout', 'recommendedBatchOptions']),
    nextStep: 'Rerun with parseFonts:true before trusting invalid-font counts, glyph counts, identity dedupe, or font-family grouping.',
    successCriteria: 'Use this result only for structure-level decisions; rerun with parseFonts true before relying on invalid-font counts, glyph counts, identity dedupe, or metadata grouping.',
  },
  {
    id: 'copy-organized-staging',
    tool: 'organize_font_directory',
    useWhen: 'The user wants a cleaner staging directory after a dry-run organization plan has been reviewed.',
    writesFiles: true,
    sourceDestructive: false,
    args: {
      inputDir: '<font-source-dir>',
      outputDir: 'organized-fonts',
      workflowPreset: 'reviewed-write',
    },
    customizableFields: ['inputDir', 'outputDir', 'workflowPreset', 'maxFiles', 'parseFonts', 'includePlan', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode', 'overwriteExisting'],
    inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'operationMode', 'copiedCount', 'organizationManifestPath', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'errorCount', 'errors']),
    nextStep: 'Use outputDir as the next split_font_batch input only after checking organizationWarnings.',
    successCriteria: 'The copy run must be sourceDestructive false, operationMode copy-only, errorCount zero, and copiedCount or planActionSummary must match the reviewed plan.',
  },
  {
    id: 'batch-dry-run-preview',
    tool: 'split_font_batch',
    useWhen: 'Before writing batch split output for an unfamiliar or newly organized source directory.',
    writesFiles: false,
    sourceDestructive: false,
    args: {
      inputDir: '<font-source-dir-or-organized-outputDir>',
      outputRoot: 'split-output',
      workflowPreset: 'safe-preview',
      limit: 50000,
      maxFiles: 50000,
    },
    customizableFields: ['inputDir', 'outputRoot', 'workflowPreset', 'limit', 'maxFiles', 'includeResults', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode', 'splitFailureAction'],
    inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'dryRun', 'batchDecision', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileDecision', 'unsupportedFileSummary', 'dedupeDecisionSummary', 'skippedDuplicates', 'errorCount', 'errors'],
    nextStep: 'If the plan is acceptable, rerun with dryRun:false; use includeResults:false for large real runs.',
    successCriteria: 'The preview must have dryRun true, sourceDestructive false, maxFilesHit false, errorCount zero, and acceptable planned paths, warnings, naming, and dedupe decisions before writing.',
  },
  {
    id: 'batch-process-reviewed-plan',
    tool: 'split_font_batch',
    useWhen: 'A batch dry-run has been reviewed and the user wants to write split output.',
    writesFiles: true,
    sourceDestructive: false,
    args: {
      inputDir: '<font-source-dir-or-organized-outputDir>',
      outputRoot: 'split-output',
      workflowPreset: 'reviewed-write',
      limit: 50000,
      maxFiles: 50000,
    },
    customizableFields: ['inputDir', 'outputRoot', 'workflowPreset', 'limit', 'maxFiles', 'skipMode', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode', 'splitFailureAction'],
    inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'dryRun', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'batchDecision', 'batchWarnings', 'batchWarningCount', 'dedupeDecisionSummary', 'errorCount', 'errors', 'resultsIncluded', 'maxFilesHit', 'unsupportedFileDecision', 'unsupportedFileSummary'],
    nextStep: 'Run inspect_split_output on outputRoot before reporting completion and require outputRoleDecision.auditAppliesToThisDirectory not false plus outputStructureDecision.status pass.',
    successCriteria: 'The reviewed write must have dryRun false, sourceDestructive false, maxFilesHit false, errorCount zero, and a follow-up inspect_split_output audit with outputRoleDecision.auditAppliesToThisDirectory not false plus outputStructureDecision.status pass before reporting completion.',
  },
  {
    id: 'output-audit-compact',
    tool: 'inspect_split_output',
    useWhen: 'After processing a batch or when auditing an existing split-output directory.',
    writesFiles: false,
    sourceDestructive: false,
    args: {
      outDir: 'split-output',
      maxFiles: 200000,
      includeFiles: false,
      includeFamilies: false,
    },
    customizableFields: ['outDir', 'maxFiles', 'includeFiles', 'includeFamilies'],
    inspectFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'maxFilesHit', 'inspectionWarnings', 'structureSummary', 'manifestCount', 'missingManifestCount', 'subsetOutputCount', 'singleWoff2OutputCount', 'copyOriginalOutputCount', 'filesIncluded', 'familiesIncluded'],
    nextStep: 'Require outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, and structureSummary.conforms true; if maxFilesHit is true or manifest/structure issues are detected, disclose uncertainty or rerun with more detail.',
    successCriteria: 'Require outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, structureSummary.conforms true, maxFilesHit false, and no action-required inspectionWarnings before treating output as valid.',
  },
];

export function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function buildDirectoryOrganizationQuickAnswer() {
  return {
    summaryType: 'directory-organization-quick-answer',
    directAnswer: 'Yes. Use organize_font_directory when the source directory layout does not match the desired batch grouping; it is source-non-destructive.',
    helperTool: 'organize_font_directory',
    helperToolPurpose: 'Plan a safer layout or copy selected font files into a cleaner source-like staging directory before split_font_batch.',
    firstCall: 'Run organize_font_directory with workflowPreset safe-preview before writing anything.',
    firstCallArgs: {
      inputDir: '<font-source-dir>',
      workflowPreset: 'safe-preview',
    },
    writeCallAfterReview: 'After reviewing the safe-preview plan, rerun organize_font_directory with workflowPreset reviewed-write to copy selected fonts into outputDir.',
    writeArgsAfterReview: {
      inputDir: '<font-source-dir>',
      outputDir: '<organized-output-dir>',
      workflowPreset: 'reviewed-write',
    },
    sourceDestructive: false,
    sourceFilesPreserved: true,
    sourceFilesMovedDeletedOrRewritten: false,
    dryRunDefault: true,
    writeMode: 'copy-only-outputDir',
    outputDirRole: 'organized-font-source-staging',
    isSplitOutput: false,
    nextToolAfterStaging: 'split_font_batch',
    auditToolAfterSplitWrite: 'inspect_split_output',
    inspectFields: [
      'sourceSafetyDecision',
      'safetySummary',
      'layoutDecision',
      'layoutDecision.directoryHandling',
      'stagingDirectoryDecision',
      'directoryWorkflowSummary',
      'sourceLayoutMismatchSummary',
      'sourceLayoutMismatchSummary.decisionChecklist',
      'recommendedBatchPreviewArgs',
      'recommendedNextActions',
      'organizationWarnings',
      'planActionSummary',
    ],
    successCriteria: [
      'Before any copy, sourceDestructive false, sourceFilesPreserved true, planActionSummary or plan[] matches user intent, and organizationWarnings are acceptable.',
      'Before any split write, run split_font_batch with safe-preview args and inspect planned paths, warnings, maxFilesHit, dedupe, and errors.',
      'After any split write, run inspect_split_output and require outputRoleDecision.auditAppliesToThisDirectory not false plus outputStructureDecision.status pass before reporting structural success.',
    ],
    nonIntuitiveBehavior: [
      'organize_font_directory never moves, deletes, or rewrites source font files; dryRun:false copies selected fonts into outputDir.',
      'outputDir is source-like staging, not generated split output; inspect_split_output is for the later split outputRoot, not the organized staging directory.',
      'writesSourceTree true means outputDir is inside the input tree; it does not mean source font files were modified.',
    ],
  };
}

export function buildRecommendedWorkflowPlan(workflow) {
  const auditStep = {
    id: 'audit-output',
    templateId: 'output-audit-compact',
    required: true,
    writesFiles: false,
    sourceDestructive: false,
    goal: 'Audit the generated output directory before reporting completion.',
    inspectFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'structureSummary', 'maxFilesHit', 'inspectionWarnings', 'manifestCount', 'missingManifestCount'],
    successCriteria: 'outputRoleDecision.auditAppliesToThisDirectory is not false, outputStructureDecision.status is pass, auditStatus is pass, auditPassed is true, structureSummary.conforms is true, maxFilesHit is false, and inspectionWarnings contain no action-required structure or truncation issues.',
  };
  const plans = {
    overview: {
      id: 'safe-agent-batch-workflow',
      summary: 'Default AI-agent path for an unfamiliar font directory: diagnose, preflight, resolve layout ambiguity, preview batch output, write only after review, then audit output.',
      orderedSteps: [
        {
          id: 'runtime-check',
          templateId: 'runtime-diagnostic',
          required: false,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Confirm the workspace, Node runtime, package versions, and WASM runtime are usable when setup is uncertain.',
          inspectFields: ['ok', 'recommendedActions', 'workspace', 'wasm', 'cnFontSplit'],
          successCriteria: 'ok is true, or every recommendedActions item has been handled.',
        },
        {
          id: 'source-preflight',
          templateId: 'source-preflight-compact',
          required: true,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Count supported fonts and ignored non-font files without writing output.',
          inspectFields: ['inputCountGuide', 'inputDirectoryDecision', 'layout', 'recommendedBatchPreviewArgs', 'maxFilesHit', 'inspectionWarnings', 'supportedFontCount', 'unsupportedFileDecision', 'unsupportedFileSummary', 'invalidFontCount'],
          successCriteria: 'maxFilesHit is false, or the caller intentionally accepts a bounded summary.',
        },
        {
          id: 'layout-decision',
          templateId: 'directory-mismatch-plan',
          required: 'when-layout-is-flat-mixed-unfamiliar-or-user-wants-staging',
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Use the organizer dry-run to decide whether direct batch splitting is safe or whether a copy-only staging directory is useful.',
          inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'layout']),
          successCriteria: 'The desired grouping is clear and any organizationWarnings have been reviewed.',
        },
        {
          id: 'batch-preview',
          templateId: 'batch-dry-run-preview',
          required: true,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Preview dedupe, naming, skip checks, warnings, and planned output paths before writing.',
          inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'dryRun', 'batchDecision', 'planned', 'batchWarnings', 'maxFilesHit', 'dedupeDecisionSummary', 'skippedDuplicates', 'errorCount', 'errors'],
          successCriteria: 'dryRun is true, sourceDestructive is false, maxFilesHit is false, and planned paths/warnings are acceptable.',
        },
        {
          id: 'reviewed-write',
          templateId: 'batch-process-reviewed-plan',
          required: 'after-preview-review',
          writesFiles: true,
          sourceDestructive: false,
          goal: 'Write split output only after the preview has been reviewed.',
          inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'batchDecision', 'batchWarnings', 'dedupeDecisionSummary', 'errorCount', 'errors', 'recommendedNextActions'],
          successCriteria: 'errorCount is zero and the response recommends or allows output audit.',
        },
        auditStep,
      ],
      decisionPoints: [
        {
          id: 'staging-needed',
          when: 'The user wants a cleaner source staging directory, or the source layout is too ambiguous for direct grouping.',
          useTemplateId: 'copy-organized-staging',
          inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'copiedCount', 'organizationManifestPath']),
          nextInput: 'Use the organizer outputDir as split_font_batch inputDir only after reviewing warnings.',
          successCriteria: 'The copy plan remains sourceDestructive false and copy-only, with copiedCount and organizationWarnings matching the reviewed plan.',
        },
        {
          id: 'direct-batch-ok',
          when: 'The source layout already matches the desired grouping.',
          useTemplateId: 'batch-dry-run-preview',
          inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchDecision', 'planned', 'batchWarnings', 'unsupportedFileDecision', 'unsupportedFileSummary'],
          nextInput: 'Use the original inputDir for split_font_batch.',
          successCriteria: 'The direct batch preview remains dryRun true and sourceDestructive false, with planned grouping and warnings acceptable for the original inputDir.',
        },
      ],
    },
    single: {
      id: 'single-font-workflow',
      summary: 'Process one known font path, then interpret resultType/outputMode instead of treating ok:true as normal subset proof.',
      orderedSteps: [
        {
          id: 'runtime-check',
          templateId: 'runtime-diagnostic',
          required: false,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Check setup when the workspace or runtime is uncertain.',
          inspectFields: ['ok', 'recommendedActions', 'workspace', 'wasm'],
          successCriteria: 'ok is true, or every recommendedActions item has been handled.',
        },
        {
          id: 'split-known-font',
          tool: 'split_font',
          required: true,
          writesFiles: true,
          sourceDestructive: false,
          goal: 'Process the named font file.',
          inspectFields: ['resultType', 'outputMode', 'performedSplit', 'usedFallback', 'warnings', 'manifestPath'],
          successCriteria: 'manifestPath exists and any fallback/copy-original result has been disclosed.',
        },
        {
          id: 'audit-single-output',
          templateId: 'output-audit-compact',
          required: true,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Audit the single-font output directory when reporting generated files.',
          inspectFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'structureSummary', 'manifestCount', 'inspectionWarnings'],
          successCriteria: 'outputRoleDecision.auditAppliesToThisDirectory is not false, outputStructureDecision.status is pass, and structureSummary.conforms is true, or any structure limitation is disclosed.',
        },
      ],
      decisionPoints: [
        {
          id: 'fallback-result',
          when: 'resultType is single-woff2-* or copy-original-small-glyph.',
          action: 'Tell the user this was not a normal multi-subset split.',
          inspectFields: ['resultType', 'outputMode', 'usedFallback', 'warnings'],
          successCriteria: 'Fallback or copy-original behavior has been explicitly disclosed before treating the single-font run as complete.',
        },
      ],
    },
    batch: {
      id: 'batch-workflow',
      summary: 'Preflight source inputs, optionally resolve layout mismatch, preview batch output, write reviewed output, then audit structure.',
      orderedSteps: [
        {
          id: 'source-preflight',
          templateId: 'source-preflight-compact',
          required: true,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Understand source size, ignored files, invalid fonts, and scan truncation before batch processing.',
          inspectFields: ['inputCountGuide', 'inputDirectoryDecision', 'layout', 'recommendedBatchPreviewArgs', 'maxFilesHit', 'supportedFontCount', 'unsupportedFileDecision', 'unsupportedFileSummary', 'invalidFontCount', 'missingIdentityCount'],
          successCriteria: 'The source scan is complete enough for the requested batch scope.',
        },
        {
          id: 'layout-decision',
          templateId: 'directory-mismatch-plan',
          required: 'when-layout-is-not-obviously-compatible',
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Check whether source directory layout matches desired family grouping.',
          inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'layout']),
          successCriteria: 'The grouping strategy is chosen and any layout warnings are reviewed.',
        },
        {
          id: 'batch-preview',
          templateId: 'batch-dry-run-preview',
          required: true,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Preview selected fonts, dedupe, naming, skip decisions, and warnings.',
          inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'dryRun', 'batchDecision', 'planned', 'batchWarnings', 'dedupeDecisionSummary', 'skippedDuplicates', 'errorCount', 'errors'],
          successCriteria: 'The preview paths, warnings, and dedupe policy match the user intent.',
        },
        {
          id: 'reviewed-write',
          templateId: 'batch-process-reviewed-plan',
          required: 'after-preview-review',
          writesFiles: true,
          sourceDestructive: false,
          goal: 'Run the reviewed batch write.',
          inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'batchDecision', 'batchWarnings', 'dedupeDecisionSummary', 'errorCount', 'errors', 'recommendedNextActions'],
          successCriteria: 'errorCount is zero and output audit is available.',
        },
        auditStep,
      ],
      decisionPoints: [
        {
          id: 'preserve-all-files',
          when: 'The user requires every supported source font file to be preserved even if duplicates appear equivalent.',
          action: 'Use workflowPreset preserve-all or explicitly set batchDedupeMode none before previewing.',
          inspectFields: ['batchDedupeMode', 'dedupeDecisionSummary', 'batchDecision', 'planned', 'skippedDuplicates'],
          successCriteria: 'The following preview/write intentionally uses batchDedupeMode none or preserve-all, and skippedDuplicates reflects the preserve-all intent.',
        },
      ],
    },
    inspect: {
      id: 'inspection-workflow',
      summary: 'Use read-only tools to verify source inputs or generated output, increasing maxFiles when scans are truncated.',
      orderedSteps: [
        {
          id: 'source-preflight',
          templateId: 'source-preflight-compact',
          required: 'when-inspecting-source-fonts',
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Inspect source font inputs without writing output.',
          inspectFields: ['inputCountGuide', 'maxFilesHit', 'inspectionWarnings', 'supportedFontCount', 'unsupportedFileDecision', 'unsupportedFileSummary'],
          successCriteria: 'maxFilesHit is false, or truncation is disclosed.',
        },
        auditStep,
      ],
      decisionPoints: [
        {
          id: 'need-details',
          when: 'A compact scan shows warnings, missing manifests, invalid fonts, or structure issues.',
          action: 'Rerun with includeFiles:true or includeFamilies:true only for the narrowed area that needs detail.',
          inspectFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'inspectionWarnings', 'structureSummary', 'filesIncluded', 'familiesIncluded'],
          successCriteria: 'Detailed rerun is limited to the narrowed area and resolves or discloses the warnings, missing manifests, invalid fonts, or structure issues that prompted it.',
        },
      ],
    },
    organize: {
      id: 'organization-workflow',
      summary: 'Plan directory cleanup with a dry run, copy to a staging directory only after review, then inspect or batch-preview that staged directory.',
      orderedSteps: [
        {
          id: 'organization-plan',
          templateId: 'directory-mismatch-plan',
          required: true,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Plan source grouping and copy actions without writing.',
          inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'layout', 'plan']),
          successCriteria: 'The copy plan and grouping policy are acceptable.',
        },
        {
          id: 'copy-staging',
          templateId: 'copy-organized-staging',
          required: 'only-if-user-wants-staging',
          writesFiles: true,
          sourceDestructive: false,
          goal: 'Copy selected fonts into outputDir without moving or deleting source files.',
          inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'copiedCount', 'organizationManifestPath']),
          successCriteria: 'sourceDestructive is false and copiedCount/organizationWarnings match the reviewed plan.',
        },
        {
          id: 'inspect-staging',
          templateId: 'source-preflight-compact',
          required: 'after-copy-staging',
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Inspect the staging output as the next source directory.',
          inspectFields: ['inputCountGuide', 'supportedFontCount', 'unsupportedFileDecision', 'unsupportedFileSummary', 'maxFilesHit', 'inspectionWarnings'],
          successCriteria: 'The staging directory contains the expected supported fonts.',
        },
        {
          id: 'preview-next-batch',
          templateId: 'batch-dry-run-preview',
          required: 'before-splitting-staging-or-original-source',
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Preview split output using either recommendedBatchPreviewArgs or the staged outputDir.',
          inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'batchDecision', 'planned', 'batchWarnings', 'dedupeDecisionSummary', 'skippedDuplicates'],
          successCriteria: 'The batch preview matches the selected grouping and dedupe policy.',
        },
      ],
      decisionPoints: [
        {
          id: 'copy-not-needed',
          when: 'The user only wants split output and recommendedBatchPreviewArgs are acceptable.',
          action: 'Skip copy-organized-staging and run split_font_batch safe-preview on the original inputDir.',
          inspectFields: withDirectoryRouteInspectFields(['layout']),
          successCriteria: 'Skipping staging is intentional, and recommendedBatchPreviewArgs plus layout/organization warnings support direct original-input preview.',
        },
      ],
    },
  };
  return plans[workflow] || plans.overview;
}

function buildQuickStartCallExamples(templateById) {
  const fromTemplate = (id, {
    exampleId,
    useWhen,
    customize = [],
    replaceArgs = {},
    inspectFields = null,
    successCriteria = null,
    nextRouteAfterSuccess = null,
  } = {}) => {
    const template = templateById.get(id);
    if (!template) return null;
    return {
      id: exampleId || id,
      templateId: id,
      tool: template.tool,
      useWhen: useWhen || template.useWhen,
      writesFiles: template.writesFiles,
      sourceDestructive: template.sourceDestructive,
      args: {
        ...(template.args || {}),
        ...replaceArgs,
      },
      customize: uniqueStrings(customize.length ? customize : template.customizableFields || []),
      inspectFields: inspectFields || template.inspectFields,
      successCriteria: successCriteria || template.successCriteria,
      ...(nextRouteAfterSuccess ? { nextRouteAfterSuccess } : {}),
      generatedFromTemplate: true,
    };
  };

  return [
    fromTemplate('single-font-process', {
      exampleId: 'process-single-font',
      useWhen: 'Process one known supported font file, then audit the generated output.',
      replaceArgs: {
        fontPath: '<font-file>',
        outDir: '<split-output-root>',
      },
      customize: ['fontPath', 'outDir', 'fontFamily', 'fontWeight', 'fontStyle', 'smallGlyphAction', 'splitFailureAction'],
      nextRouteAfterSuccess: 'output-audit',
    }),
    fromTemplate('source-preflight-compact', {
      exampleId: 'inspect-unfamiliar-source',
      useWhen: 'First read-only pass over an unfamiliar source directory.',
      replaceArgs: { inputDir: '<font-source-dir>' },
      customize: ['inputDir', 'maxFiles'],
      nextRouteAfterSuccess: 'layout-uncertain-or-staging-wanted',
    }),
    fromTemplate('directory-mismatch-plan', {
      exampleId: 'plan-source-layout',
      useWhen: 'Source layout is flat, mixed, unfamiliar, or may not match the desired grouping.',
      replaceArgs: { inputDir: '<font-source-dir>' },
      customize: ['inputDir', 'outputDir', 'batchGroupBy', 'maxFiles'],
      nextRouteAfterSuccess: 'batch-safe-preview',
    }),
    fromTemplate('structure-first-large-directory', {
      exampleId: 'quick-structure-first-plan',
      useWhen: 'Large/noisy directory where the first pass should avoid metadata parsing.',
      replaceArgs: { inputDir: '<font-source-dir>' },
      customize: ['inputDir', 'outputDir', 'maxFiles'],
      nextRouteAfterSuccess: 'layout-uncertain-or-staging-wanted',
    }),
    fromTemplate('copy-organized-staging', {
      exampleId: 'copy-reviewed-staging',
      useWhen: 'User wants a cleaner copied staging directory after reviewing a dry-run organization plan.',
      replaceArgs: {
        inputDir: '<font-source-dir>',
        outputDir: '<organized-output-dir>',
      },
      customize: ['inputDir', 'outputDir', 'overwriteExisting'],
      nextRouteAfterSuccess: 'batch-safe-preview',
    }),
    fromTemplate('batch-dry-run-preview', {
      exampleId: 'preview-batch-output',
      useWhen: 'Preview split output before any real batch write.',
      replaceArgs: {
        inputDir: '<font-source-dir-or-organized-outputDir>',
        outputRoot: '<split-output-root>',
      },
      customize: ['inputDir', 'outputRoot', 'batchGroupBy', 'limit', 'maxFiles'],
      nextRouteAfterSuccess: 'batch-reviewed-write',
    }),
    fromTemplate('batch-process-reviewed-plan', {
      exampleId: 'write-reviewed-batch-output',
      useWhen: 'Write split output only after the batch preview has been reviewed.',
      replaceArgs: {
        inputDir: '<font-source-dir-or-organized-outputDir>',
        outputRoot: '<split-output-root>',
      },
      customize: ['inputDir', 'outputRoot', 'limit', 'maxFiles'],
      nextRouteAfterSuccess: 'output-audit',
    }),
    fromTemplate('output-audit-compact', {
      exampleId: 'audit-split-output',
      useWhen: 'Audit generated split output before reporting structural success.',
      replaceArgs: { outDir: '<split-output-root>' },
      customize: ['outDir', 'maxFiles'],
      nextRouteAfterSuccess: 'complete',
    }),
  ].filter(Boolean);
}

function buildWorkflowQuickStart(workflow, quickStartCallExamples) {
  const examplesById = new Map(quickStartCallExamples.map((example) => [example.id, example]));
  const route = {
    overview: {
      recommendedExampleId: 'inspect-unfamiliar-source',
      alternateExampleIds: ['plan-source-layout', 'preview-batch-output'],
      decisionHint: 'Start with a read-only source preflight for unfamiliar directories; use alternates after source shape or user intent is clear.',
    },
    single: {
      recommendedExampleId: 'process-single-font',
      alternateExampleIds: ['audit-split-output'],
      decisionHint: 'Use only when the user supplied one supported font path; audit the output before reporting structural success.',
    },
    batch: {
      recommendedExampleId: 'inspect-unfamiliar-source',
      alternateExampleIds: ['plan-source-layout', 'preview-batch-output'],
      decisionHint: 'For batch work, inspect the source first, resolve layout ambiguity when needed, then preview before any reviewed write.',
    },
    inspect: {
      recommendedExampleId: 'inspect-unfamiliar-source',
      alternateExampleIds: ['audit-split-output'],
      decisionHint: 'Use the source preflight for input directories; use the audit alternate when the user points at generated split output.',
    },
    organize: {
      recommendedExampleId: 'plan-source-layout',
      alternateExampleIds: ['quick-structure-first-plan', 'copy-reviewed-staging'],
      decisionHint: 'Start with a no-write layout plan; use structure-first for very noisy directories or copy-reviewed-staging only after a reviewed dry-run plan.',
    },
  }[workflow] || {
    recommendedExampleId: 'inspect-unfamiliar-source',
    alternateExampleIds: ['plan-source-layout'],
    decisionHint: 'Start read-only, then choose a route from the inspected response.',
  };
  const recommendedCallExample = examplesById.get(route.recommendedExampleId) || null;
  const alternateCallExamples = route.alternateExampleIds
    .map((id) => examplesById.get(id))
    .filter(Boolean);
  return {
    summaryType: 'workflow-quick-start',
    workflow,
    recommendedExampleId: route.recommendedExampleId,
    recommendedCallExample,
    alternateExampleIds: route.alternateExampleIds,
    alternateCallExamples,
    decisionHint: route.decisionHint,
    generatedFromQuickStartCallExamples: true,
  };
}

export function buildNextToolDecisionSummary(workflow) {
  const templateById = new Map(SAFE_INVOCATION_TEMPLATES.map((template) => [template.id, template]));
  const quickStartCallExamples = buildQuickStartCallExamples(templateById);
  const workflowPrimaryRoute = {
    overview: 'unfamiliar-directory',
    single: 'single-known-font',
    batch: 'unfamiliar-directory',
    inspect: 'source-or-output-inspection',
    organize: 'layout-uncertain-or-staging-wanted',
  }[workflow] || 'unfamiliar-directory';

  const routes = [
    {
      id: 'setup-uncertain',
      useWhen: 'Workspace, Node runtime, package install, cn-font-split runtime, or WASM availability is uncertain.',
      firstTool: 'get_runtime_status',
      templateId: 'runtime-diagnostic',
      writesFiles: false,
      sourceDestructive: false,
      inspectFields: ['ok', 'recommendedActions', 'workspace', 'wasm', 'cnFontSplit'],
      continueWhen: 'ok is true, or every recommendedActions item has been handled or disclosed.',
      nextRouteAfterSuccess: workflowPrimaryRoute === 'setup-uncertain' ? 'unfamiliar-directory' : workflowPrimaryRoute,
    },
    {
      id: 'single-known-font',
      useWhen: 'The user named exactly one known supported font file.',
      firstTool: 'split_font',
      writesFiles: true,
      sourceDestructive: false,
      inspectFields: ['resultType', 'outputMode', 'performedSplit', 'usedFallback', 'warnings', 'manifestPath'],
      continueWhen: 'manifestPath exists and fallback/copy-original behavior has been disclosed when present.',
      requiredAfterWriteTool: 'inspect_split_output',
      requiredAfterWriteFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'structureSummary'],
    },
    {
      id: 'unfamiliar-directory',
      useWhen: 'The source is a directory and the agent first needs counts, ignored-file categories, invalid-font signals, or scan truncation status.',
      firstTool: 'inspect_font_inputs',
      templateId: 'source-preflight-compact',
      writesFiles: false,
      sourceDestructive: false,
      inspectFields: ['inputCountGuide', 'inputDirectoryDecision', 'layout', 'recommendedBatchPreviewArgs', 'maxFilesHit', 'inspectionWarnings', 'supportedFontCount', 'unsupportedFileDecision', 'unsupportedFileSummary', 'invalidFontCount'],
      continueWhen: 'maxFilesHit is false or truncation is intentionally accepted; ignored files and invalid fonts are reviewed.',
      nextRouteAfterSuccess: 'layout-uncertain-or-staging-wanted',
    },
    {
      id: 'layout-uncertain-or-staging-wanted',
      useWhen: 'The directory is flat, mixed, unfamiliar, or the user wants a cleaner copied staging directory before splitting.',
      firstTool: 'organize_font_directory',
      templateId: 'directory-mismatch-plan',
      firstArgsHint: { workflowPreset: 'safe-preview' },
      writesFiles: false,
      sourceDestructive: false,
      inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'layout']),
      continueWhen: 'The route, warnings, and sourceLayoutMismatchSummary.decisionChecklist are reviewed.',
      nextRouteAfterSuccess: 'batch-safe-preview',
      optionalRoute: 'copy-only-staging',
    },
    {
      id: 'large-noisy-structure-first',
      useWhen: 'The directory is huge/noisy and the agent only needs a quick structural read before metadata-sensitive decisions.',
      firstTool: 'organize_font_directory',
      templateId: 'structure-first-large-directory',
      firstArgsHint: { workflowPreset: 'structure-first' },
      writesFiles: false,
      sourceDestructive: false,
      inspectFields: withDirectoryRouteInspectFields(['parsedFontMetadata', 'unparsedFontCount', 'dedupeLimitedByParsing']),
      continueWhen: 'Use only for structure-level routing; rerun with safe-preview / parseFonts:true before identity dedupe or metadata-family grouping.',
      nextRouteAfterSuccess: 'layout-uncertain-or-staging-wanted',
    },
    {
      id: 'copy-only-staging',
      useWhen: 'The user explicitly wants an organized source-like staging directory after a dry-run plan has been reviewed.',
      firstTool: 'organize_font_directory',
      templateId: 'copy-organized-staging',
      firstArgsHint: { workflowPreset: 'reviewed-write' },
      writesFiles: true,
      sourceDestructive: false,
      writeBehavior: 'copy-only-outputDir',
      inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'operationMode', 'copiedCount', 'organizationManifestPath']),
      continueWhen: 'The copy run remains sourceDestructive false and copy-only, with errors resolved and warnings reviewed.',
      nextRouteAfterSuccess: 'batch-safe-preview',
    },
    {
      id: 'batch-safe-preview',
      useWhen: 'Before writing split output for either the original directory or an organized staging directory.',
      firstTool: 'split_font_batch',
      templateId: 'batch-dry-run-preview',
      firstArgsHint: { workflowPreset: 'safe-preview' },
      writesFiles: false,
      sourceDestructive: false,
      inspectFields: ['sourceSafetyDecision', 'safetySummary', 'dryRun', 'batchDecision', 'planned', 'batchWarnings', 'maxFilesHit', 'dedupeDecisionSummary', 'skippedDuplicates', 'errorCount', 'errors'],
      continueWhen: 'The preview is no-write, source-safe, untruncated, error-free, and planned paths/dedupe/naming match user intent.',
      nextRouteAfterSuccess: 'batch-reviewed-write',
    },
    {
      id: 'batch-reviewed-write',
      useWhen: 'The batch dry-run has been reviewed and the user wants generated split output.',
      firstTool: 'split_font_batch',
      templateId: 'batch-process-reviewed-plan',
      firstArgsHint: { workflowPreset: 'reviewed-write' },
      writesFiles: true,
      sourceDestructive: false,
      inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchDecision', 'batchWarnings', 'dedupeDecisionSummary', 'errorCount', 'errors', 'recommendedNextActions'],
      continueWhen: 'errorCount is zero and the response recommends or allows output audit.',
      nextRouteAfterSuccess: 'output-audit',
    },
    {
      id: 'output-audit',
      useWhen: 'After any split_font or split_font_batch write, or when validating an existing split-output directory.',
      firstTool: 'inspect_split_output',
      templateId: 'output-audit-compact',
      writesFiles: false,
      sourceDestructive: false,
      inspectFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'maxFilesHit', 'inspectionWarnings', 'structureSummary'],
      continueWhen: 'outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, structureSummary.conforms true, and maxFilesHit false.',
      nextRouteAfterSuccess: 'complete',
    },
    {
      id: 'source-or-output-inspection',
      useWhen: 'The user asks to inspect inputs or audit generated output without writing.',
      firstTool: 'inspect_font_inputs',
      alternateTool: 'inspect_split_output',
      writesFiles: false,
      sourceDestructive: false,
      inspectFields: ['maxFilesHit', 'inspectionWarnings', 'unsupportedFileDecision', 'unsupportedFileSummary', 'outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'structureSummary'],
      continueWhen: 'Use inspect_font_inputs for source directories and inspect_split_output for generated output; rerun with higher maxFiles or details when warnings require it.',
    },
  ];

  return attachSourceLayoutDecisionChecklistFields({
    summaryType: 'next-tool-decision-summary',
    workflow,
    primaryRouteId: workflowPrimaryRoute,
    purpose: 'Compact first routing index for agents choosing the next MCP tool call.',
    routeOrder: uniqueStrings([
      'setup-uncertain',
      workflowPrimaryRoute,
      'layout-uncertain-or-staging-wanted',
      'batch-safe-preview',
      'batch-reviewed-write',
      'output-audit',
    ]),
    routes,
    workflowQuickStart: buildWorkflowQuickStart(workflow, quickStartCallExamples),
    quickStartCallExamples,
    safetyDefaults: {
      previewPreset: 'safe-preview',
      writePreset: 'reviewed-write',
      organizationWritesAreCopyOnly: true,
      sourceDestructive: false,
      outputAuditRequiredAfterWrite: true,
    },
    nonIntuitiveBehavior: [
      'This summary is a routing index, not proof of completion.',
      'organize_font_directory dryRun:false copies selected fonts into outputDir only; it does not move, delete, or rewrite source fonts.',
      'split_font_batch safe-preview is the normal next step before reviewed-write, even when organize_font_directory says direct original-input preview is available.',
      'After any real split write, inspect_split_output is required before reporting structural success.',
    ],
  });
}


