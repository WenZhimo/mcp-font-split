import { withDirectoryRouteInspectFields } from './guidance-inspect-fields.js';
import { OUTPUT_AUDIT_PASS_CONDITIONS_TEXT } from './output-audit-criteria.js';

export function buildDirectoryWorkflowDecisionMatrix() {
  return [
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
}

export function buildDirectoryWorkflowExamples() {
  return [
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
          successCriteria: `Treat the final split output as valid only when inspect_split_output reports ${OUTPUT_AUDIT_PASS_CONDITIONS_TEXT}.`,
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
}
