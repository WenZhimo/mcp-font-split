import fs from 'node:fs/promises';
import path from 'node:path';
import { fontSplit } from 'cn-font-split/dist/wasm/index.mjs';
import {
  BATCH_DEDUPE_MODES,
  BATCH_ERROR_MODES,
  BATCH_GROUP_BY_MODES,
  BATCH_NAMING_MODES,
  DIRECTORY_HANDLING_MODE_BY_ORGANIZATION_ROUTE,
  DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
  DIRECTORY_HANDLING_SHORT_ANSWER_BY_MODE,
  ERROR_RESPONSE_CATALOG,
  FONT_IDENTITY_BASIS_CATALOG,
  FONT_EXTENSIONS,
  GUIDANCE_COMPACT_SECTION_NAMES,
  GUIDANCE_DETAIL_LEVELS,
  GUIDANCE_SECTION_FIELDS,
  GUIDANCE_SECTION_NAMES,
  GUIDANCE_WORKFLOWS,
  OVERSIZED_KERN_ACTIONS,
  OUTPUT_STRUCTURE_CATALOG,
  TOOL_OPTION_CATALOG,
  TOOL_RESPONSE_FIELD_CATALOG,
  SKIP_MODES,
  SMALL_GLYPH_ACTIONS,
  SPLIT_FAILURE_ACTIONS,
  UNSUPPORTED_FILE_CATEGORY_DETAILS,
  UNSUPPORTED_FILE_EXTENSION_CATEGORIES,
  WARNING_CODE_CATALOG,
  WORKFLOW_PRESET_NAMES,
  WORKFLOW_PRESETS,
  buildDirectoryHandlingModeCatalog,
} from './catalogs.js';
import {
  DEFAULT_WORKSPACE_ROOT,
  PROJECT_ROOT,
  fileExists,
  isInside,
  resolveWorkspacePath,
  toRelativeWorkspacePath,
  workspaceRoot,
} from './path-utils.js';
import {
  RAW_BATCH_OPTION_DEFAULTS,
  RAW_ORGANIZATION_OPTION_DEFAULTS,
  applyWorkflowPreset,
  buildConfigurationTrace,
  buildEffectiveConfigSnapshot,
  normalizeBatchOptions,
  normalizeBooleanOption,
  normalizeOptionalPositiveNumberOption,
  normalizeOptionalString,
  normalizeOrganizationOptions,
  normalizePositiveNumberOption,
  normalizeProcessingOptions,
} from './config.js';
import {
  buildBatchDedupeIdentity,
  buildFontIdentityKey,
  compressWoff2,
  decompressWoff1,
  decompressWoff2,
  detectFontContainer,
  extractFontFamily,
  extractFontIdentity,
  getGlyphCount,
  parseIdentityKey,
} from './font-identity.js';
import {
  scanFilesRecursive,
  summarizeFiles,
} from './file-scan.js';
import {
  buildProjectStatusNotice,
  buildToolSafetyQuickReference,
} from './guidance.js';
import {
  BATCH_POLICY_GUIDE,
  appendCollisionSuffix,
  buildBatchCustomizationQuickReference,
  buildBatchPolicySummary,
  buildBatchSafetySummary,
  buildBatchWarnings,
  buildBatchOutputNames,
  buildSourceSuffix,
  buildBatchError,
  compareBatchDedupeRepresentative,
  buildDedupeDecisionSummary,
  logBatchDecision,
  resolveBatchFamilyDirName,
  resolveStableBatchOutputNames,
  sanitizeDirName,
  shouldSkipExistingOutput,
} from './batch.js';
import {
  buildSplitManifest,
  manifestPathForSplitDir,
  writeSplitManifest,
} from './split-manifest.js';
import { ORGANIZATION_MANIFEST_FILE_NAME } from './output-audit.js';
import {
  PACKAGE_VERSION,
  getWasmRuntime,
  resetWasmRuntime,
} from './runtime-status.js';

export {
  BATCH_DEDUPE_MODES,
  BATCH_ERROR_MODES,
  BATCH_GROUP_BY_MODES,
  BATCH_NAMING_MODES,
  GUIDANCE_DETAIL_LEVELS,
  GUIDANCE_SECTION_NAMES,
  GUIDANCE_WORKFLOWS,
  OVERSIZED_KERN_ACTIONS,
  SKIP_MODES,
  SMALL_GLYPH_ACTIONS,
  SPLIT_FAILURE_ACTIONS,
  WORKFLOW_PRESET_NAMES,
};

export {
  DEFAULT_WORKSPACE_ROOT,
  PROJECT_ROOT,
  resolveWorkspacePath,
  toRelativeWorkspacePath,
};

export { inspectSplitOutput } from './output-audit.js';
export { getRuntimeStatus } from './runtime-status.js';

const ORGANIZATION_MANIFEST_VERSION = 1;

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

