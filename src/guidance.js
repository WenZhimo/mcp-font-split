import {
  GUIDANCE_COMPACT_SECTION_NAMES,
  GUIDANCE_DETAIL_LEVELS,
  GUIDANCE_SECTION_FIELDS,
  GUIDANCE_SECTION_NAMES,
  UNSUPPORTED_FILE_CATEGORY_DETAILS,
  UNSUPPORTED_FILE_EXTENSION_CATEGORIES,
  WORKFLOW_PRESETS,
  WORKFLOW_PRESET_NAMES,
} from './catalogs.js';
import { buildDirectoryOrganizationSafety } from './directory-organization-safety.js';

function uniqueAllowedValues(values, allowed) {
  const allowedSet = new Set(allowed);
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!allowedSet.has(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function buildGuidanceView(args) {
  const detailLevel = GUIDANCE_DETAIL_LEVELS.includes(args.detailLevel) ? args.detailLevel : 'compact';
  const rawSections = Array.isArray(args.sections) ? args.sections : null;
  const requestedSections = rawSections ? uniqueAllowedValues(rawSections, GUIDANCE_SECTION_NAMES) : null;
  const ignoredSections = rawSections ? rawSections.filter((section) => !GUIDANCE_SECTION_NAMES.includes(section)) : [];
  const defaultSections = detailLevel === 'compact' ? GUIDANCE_COMPACT_SECTION_NAMES : GUIDANCE_SECTION_NAMES;
  const sectionsIncluded = requestedSections?.length ? requestedSections : defaultSections;
  return {
    detailLevel,
    availableDetailLevels: GUIDANCE_DETAIL_LEVELS,
    availableSections: GUIDANCE_SECTION_NAMES,
    compactDefaultSections: GUIDANCE_COMPACT_SECTION_NAMES,
    sectionsRequested: rawSections,
    sectionsIncluded,
    omittedSections: GUIDANCE_SECTION_NAMES.filter((section) => !sectionsIncluded.includes(section)),
    ignoredSections,
  };
}

export function selectGuidanceSections(guidance, sectionsIncluded) {
  const selected = {
    ok: guidance.ok,
    purpose: guidance.purpose,
    workflow: guidance.workflow,
    agentOptimized: guidance.agentOptimized,
    guidanceView: guidance.guidanceView,
  };
  for (const section of sectionsIncluded) {
    for (const fieldName of GUIDANCE_SECTION_FIELDS[section] || []) {
      selected[fieldName] = guidance[fieldName];
    }
  }
  return selected;
}

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

export function buildOutputResultShapeQuickReference() {
  return {
    summaryType: 'output-result-shape-quick-reference',
    purpose: 'Fast answer for what a successful split response actually produced, so agents do not treat ok:true as proof of normal web-font subset output.',
    inspectFields: ['ok', 'resultType', 'outputMode', 'performedSplit', 'usedFallback', 'skipped', 'skipReason', 'warnings', 'batchDecision', 'skipMode', 'skippedExisting', 'skippedByManifest', 'planned', 'planned[].wouldProcess', 'planned[].skipReason', 'errorCount', 'errors', 'manifestPath'],
    resultShapes: [
      {
        id: 'subset-output',
        when: {
          outputMode: 'subset',
          performedSplit: true,
        },
        meaning: 'Normal multi-subset web-font output was produced.',
        agentAction: 'After a real write, audit the output directory with inspect_split_output before reporting completion.',
        successEvidence: ['manifestPath', 'inspect_split_output.outputStructureDecision.status', 'inspect_split_output.structureSummary.conforms'],
      },
      {
        id: 'single-woff2-fallback',
        when: {
          outputMode: 'single-woff2',
          usedFallback: true,
        },
        meaning: 'Normal multi-subset output did not happen; the result fell back to one WOFF2 output.',
        agentAction: 'Disclose the fallback, inspect warnings and resultType, and do not describe this as normal multi-subset splitting.',
        successEvidence: ['resultType', 'warnings', 'manifestPath'],
      },
      {
        id: 'copy-original-record',
        when: {
          outputMode: 'copy-original',
          skipped: true,
          usedFallback: false,
        },
        meaning: 'No web-font split output was generated; the original font was copied/recorded with metadata because the splitter was intentionally bypassed.',
        agentAction: 'Do not report this as web-font output. Explain copy-original behavior and inspect resultType, skipped, skipReason, and manifestPath.',
        successEvidence: ['resultType', 'skipped', 'skipReason', 'manifestPath'],
      },
      {
        id: 'single-font-split-skipped',
        when: {
          skipped: true,
          skipReason: '<present>',
        },
        meaning: 'The single-font processing path intentionally bypassed normal multi-subset splitting, usually for small-glyph fallback or copy-original behavior.',
        agentAction: 'Interpret skipped together with outputMode and usedFallback; do not assume it means batch existing-output skip.',
        successEvidence: ['outputMode', 'usedFallback', 'skipReason', 'manifestPath'],
      },
      {
        id: 'batch-existing-output-skips',
        when: {
          skippedExisting: '>0',
        },
        meaning: 'One or more selected batch fonts were not reprocessed because existing output matched the selected skipMode.',
        agentAction: 'Inspect skipMode, skippedExisting, skippedByManifest, batchDecision, and audit existing output before relying on it.',
        successEvidence: ['skipMode', 'skippedExisting', 'skippedByManifest', 'batchDecision', 'inspect_split_output.outputStructureDecision.status'],
      },
      {
        id: 'dry-run-existing-output-skip-plan',
        when: {
          dryRun: true,
          'planned[].wouldProcess': false,
          'planned[].skipReason': '<present>',
        },
        meaning: 'A batch dry-run planned to skip a selected font, usually because matching existing output was detected.',
        agentAction: 'Review planned[] before writing; if reprocessing is intended, rerun with skipMode force.',
        successEvidence: ['planned[].wouldProcess', 'planned[].skipReason', 'skipMode'],
      },
      {
        id: 'batch-partial-errors',
        when: {
          ok: true,
          errorCount: '>0',
        },
        meaning: 'The batch completed according to its error policy, but one or more fonts failed.',
        agentAction: 'Inspect batchErrorMode, errorCount, and errors[]; do not report full batch success until failures are resolved or explicitly accepted.',
        successEvidence: ['batchDecision', 'errorCount', 'errors'],
      },
    ],
    nonIntuitiveBehavior: [
      'ok:true is not proof of normal subset output.',
      'single-woff2 is a fallback path; copy-original is a metadata/copy record path. Neither is normal multi-subset web-font splitting.',
      'In split_font results, skipped means normal multi-subset splitting was intentionally bypassed; in split_font_batch, existing-output skips are summarized by skippedExisting and skippedByManifest.',
      'A batch existing-output skip can be acceptable only when the existing output still passes the relevant manifest or output audit checks.',
      'A batch can return ok:true with collected errors when batchErrorMode is collect; agents must inspect errorCount and errors[].',
    ],
  };
}
