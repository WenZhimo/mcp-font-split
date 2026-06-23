import { buildDirectoryOrganizationSafety } from './directory-organization-safety.js';

export function buildDirectoryOrganizationQuickAnswer() {
  const directoryOrganizationSafety = buildDirectoryOrganizationSafety({
    appliesToTool: 'get_agent_guidance',
    inputDir: '<font-source-dir>',
    outputDir: '<organized-output-dir>',
  });
  return {
    summaryType: 'directory-organization-quick-answer',
    directAnswer: 'Yes. Use organize_font_directory when the source directory layout does not match the desired batch grouping; it is source-non-destructive.',
    helperTool: 'organize_font_directory',
    helperToolPurpose: 'Plan a safer layout or copy selected font files into a cleaner source-like staging directory before split_font_batch.',
    directoryOrganizationSafety,
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
    sourceDestructive: directoryOrganizationSafety.sourceDestructive,
    sourceFilesPreserved: directoryOrganizationSafety.sourceFilesPreserved,
    sourceFilesMovedDeletedOrRewritten: directoryOrganizationSafety.sourceFilesMovedDeletedOrRewritten,
    dryRunDefault: true,
    writeMode: directoryOrganizationSafety.helperToolWriteMode,
    outputDirRole: directoryOrganizationSafety.outputDirRole,
    isSplitOutput: directoryOrganizationSafety.isSplitOutput,
    nextToolAfterStaging: 'split_font_batch',
    auditToolAfterSplitWrite: directoryOrganizationSafety.auditAfterSplitWriteTool,
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
