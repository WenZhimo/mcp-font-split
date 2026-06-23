import { uniqueStrings } from './guidance-inspect-fields.js';

export function buildQuickStartCallExamples(templateById) {
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

export function buildWorkflowQuickStart(workflow, quickStartCallExamples) {
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