function withDirectoryRouteInspectFields(fields) {
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

function attachSourceLayoutDecisionChecklistFields(value, seen = new Set()) {
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

const SAFE_INVOCATION_TEMPLATES = [
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

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function buildDirectoryOrganizationQuickAnswer() {
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

function buildRecommendedWorkflowPlan(workflow) {
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

function buildNextToolDecisionSummary(workflow) {
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

function buildGuidanceView(args) {
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

function selectGuidanceSections(guidance, sectionsIncluded) {
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

export function getAgentGuidance(args = {}) {
  const workflow = GUIDANCE_WORKFLOWS.includes(args.workflow) ? args.workflow : 'overview';
  const guidanceView = buildGuidanceView(args);
  const configuredRoot = process.env.FONT_SPLIT_ROOT || null;
  const root = workspaceRoot();
  const commonPathRules = [
    'Resolve every relative path inside FONT_SPLIT_ROOT.',
    'If FONT_SPLIT_ROOT is not configured and the user has not named a workspace, ask before processing private local fonts.',
    'Use inspect_font_inputs before large or unfamiliar font libraries.',
    'Use organize_font_directory with dryRun true when the source directory layout does not match the desired batch grouping; it is source-non-destructive and defaults to plan-only.',
    'Use dryRun with includeResults true to preview batch naming, dedupe, and skip decisions without writing output.',
    'Batch defaults already use skipMode manifest and batchErrorMode fail-after; pass force only when reprocessing is intentional, and pass collect only when the caller checks errors[] and errorCount.',
  ];
  const verificationChecklist = [
    {
      id: 'runtime-ready',
      appliesTo: GUIDANCE_WORKFLOWS,
      check: 'Before splitting, get_runtime_status.ok is true, or every recommendedActions[] item has been handled.',
      responseFields: ['ok', 'recommendedActions', 'node', 'workspace', 'wasm', 'cnFontSplit'],
    },
    {
      id: 'input-scan-complete',
      appliesTo: ['overview', 'batch', 'inspect', 'organize'],
      check: 'Before trusting a source scan, inspect inputCountGuide, maxFilesHit, and inspectionWarnings; rerun with a higher maxFiles when truncated.',
      responseFields: ['inputCountGuide', 'maxFilesHit', 'inspectionWarnings', 'supportedFontCount', 'unsupportedFileDecision', 'unsupportedFileSummary', 'invalidFontCount', 'missingIdentityCount'],
    },
    {
      id: 'layout-plan-reviewed',
      appliesTo: ['overview', 'batch', 'organize'],
      check: 'When source layout may not match the intended output grouping, call organize_font_directory with dryRun true and inspect inputCountGuide, layoutDecision, layoutDecision.directoryHandling, stagingDirectoryDecision, sourceSafetyDecision, safetySummary, layout, recommendedBatchOptions, recommendedBatchPreviewArgs, organizationDecision, directoryWorkflowSummary, sourceLayoutMismatchSummary, unsupported file summaries, source write flags, organizationWarnings, and planActionSummary before applying any copy plan.',
      responseFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'layout', 'recommendedBatchOptions', 'recommendedNextActions', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'plan']),
    },
    {
      id: 'batch-plan-reviewed',
      appliesTo: ['overview', 'batch'],
      check: 'For unfamiliar batch runs, review a dryRun plan, sourceSafetyDecision, and safetySummary before writing output.',
      responseFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'dryRun', 'planIncluded', 'plannedCount', 'wouldProcessCount', 'dedupeDecisionSummary', 'skippedDuplicates'],
    },
    {
      id: 'process-outcome-checked',
      appliesTo: ['single', 'batch'],
      check: 'After processing, inspect resultType, outputMode, performedSplit, usedFallback, warnings, batchDecision, batchWarnings, errorCount, and errors before claiming success.',
      responseFields: ['resultType', 'outputMode', 'performedSplit', 'usedFallback', 'warnings', 'batchPolicySummary', 'batchDecision', 'batchWarnings', 'errorCount', 'errors'],
    },
    {
      id: 'fallback-disclosed',
      appliesTo: ['single', 'batch'],
      check: 'If usedFallback is true or outputMode is single-woff2/copy-original, say that the result was not a normal multi-subset split.',
      responseFields: ['usedFallback', 'outputMode', 'resultType'],
    },
    {
      id: 'output-audited',
      appliesTo: ['overview', 'batch', 'inspect'],
      check: 'After batch processing, inspect the output directory and require outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, structureSummary.conforms true, maxFilesHit false, and no action-required inspectionWarnings before treating the audit as complete.',
      responseFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'maxFilesHit', 'inspectionWarnings', 'structureSummary', 'manifestCount', 'missingManifestCount', 'subsetOutputCount', 'singleWoff2OutputCount', 'copyOriginalOutputCount'],
    },
    {
      id: 'local-compact-check-passed',
      appliesTo: GUIDANCE_WORKFLOWS,
      check: 'When maintaining this package, run npm run check:compact for the standard syntax and smoke gate with low-noise output before committing. It suppresses noisy child output on success and reports failed-step tails on failure.',
      command: 'npm run check:compact',
      jsonCommand: 'npm run --silent check:compact -- --json',
      responseFields: ['compact-check-result.ok', 'compact-check-result.failedStepId', 'compact-check-result.steps'],
    },
    {
      id: 'local-real-corpus-suite-passed',
      appliesTo: ['overview', 'batch', 'organize'],
      check: 'When maintaining this package or changing functionality-affecting behavior, run npm run smoke:real-corpus-suite -- <font-corpus-dir> against a local real corpus before calling the change complete. This is a representative reliability gate, not a per-directory acceptance audit.',
      command: 'npm run smoke:real-corpus-suite -- <font-corpus-dir>',
      verboseCommand: 'npm run smoke:real-corpus-suite -- <font-corpus-dir> --verbose',
      responseFields: [],
    },
  ];
  const localVerificationOutputGuide = {
    summaryType: 'local-verification-output-guide',
    purpose: 'How an AI agent should interpret local maintenance smoke output before claiming this package change is complete.',
    standardCommand: 'npm run check:compact',
    standardJsonCommand: 'npm run --silent check:compact -- --json',
    primaryCommand: 'npm run smoke:real-corpus-suite -- <font-corpus-dir>',
    verboseCommand: 'npm run smoke:real-corpus-suite -- <font-corpus-dir> --verbose',
    primaryDecisionField: 'reliabilityGateDecision',
    requiredOutputFields: [
      'reliabilityGateDecision',
      'corpusCountGuide',
      'humanSummary',
      'testScope',
      'coverageSummary.functionalCoverage',
      'coverageSummary.toolCoverageSummary',
      'coverageSummary.unsupportedFileCategoryCoverage',
      'coverageSummary.archiveHandlingScope',
      'coverageSummary.outputStructureAuditSummary',
      'runSummaries',
      'omittedDetailFields',
    ],
    passCriteria: [
      'reliabilityGateDecision.status is pass',
      'reliabilityGateDecision.reliabilityGatePassed is true',
      'reliabilityGateDecision.blockingReasonCodes is empty',
      'reliabilityGateDecision.targetCountsAreFullCorpusCounts is false',
      'testScope.corpusScan.maxFilesHit is false',
      'coverageSummary.functionalCoverage includes input-count-guide as covered',
      'coverageSummary.functionalCoverage entries are all covered',
      'coverageSummary.toolCoverageSummary.allRequiredToolsCovered is true',
      'coverageSummary.outputStructureAuditSummary single and batch outputRoleDecision.auditAppliesToThisDirectory are not false',
      'coverageSummary.outputStructureAuditSummary single and batch outputStructureDecision.status are pass',
      'coverageSummary.archiveHandlingScope.archiveInternalFontsCovered is false',
    ],
    statusMeanings: [
      {
        status: 'pass',
        meaning: 'The representative real-corpus feature chain passed.',
        agentAction: 'Report it as representative integration/regression evidence, not as manual acceptance of every font directory.',
      },
      {
        status: 'incomplete',
        meaning: 'The corpus scan was truncated or otherwise incomplete.',
        agentAction: 'Rerun with a higher maxFiles or inspect blockingReasonCodes before claiming completion.',
      },
      {
        status: 'action-required',
        meaning: 'At least one required coverage, audit, fixed target, or scope check failed.',
        agentAction: 'Inspect blockingReasonCodes, uncoveredFunctionalCoverageIds, compact coverageSummary, and runSummaries first; rerun with --verbose when child run details or full evidence are needed.',
      },
    ],
    nonIntuitiveBehavior: [
      'This is a representative reliability gate, not a per-directory acceptance audit.',
      'This is not a per-font manual audit.',
      'Small numbers such as fixedRegressionTargetCount 4 or selectedTargetCount 10 are target sampling counts, not the full corpus font count.',
      'Use reliabilityGateDecision.fullCorpusFontCountField or testScope.corpusScan.supportedFontCount for the full bounded corpus font total.',
      'Use corpusCountGuide for the shortest explanation of which counts are full-corpus counts and which are representative target counts.',
      'Use coverageSummary.functionalCoverage input-count-guide to confirm inputCountGuide was checked across inspect, organize, and batch paths.',
      'Use coverageSummary.toolCoverageSummary to confirm public MCP tool surfaces were exercised in representative real-corpus paths.',
      'Default suite output is compact and omits child run details; use verboseCommand for full per-child summaries and evidence.',
      'Archive files are counted as ignored files; the suite does not prove archive extraction because archive extraction is outside this tool layer.',
      'If archive-internal fonts must be tested, extract archives outside this tool first and rerun the suite against the extracted directory tree.',
    ],
    evidenceFields: {
      countGuide: 'corpusCountGuide',
      fullCorpusFontCount: 'testScope.corpusScan.supportedFontCount',
      fixedRegressionTargets: 'testScope.targetSampling.fixedRegressionTargets',
      selectedTargets: 'testScope.targetSampling.selectedTargets',
      representativeWriteAudit: 'testScope.representativeWriteAudit',
      ignoredFileCoverage: 'coverageSummary.unsupportedFileCategoryCoverage',
      archiveHandlingScope: 'coverageSummary.archiveHandlingScope',
      inputCountGuideCoverage: 'coverageSummary.functionalCoverage[id=input-count-guide]',
      toolCoverage: 'coverageSummary.toolCoverageSummary',
      outputStructureAudit: 'coverageSummary.outputStructureAuditSummary',
    },
    completionReportGuide: {
      summaryType: 'local-verification-completion-report-guide',
      purpose: 'What an AI agent should report after local compact and real-corpus gates pass, without overstating the verification scope.',
      requiredClaims: [
        {
          id: 'compact-check',
          evidenceField: 'compact-check-result.ok',
          reportAs: 'The standard syntax and smoke gate passed.',
        },
        {
          id: 'real-corpus-gate',
          evidenceField: 'reliabilityGateDecision.status',
          reportAs: 'The representative real-corpus reliability gate passed.',
        },
        {
          id: 'full-corpus-count',
          evidenceField: 'corpusCountGuide.fullCorpus.supportedFontCount',
          reportAs: 'The bounded full-root scan supported font count.',
        },
        {
          id: 'ignored-file-coverage',
          evidenceField: 'coverageSummary.unsupportedFileCategoryCoverage',
          reportAs: 'Ignored-file category and extension coverage, including extensions beyond .zip/.txt.',
        },
        {
          id: 'archive-handling-scope',
          evidenceField: 'coverageSummary.archiveHandlingScope',
          reportAs: 'Archive files were counted as ignored files only; archive contents were not scanned as covered fonts.',
        },
        {
          id: 'functional-coverage',
          evidenceField: 'coverageSummary.functionalCoverage',
          reportAs: 'Representative feature paths covered by the suite.',
        },
        {
          id: 'tool-coverage',
          evidenceField: 'coverageSummary.toolCoverageSummary',
          reportAs: 'Public MCP tool surfaces covered by representative real-corpus paths.',
        },
        {
          id: 'representative-output-audit',
          evidenceField: 'coverageSummary.outputStructureAuditSummary',
          reportAs: 'Representative single-font and batch output structure audits passed.',
        },
      ],
      forbiddenClaims: [
        'Do not claim every font was manually inspected.',
        'Do not claim every directory was accepted or individually audited.',
        'Do not treat selectedTargetCount or fixedRegressionTargetCount as the full corpus font count.',
        'Do not imply archives were extracted or validated; archives are only counted as ignored files.',
        'Do not report ok:true alone as proof; cite reliabilityGateDecision.status and outputStructureAuditSummary.',
      ],
      conciseReportTemplate: [
        'check:compact: ok=<compact-check-result.ok>, failedStepId=<compact-check-result.failedStepId>',
        'real-corpus suite: status=<reliabilityGateDecision.status>, fullCorpusFonts=<corpusCountGuide.fullCorpus.supportedFontCount>, ignoredFiles=<corpusCountGuide.fullCorpus.unsupportedFileCount>',
        'real-corpus sampling: fixedTargets=<corpusCountGuide.representativeTargets.fixedRegressionTargetCount>, selectedTargets=<corpusCountGuide.representativeTargets.selectedTargetCount>/<corpusCountGuide.representativeTargets.availableTargetCount>, perDirectoryAcceptanceAudit=false',
        'real-corpus archives: archiveCount=<coverageSummary.archiveHandlingScope.archiveCount>, archiveInternalFontsCovered=<coverageSummary.archiveHandlingScope.archiveInternalFontsCovered>',
        'real-corpus tools: covered=<coverageSummary.toolCoverageSummary.coveredRequiredToolCount>/<coverageSummary.toolCoverageSummary.requiredToolCount>, allRequiredToolsCovered=<coverageSummary.toolCoverageSummary.allRequiredToolsCovered>',
        'real-corpus coverage: functionalCoverage=<covered>/<total>, outputAudit singleRole=<coverageSummary.outputStructureAuditSummary.singleOutputRoleAuditApplies>, single=<coverageSummary.outputStructureAuditSummary.singleOutputStructureDecisionStatus>, batchRole=<coverageSummary.outputStructureAuditSummary.batchOutputRoleAuditApplies>, batch=<coverageSummary.outputStructureAuditSummary.batchOutputStructureDecisionStatus>',
      ],
    },
  };

  const workflows = {
    overview: [
      'Call get_agent_guidance to orient yourself.',
      'Use workflowPreset safe-preview for first no-write batch or organization calls, then reviewed-write only after reviewing the preview.',
      'Call get_runtime_status when diagnosing setup, workspace, cn-font-split package, or WASM runtime availability.',
      'Call inspect_font_inputs for a no-write source preflight.',
      'Call organize_font_directory with dryRun true if directory layout is flat/mixed/unfamiliar or if the user asks to stage fonts into a cleaner structure.',
      'Call split_font_batch with dryRun true to preview output layout.',
      'Call split_font_batch with includeResults false for full-library processing.',
      'Call inspect_split_output after processing; require outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, structureSummary.conforms true, and maxFilesHit false; use includeFiles false / includeFamilies false for compact summaries.',
    ],
    single: [
      'Call split_font with one fontPath.',
      'Inspect resultType, outputMode, performedSplit, usedFallback, warnings, and manifestPath.',
      'Use splitFailureAction single-woff2 only when fallback output is acceptable.',
    ],
    batch: [
      'Call inspect_font_inputs with includeFiles false for a compact source summary.',
      'Call organize_font_directory with dryRun true when source directory structure and desired family grouping do not match.',
      'Call split_font_batch with workflowPreset safe-preview to review planned paths without writing.',
      'Use batchNamingMode numeric-suffix and batchDedupeMode font-identity unless the user asks for another policy.',
      'Use includeResults false for large real runs.',
      'Call inspect_split_output on the outputRoot when done; require outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, structureSummary.conforms true, and maxFilesHit false; use includeFiles false / includeFamilies false for large outputs.',
    ],
    inspect: [
      'Call get_runtime_status to verify workspace, cn-font-split package, and WASM runtime availability when setup is uncertain.',
      'Call inspect_font_inputs to audit source directories before processing.',
      'Call inspect_split_output to audit generated output directories; require outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, structureSummary.conforms true, and maxFilesHit false; set includeFiles false / includeFamilies false when only summary counts are needed.',
      'If maxFilesHit is true, rerun with a higher maxFiles before treating the summary as complete.',
    ],
    organize: [
      'Call organize_font_directory with workflowPreset safe-preview first; review layout, recommendedBatchPreviewArgs, organizationWarnings, and plan before writing copies.',
      'If the plan is acceptable, call organize_font_directory again with workflowPreset reviewed-write to copy selected fonts into outputDir. This never moves or deletes source files.',
      'Use parseFonts false only when the user needs a fast structure-first plan; inspect parsedFontMetadata and dedupeLimitedByParsing before relying on identity dedupe or font-family grouping.',
      'After organizing, run inspect_font_inputs on outputDir or split_font_batch with inputDir set to outputDir.',
      'If organizationWarnings contains output-overwrite-enabled or output-inside-input, disclose the risk before proceeding.',
    ],
  };
  const directoryWorkflowDecisionMatrix = [
    {
      id: 'known-single-font',
      useWhen: 'The user named one known font file and does not need directory scanning.',
      firstTool: 'split_font',
      writesFilesByDefault: true,
      sourceDestructive: false,
      recommendedOptions: {
        fontPath: '<path-to-font>',
      },
      mustInspectFields: ['resultType', 'outputMode', 'performedSplit', 'usedFallback', 'warnings', 'manifestPath'],
      successCriteria: 'Treat the single-font operation as complete only after manifestPath exists and any fallback, copy-original, or non-subset resultType/outputMode is disclosed.',
      nonIntuitiveBehavior: 'ok:true may still mean single-woff2 fallback or copy-original instead of normal multi-subset output.',
    },
    {
      id: 'known-good-batch-layout',
      useWhen: 'The source directory layout already matches the intended family grouping.',
      firstTool: 'split_font_batch',
      writesFilesByDefault: false,
      sourceDestructive: false,
      recommendedOptions: {
        workflowPreset: 'safe-preview',
      },
      followUpTool: 'split_font_batch',
      followUpOptions: {
        workflowPreset: 'reviewed-write',
      },
      mustInspectFields: ['sourceSafetyDecision', 'safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'dryRun', 'inputCountGuide', 'batchDecision', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileDecision', 'unsupportedFileSummary', 'dedupeDecisionSummary', 'skippedDuplicates', 'errorCount', 'errors'],
      successCriteria: 'Start with safe-preview dryRun true and sourceDestructive false; proceed to reviewed-write only after planned paths, warnings, maxFilesHit, and errors are acceptable, then audit output.',
      nonIntuitiveBehavior: 'split_font_batch dryRun defaults to false, so agents should set dryRun:true explicitly for planning.',
    },
    {
      id: 'unknown-or-mixed-directory-layout',
      useWhen: 'The source directory is flat, mixed, unfamiliar, or may not match the desired output grouping.',
      firstTool: 'organize_font_directory',
      writesFilesByDefault: false,
      sourceDestructive: false,
      recommendedOptions: {
        workflowPreset: 'safe-preview',
      },
      followUpTool: 'split_font_batch',
      followUpOptions: {
        inputDir: '<original-inputDir-or-organized-outputDir>',
        workflowPreset: 'safe-preview',
      },
      mustInspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'layout', 'recommendedBatchOptions', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'plan']),
      successCriteria: 'The organization pass must remain no-write and sourceDestructive false; choose original input or organized output only after reviewing layout, warnings, plan summary, and recommendedBatchPreviewArgs.',
      nonIntuitiveBehavior: 'organize_font_directory defaults to dryRun:true and never moves or deletes source files; dryRun:false copies into outputDir only.',
    },
    {
      id: 'large-or-noisy-directory-first-pass',
      useWhen: 'The library is very large or metadata parsing is expected to be slow/noisy, and the agent only needs a structure-first recommendation.',
      firstTool: 'organize_font_directory',
      writesFilesByDefault: false,
      sourceDestructive: false,
      recommendedOptions: {
        workflowPreset: 'structure-first',
      },
      mustInspectFields: withDirectoryRouteInspectFields(['parsedFontMetadata', 'unparsedFontCount', 'effectiveBatchDedupeMode', 'dedupeLimitedByParsing', 'layout', 'recommendedBatchOptions']),
      successCriteria: 'Use the result only for structure-level routing; rerun with parseFonts true before relying on invalid-font counts, glyph counts, identity dedupe, or metadata grouping.',
      nonIntuitiveBehavior: 'parseFonts:false means validFontCount and invalidFontCount are null, not zero; identity dedupe and metadata family grouping are limited.',
    },
    {
      id: 'user-wants-clean-staging-directory',
      useWhen: 'The user explicitly wants an organized copy of the source fonts before splitting.',
      firstTool: 'organize_font_directory',
      writesFilesByDefault: false,
      sourceDestructive: false,
      recommendedOptions: {
        workflowPreset: 'safe-preview',
      },
      followUpTool: 'organize_font_directory',
      followUpOptions: {
        workflowPreset: 'reviewed-write',
      },
      mustInspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'operationMode', 'copiedCount', 'organizationManifestPath', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree']),
      successCriteria: 'Review the dry-run plan before copying; real organization must remain copy-only and sourceDestructive false, with copiedCount/manifest and warnings matching the reviewed plan.',
      nonIntuitiveBehavior: 'A real organize run is copy-only. overwriteExisting:true can replace files in outputDir but still does not modify source files.',
    },
  ];
  const directoryHandlingModeCatalog = buildDirectoryHandlingModeCatalog();
  const directoryWorkflowExamples = [
    {
      id: 'flat-vendor-dump',
      sourceShape: [
        'fonts/',
        '  BrandSans-Regular.ttf',
        '  BrandSans-Bold.otf',
        '  readme.txt',
      ],
      likelyLayoutKind: 'flat',
      concern: 'Root-level font files have no directory grouping, so family grouping depends on font metadata.',
      firstTool: 'organize_font_directory',
      firstCall: {
        inputDir: 'fonts',
        workflowPreset: 'safe-preview',
      },
      ifPlanLooksGood: [
        'If the user only wants split output, call split_font_batch on the original inputDir using recommendedBatchPreviewArgs.',
        'If the user wants a cleaner source staging directory, call organize_font_directory again with dryRun:false, then split_font_batch with inputDir set to outputDir.',
      ],
      safety: {
        sourceDestructive: false,
        defaultWritesFiles: false,
        realOrganizerMode: 'copy-only',
      },
      mustInspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'layout.layoutKind', 'recommendedBatchOptions', 'plan']),
      successCriteria: 'Use the example only if actual layout is flat or equivalent; continue after organization preview is no-write, source-safe, and recommendedBatchPreviewArgs/grouping have been reviewed.',
    },
    {
      id: 'archive-per-family-folders',
      sourceShape: [
        'fonts/',
        '  BrandSans/',
        '    Regular.ttf',
        '    Bold.ttf',
        '  OtherSerif/',
        '    Regular.otf',
      ],
      likelyLayoutKind: 'nested',
      concern: 'Each top-level source folder already looks like a family grouping.',
      firstTool: 'split_font_batch',
      firstCall: {
        inputDir: 'fonts',
        workflowPreset: 'safe-preview',
        batchGroupBy: 'source-dir',
      },
      ifPlanLooksGood: [
        'Run split_font_batch again with dryRun:false, usually includeResults:false for large libraries.',
        'Use organize_font_directory only if the user explicitly wants a copied staging directory.',
      ],
      safety: {
        sourceDestructive: false,
        defaultWritesFiles: false,
        realOrganizerMode: 'not-needed-unless-staging',
      },
      mustInspectFields: ['sourceSafetyDecision', 'safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'inputCountGuide', 'batchDecision', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileDecision', 'unsupportedFileSummary', 'dedupeDecisionSummary', 'skippedDuplicates', 'errors'],
      successCriteria: 'Use direct source-dir batch only after safe-preview confirms dryRun true, sourceDestructive false, maxFilesHit false, acceptable planned paths/warnings, and no blocking errors.',
    },
    {
      id: 'mixed-root-and-nested-fonts',
      sourceShape: [
        'fonts/',
        '  LooseDisplay.ttf',
        '  BrandSans/',
        '    Regular.ttf',
        '  OtherSerif/',
        '    Regular.otf',
      ],
      likelyLayoutKind: 'mixed',
      concern: 'Root-level and nested fonts are mixed, so direct batch grouping can surprise users.',
      firstTool: 'organize_font_directory',
      firstCall: {
        inputDir: 'fonts',
        workflowPreset: 'safe-preview',
      },
      ifPlanLooksGood: [
        'Prefer reviewing recommendedBatchPreviewArgs before splitting.',
        'Use copy-only organization when the user wants a stable staging source that separates loose and nested inputs.',
      ],
      safety: {
        sourceDestructive: false,
        defaultWritesFiles: false,
        realOrganizerMode: 'copy-only',
      },
      mustInspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'layout.layoutKind', 'recommendedBatchOptions', 'sourceDestructive', 'writesSourceTree', 'outputTreeInsideInputTree']),
      successCriteria: 'Use organization preview first; proceed only after mixed-layout warnings, planActionSummary, and recommendedBatchPreviewArgs are reviewed and sourceDestructive remains false.',
    },
    {
      id: 'source-layout-mismatch-comparison',
      sourceShape: [
        'Compare the actual organize_font_directory response for flat, nested, mixed, and output-inside-input cases.',
        'Do not infer from folder names alone; use layout, sourceLayoutMismatchSummary, recommendedBatchPreviewArgs, and warnings from the current response.',
      ],
      likelyLayoutKind: 'varies',
      concern: 'Agents often confuse "source layout matches recommended grouping" with "organization has already succeeded"; this comparison keeps it as routing guidance only.',
      firstTool: 'organize_font_directory',
      firstCall: {
        inputDir: 'fonts',
        workflowPreset: 'safe-preview',
      },
      comparisonCases: [
        {
          caseId: 'flat',
          expectedSignals: ['layout.layoutKind is flat', 'recommendedBatchPreviewArgs usually relies on font metadata grouping', 'sourceLayoutMismatchSummary should be reviewed before writing'],
          preferredAction: 'Preview split_font_batch with the returned recommendedBatchPreviewArgs; copy-only staging is optional unless the user wants a cleaned source tree.',
        },
        {
          caseId: 'nested',
          expectedSignals: ['layout.layoutKind is nested', 'recommendedBatchPreviewArgs often preserves source-dir grouping', 'sourceLayoutMatchesRecommendedGrouping may be true'],
          preferredAction: 'Direct original-input split_font_batch safe-preview is usually available, but still review planned paths, warnings, and dedupe before write.',
        },
        {
          caseId: 'mixed',
          expectedSignals: ['layout.layoutKind is mixed', 'organizationWarnings may include mixed-layout-detected', 'sourceLayoutMismatchSummary.mismatchDetected may be true'],
          preferredAction: 'Review the organization plan before choosing original input vs copy-only staged output; do not treat the route hint as success proof.',
        },
        {
          caseId: 'output-inside-input',
          expectedSignals: ['outputTreeInsideInputTree is true', 'organizationWarnings includes output-inside-input', 'future scans may reprocess organized copies if not excluded'],
          preferredAction: 'Keep the source-safe guarantee clear, then exclude the generated output directory from future scans or intentionally use that outputDir as the next input.',
        },
      ],
      ifPlanLooksGood: [
        'If sourceLayoutMismatchSummary says direct original-input preview is available, run split_font_batch with recommendedBatchPreviewArgs before any write.',
        'If the user wants a cleaned staging tree, rerun organize_font_directory with workflowPreset reviewed-write only after the safe-preview plan is reviewed.',
        'After any real split or organization write, audit the output tree or inspect the organized output before reporting success.',
      ],
      safety: {
        sourceDestructive: false,
        defaultWritesFiles: false,
        realOrganizerMode: 'copy-only',
      },
      mustInspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'layout.layoutKind', 'sourceDestructive', 'writesSourceTree', 'outputTreeInsideInputTree']),
      successCriteria: 'Use this comparison only to choose the next route; actual continuation requires safe-preview, sourceDestructive false, reviewed sourceLayoutMismatchSummary, reviewed warnings, and accepted recommendedBatchPreviewArgs.',
    },
    {
      id: 'copy-only-staging-to-audited-split',
      sourceShape: [
        'fonts/',
        '  loose root fonts, nested family folders, docs, archives, or other non-font files',
        'organized-fonts/',
        '  generated later by organize_font_directory reviewed-write as a source-like staging tree',
        'split-output/',
        '  generated later by split_font_batch reviewed-write and audited by inspect_split_output',
      ],
      likelyLayoutKind: 'flat-or-mixed-or-user-wants-clean-staging',
      concern: 'Agents need a complete route when the source layout is not the desired split grouping, without treating the staging directory as final split output.',
      firstTool: 'organize_font_directory',
      firstCall: {
        inputDir: '<font-source-dir>',
        outputDir: '<organized-output-dir>',
        workflowPreset: 'safe-preview',
      },
      workflowSteps: [
        {
          id: 'preview-organization-plan',
          tool: 'organize_font_directory',
          writesFiles: false,
          sourceDestructive: false,
          args: {
            inputDir: '<font-source-dir>',
            outputDir: '<organized-output-dir>',
            workflowPreset: 'safe-preview',
          },
          inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'layout.layoutKind', 'plan', 'outputTreeInsideInputTree']),
          successCriteria: 'Review the plan, sourceLayoutMismatchSummary, warnings, maxFilesHit, and grouping before any copy.',
        },
        {
          id: 'review-organization-plan',
          tool: 'manual-review',
          writesFiles: false,
          sourceDestructive: false,
          inspectFields: ['sourceSafetyDecision', 'organizationWarnings', 'planActionSummary', 'sourceLayoutMismatchSummary.decisionChecklist'],
          successCriteria: 'Proceed only when the copy plan is intentional and no warning requires a different outputDir or grouping policy.',
        },
        {
          id: 'write-copy-only-staging',
          tool: 'organize_font_directory',
          writesFiles: true,
          sourceDestructive: false,
          writeBehavior: 'copy-only-outputDir',
          args: {
            inputDir: '<font-source-dir>',
            outputDir: '<organized-output-dir>',
            workflowPreset: 'reviewed-write',
          },
          inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'operationMode', 'copiedCount', 'organizationManifestPath', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree']),
          successCriteria: 'The write must report operationMode copy-only, sourceDestructive false, writesSourceTree false, and resolved errors/warnings.',
        },
        {
          id: 'preview-staged-batch',
          tool: 'split_font_batch',
          writesFiles: false,
          sourceDestructive: false,
          argsSource: 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs',
          inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'dryRun', 'batchDecision', 'planned', 'batchWarnings', 'maxFilesHit', 'dedupeDecisionSummary', 'skippedDuplicates', 'errorCount', 'errors'],
          successCriteria: 'Use the organized outputDir as inputDir via safePreviewArgs; dryRun must be true and planned split output must be acceptable.',
        },
        {
          id: 'write-reviewed-batch',
          tool: 'split_font_batch',
          writesFiles: true,
          sourceDestructive: false,
          args: {
            inputDir: '<organized-output-dir>',
            outputRoot: '<split-output-root>',
            workflowPreset: 'reviewed-write',
          },
          inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchDecision', 'batchWarnings', 'dedupeDecisionSummary', 'errorCount', 'errors', 'recommendedNextActions'],
          successCriteria: 'Write only after the staged batch preview is reviewed; errorCount must be zero and an audit action must be available.',
        },
        {
          id: 'audit-split-output',
          tool: 'inspect_split_output',
          writesFiles: false,
          sourceDestructive: false,
          args: {
            outDir: '<split-output-root>',
            includeFiles: false,
            includeFamilies: false,
          },
          inspectFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'structureSummary', 'maxFilesHit', 'inspectionWarnings'],
          successCriteria: 'Treat the final split output as valid only when inspect_split_output reports outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, structureSummary.conforms true, and maxFilesHit false.',
        },
      ],
      ifPlanLooksGood: [
        'Run the reviewed-write organization only after the safe-preview plan is accepted; this creates a source-like staging tree, not split output.',
        'After copy-only staging, prefer sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs for the next split_font_batch safe-preview so maxFiles and the staged inputDir are preserved.',
        'After reviewed batch write, run inspect_split_output before reporting structural success.',
      ],
      safety: {
        sourceDestructive: false,
        defaultWritesFiles: false,
        realOrganizerMode: 'copy-only',
        stagingIsFinalSplitOutput: false,
        outputAuditRequiredAfterSplitWrite: true,
      },
      mustInspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'operationMode', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs', 'outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'structureSummary']),
      successCriteria: 'Complete route requires organization safe-preview review, copy-only organization with sourceDestructive false, staged split_font_batch safe-preview from sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs, reviewed batch write with errorCount zero, and final inspect_split_output audit pass.',
    },
    {
      id: 'large-noisy-first-pass',
      sourceShape: [
        'fonts/',
        '  many folders and files',
        '  archives, docs, screenshots, and font-like files',
      ],
      likelyLayoutKind: 'unknown',
      concern: 'Metadata parsing may be slow or noisy, and the first question is only how the directory is shaped.',
      firstTool: 'organize_font_directory',
      firstCall: {
        inputDir: 'fonts',
        workflowPreset: 'structure-first',
      },
      ifPlanLooksGood: [
        'Use this only as a structure-first scan.',
        'Rerun with parseFonts:true before relying on invalid-font counts, glyph counts, font-family grouping, or identity dedupe.',
      ],
      safety: {
        sourceDestructive: false,
        defaultWritesFiles: false,
        realOrganizerMode: 'copy-only-when-dryRun-false',
      },
      mustInspectFields: withDirectoryRouteInspectFields(['parsedFontMetadata', 'unparsedFontCount', 'effectiveBatchDedupeMode', 'dedupeLimitedByParsing']),
      successCriteria: 'Treat this as a no-write structure-first pass only; rerun with parseFonts true before metadata-sensitive grouping, invalid-font decisions, or identity dedupe.',
    },
  ];
  const configurationRecipes = [
    {
      id: 'safe-default-batch',
      userIntent: 'Split an unfamiliar font directory with the default agent-safe behavior.',
      firstTool: 'split_font_batch',
      previewArgs: {
        inputDir: '<font-source-dir>',
        outputRoot: 'split-output',
        workflowPreset: 'safe-preview',
      },
      writeArgsAfterReview: {
        inputDir: '<font-source-dir>',
        outputRoot: 'split-output',
        workflowPreset: 'reviewed-write',
      },
      writesFilesBeforeReview: false,
      sourceDestructive: false,
      tradeoffs: [
        'Uses font-identity dedupe, numeric-suffix naming, manifest skip checks, and fail-after error handling.',
        'Preview before writing; inspect batchDecision, batchWarnings, maxFilesHit, skippedDuplicates, errors, and safetySummary.',
      ],
      inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'batchDecision', 'batchWarnings', 'maxFilesHit', 'dedupeDecisionSummary', 'skippedDuplicates', 'errorCount', 'errors', 'recommendedNextActions'],
      successCriteria: 'Preview must be no-write and acceptable; reviewed write must have sourceDestructive false and errorCount zero; final inspect_split_output audit must reach outputRoleDecision.auditAppliesToThisDirectory not false and outputStructureDecision.status pass before reporting completion.',
      auditAfterWrite: {
        tool: 'inspect_split_output',
        requiredFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'structureSummary', 'maxFilesHit', 'inspectionWarnings'],
        passWhen: 'outputRoleDecision.auditAppliesToThisDirectory is not false, outputStructureDecision.status is pass, auditStatus is pass, auditPassed is true, structureSummary.conforms is true, and maxFilesHit is false.',
      },
    },
    {
      id: 'preserve-every-source-font',
      userIntent: 'Keep every supported source font file even when files look like duplicate formats of the same font.',
      firstTool: 'split_font_batch',
      previewArgs: {
        inputDir: '<font-source-dir>',
        outputRoot: 'split-output',
        workflowPreset: 'safe-preview',
        batchDedupeMode: 'none',
      },
      writeArgsAfterReview: {
        inputDir: '<font-source-dir>',
        outputRoot: 'split-output',
        workflowPreset: 'reviewed-write',
        batchDedupeMode: 'none',
      },
      writesFilesBeforeReview: false,
      sourceDestructive: false,
      tradeoffs: [
        'Disables pre-processing dedupe, so more output entries and more naming collisions are expected.',
        'Keep batchNamingMode numeric-suffix unless the user explicitly wants another collision policy.',
      ],
      inspectFields: ['batchPolicySummary', 'dedupeDecisionSummary', 'batchDecision', 'planned', 'plannedCount', 'skippedDuplicates', 'batchWarnings', 'outputTreeInsideInputTree'],
      successCriteria: 'Preview and reviewed write must intentionally use batchDedupeMode none, preserve every supported selected source font, and still reach outputRoleDecision.auditAppliesToThisDirectory not false plus outputStructureDecision.status pass after writing.',
    },
    {
      id: 'source-folder-families',
      userIntent: 'Use existing top-level source folders as family/group names.',
      firstTool: 'split_font_batch',
      previewArgs: {
        inputDir: '<font-source-dir>',
        outputRoot: 'split-output',
        workflowPreset: 'safe-preview',
        batchGroupBy: 'source-dir',
      },
      writeArgsAfterReview: {
        inputDir: '<font-source-dir>',
        outputRoot: 'split-output',
        workflowPreset: 'reviewed-write',
        batchGroupBy: 'source-dir',
      },
      writesFilesBeforeReview: false,
      sourceDestructive: false,
      tradeoffs: [
        'Best for archive-per-family or vendor folders where source paths already express grouping.',
        'If root-level and nested fonts are mixed, dry-run organize_font_directory first to avoid surprising grouping.',
      ],
      inspectFields: ['batchPolicySummary', 'batchDecision', 'layout', 'recommendedBatchPreviewArgs', 'planned', 'batchWarnings', 'unsupportedFileDecision', 'unsupportedFileSummary'],
      successCriteria: 'Preview must show the intended source-dir grouping with acceptable planned paths and warnings; reviewed write should only follow after that preview and must be audited afterward.',
    },
    {
      id: 'metadata-family-groups',
      userIntent: 'Group a flat source directory by internal font family metadata.',
      firstTool: 'organize_font_directory',
      previewArgs: {
        inputDir: '<font-source-dir>',
        workflowPreset: 'safe-preview',
        batchGroupBy: 'font-family',
      },
      followUpPreviewArgs: {
        inputDir: '<font-source-dir-or-organized-outputDir>',
        outputRoot: 'split-output',
        workflowPreset: 'safe-preview',
        batchGroupBy: 'font-family',
      },
      writesFilesBeforeReview: false,
      sourceDestructive: false,
      tradeoffs: [
        'Requires font metadata parsing; invalid or unparseable fonts may be skipped by organization unless copyInvalidFonts is explicitly enabled.',
        'Use organize_font_directory first when source layout is flat or mixed so recommendedBatchPreviewArgs can be reviewed.',
      ],
      inspectFields: withDirectoryRouteInspectFields(['batchPolicySummary', 'parsedFontMetadata', 'invalidFontCount', 'layout']),
      successCriteria: 'Organization preview must parse font metadata and produce reviewed grouping guidance; follow-up batch preview must remain dryRun true and use the intended font-family grouping before any write.',
    },
    {
      id: 'fast-structure-first-scan',
      userIntent: 'Quickly inspect a very large or noisy directory before paying for metadata parsing.',
      firstTool: 'organize_font_directory',
      previewArgs: {
        inputDir: '<font-source-dir>',
        workflowPreset: 'structure-first',
      },
      writesFilesBeforeReview: false,
      sourceDestructive: false,
      tradeoffs: [
        'parseFonts is false, so validFontCount and invalidFontCount are null rather than zero.',
        'Identity dedupe and font-family grouping are limited until rerun with parseFonts:true or safe-preview.',
      ],
      inspectFields: withDirectoryRouteInspectFields(['batchPolicySummary', 'parsedFontMetadata', 'unparsedFontCount', 'dedupeLimitedByParsing']),
      successCriteria: 'Use this only as a no-write structural scan; do not rely on invalid-font counts, glyph counts, metadata grouping, or identity dedupe until rerun with parseFonts true.',
    },
    {
      id: 'copy-clean-staging-directory',
      userIntent: 'Create a cleaner copied staging directory before splitting.',
      firstTool: 'organize_font_directory',
      previewArgs: {
        inputDir: '<font-source-dir>',
        outputDir: 'organized-fonts',
        workflowPreset: 'safe-preview',
      },
      writeArgsAfterReview: {
        inputDir: '<font-source-dir>',
        outputDir: 'organized-fonts',
        workflowPreset: 'reviewed-write',
      },
      writesFilesBeforeReview: false,
      writeBehavior: 'copy-only-outputDir',
      sourceDestructive: false,
      tradeoffs: [
        'Real organization writes copy selected fonts into outputDir only; it never moves, deletes, or rewrites source files.',
        'overwriteExisting only affects files in outputDir and should be enabled explicitly.',
      ],
      inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'operationMode', 'copiedCount', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree']),
      successCriteria: 'Dry-run plan must be reviewed first; real organization must remain sourceDestructive false and copy-only, and the staged output should be inspected or batch-previewed before splitting.',
    },
    {
      id: 'large-reviewed-write',
      userIntent: 'Run a full-library write after a preview has been reviewed.',
      firstTool: 'split_font_batch',
      writeArgsAfterReview: {
        inputDir: '<font-source-dir-or-organized-outputDir>',
        outputRoot: 'split-output',
        workflowPreset: 'reviewed-write',
        limit: 50000,
        maxFiles: 50000,
      },
      writesFilesBeforeReview: false,
      sourceDestructive: false,
      tradeoffs: [
        'includeResults is false through reviewed-write, keeping large responses compact.',
        'Always follow the audit-split-output next action and require outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, and auditStatus pass before reporting completion.',
      ],
      inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'batchDecision', 'batchWarnings', 'dedupeDecisionSummary', 'errorCount', 'errors', 'recommendedNextActions', 'resultsIncluded'],
      successCriteria: 'Run only after a reviewed preview; require maxFilesHit false, errorCount zero, audit-split-output next action, and an inspect_split_output audit with outputRoleDecision.auditAppliesToThisDirectory not false plus outputStructureDecision.status pass before reporting completion.',
    },
  ];

  const guidance = {
    ok: true,
    purpose: 'AI-agent guidance for using mcp-font-split safely and predictably.',
    workflow,
    agentOptimized: true,
    guidanceView,
    workspace: {
      root,
      fontSplitRootConfigured: configuredRoot !== null,
      configuredRoot,
      relativePathBase: 'FONT_SPLIT_ROOT',
    },
    tools: [
      { name: 'get_agent_guidance', useWhen: 'Orient an AI coding assistant before choosing a font-splitting workflow.' },
      { name: 'get_runtime_status', useWhen: 'Check workspace, Node engine compatibility, mcp-font-split package, cn-font-split package/runtime, and WASM availability without writing files.' },
      { name: 'inspect_font_inputs', useWhen: 'Preflight source fonts without writing output.' },
      { name: 'organize_font_directory', useWhen: 'Plan or copy-organize a mismatched font directory layout. Defaults to dryRun true and never moves or deletes source files.' },
      { name: 'split_font', useWhen: 'Process one known font file.' },
      { name: 'split_font_batch', useWhen: 'Scan, dedupe, name, skip-check, and process many fonts.' },
      { name: 'inspect_split_output', useWhen: 'Audit generated output structure and manifests.' },
    ],
    toolSafetyQuickReference: buildToolSafetyQuickReference(),
    supportedExtensions: [...FONT_EXTENSIONS],
    projectStatusNotice: buildProjectStatusNotice(),
    defaultPolicies: {
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      batchErrorMode: 'fail-after',
      skipMode: 'manifest',
      inspectInputMaxFiles: 50000,
      batchMaxFiles: 5000,
      outputInspectMaxFiles: 200000,
      organizeDryRun: true,
      organizeOutputDir: 'organized-fonts',
      organizeSourceDestructive: false,
    },
    recommendedBatchOptions: {
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      skipMode: 'manifest',
      batchErrorMode: 'fail-after',
      includeResults: false,
      splitFailureAction: 'single-woff2',
    },
    recommendedInspectOptions: {
      includeFiles: false,
      includeFamilies: false,
      maxFiles: 200000,
    },
    recommendedOrganizationOptions: {
      dryRun: true,
      includePlan: true,
      parseFonts: true,
      batchGroupBy: 'auto',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      copyInvalidFonts: false,
      overwriteExisting: false,
    },
    workflowPresets: buildWorkflowPresetCatalog(),
    batchCustomizationQuickReference: buildBatchCustomizationQuickReference(),
    directoryOrganizationQuickAnswer: buildDirectoryOrganizationQuickAnswer(),
    batchPolicyGuide: BATCH_POLICY_GUIDE,
    configurationRecipes,
    fontIdentityBasisCatalog: FONT_IDENTITY_BASIS_CATALOG,
    outputStructureCatalog: OUTPUT_STRUCTURE_CATALOG,
    unsupportedFileCategoryCatalog: buildUnsupportedFileCategoryCatalog(),
    directoryHandlingModeCatalog,
    directoryWorkflowDecisionMatrix,
    directoryWorkflowExamples,
    verificationChecklist,
    localVerificationOutputGuide,
    errorResponseCatalog: ERROR_RESPONSE_CATALOG,
    warningCodeCatalog: WARNING_CODE_CATALOG,
    toolResponseFieldCatalog: TOOL_RESPONSE_FIELD_CATALOG,
    toolOptionCatalog: TOOL_OPTION_CATALOG,
    safeInvocationTemplates: SAFE_INVOCATION_TEMPLATES,
    nextToolDecisionSummary: buildNextToolDecisionSummary(workflow),
    responseFieldsToCheck: [
      'ok',
      'node',
      'workspace',
      'wasm',
      'wasm.fontSplitWasmPathConfigured',
      'cnFontSplit',
      'cnFontSplit.packageVersion',
      'cnFontSplit.runtimeVersion',
      'recommendedActions',
      'projectStatusNotice',
      'toolSafetyQuickReference',
      'workflowPresets',
      'workflowPreset',
      'batchCustomizationQuickReference',
      'directoryOrganizationQuickAnswer',
      'batchPolicyGuide',
      'batchPolicySummary',
      'configurationTrace',
      'batchGroupBy',
      'batchNamingMode',
      'batchDedupeMode',
      'batchErrorMode',
      'configurationRecipes',
      'fontIdentityBasisCatalog',
      'outputStructureCatalog',
      'unsupportedFileCategoryCatalog',
      'inputCountGuide',
      'inputDirectoryDecision',
      'supportedFontCount',
      'unsupportedFileDecision',
      'unsupportedFileSummary',
      'unsupportedFileSummary.total',
      'unsupportedFileSummary.byExtension',
      'unsupportedFileSummary.byCategory',
      'unsupportedFileSummary.categoryDetails',
      'unsupportedFileSummary.handlingSummary',
      'unsupportedFileSummary.examples',
      'unsupportedFileSummary.examplesTruncated',
      'validFontCount',
      'invalidFontCount',
      'missingIdentityCount',
      'identityBasis',
      'dedupeDecisionSummary.identityEvidenceSummary.identityBasisCounts',
      'resultType',
      'outputMode',
      'performedSplit',
      'usedFallback',
      'warnings',
      'manifestPath',
      'guidanceView',
      'errorResponseCatalog',
      'warningCodeCatalog',
      'sourceSafetyDecision',
      'safetySummary',
      'toolResponseFieldCatalog',
      'toolOptionCatalog',
      'localVerificationOutputGuide',
      'localVerificationOutputGuide.completionReportGuide',
      'localVerificationOutputGuide.completionReportGuide.requiredClaims',
      'localVerificationOutputGuide.completionReportGuide.forbiddenClaims',
      'localVerificationOutputGuide.completionReportGuide.conciseReportTemplate',
      'safeInvocationTemplates',
      'nextToolDecisionSummary',
      'recommendedWorkflowPlan',
      'nextToolDecisionSummary.quickStartCallExamples',
      'nextToolDecisionSummary.workflowQuickStart',
      'batchWarnings',
      'batchWarningCount',
      'batchDecision',
      'errorCount',
      'errors',
      'maxFilesHit',
      'dryRun',
      'planned',
      'plannedCount',
      'wouldProcessCount',
      'skippedDuplicates',
      'dedupeDecisionSummary',
      'inspectionWarnings',
      'inspectionWarningCount',
      'organizationWarnings',
      'organizationWarningCount',
      'recommendedNextActions',
      'recommendedNextActions[].suggestedArgsField',
      'recommendedNextActions[].suggestedArgs.maxFiles',
      'operationMode',
      'copiedCount',
      'organizationManifestPath',
      'stagingDirectoryDecision',
      'planActionSummary',
      'layoutDecision',
      'layoutDecision.directoryHandling',
      'layoutDecision.directoryHandling.recommendedMode',
      'directoryHandlingModeCatalog',
      'organizationDecision',
      'directoryWorkflowSummary',
      'directoryWorkflowSummary.workflowSteps[].suggestedArgsField',
      'sourceLayoutMismatchSummary',
      'sourceLayoutMismatchSummary.decisionChecklist',
      'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs',
      'sourceLayoutMismatchSummary.decisionChecklist.items[].safePreviewArgs',
      'planVisibility',
      'plan',
      'sourceDestructive',
      'sourceFilesPreserved',
      'writesSourceTree',
      'writesOutputTree',
      'outputTreeInsideInputTree',
      'mayOverwriteOutputTree',
      'parsedFontMetadata',
      'unparsedFontCount',
      'effectiveBatchDedupeMode',
      'dedupeLimitedByParsing',
      'recommendedBatchOptions',
      'recommendedBatchPreviewArgs',
      'layout',
      'layout.layoutKind',
      'directoryWorkflowDecisionMatrix',
      'directoryWorkflowExamples',
      'resultsIncluded',
      'planIncluded',
      'manifestCount',
      'missingManifestCount',
      'outputRoleDecision',
      'outputStructureDecision',
      'auditStatus',
      'auditPassed',
      'auditBlockingReasons',
      'structureSummary',
      'structureSummary.layoutKind',
      'structureSummary.issues[].code',
      'subsetOutputCount',
      'singleWoff2OutputCount',
      'copyOriginalOutputCount',
      'filesIncluded',
      'familiesIncluded',
    ],
    pathRules: commonPathRules,
    recommendedWorkflow: workflows[workflow],
    recommendedWorkflowPlan: buildRecommendedWorkflowPlan(workflow),
  };
  return selectGuidanceSections(
    attachSourceLayoutDecisionChecklistFields(guidance),
    guidanceView.sectionsIncluded,
  );
}

