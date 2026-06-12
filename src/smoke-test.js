import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getAgentGuidance, getRuntimeStatus, inspectFontInputs, inspectSplitOutput, organizeFontDirectory, splitFont, splitFontBatch } from './font-split.js';
import { errorText } from './mcp-response.js';

const execFileAsync = promisify(execFile);
const scenario = process.argv[2] || 'single';
const fontPath = process.argv[3] || '0xA000/0xA000-Regular.ttf';
const outDir = process.argv[4] || 'font-split-mcp/.font-split-smoke-output';

function pad4(buffer) {
  const remainder = buffer.length % 4;
  if (remainder === 0) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(4 - remainder)]);
}

function checksumTable(buffer) {
  const padded = pad4(buffer);
  let sum = 0;
  for (let offset = 0; offset < padded.length; offset += 4) {
    sum = (sum + padded.readUInt32BE(offset)) >>> 0;
  }
  return sum;
}

function writeUtf16Be(value) {
  const buffer = Buffer.alloc(value.length * 2);
  for (let i = 0; i < value.length; i++) {
    buffer.writeUInt16BE(value.charCodeAt(i), i * 2);
  }
  return buffer;
}

function buildNameTable(records) {
  const encodedRecords = records.map(([nameId, value]) => ({
    nameId,
    data: writeUtf16Be(value),
  }));
  const headerSize = 6;
  const recordSize = 12;
  const stringOffset = headerSize + encodedRecords.length * recordSize;
  const stringData = Buffer.concat(encodedRecords.map((record) => record.data));
  const table = Buffer.alloc(stringOffset + stringData.length);

  table.writeUInt16BE(0, 0);
  table.writeUInt16BE(encodedRecords.length, 2);
  table.writeUInt16BE(stringOffset, 4);

  let dataOffset = 0;
  encodedRecords.forEach((record, index) => {
    const recordOffset = headerSize + index * recordSize;
    table.writeUInt16BE(3, recordOffset);
    table.writeUInt16BE(1, recordOffset + 2);
    table.writeUInt16BE(0x0409, recordOffset + 4);
    table.writeUInt16BE(record.nameId, recordOffset + 6);
    table.writeUInt16BE(record.data.length, recordOffset + 8);
    table.writeUInt16BE(dataOffset, recordOffset + 10);
    dataOffset += record.data.length;
  });
  stringData.copy(table, stringOffset);
  return table;
}

// Minimal sfnt fixture for organizer metadata parsing; it is not meant for real splitting/rendering.
function buildMinimalTtf({ familyName = 'Fixture Sans', subfamilyName = 'Regular', glyphCount = 3 } = {}) {
  const tables = [
    {
      tag: 'maxp',
      data: Buffer.from([0x00, 0x01, 0x00, 0x00, (glyphCount >> 8) & 0xff, glyphCount & 0xff]),
    },
    {
      tag: 'name',
      data: buildNameTable([
        [1, familyName],
        [2, subfamilyName],
        [4, `${familyName} ${subfamilyName}`],
        [6, `${familyName.replace(/\s+/g, '')}-${subfamilyName.replace(/\s+/g, '')}`],
        [16, familyName],
        [17, subfamilyName],
      ]),
    },
  ].sort((a, b) => a.tag.localeCompare(b.tag));

  const numTables = tables.length;
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 16 * (2 ** entrySelector);
  const rangeShift = numTables * 16 - searchRange;
  const headerSize = 12 + numTables * 16;
  let dataOffset = headerSize;
  const tableRecords = tables.map((table) => {
    const data = pad4(table.data);
    const record = {
      ...table,
      checksum: checksumTable(table.data),
      offset: dataOffset,
      length: table.data.length,
      paddedData: data,
    };
    dataOffset += data.length;
    return record;
  });
  const font = Buffer.alloc(dataOffset);

  font.writeUInt32BE(0x00010000, 0);
  font.writeUInt16BE(numTables, 4);
  font.writeUInt16BE(searchRange, 6);
  font.writeUInt16BE(entrySelector, 8);
  font.writeUInt16BE(rangeShift, 10);

  tableRecords.forEach((table, index) => {
    const recordOffset = 12 + index * 16;
    font.write(table.tag, recordOffset, 4, 'ascii');
    font.writeUInt32BE(table.checksum, recordOffset + 4);
    font.writeUInt32BE(table.offset, recordOffset + 8);
    font.writeUInt32BE(table.length, recordOffset + 12);
    table.paddedData.copy(font, table.offset);
  });

  return font;
}

function assertInspectFieldsExist(action, responsesByTool, context) {
  if (!action) {
    throw new Error(`${context}: expected action for inspectFields check.`);
  }
  if (!Array.isArray(action.inspectFields)) return;
  const response = responsesByTool[action.tool];
  if (!response) return;
  const missing = action.inspectFields.filter((field) => {
    const topLevelField = field.split('.')[0];
    return !Object.hasOwn(response, topLevelField);
  });
  if (missing.length > 0) {
    throw new Error(`${context}: action ${action.id} (${action.tool}) references missing inspectFields: ${missing.join(', ')}`);
  }
}

function assertRecommendedNextActionInspectFields(actions, responsesByTool, context) {
  for (const action of actions || []) {
    assertInspectFieldsExist(action, responsesByTool, context);
  }
}

