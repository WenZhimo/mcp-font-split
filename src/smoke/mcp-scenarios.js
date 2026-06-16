import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  BATCH_DEDUPE_MODES,
  BATCH_ERROR_MODES,
  BATCH_GROUP_BY_MODES,
  BATCH_NAMING_MODES,
  GUIDANCE_DETAIL_LEVELS,
  GUIDANCE_WORKFLOWS,
  OVERSIZED_KERN_ACTIONS,
  SKIP_MODES,
  SMALL_GLYPH_ACTIONS,
  SPLIT_FAILURE_ACTIONS,
  getAgentGuidance,
} from '../font-split.js';
import { errorText } from '../mcp-response.js';

async function runMcpErrorSmoke() {
  const detailedError = new Error('batch failed');
  detailedError.name = 'BatchSplitError';
  detailedError.details = {
    mode: 'fail-after',
    errors: [{ file: 'bad.ttf', error: 'not a font' }],
    summary: { errorCount: 1 },
  };
  const detailed = errorText(detailedError);
  const parsed = JSON.parse(detailed.content[0].text);
  if (
    detailed.isError !== true
    || parsed.name !== 'BatchSplitError'
    || parsed.errorType !== 'batch-split-error'
    || parsed.details?.errors?.[0]?.file !== 'bad.ttf'
  ) {
    throw new Error('Expected MCP error response to preserve structured details.');
  }

  const configError = new Error('batchDedupeMode must be one of none, same-path, font-identity. Omit it to use the documented default.');
  configError.name = 'FontSplitConfigurationError';
  configError.details = {
    summaryType: 'configuration-error',
    optionName: 'batchDedupeMode',
    received: 'semantic',
    allowedValues: ['none', 'same-path', 'font-identity'],
    defaultWhenOmitted: 'font-identity',
    omitForDefaultBehavior: true,
  };
  const configuration = errorText(configError);
  const parsedConfiguration = JSON.parse(configuration.content[0].text);
  if (
    configuration.isError !== true
    || parsedConfiguration.name !== 'FontSplitConfigurationError'
    || parsedConfiguration.errorType !== 'configuration-error'
    || parsedConfiguration.details?.summaryType !== 'configuration-error'
    || parsedConfiguration.details?.optionName !== 'batchDedupeMode'
    || parsedConfiguration.details?.omitForDefaultBehavior !== true
  ) {
    throw new Error('Expected MCP configuration error response to preserve configuration-error details.');
  }

  const plain = errorText(new Error('plain failure'));
  if (plain.content[0].text !== 'plain failure') {
    throw new Error('Expected plain MCP error response to stay concise.');
  }
  console.log(JSON.stringify({ detailed: parsed, configuration: parsedConfiguration, plain: plain.content[0].text }, null, 2));
}