function buildUnsupportedFileSummary(files, { maxExamples = 20 } = {}) {
  const unsupportedFiles = files.filter((file) => !FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const byExtension = new Map();
  const byCategory = new Map();
  for (const file of unsupportedFiles) {
    const extension = path.extname(file).toLowerCase() || '<none>';
    byExtension.set(extension, (byExtension.get(extension) || 0) + 1);
    const category = categorizeUnsupportedFileExtension(extension);
    byCategory.set(category, (byCategory.get(category) || 0) + 1);
  }
  const sortedCategoryEntries = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const categoryDetails = sortedCategoryEntries.map(([category, count]) => {
    const details = UNSUPPORTED_FILE_CATEGORY_DETAILS[category] || UNSUPPORTED_FILE_CATEGORY_DETAILS.other;
    return {
      category,
      count,
      meaning: details.meaning,
      handling: details.handling,
      extensions: details.extensions || [...(UNSUPPORTED_FILE_EXTENSION_CATEGORIES[category] || [])].sort(),
    };
  });
  const archiveCount = byCategory.get('archive') || 0;

  return {
    total: unsupportedFiles.length,
    byExtension: [...byExtension.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([extension, count]) => ({ extension, count })),
    byCategory: sortedCategoryEntries
      .map(([category, count]) => ({ category, count })),
    categoryDetails,
    handlingSummary: {
      unsupportedFilesIgnored: true,
      unsupportedFilesCopiedByOrganization: false,
      unsupportedFilesSplitByBatch: false,
      archivesExtracted: false,
      archiveCount,
      note: archiveCount > 0
        ? 'Archive files are counted for awareness only; this tool does not extract archives, copy them during organization, or split them in batch processing.'
        : 'Unsupported files are counted for awareness only; this tool does not copy them during organization or split them in batch processing.',
    },
    examples: unsupportedFiles
      .slice(0, maxExamples)
      .map((file) => toRelativeWorkspacePath(file)),
    examplesTruncated: unsupportedFiles.length > maxExamples,
  };
}

function buildUnsupportedFileDecision(summary = {}) {
  const total = summary.total || 0;
  const byCategory = Array.isArray(summary.byCategory) ? summary.byCategory : [];
  const byExtension = Array.isArray(summary.byExtension) ? summary.byExtension : [];
  const categoryCounts = Object.fromEntries(byCategory.map((item) => [item.category, item.count]));
  const extensions = byExtension.map((item) => item.extension).filter(Boolean);
  const categories = byCategory.map((item) => item.category).filter(Boolean);
  const extensionsBeyondZipTxt = extensions.filter((extension) => extension !== '.zip' && extension !== '.txt');
  const archiveCount = categoryCounts.archive || 0;
  const unsupportedFontAdjacentCount = categoryCounts['unsupported-font'] || 0;
  const otherFileCount = categoryCounts.other || 0;
  const handlingSummary = summary.handlingSummary || {};

  return {
    summaryType: 'unsupported-file-decision',
    status: total > 0 ? 'ignored-files-present' : 'no-ignored-files',
    totalUnsupportedFileCount: total,
    categoryCount: categories.length,
    categories,
    extensionCount: extensions.length,
    extensions,
    extensionsBeyondZipTxt,
    extensionsBeyondZipTxtCount: extensionsBeyondZipTxt.length,
    hasArchives: archiveCount > 0,
    archiveCount,
    hasUnsupportedFontAdjacentFiles: unsupportedFontAdjacentCount > 0,
    unsupportedFontAdjacentCount,
    hasOtherFiles: otherFileCount > 0,
    otherFileCount,
    hasMultipleCategories: categories.length > 1,
    hasExtensionsBeyondZipTxt: extensionsBeyondZipTxt.length > 0,
    ignoredByDesign: total > 0,
    reviewRecommended: total > 0,
    recommendedAction: total > 0
      ? 'inspect-unsupportedFileSummary-before-writing'
      : 'continue',
    handlingSummary: {
      unsupportedFilesIgnored: handlingSummary.unsupportedFilesIgnored !== false,
      unsupportedFilesCopiedByOrganization: handlingSummary.unsupportedFilesCopiedByOrganization === true,
      unsupportedFilesSplitByBatch: handlingSummary.unsupportedFilesSplitByBatch === true,
      archivesExtracted: handlingSummary.archivesExtracted === true,
    },
    nonIntuitiveBehavior: archiveCount > 0
      ? 'Archive files are counted for awareness only; this tool does not extract archives, copy them during organization, or split them in batch processing.'
      : 'Unsupported files are counted for awareness only; this tool does not copy them during organization or split them in batch processing.',
  };
}

function buildInputCountGuide({
  appliesToTool,
  scannedFileCount,
  supportedFontCount,
  unsupportedFileCount,
  maxFiles,
  maxFilesHit,
  filesIncluded,
  supportedFieldName = 'supportedFontCount',
  unsupportedFieldName = 'unsupportedFileCount',
  unsupportedFileSummary,
  unsupportedFileDecision,
} = {}) {
  const countCompleteness = maxFilesHit ? 'truncated' : 'complete-for-scanned-root';
  const fileDetailsVisibility = filesIncluded === true
    ? 'included'
    : filesIncluded === false
      ? 'omitted-by-request'
      : 'not-returned-by-this-tool';
  const handling = unsupportedFileDecision?.handlingSummary || unsupportedFileSummary?.handlingSummary || {};
  const unsupportedFilesIgnored = handling.unsupportedFilesIgnored !== false;
  const unsupportedFilesCopiedByOrganization = handling.unsupportedFilesCopiedByOrganization === true;
  const unsupportedFilesSplitByBatch = handling.unsupportedFilesSplitByBatch === true;
  const archivesExtracted = handling.archivesExtracted === true;
  const mustInspectFields = [
    'inputCountGuide',
    'scannedFileCount',
    supportedFieldName,
    unsupportedFieldName,
    'maxFilesHit',
    'unsupportedFileDecision',
    'unsupportedFileSummary',
  ];
  if (filesIncluded !== undefined) mustInspectFields.push('filesIncluded');
  const fileDetailsBehavior = fileDetailsVisibility === 'included'
    ? 'filesIncluded true means supported-font inspection entries are included; unsupported files remain summarized in unsupportedFileSummary.'
    : fileDetailsVisibility === 'omitted-by-request'
      ? 'filesIncluded false means per-file detail was intentionally omitted; it does not mean no files exist.'
      : 'This tool does not return per-file inspection entries, so fileDetailsVisibility does not mean files are absent.';
  const nonIntuitiveBehavior = [
    fileDetailsBehavior,
    'maxFilesHit true means scanned counts are truncated and should not be used as complete corpus totals.',
    'Unsupported files are counted and reported for context, but they are not extracted, copied by organization, or split by batch processing.',
    'Archive files are counted as unsupported files; archive extraction is outside this tool layer.',
  ];

  return {
    summaryType: 'input-count-guide',
    appliesToTool,
    scannedFileCount,
    supportedFontCount,
    supportedFieldName,
    unsupportedFileCount,
    unsupportedFieldName,
    maxFiles,
    maxFilesHit,
    countCompleteness,
    filesIncluded: filesIncluded === undefined ? null : filesIncluded,
    fileDetailsVisibility,
    unsupportedFilesHandling: {
      unsupportedFilesIgnored,
      unsupportedFilesCopiedByOrganization,
      unsupportedFilesSplitByBatch,
      archivesExtracted,
    },
    unsupportedFileCategoryCount: unsupportedFileDecision?.categoryCount ?? unsupportedFileSummary?.byCategory?.length ?? 0,
    unsupportedFileExtensionCount: unsupportedFileDecision?.extensionCount ?? unsupportedFileSummary?.byExtension?.length ?? 0,
    mustInspectFields,
    recommendedAction: maxFilesHit
      ? 'rerun-with-higher-maxFiles-before-trusting-counts'
      : 'continue',
    directAnswer: maxFilesHit
      ? `The scan returned ${scannedFileCount} files but maxFilesHit true means more source files existed beyond maxFiles ${maxFiles}; counts are incomplete.`
      : `The scan counted ${scannedFileCount} files under the scanned root: ${supportedFontCount} supported font files and ${unsupportedFileCount} unsupported files.`,
    nonIntuitiveBehavior,
  };
}

function categorizeUnsupportedFileExtension(extension) {
  if (extension === '<none>') return 'extensionless';
  for (const [category, extensions] of Object.entries(UNSUPPORTED_FILE_EXTENSION_CATEGORIES)) {
    if (extensions.has(extension)) return category;
  }
  return 'other';
}

function buildWorkflowPresetCatalog() {
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

function buildUnsupportedFileCategoryCatalog() {
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

function classifyResultType({ outputMode, splitFailureFallbackApplied, skipReason }) {
  if (outputMode === 'copy-original') return 'copy-original-small-glyph';
  if (outputMode !== 'single-woff2') return 'subset';
  if (splitFailureFallbackApplied) return 'single-woff2-split-failure';
  if (skipReason === 'small glyph fallback explicitly enabled') return 'single-woff2-small-glyph';
  return 'single-woff2';
}

function buildWarnings({ decompressedFrom, oversizedKernDetected, oversizedKernStripped, usedFallback, skipped, skipReason }) {
  const warnings = [];
  if (decompressedFrom) warnings.push(`input was decompressed from ${decompressedFrom}`);
  if (oversizedKernDetected && !oversizedKernStripped) warnings.push('oversized kern table detected but preserved');
  if (oversizedKernStripped) warnings.push('oversized kern table stripped before splitting');
  if ((usedFallback || skipped) && skipReason) warnings.push(skipReason);
  return warnings;
}

function buildSourceSafetyDecision({
  appliesToTool,
  safetySummary,
  inputPath,
  outputPath,
  outputPathRole,
  requiresOutputAudit = false,
}) {
  const sourceSafe = safetySummary.sourceDestructive === false
    && safetySummary.sourceFilesPreserved === true;
  const writesFiles = safetySummary.writesOutputTree === true;
  const outputInsideInput = safetySummary.outputTreeInsideInputTree === true;
  const status = !sourceSafe
    ? 'action-required'
    : !writesFiles
      ? 'source-safe-no-write'
      : outputInsideInput
        ? 'source-safe-output-inside-input-tree'
        : 'source-safe-output-tree-write';
  const shortAnswer = !sourceSafe
    ? 'Review safety fields before continuing; source preservation could not be confirmed.'
    : !writesFiles
      ? 'Source font files are preserved and this call writes no output files.'
      : outputInsideInput
        ? 'Source font files are preserved, but generated output is written inside the input directory tree.'
        : 'Source font files are preserved; writes are limited to the configured output tree.';
  const nonIntuitiveBehavior = [
    'sourceDestructive false means source font files are not moved, deleted, or rewritten.',
  ];
  if (outputInsideInput) {
    if (safetySummary.writesSourceTree === true) {
      nonIntuitiveBehavior.push('writesSourceTree true means generated output is inside the input tree; it does not mean source font files are modified.');
    } else {
      nonIntuitiveBehavior.push('outputTreeInsideInputTree true only identifies the configured output location; when writesFiles is false, no output files are written.');
    }
  }
  if (safetySummary.mayOverwriteOutputTree) {
    nonIntuitiveBehavior.push('mayOverwriteOutputTree applies to generated output paths, not source font files.');
  }

  return {
    summaryType: 'source-safety-decision',
    appliesToTool,
    status,
    shortAnswer,
    operationMode: safetySummary.operationMode,
    sourceDestructive: safetySummary.sourceDestructive,
    sourceFilesPreserved: safetySummary.sourceFilesPreserved,
    sourceFilesMovedDeletedOrRewritten: safetySummary.sourceDestructive === true,
    sourceBackupRequired: false,
    writesFiles,
    writesSourceTree: safetySummary.writesSourceTree,
    writesOutputTree: safetySummary.writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    mayOverwriteOutputTree: safetySummary.mayOverwriteOutputTree,
    writeScope: safetySummary.writeScope,
    overwriteScope: safetySummary.overwriteScope,
    inputPath,
    outputPath,
    outputPathRole,
    requiresOutputAudit,
    mustInspectFields: [
      'sourceSafetyDecision',
      'safetySummary',
      'sourceDestructive',
      'sourceFilesPreserved',
      'writesSourceTree',
      'writesOutputTree',
      'outputTreeInsideInputTree',
      'mayOverwriteOutputTree',
    ],
    nonIntuitiveBehavior,
  };
}

function buildInputInspectionWarnings({ maxFilesHit, maxFiles, includeFiles, invalidFontCount, missingIdentityCount }) {
  const warnings = [];
  const push = (code, message) => warnings.push({ code, message });

  if (maxFilesHit) {
    push('input-scan-truncated', `Input inspection hit maxFiles (${maxFiles}); rerun with a higher maxFiles before treating counts as complete.`);
  }
  if (!includeFiles) {
    push('input-files-omitted', 'Per-font inspection entries are omitted because includeFiles is false.');
  }
  if (invalidFontCount > 0) {
    push('invalid-fonts-found', `${invalidFontCount} supported-extension files could not be parsed as fonts.`);
  }
  if (missingIdentityCount > 0) {
    push('font-identity-missing', `${missingIdentityCount} parseable fonts do not have a usable batch identity key.`);
  }

  return warnings;
}

function buildOrganizationWarnings({
  dryRun,
  parseFonts,
  overwriteExisting,
  inputScanTruncated,
  maxFiles,
  unsupportedFileCount,
  invalidFontCount,
  copyInvalidFonts,
  skippedDuplicateCount,
  layoutKind,
  outputDirInsideInput,
}) {
  const warnings = [];
  const push = (code, message) => warnings.push({ code, message });

  if (dryRun) {
    push('organization-dry-run', 'dryRun is true; no directories or files were written.');
  } else {
    push('organization-writes-output', 'dryRun is false; this tool may create directories and copy files into outputDir, but it never moves or deletes source files.');
  }
  if (!parseFonts) {
    push('font-parsing-skipped', 'parseFonts is false; the organizer did not read font metadata, so identity dedupe, glyph counts, invalid-font detection, and font-family grouping are limited.');
  }
  if (overwriteExisting) {
    push('output-overwrite-enabled', 'overwriteExisting is true; matching files in outputDir may be replaced, but source files are still not modified.');
  }
  if (inputScanTruncated) {
    push('input-scan-truncated', `Directory organization scan hit maxFiles (${maxFiles}); rerun with a higher maxFiles before treating the plan as complete.`);
  }
  if (unsupportedFileCount > 0) {
    push('unsupported-files-ignored', `${unsupportedFileCount} non-font files were ignored. This organizer only plans supported font extensions.`);
  }
  if (invalidFontCount > 0 && !copyInvalidFonts) {
    push('invalid-fonts-skipped', `${invalidFontCount} supported-extension files could not be parsed as fonts and were skipped. Set copyInvalidFonts true only if preserving broken font-like files is intentional.`);
  }
  if (skippedDuplicateCount > 0) {
    push('duplicate-fonts-skipped', `${skippedDuplicateCount} equivalent fonts were skipped by the selected batchDedupeMode.`);
  }
  if (layoutKind === 'mixed') {
    push('mixed-layout-detected', 'Fonts were found both at the input root and inside nested folders. Review recommendedBatchPreviewArgs before splitting.');
  }
  if (outputDirInsideInput) {
    push('output-inside-input', 'outputDir is inside or equal to inputDir. Future scans should exclude that output directory to avoid reprocessing organized copies.');
  }

  return warnings;
}

function omitPresetDefaults(values, defaults = {}) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .filter(([key, value]) => !Object.is(value, defaults[key])),
  );
}

function buildSuggestedOrganizationArgs({
  inputDir,
  outputDir,
  workflowPreset,
  options,
  optionOverrides = {},
  extraArgs = {},
}) {
  const presetDefaults = WORKFLOW_PRESETS[workflowPreset]?.organize || {};
  const values = { ...options, ...optionOverrides };
  const presetOverrides = omitPresetDefaults({
    dryRun: values.dryRun,
    includePlan: values.includePlan,
    parseFonts: values.parseFonts,
    batchGroupBy: values.batchGroupBy,
    batchNamingMode: values.batchNamingMode,
    batchDedupeMode: values.batchDedupeMode,
    copyInvalidFonts: values.copyInvalidFonts,
    overwriteExisting: values.overwriteExisting,
  }, presetDefaults);

  return {
    inputDir,
    outputDir,
    workflowPreset,
    ...presetOverrides,
    ...extraArgs,
  };
}

function buildSuggestedBatchPreviewArgs({ inputDir, recommendedBatchOptions = {}, extraArgs = {} }) {
  const presetDefaults = {
    batchGroupBy: 'auto',
    ...WORKFLOW_PRESETS['safe-preview'].batch,
  };
  return {
    inputDir,
    workflowPreset: 'safe-preview',
    ...omitPresetDefaults(recommendedBatchOptions, presetDefaults),
    ...extraArgs,
  };
}

function buildSuggestedBatchWriteArgs({ inputDir, outputRoot, effectiveArgs, batchOptions }) {
  const presetDefaults = {
    batchGroupBy: 'auto',
    ...WORKFLOW_PRESETS['reviewed-write'].batch,
  };
  const overrides = omitPresetDefaults({
    skipMode: batchOptions.skipMode,
    batchGroupBy: batchOptions.batchGroupBy,
    batchNamingMode: batchOptions.batchNamingMode,
    batchDedupeMode: batchOptions.batchDedupeMode,
    batchErrorMode: batchOptions.batchErrorMode,
    splitFailureAction: effectiveArgs.splitFailureAction,
  }, presetDefaults);
  return {
    inputDir,
    outputRoot,
    workflowPreset: 'reviewed-write',
    ...(effectiveArgs.limit !== undefined ? { limit: effectiveArgs.limit } : {}),
    ...(effectiveArgs.maxFiles !== undefined ? { maxFiles: effectiveArgs.maxFiles } : {}),
    ...overrides,
  };
}

function buildSuggestedBatchRerunArgs({ inputDir, outputRoot, workflowPreset, effectiveArgs, batchOptions }) {
  const presetDefaults = {
    batchGroupBy: 'auto',
    ...(WORKFLOW_PRESETS[workflowPreset]?.batch || {}),
  };
  const overrides = omitPresetDefaults({
    skipMode: batchOptions.skipMode,
    batchGroupBy: batchOptions.batchGroupBy,
    batchNamingMode: batchOptions.batchNamingMode,
    batchDedupeMode: batchOptions.batchDedupeMode,
    batchErrorMode: batchOptions.batchErrorMode,
    splitFailureAction: effectiveArgs.splitFailureAction,
  }, presetDefaults);
  return {
    inputDir,
    outputRoot,
    workflowPreset,
    ...(effectiveArgs.limit !== undefined ? { limit: effectiveArgs.limit } : {}),
    maxFiles: '<higher-than-current>',
    ...overrides,
  };
}

function buildBatchAuditArgs({ outputRoot }) {
  return {
    outDir: outputRoot,
    includeFiles: false,
    includeFamilies: false,
    maxFiles: 200000,
  };
}

function buildBatchNextActions({
  dryRun,
  inputDirRelative,
  outputRoot,
  effectiveArgs,
  batchOptions,
  maxFiles,
  maxFilesHit,
  selectedFontCount,
  errorCount,
  writesOutputTree,
}) {
  const actions = [];
  const push = (action) => actions.push(action);

  if (maxFilesHit) {
    const rerunWorkflowPreset = dryRun ? 'safe-preview' : 'reviewed-write';
    push({
      id: 'rerun-batch-with-higher-maxFiles',
      priority: 'high',
      tool: 'split_font_batch',
      reason: `The batch scan hit maxFiles (${maxFiles}); the planned or processed set may be incomplete.`,
      suggestedArgs: buildSuggestedBatchRerunArgs({
        inputDir: inputDirRelative,
        outputRoot,
        workflowPreset: rerunWorkflowPreset,
        effectiveArgs,
        batchOptions,
      }),
      inspectFields: ['inputCountGuide', 'batchDecision', 'maxFilesHit', 'unsupportedFileDecision', 'unsupportedFileSummary', 'batchWarnings', 'discoveredFontCount', 'deduplicatedCount', 'selectedFontCount'],
      successCriteria: 'Rerun with a higher maxFiles value and require maxFilesHit false before trusting batch counts, dedupe results, or planned output paths.',
    });
  }

  if (errorCount > 0) {
    push({
      id: 'inspect-batch-errors',
      priority: 'high',
      tool: 'split_font_batch',
      reason: 'The batch response contains per-font errors; inspect errors[] before reporting the batch as successful.',
      inspectFields: ['batchDecision', 'errorCount', 'errors', 'batchWarnings', 'processedFontCount'],
      successCriteria: 'Resolve or disclose every errors[] entry and require errorCount zero before treating the batch as successful.',
    });
  }

  if (dryRun) {
    if (selectedFontCount > 0) {
      push({
        id: 'run-reviewed-batch-write',
        priority: maxFilesHit || errorCount > 0 ? 'medium' : 'high',
        tool: 'split_font_batch',
        reason: 'The dry-run wrote no files; after reviewing planned paths and warnings, rerun with reviewed-write to create output.',
        suggestedArgs: buildSuggestedBatchWriteArgs({
          inputDir: inputDirRelative,
          outputRoot,
          effectiveArgs,
          batchOptions,
        }),
        suggestedArgsField: 'batchDecision.reviewedWriteArgs',
        inspectFields: ['sourceSafetyDecision', 'safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'batchDecision', 'batchWarnings', 'dedupeDecisionSummary', 'errorCount', 'errors', 'resultsIncluded', 'maxFilesHit', 'unsupportedFileDecision', 'unsupportedFileSummary'],
        successCriteria: 'The reviewed write should return dryRun false, sourceDestructive false, errorCount zero, and an audit-split-output next action whenever output was written.',
      });
    }
    return actions;
  }

  if (writesOutputTree) {
    push({
      id: 'audit-split-output',
      priority: errorCount > 0 ? 'medium' : 'high',
      tool: 'inspect_split_output',
      reason: 'A real batch write can create or update output files; inspect the output directory before reporting completion.',
      suggestedArgs: buildBatchAuditArgs({ outputRoot }),
      suggestedArgsField: 'batchDecision.auditArgs',
      inspectFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'maxFilesHit', 'inspectionWarnings', 'structureSummary', 'manifestCount', 'missingManifestCount', 'subsetOutputCount', 'singleWoff2OutputCount', 'copyOriginalOutputCount'],
      successCriteria: 'Require outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, structureSummary.conforms true, maxFilesHit false, and no action-required inspectionWarnings before treating output as structurally valid.',
    });
  }

  return actions;
}

function buildBatchDecision({
  dryRun,
  inputDirRelative,
  outputRoot,
  effectiveArgs,
  batchOptions,
  maxFilesHit,
  discoveredFontCount,
  selectedFontCount,
  processedFontCount,
  skippedExisting,
  errorCount,
  safetySummary,
}) {
  const base = {
    sourceDestructive: false,
    sourceFilesPreserved: true,
    writesSourceTree: safetySummary.writesSourceTree,
    writesOutputTree: safetySummary.writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    requiresOutputAudit: false,
  };
  const make = (decision) => ({ ...base, ...decision });

  if (maxFilesHit) {
    return make({
      route: 'rerun-batch-with-higher-maxFiles',
      preferredNextActionId: 'rerun-batch-with-higher-maxFiles',
      nextTool: 'split_font_batch',
      nextInputDir: inputDirRelative,
      rerunArgs: buildSuggestedBatchRerunArgs({
        inputDir: inputDirRelative,
        outputRoot,
        workflowPreset: dryRun ? 'safe-preview' : 'reviewed-write',
        effectiveArgs,
        batchOptions,
      }),
      reason: 'The batch scan was truncated, so counts, plans, and output decisions may be incomplete.',
    });
  }

  if (errorCount > 0) {
    return make({
      route: 'inspect-batch-errors',
      preferredNextActionId: 'inspect-batch-errors',
      nextTool: 'split_font_batch',
      nextInputDir: inputDirRelative,
      requiresOutputAudit: safetySummary.writesOutputTree,
      reason: 'The batch response contains per-font errors that need inspection before reporting success.',
    });
  }

  if (discoveredFontCount === 0) {
    return make({
      route: 'no-supported-fonts',
      preferredNextActionId: null,
      nextTool: null,
      nextInputDir: inputDirRelative,
      reason: 'No supported font files were found in the scanned input.',
    });
  }

  if (selectedFontCount === 0) {
    return make({
      route: 'no-selected-fonts',
      preferredNextActionId: null,
      nextTool: null,
      nextInputDir: inputDirRelative,
      reason: 'Supported fonts were discovered, but none were selected for this batch policy and limit.',
    });
  }

  if (dryRun) {
    return make({
      route: 'review-dry-run-plan',
      preferredNextActionId: 'run-reviewed-batch-write',
      nextTool: 'split_font_batch',
      nextInputDir: inputDirRelative,
      reviewedWriteArgs: buildSuggestedBatchWriteArgs({
        inputDir: inputDirRelative,
        outputRoot,
        effectiveArgs,
        batchOptions,
      }),
      reason: 'This batch dry-run wrote no files; review planned paths, warnings, and skips before running a reviewed write.',
    });
  }

  if (safetySummary.writesOutputTree && processedFontCount > 0) {
    return make({
      route: 'audit-written-output',
      preferredNextActionId: 'audit-split-output',
      nextTool: 'inspect_split_output',
      nextInputDir: outputRoot,
      auditArgs: buildBatchAuditArgs({ outputRoot }),
      requiresOutputAudit: true,
      reason: 'The batch wrote output files; audit the output directory before reporting structural success.',
    });
  }

  if (safetySummary.writesOutputTree && skippedExisting > 0) {
    return make({
      route: 'review-existing-output-skips',
      preferredNextActionId: 'audit-split-output',
      nextTool: 'inspect_split_output',
      nextInputDir: outputRoot,
      auditArgs: buildBatchAuditArgs({ outputRoot }),
      requiresOutputAudit: true,
      reason: 'The batch wrote no new files because selected outputs were skipped; audit existing output if relying on it.',
    });
  }

  return make({
    route: 'review-batch-summary',
    preferredNextActionId: null,
    nextTool: null,
    nextInputDir: inputDirRelative,
    reason: 'Review batch counts, warnings, and recommendedNextActions before deciding whether more work is needed.',
  });
}

function buildOrganizationNextActions({
  options,
  inputDirRelative,
  outputDirRelative,
  maxFiles,
  maxFilesHit,
  layout,
  warnings,
  errorCount,
  selectedFontCount,
  copiedCount,
}) {
  const actions = [];
  const warningCodes = new Set(warnings.map((warning) => warning.code));
  const push = (action) => actions.push(action);

  if (maxFilesHit) {
    push({
      id: 'rerun-with-higher-maxFiles',
      priority: 'high',
      tool: 'organize_font_directory',
      reason: `The organization scan hit maxFiles (${maxFiles}); the plan may be incomplete.`,
      suggestedArgs: buildSuggestedOrganizationArgs({
        inputDir: inputDirRelative,
        outputDir: outputDirRelative,
        workflowPreset: options.parseFonts ? 'safe-preview' : 'structure-first',
        options,
        optionOverrides: { includePlan: true },
        extraArgs: { maxFiles: '<higher-than-current>' },
      }),
      inspectFields: withDirectoryRouteInspectFields(['maxFilesHit', 'layout', 'plan']),
      successCriteria: 'Rerun with a higher maxFiles value and require maxFilesHit false before trusting layout, warning, or copy-plan counts.',
    });
  }

  if (!options.parseFonts) {
    push({
      id: 'rerun-with-font-parsing',
      priority: 'high',
      tool: 'organize_font_directory',
      reason: 'parseFonts:false is structure-only; rerun with parsing before relying on invalid-font counts, glyph counts, identity dedupe, or metadata family grouping.',
      suggestedArgs: buildSuggestedOrganizationArgs({
        inputDir: inputDirRelative,
        outputDir: outputDirRelative,
        workflowPreset: 'safe-preview',
        options,
        optionOverrides: { dryRun: true, parseFonts: true },
        extraArgs: { maxFiles },
      }),
      inspectFields: withDirectoryRouteInspectFields(['parsedFontMetadata', 'validFontCount', 'invalidFontCount', 'effectiveBatchDedupeMode', 'dedupeLimitedByParsing']),
      successCriteria: 'The rerun should parse font metadata before relying on invalid-font counts, identity dedupe, glyph counts, or metadata family grouping.',
    });
  }

  if (warningCodes.has('invalid-fonts-skipped')) {
    push({
      id: 'decide-on-invalid-fonts',
      priority: 'medium',
      tool: 'organize_font_directory',
      reason: 'Some supported-extension files looked like fonts but could not be parsed and were skipped.',
      suggestedArgs: buildSuggestedOrganizationArgs({
        inputDir: inputDirRelative,
        outputDir: outputDirRelative,
        workflowPreset: 'safe-preview',
        options,
        optionOverrides: { dryRun: true, includePlan: true, copyInvalidFonts: true },
        extraArgs: { maxFiles },
      }),
      inspectFields: withDirectoryRouteInspectFields(['invalidFontCount', 'plan']),
      note: 'Use copyInvalidFonts:true only when preserving broken font-like files is intentional.',
      successCriteria: 'Continue only after deciding whether preserving invalid font-like files is intentional and verifying the resulting plan actions match that choice.',
    });
  }

  if (layout.layoutKind === 'mixed') {
    push({
      id: 'review-mixed-layout-grouping',
      priority: 'medium',
      tool: 'split_font_batch',
      reason: 'Fonts were found both at the input root and in nested folders; direct batch grouping can surprise users.',
      suggestedArgs: buildSuggestedBatchPreviewArgs({
        inputDir: inputDirRelative,
        recommendedBatchOptions: layout.recommendedBatchOptions,
        extraArgs: { maxFiles },
      }),
      suggestedArgsField: 'recommendedBatchPreviewArgs',
      inspectFields: ['sourceSafetyDecision', 'safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'batchDecision', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileDecision', 'unsupportedFileSummary', 'dedupeDecisionSummary', 'skippedDuplicates', 'errors'],
      successCriteria: 'The batch preview should remain dryRun true and sourceDestructive false, with planned grouping and warnings reviewed before any real write.',
    });
  }

  if (warningCodes.has('output-inside-input')) {
    push({
      id: 'avoid-reprocessing-organized-copies',
      priority: 'medium',
      tool: 'split_font_batch',
      reason: 'outputDir is inside or equal to inputDir, so future broad scans can accidentally process organized copies as source fonts.',
      suggestedArgs: buildSuggestedBatchPreviewArgs({
        inputDir: outputDirRelative,
        recommendedBatchOptions: layout.recommendedBatchOptions,
        extraArgs: { maxFiles },
      }),
      inspectFields: ['sourceSafetyDecision', 'safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'batchDecision', 'inputDir', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileDecision', 'unsupportedFileSummary', 'dedupeDecisionSummary', 'skippedDuplicates', 'errors'],
      note: 'Use the organized outputDir intentionally as the next inputDir, or keep future scans scoped so they do not reprocess organized copies.',
      successCriteria: 'The follow-up batch preview should intentionally target the organized outputDir, remain no-write, and be reviewed before any real batch write.',
    });
  }

  if (errorCount > 0) {
    push({
      id: 'inspect-organization-errors',
      priority: 'high',
      tool: 'organize_font_directory',
      reason: 'The organization run reported per-file errors.',
      inspectFields: withDirectoryRouteInspectFields(['errorCount', 'errors', 'plan']),
      successCriteria: 'Resolve or disclose every organization error and require errorCount zero before treating organization as successful.',
    });
  }

  if (options.dryRun) {
    push({
      id: 'review-plan-before-writing',
      priority: 'high',
      tool: 'organize_font_directory',
      reason: 'dryRun:true wrote no files; review the plan and warnings before choosing a write step.',
      inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'plan', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree']),
      successCriteria: 'Proceed to copy only after safetySummary confirms sourceDestructive false and the plan, planActionSummary, and organizationWarnings are acceptable.',
    });

    if (selectedFontCount > 0) {
      push({
        id: 'preview-batch-split-original-layout',
        priority: 'medium',
        tool: 'split_font_batch',
        reason: 'If the user only needs split output, preview splitting the original inputDir with the recommended batch options.',
        suggestedArgs: buildSuggestedBatchPreviewArgs({
          inputDir: inputDirRelative,
          recommendedBatchOptions: layout.recommendedBatchOptions,
          extraArgs: { maxFiles },
        }),
        suggestedArgsField: 'recommendedBatchPreviewArgs',
        inspectFields: ['sourceSafetyDecision', 'safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'batchDecision', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileDecision', 'unsupportedFileSummary', 'dedupeDecisionSummary', 'skippedDuplicates', 'errors'],
        successCriteria: 'The original-layout batch preview should remain dryRun true and sourceDestructive false, with planned paths and grouping reviewed before a real write.',
      });
      push({
        id: 'copy-organized-staging-directory',
        priority: 'medium',
        tool: 'organize_font_directory',
        reason: 'If the user wants a cleaner staging directory, rerun the reviewed plan in copy-only mode.',
        suggestedArgs: buildSuggestedOrganizationArgs({
          inputDir: inputDirRelative,
          outputDir: outputDirRelative,
          workflowPreset: 'reviewed-write',
          options,
          optionOverrides: { dryRun: false, overwriteExisting: false },
          extraArgs: { maxFiles },
        }),
        inspectFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'operationMode', 'copiedCount', 'organizationManifestPath', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree']),
        successCriteria: 'The reviewed organization copy should be sourceDestructive false and copy-only, with copiedCount or planActionSummary matching the reviewed plan.',
      });
    }
  } else if (copiedCount > 0) {
    push({
      id: 'inspect-organized-output',
      priority: 'medium',
      tool: 'inspect_font_inputs',
      reason: 'The organizer copied fonts into outputDir; inspect that staging directory before splitting it.',
      suggestedArgs: {
        inputDir: outputDirRelative,
        includeFiles: false,
        maxFiles,
      },
      inspectFields: ['inputCountGuide', 'inputDirectoryDecision', 'layout', 'recommendedBatchPreviewArgs', 'supportedFontCount', 'unsupportedFileDecision', 'unsupportedFileSummary', 'invalidFontCount', 'missingIdentityCount', 'inspectionWarnings'],
      successCriteria: 'The staging inspection should complete without scan truncation and show the expected supported fonts before using the staging directory for splitting.',
    });
    push({
      id: 'preview-batch-split-organized-output',
      priority: 'medium',
      tool: 'split_font_batch',
      reason: 'Preview splitting the organized staging directory before writing split output.',
      suggestedArgs: buildSuggestedBatchPreviewArgs({
        inputDir: outputDirRelative,
        recommendedBatchOptions: layout.recommendedBatchOptions,
        extraArgs: { maxFiles },
      }),
      suggestedArgsField: 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs',
      inspectFields: ['sourceSafetyDecision', 'safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'batchDecision', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileDecision', 'unsupportedFileSummary', 'dedupeDecisionSummary', 'skippedDuplicates', 'errors'],
      successCriteria: 'The organized-output batch preview should remain dryRun true and sourceDestructive false, with planned paths and warnings reviewed before a real write.',
    });
  }

  return attachSourceLayoutDecisionChecklistFields(actions);
}

function buildOrganizationDecision({
  options,
  inputDirRelative,
  outputDirRelative,
  maxFiles,
  maxFilesHit,
  layout,
  invalidFontCount,
  selectedFontCount,
  copiedCount,
  errorCount,
  recommendedBatchPreviewArgs,
}) {
  const base = {
    sourceDestructive: false,
    writesBeforeReview: false,
    copyOnlyStagingRequired: false,
  };
  const make = (decision) => ({ ...base, ...decision });

  if (maxFilesHit) {
    return make({
      route: 'rerun-with-higher-maxFiles',
      preferredNextActionId: 'rerun-with-higher-maxFiles',
      nextTool: 'organize_font_directory',
      reason: 'The source scan was truncated, so layout and copy decisions may be incomplete.',
    });
  }

  if (!options.parseFonts) {
    return make({
      route: 'rerun-with-font-parsing',
      preferredNextActionId: 'rerun-with-font-parsing',
      nextTool: 'organize_font_directory',
      reason: 'This was a structure-only pass; rerun with font parsing before relying on invalid-font counts, identity dedupe, or metadata family grouping.',
    });
  }

  if (errorCount > 0) {
    return make({
      route: 'inspect-organization-errors',
      preferredNextActionId: 'inspect-organization-errors',
      nextTool: 'organize_font_directory',
      reason: 'The organization run recorded per-file errors that need inspection before continuing.',
    });
  }

  if (selectedFontCount === 0) {
    if (invalidFontCount > 0 && !options.copyInvalidFonts) {
      return make({
        route: 'decide-on-invalid-fonts',
        preferredNextActionId: 'decide-on-invalid-fonts',
        nextTool: 'organize_font_directory',
        reason: 'Only invalid supported-extension files were available for the current policy; decide whether preserving broken font-like files is intentional.',
      });
    }
    return make({
      route: 'no-copyable-fonts',
      preferredNextActionId: null,
      nextTool: null,
      reason: layout.layoutKind === 'empty'
        ? 'No supported font files were found in the scanned input.'
        : 'No fonts were selected for the current organization policy.',
    });
  }

  if (!options.dryRun) {
    if (copiedCount > 0) {
      return make({
        route: 'preview-organized-output',
        preferredNextActionId: 'preview-batch-split-organized-output',
        nextTool: 'split_font_batch',
        nextInputDir: outputDirRelative,
        safeBatchPreviewArgs: buildSuggestedBatchPreviewArgs({
          inputDir: outputDirRelative,
          recommendedBatchOptions: layout.recommendedBatchOptions,
          extraArgs: { maxFiles },
        }),
        reason: 'A copy-only staging directory was written; inspect or preview that organized output before splitting.',
      });
    }
    return make({
      route: 'review-existing-targets',
      preferredNextActionId: 'inspect-organized-output',
      nextTool: 'inspect_font_inputs',
      nextInputDir: outputDirRelative,
      reason: 'No files were copied by this write run, likely because output targets already existed or the plan selected no copy actions.',
    });
  }

  if (layout.layoutKind === 'mixed') {
    return make({
      route: 'review-mixed-layout',
      preferredNextActionId: 'review-mixed-layout-grouping',
      nextTool: 'split_font_batch',
      nextInputDir: inputDirRelative,
      safeBatchPreviewArgs: recommendedBatchPreviewArgs,
      copyOnlyStagingRequired: 'optional',
      optionalStagingActionId: 'copy-organized-staging-directory',
      reason: 'Fonts exist both at the input root and inside subdirectories; review grouping before direct splitting or staging.',
    });
  }

  return make({
    route: 'preview-original-layout',
    preferredNextActionId: 'preview-batch-split-original-layout',
    nextTool: 'split_font_batch',
    nextInputDir: inputDirRelative,
    safeBatchPreviewArgs: recommendedBatchPreviewArgs,
    copyOnlyStagingRequired: 'optional',
    optionalStagingActionId: 'copy-organized-staging-directory',
    reason: 'The current layout has copyable fonts; preview split_font_batch on the original input before any real batch write, and only copy a staging directory if the user wants one.',
  });
}

function buildSourceLayoutDecisionChecklist({
  options,
  safetySummary,
  organizationDecision,
  directStatus,
  directReason,
  recommendedBatchPreviewArgs,
  stagingNeed,
  stagingReason,
  outputDirRelative,
  warningCodes,
}) {
  const sortedWarningCodes = [...warningCodes].sort();
  const currentCallSourceSafe = safetySummary.sourceDestructive === false
    && safetySummary.sourceFilesPreserved === true;
  const directPreviewStatus = directStatus === 'safe-preview-available'
    ? 'ready'
    : directStatus === 'review-required'
      ? 'review-safe-preview'
      : directStatus === 'use-organized-output'
        ? 'use-organized-output'
        : directStatus === 'not-applicable'
          ? 'not-applicable'
          : 'blocked-until-route-resolution';
  const copyOnlyStagingStatus = stagingNeed === 'not-required-for-splitting'
    ? 'not-required'
    : stagingNeed === 'optional'
      ? 'optional'
      : stagingNeed === 'already-written-copy-only'
        ? 'already-written'
        : stagingNeed === 'defer-until-review'
          ? 'defer-until-route-resolution'
          : 'not-applicable';
  const planDetailStatus = options.includePlan
    ? 'visible'
    : options.dryRun
      ? 'summary-only-rerun-before-copy'
      : 'summary-only-after-copy';
  const splitWriteReadiness = directStatus === 'not-applicable'
    ? 'not-applicable'
    : directStatus === 'use-organized-output'
      ? 'requires-organized-output-safe-preview'
      : directPreviewStatus === 'blocked-until-route-resolution'
        ? 'blocked-until-route-resolution'
        : 'requires-original-input-safe-preview';
  const copyOnlyStagingReadiness = !options.dryRun
    ? 'already-wrote-copy-only-output'
    : copyOnlyStagingStatus === 'not-applicable'
      ? 'not-applicable'
      : copyOnlyStagingStatus === 'not-required'
        ? 'not-required-for-splitting'
        : copyOnlyStagingStatus === 'defer-until-route-resolution'
          ? 'blocked-until-route-resolution'
          : !options.includePlan
            ? 'rerun-with-includePlan-before-copy'
            : 'ready-after-plan-review';
  const directPreviewBlocked = directPreviewStatus === 'blocked-until-route-resolution';
  const directPreviewCanRun = directStatus !== 'not-applicable'
    && directStatus !== 'use-organized-output'
    && !directPreviewBlocked;
  const copyOnlyStagingSafePreviewArgs = stagingNeed === 'already-written-copy-only'
    ? organizationDecision.safeBatchPreviewArgs || null
    : null;

  return {
    summaryType: 'source-layout-decision-checklist',
    primaryRoute: organizationDecision.route,
    preferredNextActionId: organizationDecision.preferredNextActionId,
    splitWriteReadiness,
    copyOnlyStagingReadiness,
    items: [
      {
        id: 'source-safety-preserved',
        status: currentCallSourceSafe ? 'pass' : 'action-required',
        answer: currentCallSourceSafe
          ? 'The current organizer call preserves source font files.'
          : 'The current organizer safety fields must be reviewed before continuing.',
        requiredBeforeWrite: true,
        evidenceFields: [
          'safetySummary.sourceDestructive',
          'safetySummary.sourceFilesPreserved',
          'sourceLayoutMismatchSummary.copyOnlyStaging.sourceFilesPreserved',
        ],
      },
      {
        id: 'direct-original-input-preview',
        status: directPreviewStatus,
        answer: directReason,
        requiredBeforeSplitWrite: directPreviewCanRun,
        nextTool: directPreviewCanRun ? 'split_font_batch' : directPreviewBlocked ? organizationDecision.nextTool : null,
        suggestedArgsField: directPreviewCanRun
          ? 'sourceLayoutMismatchSummary.directOriginalInput.safePreviewArgs'
          : null,
        evidenceFields: [
          'sourceLayoutMismatchSummary.directOriginalInput.status',
          'recommendedBatchPreviewArgs',
          'organizationDecision',
        ],
        safePreviewArgs: directPreviewCanRun ? recommendedBatchPreviewArgs : null,
      },
      {
        id: 'copy-only-staging',
        status: copyOnlyStagingStatus,
        answer: stagingReason,
        requiredBeforeSplitWrite: false,
        nextTool: copyOnlyStagingStatus === 'optional'
          ? 'organize_font_directory'
          : copyOnlyStagingSafePreviewArgs
            ? 'split_font_batch'
            : null,
        suggestedArgsField: copyOnlyStagingSafePreviewArgs
          ? 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
          : null,
        outputDir: outputDirRelative,
        sourceDestructive: false,
        safePreviewArgs: copyOnlyStagingSafePreviewArgs,
        evidenceFields: [
          'sourceLayoutMismatchSummary.copyOnlyStaging.need',
          'sourceLayoutMismatchSummary.copyOnlyStaging.outputDir',
          'sourceLayoutMismatchSummary.copyOnlyStaging.sourceDestructive',
          'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs',
        ],
      },
      {
        id: 'plan-detail-before-copy',
        status: planDetailStatus,
        answer: options.includePlan
          ? 'Detailed plan[] is available for copy target review.'
          : options.dryRun
            ? 'Only summary fields are visible; rerun with includePlan:true before a copy-only write when exact targets matter.'
            : 'This copy-only call already ran; use planActionSummary, copiedCount, errors, and organizationManifestPath as write evidence.',
        requiredBeforeCopyWrite: options.dryRun && !options.includePlan,
        nextTool: options.dryRun && !options.includePlan ? 'organize_font_directory' : null,
        evidenceFields: [
          'directoryWorkflowSummary.planVisibility',
          'planActionSummary',
          'plan',
        ],
      },
      {
        id: 'warnings-reviewed',
        status: sortedWarningCodes.length === 0 ? 'clear' : 'review-required',
        answer: sortedWarningCodes.length === 0
          ? 'No organization warning codes were emitted.'
          : 'Review organizationWarnings before relying on the preview, copy plan, or write result.',
        requiredBeforeWrite: sortedWarningCodes.length > 0,
        warningCodes: sortedWarningCodes,
        evidenceFields: ['organizationWarnings'],
      },
      {
        id: 'post-write-output-audit',
        status: 'required-after-reviewed-write',
        answer: 'After any reviewed split_font_batch write, inspect the output tree before reporting structural success.',
        requiredAfterSplitWrite: true,
        nextTool: 'inspect_split_output',
        evidenceFields: [
          'outputRoleDecision',
          'outputStructureDecision',
          'auditStatus',
          'auditPassed',
          'structureSummary',
          'maxFilesHit',
        ],
      },
    ],
  };
}

function buildSourceLayoutMismatchSummary({
  options,
  layout,
  safetySummary,
  organizationDecision,
  recommendedBatchPreviewArgs,
  outputDirRelative,
  effectiveDedupeMode,
  warnings,
}) {
  const warningCodes = new Set((warnings || []).map((warning) => warning.code));
  const requestedBatchGroupBy = options.batchGroupBy || 'auto';
  const recommendedBatchGroupBy = layout.recommendedBatchOptions?.batchGroupBy || null;
  const effectiveBatchGroupByForReview = requestedBatchGroupBy === 'auto'
    ? recommendedBatchGroupBy
    : requestedBatchGroupBy;
  const requestedGroupingMatchesRecommendation = requestedBatchGroupBy === 'auto'
    || requestedBatchGroupBy === recommendedBatchGroupBy;

  const mismatchReasons = [];
  const reviewReasons = [];
  const layoutNotes = [];

  if (layout.layoutKind === 'mixed') {
    mismatchReasons.push('mixed-root-and-nested-fonts');
    reviewReasons.push('mixed-layout-review-required');
    layoutNotes.push('Fonts were found both at the input root and inside nested directories.');
  }
  if (!requestedGroupingMatchesRecommendation) {
    mismatchReasons.push('requested-grouping-differs-from-detected-layout');
    reviewReasons.push('requested-grouping-review-required');
  }
  if (layout.layoutKind === 'flat') {
    layoutNotes.push('Flat sources have no source-directory family signal, so metadata-family grouping is the usual recommendation.');
  }
  if (!options.parseFonts && effectiveBatchGroupByForReview === 'font-family') {
    reviewReasons.push('metadata-grouping-not-parsed');
  }
  if (warningCodes.has('input-scan-truncated')) {
    reviewReasons.push('input-scan-truncated');
  }
  if (warningCodes.has('invalid-fonts-skipped')) {
    reviewReasons.push('invalid-fonts-skipped');
  }
  if (warningCodes.has('duplicate-fonts-skipped')) {
    reviewReasons.push('duplicates-skipped');
  }
  if (warningCodes.has('output-inside-input')) {
    reviewReasons.push('output-tree-inside-input-tree');
  }

  const mismatchDetected = mismatchReasons.length > 0;
  const sourceLayoutMatchesRecommendedGrouping = !mismatchDetected
    && requestedGroupingMatchesRecommendation
    && layout.layoutKind !== 'mixed'
    && layout.layoutKind !== 'empty';
  const confidence = warningCodes.has('input-scan-truncated')
    ? 'incomplete'
    : !options.parseFonts && effectiveBatchGroupByForReview === 'font-family'
      ? 'provisional-until-font-parsing'
      : mismatchDetected ? 'review-required' : 'high';

  let directStatus = 'safe-preview-available';
  let directReason = 'Preview split_font_batch on the original input before any reviewed write.';
  if (layout.layoutKind === 'empty' || organizationDecision.route === 'no-copyable-fonts') {
    directStatus = 'not-applicable';
    directReason = 'No copyable supported fonts are available for direct batch preview.';
  } else if (organizationDecision.route === 'rerun-with-font-parsing') {
    directStatus = 'available-but-rerun-organization-first';
    directReason = 'Metadata-sensitive grouping or dedupe is provisional until organize_font_directory is rerun with font parsing.';
  } else if (organizationDecision.route === 'decide-on-invalid-fonts') {
    directStatus = 'available-after-invalid-font-decision';
    directReason = 'Decide whether invalid supported-extension files should be preserved before treating direct preview as complete.';
  } else if (organizationDecision.route === 'review-mixed-layout') {
    directStatus = 'review-required';
    directReason = 'Mixed root and nested fonts can make direct grouping surprising; review the safe-preview plan before writing.';
  } else if (organizationDecision.route === 'preview-organized-output') {
    directStatus = 'use-organized-output';
    directReason = 'A copy-only staging directory was written; preview that organized output before splitting.';
  } else if (mismatchDetected) {
    directStatus = 'review-required';
    directReason = 'The requested grouping differs from the detected layout recommendation; review the safe-preview plan before writing.';
  }

  let stagingNeed = 'optional';
  let stagingReason = 'Copy-only staging is optional; use it only when the user wants a cleaner source-like directory before splitting.';
  if (layout.layoutKind === 'empty' || organizationDecision.route === 'no-copyable-fonts') {
    stagingNeed = 'not-applicable';
    stagingReason = 'There are no copyable supported fonts for a staging directory.';
  } else if (!options.dryRun && organizationDecision.route === 'preview-organized-output') {
    stagingNeed = 'already-written-copy-only';
    stagingReason = 'This call already copied selected fonts into outputDir; inspect or batch-preview that staged output next.';
  } else if (organizationDecision.route === 'rerun-with-font-parsing' || organizationDecision.route === 'decide-on-invalid-fonts') {
    stagingNeed = 'defer-until-review';
    stagingReason = 'Resolve the preferred organization decision before running a copy-only staging write.';
  } else if (!mismatchDetected && layout.layoutKind !== 'mixed') {
    stagingNeed = 'not-required-for-splitting';
    stagingReason = 'The original input can be previewed directly; staging is only for users who want a cleaner copied directory.';
  }
  const copyOnlyStagingSafePreviewArgs = stagingNeed === 'already-written-copy-only'
    ? organizationDecision.safeBatchPreviewArgs || null
    : null;

  const decisionChecklist = buildSourceLayoutDecisionChecklist({
    options,
    safetySummary,
    organizationDecision,
    directStatus,
    directReason,
    recommendedBatchPreviewArgs,
    stagingNeed,
    stagingReason,
    outputDirRelative,
    warningCodes,
  });

  return {
    summaryType: 'source-layout-mismatch',
    appliesToTool: 'organize_font_directory',
    currentLayoutKind: layout.layoutKind,
    requestedBatchGroupBy,
    recommendedBatchGroupBy,
    effectiveBatchGroupByForReview,
    requestedGroupingMatchesRecommendation,
    sourceLayoutMatchesRecommendedGrouping,
    mismatchDetected,
    mismatchReasons,
    reviewRecommended: reviewReasons.length > 0,
    reviewReasons: uniqueStrings(reviewReasons),
    layoutNotes,
    confidence,
    directOriginalInput: {
      status: directStatus,
      previewTool: 'split_font_batch',
      previewRequiredBeforeWrite: true,
      safePreviewArgs: directStatus === 'use-organized-output' ? null : recommendedBatchPreviewArgs,
      reason: directReason,
    },
    copyOnlyStaging: {
      need: stagingNeed,
      outputDir: outputDirRelative,
      writeBehavior: options.dryRun ? 'no-write-until-dryRun-false' : 'copy-only-outputDir',
      sourceDestructive: false,
      sourceFilesPreserved: true,
      sourceFilesMovedDeletedOrRewritten: false,
      writesSourceTree: safetySummary.writesSourceTree,
      outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
      mayOverwriteOutputTree: safetySummary.mayOverwriteOutputTree,
      nextActionId: organizationDecision.optionalStagingActionId || (
        organizationDecision.route === 'preview-organized-output'
          ? 'preview-batch-split-organized-output'
          : null
      ),
      suggestedArgsField: copyOnlyStagingSafePreviewArgs
        ? 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
        : null,
      safePreviewArgs: copyOnlyStagingSafePreviewArgs,
      reason: stagingReason,
    },
    decisionChecklist,
    policySnapshot: {
      requestedBatchDedupeMode: options.batchDedupeMode,
      effectiveBatchDedupeMode: effectiveDedupeMode,
      batchNamingMode: options.batchNamingMode,
    },
    successCriteria: [
      'Treat this summary as routing guidance, not proof of success.',
      'Before writing split output, run split_font_batch with safe-preview arguments and inspect planned paths, warnings, maxFilesHit, and errors.',
      'Before copy-only staging, review planActionSummary and plan[] when available; if plan[] was omitted, rerun the organization dry-run with includePlan:true.',
      'After any reviewed batch write, run inspect_split_output and require outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, structureSummary.conforms true, and maxFilesHit false.',
    ],
    nonIntuitiveBehavior: [
      'copyOnlyStaging is never source-destructive: dryRun:false copies selected fonts to outputDir and does not move, delete, or rewrite source fonts.',
      'A direct original-input batch preview is usually enough when the user only wants split output; staging is for a cleaner copied source layout.',
      'requestedGroupingMatchesRecommendation only compares policy shape; it does not prove that every font family name or output path is correct.',
    ],
  };
}

function buildDirectoryWorkflowSummary({
  options,
  inputDirRelative,
  layout,
  safetySummary,
  organizationDecision,
  recommendedBatchPreviewArgs,
  recommendedNextActions,
  warnings,
  outputDirRelative,
  effectiveDedupeMode,
}) {
  const sourceLayoutMismatchSummary = buildSourceLayoutMismatchSummary({
    options,
    layout,
    safetySummary,
    organizationDecision,
    recommendedBatchPreviewArgs,
    outputDirRelative,
    effectiveDedupeMode,
    warnings,
  });
  const warningCodes = new Set(warnings.map((warning) => warning.code));
  const actionById = new Map((recommendedNextActions || []).map((action) => [action.id, action]));
  const reviewReasons = [];
  if (layout.layoutKind === 'mixed') {
    reviewReasons.push('mixed-root-and-nested-fonts');
  }
  if (!options.parseFonts) {
    reviewReasons.push('metadata-not-parsed');
  }
  if (warningCodes.has('invalid-fonts-skipped')) {
    reviewReasons.push('invalid-fonts-skipped');
  }
  if (warningCodes.has('duplicate-fonts-skipped')) {
    reviewReasons.push('duplicates-skipped');
  }
  if (warningCodes.has('output-inside-input')) {
    reviewReasons.push('output-tree-inside-input-tree');
  }

  const workflowSteps = [
    {
      id: 'review-source-layout',
      status: 'current-response',
      tool: 'organize_font_directory',
      writesFiles: safetySummary.writesOutputTree,
      sourceDestructive: false,
      inspectFields: [
        'inputCountGuide',
        'sourceSafetyDecision',
        'safetySummary',
        'layout',
        'layoutDecision',
        'layoutDecision.directoryHandling',
        'batchPolicySummary',
        'stagingDirectoryDecision',
        'organizationDecision',
        'directoryWorkflowSummary',
        'sourceLayoutMismatchSummary',
        'sourceLayoutMismatchSummary.decisionChecklist',
        'recommendedBatchPreviewArgs',
        'organizationWarnings',
        'planActionSummary',
        'plan',
      ],
      successCriteria: 'Confirm sourceDestructive false, review layout and organizationWarnings, and decide whether original input or copy-only staging should be previewed next.',
    },
  ];

  const rerunParsingAction = actionById.get('rerun-with-font-parsing');
  if (rerunParsingAction) {
    workflowSteps.push({
      id: 'rerun-with-font-parsing',
      status: organizationDecision.preferredNextActionId === 'rerun-with-font-parsing' ? 'preferred-next' : 'available-next',
      tool: 'organize_font_directory',
      writesFiles: false,
      sourceDestructive: false,
      suggestedArgs: rerunParsingAction.suggestedArgs,
      inspectFields: rerunParsingAction.inspectFields,
      successCriteria: rerunParsingAction.successCriteria,
    });
  }

  const originalPreviewAction = actionById.get('preview-batch-split-original-layout') || actionById.get('review-mixed-layout-grouping');
  if (originalPreviewAction) {
    workflowSteps.push({
      id: 'preview-batch-split-original-layout',
      status: organizationDecision.preferredNextActionId === originalPreviewAction?.id ? 'preferred-next' : 'available-next',
      tool: 'split_font_batch',
      writesFiles: false,
      sourceDestructive: false,
      suggestedArgs: originalPreviewAction.suggestedArgs,
      suggestedArgsField: 'recommendedBatchPreviewArgs',
      inspectFields: originalPreviewAction.inspectFields,
      successCriteria: originalPreviewAction.successCriteria,
    });
  }

  const copyStagingAction = actionById.get('copy-organized-staging-directory');
  if (copyStagingAction) {
    workflowSteps.push({
      id: 'copy-organized-staging-directory',
      status: organizationDecision.optionalStagingActionId === 'copy-organized-staging-directory' ? 'optional-next' : 'available-next',
      tool: 'organize_font_directory',
      writesFiles: true,
      sourceDestructive: false,
      suggestedArgs: copyStagingAction.suggestedArgs,
      inspectFields: copyStagingAction.inspectFields,
      successCriteria: copyStagingAction.successCriteria,
    });
  }

  const organizedPreviewAction = actionById.get('preview-batch-split-organized-output');
  if (organizedPreviewAction) {
    workflowSteps.push({
      id: 'preview-batch-split-organized-output',
      status: organizationDecision.preferredNextActionId === 'preview-batch-split-organized-output' ? 'preferred-next' : 'available-next',
      tool: 'split_font_batch',
      writesFiles: false,
      sourceDestructive: false,
      suggestedArgs: organizedPreviewAction.suggestedArgs,
      suggestedArgsField: sourceLayoutMismatchSummary.copyOnlyStaging?.safePreviewArgs
        ? 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
        : 'organizationDecision.safeBatchPreviewArgs',
      inspectFields: organizedPreviewAction.inspectFields,
      successCriteria: organizedPreviewAction.successCriteria,
    });
  }

  workflowSteps.push(
    {
      id: 'reviewed-batch-write',
      status: 'after-reviewed-preview',
      tool: 'split_font_batch',
      writesFiles: true,
      sourceDestructive: false,
      suggestedArgsHint: {
        inputDir: '<reviewed original inputDir or organized outputDir>',
        outputRoot: '<reviewed split output root>',
        workflowPreset: 'reviewed-write',
      },
      inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'batchDecision', 'batchWarnings', 'dedupeDecisionSummary', 'errorCount', 'errors', 'recommendedNextActions'],
      successCriteria: 'Only run after the safe-preview plan is acceptable; require sourceDestructive false, maxFilesHit false, and errorCount zero.',
    },
    {
      id: 'audit-split-output',
      status: 'after-reviewed-write',
      tool: 'inspect_split_output',
      writesFiles: false,
      sourceDestructive: false,
      suggestedArgsHint: {
        outDir: '<reviewed split output root>',
        includeFiles: false,
        includeFamilies: false,
        maxFiles: 200000,
      },
      inspectFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'maxFilesHit', 'inspectionWarnings', 'structureSummary'],
      successCriteria: 'Require outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, structureSummary.conforms true, maxFilesHit false, and no action-required inspectionWarnings before reporting completion.',
    },
  );

  const nonIntuitiveBehavior = [
    'organize_font_directory never moves, deletes, or rewrites source font files; dryRun:false is copy-only into outputDir.',
    'recommendedBatchOptions is only a policy fragment; use recommendedBatchPreviewArgs or a workflowSteps suggestedArgs object for a copyable safe-preview call that preserves the current scan maxFiles.',
  ];
  if (!options.parseFonts) {
    nonIntuitiveBehavior.push('parseFonts:false makes identity dedupe and metadata-family grouping provisional until rerun with parsing.');
  }
  if (layout.layoutKind === 'mixed') {
    nonIntuitiveBehavior.push('mixed layout means fonts were found both at input root and nested directories, so direct grouping can surprise users.');
  }
  if (safetySummary.outputTreeInsideInputTree) {
    nonIntuitiveBehavior.push('outputDir is inside inputDir; future broad scans can reprocess organized copies unless the next input is scoped intentionally.');
  }
  if (safetySummary.writesSourceTree) {
    nonIntuitiveBehavior.push('writesSourceTree true means the output tree is inside the input tree, not that source font files are modified.');
  }

  const planVisibility = {
    planIncluded: options.includePlan,
    detailsOmitted: options.includePlan ? [] : ['plan'],
    availableSummaryFields: [
      'planActionSummary',
      'layoutDecision',
      'layoutDecision.directoryHandling',
      'stagingDirectoryDecision',
      'organizationDecision',
      'directoryWorkflowSummary',
      'sourceLayoutMismatchSummary',
      'sourceLayoutMismatchSummary.decisionChecklist',
      'recommendedNextActions',
      'organizationWarnings',
      'layout',
      'safetySummary',
      'batchPolicySummary',
    ],
    summaryUse: options.includePlan
      ? 'plan[] is available for exact per-file copy, skip, dedupe, and target review.'
      : 'plan[] is omitted; planActionSummary and routing fields are suitable for triage but not exact per-file target review.',
    rerunWithPlanBeforeWrite: options.dryRun && !options.includePlan,
    rerunWithPlanArgs: options.dryRun && !options.includePlan
      ? buildSuggestedOrganizationArgs({
        inputDir: inputDirRelative,
        outputDir: outputDirRelative,
        workflowPreset: 'safe-preview',
        options,
        optionOverrides: { dryRun: true, includePlan: true },
        extraArgs: { includePlan: true },
      })
      : null,
    successCriteria: options.includePlan
      ? 'Detailed plan[] is visible; review it with organizationWarnings before any copy-only write.'
      : 'For large/noisy triage, inspect availableSummaryFields; before copy-only writes that depend on exact targets, rerun the dry-run with includePlan:true.',
  };

  return attachSourceLayoutDecisionChecklistFields({
    summaryType: 'directory-layout-workflow',
    appliesToTool: 'organize_font_directory',
    currentStep: options.dryRun ? 'layout-plan' : 'copy-only-staging',
    planVisibility,
    sourceLayoutMismatchSummary,
    sourceLayout: {
      layoutKind: layout.layoutKind,
      recommendedBatchGroupBy: layout.recommendedBatchOptions?.batchGroupBy,
      reviewRecommended: reviewReasons.length > 0,
      reviewReasons,
    },
    currentCallSafety: {
      operationMode: safetySummary.operationMode,
      sourceDestructive: false,
      sourceFilesPreserved: true,
      writesSourceTree: safetySummary.writesSourceTree,
      writesOutputTree: safetySummary.writesOutputTree,
      outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
      mayOverwriteOutputTree: safetySummary.mayOverwriteOutputTree,
    },
    policySnapshot: {
      batchGroupBy: options.batchGroupBy,
      batchNamingMode: options.batchNamingMode,
      requestedBatchDedupeMode: options.batchDedupeMode,
      effectiveBatchDedupeMode: effectiveDedupeMode,
    },
    route: {
      route: organizationDecision.route,
      preferredNextActionId: organizationDecision.preferredNextActionId,
      nextTool: organizationDecision.nextTool,
      nextInputDir: organizationDecision.nextInputDir,
      copyOnlyStagingRequired: organizationDecision.copyOnlyStagingRequired,
      optionalStagingActionId: organizationDecision.optionalStagingActionId,
    },
    directBatchPreviewArgs: recommendedBatchPreviewArgs,
    stagingOutputDir: outputDirRelative,
    workflowSteps,
    successCriteria: [
      'Do not treat organization as complete until sourceDestructive is false, organizationWarnings are reviewed, and planActionSummary or plan matches user intent.',
      'Run a split_font_batch safe-preview before any reviewed batch write.',
      'After any reviewed batch write, require inspect_split_output to report outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, structureSummary.conforms true, and maxFilesHit false before reporting structural success.',
    ],
    nonIntuitiveBehavior,
  });
}