if (scenario === 'single') {
  console.log('Splitting:', fontPath, '->', outDir);
  const result = await splitFont({
    fontPath,
    outDir,
    testHtml: true,
    reporter: true,
    chunkSize: 70 * 1024,
    fontFamily: 'SmokeTestFont',
    silent: true,
  });
  console.log(JSON.stringify(result, null, 2));

  console.log('\nInspecting output:');
  console.log(JSON.stringify(await inspectSplitOutput({ outDir }), null, 2));
} else if (scenario === 'batch-incremental') {
  const inputDir = process.argv[3] || '0xA000';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-batch-output';
  console.log('Batch run #1 (manifest mode)');
  const first = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 5,
    maxFiles: 200,
    skipMode: 'manifest',
    batchGroupBy: 'font-family',
    batchNamingMode: 'numeric-suffix',
    batchDedupeMode: 'font-identity',
    chunkSize: 70 * 1024,
    silent: true,
  });
  console.log(JSON.stringify(first, null, 2));
  console.log('\nBatch run #2 (same config, expect manifest skips)');
  const second = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 5,
    maxFiles: 200,
    skipMode: 'manifest',
    batchGroupBy: 'font-family',
    batchNamingMode: 'numeric-suffix',
    batchDedupeMode: 'font-identity',
    chunkSize: 70 * 1024,
    silent: true,
  });
  console.log(JSON.stringify(second, null, 2));
  if (first.results[0]) {
    console.log('\nSample split dir from run #1:', first.results[0].splitDir);
  }
  if (second.results[0]) {
    console.log('Sample split dir from run #2:', second.results[0].splitDir);
  } else {
    console.log('Sample split dir from run #2: skipped via manifest reuse');
  }
} else if (scenario === 'inspect') {
  console.log(JSON.stringify(await inspectSplitOutput({ outDir: fontPath }), null, 2));
} else if (scenario === 'agent-guidance') {
  const defaultGuidance = getAgentGuidance({ workflow: 'batch' });
  if (
    defaultGuidance.guidanceView?.detailLevel !== 'compact'
    || !defaultGuidance.guidanceView?.omittedSections?.includes('warning-catalog')
    || !defaultGuidance.guidanceView?.omittedSections?.includes('field-catalog')
    || Object.hasOwn(defaultGuidance, 'warningCodeCatalog')
    || Object.hasOwn(defaultGuidance, 'toolResponseFieldCatalog')
    || Object.hasOwn(defaultGuidance, 'directoryWorkflowExamples')
    || !defaultGuidance.safeInvocationTemplates?.length
    || !defaultGuidance.directoryWorkflowDecisionMatrix?.length
  ) {
    throw new Error('Expected default agent guidance to be compact and omit bulky catalogs/examples.');
  }
  const result = getAgentGuidance({ workflow: 'batch', detailLevel: 'full' });
  if (result.agentOptimized !== true || result.workflow !== 'batch' || !result.tools.some((tool) => tool.name === 'inspect_font_inputs')) {
    throw new Error('Expected agent guidance to describe the batch workflow and preflight tool.');
  }
  if (
    result.guidanceView?.detailLevel !== 'full'
    || !result.guidanceView?.sectionsIncluded?.includes('warning-catalog')
    || !result.guidanceView?.availableSections?.includes('field-catalog')
  ) {
    throw new Error('Expected explicit full guidance to expose the full guidance view.');
  }
  const compactGuidance = getAgentGuidance({ workflow: 'organize', detailLevel: 'compact' });
  if (
    compactGuidance.guidanceView?.detailLevel !== 'compact'
    || compactGuidance.workflow !== 'organize'
    || !compactGuidance.guidanceView?.omittedSections?.includes('warning-catalog')
    || !compactGuidance.guidanceView?.omittedSections?.includes('field-catalog')
    || Object.hasOwn(compactGuidance, 'warningCodeCatalog')
    || Object.hasOwn(compactGuidance, 'toolResponseFieldCatalog')
    || Object.hasOwn(compactGuidance, 'directoryWorkflowExamples')
    || !compactGuidance.safeInvocationTemplates?.length
    || !compactGuidance.directoryWorkflowDecisionMatrix?.length
  ) {
    throw new Error('Expected compact agent guidance to keep workflow essentials and omit bulky catalogs/examples.');
  }
  const catalogGuidance = getAgentGuidance({ sections: ['warning-catalog', 'field-catalog'] });
  if (
    catalogGuidance.guidanceView?.sectionsIncluded?.length !== 2
    || !catalogGuidance.warningCodeCatalog
    || !catalogGuidance.toolResponseFieldCatalog
    || Object.hasOwn(catalogGuidance, 'safeInvocationTemplates')
    || Object.hasOwn(catalogGuidance, 'directoryWorkflowDecisionMatrix')
  ) {
    throw new Error('Expected focused agent guidance sections to return only requested catalogs.');
  }
  if (!result.tools.some((tool) => tool.name === 'organize_font_directory')) {
    throw new Error('Expected agent guidance to describe the directory organization tool.');
  }
  if (!result.tools.some((tool) => tool.name === 'get_runtime_status')) {
    throw new Error('Expected agent guidance to describe the runtime status tool.');
  }
  if (result.recommendedInspectOptions?.includeFiles !== false || result.recommendedInspectOptions?.includeFamilies !== false) {
    throw new Error('Expected agent guidance to recommend compact output inspection.');
  }
  const presetIds = new Set((result.workflowPresets || []).map((item) => item.id));
  for (const requiredPreset of ['safe-preview', 'reviewed-write', 'structure-first', 'source-layout', 'metadata-family', 'preserve-all']) {
    if (!presetIds.has(requiredPreset)) {
      throw new Error(`Expected agent guidance workflowPresets to include ${requiredPreset}.`);
    }
  }
  if (!result.responseFieldsToCheck?.includes('cnFontSplit.runtimeVersion')) {
    throw new Error('Expected agent guidance to recommend checking cn-font-split runtime details.');
  }
  if (!result.responseFieldsToCheck?.includes('workflowPresets') || !result.responseFieldsToCheck?.includes('workflowPreset')) {
    throw new Error('Expected agent guidance to recommend checking workflow preset fields.');
  }
  if (!result.responseFieldsToCheck?.includes('recommendedActions')) {
    throw new Error('Expected agent guidance to recommend checking remediation actions.');
  }
  if (!result.responseFieldsToCheck?.includes('node')) {
    throw new Error('Expected agent guidance to recommend checking Node runtime details.');
  }
  if (!result.responseFieldsToCheck?.includes('wasm.fontSplitWasmPathConfigured')) {
    throw new Error('Expected agent guidance to recommend checking custom WASM path status.');
  }
  if (!result.responseFieldsToCheck?.includes('batchWarnings')) {
    throw new Error('Expected agent guidance to recommend checking batch warnings.');
  }
  if (!result.responseFieldsToCheck?.includes('inspectionWarnings')) {
    throw new Error('Expected agent guidance to recommend checking inspection warnings.');
  }
  if (!result.responseFieldsToCheck?.includes('organizationWarnings')) {
    throw new Error('Expected agent guidance to recommend checking organization warnings.');
  }
  if (!result.responseFieldsToCheck?.includes('recommendedNextActions')) {
    throw new Error('Expected agent guidance to recommend checking organization next actions.');
  }
  if (!result.responseFieldsToCheck?.includes('planActionSummary')) {
    throw new Error('Expected agent guidance to recommend checking organization plan action summaries.');
  }
  if (!result.responseFieldsToCheck?.includes('warningCodeCatalog')) {
    throw new Error('Expected agent guidance to recommend checking the warning code catalog.');
  }
  if (!result.responseFieldsToCheck?.includes('warningCodeCatalogVersion')) {
    throw new Error('Expected agent guidance to recommend checking the warning code catalog version.');
  }
  if (!result.responseFieldsToCheck?.includes('toolResponseFieldCatalog')) {
    throw new Error('Expected agent guidance to recommend checking the tool response field catalog.');
  }
  if (!result.responseFieldsToCheck?.includes('toolResponseFieldCatalogVersion')) {
    throw new Error('Expected agent guidance to recommend checking the tool response field catalog version.');
  }
  if (!result.responseFieldsToCheck?.includes('safeInvocationTemplates')) {
    throw new Error('Expected agent guidance to recommend checking safe invocation templates.');
  }
  if (!result.responseFieldsToCheck?.includes('safeInvocationTemplatesVersion')) {
    throw new Error('Expected agent guidance to recommend checking safe invocation template version.');
  }
  if (!result.responseFieldsToCheck?.includes('guidanceView')) {
    throw new Error('Expected agent guidance to recommend checking guidance view metadata.');
  }
  const expectedWarningCodes = [
    'dry-run-no-write',
    'input-scan-truncated',
    'batch-limit-truncated',
    'batch-plan-omitted',
    'batch-results-omitted',
    'existing-output-skipped',
    'errors-collected',
    'input-files-omitted',
    'invalid-fonts-found',
    'font-identity-missing',
    'output-scan-truncated',
    'output-files-omitted',
    'output-families-omitted',
    'legacy-output-detected',
    'organization-dry-run',
    'organization-writes-output',
    'font-parsing-skipped',
    'output-overwrite-enabled',
    'unsupported-files-ignored',
    'invalid-fonts-skipped',
    'duplicate-fonts-skipped',
    'mixed-layout-detected',
    'output-inside-input',
  ];
  if (result.warningCodeCatalogVersion !== 1) {
    throw new Error('Expected agent guidance to version the warning code catalog.');
  }
  for (const code of expectedWarningCodes) {
    const entry = result.warningCodeCatalog?.[code];
    if (!entry || !Array.isArray(entry.sources) || entry.sources.length === 0 || !entry.severity || !entry.suggestedAction) {
      throw new Error(`Expected warningCodeCatalog to describe ${code}.`);
    }
  }
  const sourceText = await fs.readFile(new URL('./font-split.js', import.meta.url), 'utf8');
  const sourceWarningCodes = new Set([...sourceText.matchAll(/push\('([^']+)',/g)].map((match) => match[1]));
  for (const code of sourceWarningCodes) {
    if (!result.warningCodeCatalog?.[code]) {
      throw new Error(`Expected warningCodeCatalog to cover source warning code ${code}.`);
    }
  }
  if (result.toolResponseFieldCatalogVersion !== 1) {
    throw new Error('Expected agent guidance to version the tool response field catalog.');
  }
  if (result.safeInvocationTemplatesVersion !== 1) {
    throw new Error('Expected agent guidance to version safe invocation templates.');
  }
  const templateIds = new Set((result.safeInvocationTemplates || []).map((item) => item.id));
  for (const requiredTemplate of ['runtime-diagnostic', 'directory-mismatch-plan', 'structure-first-large-directory', 'copy-organized-staging', 'batch-dry-run-preview', 'batch-process-reviewed-plan', 'output-audit-compact']) {
    if (!templateIds.has(requiredTemplate)) {
      throw new Error(`Expected safeInvocationTemplates to include ${requiredTemplate}.`);
    }
  }
  const mismatchTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'directory-mismatch-plan');
  if (
    mismatchTemplate?.tool !== 'organize_font_directory'
    || mismatchTemplate?.writesFiles !== false
    || mismatchTemplate?.sourceDestructive !== false
    || mismatchTemplate?.args?.workflowPreset !== 'safe-preview'
    || mismatchTemplate?.args?.dryRun !== true
    || !mismatchTemplate.inspectFields?.includes('sourceDestructive')
    || !mismatchTemplate.inspectFields?.includes('unsupportedFileSummary')
  ) {
    throw new Error('Expected directory mismatch template to be a source-safe dry-run organization plan.');
  }
  const copyTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'copy-organized-staging');
  if (
    copyTemplate?.tool !== 'organize_font_directory'
    || copyTemplate?.writesFiles !== true
    || copyTemplate?.sourceDestructive !== false
    || copyTemplate?.args?.workflowPreset !== 'reviewed-write'
    || copyTemplate?.args?.dryRun !== false
    || copyTemplate?.args?.overwriteExisting !== false
    || !copyTemplate.inspectFields?.includes('writesSourceTree')
    || !copyTemplate.inspectFields?.includes('unsupportedFileSummary')
  ) {
    throw new Error('Expected copy staging template to disclose copy-only source safety.');
  }
  const batchPreviewTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'batch-dry-run-preview');
  if (
    batchPreviewTemplate?.tool !== 'split_font_batch'
    || batchPreviewTemplate?.writesFiles !== false
    || batchPreviewTemplate?.args?.workflowPreset !== 'safe-preview'
    || batchPreviewTemplate?.args?.dryRun !== true
    || batchPreviewTemplate?.args?.includeResults !== true
    || !batchPreviewTemplate.inspectFields?.includes('safetySummary')
    || !batchPreviewTemplate.inspectFields?.includes('sourceDestructive')
    || !batchPreviewTemplate.inspectFields?.includes('writesOutputTree')
  ) {
    throw new Error('Expected batch preview template to be a no-write dry run with included results.');
  }
  for (const fieldName of result.responseFieldsToCheck || []) {
    const entry = result.toolResponseFieldCatalog?.[fieldName];
    if (!entry || !Array.isArray(entry.sourceTools) || entry.sourceTools.length === 0 || !entry.meaning || !entry.agentAction) {
      throw new Error(`Expected toolResponseFieldCatalog to describe ${fieldName}.`);
    }
  }
  const referencedFieldNames = new Set();
  for (const item of result.verificationChecklist || []) {
    for (const fieldName of item.responseFields || []) referencedFieldNames.add(fieldName);
  }
  for (const item of result.directoryWorkflowDecisionMatrix || []) {
    for (const fieldName of item.mustInspectFields || []) referencedFieldNames.add(fieldName);
  }
  for (const item of result.directoryWorkflowExamples || []) {
    for (const fieldName of item.mustInspectFields || []) referencedFieldNames.add(fieldName);
  }
  for (const item of result.safeInvocationTemplates || []) {
    for (const fieldName of item.inspectFields || []) referencedFieldNames.add(fieldName);
  }
  for (const fieldName of referencedFieldNames) {
    if (!result.toolResponseFieldCatalog?.[fieldName]) {
      throw new Error(`Expected toolResponseFieldCatalog to describe referenced inspect field ${fieldName}.`);
    }
  }
  const expectedFieldCatalogEntries = {
    workflowPresets: 'get_agent_guidance',
    workflowPreset: 'split_font_batch',
    recommendedBatchOptions: 'organize_font_directory',
    safetySummary: 'split_font_batch',
    unsupportedFileSummary: 'organize_font_directory',
    structureSummary: 'inspect_split_output',
    sourceDestructive: 'split_font_batch',
    batchWarnings: 'split_font_batch',
    inspectionWarnings: 'inspect_split_output',
    warningCodeCatalog: 'get_agent_guidance',
  };
  for (const [fieldName, toolName] of Object.entries(expectedFieldCatalogEntries)) {
    if (!result.toolResponseFieldCatalog?.[fieldName]?.sourceTools?.includes(toolName)) {
      throw new Error(`Expected toolResponseFieldCatalog.${fieldName} to include ${toolName}.`);
    }
  }
  const decisionIds = new Set((result.directoryWorkflowDecisionMatrix || []).map((item) => item.id));
  for (const requiredDecision of ['known-good-batch-layout', 'unknown-or-mixed-directory-layout', 'large-or-noisy-directory-first-pass', 'user-wants-clean-staging-directory']) {
    if (!decisionIds.has(requiredDecision)) {
      throw new Error(`Expected agent guidance decision matrix to include ${requiredDecision}.`);
    }
  }
  const structureDecision = (result.directoryWorkflowDecisionMatrix || []).find((item) => item.id === 'large-or-noisy-directory-first-pass');
  if (
    structureDecision?.recommendedOptions?.parseFonts !== false
    || !structureDecision.mustInspectFields?.includes('dedupeLimitedByParsing')
    || !structureDecision.mustInspectFields?.includes('unsupportedFileSummary')
    || !structureDecision.mustInspectFields?.includes('planActionSummary')
  ) {
    throw new Error('Expected structure-first guidance to recommend parseFonts:false and dedupe checks.');
  }
  const knownBatchDecision = (result.directoryWorkflowDecisionMatrix || []).find((item) => item.id === 'known-good-batch-layout');
  if (!knownBatchDecision?.mustInspectFields?.includes('unsupportedFileSummary') || !knownBatchDecision?.mustInspectFields?.includes('safetySummary')) {
    throw new Error('Expected direct batch guidance to require unsupportedFileSummary and safetySummary inspection.');
  }
  const mixedDecision = (result.directoryWorkflowDecisionMatrix || []).find((item) => item.id === 'unknown-or-mixed-directory-layout');
  if (!mixedDecision?.mustInspectFields?.includes('planActionSummary')) {
    throw new Error('Expected mixed-layout guidance to require planActionSummary inspection.');
  }
  const stagingDecision = (result.directoryWorkflowDecisionMatrix || []).find((item) => item.id === 'user-wants-clean-staging-directory');
  if (
    stagingDecision?.sourceDestructive !== false
    || stagingDecision?.followUpOptions?.dryRun !== false
    || !stagingDecision.mustInspectFields?.includes('unsupportedFileSummary')
    || !stagingDecision.mustInspectFields?.includes('planActionSummary')
  ) {
    throw new Error('Expected staging guidance to disclose source safety and copy-only follow-up.');
  }
  const exampleIds = new Set((result.directoryWorkflowExamples || []).map((item) => item.id));
  for (const requiredExample of ['flat-vendor-dump', 'archive-per-family-folders', 'mixed-root-and-nested-fonts', 'large-noisy-first-pass']) {
    if (!exampleIds.has(requiredExample)) {
      throw new Error(`Expected agent guidance examples to include ${requiredExample}.`);
    }
  }
  const noisyExample = (result.directoryWorkflowExamples || []).find((item) => item.id === 'large-noisy-first-pass');
  if (
    noisyExample?.firstCall?.parseFonts !== false
    || !noisyExample.mustInspectFields?.includes('dedupeLimitedByParsing')
    || !noisyExample.mustInspectFields?.includes('unsupportedFileSummary')
    || !noisyExample.mustInspectFields?.includes('planActionSummary')
  ) {
    throw new Error('Expected noisy-directory example to use parseFonts:false and require dedupe limitation checks.');
  }
  const archiveExample = (result.directoryWorkflowExamples || []).find((item) => item.id === 'archive-per-family-folders');
  if (!archiveExample?.mustInspectFields?.includes('unsupportedFileSummary')) {
    throw new Error('Expected archive-per-family example to require unsupportedFileSummary inspection.');
  }
  const mixedExample = (result.directoryWorkflowExamples || []).find((item) => item.id === 'mixed-root-and-nested-fonts');
  if (
    mixedExample?.safety?.sourceDestructive !== false
    || !mixedExample.mustInspectFields?.includes('writesSourceTree')
    || !mixedExample.mustInspectFields?.includes('planActionSummary')
  ) {
    throw new Error('Expected mixed-layout example to disclose source safety fields.');
  }
  const checklistIds = new Set((result.verificationChecklist || []).map((item) => item.id));
  for (const requiredId of ['runtime-ready', 'layout-plan-reviewed', 'process-outcome-checked', 'fallback-disclosed', 'output-audited']) {
    if (!checklistIds.has(requiredId)) {
      throw new Error(`Expected agent guidance verification checklist to include ${requiredId}.`);
    }
  }
  const layoutChecklist = (result.verificationChecklist || []).find((item) => item.id === 'layout-plan-reviewed');
  if (!layoutChecklist?.responseFields?.includes('safetySummary')) {
    throw new Error('Expected layout verification checklist to include safetySummary.');
  }
  if (!layoutChecklist?.responseFields?.includes('recommendedNextActions')) {
    throw new Error('Expected layout verification checklist to include recommendedNextActions.');
  }
  if (!layoutChecklist?.responseFields?.includes('unsupportedFileSummary')) {
    throw new Error('Expected layout verification checklist to include unsupportedFileSummary.');
  }
  if (!layoutChecklist?.responseFields?.includes('planActionSummary')) {
    throw new Error('Expected layout verification checklist to include planActionSummary.');
  }
  const outputChecklist = (result.verificationChecklist || []).find((item) => item.id === 'output-audited');
  if (!outputChecklist?.responseFields?.includes('structureSummary')) {
    throw new Error('Expected output verification checklist to include structureSummary.');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'runtime-status') {
  const result = await getRuntimeStatus();
  if (result.ok !== true || !result.workspace?.isDirectory || !result.wasm?.isFile) {
    throw new Error('Expected runtime status to confirm workspace and WASM availability.');
  }
  if (!result.checks?.every((check) => check.ok === true)) {
    throw new Error('Expected runtime status checks to pass.');
  }
  if (result.node?.ok !== true || !result.checks.some((check) => check.name === 'node-runtime')) {
    throw new Error('Expected runtime status to validate the Node runtime.');
  }
  if (!result.cnFontSplit?.packageVersion) {
    throw new Error('Expected runtime status to include cn-font-split package version.');
  }
  if (result.wasm?.fontSplitWasmPathConfigured !== false) {
    throw new Error('Expected runtime status to report the default WASM path mode.');
  }
  if (!Array.isArray(result.recommendedActions)) {
    throw new Error('Expected runtime status to include recommendedActions.');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'font-inputs') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-input-inspect';
  console.log('Font input inspection smoke:', inputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(inputDir, 'notes.txt'), 'not a font');
  await fs.writeFile(path.join(inputDir, 'archive.zip'), 'not a font archive');
  await fs.writeFile(path.join(inputDir, 'preview.png'), 'not a font image');
  await fs.writeFile(path.join(inputDir, 'LICENSE'), 'not a font license');
  await fs.writeFile(path.join(inputDir, 'not-a-font.ttf'), 'not a real font');

  const result = await inspectFontInputs({
    inputDir,
    maxFiles: 10,
    includeFiles: true,
  });
  if (result.supportedFontCount !== 1 || result.invalidFontCount !== 1 || result.files?.[0]?.status !== 'invalid') {
    throw new Error('Expected input inspection to report one invalid font-like file.');
  }
  if (!result.inspectionWarnings?.some((warning) => warning.code === 'invalid-fonts-found')) {
    throw new Error('Expected input inspection to warn about invalid fonts.');
  }
  if (result.maxFilesHit !== false) {
    throw new Error('Expected maxFilesHit false when the scan did not exceed maxFiles.');
  }
  const unsupportedInputExtensions = new Set((result.unsupportedFileSummary?.byExtension || []).map((item) => item.extension));
  if (
    result.unsupportedFileSummary?.total !== 4
    || !unsupportedInputExtensions.has('.txt')
    || !unsupportedInputExtensions.has('.zip')
    || !unsupportedInputExtensions.has('.png')
    || !unsupportedInputExtensions.has('<none>')
  ) {
    throw new Error('Expected input inspection to summarize all unsupported file extensions.');
  }
  const truncated = await inspectFontInputs({
    inputDir,
    maxFiles: 1,
    includeFiles: false,
  });
  if (truncated.scannedFileCount !== 1 || truncated.maxFilesHit !== true || truncated.filesIncluded !== false) {
    throw new Error('Expected input inspection to report accurate maxFiles truncation.');
  }
  const truncatedInputWarningCodes = new Set((truncated.inspectionWarnings || []).map((warning) => warning.code));
  for (const expectedWarning of ['input-scan-truncated', 'input-files-omitted']) {
    if (!truncatedInputWarningCodes.has(expectedWarning)) {
      throw new Error(`Expected input inspection warning ${expectedWarning}.`);
    }
  }
  console.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ truncated }, null, 2));
} else if (scenario === 'scan-limits') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-scan-limits';
  console.log('Scan limit smoke:', inputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(inputDir, 'a-note.txt'), 'not a font');
  await fs.writeFile(path.join(inputDir, 'b-not-a-font.ttf'), 'not a real font');

  const inputInspect = await inspectFontInputs({ inputDir, maxFiles: 1, includeFiles: false });
  if (inputInspect.scannedFileCount !== 1 || inputInspect.maxFilesHit !== true) {
    throw new Error('Expected inspectFontInputs to report maxFilesHit only when more files exist.');
  }
  if (!inputInspect.inspectionWarnings?.some((warning) => warning.code === 'input-scan-truncated')) {
    throw new Error('Expected inspectFontInputs to warn about scan truncation.');
  }

  const batchPlan = await splitFontBatch({
    inputDir,
    outputRoot: `${inputDir}-output`,
    maxFiles: 1,
    limit: 1,
    dryRun: true,
    includeResults: false,
    silent: true,
  });
  if (batchPlan.scannedFileCount !== 1 || batchPlan.maxFilesHit !== true || batchPlan.processedFontCount !== 0) {
    throw new Error('Expected splitFontBatch dry-run to report accurate scan truncation without processing.');
  }
  if (
    batchPlan.safetySummary?.operationMode !== 'preview-only'
    || batchPlan.sourceDestructive !== false
    || batchPlan.sourceFilesPreserved !== true
    || batchPlan.writesSourceTree !== false
    || batchPlan.writesOutputTree !== false
    || batchPlan.mayOverwriteOutputTree !== false
  ) {
    throw new Error('Expected splitFontBatch dry-run safety summary to be source-safe and no-write.');
  }
  if (batchPlan.unsupportedFileSummary?.total !== 1 || batchPlan.unsupportedFileSummary?.byExtension?.[0]?.extension !== '.txt') {
    throw new Error('Expected splitFontBatch dry-run to summarize scanned unsupported files.');
  }
  const batchWarningCodes = new Set((batchPlan.batchWarnings || []).map((warning) => warning.code));
  for (const expectedWarning of ['dry-run-no-write', 'input-scan-truncated', 'batch-plan-omitted']) {
    if (!batchWarningCodes.has(expectedWarning)) {
      throw new Error(`Expected splitFontBatch dry-run warning ${expectedWarning}.`);
    }
  }

  const outputInspect = await inspectSplitOutput({ outDir: inputDir, maxFiles: 1 });
  if (outputInspect.fileCount !== 1 || outputInspect.maxFilesHit !== true) {
    throw new Error('Expected inspectSplitOutput to report accurate scan truncation.');
  }
  if (!outputInspect.inspectionWarnings?.some((warning) => warning.code === 'output-scan-truncated')) {
    throw new Error('Expected inspectSplitOutput to warn about output scan truncation.');
  }

  console.log(JSON.stringify({ inputInspect, batchPlan, outputInspect }, null, 2));
} else if (scenario === 'workspace-root-path') {
  const inputDir = process.argv[3] || '.';
  const outputDir = process.argv[4] || '.font-split-root-path-output';
  console.log('Workspace root path smoke:', inputDir, '->', outputDir);
  const result = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: true,
    parseFonts: false,
    includePlan: false,
    maxFiles: 5,
  });
  if (result.inputDir !== '.') {
    throw new Error(`Expected workspace root inputDir to normalize to "." but got ${JSON.stringify(result.inputDir)}.`);
  }
  if (!result.recommendedNextActions?.some((action) => action.suggestedArgs?.inputDir === '.')) {
    throw new Error('Expected recommended next actions to normalize root inputDir to ".".');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'organize-dry-run') {
  const inputDir = process.argv[3] || '.font-split-organize-input';
  const outputDir = process.argv[4] || '.font-split-organize-output';
  console.log('Directory organization dry-run smoke:', inputDir, '->', outputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(inputDir, 'FamilyA'), { recursive: true });
  await fs.writeFile(path.join(inputDir, 'FamilyA', 'not-a-font.ttf'), 'not a real font');
  await fs.writeFile(path.join(inputDir, 'notes.txt'), 'not a font');
  await fs.writeFile(path.join(inputDir, 'archive.zip'), 'not a font archive');
  await fs.writeFile(path.join(inputDir, 'preview.png'), 'not a font image');
  await fs.writeFile(path.join(inputDir, 'LICENSE'), 'not a font license');

  const result = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: true,
    includePlan: true,
    maxFiles: 10,
  });
  if (result.dryRun !== true || result.operationMode !== 'plan-only' || result.destructive !== false || result.sourceDestructive !== false || result.writesSourceTree !== false || result.writesOutputTree !== false || result.mayOverwriteOutputTree !== false) {
    throw new Error('Expected organizeFontDirectory dry-run to be source-non-destructive and plan-only.');
  }
  if (
    result.safetySummary?.operationMode !== 'plan-only'
    || result.safetySummary?.sourceDestructive !== false
    || result.safetySummary?.sourceFilesPreserved !== true
    || result.safetySummary?.writesSourceTree !== false
    || result.safetySummary?.writesOutputTree !== false
    || result.safetySummary?.writeScope !== 'none'
    || result.safetySummary?.overwriteScope !== 'none'
  ) {
    throw new Error('Expected organizeFontDirectory dry-run safetySummary to emphasize no writes and source preservation.');
  }
  if (result.layout?.layoutKind !== 'nested' || result.recommendedBatchOptions?.batchGroupBy !== 'source-dir') {
    throw new Error('Expected organization layout analysis to recommend source-dir grouping for nested input.');
  }
  if (!result.organizationWarnings?.some((warning) => warning.code === 'organization-dry-run')) {
    throw new Error('Expected organization dry-run warning.');
  }
  if (!result.organizationWarnings?.some((warning) => warning.code === 'invalid-fonts-skipped')) {
    throw new Error('Expected organization warning about skipped invalid fonts.');
  }
  if (result.planActionSummary?.total !== 1 || result.planActionSummary?.byAction?.['skipped-invalid'] !== 1) {
    throw new Error('Expected organization dry-run to summarize skipped-invalid plan actions.');
  }
  const unsupportedOrganizationExtensions = new Set((result.unsupportedFileSummary?.byExtension || []).map((item) => item.extension));
  if (
    result.unsupportedFileSummary?.total !== 4
    || !unsupportedOrganizationExtensions.has('.txt')
    || !unsupportedOrganizationExtensions.has('.zip')
    || !unsupportedOrganizationExtensions.has('.png')
    || !unsupportedOrganizationExtensions.has('<none>')
  ) {
    throw new Error('Expected organization dry-run to summarize all unsupported file extensions.');
  }
  const dryRunNextActionIds = new Set((result.recommendedNextActions || []).map((action) => action.id));
  for (const expectedAction of ['review-plan-before-writing', 'decide-on-invalid-fonts']) {
    if (!dryRunNextActionIds.has(expectedAction)) {
      throw new Error(`Expected organization dry-run next actions to include ${expectedAction}.`);
    }
  }
  for (const expectedAction of ['review-plan-before-writing', 'decide-on-invalid-fonts']) {
    const action = (result.recommendedNextActions || []).find((item) => item.id === expectedAction);
    if (!action?.inspectFields?.includes('planActionSummary')) {
      throw new Error(`Expected ${expectedAction} to require planActionSummary inspection.`);
    }
  }
  assertRecommendedNextActionInspectFields(result.recommendedNextActions, {
    organize_font_directory: result,
  }, 'organize-dry-run');
  if (await fsExists(outputDir)) {
    throw new Error('Expected organization dry-run not to create outputDir.');
  }

  const compact = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: true,
    includePlan: false,
    maxFiles: 10,
  });
  if (compact.planIncluded !== false || Object.hasOwn(compact, 'plan')) {
    throw new Error('Expected compact organization dry-run to omit plan details.');
  }
  if (compact.planActionSummary?.total !== 1 || compact.planActionSummary?.byAction?.['skipped-invalid'] !== 1) {
    throw new Error('Expected compact organization dry-run to keep plan action summary.');
  }
  console.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ compact }, null, 2));
} else if (scenario === 'organize-copy') {
  const inputDir = process.argv[3] || '.font-split-organize-copy-input';
  const outputDir = process.argv[4] || '.font-split-organize-copy-output';
  const sourcePath = path.join(inputDir, 'FamilyA', 'not-a-font.ttf');
  const targetPath = path.join(outputDir, 'FamilyA', 'not-a-font.ttf');
  const manifestPath = path.join(outputDir, 'font-organization-manifest.json');
  console.log('Directory organization copy smoke:', inputDir, '->', outputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, 'not a real font');

  const copied = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: false,
    includePlan: true,
    copyInvalidFonts: true,
    batchNamingMode: 'plain',
    maxFiles: 10,
  });
  if (copied.operationMode !== 'copy-only' || copied.sourceDestructive !== false || copied.writesSourceTree !== false || copied.writesOutputTree !== true || copied.mayOverwriteOutputTree !== false || copied.destructive !== false) {
    throw new Error('Expected organizeFontDirectory copy mode to write only the output tree without overwrite risk.');
  }
  if (
    copied.safetySummary?.operationMode !== 'copy-only'
    || copied.safetySummary?.sourceDestructive !== false
    || copied.safetySummary?.sourceFilesPreserved !== true
    || copied.safetySummary?.writesSourceTree !== false
    || copied.safetySummary?.writesOutputTree !== true
    || copied.safetySummary?.mayOverwriteOutputTree !== false
    || copied.safetySummary?.writeScope !== 'output-tree-only'
    || copied.safetySummary?.overwriteScope !== 'none'
  ) {
    throw new Error('Expected organizeFontDirectory copy safetySummary to limit writes to the output tree.');
  }
  if (copied.copiedCount !== 1 || copied.organizationManifestWritten !== true || copied.organizationManifestPath !== `${outputDir}/font-organization-manifest.json`) {
    throw new Error('Expected organizeFontDirectory copy mode to copy one file and write a manifest.');
  }
  if (copied.planActionSummary?.total !== 1 || copied.planActionSummary?.byAction?.copied !== 1) {
    throw new Error('Expected organization copy mode to summarize copied plan actions.');
  }
  if (!copied.organizationWarnings?.some((warning) => warning.code === 'organization-writes-output')) {
    throw new Error('Expected organization copy warning.');
  }
  const copyNextActionIds = new Set((copied.recommendedNextActions || []).map((action) => action.id));
  for (const expectedAction of ['inspect-organized-output', 'preview-batch-split-organized-output']) {
    if (!copyNextActionIds.has(expectedAction)) {
      throw new Error(`Expected organization copy next actions to include ${expectedAction}.`);
    }
  }
  if (await fs.readFile(sourcePath, 'utf8') !== 'not a real font') {
    throw new Error('Expected source file content to be preserved after organization copy.');
  }
  if (await fs.readFile(targetPath, 'utf8') !== 'not a real font') {
    throw new Error('Expected organized target copy to match source content.');
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.summary?.copiedCount !== 1 || manifest.entries?.[0]?.source !== `${inputDir}/FamilyA/not-a-font.ttf`) {
    throw new Error('Expected organization manifest to record the copied source.');
  }
  if (manifest.summary?.safetySummary?.sourceDestructive !== false || manifest.summary?.safetySummary?.writeScope !== 'output-tree-only') {
    throw new Error('Expected organization manifest summary to record source-safe output-only writes.');
  }
  const copiedInspect = await inspectFontInputs({
    inputDir: outputDir,
    includeFiles: false,
    maxFiles: 10,
  });
  const copiedBatchPreview = await splitFontBatch({
    inputDir: outputDir,
    outputRoot: `${outputDir}-split-preview`,
    dryRun: true,
    includeResults: true,
    maxFiles: 10,
    silent: true,
  });
  assertRecommendedNextActionInspectFields(copied.recommendedNextActions, {
    inspect_font_inputs: copiedInspect,
    split_font_batch: copiedBatchPreview,
  }, 'organize-copy');

  await fs.writeFile(sourcePath, 'replacement font-like file');
  const overwritten = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: false,
    includePlan: true,
    copyInvalidFonts: true,
    batchNamingMode: 'plain',
    overwriteExisting: true,
    maxFiles: 10,
  });
  if (overwritten.sourceDestructive !== false || overwritten.writesSourceTree !== false || overwritten.writesOutputTree !== true || overwritten.mayOverwriteOutputTree !== true || overwritten.destructive !== true) {
    throw new Error('Expected overwrite mode to flag output-tree overwrite risk while preserving source safety.');
  }
  if (
    overwritten.safetySummary?.sourceDestructive !== false
    || overwritten.safetySummary?.writesSourceTree !== false
    || overwritten.safetySummary?.writesOutputTree !== true
    || overwritten.safetySummary?.mayOverwriteOutputTree !== true
    || overwritten.safetySummary?.overwriteScope !== 'output-tree-only'
    || overwritten.safetySummary?.destructiveMeaning !== 'may-overwrite-output-tree-only'
  ) {
    throw new Error('Expected overwrite safetySummary to scope destructive risk to the output tree only.');
  }
  if (overwritten.planActionSummary?.total !== 1 || overwritten.planActionSummary?.byAction?.copied !== 1) {
    throw new Error('Expected overwrite-enabled organization copy to summarize copied plan actions.');
  }
  if (!overwritten.organizationWarnings?.some((warning) => warning.code === 'output-overwrite-enabled')) {
    throw new Error('Expected organization overwrite warning.');
  }
  if (await fs.readFile(sourcePath, 'utf8') !== 'replacement font-like file') {
    throw new Error('Expected source file content to remain after overwrite-enabled organization copy.');
  }
  if (await fs.readFile(targetPath, 'utf8') !== 'replacement font-like file') {
    throw new Error('Expected overwrite-enabled organization copy to update the target file.');
  }

  console.log(JSON.stringify({ copied, overwritten }, null, 2));
} else if (scenario === 'organize-valid-font') {
  const inputDir = process.argv[3] || '.font-split-organize-valid-input';
  const outputDir = process.argv[4] || '.font-split-organize-valid-output';
  const sourceA = path.join(inputDir, 'Loose', 'FixtureSans-Regular.ttf');
  const sourceB = path.join(inputDir, 'Duplicate', 'FixtureSans-Regular.ttf');
  const targetPath = path.join(outputDir, 'Fixture Sans', 'FixtureSans-Regular.ttf');
  const fixtureFont = buildMinimalTtf({
    familyName: 'Fixture Sans',
    subfamilyName: 'Regular',
    glyphCount: 3,
  });
  console.log('Directory organization valid-font smoke:', inputDir, '->', outputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(sourceA), { recursive: true });
  await fs.mkdir(path.dirname(sourceB), { recursive: true });
  await fs.writeFile(sourceA, fixtureFont);
  await fs.writeFile(sourceB, fixtureFont);

  const inspection = await inspectFontInputs({
    inputDir,
    includeFiles: true,
    maxFiles: 10,
  });
  if (inspection.validFontCount !== 2 || inspection.invalidFontCount !== 0 || inspection.files?.[0]?.glyphCount !== 3) {
    throw new Error('Expected generated fixture fonts to parse as valid inputs with glyph counts.');
  }
  if (!inspection.files?.every((file) => file.identityBasis === 'family-subfamily')) {
    throw new Error('Expected generated fixture fonts to expose family/subfamily identity.');
  }

  const result = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: false,
    includePlan: true,
    batchGroupBy: 'font-family',
    batchNamingMode: 'plain',
    batchDedupeMode: 'font-identity',
    maxFiles: 10,
  });
  if (result.operationMode !== 'copy-only' || result.validFontCount !== 2 || result.invalidFontCount !== 0 || result.deduplicatedCount !== 1 || result.skippedDuplicates !== 1 || result.copiedCount !== 1) {
    throw new Error('Expected valid-font organization to parse, identity-dedupe, and copy one representative.');
  }
  if (result.planActionSummary?.total !== 2 || result.planActionSummary?.byAction?.copied !== 1 || result.planActionSummary?.byAction?.['skipped-duplicate'] !== 1) {
    throw new Error('Expected valid-font organization to summarize copied and skipped-duplicate actions.');
  }
  if (result.layout?.layoutKind !== 'nested' || result.recommendedBatchOptions?.batchGroupBy !== 'source-dir') {
    throw new Error('Expected valid-font organization to still summarize the source directory layout.');
  }
  if (result.plan?.filter((item) => item.action === 'skipped-duplicate').length !== 1) {
    throw new Error('Expected valid-font organization plan to disclose the duplicate skipped by identity.');
  }
  const copiedPlan = result.plan?.find((item) => item.action === 'copied');
  if (!copiedPlan || copiedPlan.groupName !== 'Fixture Sans' || copiedPlan.status !== 'valid' || copiedPlan.glyphCount !== 3 || !copiedPlan.identityKey) {
    throw new Error('Expected copied valid-font plan entry to include metadata-derived group and identity details.');
  }
  if (!result.organizationWarnings?.some((warning) => warning.code === 'duplicate-fonts-skipped')) {
    throw new Error('Expected valid-font organization to warn when identity dedupe skips a duplicate.');
  }
  if (await fs.readFile(targetPath).then((content) => !content.equals(fixtureFont)).catch(() => true)) {
    throw new Error('Expected valid-font organization to copy the generated fixture font.');
  }
  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, 'font-organization-manifest.json'), 'utf8'));
  if (manifest.summary?.copiedCount !== 1 || manifest.entries?.[0]?.groupName !== 'Fixture Sans') {
    throw new Error('Expected valid-font organization manifest to record metadata-derived grouping.');
  }
  const organizedInspection = await inspectFontInputs({
    inputDir: outputDir,
    includeFiles: false,
    maxFiles: 10,
  });
  const organizedBatchPreview = await splitFontBatch({
    inputDir: outputDir,
    outputRoot: `${outputDir}-split-preview`,
    dryRun: true,
    includeResults: true,
    maxFiles: 10,
    silent: true,
  });
  assertRecommendedNextActionInspectFields(result.recommendedNextActions, {
    inspect_font_inputs: organizedInspection,
    split_font_batch: organizedBatchPreview,
  }, 'organize-valid-font');
  console.log(JSON.stringify({ inspection, result }, null, 2));
} else if (scenario === 'organize-structure-only') {
  const inputDir = process.argv[3] || '.font-split-organize-structure-input';
  const outputDir = process.argv[4] || '.font-split-organize-structure-output';
  console.log('Directory organization structure-only smoke:', inputDir, '->', outputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(inputDir, 'FamilyA'), { recursive: true });
  await fs.writeFile(path.join(inputDir, 'FamilyA', 'not-a-font.ttf'), 'not a real font');

  const result = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: true,
    includePlan: true,
    parseFonts: false,
    batchGroupBy: 'font-family',
    batchDedupeMode: 'font-identity',
    maxFiles: 10,
  });
  if (result.parsedFontMetadata !== false || result.unparsedFontCount !== 1 || result.validFontCount !== null || result.invalidFontCount !== null) {
    throw new Error('Expected structure-only organization to mark font metadata as unparsed.');
  }
  if (result.effectiveBatchDedupeMode !== 'same-path' || result.dedupeLimitedByParsing !== true) {
    throw new Error('Expected structure-only organization to downgrade identity dedupe.');
  }
  if (!result.organizationWarnings?.some((warning) => warning.code === 'font-parsing-skipped')) {
    throw new Error('Expected structure-only organization warning about skipped font parsing.');
  }
  if (result.planActionSummary?.total !== 1 || result.planActionSummary?.byAction?.['would-copy'] !== 1) {
    throw new Error('Expected structure-only organization to summarize would-copy plan actions.');
  }
  const structureNextActionIds = new Set((result.recommendedNextActions || []).map((action) => action.id));
  if (!structureNextActionIds.has('rerun-with-font-parsing')) {
    throw new Error('Expected structure-only organization next actions to recommend rerunning with font parsing.');
  }
  if (result.plan?.[0]?.status !== 'not-parsed' || result.plan?.[0]?.groupName !== 'not-a-font') {
    throw new Error('Expected structure-only organization plan to use path-based fallback details.');
  }
  for (const expectedAction of ['rerun-with-font-parsing', 'review-plan-before-writing']) {
    assertInspectFieldsExist((result.recommendedNextActions || []).find((action) => action.id === expectedAction), {
      organize_font_directory: result,
    }, 'organize-structure-only');
  }
  const structureBatchPreview = await splitFontBatch({
    inputDir,
    outputRoot: `${outputDir}-split-preview`,
    dryRun: true,
    includeResults: true,
    maxFiles: 10,
    silent: true,
  });
  assertInspectFieldsExist((result.recommendedNextActions || []).find((action) => action.id === 'preview-batch-split-original-layout'), {
    split_font_batch: structureBatchPreview,
  }, 'organize-structure-only');
  if (await fsExists(outputDir)) {
    throw new Error('Expected structure-only dry-run not to create outputDir.');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'organize-output-inside-input') {
  const inputDir = process.argv[3] || '.font-split-organize-inside-input';
  const outputDirName = process.argv[4] || 'organized-fonts';
  const outputDir = path.join(inputDir, outputDirName);
  console.log('Directory organization output-inside-input smoke:', inputDir, '->', outputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(inputDir, 'FamilyA'), { recursive: true });
  await fs.writeFile(path.join(inputDir, 'FamilyA', 'not-a-font.ttf'), 'not a real font');

  const result = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: true,
    includePlan: true,
    copyInvalidFonts: true,
    batchNamingMode: 'plain',
    maxFiles: 10,
  });
  if (result.dryRun !== true || result.sourceDestructive !== false || result.writesSourceTree !== false || result.writesOutputTree !== false) {
    throw new Error('Expected output-inside-input organization smoke to stay dry-run and source-safe.');
  }
  if (!result.organizationWarnings?.some((warning) => warning.code === 'output-inside-input')) {
    throw new Error('Expected organization warning when outputDir is inside inputDir.');
  }
  const avoidAction = (result.recommendedNextActions || []).find((action) => action.id === 'avoid-reprocessing-organized-copies');
  if (!avoidAction || avoidAction.tool !== 'split_font_batch' || avoidAction.suggestedArgs?.inputDir !== `${inputDir}/${outputDirName}`) {
    throw new Error('Expected next action to guide agents away from reprocessing organized copies.');
  }
  if (!avoidAction.inspectFields?.includes('batchWarnings')) {
    throw new Error('Expected avoid-reprocessing next action to require batch warning inspection.');
  }
  const insideBatchPreview = await splitFontBatch({
    inputDir,
    outputRoot: `${inputDir}-split-preview`,
    dryRun: true,
    includeResults: true,
    maxFiles: 10,
    silent: true,
  });
  assertInspectFieldsExist(avoidAction, {
    split_font_batch: insideBatchPreview,
  }, 'organize-output-inside-input');
  if (await fsExists(outputDir)) {
    throw new Error('Expected output-inside-input dry-run not to create outputDir.');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'batch-run-cli') {
  const inputDir = process.argv[3] || '.font-split-batch-run-cli';
  const outputRoot = process.argv[4] || '.font-split-batch-run-cli-output';
  console.log('Batch runner CLI smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(inputDir, 'a-note.txt'), 'not a font');
  await fs.writeFile(path.join(inputDir, 'b-not-a-font.ttf'), 'not a real font');

  const { stdout } = await execFileAsync(process.execPath, ['batch-run.js', inputDir, outputRoot, '1', '1', '--dry-run'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FONT_SPLIT_INCLUDE_RESULTS: 'false',
    },
  });
  for (const expectedText of ['Batch warnings:', 'dry-run-no-write', 'input-scan-truncated', 'batch-plan-omitted']) {
    if (!stdout.includes(expectedText)) {
      throw new Error(`Expected batch-run CLI output to include ${expectedText}.`);
    }
  }
  console.log(stdout);
} else if (scenario === 'batch-identity-dedupe') {
  const inputDir = process.argv[3] || '.font-split-batch-identity-input';
  const outputRoot = process.argv[4] || '.font-split-batch-identity-output';
  const ttfPath = path.join(inputDir, 'Ttf', 'FixtureSans-Regular.ttf');
  const otfPath = path.join(inputDir, 'Otf', 'FixtureSans-Regular.otf');
  console.log('Batch identity dedupe smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(ttfPath), { recursive: true });
  await fs.mkdir(path.dirname(otfPath), { recursive: true });
  await fs.writeFile(ttfPath, buildMinimalTtf({
    familyName: 'Fixture Sans',
    subfamilyName: 'Regular',
    glyphCount: 3,
  }));
  await fs.writeFile(otfPath, buildMinimalTtf({
    familyName: 'Fixture Sans',
    subfamilyName: 'Regular',
    glyphCount: 5,
  }));

  const inspection = await inspectFontInputs({
    inputDir,
    includeFiles: true,
    maxFiles: 10,
  });
  const identityKeys = new Set((inspection.files || []).map((file) => file.identityKey));
  const glyphCounts = new Set((inspection.files || []).map((file) => file.glyphCount));
  if (inspection.validFontCount !== 2 || identityKeys.size !== 1 || glyphCounts.size !== 2) {
    throw new Error('Expected fixture fonts to share identity while exposing different glyph counts.');
  }

  const identityDedupe = await splitFontBatch({
    inputDir,
    outputRoot,
    dryRun: true,
    includeResults: true,
    limit: 10,
    maxFiles: 10,
    batchGroupBy: 'font-family',
    batchDedupeMode: 'font-identity',
    batchNamingMode: 'numeric-suffix',
    skipMode: 'force',
    silent: true,
  });
  if (identityDedupe.discoveredFontCount !== 2 || identityDedupe.deduplicatedCount !== 1 || identityDedupe.skippedDuplicates !== 1 || identityDedupe.planned?.length !== 1) {
    throw new Error('Expected font-identity batch dedupe to collapse same-identity fonts despite glyph count differences.');
  }
  if (identityDedupe.planned[0].input !== `${inputDir}/Otf/FixtureSans-Regular.otf`) {
    throw new Error('Expected .otf representative to win over .ttf for same-identity batch inputs.');
  }

  const pathDedupe = await splitFontBatch({
    inputDir,
    outputRoot,
    dryRun: true,
    includeResults: true,
    limit: 10,
    maxFiles: 10,
    batchGroupBy: 'font-family',
    batchDedupeMode: 'same-path',
    batchNamingMode: 'numeric-suffix',
    skipMode: 'force',
    silent: true,
  });
  if (pathDedupe.deduplicatedCount !== 2 || pathDedupe.skippedDuplicates !== 0 || pathDedupe.planned?.length !== 2) {
    throw new Error('Expected same-path batch dedupe to keep same-identity fonts from different source paths.');
  }
  const pathDedupeSplitDirNames = new Set(pathDedupe.planned.map((item) => item.splitDirName));
  if (!pathDedupeSplitDirNames.has('FixtureSans-Regular') || !pathDedupeSplitDirNames.has('FixtureSans-Regular-1')) {
    throw new Error('Expected numeric-suffix batch naming to avoid same-run splitDirName collisions.');
  }
  if (await fsExists(outputRoot)) {
    throw new Error('Expected batch identity dry-runs not to create outputRoot.');
  }
  console.log(JSON.stringify({ inspection, identityDedupe, pathDedupe }, null, 2));
} else if (scenario === 'workflow-presets') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-preset-input';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-preset-output';
  console.log('Workflow preset smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(inputDir, 'Otf'), { recursive: true });
  await fs.mkdir(path.join(inputDir, 'Ttf'), { recursive: true });
  const otfPath = path.join(inputDir, 'Otf', 'FixtureSans-Regular.otf');
  const ttfPath = path.join(inputDir, 'Ttf', 'FixtureSans-Regular.ttf');
  await fs.writeFile(otfPath, buildMinimalTtf({ familyName: 'Fixture Sans', subfamilyName: 'Regular', glyphCount: 5 }));
  await fs.writeFile(ttfPath, buildMinimalTtf({ familyName: 'Fixture Sans', subfamilyName: 'Regular', glyphCount: 3 }));
  await fs.writeFile(path.join(inputDir, 'notes.txt'), 'not a font');

  const safePreview = await splitFontBatch({
    inputDir,
    outputRoot,
    workflowPreset: 'safe-preview',
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (
    safePreview.workflowPreset !== 'safe-preview'
    || safePreview.dryRun !== true
    || safePreview.safetySummary?.operationMode !== 'preview-only'
    || safePreview.sourceDestructive !== false
    || safePreview.writesSourceTree !== false
    || safePreview.writesOutputTree !== false
    || safePreview.mayOverwriteOutputTree !== false
    || safePreview.resultsIncluded !== true
    || safePreview.strictMode !== true
    || safePreview.skipMode !== 'manifest'
    || safePreview.batchErrorMode !== 'fail-after'
    || safePreview.batchNamingMode !== 'numeric-suffix'
    || safePreview.batchDedupeMode !== 'font-identity'
    || safePreview.deduplicatedCount !== 1
    || safePreview.skippedDuplicates !== 1
    || safePreview.unsupportedFileSummary?.total !== 1
  ) {
    throw new Error('Expected safe-preview preset to apply no-write strict batch defaults.');
  }
  if (await fsExists(outputRoot)) {
    throw new Error('Expected safe-preview preset not to create outputRoot.');
  }

  const preserveAll = await splitFontBatch({
    inputDir,
    outputRoot,
    workflowPreset: 'preserve-all',
    dryRun: true,
    includeResults: true,
    batchGroupBy: 'font-family',
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (
    preserveAll.workflowPreset !== 'preserve-all'
    || preserveAll.batchDedupeMode !== 'none'
    || preserveAll.deduplicatedCount !== 2
    || preserveAll.skippedDuplicates !== 0
  ) {
    throw new Error('Expected preserve-all preset to disable batch dedupe while allowing explicit dryRun/group overrides.');
  }

  const structureFirstBatch = await splitFontBatch({
    inputDir,
    outputRoot,
    workflowPreset: 'structure-first',
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (
    structureFirstBatch.workflowPreset !== 'structure-first'
    || structureFirstBatch.dryRun !== true
    || structureFirstBatch.safetySummary?.operationMode !== 'preview-only'
    || structureFirstBatch.writesOutputTree !== false
    || structureFirstBatch.resultsIncluded !== false
    || structureFirstBatch.batchDedupeMode !== 'same-path'
    || structureFirstBatch.deduplicatedCount !== 2
    || structureFirstBatch.skippedDuplicates !== 0
  ) {
    throw new Error('Expected structure-first batch preset to use no-write same-path structural defaults.');
  }

  const structureFirstBatchOverride = await splitFontBatch({
    inputDir,
    outputRoot,
    workflowPreset: 'structure-first',
    batchDedupeMode: 'font-identity',
    includeResults: true,
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (
    structureFirstBatchOverride.workflowPreset !== 'structure-first'
    || structureFirstBatchOverride.batchDedupeMode !== 'font-identity'
    || structureFirstBatchOverride.resultsIncluded !== true
    || structureFirstBatchOverride.deduplicatedCount !== 1
    || structureFirstBatchOverride.skippedDuplicates !== 1
  ) {
    throw new Error('Expected explicit batch arguments to override structure-first preset defaults.');
  }

  const undefinedOverridePreview = await splitFontBatch({
    inputDir,
    outputRoot,
    workflowPreset: 'safe-preview',
    dryRun: undefined,
    includeResults: undefined,
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (undefinedOverridePreview.dryRun !== true || undefinedOverridePreview.resultsIncluded !== true) {
    throw new Error('Expected undefined explicit values not to erase workflowPreset defaults.');
  }

  const structureFirst = await organizeFontDirectory({
    inputDir,
    outputDir: outputRoot,
    workflowPreset: 'structure-first',
    maxFiles: 20,
  });
  if (
    structureFirst.workflowPreset !== 'structure-first'
    || structureFirst.dryRun !== true
    || structureFirst.parsedFontMetadata !== false
    || structureFirst.planIncluded !== false
    || structureFirst.effectiveBatchDedupeMode !== 'same-path'
    || structureFirst.dedupeLimitedByParsing !== true
  ) {
    throw new Error('Expected structure-first preset to apply no-write metadata-free organization defaults.');
  }

  const explicitOverride = await organizeFontDirectory({
    inputDir,
    outputDir: outputRoot,
    workflowPreset: 'structure-first',
    parseFonts: true,
    includePlan: true,
    maxFiles: 20,
  });
  if (
    explicitOverride.workflowPreset !== 'structure-first'
    || explicitOverride.parsedFontMetadata !== true
    || explicitOverride.planIncluded !== true
    || explicitOverride.effectiveBatchDedupeMode !== 'font-identity'
  ) {
    throw new Error('Expected explicit organization arguments to override workflowPreset defaults.');
  }

  console.log(JSON.stringify({
    safePreview,
    preserveAll,
    structureFirstBatch,
    structureFirstBatchOverride,
    undefinedOverridePreview,
    structureFirst,
    explicitOverride,
  }, null, 2));
} else if (scenario === 'inspect-compact') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-inspect-compact';
  console.log('Compact output inspection smoke:', inputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(inputDir, 'Nested'), { recursive: true });
  await fs.writeFile(path.join(inputDir, 'sample.txt'), 'sample');
  await fs.writeFile(path.join(inputDir, 'Nested', 'result.css'), 'body{}');

  const compact = await inspectSplitOutput({
    outDir: inputDir,
    includeFiles: false,
    includeFamilies: false,
  });
  if (compact.filesIncluded !== false || compact.familiesIncluded !== false) {
    throw new Error('Expected compact output inspection to mark files and families as omitted.');
  }
  if (Object.hasOwn(compact, 'files') || Object.hasOwn(compact, 'families')) {
    throw new Error('Expected compact output inspection to omit files[] and families[].');
  }
  if (compact.fileCount !== 2 || compact.familyCount < 1) {
    throw new Error('Expected compact output inspection to retain summary counts.');
  }
  const compactWarningCodes = new Set((compact.inspectionWarnings || []).map((warning) => warning.code));
  for (const expectedWarning of ['output-files-omitted', 'output-families-omitted', 'legacy-output-detected']) {
    if (!compactWarningCodes.has(expectedWarning)) {
      throw new Error(`Expected compact output inspection warning ${expectedWarning}.`);
    }
  }
  console.log(JSON.stringify(compact, null, 2));
} else if (scenario === 'inspect-structure') {
  const outDir = process.argv[3] || 'font-split-mcp/.font-split-inspect-structure';
  console.log('Structured output inspection smoke:', outDir);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, 'FamilyA', 'FixtureSans-Regular'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'FamilyB', 'FixtureSerif-Regular'), { recursive: true });
  await fs.writeFile(path.join(outDir, 'FamilyA', 'FixtureSans-Regular.ttf'), 'font-a');
  await fs.writeFile(path.join(outDir, 'FamilyA', 'FixtureSans-Regular', 'FixtureSans-Regular.woff2'), 'woff2-a');
  await fs.writeFile(path.join(outDir, 'FamilyA', 'FixtureSans-Regular', 'result.css'), 'body{}');
  await fs.writeFile(
    path.join(outDir, 'FamilyA', 'FixtureSans-Regular', 'split-meta.json'),
    JSON.stringify({
      manifestVersion: 1,
      toolVersion: '0.0.0',
      result: {
        outputMode: 'subset',
        resultType: 'subset',
      },
    }, null, 2),
  );
  await fs.writeFile(path.join(outDir, 'FamilyB', 'FixtureSerif-Regular.otf'), 'font-b');
  await fs.writeFile(path.join(outDir, 'FamilyB', 'FixtureSerif-Regular', 'FixtureSerif-Regular.woff2'), 'woff2-b');
  await fs.writeFile(path.join(outDir, 'FamilyB', 'FixtureSerif-Regular', 'result.css'), 'body{}');
  await fs.writeFile(
    path.join(outDir, 'FamilyB', 'FixtureSerif-Regular', 'split-meta.json'),
    JSON.stringify({
      manifestVersion: 1,
      toolVersion: '0.0.0',
      result: {
        outputMode: 'subset',
        resultType: 'subset',
      },
    }, null, 2),
  );

  const clean = await inspectSplitOutput({
    outDir,
    includeFiles: false,
    includeFamilies: false,
  });
  if (
    clean.structureSummary?.conforms !== true
    || clean.structureSummary?.layoutKind !== 'family-tree'
    || clean.structureSummary?.unexpectedFileCount !== 0
    || clean.structureSummary?.manifestCoverageOk !== true
  ) {
    throw new Error('Expected clean structured output to conform to the documented directory layout.');
  }
  if ((clean.inspectionWarnings || []).some((warning) => warning.code === 'output-structure-issues')) {
    throw new Error('Expected clean structured output not to raise structure warnings.');
  }

  await fs.writeFile(path.join(outDir, 'notes.txt'), 'stray file');
  const noisy = await inspectSplitOutput({
    outDir,
    includeFiles: false,
    includeFamilies: false,
  });
  if (
    noisy.structureSummary?.conforms !== false
    || noisy.structureSummary?.unexpectedFileCount < 1
    || !noisy.structureSummary?.issues?.some((issue) => issue.code === 'unexpected-output-files')
    || !noisy.inspectionWarnings?.some((warning) => warning.code === 'output-structure-issues')
  ) {
    throw new Error('Expected stray output files to fail the structure audit.');
  }

  await fs.mkdir(path.join(outDir, 'FamilyA', 'FixtureSans-Regular', 'extra'), { recursive: true });
  await fs.writeFile(path.join(outDir, 'FamilyA', 'FixtureSans-Regular', 'extra', 'deep.txt'), 'wrong depth');
  const wrongDepth = await inspectSplitOutput({
    outDir,
    includeFiles: false,
    includeFamilies: false,
  });
  if (
    wrongDepth.structureSummary?.conforms !== false
    || wrongDepth.structureSummary?.unexpectedDepthFileCount < 1
    || !wrongDepth.structureSummary?.issues?.some((issue) => issue.code === 'unexpected-output-depth')
  ) {
    throw new Error('Expected files below the documented output depth to fail the structure audit.');
  }

  const batchInputDir = `${outDir}-batch-input`;
  const batchOutputRoot = `${outDir}-batch-output`;
  await fs.rm(batchInputDir, { recursive: true, force: true });
  await fs.rm(batchOutputRoot, { recursive: true, force: true });
  await fs.mkdir(batchInputDir, { recursive: true });
  await fs.writeFile(
    path.join(batchInputDir, 'FixtureSans-Regular.ttf'),
    buildMinimalTtf({ familyName: 'Fixture Sans', subfamilyName: 'Regular', glyphCount: 5 }),
  );
  const batchWrite = await splitFontBatch({
    inputDir: batchInputDir,
    outputRoot: batchOutputRoot,
    workflowPreset: 'reviewed-write',
    batchGroupBy: 'font-family',
    smallGlyphAction: 'copy-original',
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  const batchInspect = await inspectSplitOutput({
    outDir: batchOutputRoot,
    includeFiles: false,
    includeFamilies: false,
  });
  const batchInspectDetailed = await inspectSplitOutput({
    outDir: batchOutputRoot,
    includeFiles: false,
    includeFamilies: true,
  });
  const batchManifest = batchInspectDetailed.families?.[0]?.fontEntries?.[0]?.manifest;
  if (
    batchWrite.workflowPreset !== 'reviewed-write'
    || batchWrite.dryRun !== false
    || batchWrite.safetySummary?.operationMode !== 'batch-output'
    || batchWrite.sourceDestructive !== false
    || batchWrite.sourceFilesPreserved !== true
    || batchWrite.writesSourceTree !== false
    || batchWrite.writesOutputTree !== true
    || batchWrite.mayOverwriteOutputTree !== true
    || batchWrite.processedFontCount !== 1
    || batchInspect.structureSummary?.conforms !== true
    || batchInspect.structureSummary?.layoutKind !== 'family-tree'
    || batchInspect.structureSummary?.manifestCoverageOk !== true
    || batchInspect.copyOriginalOutputCount !== 1
    || batchInspect.structureSummary?.outputModeCounts?.['copy-original'] !== 1
  ) {
    throw new Error('Expected real batch copy-original output to match the documented output directory structure.');
  }
  if (Object.hasOwn(batchManifest?.effectiveConfig || {}, 'workflowPreset')) {
    throw new Error('Expected workflowPreset shorthand not to be stored as an output-affecting manifest config.');
  }

  console.log(JSON.stringify({ clean, noisy, wrongDepth, batchWrite, batchInspect }, null, 2));
} else if (scenario === 'mcp-error') {
  const detailedError = new Error('batch failed');
  detailedError.name = 'BatchSplitError';
  detailedError.details = {
    mode: 'fail-after',
    errors: [{ file: 'bad.ttf', error: 'not a font' }],
    summary: { errorCount: 1 },
  };
  const detailed = errorText(detailedError);
  const parsed = JSON.parse(detailed.content[0].text);
  if (detailed.isError !== true || parsed.name !== 'BatchSplitError' || parsed.details?.errors?.[0]?.file !== 'bad.ttf') {
    throw new Error('Expected MCP error response to preserve structured details.');
  }

  const plain = errorText(new Error('plain failure'));
  if (plain.content[0].text !== 'plain failure') {
    throw new Error('Expected plain MCP error response to stay concise.');
  }
  console.log(JSON.stringify({ detailed: parsed, plain: plain.content[0].text }, null, 2));
} else if (scenario === 'mcp-schema') {
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
    const expectDescriptionIncludes = (toolName, phrases) => {
      const description = tools[toolName]?.description || '';
      for (const phrase of phrases) {
        if (!description.includes(phrase)) {
          throw new Error(`${toolName} description is missing ${phrase}`);
        }
      }
    };
    const batchOnly = ['strictMode', 'skipMode', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode', 'debugBatchDecisions'];
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
    for (const requiredOrganizeProp of ['dryRun', 'outputDir', 'overwriteExisting', 'copyInvalidFonts']) {
      if (!Object.hasOwn(organizeProps, requiredOrganizeProp)) {
        throw new Error(`organize_font_directory is missing ${requiredOrganizeProp}`);
      }
    }
    if (!Object.hasOwn(batchProps, 'workflowPreset') || !Object.hasOwn(organizeProps, 'workflowPreset')) {
      throw new Error('Expected batch and organization tools to expose workflowPreset.');
    }
    expectDescriptionIncludes('get_agent_guidance', ['directoryWorkflowDecisionMatrix', 'safeInvocationTemplates', 'warningCodeCatalog', 'toolResponseFieldCatalog', 'response fields to inspect', 'detailLevel', 'sections']);
    expectDescriptionIncludes('split_font', ['writes output files', 'resultType', 'usedFallback']);
    expectDescriptionIncludes('split_font_batch', ['dryRun defaults to false', 'includeResults:true', 'batchWarnings']);
    expectDescriptionIncludes('organize_font_directory', ['dryRun true', 'source-non-destructive', 'never moves or deletes source files']);
    expectDescriptionIncludes('inspect_split_output', ['structureSummary', 'maxFilesHit', 'inspectionWarnings', 'includeFiles:false']);
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
} else if (scenario === 'batch-compact') {
  const inputDir = process.argv[3] || '0xA000';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-batch-compact-output';
  console.log('Batch compact response smoke:', inputDir, '->', outputRoot);
  const result = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 2,
    maxFiles: 50,
    includeResults: false,
    skipMode: 'force',
    batchNamingMode: 'numeric-suffix',
    batchDedupeMode: 'font-identity',
    chunkSize: 70 * 1024,
    silent: true,
  });
  if (result.resultsIncluded !== false || Object.hasOwn(result, 'results')) {
    throw new Error('Expected compact batch response to omit results.');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'batch-dry-run') {
  const inputDir = process.argv[3] || '0xA000';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-batch-dry-run-output';
  console.log('Batch dry-run smoke:', inputDir, '->', outputRoot);
  const result = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 2,
    maxFiles: 50,
    dryRun: true,
    includeResults: true,
    skipMode: 'force',
    batchNamingMode: 'numeric-suffix',
    batchDedupeMode: 'font-identity',
    chunkSize: 70 * 1024,
    silent: true,
  });
  if (result.dryRun !== true || result.planIncluded !== true || !Array.isArray(result.planned)) {
    throw new Error('Expected dry-run batch response to include planned output.');
  }
  if (Object.hasOwn(result, 'results')) {
    throw new Error('Expected dry-run batch response to omit results.');
  }
  if (await fsExists(outputRoot)) {
    throw new Error('Expected dry-run not to create outputRoot.');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'batch-error-mode') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-error-mode-input';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-error-mode-output';
  console.log('Batch error mode smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(inputDir, 'not-a-font.ttf'), 'not a real font');

  const collect = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 2,
    maxFiles: 10,
    skipMode: 'force',
    batchErrorMode: 'collect',
    silent: true,
  });
  if (collect.ok !== true || collect.errorCount !== 1 || collect.batchErrorMode !== 'collect') {
    throw new Error('Expected collect mode to return one collected error.');
  }

  let threw = false;
  try {
    await splitFontBatch({
      inputDir,
      outputRoot,
      limit: 2,
      maxFiles: 10,
      skipMode: 'force',
      batchErrorMode: 'fail-after',
      silent: true,
    });
  } catch (error) {
    threw = true;
    if (error.name !== 'BatchSplitError' || error.details?.errors?.length !== 1) {
      throw error;
    }
  }
  if (!threw) {
    throw new Error('Expected fail-after mode to throw BatchSplitError.');
  }

  console.log(JSON.stringify({
    collect: {
      ok: collect.ok,
      batchErrorMode: collect.batchErrorMode,
      errorCount: collect.errorCount,
      errors: collect.errors,
    },
    failAfterThrew: threw,
  }, null, 2));
} else if (scenario === 'batch-strict') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-strict-input';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-strict-output';
  console.log('Batch strict mode smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(inputDir, 'not-a-font.ttf'), 'not a real font');

  let strictThrew = false;
  try {
    await splitFontBatch({
      inputDir,
      outputRoot,
      limit: 2,
      maxFiles: 10,
      strictMode: true,
      silent: true,
    });
  } catch (error) {
    strictThrew = true;
    if (error.name !== 'BatchSplitError' || error.details?.mode !== 'fail-after') {
      throw error;
    }
  }
  if (!strictThrew) {
    throw new Error('Expected strictMode to default batchErrorMode to fail-after.');
  }

  const overridden = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 2,
    maxFiles: 10,
    strictMode: true,
    skipMode: 'force',
    batchErrorMode: 'collect',
    silent: true,
  });
  if (overridden.strictMode !== true || overridden.skipMode !== 'force' || overridden.batchErrorMode !== 'collect' || overridden.errorCount !== 1) {
    throw new Error('Expected explicit batch options to override strictMode defaults.');
  }

  console.log(JSON.stringify({
    strictThrew,
    overridden: {
      strictMode: overridden.strictMode,
      skipMode: overridden.skipMode,
      batchErrorMode: overridden.batchErrorMode,
      errorCount: overridden.errorCount,
    },
  }, null, 2));
} else if (scenario === 'small-skip') {
  console.log('Small glyph copy-original smoke:', fontPath, '->', outDir);
  const result = await splitFont({
    fontPath,
    outDir,
    smallGlyphAction: 'copy-original',
    smallGlyphThreshold: 1000000,
    fontFamily: 'SmallSkipSmokeFont',
    silent: true,
  });
  console.log(JSON.stringify(result, null, 2));
  console.log('\nInspecting output:');
  console.log(JSON.stringify(await inspectSplitOutput({ outDir }), null, 2));
} else {
  throw new Error(`Unknown smoke scenario: ${scenario}`);
}

async function fsExists(filePath) {
  const { access } = await import('node:fs/promises');
  return access(filePath).then(() => true).catch(() => false);
}
