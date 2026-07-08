import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
import { buildMinimalTtf } from './fixtures.js';

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
    || detailed.structuredContent?.errorType !== 'batch-split-error'
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
    || configuration.structuredContent?.errorType !== 'configuration-error'
    || parsedConfiguration.name !== 'FontSplitConfigurationError'
    || parsedConfiguration.errorType !== 'configuration-error'
    || parsedConfiguration.details?.summaryType !== 'configuration-error'
    || parsedConfiguration.details?.optionName !== 'batchDedupeMode'
    || parsedConfiguration.details?.omitForDefaultBehavior !== true
  ) {
    throw new Error('Expected MCP configuration error response to preserve configuration-error details.');
  }

  const plain = errorText(new Error('plain failure'));
  const parsedPlain = JSON.parse(plain.content[0].text);
  if (
    plain.isError !== true
    || plain.structuredContent?.ok !== false
    || parsedPlain.ok !== false
    || parsedPlain.error !== 'plain failure'
  ) {
    throw new Error('Expected plain MCP error response to use machine-readable JSON.');
  }
  console.log(JSON.stringify({ detailed: parsed, configuration: parsedConfiguration, plain: parsedPlain }, null, 2));
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
    const resourcesResult = await client.listResources();
    const promptsResult = await client.listPrompts();
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
      if (description.length > 700) {
        throw new Error(`${toolName} description is too long for the compact MCP schema contract.`);
      }
    };
    for (const tool of result.tools) {
      if (!tool.outputSchema || tool.outputSchema.type !== 'object') {
        throw new Error(`Expected ${tool.name} to expose an object outputSchema for structuredContent.`);
      }
    }
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
    expectDescriptionIncludes('get_agent_guidance', ['safe font-splitting workflow', 'compact or focused guidance', 'response fields to inspect']);
    expectDescriptionIncludes('split_font', ['writes output files', 'resultType', 'usedFallback']);
    expectDescriptionIncludes('split_font_batch', ['dryRun defaults to true', 'workflowPreset:"reviewed-write"', 'sourceSafetyDecision', 'batchDecision', 'batchWarnings']);
    expectDescriptionIncludes('inspect_font_inputs', ['Read-only preflight', 'ignored files', 'safe next-step preview']);
    expectDescriptionIncludes('organize_font_directory', ['Defaults to dryRun true', 'never moves/deletes source files', 'outputDir']);
    expectDescriptionIncludes('inspect_split_output', ['outputRoleDecision', 'font-organization-manifest.json', 'organize_font_directory staging', 'inspect_font_inputs', 'split_font_batch safe-preview', 'outputStructureDecision', 'auditStatus', 'structureSummary', 'maxFilesHit', 'inspectionWarnings', 'includeFiles:false']);
    const resourceUris = resourcesResult.resources.map((resource) => resource.uri);
    for (const uri of [
      'font-split://docs/readme.zh-CN',
      'font-split://docs/readme.en',
      'font-split://docs/api.en',
      'font-split://docs/api.zh-CN',
      'font-split://docs/behavior.zh-CN',
    ]) {
      if (!resourceUris.includes(uri)) {
        throw new Error(`Expected MCP resource list to include ${uri}.`);
      }
    }
    const promptNames = promptsResult.prompts.map((prompt) => prompt.name);
    if (!promptNames.includes('safe-batch-workflow')) {
      throw new Error('Expected MCP prompts/list to include safe-batch-workflow.');
    }
    const apiResource = await client.readResource({ uri: 'font-split://docs/api.en' });
    if (!apiResource.contents?.[0]?.text?.includes('split_font_batch')) {
      throw new Error('Expected API resource to expose API.md text.');
    }
    const workflowPrompt = await client.getPrompt({
      name: 'safe-batch-workflow',
      arguments: {
        inputDir: 'fonts',
        outputRoot: 'split-output',
      },
    });
    if (
      !workflowPrompt.messages?.[0]?.content?.text?.includes('inspect_font_inputs')
      || !workflowPrompt.messages?.[0]?.content?.text?.includes('workflowPreset:"reviewed-write"')
    ) {
      throw new Error('Expected safe-batch-workflow prompt to return the safe inspect-preview-write-audit route.');
    }
    console.log(JSON.stringify({
      ok: true,
      guidancePropertyCount: Object.keys(guidanceProps).length,
      splitFontPropertyCount: Object.keys(splitFontProps).length,
      splitFontBatchPropertyCount: Object.keys(batchProps).length,
      organizeFontDirectoryPropertyCount: Object.keys(organizeProps).length,
      resourceCount: resourcesResult.resources.length,
      promptCount: promptsResult.prompts.length,
      splitFontBatchHasBatchGroupBy: Object.hasOwn(batchProps, 'batchGroupBy'),
      organizeFontDirectoryHasDryRun: Object.hasOwn(organizeProps, 'dryRun'),
    }, null, 2));
  } finally {
    await client.close();
  }
}