function buildDirectoryHandlingDecision({
  layout,
  safetySummary,
  organizationDecision,
  directOriginalInput,
  copyOnlyStaging,
}) {
  const directStatus = directOriginalInput.status || null;
  const originalInputPreviewRunnable = ['safe-preview-available', 'review-required'].includes(directStatus)
    && Boolean(directOriginalInput.safePreviewArgs);
  const copyOnlyStagingNeed = copyOnlyStaging.need || null;
  const route = organizationDecision.route;
  const recommendedMode = DIRECTORY_HANDLING_MODE_BY_ORGANIZATION_ROUTE[route] || 'review-organization-decision';
  const useOrganizedOutput = recommendedMode === 'preview-organized-output';
  const suggestedArgsField = useOrganizedOutput
    ? 'organizationDecision.safeBatchPreviewArgs'
    : originalInputPreviewRunnable
      ? 'layoutDecision.directOriginalInput.safePreviewArgs'
      : null;
  const safePreviewArgs = useOrganizedOutput
    ? organizationDecision.safeBatchPreviewArgs || null
    : originalInputPreviewRunnable
      ? directOriginalInput.safePreviewArgs || null
      : null;

  return {
    summaryType: 'directory-handling-decision',
    recommendedMode,
    shortAnswer: DIRECTORY_HANDLING_SHORT_ANSWER_BY_MODE[recommendedMode],
    layoutKind: layout.layoutKind,
    recommendedBatchGroupBy: layout.recommendedBatchOptions?.batchGroupBy || null,
    originalInputPreviewStatus: directStatus,
    originalInputPreviewRunnable,
    copyOnlyStagingNeed,
    helperTool: 'organize_font_directory',
    helperToolDefaultMode: 'dry-run-plan-only',
    helperToolWriteMode: 'copy-only-outputDir',
    sourceDestructive: false,
    sourceFilesPreserved: true,
    copyOnlyStagingIsDestructive: false,
    copyOnlyStagingWritesWhen: 'only when organize_font_directory is called with dryRun:false',
    writesSourceTree: safetySummary.writesSourceTree,
    writesOutputTree: safetySummary.writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    nextTool: organizationDecision.nextTool || (originalInputPreviewRunnable ? 'split_font_batch' : null),
    nextInputDir: organizationDecision.nextInputDir || null,
    suggestedArgsField,
    safePreviewArgs,
    mustInspectFields: [...DIRECTORY_HANDLING_MUST_INSPECT_FIELDS],
  };
}

