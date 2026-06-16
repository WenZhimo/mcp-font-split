import fs from 'node:fs/promises';
import path from 'node:path';
import { inspectSplitOutput, splitFontBatch } from '../font-split.js';
import { buildMinimalTtf } from './fixtures.js';
import { assertInspectFieldsExist, assertOutputAuditStatus } from './assertions.js';

async function runInspectSmoke() {
  const outDir = process.argv[3] || '0xA000/0xA000-Regular.ttf';
  console.log(JSON.stringify(await inspectSplitOutput({ outDir }), null, 2));
}

async function runInspectCompactSmoke() {
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
  assertOutputAuditStatus(compact, {
    auditStatus: 'action-required',
    auditPassed: false,
    reasonCode: 'output-structure-issues',
  }, 'inspect-compact output audit');
  const compactWarningCodes = new Set((compact.inspectionWarnings || []).map((warning) => warning.code));
  for (const expectedWarning of ['output-files-omitted', 'output-families-omitted', 'missing-manifests']) {
    if (!compactWarningCodes.has(expectedWarning)) {
      throw new Error(`Expected compact output inspection warning ${expectedWarning}.`);
    }
  }
  console.log(JSON.stringify(compact, null, 2));
}

async function runInspectStructureSmoke() {
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
  assertOutputAuditStatus(clean, {
    auditStatus: 'pass',
    auditPassed: true,
  }, 'inspect-structure clean output audit');
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
  assertOutputAuditStatus(noisy, {
    auditStatus: 'action-required',
    auditPassed: false,
    reasonCode: 'output-structure-issues',
    issueCode: 'unexpected-output-files',
  }, 'inspect-structure noisy output audit');

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
  assertOutputAuditStatus(wrongDepth, {
    auditStatus: 'action-required',
    auditPassed: false,
    reasonCode: 'output-structure-issues',
    issueCode: 'unexpected-output-depth',
  }, 'inspect-structure wrong-depth output audit');

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
  const auditAction = (batchWrite.recommendedNextActions || []).find((action) => action.id === 'audit-split-output');
  if (
    batchWrite.workflowPreset !== 'reviewed-write'
    || batchWrite.dryRun !== false
    || batchWrite.safetySummary?.operationMode !== 'batch-output'
    || batchWrite.sourceDestructive !== false
    || batchWrite.sourceFilesPreserved !== true
    || batchWrite.writesSourceTree !== false
    || batchWrite.writesOutputTree !== true
    || batchWrite.outputTreeInsideInputTree !== false
    || batchWrite.mayOverwriteOutputTree !== true
    || batchWrite.processedFontCount !== 1
    || batchInspect.auditStatus !== 'pass'
    || batchInspect.auditPassed !== true
    || batchInspect.outputStructureDecision?.status !== 'pass'
    || batchInspect.outputStructureDecision?.recommendedAction !== 'continue'
    || batchInspect.auditBlockingReasons?.length !== 0
    || batchInspect.structureSummary?.conforms !== true
    || batchInspect.structureSummary?.layoutKind !== 'family-tree'
    || batchInspect.structureSummary?.manifestCoverageOk !== true
    || batchInspect.copyOriginalOutputCount !== 1
    || batchInspect.structureSummary?.outputModeCounts?.['copy-original'] !== 1
    || batchWrite.recommendedNextActionCount !== (batchWrite.recommendedNextActions || []).length
    || batchWrite.batchDecision?.route !== 'audit-written-output'
    || batchWrite.batchDecision?.preferredNextActionId !== 'audit-split-output'
    || batchWrite.batchDecision?.nextTool !== 'inspect_split_output'
    || batchWrite.batchDecision?.auditArgs?.outDir !== batchOutputRoot
    || batchWrite.batchDecision?.requiresOutputAudit !== true
    || auditAction?.tool !== 'inspect_split_output'
    || auditAction?.suggestedArgsField !== 'batchDecision.auditArgs'
    || auditAction?.suggestedArgs?.outDir !== batchOutputRoot
    || auditAction?.suggestedArgs?.includeFiles !== false
    || auditAction?.suggestedArgs?.includeFamilies !== false
    || !auditAction.inspectFields?.includes('outputStructureDecision')
    || !auditAction.inspectFields?.includes('auditStatus')
    || !auditAction.inspectFields?.includes('structureSummary')
  ) {
    throw new Error('Expected real batch copy-original output to match the documented output directory structure.');
  }
  assertInspectFieldsExist(auditAction, {
    inspect_split_output: batchInspect,
  }, 'inspect-structure batch audit action');
  if (Object.hasOwn(batchManifest?.effectiveConfig || {}, 'workflowPreset')) {
    throw new Error('Expected workflowPreset shorthand not to be stored as an output-affecting manifest config.');
  }

  console.log(JSON.stringify({ clean, noisy, wrongDepth, batchWrite, batchInspect }, null, 2));
}

async function runInspectOrganizedStagingSmoke() {
  const outDir = process.argv[3] || 'font-split-mcp/.font-split-inspect-organized-staging';
  console.log('Organized staging inspection smoke:', outDir);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, 'FamilyA'), { recursive: true });
  await fs.writeFile(
    path.join(outDir, 'FamilyA', 'FixtureSans-Regular.ttf'),
    buildMinimalTtf({ familyName: 'Fixture Sans', subfamilyName: 'Regular', glyphCount: 5 }),
  );
  await fs.writeFile(path.join(outDir, 'font-organization-manifest.json'), JSON.stringify({
    manifestVersion: 1,
    toolVersion: '0.0.0',
    result: {
      operationMode: 'copy-only',
      sourceDestructive: false,
      outputDirRole: 'organized-font-source-staging',
      isSplitOutput: false,
    },
  }, null, 2));

  const stagingAudit = await inspectSplitOutput({
    outDir,
    includeFiles: false,
    includeFamilies: false,
  });
  if (
    stagingAudit.outputRoleDecision?.summaryType !== 'output-role-decision'
    || stagingAudit.outputRoleDecision?.detectedRole !== 'organized-font-source-staging'
    || stagingAudit.outputRoleDecision?.isSplitOutput !== false
    || stagingAudit.outputRoleDecision?.recommendedAction !== 'inspect-staging-as-input-then-batch-preview'
    || stagingAudit.outputRoleDecision?.organizationManifestPath !== `${outDir}/font-organization-manifest.json`
    || stagingAudit.auditStatus === 'pass'
    || stagingAudit.outputStructureDecision?.status === 'pass'
    || stagingAudit.outputStructureDecision?.recommendedAction !== 'inspect-staging-as-input-then-batch-preview'
    || !stagingAudit.outputStructureDecision?.blockingReasonCodes?.includes('not-split-output')
    || !stagingAudit.inspectionWarnings?.some((warning) => warning.code === 'organized-staging-not-split-output')
    || !stagingAudit.auditBlockingReasons?.some((reason) => reason.code === 'not-split-output')
  ) {
    throw new Error('Expected organized staging output to be flagged as source staging, not split output.');
  }
  console.log(JSON.stringify(stagingAudit, null, 2));
}

export {
  runInspectSmoke,
  runInspectCompactSmoke,
  runInspectStructureSmoke,
  runInspectOrganizedStagingSmoke,
};
