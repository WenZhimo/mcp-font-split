import {
  UNSUPPORTED_FILE_CATEGORY_DETAILS,
  UNSUPPORTED_FILE_EXTENSION_CATEGORIES,
  WORKFLOW_PRESETS,
  WORKFLOW_PRESET_NAMES,
} from './catalogs.js';

export function buildProjectStatusNotice() {
  return {
    summaryType: 'project-status-notice',
    status: 'actively-being-refined',
    formalRelease: false,
    stability: 'pre-release',
    directAnswer: 'This project is still being refined and has not been formally released; interfaces, defaults, response fields, directory-organization policy, and docs may change.',
    authoritativeSources: [
      'current repository code',
      'get_agent_guidance',
      'live MCP tool schema',
      'API.md / API.zh-CN.md',
      'BEHAVIOR.zh-CN.md',
    ],
    forwardCompatibilityPolicy: {
      required: false,
      reason: 'The package is not formally released yet.',
      removeUnreleasedCompatibilityCruft: true,
      avoidPreservingStaleBehavior: true,
    },
    agentAction: 'Use current code, live schema, get_agent_guidance, and current docs as authoritative. When improving this package before formal release, prefer clear current behavior over preserving stale compatibility fields.',
    nonIntuitiveBehavior: [
      'Pre-release response fields and defaults may change when that makes the tool easier to understand or safer for agents.',
      'Compatibility shims for unreleased fields should be removed when they add noise or contradict current behavior.',
      'After updating the package, rerun get_agent_guidance instead of relying on older conversation memory.',
    ],
  };
}

export function buildWorkflowPresetCatalog() {
  return WORKFLOW_PRESET_NAMES.map((id) => {
    const preset = WORKFLOW_PRESETS[id];
    return {
      id,
      description: preset.description,
      writesBatchFiles: preset.writesBatchFiles,
      writesOrganizationFiles: preset.writesOrganizationFiles,
      batchDefaults: preset.batch,
      organizationDefaults: preset.organize,
      explicitOptionsOverridePreset: true,
    };
  });
}

export function buildUnsupportedFileCategoryCatalog() {
  return Object.fromEntries(
    Object.entries(UNSUPPORTED_FILE_CATEGORY_DETAILS).map(([category, details]) => [
      category,
      {
        category,
        extensions: details.extensions || [...(UNSUPPORTED_FILE_EXTENSION_CATEGORIES[category] || [])].sort(),
        meaning: details.meaning,
        handling: details.handling,
      },
    ]),
  );
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
      {
        tool: 'organize_font_directory',
        defaultWritesFiles: false,
        defaultMode: 'safe-preview-plan-only',
        reviewedWriteMode: 'copy-only-outputDir',
        safePreviewArgs: { workflowPreset: 'safe-preview' },
        reviewedWriteArgs: { workflowPreset: 'reviewed-write' },
        sourceDestructive: false,
        sourceFilesMovedDeletedOrRewritten: false,
        sourceBackupRequired: false,
        writeScope: 'outputDir-only-when-reviewed-write-or-dryRun-false',
        outputRole: 'organized-font-source-staging',
        outputAuditRequiredAfterWrite: false,
        mustInspectFields: ['sourceSafetyDecision', 'safetySummary', 'operationMode', 'stagingDirectoryDecision', 'sourceLayoutMismatchSummary', 'organizationWarnings', 'planActionSummary'],
        nonIntuitiveBehavior: 'dryRun:false copies selected fonts into outputDir; outputDir is source-like staging, not final split output.',
      },
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
