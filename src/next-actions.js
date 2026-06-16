import {
  attachSourceLayoutDecisionChecklistFields,
  withDirectoryRouteInspectFields,
} from './guidance-workflows.js';
import {
  buildBatchAuditArgs,
  buildSuggestedBatchPreviewArgs,
  buildSuggestedBatchRerunArgs,
  buildSuggestedBatchWriteArgs,
  buildSuggestedOrganizationArgs,
} from './suggested-args.js';

export function buildBatchNextActions({
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

export function buildOrganizationNextActions({
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