function buildLayoutDecision({
  layout,
  safetySummary,
  organizationDecision,
  directoryWorkflowSummary,
}) {
  const sourceLayoutMismatchSummary = directoryWorkflowSummary.sourceLayoutMismatchSummary;
  const directOriginalInput = sourceLayoutMismatchSummary.directOriginalInput || {};
  const copyOnlyStaging = sourceLayoutMismatchSummary.copyOnlyStaging || {};
  const directoryHandling = buildDirectoryHandlingDecision({
    layout,
    safetySummary,
    organizationDecision,
    directOriginalInput,
    copyOnlyStaging,
  });
  return {
    summaryType: 'layout-decision',
    appliesToTool: 'organize_font_directory',
    shortAnswer: directoryHandling.shortAnswer,
    layoutKind: layout.layoutKind,
    recommendedBatchGroupBy: layout.recommendedBatchOptions?.batchGroupBy || null,
    route: organizationDecision.route,
    directoryHandling,
    recommendedNextActionId: organizationDecision.preferredNextActionId || organizationDecision.optionalStagingActionId || null,
    nextTool: organizationDecision.nextTool || null,
    nextInputDir: organizationDecision.nextInputDir || null,
    reason: organizationDecision.reason,
    operationMode: safetySummary.operationMode,
    sourceDestructive: false,
    sourceFilesPreserved: true,
    writesSourceTree: safetySummary.writesSourceTree,
    writesOutputTree: safetySummary.writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    mayOverwriteOutputTree: safetySummary.mayOverwriteOutputTree,
    directOriginalInput: {
      status: directOriginalInput.status || null,
      previewTool: directOriginalInput.previewTool || 'split_font_batch',
      previewRequiredBeforeWrite: directOriginalInput.previewRequiredBeforeWrite === true,
      safePreviewArgs: directOriginalInput.safePreviewArgs || null,
      reason: directOriginalInput.reason || null,
    },
    copyOnlyStaging: {
      need: copyOnlyStaging.need || null,
      outputDir: copyOnlyStaging.outputDir || null,
      sourceDestructive: false,
      sourceFilesPreserved: true,
      sourceFilesMovedDeletedOrRewritten: false,
      writeBehavior: copyOnlyStaging.writeBehavior || null,
      nextActionId: copyOnlyStaging.nextActionId || null,
      suggestedArgsField: copyOnlyStaging.suggestedArgsField || null,
      safePreviewArgs: copyOnlyStaging.safePreviewArgs || null,
      reason: copyOnlyStaging.reason || null,
    },
    mustInspectFields: [
      'safetySummary',
      'layout',
      'layoutDecision',
      'layoutDecision.directoryHandling',
      'stagingDirectoryDecision',
      'organizationDecision',
      'sourceLayoutMismatchSummary',
      'sourceLayoutMismatchSummary.decisionChecklist',
      'directoryWorkflowSummary.planVisibility',
      'recommendedNextActions',
      'organizationWarnings',
      'planActionSummary',
    ],
    successCriteria: [
      'Use layoutDecision only as a compact route summary; it is not proof that organization or splitting is complete.',
      'Before any copy-only write, confirm sourceDestructive false and review planActionSummary, organizationWarnings, and plan[] when available.',
      'Before any reviewed batch write, run split_font_batch with safe-preview arguments and inspect planned paths, warnings, maxFilesHit, and errors.',
      'After any reviewed batch write, run inspect_split_output and require outputRoleDecision.auditAppliesToThisDirectory not false plus outputStructureDecision.status pass.',
    ],
    nonIntuitiveBehavior: [
      'organize_font_directory never moves, deletes, or rewrites source font files; dryRun:false is copy-only into outputDir.',
      'writesSourceTree true means the output tree is inside the input tree, not that source font files are modified.',
      'copyOnlyStaging is optional unless the route or user intent requires a cleaner staging directory.',
    ],
  };
}

