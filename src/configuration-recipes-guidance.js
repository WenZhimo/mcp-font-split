import { withDirectoryRouteInspectFields } from './guidance-inspect-fields.js';
import {
  OUTPUT_AUDIT_COMPLETION_CRITERIA,
  OUTPUT_AUDIT_MINIMUM_PASS_TEXT,
  OUTPUT_AUDIT_PASS_CONDITIONS_TEXT,
} from './output-audit-criteria.js';

export function buildConfigurationRecipes() {
  return [
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
      successCriteria: `Preview must be no-write and acceptable; reviewed write must have sourceDestructive false and errorCount zero; final inspect_split_output audit must reach ${OUTPUT_AUDIT_MINIMUM_PASS_TEXT} before reporting completion.`,
      auditAfterWrite: {
        tool: 'inspect_split_output',
        requiredFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'structureSummary', 'maxFilesHit', 'inspectionWarnings'],
        passWhen: OUTPUT_AUDIT_COMPLETION_CRITERIA,
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
        `Always follow the audit-split-output next action and require ${OUTPUT_AUDIT_PASS_CONDITIONS_TEXT} before reporting completion.`,
      ],
      inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'batchDecision', 'batchWarnings', 'dedupeDecisionSummary', 'errorCount', 'errors', 'recommendedNextActions', 'resultsIncluded'],
      successCriteria: `Run only after a reviewed preview; require maxFilesHit false, errorCount zero, audit-split-output next action, and an inspect_split_output audit with ${OUTPUT_AUDIT_MINIMUM_PASS_TEXT} before reporting completion.`,
    },
  ];
}
