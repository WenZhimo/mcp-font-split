import { buildDirectoryOrganizationSafety } from './directory-organization-safety.js';

function buildOrganizerToolSafetyQuickReference() {
  const directorySafety = buildDirectoryOrganizationSafety({
    appliesToTool: 'get_agent_guidance',
  });
  return {
    tool: directorySafety.helperTool,
    defaultWritesFiles: directorySafety.writesFilesBeforeReview,
    defaultMode: directorySafety.helperToolDefaultMode,
    reviewedWriteMode: directorySafety.helperToolWriteMode,
    safePreviewArgs: directorySafety.safePreviewArgs,
    reviewedWriteArgs: {
      ...directorySafety.safePreviewArgs,
      workflowPreset: 'reviewed-write',
    },
    sourceDestructive: directorySafety.sourceDestructive,
    sourceFilesPreserved: directorySafety.sourceFilesPreserved,
    sourceFilesMovedDeletedOrRewritten: directorySafety.sourceFilesMovedDeletedOrRewritten,
    sourceBackupRequired: directorySafety.sourceDestructive === true,
    writeScope: 'outputDir-only-when-reviewed-write-or-dryRun-false',
    writeBehavior: directorySafety.writeBehavior,
    outputRole: directorySafety.outputDirRole,
    isSplitOutput: directorySafety.isSplitOutput,
    outputAuditRequiredAfterWrite: directorySafety.isSplitOutput,
    inspectAfterCopyTool: directorySafety.inspectAfterCopyTool,
    previewAfterCopyTool: directorySafety.previewAfterCopyTool,
    auditAfterSplitWriteTool: directorySafety.auditAfterSplitWriteTool,
    mustInspectFields: ['sourceSafetyDecision', 'safetySummary', 'operationMode', 'stagingDirectoryDecision', 'sourceLayoutMismatchSummary', 'organizationWarnings', 'planActionSummary'],
    nonIntuitiveBehavior: directorySafety.nonIntuitiveBehavior,
  };
}

export function buildToolSafetyQuickReference() {
  return {
    summaryType: 'tool-safety-quick-reference',
    purpose: 'Fast answer for which tools write files and whether any tool moves, deletes, or rewrites source font files.',
    sourceDestructivePolicy: 'No public tool moves, deletes, or rewrites source font files. Write-capable tools write only configured output directories.',
    tools: [
      {
        tool: 'get_agent_guidance',
        defaultWritesFiles: false,
        sourceDestructive: false,
        sourceFilesMovedDeletedOrRewritten: false,
        writeScope: 'none',
        mustInspectFields: ['guidanceView', 'projectStatusNotice', 'toolSafetyQuickReference', 'responseFieldsToCheck'],
        nonIntuitiveBehavior: 'This is guidance only; it does not inspect local font files or prove a later write succeeded.',
      },
      {
        tool: 'get_runtime_status',
        defaultWritesFiles: false,
        sourceDestructive: false,
        sourceFilesMovedDeletedOrRewritten: false,
        writeScope: 'none',
        mustInspectFields: ['ok', 'node', 'workspace', 'wasm', 'cnFontSplit', 'recommendedActions'],
        nonIntuitiveBehavior: 'It is read-only diagnostics; action-required results still need a follow-up command or configuration change.',
      },
      {
        tool: 'inspect_font_inputs',
        defaultWritesFiles: false,
        sourceDestructive: false,
        sourceFilesMovedDeletedOrRewritten: false,
        writeScope: 'none',
        mustInspectFields: ['inputCountGuide', 'inputDirectoryDecision', 'supportedFontCount', 'maxFilesHit', 'unsupportedFileDecision', 'unsupportedFileSummary'],
        nonIntuitiveBehavior: 'It counts supported font files and ignored files but never extracts archives or writes organization/split output.',
      },
      buildOrganizerToolSafetyQuickReference(),
      {
        tool: 'split_font',
        defaultWritesFiles: true,
        sourceDestructive: false,
        sourceFilesMovedDeletedOrRewritten: false,
        writeScope: 'outDir',
        outputAuditRequiredAfterWrite: true,
        mustInspectFields: ['resultType', 'outputMode', 'performedSplit', 'usedFallback', 'warnings', 'manifestPath'],
        nonIntuitiveBehavior: 'ok:true can still mean a single-woff2 fallback or copy-original output rather than normal subset output.',
      },
      {
        tool: 'split_font_batch',
        defaultWritesFiles: true,
        defaultMode: 'reviewed-write-required-for-real-output',
        safePreviewArgs: { workflowPreset: 'safe-preview' },
        reviewedWriteArgs: { workflowPreset: 'reviewed-write' },
        sourceDestructive: false,
        sourceFilesMovedDeletedOrRewritten: false,
        writeScope: 'outputRoot',
        outputAuditRequiredAfterWrite: true,
        mustInspectFields: ['sourceSafetyDecision', 'safetySummary', 'dryRun', 'batchDecision', 'batchWarnings', 'maxFilesHit', 'dedupeDecisionSummary', 'errorCount', 'errors', 'recommendedNextActions'],
        nonIntuitiveBehavior: 'Raw split_font_batch defaults to dryRun:false, so agents should use workflowPreset safe-preview before any real write.',
      },
      {
        tool: 'inspect_split_output',
        defaultWritesFiles: false,
        sourceDestructive: false,
        sourceFilesMovedDeletedOrRewritten: false,
        writeScope: 'none',
        mustInspectFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'maxFilesHit', 'inspectionWarnings', 'structureSummary'],
        nonIntuitiveBehavior: 'It audits generated split output; it is not the right tool for source-like organize_font_directory staging output.',
      },
    ],
    nonIntuitiveBehavior: [
      'sourceDestructive false means source font files are not moved, deleted, or rewritten.',
      'writesSourceTree true means a configured output tree is inside the input tree; it does not mean source font files were modified.',
      'mayOverwriteOutputTree applies only to generated output paths or organizer outputDir, not to source font files.',
      'organize_font_directory outputDir is source-like staging; audit final split output with inspect_split_output after split_font or split_font_batch writes.',
    ],
  };
}