function buildStagingDirectoryDecision({
  options,
  outputDirRelative,
  layout,
  copiedCount,
  skippedTargetExists,
  selectedFontCount,
  errorCount,
  organizationManifestPath,
  safePreviewArgs,
}) {
  let status = 'not-written-dry-run';
  let recommendedAction = 'review-plan-before-copying';
  let shortAnswer = 'No staging directory was written; review the plan before deciding whether copy-only organization is needed.';

  if (!options.dryRun && errorCount > 0) {
    status = 'organization-errors';
    recommendedAction = 'inspect-organization-errors';
    shortAnswer = 'The copy-only organization run reported errors; resolve them before using outputDir as a split source.';
  } else if (!options.dryRun && copiedCount > 0) {
    status = 'ready-for-source-preflight';
    recommendedAction = 'inspect-staging-with-inspect_font_inputs';
    shortAnswer = 'The organizer wrote a source-like staging directory; inspect it as input, then run split_font_batch safe-preview before any split write.';
  } else if (!options.dryRun && skippedTargetExists > 0) {
    status = 'review-existing-targets';
    recommendedAction = 'inspect-existing-staging-targets';
    shortAnswer = 'No new files were copied because targets already existed; inspect outputDir before deciding whether to reuse or overwrite it.';
  } else if (!options.dryRun && selectedFontCount === 0) {
    status = 'no-copyable-fonts';
    recommendedAction = 'adjust-organization-policy-or-stop';
    shortAnswer = 'No copyable fonts were selected, so outputDir is not a useful staging source yet.';
  } else if (!options.dryRun) {
    status = 'no-new-copies';
    recommendedAction = 'inspect-outputDir-before-reuse';
    shortAnswer = 'The organization call wrote no new font copies; inspect outputDir before using it as the next input.';
  }

  return {
    summaryType: 'staging-directory-decision',
    appliesToTool: 'organize_font_directory',
    status,
    shortAnswer,
    recommendedAction,
    outputDir: outputDirRelative,
    outputDirRole: 'organized-font-source-staging',
    isSplitOutput: false,
    sourceDestructive: false,
    sourceFilesPreserved: true,
    sourceFilesMovedDeletedOrRewritten: false,
    operationMode: options.dryRun ? 'plan-only' : 'copy-only',
    copiedCount,
    skippedTargetExists,
    selectedFontCount,
    layoutKind: layout.layoutKind,
    recommendedBatchGroupBy: layout.recommendedBatchOptions?.batchGroupBy || null,
    organizationManifestPath,
    inspectTool: 'inspect_font_inputs',
    inspectArgs: {
      inputDir: outputDirRelative,
      includeFiles: false,
    },
    previewTool: 'split_font_batch',
    safePreviewArgs,
    auditToolAfterSplitWrite: 'inspect_split_output',
    mustInspectFields: [
      'stagingDirectoryDecision',
      'inputCountGuide',
      'supportedFontCount',
      'unsupportedFileDecision',
      'unsupportedFileSummary',
      'invalidFontCount',
      'missingIdentityCount',
      'inspectionWarnings',
      'organizationManifestPath',
      'planActionSummary',
      'organizationWarnings',
    ],
    successCriteria: [
      'If status is ready-for-source-preflight, run inspect_font_inputs on outputDir and require maxFilesHit false before using it as split input.',
      'Before any reviewed split write, run split_font_batch safe-preview on outputDir and review planned paths, warnings, dedupe, maxFilesHit, and errors.',
      'After any reviewed split write, run inspect_split_output on the split outputRoot and require outputRoleDecision.auditAppliesToThisDirectory not false plus outputStructureDecision.status pass.',
    ],
    nonIntuitiveBehavior: [
      'The organizer outputDir is source-like staging, not split output; inspect_split_output applies only after split_font or split_font_batch writes generated output.',
      'organize_font_directory dryRun:false copies fonts into outputDir; it never moves, deletes, or rewrites source font files.',
    ],
  };
}

function buildPlanActionSummary(plan) {
  const byAction = {
    'would-copy': 0,
    copied: 0,
    'would-skip-target-exists': 0,
    'skipped-target-exists': 0,
    'skipped-duplicate': 0,
    'skipped-invalid': 0,
    error: 0,
  };

  for (const item of plan) {
    byAction[item.action] = (byAction[item.action] || 0) + 1;
  }

  return {
    total: plan.length,
    byAction,
  };
}

function buildFontSplitConfig(input, outDir, args) {
  const css = {};
  if (normalizeOptionalString(args.fontFamily)) css.fontFamily = args.fontFamily;
  if (normalizeOptionalString(args.fontWeight)) css.fontWeight = args.fontWeight;
  if (normalizeOptionalString(args.fontStyle)) css.fontStyle = args.fontStyle;
  if (normalizeOptionalString(args.fontDisplay)) css.fontDisplay = args.fontDisplay;
  if (normalizeOptionalString(args.cssFileName)) css.fileName = args.cssFileName;

  const previewImage = {};
  if (normalizeOptionalString(args.previewText)) previewImage.text = args.previewText;
  if (normalizeOptionalString(args.previewName)) previewImage.name = args.previewName;

  const config = {
    input,
    outDir,
    silent: args.silent !== false,
  };

  if (Object.keys(css).length > 0) config.css = css;
  if (Object.keys(previewImage).length > 0) config.previewImage = previewImage;
  if (Array.isArray(args.subsets) && args.subsets.length > 0) config.subsets = args.subsets;

  const numericFields = [
    ['chunkSize', 'chunkSize', { integer: true }],
    ['chunkSizeTolerance', 'chunkSizeTolerance', { integer: false }],
    ['maxAllowSubsetsCount', 'maxAllowSubsetsCount', { integer: true }],
  ];
  for (const [argName, configName, numericOptions] of numericFields) {
    const value = normalizeOptionalPositiveNumberOption(args, argName, numericOptions);
    if (value !== undefined) config[configName] = value;
  }

  const booleanFields = [
    ['languageAreas', 'languageAreas'],
    ['testHtml', 'testHtml'],
    ['reporter', 'reporter'],
    ['multiThreads', 'multiThreads'],
    ['fontFeature', 'fontFeature'],
    ['reduceMins', 'reduceMins'],
    ['autoSubset', 'autoSubset'],
    ['subsetRemainChars', 'subsetRemainChars'],
  ];
  for (const [argName, configName] of booleanFields) {
    const value = normalizeBooleanOption(args, argName, undefined);
    if (value !== undefined) config[configName] = value;
  }

  if (normalizeOptionalString(args.renameOutputFont)) config.renameOutputFont = args.renameOutputFont;
  if (normalizeOptionalString(args.buildMode)) config.buildMode = args.buildMode;

  return config;
}

async function inspectInputFontFile(file) {
  const ext = path.extname(file).toLowerCase();
  const stat = await fs.stat(file);
  const relative = toRelativeWorkspacePath(file);
  const result = {
    path: relative,
    extension: ext,
    sizeBytes: stat.size,
  };

  try {
    let buffer = new Uint8Array(await fs.readFile(file));
    const container = detectFontContainer(buffer);
    let decompressedFrom = null;

    if (container === 'woff') {
      buffer = decompressWoff1(buffer);
      decompressedFrom = 'woff';
    } else if (container === 'woff2') {
      buffer = await decompressWoff2(buffer);
      decompressedFrom = 'woff2';
    }

    const identity = extractFontIdentity(buffer);
    const identityKey = buildFontIdentityKey(buffer);
    const identityKeyDetails = parseIdentityKey(identityKey);
    const glyphCount = getGlyphCount(buffer);

    return {
      ...result,
      status: identityKey ? 'valid' : 'valid-no-identity',
      container,
      normalizedContainer: detectFontContainer(buffer),
      decompressedFrom,
      glyphCount,
      identity,
      identityBasis: identityKeyDetails?.basis || null,
      identityKey,
    };
  } catch (error) {
    return {
      ...result,
      status: 'invalid',
      container: null,
      glyphCount: null,
      identity: null,
      identityBasis: null,
      identityKey: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildDirectoryLayoutSummary({ inputDir, allFiles, fontFiles }) {
  const topLevelDirectories = new Map();
  let rootFontCount = 0;
  let nestedFontCount = 0;

  for (const file of fontFiles) {
    const parts = path.relative(inputDir, file).split(path.sep).filter(Boolean);
    if (parts.length <= 1) {
      rootFontCount++;
      continue;
    }
    nestedFontCount++;
    const first = parts[0];
    topLevelDirectories.set(first, (topLevelDirectories.get(first) || 0) + 1);
  }

  const layoutKind = fontFiles.length === 0
    ? 'empty'
    : rootFontCount > 0 && nestedFontCount > 0
      ? 'mixed'
      : nestedFontCount > 0 ? 'nested' : 'flat';

  const recommendedGroupBy = layoutKind === 'nested' || layoutKind === 'mixed'
    ? 'source-dir'
    : 'font-family';

  return {
    layoutKind,
    rootFontCount,
    nestedFontCount,
    topLevelDirectoryCount: topLevelDirectories.size,
    topLevelDirectories: [...topLevelDirectories.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }))
      .slice(0, 50)
      .map(([name, fontCount]) => ({ name, fontCount })),
    unsupportedFileCount: allFiles.length - fontFiles.length,
    recommendedBatchOptions: {
      batchGroupBy: recommendedGroupBy,
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      skipMode: 'manifest',
    },
  };
}

function buildInputDirectoryDecision({
  inputDirRelative,
  layout,
  maxFiles,
  maxFilesHit,
  supportedFontCount,
  invalidFontCount,
  unsupportedFileDecision,
  recommendedBatchPreviewArgs,
}) {
  const safeOrganizationPreviewArgs = {
    inputDir: inputDirRelative,
    outputDir: 'organized-fonts',
    workflowPreset: 'safe-preview',
    maxFiles,
  };
  const baseMustInspectFields = [
    'inputCountGuide',
    'inputDirectoryDecision',
    'layout',
    'recommendedBatchPreviewArgs',
    'unsupportedFileDecision',
    'unsupportedFileSummary',
    'inspectionWarnings',
    'maxFilesHit',
  ];
  let recommendedMode;
  let preferredNextTool;
  let preferredNextActionId;
  let suggestedArgs;
  let directoryStructureRisk;
  let shortAnswer;
  let successCriteria;

  if (maxFilesHit) {
    recommendedMode = 'rerun-input-scan';
    preferredNextTool = 'inspect_font_inputs';
    preferredNextActionId = 'rerun-with-higher-maxFiles';
    suggestedArgs = {
      inputDir: inputDirRelative,
      maxFiles: '<higher-than-current>',
      includeFiles: false,
    };
    directoryStructureRisk = 'unknown-until-complete-scan';
    shortAnswer = 'The input scan was truncated; rerun with a higher maxFiles before trusting layout or counts.';
    successCriteria = 'Rerun input inspection until maxFilesHit is false before choosing a batch or organization route.';
  } else if (supportedFontCount === 0) {
    recommendedMode = 'no-supported-fonts';
    preferredNextTool = null;
    preferredNextActionId = null;
    suggestedArgs = null;
    directoryStructureRisk = 'none';
    shortAnswer = 'No supported font files were found in the scanned input directory.';
    successCriteria = 'Stop or choose a different inputDir; ignored files are reported but not extracted, copied, or split.';
  } else if (invalidFontCount > 0) {
    recommendedMode = 'review-invalid-fonts';
    preferredNextTool = 'inspect_font_inputs';
    preferredNextActionId = 'review-invalid-fonts';
    suggestedArgs = null;
    directoryStructureRisk = layout.layoutKind === 'mixed' ? 'high' : 'medium';
    shortAnswer = 'Supported-extension files were found, but at least one could not be parsed as a valid font; review invalidFonts before batch writing.';
    successCriteria = 'Review invalidFonts and decide whether to fix, remove, ignore, or preserve invalid font-like files before a real batch write.';
  } else if (layout.layoutKind === 'mixed') {
    recommendedMode = 'organize-safe-preview-first';
    preferredNextTool = 'organize_font_directory';
    preferredNextActionId = 'preview-organization-layout';
    suggestedArgs = safeOrganizationPreviewArgs;
    directoryStructureRisk = 'high';
    shortAnswer = 'Fonts appear both at the input root and in nested folders; run a no-write organization preview before choosing direct batch output or copy-only staging.';
    successCriteria = 'Run organize_font_directory safe-preview, inspect sourceLayoutMismatchSummary, layoutDecision, organizationWarnings, and recommendedBatchPreviewArgs, then choose original input or copy-only staging.';
  } else {
    recommendedMode = 'batch-safe-preview-first';
    preferredNextTool = 'split_font_batch';
    preferredNextActionId = 'preview-batch-split-original-layout';
    suggestedArgs = recommendedBatchPreviewArgs;
    directoryStructureRisk = layout.layoutKind === 'nested' ? 'medium' : 'low';
    shortAnswer = 'The input layout can be previewed directly with split_font_batch safe-preview; copy-only organization is optional if the user wants a cleaner staging tree.';
    successCriteria = 'Run split_font_batch safe-preview, inspect planned paths, batchWarnings, dedupeDecisionSummary, maxFilesHit, unsupported file summaries, and errors before any reviewed write.';
  }

  const nonIntuitiveBehavior = [
    'inspect_font_inputs never writes output; this decision is routing guidance, not proof that splitting or organization succeeded.',
    'recommendedBatchPreviewArgs is safe-preview only and preserves the current scan maxFiles; a later reviewed-write call is still required to create split output.',
    'safeOrganizationPreviewArgs is also no-write; organize_font_directory only copies files when rerun with dryRun:false or workflowPreset reviewed-write.',
  ];
  if (unsupportedFileDecision?.hasArchives) {
    nonIntuitiveBehavior.push('Archive files are reported for awareness but are not extracted, copied, or split.');
  }

  return {
    summaryType: 'input-directory-decision',
    appliesToTool: 'inspect_font_inputs',
    recommendedMode,
    preferredNextTool,
    preferredNextActionId,
    shortAnswer,
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    sourceFilesPreserved: true,
    layoutKind: layout.layoutKind,
    directoryStructureRisk,
    recommendedBatchGroupBy: layout.recommendedBatchOptions.batchGroupBy,
    safeBatchPreviewArgs: recommendedBatchPreviewArgs,
    safeOrganizationPreviewArgs,
    suggestedArgs,
    mustInspectFields: baseMustInspectFields,
    successCriteria,
    nonIntuitiveBehavior,
    evidence: {
      maxFiles,
      maxFilesHit,
      supportedFontCount,
      invalidFontCount,
      unsupportedFileCount: unsupportedFileDecision?.totalUnsupportedFileCount ?? 0,
      hasArchives: unsupportedFileDecision?.hasArchives === true,
      topLevelDirectoryCount: layout.topLevelDirectoryCount,
      rootFontCount: layout.rootFontCount,
      nestedFontCount: layout.nestedFontCount,
    },
  };
}

function getOrganizationDedupeKey(entry, dedupeMode) {
  if (dedupeMode === 'none') return `unique:${entry.file}`;
  const ext = path.extname(entry.file).toLowerCase();
  if (dedupeMode === 'same-path') return `path:${entry.file.slice(0, -ext.length)}`;
  return entry.identityKey || `path:${entry.file.slice(0, -ext.length)}`;
}

function dedupeOrganizationEntries(entries, dedupeMode) {
  if (dedupeMode === 'none') {
    return {
      selected: [...entries],
      duplicates: [],
    };
  }

  const byKey = new Map();
  const duplicates = [];
  for (const entry of entries) {
    const key = getOrganizationDedupeKey(entry, dedupeMode);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }
    if (compareBatchDedupeRepresentative(entry.file, existing.file) < 0) {
      duplicates.push({
        path: existing.path,
        duplicateOf: entry.path,
        identityKey: key,
      });
      byKey.set(key, entry);
    } else {
      duplicates.push({
        path: entry.path,
        duplicateOf: existing.path,
        identityKey: key,
      });
    }
  }

  return {
    selected: [...byKey.values()].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })),
    duplicates,
  };
}

async function resolveOrganizationGroupName({ entry, inputDir, groupingMode }) {
  if (entry.metadataParsed === false) {
    const relativeToInput = path.relative(inputDir, entry.file);
    const segments = relativeToInput.split(path.sep).filter(Boolean);
    if (groupingMode === 'font-family') return path.basename(entry.file, path.extname(entry.file));
    return segments.length > 1 ? segments[0] : path.basename(entry.file, path.extname(entry.file));
  }
  if (entry.status === 'invalid') {
    const relativeToInput = path.relative(inputDir, entry.file);
    const segments = relativeToInput.split(path.sep).filter(Boolean);
    return segments.length > 1 ? segments[0] : path.basename(entry.file, path.extname(entry.file));
  }
  return resolveBatchFamilyDirName({ file: entry.file, inputDir, groupingMode });
}

function normalizeTargetBaseName(file) {
  return sanitizeDirName(path.basename(file, path.extname(file))) || 'font';
}

async function chooseOrganizationTargetPath({
  outputDir,
  groupName,
  entry,
  namingMode,
  usedTargets,
  overwriteExisting,
}) {
  const extension = path.extname(entry.file);
  const baseName = normalizeTargetBaseName(entry.file);
  const safeGroupName = sanitizeDirName(groupName) || 'Fonts';
  const targetDir = path.join(outputDir, safeGroupName);
  const inputRelativePath = entry.path;
  const makeTarget = (name) => {
    const targetPath = path.join(targetDir, name);
    const relativeTarget = path.relative(outputDir, targetPath).replaceAll(path.sep, '/');
    return { targetPath, relativeTarget };
  };

  if (namingMode === 'source-suffix') {
    const suffix = buildSourceSuffix(inputRelativePath, extension);
    const target = makeTarget(`${sanitizeDirName(`${baseName}--${suffix}`)}${extension}`);
    usedTargets.add(target.relativeTarget);
    return target;
  }

  if (namingMode === 'plain') {
    const target = makeTarget(`${baseName}${extension}`);
    usedTargets.add(target.relativeTarget);
    return target;
  }

  let index = 0;
  while (true) {
    const candidate = `${appendCollisionSuffix(baseName, index)}${extension}`;
    const target = makeTarget(candidate);
    const exists = await fileExists(target.targetPath);
    if (!usedTargets.has(target.relativeTarget) && (overwriteExisting || !exists)) {
      usedTargets.add(target.relativeTarget);
      return target;
    }
    index++;
  }
}

function buildOrganizationManifest({ inputDirRelative, outputDirRelative, options, result }) {
  return {
    manifestVersion: ORGANIZATION_MANIFEST_VERSION,
    toolVersion: PACKAGE_VERSION,
    inputDir: inputDirRelative,
    outputDir: outputDirRelative,
    options,
    generatedAt: new Date().toISOString(),
    summary: {
      scannedFileCount: result.scannedFileCount,
      supportedFontCount: result.supportedFontCount,
      copiedCount: result.copiedCount,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
      safetySummary: result.safetySummary,
      sourceSafetyDecision: result.sourceSafetyDecision,
    },
    entries: result.plan
      .filter((item) => item.action === 'copied' || item.action === 'would-copy' || item.action === 'skipped-target-exists')
      .map((item) => ({
        source: item.source,
        target: item.target,
        targetPath: item.targetPath,
        groupName: item.groupName,
        action: item.action,
      })),
  };
}

async function writeOrganizationManifest(outputDir, manifest) {
  await fs.writeFile(path.join(outputDir, ORGANIZATION_MANIFEST_FILE_NAME), JSON.stringify(manifest, null, 2));
}

function inspectOversizedKern(buffer, thresholdRatio = 0.8) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);
  if (magic === 0x774F4646 || magic === 0x774F4632 || magic === 0x74746366) {
    return {
      supported: false,
      hasKern: false,
      kernBytes: 0,
      fontBytes: buffer.byteLength,
      ratio: 0,
      thresholdRatio,
      oversized: false,
    };
  }

  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = String.fromCharCode(buffer[off], buffer[off + 1], buffer[off + 2], buffer[off + 3]);
    if (tag !== 'kern') continue;
    const kernBytes = view.getUint32(off + 12);
    const ratio = buffer.byteLength > 0 ? kernBytes / buffer.byteLength : 0;
    return {
      supported: true,
      hasKern: true,
      kernBytes,
      fontBytes: buffer.byteLength,
      ratio,
      thresholdRatio,
      oversized: ratio >= thresholdRatio,
    };
  }

  return {
    supported: true,
    hasKern: false,
    kernBytes: 0,
    fontBytes: buffer.byteLength,
    ratio: 0,
    thresholdRatio,
    oversized: false,
  };
}