function parseTextJson(result, label) {
  const text = result?.content?.find((item) => item.type === 'text')?.text;
  if (typeof text !== 'string') {
    throw new Error(`${label}: expected text JSON content.`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}: expected parseable JSON text: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runMcpStdioCallSmoke() {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'font-split-mcp-stdio-'));
  await fs.writeFile(
    path.join(workspaceRoot, 'Fixture-Regular.ttf'),
    buildMinimalTtf({ familyName: 'Fixture Sans', subfamilyName: 'Regular', glyphCount: 4 }),
  );

  const client = new Client({ name: 'mcp-stdio-call-smoke', version: '0.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['src/server.js'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      FONT_SPLIT_ROOT: workspaceRoot,
    },
  });
  await client.connect(transport);
  try {
    const toolsResult = await client.listTools();
    if (!toolsResult.tools.some((tool) => tool.name === 'split_font_batch')) {
      throw new Error('Expected stdio MCP tools/list to expose split_font_batch.');
    }

    const batchResult = await client.callTool({
      name: 'split_font_batch',
      arguments: {
        inputDir: '.',
        outputRoot: 'split-output',
        limit: 1,
        includeResults: true,
      },
    });
    const batch = parseTextJson(batchResult, 'split_font_batch stdio call');
    if (
      batchResult.structuredContent?.dryRun !== true
      || batch.ok !== true
      || batch.dryRun !== true
      || batch.writesOutputTree !== false
      || batch.plannedCount !== 1
      || batch.results
    ) {
      throw new Error('Expected omitted dryRun stdio batch call to stay no-write and return planned output.');
    }
    const outputExists = await fs.access(path.join(workspaceRoot, 'split-output')).then(() => true).catch(() => false);
    if (outputExists) {
      throw new Error('Expected omitted dryRun stdio batch call not to create outputRoot.');
    }

    const invalidDryRunResult = await client.callTool({
      name: 'split_font_batch',
      arguments: {
        dryRun: 'false',
      },
    });
    const invalidDryRun = parseTextJson(invalidDryRunResult, 'invalid dryRun stdio call');
    if (
      invalidDryRunResult.isError !== true
      || invalidDryRunResult.structuredContent?.errorType !== 'mcp-schema-validation-error'
      || invalidDryRun.ok !== false
      || invalidDryRun.errorType !== 'mcp-schema-validation-error'
      || invalidDryRun.details?.summaryType !== 'mcp-schema-validation-error'
      || invalidDryRun.details?.toolName !== 'split_font_batch'
      || !invalidDryRun.details?.validationIssues?.some((issue) => issue.path?.[0] === 'dryRun')
    ) {
      throw new Error('Expected invalid dryRun stdio call to return a structured MCP schema validation error result.');
    }

    console.log(JSON.stringify({
      ok: true,
      toolCount: toolsResult.tools.length,
      batchDryRun: batch.dryRun,
      batchWritesOutputTree: batch.writesOutputTree,
      plannedCount: batch.plannedCount,
      invalidDryRunErrorType: invalidDryRun.errorType,
    }, null, 2));
  } finally {
    await client.close();
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

export {
  runMcpErrorSmoke,
  runMcpSchemaSmoke,
  runMcpStdioCallSmoke,
};