async function runMcpSchemaSmoke() {
  const client = new Client({ name: 'mcp-schema-smoke', version: '0.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['src/server.js'],
    cwd: process.cwd(),
  });
  await client.connect(transport);
  try {
    const result = await client.listTools();
    const tools = Object.fromEntries(result.tools.map((tool) => [tool.name, tool]));
    const guidanceProps = tools.get_agent_guidance?.inputSchema?.properties || {};
    const splitFontProps = tools.split_font?.inputSchema?.properties || {};
    const batchProps = tools.split_font_batch?.inputSchema?.properties || {};
    const organizeProps = tools.organize_font_directory?.inputSchema?.properties || {};
    const guidanceSectionEnum = guidanceProps.sections?.items?.enum || [];
    const fullCoreGuidance = getAgentGuidance({ detailLevel: 'full' });
    const coreGuidanceSections = fullCoreGuidance.guidanceView?.availableSections || [];
    const coreWorkflowPresetIds = (fullCoreGuidance.workflowPresets || []).map((preset) => preset.id);
    const getSchemaEnumValues = (schema) => schema?.enum || schema?.items?.enum || [];
    const assertEnumMatches = (label, actualValues, expectedValues) => {
      const missingValues = expectedValues.filter((value) => !actualValues.includes(value));
      const extraValues = actualValues.filter((value) => !expectedValues.includes(value));
      if (missingValues.length > 0 || extraValues.length > 0) {
        throw new Error(`${label} schema drift: missing ${missingValues.join(', ') || '<none>'}; extra ${extraValues.join(', ') || '<none>'}.`);
      }
    };
    const expectDescriptionIncludes = (toolName, phrases) => {
      const description = tools[toolName]?.description || '';
      for (const phrase of phrases) {
        if (!description.includes(phrase)) {
          throw new Error(`${toolName} description is missing ${phrase}`);
        }
      }
    };
    const batchOnly = ['skipMode', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode', 'debugBatchDecisions'];
    const leaked = batchOnly.filter((key) => Object.hasOwn(splitFontProps, key));
    const missing = batchOnly.filter((key) => !Object.hasOwn(batchProps, key));
    if (leaked.length > 0) {
      throw new Error(`split_font leaked batch-only properties: ${leaked.join(', ')}`);
    }
    if (missing.length > 0) {
      throw new Error(`split_font_batch is missing batch-only properties: ${missing.join(', ')}`);
    }
    for (const requiredGuidanceProp of ['workflow', 'detailLevel', 'sections']) {
      if (!Object.hasOwn(guidanceProps, requiredGuidanceProp)) {
        throw new Error(`get_agent_guidance is missing ${requiredGuidanceProp}`);
      }
    }
    assertEnumMatches('get_agent_guidance workflow', getSchemaEnumValues(guidanceProps.workflow), GUIDANCE_WORKFLOWS);
    assertEnumMatches('get_agent_guidance detailLevel', getSchemaEnumValues(guidanceProps.detailLevel), GUIDANCE_DETAIL_LEVELS);
    assertEnumMatches('get_agent_guidance sections', guidanceSectionEnum, coreGuidanceSections);
    for (const requiredOrganizeProp of ['dryRun', 'outputDir', 'overwriteExisting', 'copyInvalidFonts']) {
      if (!Object.hasOwn(organizeProps, requiredOrganizeProp)) {
        throw new Error(`organize_font_directory is missing ${requiredOrganizeProp}`);
      }
    }
    if (!Object.hasOwn(batchProps, 'workflowPreset') || !Object.hasOwn(organizeProps, 'workflowPreset')) {
      throw new Error('Expected batch and organization tools to expose workflowPreset.');
    }
    if (
      batchProps.workflowPreset?.enum?.includes('default')
      || organizeProps.workflowPreset?.enum?.includes('default')
      || batchProps.workflowPreset?.anyOf?.some((entry) => entry.enum?.includes('default'))
      || organizeProps.workflowPreset?.anyOf?.some((entry) => entry.enum?.includes('default'))
    ) {
      throw new Error('Expected workflowPreset schema to omit redundant default preset; callers should omit workflowPreset for raw defaults.');
    }
    assertEnumMatches('split_font_batch workflowPreset', getSchemaEnumValues(batchProps.workflowPreset), coreWorkflowPresetIds);
    assertEnumMatches('organize_font_directory workflowPreset', getSchemaEnumValues(organizeProps.workflowPreset), coreWorkflowPresetIds);
    for (const [optionName, expectedValues] of Object.entries({
      oversizedKernAction: OVERSIZED_KERN_ACTIONS,
      smallGlyphAction: SMALL_GLYPH_ACTIONS,
      splitFailureAction: SPLIT_FAILURE_ACTIONS,
    })) {
      assertEnumMatches(`split_font ${optionName}`, getSchemaEnumValues(splitFontProps[optionName]), expectedValues);
      assertEnumMatches(`split_font_batch ${optionName}`, getSchemaEnumValues(batchProps[optionName]), expectedValues);
    }
    assertEnumMatches('split_font_batch skipMode', getSchemaEnumValues(batchProps.skipMode), SKIP_MODES);
    for (const [optionName, expectedValues] of Object.entries({
      batchGroupBy: BATCH_GROUP_BY_MODES,
      batchNamingMode: BATCH_NAMING_MODES,
      batchDedupeMode: BATCH_DEDUPE_MODES,
    })) {
      assertEnumMatches(`split_font_batch ${optionName}`, getSchemaEnumValues(batchProps[optionName]), expectedValues);
      assertEnumMatches(`organize_font_directory ${optionName}`, getSchemaEnumValues(organizeProps[optionName]), expectedValues);
    }
    assertEnumMatches('split_font_batch batchErrorMode', getSchemaEnumValues(batchProps.batchErrorMode), BATCH_ERROR_MODES);
    expectDescriptionIncludes('get_agent_guidance', ['projectStatusNotice', 'toolSafetyQuickReference', 'nextToolDecisionSummary', 'workflowQuickStart', 'quickStartCallExamples', 'configurationRecipes', 'batchCustomizationQuickReference', 'directoryOrganizationQuickAnswer', 'batchPolicyGuide', 'fontIdentityBasisCatalog', 'outputStructureCatalog', 'unsupportedFileCategoryCatalog', 'directoryHandlingModeCatalog', 'directoryWorkflowDecisionMatrix', 'safeInvocationTemplates', 'localVerificationOutputGuide', 'errorResponseCatalog', 'warningCodeCatalog', 'toolResponseFieldCatalog', 'response fields to inspect', 'successCriteria', 'detailLevel', 'sections']);
    expectDescriptionIncludes('split_font', ['writes output files', 'resultType', 'usedFallback']);
    expectDescriptionIncludes('split_font_batch', ['dryRun defaults to false', 'includeResults:true', 'sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'outputTreeInsideInputTree', 'batchDecision', 'recommendedNextActions[].suggestedArgsField', 'batchWarnings', 'source-layout-mismatch-comparison', 'organize_font_directory safe-preview']);
    expectDescriptionIncludes('inspect_font_inputs', ['layout', 'recommendedBatchPreviewArgs', 'inputDirectoryDecision', 'without writing output', 'organize_font_directory safe-preview', 'maxFiles', 'preserves']);
    expectDescriptionIncludes('organize_font_directory', ['dryRun true', 'source-non-destructive', 'never moves or deletes source files', 'sourceSafetyDecision', 'layoutDecision.directoryHandling', 'stagingDirectoryDecision', 'safetySummary', 'batchPolicySummary', 'directoryWorkflowSummary', 'directoryWorkflowSummary.workflowSteps[].suggestedArgsField', 'sourceLayoutMismatchSummary', 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs', 'sourceLayoutMismatchSummary.decisionChecklist.items[].safePreviewArgs', 'recommendedBatchPreviewArgs', 'recommendedNextActions', 'recommendedNextActions[].suggestedArgsField', 'suggestedArgs.maxFiles', 'maxFiles', 'preserves', 'outputTreeInsideInputTree', 'source-layout-mismatch-comparison']);
    expectDescriptionIncludes('inspect_split_output', ['outputRoleDecision', 'font-organization-manifest.json', 'organize_font_directory staging', 'inspect_font_inputs', 'split_font_batch safe-preview', 'outputStructureDecision', 'auditStatus', 'structureSummary', 'maxFilesHit', 'inspectionWarnings', 'includeFiles:false']);
    console.log(JSON.stringify({
      ok: true,
      guidancePropertyCount: Object.keys(guidanceProps).length,
      splitFontPropertyCount: Object.keys(splitFontProps).length,
      splitFontBatchPropertyCount: Object.keys(batchProps).length,
      organizeFontDirectoryPropertyCount: Object.keys(organizeProps).length,
      splitFontBatchHasBatchGroupBy: Object.hasOwn(batchProps, 'batchGroupBy'),
      organizeFontDirectoryHasDryRun: Object.hasOwn(organizeProps, 'dryRun'),
    }, null, 2));
  } finally {
    await client.close();
  }
}

export {
  runMcpErrorSmoke,
  runMcpSchemaSmoke,
};