function stripOversizedKern(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);
  if (magic === 0x774F4646 || magic === 0x774F4632 || magic === 0x74746366) {
    return { buffer, stripped: false };
  }

  const numTables = view.getUint16(4);
  let kernIndex = -1;
  let kernLength = 0;

  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = String.fromCharCode(buffer[off], buffer[off + 1], buffer[off + 2], buffer[off + 3]);
    if (tag === 'kern') {
      kernIndex = i;
      kernLength = view.getUint32(off + 12);
      break;
    }
  }

  if (kernIndex === -1 || kernLength < buffer.byteLength * 0.8) {
    return { buffer, stripped: false };
  }

  // Rebuild sfnt without kern table
  const newNumTables = numTables - 1;
  const headerSize = 12 + newNumTables * 16;
  const tables = [];

  for (let i = 0; i < numTables; i++) {
    if (i === kernIndex) continue;
    const off = 12 + i * 16;
    const tableOffset = view.getUint32(off + 8);
    const tableLength = view.getUint32(off + 12);
    tables.push({
      tag: buffer.slice(off, off + 4),
      checksum: view.getUint32(off + 4),
      data: buffer.slice(tableOffset, tableOffset + tableLength),
    });
  }

  let totalSize = headerSize;
  for (const t of tables) {
    totalSize += t.data.byteLength;
    totalSize += (4 - (totalSize % 4)) % 4;
  }

  const result = new Uint8Array(totalSize);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, magic);
  rv.setUint16(4, newNumTables);
  let sr = 1, es = 0;
  while (sr * 2 <= newNumTables) { sr *= 2; es++; }
  sr *= 16;
  rv.setUint16(6, sr);
  rv.setUint16(8, es);
  rv.setUint16(10, newNumTables * 16 - sr);

  let dataOffset = headerSize;
  for (let i = 0; i < tables.length; i++) {
    const recOff = 12 + i * 16;
    result.set(tables[i].tag, recOff);
    rv.setUint32(recOff + 4, tables[i].checksum);
    rv.setUint32(recOff + 8, dataOffset);
    rv.setUint32(recOff + 12, tables[i].data.byteLength);
    result.set(tables[i].data, dataOffset);
    dataOffset += tables[i].data.byteLength;
    dataOffset += (4 - (dataOffset % 4)) % 4;
  }

  return { buffer: result, stripped: true };
}

async function writeGeneratedFiles(baseDir, generated) {
  for (const item of generated) {
    const outputPath = path.resolve(baseDir, item.name);
    if (!isInside(baseDir, outputPath)) {
      throw new Error(`Generated file path escapes output directory: ${item.name}`);
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, item.data);
  }
}

async function emitSmallGlyphFallback({ inputBytes, splitDir, fontFamily, fontBaseName, args, reason = 'too few glyphs for useful subsetting' }) {
  const woff2Name = `${fontBaseName}.woff2`;
  const cssName = args.cssFileName || 'result.css';
  const css = [
    '@font-face {',
    `  font-family: ${JSON.stringify(fontFamily)};`,
    `  src: url("./${woff2Name}") format("woff2");`,
    args.fontWeight ? `  font-weight: ${args.fontWeight};` : null,
    args.fontStyle ? `  font-style: ${args.fontStyle};` : null,
    `  font-display: ${args.fontDisplay || 'swap'};`,
    '}',
    '',
  ].filter(Boolean).join('\n');

  const generated = [
    { name: woff2Name, data: await compressWoff2(inputBytes) },
    { name: cssName, data: Buffer.from(css, 'utf8') },
  ];

  if (args.testHtml) {
    const previewText = args.previewText || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789';
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${fontFamily}</title>
  <link rel="stylesheet" href="./${cssName}" />
  <style>body { font-family: ${JSON.stringify(fontFamily)}, sans-serif; padding: 24px; white-space: pre-wrap; }</style>
</head>
<body>${previewText.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</body>
</html>`;
    generated.push({ name: 'index.html', data: Buffer.from(html, 'utf8') });
  }

  await writeGeneratedFiles(splitDir, generated);
  return { generated, skipped: true, reason };
}

async function clearSplitDirForCopyOriginal(splitDir) {
  await fs.rm(splitDir, { recursive: true, force: true });
  await fs.mkdir(splitDir, { recursive: true });
}

async function ensureFontFile(fontPath) {
  const resolved = await resolveWorkspacePath(fontPath, { mustExist: true });
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) throw new Error(`Font path is not a file: ${fontPath}`);
  const ext = path.extname(resolved).toLowerCase();
  if (!FONT_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported font extension ${ext || '(none)'} for ${fontPath}`);
  }
  return resolved;
}

export async function splitFont(args) {
  const startedAt = Date.now();
  const processingOptions = normalizeProcessingOptions(args);
  const input = await ensureFontFile(args.fontPath);
  const inputStat = await fs.stat(input);
  const inputRelativePath = toRelativeWorkspacePath(input);
  const fontBaseName = path.basename(input, path.extname(input));
  const fontFileName = path.basename(input);
  const splitDirName = args.splitDirName || fontBaseName;
  const copiedOriginalFileName = args.copiedOriginalFileName || fontFileName;
  let inputBytes = new Uint8Array(await fs.readFile(input));
  const inputFormat = path.extname(input).toLowerCase().slice(1) || 'unknown';

  let decompressedFrom = null;
  const magic = new DataView(inputBytes.buffer, inputBytes.byteOffset, 4).getUint32(0);
  if (magic === 0x774F4646) {
    inputBytes = decompressWoff1(inputBytes);
    decompressedFrom = 'woff';
  } else if (magic === 0x774F4632) {
    inputBytes = await decompressWoff2(inputBytes);
    decompressedFrom = 'woff2';
  }

  const kernInspection = inspectOversizedKern(inputBytes);
  let oversizedKernStripped = false;
  if (processingOptions.oversizedKernAction === 'strip' && kernInspection.oversized) {
    const kernNormalized = stripOversizedKern(inputBytes);
    inputBytes = kernNormalized.buffer;
    oversizedKernStripped = kernNormalized.stripped;
  }

  const familyName = args.fontFamily || extractFontFamily(inputBytes) || fontBaseName;
  const safeFamilyName = sanitizeDirName(familyName);
  const groupName = args.groupName || safeFamilyName;

  const rootDir = await resolveWorkspacePath(
    args.outDir || path.join('split-output', groupName),
  );
  const splitDir = path.join(rootDir, splitDirName);
  await fs.mkdir(splitDir, { recursive: true });

  const destFontPath = path.join(rootDir, copiedOriginalFileName);
  await fs.copyFile(input, destFontPath);

  const before = new Set((await summarizeFiles(rootDir)).map((file) => file.path));

  const glyphCount = getGlyphCount(inputBytes);
  let generated;
  let skipped = false;
  let skipReason = null;
  let outputMode = 'subset';
  let splitFailureFallbackApplied = false;
  let splitFailureMessage = null;

  const shouldEmitSmallGlyphFallback = (
    glyphCount > 0
    && glyphCount <= processingOptions.smallGlyphThreshold
    && processingOptions.smallGlyphAction === 'single-woff2'
  );
  const shouldCopyOriginalSmallGlyph = (
    glyphCount > 0
    && glyphCount <= processingOptions.smallGlyphThreshold
    && processingOptions.smallGlyphAction === 'copy-original'
  );

  if (shouldCopyOriginalSmallGlyph) {
    await clearSplitDirForCopyOriginal(splitDir);
    generated = [];
    skipped = true;
    skipReason = 'small glyph copy-original explicitly enabled';
    outputMode = 'copy-original';
  } else if (shouldEmitSmallGlyphFallback) {
    const fallback = await emitSmallGlyphFallback({
      inputBytes,
      splitDir,
      fontFamily: familyName,
      fontBaseName,
      args,
      reason: 'small glyph fallback explicitly enabled',
    });
    generated = fallback.generated;
    skipped = fallback.skipped;
    skipReason = fallback.reason;
    outputMode = 'single-woff2';
  } else {
    const config = buildFontSplitConfig(inputBytes, splitDir, args);
    const wasm = await getWasmRuntime();
    try {
      generated = (await fontSplit(config, wasm.WasiHandle, { logger: () => {} })).filter(Boolean);
      await writeGeneratedFiles(splitDir, generated);
    } catch (error) {
      splitFailureMessage = error instanceof Error ? error.message : String(error);
      if (processingOptions.splitFailureAction === 'single-woff2') {
        const fallback = await emitSmallGlyphFallback({
          inputBytes,
          splitDir,
          fontFamily: familyName,
          fontBaseName,
          args,
          reason: 'split failure fallback explicitly enabled',
        });
        generated = fallback.generated;
        skipped = fallback.skipped;
        skipReason = fallback.reason;
        outputMode = 'single-woff2';
        splitFailureFallbackApplied = true;
      } else {
        throw error;
      }
    }
  }

  const usedFallback = outputMode === 'single-woff2';
  const performedSplit = outputMode === 'subset';
  const resultType = classifyResultType({ outputMode, splitFailureFallbackApplied, skipReason });
  const warnings = buildWarnings({
    decompressedFrom,
    oversizedKernDetected: kernInspection.oversized,
    oversizedKernStripped,
    usedFallback,
    skipped,
    skipReason,
  });
  const effectiveConfig = buildEffectiveConfigSnapshot(args, processingOptions);

  const files = await summarizeFiles(rootDir);
  const createdFiles = files.filter((file) => !before.has(file.path));

  const result = {
    ok: true,
    input: inputRelativePath,
    fontFamily: familyName,
    groupName,
    outDir: toRelativeWorkspacePath(rootDir),
    splitDir: toRelativeWorkspacePath(splitDir),
    durationMs: Date.now() - startedAt,
    generatedFileCount: generated.length,
    glyphCount,
    skipped,
    skipReason,
    outputMode,
    resultType,
    performedSplit,
    usedFallback,
    copiedOriginalPath: toRelativeWorkspacePath(destFontPath),
    warnings,
    decompressedFrom,
    oversizedKernDetected: kernInspection.oversized,
    oversizedKernStripped,
    splitFailureFallbackApplied,
    fileCount: files.length,
    createdFileCount: createdFiles.length,
    files,
    createdFiles,
    processing: {
      inputFormat,
      decompressedFrom,
      oversizedKern: {
        ...kernInspection,
        action: processingOptions.oversizedKernAction,
        stripped: oversizedKernStripped,
      },
      smallGlyph: {
        glyphCount,
        threshold: processingOptions.smallGlyphThreshold,
        action: processingOptions.smallGlyphAction,
        matchedThreshold: glyphCount > 0 && glyphCount <= processingOptions.smallGlyphThreshold,
        downgraded: resultType === 'single-woff2-small-glyph',
        skippedSplit: resultType === 'copy-original-small-glyph',
      },
      splitFailure: {
        action: processingOptions.splitFailureAction,
        fallbackApplied: splitFailureFallbackApplied,
        failureMessage: splitFailureMessage,
      },
    },
  };

  const manifest = buildSplitManifest({
    toolVersion: PACKAGE_VERSION,
    inputRelativePath,
    inputStat,
    groupName,
    outDirRelative: result.outDir,
    splitDirRelative: result.splitDir,
    effectiveConfig,
    result,
  });
  await writeSplitManifest(splitDir, manifest);
  result.manifestPath = toRelativeWorkspacePath(manifestPathForSplitDir(splitDir));
  result.manifestWritten = true;

  return result;
}

export async function splitFontBatch(args = {}) {
  const presetContext = applyWorkflowPreset(args, 'batch');
  const effectiveArgs = presetContext.args;
  const inputDir = await resolveWorkspacePath(effectiveArgs.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${effectiveArgs.inputDir}`);

  const batchOptions = normalizeBatchOptions(effectiveArgs);
  const processingOptions = normalizeProcessingOptions(effectiveArgs);
  const includeResults = normalizeBooleanOption(effectiveArgs, 'includeResults', true);
  const dryRun = normalizeBooleanOption(effectiveArgs, 'dryRun', false);
  const outputRoot = effectiveArgs.outputRoot || 'split-output';
  const outputRootName = path.basename(outputRoot);
  const resolvedOutputRoot = await resolveWorkspacePath(outputRoot);
  const outputTreeInsideInputTree = isInside(inputDir, resolvedOutputRoot);

  const maxFiles = normalizePositiveNumberOption(effectiveArgs, 'maxFiles', 5000, { integer: true, max: 50000 });
  const limit = normalizePositiveNumberOption(effectiveArgs, 'limit', 20, { integer: true, max: 50000 });
  const inputScan = await scanFilesRecursive(inputDir, {
    maxFiles,
    excludeDirs: [outputRootName],
  });
  const allFiles = inputScan.files;
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const unsupportedFileSummary = buildUnsupportedFileSummary(allFiles);
  const unsupportedFileDecision = buildUnsupportedFileDecision(unsupportedFileSummary);
  const inputCountGuide = buildInputCountGuide({
    appliesToTool: 'split_font_batch',
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    unsupportedFileCount: unsupportedFileSummary.total,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    supportedFieldName: 'discoveredFontCount',
    unsupportedFieldName: 'unsupportedFileSummary.total',
    unsupportedFileSummary,
    unsupportedFileDecision,
  });

  let deduplicated;
  let identityKeyMissingCount = 0;
  let pathFallbackCount = 0;
  const identityEvidenceItems = [];
  const duplicateEvidenceItems = [];
  if (batchOptions.batchDedupeMode === 'none') {
    deduplicated = [...fontFiles];
  } else if (batchOptions.batchDedupeMode === 'same-path') {
    const byBaseName = new Map();
    for (const file of fontFiles) {
      const ext = path.extname(file).toLowerCase();
      const base = file.slice(0, -ext.length);
      const key = `path:${base}`;
      identityEvidenceItems.push({ identityKey: key });
      const existing = byBaseName.get(base);
      if (!existing || compareBatchDedupeRepresentative(file, existing) < 0) {
        if (existing) {
          duplicateEvidenceItems.push({
            path: toRelativeWorkspacePath(existing),
            duplicateOf: toRelativeWorkspacePath(file),
            identityKey: key,
          });
          logBatchDecision(batchOptions.debugBatchDecisions, 'dedupe-replace', {
            mode: batchOptions.batchDedupeMode,
            winner: toRelativeWorkspacePath(file),
            loser: toRelativeWorkspacePath(existing),
            reason: 'same-path-priority',
          });
        }
        byBaseName.set(base, file);
      } else {
        duplicateEvidenceItems.push({
          path: toRelativeWorkspacePath(file),
          duplicateOf: toRelativeWorkspacePath(existing),
          identityKey: key,
        });
        logBatchDecision(batchOptions.debugBatchDecisions, 'dedupe-drop', {
          mode: batchOptions.batchDedupeMode,
          winner: toRelativeWorkspacePath(existing),
          loser: toRelativeWorkspacePath(file),
          reason: 'same-path-priority',
        });
      }
    }
    deduplicated = [...byBaseName.values()];
  } else {
    const byIdentity = new Map();
    for (const file of fontFiles) {
      const ext = path.extname(file).toLowerCase();
      const identityKey = await buildBatchDedupeIdentity(file);
      if (!identityKey) {
        identityKeyMissingCount++;
        pathFallbackCount++;
      }
      const key = identityKey || `path:${file.slice(0, -ext.length)}`;
      identityEvidenceItems.push({ identityKey: key });
      const existing = byIdentity.get(key);
      if (!existing || compareBatchDedupeRepresentative(file, existing) < 0) {
        if (existing) {
          duplicateEvidenceItems.push({
            path: toRelativeWorkspacePath(existing),
            duplicateOf: toRelativeWorkspacePath(file),
            identityKey: key,
          });
          logBatchDecision(batchOptions.debugBatchDecisions, 'dedupe-replace', {
            mode: batchOptions.batchDedupeMode,
            winner: toRelativeWorkspacePath(file),
            loser: toRelativeWorkspacePath(existing),
            identityKey: key,
            reason: identityKey ? 'font-identity-priority' : 'path-fallback-priority',
          });
        }
        byIdentity.set(key, file);
      } else {
        duplicateEvidenceItems.push({
          path: toRelativeWorkspacePath(file),
          duplicateOf: toRelativeWorkspacePath(existing),
          identityKey: key,
        });
        logBatchDecision(batchOptions.debugBatchDecisions, 'dedupe-drop', {
          mode: batchOptions.batchDedupeMode,
          winner: toRelativeWorkspacePath(existing),
          loser: toRelativeWorkspacePath(file),
          identityKey: key,
          reason: identityKey ? 'font-identity-priority' : 'path-fallback-priority',
        });
      }
    }
    deduplicated = [...byIdentity.values()];
  }

  const deduplicatedCount = deduplicated.length;
  const skippedCount = fontFiles.length - deduplicatedCount;
  const dedupeDecisionSummary = buildDedupeDecisionSummary({
    appliesToTool: 'split_font_batch',
    requestedMode: batchOptions.batchDedupeMode,
    effectiveMode: batchOptions.batchDedupeMode,
    inputFontCount: fontFiles.length,
    deduplicatedCount,
    skippedDuplicateCount: skippedCount,
    identityKeyMissingCount,
    pathFallbackCount,
    identityEvidenceItems,
    duplicateEvidenceItems,
  });
  const selected = deduplicated.slice(0, limit);

  const results = [];
  const planned = [];
  const errors = [];
  const processingSummary = {
    decompressedInputs: 0,
    oversizedKernDetected: 0,
    oversizedKernStripped: 0,
    smallGlyphDowngrades: 0,
    smallGlyphCopyOriginals: 0,
    failureFallbacks: 0,
    subsetOutputs: 0,
    singleWoff2Outputs: 0,
    copyOriginalOutputs: 0,
  };
  let skippedExisting = 0;
  let skippedByManifest = 0;
  let reprocessedBecauseSourceChanged = 0;
  let reprocessedBecauseOptionsChanged = 0;
  let wouldProcessCount = 0;
  const batchOutputNameReservations = new Map();

  for (const file of selected) {
    const relative = toRelativeWorkspacePath(file);
    try {
      const groupName = sanitizeDirName(await resolveBatchFamilyDirName({
        file,
        inputDir,
        groupingMode: batchOptions.batchGroupBy,
      }));
      const outDir = path.join(outputRoot, groupName);
      const fontBaseName = path.basename(file, path.extname(file));
      const fontFileName = path.basename(file);
      const resolvedOutDir = await resolveWorkspacePath(outDir);
      let batchOutputNames;
      if (batchOptions.batchNamingMode === 'plain') {
        batchOutputNames = {
          splitDirName: fontBaseName,
          copiedOriginalFileName: fontFileName,
        };
      } else if (batchOptions.batchNamingMode === 'source-suffix') {
        batchOutputNames = buildBatchOutputNames({
          inputRelativePath: relative,
          fontBaseName,
          fontFileName,
        });
      } else {
        const reservationKey = path.resolve(resolvedOutDir);
        const reservedNames = batchOutputNameReservations.get(reservationKey) || new Set();
        batchOutputNames = await resolveStableBatchOutputNames({
          resolvedOutDir,
          fontBaseName,
          fontFileName,
          inputRelativePath: relative,
          reservedNames,
        });
        reservedNames.add(batchOutputNames.splitDirName);
        batchOutputNameReservations.set(reservationKey, reservedNames);
      }
      logBatchDecision(batchOptions.debugBatchDecisions, 'naming', {
        mode: batchOptions.batchNamingMode,
        input: relative,
        groupName,
        splitDirName: batchOutputNames.splitDirName,
        copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
      });

      const inputStat = await fs.stat(file);
      const effectiveConfig = buildEffectiveConfigSnapshot({ ...effectiveArgs, ...batchOptions, groupName }, processingOptions);
      const skipDecision = await shouldSkipExistingOutput({
        skipMode: batchOptions.skipMode,
        resolvedOutDir,
        splitDirName: batchOutputNames.splitDirName,
        inputRelativePath: relative,
        inputStat,
        effectiveConfig,
        toolVersion: PACKAGE_VERSION,
      });
      logBatchDecision(batchOptions.debugBatchDecisions, 'skip-check', {
        mode: batchOptions.skipMode,
        input: relative,
        splitDirName: batchOutputNames.splitDirName,
        reason: skipDecision.reason,
        shouldSkip: skipDecision.shouldSkip,
      });

      if (skipDecision.shouldSkip) {
        skippedExisting++;
        if (skipDecision.reason === 'manifest') skippedByManifest++;
        if (dryRun) {
          planned.push({
            input: relative,
            groupName,
            outDir: toRelativeWorkspacePath(resolvedOutDir),
            splitDir: toRelativeWorkspacePath(path.join(resolvedOutDir, batchOutputNames.splitDirName)),
            copiedOriginalPath: toRelativeWorkspacePath(path.join(resolvedOutDir, batchOutputNames.copiedOriginalFileName)),
            splitDirName: batchOutputNames.splitDirName,
            copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
            wouldProcess: false,
            skipReason: skipDecision.reason,
          });
        }
        effectiveArgs.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'skipped' });
        continue;
      }
      if (skipDecision.reason === 'stale-manifest' && skipDecision.manifest) {
        const sameSource = skipDecision.manifest.source?.input === relative
          && skipDecision.manifest.source?.sizeBytes === inputStat.size
          && skipDecision.manifest.source?.mtimeMs === inputStat.mtimeMs;
        if (sameSource) {
          reprocessedBecauseOptionsChanged++;
        } else {
          reprocessedBecauseSourceChanged++;
        }
      }

      if (dryRun) {
        wouldProcessCount++;
        planned.push({
          input: relative,
          groupName,
          outDir: toRelativeWorkspacePath(resolvedOutDir),
          splitDir: toRelativeWorkspacePath(path.join(resolvedOutDir, batchOutputNames.splitDirName)),
          copiedOriginalPath: toRelativeWorkspacePath(path.join(resolvedOutDir, batchOutputNames.copiedOriginalFileName)),
          splitDirName: batchOutputNames.splitDirName,
          copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
          wouldProcess: true,
          skipReason: skipDecision.reason,
        });
        effectiveArgs.onProgress?.({ current: planned.length + errors.length, total: selected.length, file: relative, status: 'planned' });
        continue;
      }

      const result = await splitFont({
        ...effectiveArgs,
        fontPath: relative,
        outDir,
        groupName,
        splitDirName: batchOutputNames.splitDirName,
        copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
        batchNamingMode: batchOptions.batchNamingMode,
        batchDedupeMode: batchOptions.batchDedupeMode,
      });
      results.push(result);
      if (result.decompressedFrom) processingSummary.decompressedInputs++;
      if (result.oversizedKernDetected) processingSummary.oversizedKernDetected++;
      if (result.oversizedKernStripped) processingSummary.oversizedKernStripped++;
      if (result.splitFailureFallbackApplied) processingSummary.failureFallbacks++;
      if (result.outputMode === 'single-woff2') {
        processingSummary.singleWoff2Outputs++;
        if (result.processing?.smallGlyph?.downgraded) processingSummary.smallGlyphDowngrades++;
      } else if (result.outputMode === 'copy-original') {
        processingSummary.copyOriginalOutputs++;
        if (result.processing?.smallGlyph?.skippedSplit) processingSummary.smallGlyphCopyOriginals++;
      } else {
        processingSummary.subsetOutputs++;
      }
      effectiveArgs.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'done' });
    } catch (error) {
      resetWasmRuntime();
      logBatchDecision(batchOptions.debugBatchDecisions, 'error', {
        input: relative,
        message: error instanceof Error ? error.message : String(error),
      });
      errors.push({ file: relative, error: error instanceof Error ? error.message : String(error) });
      effectiveArgs.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'error' });
      if (batchOptions.batchErrorMode === 'fail-fast') {
        const fastFailSafetySummary = buildBatchSafetySummary({
          dryRun,
          selectedCount: selected.length,
          outputTreeInsideInputTree,
        });
        const fastFailInputDirRelative = toRelativeWorkspacePath(inputDir);
        const fastFailSourceSafetyDecision = buildSourceSafetyDecision({
          appliesToTool: 'split_font_batch',
          safetySummary: fastFailSafetySummary,
          inputPath: fastFailInputDirRelative,
          outputPath: outputRoot,
          outputPathRole: 'outputRoot',
          requiresOutputAudit: fastFailSafetySummary.writesOutputTree,
        });
        throw buildBatchError({
          mode: batchOptions.batchErrorMode,
          errors,
          summary: {
            inputDir: fastFailInputDirRelative,
            outputRoot,
            safetySummary: fastFailSafetySummary,
            sourceSafetyDecision: fastFailSourceSafetyDecision,
            sourceDestructive: fastFailSafetySummary.sourceDestructive,
            sourceFilesPreserved: fastFailSafetySummary.sourceFilesPreserved,
            writesSourceTree: fastFailSafetySummary.writesSourceTree,
            writesOutputTree: fastFailSafetySummary.writesOutputTree,
            outputTreeInsideInputTree: fastFailSafetySummary.outputTreeInsideInputTree,
            mayOverwriteOutputTree: fastFailSafetySummary.mayOverwriteOutputTree,
            dryRun,
            inputCountGuide,
            discoveredFontCount: fontFiles.length,
            deduplicatedCount,
            selectedFontCount: selected.length,
            processedFontCount: results.length,
            skippedExisting,
          },
        });
      }
    }
  }

  const batchWarnings = buildBatchWarnings({
    dryRun,
    includeResults,
    inputScanTruncated: inputScan.truncated,
    maxFiles,
    deduplicatedCount,
    selectedCount: selected.length,
    skippedExisting,
    errorCount: errors.length,
    batchErrorMode: batchOptions.batchErrorMode,
    outputTreeInsideInputTree,
  });
  const safetySummary = buildBatchSafetySummary({
    dryRun,
    selectedCount: selected.length,
    outputTreeInsideInputTree,
  });
  const inputDirRelative = toRelativeWorkspacePath(inputDir);
  const sourceSafetyDecision = buildSourceSafetyDecision({
    appliesToTool: 'split_font_batch',
    safetySummary,
    inputPath: inputDirRelative,
    outputPath: outputRoot,
    outputPathRole: 'outputRoot',
    requiresOutputAudit: safetySummary.writesOutputTree,
  });
  const recommendedNextActions = buildBatchNextActions({
    dryRun,
    inputDirRelative,
    outputRoot,
    effectiveArgs,
    batchOptions,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    selectedFontCount: selected.length,
    errorCount: errors.length,
    writesOutputTree: safetySummary.writesOutputTree,
  });
  const batchDecision = buildBatchDecision({
    dryRun,
    inputDirRelative,
    outputRoot,
    effectiveArgs,
    batchOptions,
    maxFilesHit: inputScan.truncated,
    discoveredFontCount: fontFiles.length,
    selectedFontCount: selected.length,
    processedFontCount: results.length,
    skippedExisting,
    errorCount: errors.length,
    safetySummary,
  });
  const batchPolicySummary = buildBatchPolicySummary({
    appliesToTool: 'split_font_batch',
    workflowPreset: batchOptions.workflowPreset,
    values: {
      batchGroupBy: batchOptions.batchGroupBy,
      batchNamingMode: batchOptions.batchNamingMode,
      batchDedupeMode: batchOptions.batchDedupeMode,
      batchErrorMode: batchOptions.batchErrorMode,
    },
    availableInspectFields: [
      'batchGroupBy',
      'batchNamingMode',
      'batchDedupeMode',
      'batchErrorMode',
      'planned',
      'batchWarnings',
      'skippedDuplicates',
      'dedupeDecisionSummary',
      'errorCount',
      'errors',
      'batchDecision',
      'recommendedNextActions',
      'outputTreeInsideInputTree',
    ],
  });
  const configurationTrace = buildConfigurationTrace({
    appliesToTool: 'split_font_batch',
    workflowPreset: batchOptions.workflowPreset,
    rawDefaults: RAW_BATCH_OPTION_DEFAULTS,
    presetDefaults: presetContext.presetDefaults,
    explicitArgs: presetContext.explicitArgs,
    effectiveValues: {
      dryRun,
      includeResults,
      skipMode: batchOptions.skipMode,
      batchGroupBy: batchOptions.batchGroupBy,
      batchNamingMode: batchOptions.batchNamingMode,
      batchDedupeMode: batchOptions.batchDedupeMode,
      batchErrorMode: batchOptions.batchErrorMode,
      splitFailureAction: processingOptions.splitFailureAction,
    },
  });

  const response = {
    ok: true,
    inputDir: inputDirRelative,
    outputRoot,
    workflowPreset: batchOptions.workflowPreset,
    safetySummary,
    sourceSafetyDecision,
    sourceDestructive: safetySummary.sourceDestructive,
    sourceFilesPreserved: safetySummary.sourceFilesPreserved,
    writesSourceTree: safetySummary.writesSourceTree,
    writesOutputTree: safetySummary.writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    mayOverwriteOutputTree: safetySummary.mayOverwriteOutputTree,
    dryRun,
    skipMode: batchOptions.skipMode,
    batchGroupBy: batchOptions.batchGroupBy,
    batchNamingMode: batchOptions.batchNamingMode,
    batchDedupeMode: batchOptions.batchDedupeMode,
    batchErrorMode: batchOptions.batchErrorMode,
    configurationTrace,
    batchPolicySummary,
    scannedFileCount: allFiles.length,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    inputCountGuide,
    unsupportedFileDecision,
    unsupportedFileSummary,
    discoveredFontCount: fontFiles.length,
    deduplicatedCount,
    skippedDuplicates: skippedCount,
    dedupeDecisionSummary,
    selectedFontCount: selected.length,
    skippedExisting,
    skippedByManifest,
    reprocessedBecauseSourceChanged,
    reprocessedBecauseOptionsChanged,
    processedFontCount: results.length,
    errorCount: errors.length,
    errors,
    batchWarningCount: batchWarnings.length,
    batchWarnings,
    batchDecision,
    recommendedNextActionCount: recommendedNextActions.length,
    recommendedNextActions,
    resultsIncluded: includeResults,
    processingSummary,
    ...(dryRun ? {
      plannedCount: planned.length,
      wouldProcessCount,
      planIncluded: includeResults,
    } : {}),
    ...(includeResults && dryRun ? { planned } : {}),
    ...(includeResults && !dryRun ? { results } : {}),
  };

  if (errors.length > 0 && batchOptions.batchErrorMode === 'fail-after') {
    throw buildBatchError({
      mode: batchOptions.batchErrorMode,
      errors,
      summary: response,
    });
  }

  return response;
}

export async function inspectFontInputs(args) {
  const inputDir = await resolveWorkspacePath(args.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${args.inputDir}`);

  const maxFiles = normalizePositiveNumberOption(args, 'maxFiles', 50000, { integer: true, max: 50000 });
  const includeFiles = normalizeBooleanOption(args, 'includeFiles', true);
  const inputScan = await scanFilesRecursive(inputDir, { maxFiles });
  const allFiles = inputScan.files;
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const inputDirRelative = toRelativeWorkspacePath(inputDir);
  const unsupportedFileSummary = buildUnsupportedFileSummary(allFiles);
  const unsupportedFileDecision = buildUnsupportedFileDecision(unsupportedFileSummary);
  const layout = buildDirectoryLayoutSummary({ inputDir, allFiles, fontFiles });
  const recommendedBatchPreviewArgs = buildSuggestedBatchPreviewArgs({
    inputDir: inputDirRelative,
    recommendedBatchOptions: layout.recommendedBatchOptions,
    extraArgs: { maxFiles },
  });
  const inputCountGuide = buildInputCountGuide({
    appliesToTool: 'inspect_font_inputs',
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    unsupportedFileCount: allFiles.length - fontFiles.length,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    filesIncluded: includeFiles,
    unsupportedFileSummary,
    unsupportedFileDecision,
  });
  const entries = [];
  const byExtension = {};
  const byStatus = {};
  const byIdentityBasis = {};

  for (const file of fontFiles) {
    const entry = await inspectInputFontFile(file);
    entries.push(entry);
    byExtension[entry.extension] = (byExtension[entry.extension] || 0) + 1;
    byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
    if (entry.identityBasis) {
      byIdentityBasis[entry.identityBasis] = (byIdentityBasis[entry.identityBasis] || 0) + 1;
    }
  }

  const invalidFonts = entries.filter((entry) => entry.status === 'invalid');
  const missingIdentity = entries.filter((entry) => entry.status === 'valid-no-identity');
  const inspectionWarnings = buildInputInspectionWarnings({
    maxFilesHit: inputScan.truncated,
    maxFiles,
    includeFiles,
    invalidFontCount: invalidFonts.length,
    missingIdentityCount: missingIdentity.length,
  });
  const inputDirectoryDecision = buildInputDirectoryDecision({
    inputDirRelative,
    layout,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    supportedFontCount: fontFiles.length,
    invalidFontCount: invalidFonts.length,
    unsupportedFileDecision,
    recommendedBatchPreviewArgs,
  });

  return {
    ok: true,
    inputDir: inputDirRelative,
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    unsupportedFileCount: allFiles.length - fontFiles.length,
    inputCountGuide,
    unsupportedFileDecision,
    unsupportedFileSummary,
    validFontCount: entries.length - invalidFonts.length,
    invalidFontCount: invalidFonts.length,
    missingIdentityCount: missingIdentity.length,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    filesIncluded: includeFiles,
    layout,
    recommendedBatchPreviewArgs,
    inputDirectoryDecision,
    inspectionWarningCount: inspectionWarnings.length,
    inspectionWarnings,
    byExtension,
    byStatus,
    byIdentityBasis,
    invalidFonts: invalidFonts.map((entry) => ({
      path: entry.path,
      extension: entry.extension,
      sizeBytes: entry.sizeBytes,
      error: entry.error,
    })),
    ...(includeFiles ? { files: entries } : {}),
  };
}

