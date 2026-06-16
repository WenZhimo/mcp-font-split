export function buildDirectoryOrganizationSafety({
  appliesToTool,
  inputDir = '<font-source-dir>',
  outputDir = 'organized-fonts',
  maxFiles,
} = {}) {
  const safePreviewArgs = {
    inputDir,
    outputDir,
    workflowPreset: 'safe-preview',
  };
  if (maxFiles !== undefined) {
    safePreviewArgs.maxFiles = maxFiles;
  }

  return {
    summaryType: 'directory-organization-safety',
    ...(appliesToTool ? { appliesToTool } : {}),
    helperTool: 'organize_font_directory',
    useWhen: 'Use when source directory layout may not match the intended batch grouping, or when the user wants a cleaner copied staging tree before splitting.',
    safePreviewArgs,
    helperToolDefaultMode: 'safe-preview-plan-only',
    helperToolWriteMode: 'copy-only-outputDir',
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    sourceFilesPreserved: true,
    sourceFilesMovedDeletedOrRewritten: false,
    writeBehavior: 'organize_font_directory writes only when rerun with dryRun:false or workflowPreset reviewed-write, and that write copies selected fonts into outputDir.',
    outputDirRole: 'organized-font-source-staging',
    isSplitOutput: false,
    inspectAfterCopyTool: 'inspect_font_inputs',
    previewAfterCopyTool: 'split_font_batch',
    auditAfterSplitWriteTool: 'inspect_split_output',
    nonIntuitiveBehavior: [
      'organize_font_directory does not move, delete, or rewrite source font files.',
      'The organizer outputDir is source-like staging, not final split output.',
      'After copy-only staging, inspect the staging directory as input and run split_font_batch safe-preview before any reviewed split write.',
    ],
  };
}