export async function organizeFontDirectory(args = {}) {
  const presetContext = applyWorkflowPreset(args, 'organize');
  const effectiveArgs = presetContext.args;
  const inputDir = await resolveWorkspacePath(effectiveArgs.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${effectiveArgs.inputDir}`);

  const options = normalizeOrganizationOptions(effectiveArgs);
  const outputDir = await resolveWorkspacePath(effectiveArgs.outputDir || 'organized-fonts');
  if (path.resolve(inputDir) === path.resolve(outputDir)) {
    throw new Error('outputDir must be different from inputDir.');
  }

  const maxFiles = normalizePositiveNumberOption(effectiveArgs, 'maxFiles', 50000, { integer: true, max: 50000 });
  const scan = await scanFilesRecursive(inputDir, {
    maxFiles,
    excludeDirs: [path.basename(outputDir)],
  });
  const allFiles = scan.files;
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const unsupportedFileSummary = buildUnsupportedFileSummary(allFiles);
  const unsupportedFileDecision = buildUnsupportedFileDecision(unsupportedFileSummary);
  const inputCountGuide = buildInputCountGuide({
    appliesToTool: 'organize_font_directory',
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    unsupportedFileCount: unsupportedFileSummary.total,
    maxFiles,
    maxFilesHit: scan.truncated,
    supportedFieldName: 'supportedFontCount',
    unsupportedFieldName: 'unsupportedFileCount',
    unsupportedFileSummary,
    unsupportedFileDecision,
  });
  const layout = buildDirectoryLayoutSummary({ inputDir, allFiles, fontFiles });
  const entries = [];

  for (const file of fontFiles) {
    if (options.parseFonts) {
      entries.push({
        ...(await inspectInputFontFile(file)),
        file,
        metadataParsed: true,
      });
    } else {
      const stat = await fs.stat(file);
      entries.push({
        path: toRelativeWorkspacePath(file),
        extension: path.extname(file).toLowerCase(),
        sizeBytes: stat.size,
        status: 'not-parsed',
        container: null,
        glyphCount: null,
        identity: null,
        identityBasis: null,
        identityKey: null,
        metadataParsed: false,
        file,
      });
    }
  }

  const validEntries = entries.filter((entry) => entry.status !== 'invalid');
  const invalidEntries = entries.filter((entry) => entry.status === 'invalid');
  const effectiveDedupeMode = options.parseFonts ? options.batchDedupeMode : options.batchDedupeMode === 'none' ? 'none' : 'same-path';
  const dedupe = dedupeOrganizationEntries(validEntries, effectiveDedupeMode);
  const identityKeyMissingCount = options.parseFonts && effectiveDedupeMode === 'font-identity'
    ? validEntries.filter((entry) => !entry.identityKey).length
    : 0;
  const pathFallbackCount = options.batchDedupeMode === 'font-identity'
    ? options.parseFonts ? identityKeyMissingCount : validEntries.length
    : 0;
  const dedupeDecisionSummary = buildDedupeDecisionSummary({
    appliesToTool: 'organize_font_directory',
    requestedMode: options.batchDedupeMode,
    effectiveMode: effectiveDedupeMode,
    inputFontCount: validEntries.length,
    deduplicatedCount: dedupe.selected.length,
    skippedDuplicateCount: dedupe.duplicates.length,
    identityKeyMissingCount,
    pathFallbackCount,
    dedupeLimitedByParsing: !options.parseFonts && options.batchDedupeMode === 'font-identity',
    identityEvidenceItems: options.batchDedupeMode === 'none'
      ? []
      : validEntries.map((entry) => ({ identityKey: getOrganizationDedupeKey(entry, effectiveDedupeMode) })),
    duplicateEvidenceItems: dedupe.duplicates,
  });
  const selectedEntries = [
    ...dedupe.selected,
    ...(options.copyInvalidFonts ? invalidEntries : []),
  ].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  const plan = [];
  const errors = [];
  const usedTargets = new Set();
  let copiedCount = 0;
  let skippedTargetExists = 0;

  for (const duplicate of dedupe.duplicates) {
    plan.push({
      source: duplicate.path,
      action: 'skipped-duplicate',
      reason: 'deduped by effective batchDedupeMode',
      duplicateOf: duplicate.duplicateOf,
      identityKey: duplicate.identityKey,
    });
  }

  if (!options.copyInvalidFonts) {
    for (const entry of invalidEntries) {
      plan.push({
        source: entry.path,
        action: 'skipped-invalid',
        reason: entry.error || 'font metadata could not be parsed',
      });
    }
  }

  for (const entry of selectedEntries) {
    try {
      const groupName = sanitizeDirName(await resolveOrganizationGroupName({
        entry,
        inputDir,
        groupingMode: options.batchGroupBy,
      })) || 'Fonts';
      const target = await chooseOrganizationTargetPath({
        outputDir,
        groupName,
        entry,
        namingMode: options.batchNamingMode,
        usedTargets,
        overwriteExisting: options.overwriteExisting,
      });
      const targetExists = await fileExists(target.targetPath);
      const action = options.dryRun
        ? targetExists && !options.overwriteExisting ? 'would-skip-target-exists' : 'would-copy'
        : targetExists && !options.overwriteExisting ? 'skipped-target-exists' : 'copied';
      const planItem = {
        source: entry.path,
        target: target.relativeTarget,
        targetPath: toRelativeWorkspacePath(target.targetPath),
        groupName,
        action,
        status: entry.status,
        identityKey: entry.identityKey,
        glyphCount: entry.glyphCount,
      };
      plan.push(planItem);

      if (options.dryRun || action === 'would-skip-target-exists') {
        continue;
      }
      if (action === 'skipped-target-exists') {
        skippedTargetExists++;
        continue;
      }
      await fs.mkdir(path.dirname(target.targetPath), { recursive: true });
      await fs.copyFile(entry.file, target.targetPath);
      copiedCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ file: entry.path, error: message });
      plan.push({
        source: entry.path,
        action: 'error',
        reason: message,
      });
    }
  }

  const inputDirRelative = toRelativeWorkspacePath(inputDir);
  const outputDirRelative = toRelativeWorkspacePath(outputDir);
  const planActionSummary = buildPlanActionSummary(plan);
  const skippedCount = plan.filter((item) => item.action.startsWith('skipped') || item.action === 'would-skip-target-exists').length;
  const outputDirInsideInput = isInside(inputDir, outputDir);
  const sourceDestructive = false;
  const writesOutputTree = !options.dryRun;
  const writesSourceTree = writesOutputTree && outputDirInsideInput;
  const mayOverwriteOutputTree = !options.dryRun && options.overwriteExisting;
  const operationMode = options.dryRun ? 'plan-only' : 'copy-only';
  const writeScope = !writesOutputTree
    ? 'none'
    : outputDirInsideInput ? 'output-tree-inside-input-tree' : 'output-tree-only';
  const overwriteScope = !mayOverwriteOutputTree
    ? 'none'
    : outputDirInsideInput ? 'output-tree-inside-input-tree' : 'output-tree-only';
  const summary = options.dryRun
    ? 'Plan-only dry run; no files are written and source files are only scanned.'
    : outputDirInsideInput
      ? 'Copy-only organization; outputDir is inside or equal to inputDir, so the input tree receives organized copies, but source font files are never moved, deleted, or rewritten.'
      : mayOverwriteOutputTree
        ? 'Copy-only organization; selected fonts are copied into outputDir and existing output files may be replaced, but source files are never moved, deleted, or rewritten.'
        : 'Copy-only organization; selected fonts are copied into outputDir without replacing existing output files, and source files are never moved, deleted, or rewritten.';
  const safetySummary = {
    operationMode,
    sourceDestructive,
    sourceFilesPreserved: true,
    writesSourceTree,
    writesOutputTree,
    outputTreeInsideInputTree: outputDirInsideInput,
    mayOverwriteOutputTree,
    writeScope,
    overwriteScope,
    summary,
  };
  const sourceSafetyDecision = buildSourceSafetyDecision({
    appliesToTool: 'organize_font_directory',
    safetySummary,
    inputPath: inputDirRelative,
    outputPath: outputDirRelative,
    outputPathRole: 'outputDir',
    requiresOutputAudit: false,
  });
  const warnings = buildOrganizationWarnings({
    dryRun: options.dryRun,
    overwriteExisting: options.overwriteExisting,
    inputScanTruncated: scan.truncated,
    maxFiles,
    parseFonts: options.parseFonts,
    unsupportedFileCount: layout.unsupportedFileCount,
    invalidFontCount: invalidEntries.length,
    copyInvalidFonts: options.copyInvalidFonts,
    skippedDuplicateCount: dedupe.duplicates.length,
    layoutKind: layout.layoutKind,
    outputDirInsideInput,
  });
  const recommendedBatchPreviewArgs = buildSuggestedBatchPreviewArgs({
    inputDir: inputDirRelative,
    recommendedBatchOptions: layout.recommendedBatchOptions,
    extraArgs: { maxFiles },
  });
  const recommendedNextActions = buildOrganizationNextActions({
    options,
    inputDirRelative,
    outputDirRelative,
    maxFiles,
    maxFilesHit: scan.truncated,
    layout,
    warnings,
    errorCount: errors.length,
    selectedFontCount: selectedEntries.length,
    copiedCount,
  });
  const organizationDecision = buildOrganizationDecision({
    options,
    inputDirRelative,
    outputDirRelative,
    maxFiles,
    maxFilesHit: scan.truncated,
    layout,
    invalidFontCount: invalidEntries.length,
    selectedFontCount: selectedEntries.length,
    copiedCount,
    errorCount: errors.length,
    recommendedBatchPreviewArgs,
  });
  const batchPolicySummary = buildBatchPolicySummary({
    appliesToTool: 'organize_font_directory',
    workflowPreset: options.workflowPreset,
    values: {
      batchGroupBy: options.batchGroupBy,
      batchNamingMode: options.batchNamingMode,
      batchDedupeMode: options.batchDedupeMode,
    },
    effectiveValues: {
      batchDedupeMode: effectiveDedupeMode,
    },
    availableInspectFields: [
      'layout',
      'recommendedBatchPreviewArgs',
      'batchGroupBy',
      'batchNamingMode',
      'batchDedupeMode',
      'parsedFontMetadata',
      'invalidFontCount',
      'effectiveBatchDedupeMode',
      'dedupeLimitedByParsing',
      'skippedDuplicates',
      'dedupeDecisionSummary',
      'plan',
      'organizationWarnings',
      'planActionSummary',
    ],
    notes: !options.parseFonts && options.batchDedupeMode === 'font-identity'
      ? ['Identity dedupe is limited because parseFonts is false; rerun with parseFonts true before trusting semantic dedupe.']
      : [],
  });
  const configurationTrace = buildConfigurationTrace({
    appliesToTool: 'organize_font_directory',
    workflowPreset: options.workflowPreset,
    rawDefaults: RAW_ORGANIZATION_OPTION_DEFAULTS,
    presetDefaults: presetContext.presetDefaults,
    explicitArgs: presetContext.explicitArgs,
    effectiveValues: {
      dryRun: options.dryRun,
      includePlan: options.includePlan,
      parseFonts: options.parseFonts,
      batchGroupBy: options.batchGroupBy,
      batchNamingMode: options.batchNamingMode,
      batchDedupeMode: options.batchDedupeMode,
      copyInvalidFonts: options.copyInvalidFonts,
      overwriteExisting: options.overwriteExisting,
    },
  });
  const directoryWorkflowSummary = buildDirectoryWorkflowSummary({
    options,
    inputDirRelative,
    layout,
    safetySummary,
    organizationDecision,
    recommendedBatchPreviewArgs,
    recommendedNextActions,
    warnings,
    outputDirRelative,
    effectiveDedupeMode,
  });
  const layoutDecision = buildLayoutDecision({
    layout,
    safetySummary,
    organizationDecision,
    directoryWorkflowSummary,
  });
  const organizationManifestPath = options.dryRun
    ? null
    : toRelativeWorkspacePath(path.join(outputDir, ORGANIZATION_MANIFEST_FILE_NAME));
  const stagingDirectoryDecision = buildStagingDirectoryDecision({
    options,
    outputDirRelative,
    layout,
    copiedCount,
    skippedTargetExists,
    selectedFontCount: selectedEntries.length,
    errorCount: errors.length,
    organizationManifestPath,
    safePreviewArgs: organizationDecision.safeBatchPreviewArgs || buildSuggestedBatchPreviewArgs({
      inputDir: outputDirRelative,
      recommendedBatchOptions: layout.recommendedBatchOptions,
    }),
  });

  const result = {
    ok: errors.length === 0,
    workflowPreset: options.workflowPreset,
    dryRun: options.dryRun,
    inputDir: inputDirRelative,
    outputDir: outputDirRelative,
    maxFiles,
    maxFilesHit: scan.truncated,
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    inputCountGuide,
    parsedFontMetadata: options.parseFonts,
    unparsedFontCount: options.parseFonts ? 0 : entries.length,
    validFontCount: options.parseFonts ? validEntries.length : null,
    invalidFontCount: options.parseFonts ? invalidEntries.length : null,
    unsupportedFileCount: layout.unsupportedFileCount,
    unsupportedFileDecision,
    unsupportedFileSummary,
    deduplicatedCount: dedupe.selected.length,
    skippedDuplicates: dedupe.duplicates.length,
    dedupeDecisionSummary,
    selectedFontCount: selectedEntries.length,
    copiedCount,
    skippedTargetExists,
    skippedCount,
    errorCount: errors.length,
    errors,
    safetySummary,
    sourceSafetyDecision,
    sourceDestructive,
    writesSourceTree,
    writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    mayOverwriteOutputTree,
    sourceFilesPreserved: true,
    operationMode,
    parseFonts: options.parseFonts,
    requestedBatchDedupeMode: options.batchDedupeMode,
    effectiveBatchDedupeMode: effectiveDedupeMode,
    dedupeLimitedByParsing: !options.parseFonts && options.batchDedupeMode === 'font-identity',
    batchGroupBy: options.batchGroupBy,
    batchNamingMode: options.batchNamingMode,
    batchDedupeMode: options.batchDedupeMode,
    configurationTrace,
    batchPolicySummary,
    copyInvalidFonts: options.copyInvalidFonts,
    overwriteExisting: options.overwriteExisting,
    layout,
    recommendedBatchOptions: layout.recommendedBatchOptions,
    recommendedBatchPreviewArgs,
    recommendedNextActionCount: recommendedNextActions.length,
    recommendedNextActions,
    layoutDecision,
    stagingDirectoryDecision,
    organizationDecision,
    directoryWorkflowSummary,
    sourceLayoutMismatchSummary: directoryWorkflowSummary.sourceLayoutMismatchSummary,
    organizationWarningCount: warnings.length,
    organizationWarnings: warnings,
    planActionSummary,
    planIncluded: options.includePlan,
    ...(options.includePlan ? { plan } : {}),
  };

  if (!options.dryRun) {
    await fs.mkdir(outputDir, { recursive: true });
    const manifest = buildOrganizationManifest({
      inputDirRelative,
      outputDirRelative,
      options,
      result: {
        ...result,
        plan,
      },
    });
    await writeOrganizationManifest(outputDir, manifest);
    result.organizationManifestPath = organizationManifestPath;
    result.organizationManifestWritten = true;
  } else {
    result.organizationManifestWritten = false;
  }

  return result;
}
