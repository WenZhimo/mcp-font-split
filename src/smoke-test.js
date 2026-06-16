import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
  WORKFLOW_PRESET_NAMES,
  getAgentGuidance,
  getRuntimeStatus,
  inspectFontInputs,
  inspectSplitOutput,
  organizeFontDirectory,
  splitFont,
  splitFontBatch,
} from './font-split.js';
import { runMcpErrorSmoke, runMcpSchemaSmoke } from './smoke/mcp-scenarios.js';
import {
  runInspectSmoke,
  runInspectCompactSmoke,
  runInspectStructureSmoke,
  runInspectOrganizedStagingSmoke,
} from './smoke/inspect-scenarios.js';
import {
  runRuntimeStatusSmoke,
  runFontInputsSmoke,
  runScanLimitsSmoke,
  runWorkspaceRootPathSmoke,
} from './smoke/input-scenarios.js';
import { runAgentGuidanceSmoke } from './smoke/guidance-scenarios.js';
import {
  runOrganizeDryRunSmoke,
  runOrganizeCopySmoke,
  runOrganizeValidFontSmoke,
  runOrganizeStructureOnlySmoke,
  runOrganizeOutputInsideInputSmoke,
} from './smoke/organize-scenarios.js';
import { buildMinimalTtf } from './smoke/fixtures.js';
import { runApiDocsSmoke, runBehaviorDocsSmoke } from './smoke/docs-checks.js';
import {
  assertInspectFieldsExist,
  assertRecommendedNextActionInspectFields,
  assertSourceLayoutDecisionChecklistCompanionFields,
  assertNonEmptyString,
  assertNonEmptyStringArray,
  assertNonEmptyArray,
  assertGuidanceItemsHaveCompletionProof,
  assertDirectoryRouteInspectFields,
  assertNextToolDecisionSummary,
  assertRecommendedWorkflowPlanHasCompletionProof,
  assertBatchPolicyGuide,
  assertBatchPolicySummary,
  assertConfigurationTrace,
  assertSourceSafetyDecision,
  assertDirectoryWorkflowSummary,
  assertLayoutDecision,
  assertStagingDirectoryDecision,
  assertTemplateOmitsArgs,
  assertObjectOmitsKeys,
  assertOutputAuditStatus,
  assertActionSuggestedArgsOmit,
  isInsidePath,
  assertSafeRecommendedBatchPreviewArgs,
  assertSuggestedArgsPreserveMaxFiles,
} from './smoke/assertions.js';
import {
  DEFAULT_REAL_CORPUS_TARGETS,
  DEFAULT_REAL_CORPUS_TARGET_SAMPLE_COUNT,
  REAL_CORPUS_TARGET_EXPECTATIONS,
  summarizeSourceLayoutMismatch,
  sourceLayoutMismatchSummaryCovered,
  summarizeSourceSafetyDecision,
  sourceSafetyDecisionCovered,
  summarizeInputCountGuide,
  inputCountGuideCovered,
  summarizeInputDirectoryDecision,
  inputDirectoryDecisionCovered,
  summarizeLayoutDecision,
  layoutDecisionCovered,
  summarizeStagingDirectoryDecision,
  stagingDirectoryDecisionCovered,
  assertRealCorpusStagingDirectoryDecision,
  assertRealCorpusLayoutDecision,
  assertRealCorpusSourceLayoutMismatchSummary,
  buildUnsupportedFileCategoryCoverage,
  buildArchiveHandlingScope,
  buildRealCorpusSuiteCoverageSummary,
  buildRealCorpusSuiteHumanSummary,
  buildRealCorpusCountGuide,
  buildCompactOutputStructureAuditSummary,
  buildCompactRealCorpusCoverageSummary,
  buildRealCorpusReliabilityGateDecision,
  printRealCorpusSuiteHumanSummary,
  summarizeRealCorpusSuiteRun,
  buildRealCorpusSuiteFinalOutput,
  runSmokeSubprocess,
  collectProbeFiles,
  summarizeProbeFiles,
  isRealCorpusSupportedFont,
  parseRealCorpusTargetList,
  buildRealCorpusTargetProfiles,
  scoreRealCorpusTargetProfile,
  selectRealCorpusTargets,
  findRealCorpusSample,
  findRealCorpusSampleFont,
  runRealCorpusSuiteSmoke,
  runRealCorpusReadonlySmoke,
  runRealCorpusTargetsSmoke,
  runRealCorpusIntegrationSmoke,
} from './smoke/real-corpus.js';

const execFileAsync = promisify(execFile);
const scenario = process.argv[2] || 'single';
const fontPath = process.argv[3] || '0xA000/0xA000-Regular.ttf';
const outDir = process.argv[4] || 'font-split-mcp/.font-split-smoke-output';
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
  await runInspectSmoke();
} else if (scenario === 'agent-guidance') {
  await runAgentGuidanceSmoke();
} else if (scenario === 'runtime-status') {
  await runRuntimeStatusSmoke();
} else if (scenario === 'font-inputs') {
  await runFontInputsSmoke();
} else if (scenario === 'scan-limits') {
  await runScanLimitsSmoke();
} else if (scenario === 'workspace-root-path') {
  await runWorkspaceRootPathSmoke();
} else if (scenario === 'organize-dry-run') {
  await runOrganizeDryRunSmoke();
} else if (scenario === 'organize-copy') {
  await runOrganizeCopySmoke();
} else if (scenario === 'organize-valid-font') {
  await runOrganizeValidFontSmoke();
} else if (scenario === 'organize-structure-only') {
  await runOrganizeStructureOnlySmoke();
} else if (scenario === 'organize-output-inside-input') {
  await runOrganizeOutputInsideInputSmoke();
} else if (scenario === 'check-compact') {
  console.log('Compact check smoke');
  const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
  if (!packageJson.scripts?.['check:syntax']?.includes('scripts/run-check-compact.js')) {
    throw new Error('compact check smoke: expected check:syntax to syntax-check scripts/run-check-compact.js.');
  }

  const parseCompactJson = (stdout, context) => {
    try {
      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(`${context}: expected compact check output to be JSON. ${error.message}`);
    }
  };

  const { stdout: passStdout, stderr: passStderr } = await execFileAsync(process.execPath, ['scripts/run-check-compact.js', '--self-test-pass', '--json'], {
    cwd: process.cwd(),
  });
  if (passStderr.trim() !== '') {
    throw new Error('compact check pass self-test: expected stderr to stay empty.');
  }
  const passResult = parseCompactJson(passStdout, 'compact check pass self-test');
  if (
    passResult.ok !== true
    || passResult.summaryType !== 'compact-check-result'
    || passResult.totalStepCount !== 2
    || passResult.completedStepCount !== 2
    || passResult.failedStepId !== null
    || passResult.steps?.some((step) => step.ok !== true || Object.hasOwn(step, 'stdoutTail'))
    || !passResult.nonIntuitiveBehavior?.includes('suppresses noisy child output')
  ) {
    throw new Error('compact check pass self-test: expected compact successful JSON summary without child output tails.');
  }

  let failStdout = '';
  let failStderr = '';
  try {
    await execFileAsync(process.execPath, ['scripts/run-check-compact.js', '--self-test-fail', '--json'], {
      cwd: process.cwd(),
    });
  } catch (error) {
    failStdout = error.stdout || '';
    failStderr = error.stderr || '';
  }
  if (failStderr.trim() !== '') {
    throw new Error('compact check fail self-test: expected --json failures to keep stderr empty.');
  }
  const failResult = parseCompactJson(failStdout, 'compact check fail self-test');
  const failedStep = failResult.steps?.find((step) => step.id === 'compact-check-self-test-fail');
  if (
    failResult.ok !== false
    || failResult.summaryType !== 'compact-check-result'
    || failResult.failedStepId !== 'compact-check-self-test-fail'
    || failedStep?.ok !== false
    || failedStep?.exitCode !== 3
    || !failedStep?.stdoutTail?.includes('before failure')
    || !failedStep?.stderrTail?.includes('synthetic failure')
  ) {
    throw new Error('compact check fail self-test: expected failing JSON summary to preserve stdout/stderr tails and failed step metadata.');
  }

  const { stdout: textStdout } = await execFileAsync(process.execPath, ['scripts/run-check-compact.js', '--self-test-pass'], {
    cwd: process.cwd(),
  });
  if (
    !textStdout.includes('mcp-font-split compact check')
    || !textStdout.includes('compact-check-result')
    || textStdout.includes('self-test pass')
  ) {
    throw new Error('compact check text self-test: expected concise text summary without child stdout spam.');
  }

  console.log(JSON.stringify({ passResult, failResult, textSummaryIncluded: true }, null, 2));
} else if (scenario === 'batch-run-cli') {
  const inputDir = process.argv[3] || '.font-split-batch-run-cli';
  const outputRoot = process.argv[4] || '.font-split-batch-run-cli-output';
  console.log('Batch runner CLI smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(inputDir, 'a-note.txt'), 'not a font');
  await fs.writeFile(path.join(inputDir, 'b-not-a-font.ttf'), 'not a real font');

  const assertCliOutputIncludes = (stdout, expectedTexts, context) => {
    for (const expectedText of expectedTexts) {
      if (!stdout.includes(expectedText)) {
        throw new Error(`${context}: expected batch-run CLI output to include ${expectedText}.`);
      }
    }
  };
  const assertExactValues = (actualValues, expectedValues, context) => {
    const actual = Array.isArray(actualValues) ? actualValues : [];
    const missing = expectedValues.filter((value) => !actual.includes(value));
    const extra = actual.filter((value) => !expectedValues.includes(value));
    if (missing.length > 0 || extra.length > 0 || actual.length !== expectedValues.length) {
      throw new Error(`${context}: expected values to match core constants; missing ${missing.join(', ') || '<none>'}; extra ${extra.join(', ') || '<none>'}.`);
    }
  };
  const parseCliJson = (stdout, context) => {
    try {
      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(`${context}: expected batch-run CLI output to be parseable JSON. ${error.message}`);
    }
  };
  const readmeText = await fs.readFile('README.md', 'utf8');
  const readmeEnText = await fs.readFile('README.en.md', 'utf8');
  if (
    !readmeText.includes('`default` 不是有效值')
    || !readmeText.includes('无效 preset 拒绝')
    || !readmeText.includes('BatchRunConfigurationError')
    || !readmeText.includes('`errorType`')
    || !readmeText.includes('枚举型、布尔型或数字型')
    || !readmeEnText.includes('`default` is not valid')
    || !readmeEnText.includes('invalid preset rejection')
    || !readmeEnText.includes('BatchRunConfigurationError')
    || !readmeEnText.includes('`errorType`')
    || !readmeEnText.includes('enum-like, boolean, or numeric')
  ) {
    throw new Error('Expected README docs to describe batch:run invalid configuration rejection.');
  }

  const { stdout: safePreviewStdout } = await execFileAsync(process.execPath, ['batch-run.js', inputDir, outputRoot, '1', '1', '--dry-run'], {
    cwd: process.cwd(),
  });
  assertCliOutputIncludes(safePreviewStdout, [
    '"workflowPreset": "safe-preview"',
    'Batch warnings:',
    'dry-run-no-write',
    'input-scan-truncated',
    'Results included: true',
  ], 'safe-preview flag run');

  const { stdout: structureFirstStdout } = await execFileAsync(process.execPath, ['batch-run.js', inputDir, outputRoot, '1', '1'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FONT_SPLIT_WORKFLOW_PRESET: 'structure-first',
    },
  });
  assertCliOutputIncludes(structureFirstStdout, [
    '"workflowPreset": "structure-first"',
    'Mode: dry-run',
    'Results included: false',
    'input-scan-truncated',
    'batch-plan-omitted',
  ], 'structure-first env preset run');

  const { stdout: includeResultsOverrideStdout } = await execFileAsync(process.execPath, ['batch-run.js', inputDir, outputRoot, '1', '1'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FONT_SPLIT_WORKFLOW_PRESET: 'structure-first',
      FONT_SPLIT_INCLUDE_RESULTS: 'true',
    },
  });
  assertCliOutputIncludes(includeResultsOverrideStdout, [
    '"workflowPreset": "structure-first"',
    '"includeResults": true',
    'Mode: dry-run',
    'Results included: true',
  ], 'includeResults env override run');
  if (includeResultsOverrideStdout.includes('batch-plan-omitted')) {
    throw new Error('includeResults env override run: expected includeResults true to keep dry-run plan details.');
  }

  let invalidPresetStdout = '';
  let invalidPresetStderr = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, '1', '1'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONT_SPLIT_WORKFLOW_PRESET: 'default',
      },
    });
  } catch (error) {
    invalidPresetStdout = error.stdout || '';
    invalidPresetStderr = error.stderr || '';
  }
  if (invalidPresetStderr.trim() !== '') {
    throw new Error('invalid workflow preset run: expected json-summary configuration errors to keep stderr empty.');
  }
  const invalidPreset = parseCliJson(invalidPresetStdout, 'invalid workflow preset run');
  if (
    invalidPreset.ok !== false
    || invalidPreset.name !== 'BatchRunConfigurationError'
    || invalidPreset.errorType !== 'configuration-error'
    || invalidPreset.options?.workflowPreset !== null
    || invalidPreset.options?.requestedWorkflowPreset !== 'default'
    || invalidPreset.details?.summaryType !== 'configuration-error'
    || invalidPreset.details?.option !== 'FONT_SPLIT_WORKFLOW_PRESET'
    || invalidPreset.details?.source !== 'env'
    || invalidPreset.details?.targetField !== 'workflowPreset'
    || invalidPreset.details?.received !== 'default'
    || invalidPreset.details?.allowedValues?.includes('default')
    || invalidPreset.details?.omitForDefaultBehavior !== true
    || !invalidPreset.error?.includes('Omit it to use batch-run')
  ) {
    throw new Error('invalid workflow preset run: expected default preset to be rejected with machine-readable allowed values.');
  }
  assertExactValues(invalidPreset.details.allowedValues, WORKFLOW_PRESET_NAMES, 'invalid workflow preset allowed values');

  let invalidDedupeStdout = '';
  let invalidDedupeStderr = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, '1', '1'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONT_SPLIT_BATCH_DEDUPE_MODE: 'semantic',
      },
    });
  } catch (error) {
    invalidDedupeStdout = error.stdout || '';
    invalidDedupeStderr = error.stderr || '';
  }
  if (invalidDedupeStderr.trim() !== '') {
    throw new Error('invalid dedupe env run: expected json-summary configuration errors to keep stderr empty.');
  }
  const invalidDedupe = parseCliJson(invalidDedupeStdout, 'invalid dedupe env run');
  if (
    invalidDedupe.ok !== false
    || invalidDedupe.name !== 'BatchRunConfigurationError'
    || invalidDedupe.errorType !== 'configuration-error'
    || invalidDedupe.options?.workflowPreset !== 'reviewed-write'
    || invalidDedupe.options?.requestedBatchDedupeMode !== 'semantic'
    || invalidDedupe.details?.summaryType !== 'configuration-error'
    || invalidDedupe.details?.option !== 'FONT_SPLIT_BATCH_DEDUPE_MODE'
    || invalidDedupe.details?.source !== 'env'
    || invalidDedupe.details?.targetField !== 'batchDedupeMode'
    || invalidDedupe.details?.received !== 'semantic'
    || !invalidDedupe.details?.allowedValues?.includes('font-identity')
    || invalidDedupe.details?.allowedValues?.includes('semantic')
    || invalidDedupe.details?.omitForDefaultBehavior !== true
    || !invalidDedupe.error?.includes('FONT_SPLIT_BATCH_DEDUPE_MODE must be one of')
  ) {
    throw new Error('invalid dedupe env run: expected invalid enum-like env var to be rejected with machine-readable allowed values.');
  }
  assertExactValues(invalidDedupe.details.allowedValues, BATCH_DEDUPE_MODES, 'invalid dedupe env allowed values');

  let invalidBooleanStdout = '';
  let invalidBooleanStderr = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, '1', '1'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONT_SPLIT_INCLUDE_RESULTS: 'maybe',
      },
    });
  } catch (error) {
    invalidBooleanStdout = error.stdout || '';
    invalidBooleanStderr = error.stderr || '';
  }
  if (invalidBooleanStderr.trim() !== '') {
    throw new Error('invalid boolean env run: expected json-summary configuration errors to keep stderr empty.');
  }
  const invalidBoolean = parseCliJson(invalidBooleanStdout, 'invalid boolean env run');
  if (
    invalidBoolean.ok !== false
    || invalidBoolean.name !== 'BatchRunConfigurationError'
    || invalidBoolean.errorType !== 'configuration-error'
    || invalidBoolean.options?.requestedIncludeResults !== 'maybe'
    || Object.hasOwn(invalidBoolean.options || {}, 'includeResults')
    || invalidBoolean.details?.summaryType !== 'configuration-error'
    || invalidBoolean.details?.option !== 'FONT_SPLIT_INCLUDE_RESULTS'
    || invalidBoolean.details?.source !== 'env'
    || invalidBoolean.details?.expectedType !== 'boolean'
    || !invalidBoolean.details?.allowedValues?.includes('true')
    || !invalidBoolean.details?.allowedValues?.includes('false')
  ) {
    throw new Error('invalid boolean env run: expected invalid boolean env var to be rejected with machine-readable allowed values.');
  }

  let invalidLimitEnvStdout = '';
  let invalidLimitEnvStderr = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, '1', '1'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONT_SPLIT_LIMIT: 'zero',
      },
    });
  } catch (error) {
    invalidLimitEnvStdout = error.stdout || '';
    invalidLimitEnvStderr = error.stderr || '';
  }
  if (invalidLimitEnvStderr.trim() !== '') {
    throw new Error('invalid limit env run: expected json-summary configuration errors to keep stderr empty.');
  }
  const invalidLimitEnv = parseCliJson(invalidLimitEnvStdout, 'invalid limit env run');
  if (
    invalidLimitEnv.ok !== false
    || invalidLimitEnv.name !== 'BatchRunConfigurationError'
    || invalidLimitEnv.errorType !== 'configuration-error'
    || invalidLimitEnv.options?.limit !== null
    || invalidLimitEnv.options?.requestedLimit !== 'zero'
    || invalidLimitEnv.details?.summaryType !== 'configuration-error'
    || invalidLimitEnv.details?.option !== 'FONT_SPLIT_LIMIT'
    || invalidLimitEnv.details?.source !== 'env'
    || invalidLimitEnv.details?.targetField !== 'limit'
    || invalidLimitEnv.details?.expectedType !== 'positive-integer'
  ) {
    throw new Error('invalid limit env run: expected invalid numeric env var to be rejected with machine-readable numeric details.');
  }

  let invalidPositionalLimitStdout = '';
  let invalidPositionalLimitStderr = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, 'zero', '1'], {
      cwd: process.cwd(),
    });
  } catch (error) {
    invalidPositionalLimitStdout = error.stdout || '';
    invalidPositionalLimitStderr = error.stderr || '';
  }
  if (invalidPositionalLimitStderr.trim() !== '') {
    throw new Error('invalid positional limit run: expected json-summary configuration errors to keep stderr empty.');
  }
  const invalidPositionalLimit = parseCliJson(invalidPositionalLimitStdout, 'invalid positional limit run');
  if (
    invalidPositionalLimit.ok !== false
    || invalidPositionalLimit.name !== 'BatchRunConfigurationError'
    || invalidPositionalLimit.errorType !== 'configuration-error'
    || invalidPositionalLimit.options?.limit !== null
    || invalidPositionalLimit.options?.requestedLimit !== 'zero'
    || invalidPositionalLimit.details?.summaryType !== 'configuration-error'
    || invalidPositionalLimit.details?.option !== 'limit'
    || invalidPositionalLimit.details?.source !== 'positional'
    || invalidPositionalLimit.details?.targetField !== 'limit'
    || invalidPositionalLimit.details?.expectedType !== 'positive-integer'
  ) {
    throw new Error('invalid positional limit run: expected invalid numeric positional arg to be rejected with machine-readable numeric details.');
  }

  const { stdout: jsonSuccessStdout, stderr: jsonSuccessStderr } = await execFileAsync(process.execPath, ['batch-run.js', '--json', inputDir, outputRoot, '1', '1', '--dry-run'], {
    cwd: process.cwd(),
  });
  if (jsonSuccessStderr.trim() !== '') {
    throw new Error('json success run: expected stderr to stay empty.');
  }
  const jsonSuccess = parseCliJson(jsonSuccessStdout, 'json success run');
  if (
    jsonSuccess.ok !== true
    || jsonSuccess.runner?.outputMode !== 'json'
    || jsonSuccess.options?.workflowPreset !== 'safe-preview'
    || jsonSuccess.options?.dryRun !== true
    || jsonSuccess.result?.dryRun !== true
    || jsonSuccess.result?.resultsIncluded !== true
    || jsonSuccess.result?.maxFilesHit !== true
  ) {
    throw new Error('json success run: expected machine-readable safe-preview dry-run result.');
  }

  let jsonFailureStdout = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json', inputDir, outputRoot, '2', '2'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONT_SPLIT_WORKFLOW_PRESET: 'structure-first',
      },
    });
  } catch (error) {
    jsonFailureStdout = error.stdout || '';
  }
  const jsonFailure = parseCliJson(jsonFailureStdout, 'json failure run');
  if (
    jsonFailure.ok !== false
    || jsonFailure.runner?.outputMode !== 'json'
    || jsonFailure.options?.workflowPreset !== 'structure-first'
    || jsonFailure.name !== 'BatchSplitError'
    || jsonFailure.errorType !== 'batch-split-error'
    || jsonFailure.details?.summary?.workflowPreset !== 'structure-first'
    || jsonFailure.details?.summary?.errorCount !== 1
  ) {
    throw new Error('json failure run: expected machine-readable batch error details.');
  }

  const { stdout: jsonSummarySuccessStdout } = await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, '1', '1', '--dry-run'], {
    cwd: process.cwd(),
  });
  const jsonSummarySuccess = parseCliJson(jsonSummarySuccessStdout, 'json summary success run');
  if (
    jsonSummarySuccess.ok !== true
    || jsonSummarySuccess.runner?.outputMode !== 'json-summary'
    || Object.hasOwn(jsonSummarySuccess, 'result')
    || jsonSummarySuccess.summary?.workflowPreset !== 'safe-preview'
    || jsonSummarySuccess.summary?.resultsIncluded !== true
    || !jsonSummarySuccess.summary?.omittedDetailFields?.includes('planned')
  ) {
    throw new Error('json summary success run: expected compact safe-preview summary without full result.');
  }

  let jsonSummaryFailureStdout = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, '2', '2'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONT_SPLIT_WORKFLOW_PRESET: 'structure-first',
      },
    });
  } catch (error) {
    jsonSummaryFailureStdout = error.stdout || '';
  }
  const jsonSummaryFailure = parseCliJson(jsonSummaryFailureStdout, 'json summary failure run');
  if (
    jsonSummaryFailure.ok !== false
    || jsonSummaryFailure.runner?.outputMode !== 'json-summary'
    || Object.hasOwn(jsonSummaryFailure, 'details')
    || jsonSummaryFailure.name !== 'BatchSplitError'
    || jsonSummaryFailure.errorType !== 'batch-split-error'
    || jsonSummaryFailure.summary?.workflowPreset !== 'structure-first'
    || jsonSummaryFailure.summary?.errorCount !== 1
    || jsonSummaryFailure.errors?.length !== 1
  ) {
    throw new Error('json summary failure run: expected compact batch error summary without full details.');
  }

  console.log(JSON.stringify({
    safePreview: safePreviewStdout,
    structureFirst: structureFirstStdout,
    includeResultsOverride: includeResultsOverrideStdout,
    invalidPreset,
    invalidDedupe,
    invalidBoolean,
    invalidLimitEnv,
    invalidPositionalLimit,
    jsonSuccess,
    jsonFailure,
    jsonSummarySuccess,
    jsonSummaryFailure,
  }, null, 2));
} else if (scenario === 'batch-identity-dedupe') {
  const inputDir = process.argv[3] || '.font-split-batch-identity-input';
  const outputRoot = process.argv[4] || '.font-split-batch-identity-output';
  const ttfPath = path.join(inputDir, 'Ttf', 'FixtureSans-Regular.ttf');
  const otfPath = path.join(inputDir, 'Otf', 'FixtureSans-Regular.otf');
  const fallbackInputDir = `${inputDir}-fallback`;
  const fallbackPath = path.join(fallbackInputDir, 'MixedNames', 'OpenPair-Regular.ttf');
  console.log('Batch identity dedupe smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(fallbackInputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(ttfPath), { recursive: true });
  await fs.mkdir(path.dirname(otfPath), { recursive: true });
  await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
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
  await fs.writeFile(fallbackPath, buildMinimalTtf({
    familyName: 'Open Pair',
    subfamilyName: 'Regular',
    glyphCount: 3,
    typographicFamilyName: 'Typographic Only',
    typographicSubfamilyName: null,
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

  const fallbackInspection = await inspectFontInputs({
    inputDir: fallbackInputDir,
    includeFiles: true,
    maxFiles: 10,
  });
  const fallbackFile = fallbackInspection.files?.[0];
  if (
    fallbackInspection.validFontCount !== 1
    || fallbackFile?.identityBasis !== 'opentype-family-subfamily'
    || !fallbackFile?.identityKey?.includes('"family":"open pair"')
    || fallbackFile?.identityKey?.includes('typographic only')
  ) {
    throw new Error('Expected font identity to use paired OpenType name IDs 1/2 instead of mixing typographic family with OpenType subfamily.');
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
  if (
    identityDedupe.dedupeDecisionSummary?.summaryType !== 'dedupe-decision-summary'
    || identityDedupe.dedupeDecisionSummary?.appliesToTool !== 'split_font_batch'
    || identityDedupe.dedupeDecisionSummary?.requestedMode !== 'font-identity'
    || identityDedupe.dedupeDecisionSummary?.effectiveMode !== 'font-identity'
    || identityDedupe.dedupeDecisionSummary?.skippedDuplicateCount !== 1
    || identityDedupe.dedupeDecisionSummary?.identityKeyMissingCount !== 0
    || identityDedupe.dedupeDecisionSummary?.pathFallbackUsed !== false
    || identityDedupe.dedupeDecisionSummary?.representativePriority?.[0] !== '.otf'
    || identityDedupe.dedupeDecisionSummary?.identityEvidenceSummary?.summaryType !== 'dedupe-identity-evidence'
    || identityDedupe.dedupeDecisionSummary?.identityEvidenceSummary?.identityDedupeEvidenceAvailable !== true
    || !identityDedupe.dedupeDecisionSummary?.identityEvidenceSummary?.identityBasisCounts?.some((item) => item.basis === 'typographic-family-subfamily' && item.count === 2)
    || identityDedupe.dedupeDecisionSummary?.identityEvidenceSummary?.duplicateExampleCount !== 1
    || identityDedupe.dedupeDecisionSummary?.identityEvidenceSummary?.duplicateExamples?.[0]?.identityBasis !== 'typographic-family-subfamily'
    || !identityDedupe.dedupeDecisionSummary?.identityEvidenceSummary?.duplicateExamples?.[0]?.identityKey?.includes('"family":"fixture sans"')
  ) {
    throw new Error('Expected font-identity batch dedupe to expose compact dedupeDecisionSummary identity evidence.');
  }
  assertBatchPolicySummary(identityDedupe.batchPolicySummary, {
    context: 'batch-identity font-identity dry-run',
    appliesToTool: 'split_font_batch',
    expectedValues: {
      batchGroupBy: 'font-family',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      batchErrorMode: 'fail-after',
    },
  });
  if (
    identityDedupe.batchDecision?.route !== 'review-dry-run-plan'
    || identityDedupe.batchDecision?.preferredNextActionId !== 'run-reviewed-batch-write'
    || identityDedupe.batchDecision?.reviewedWriteArgs?.workflowPreset !== 'reviewed-write'
    || identityDedupe.batchDecision?.reviewedWriteArgs?.inputDir !== inputDir
    || identityDedupe.batchDecision?.sourceDestructive !== false
    || identityDedupe.batchDecision?.requiresOutputAudit !== false
  ) {
    throw new Error('Expected font-identity dry-run to recommend reviewing the dry-run plan before a reviewed write.');
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
  const truncatedPreview = await splitFontBatch({
    inputDir,
    outputRoot,
    workflowPreset: 'safe-preview',
    limit: 10,
    maxFiles: 1,
    batchGroupBy: 'font-family',
    batchDedupeMode: 'none',
    skipMode: 'force',
    silent: true,
  });
  const rerunAction = (truncatedPreview.recommendedNextActions || []).find((action) => action.id === 'rerun-batch-with-higher-maxFiles');
  if (
    truncatedPreview.maxFilesHit !== true
    || rerunAction?.tool !== 'split_font_batch'
    || rerunAction?.suggestedArgs?.workflowPreset !== 'safe-preview'
    || rerunAction?.suggestedArgs?.maxFiles !== '<higher-than-current>'
    || rerunAction?.suggestedArgs?.batchGroupBy !== 'font-family'
    || rerunAction?.suggestedArgs?.batchDedupeMode !== 'none'
    || rerunAction?.suggestedArgs?.skipMode !== 'force'
    || !rerunAction?.inspectFields?.includes('batchDecision')
    || truncatedPreview.batchDecision?.route !== 'rerun-batch-with-higher-maxFiles'
    || truncatedPreview.batchDecision?.preferredNextActionId !== 'rerun-batch-with-higher-maxFiles'
    || truncatedPreview.batchDecision?.rerunArgs?.maxFiles !== '<higher-than-current>'
    || truncatedPreview.batchDecision?.rerunArgs?.workflowPreset !== 'safe-preview'
  ) {
    throw new Error('Expected truncated batch preview to recommend rerun args that preserve explicit batch policy overrides.');
  }
  assertInspectFieldsExist(rerunAction, {
    split_font_batch: truncatedPreview,
  }, 'batch-identity truncated rerun action');
  if (await fsExists(outputRoot)) {
    throw new Error('Expected batch identity dry-runs not to create outputRoot.');
  }
  console.log(JSON.stringify({ inspection, identityDedupe, pathDedupe, truncatedPreview }, null, 2));
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

  const rawDefaultPreview = await splitFontBatch({
    inputDir,
    outputRoot,
    dryRun: true,
    includeResults: true,
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (
    rawDefaultPreview.workflowPreset !== null
    || rawDefaultPreview.dryRun !== true
    || rawDefaultPreview.resultsIncluded !== true
    || rawDefaultPreview.batchNamingMode !== 'numeric-suffix'
    || rawDefaultPreview.batchDedupeMode !== 'font-identity'
    || rawDefaultPreview.batchErrorMode !== 'fail-after'
    || rawDefaultPreview.skipMode !== 'manifest'
  ) {
    throw new Error('Expected omitted workflowPreset to use raw defaults and report workflowPreset null.');
  }
  assertConfigurationTrace(rawDefaultPreview.configurationTrace, {
    context: 'workflow-presets raw batch defaults',
    appliesToTool: 'split_font_batch',
    workflowPreset: null,
    expectedSources: {
      dryRun: 'explicit-argument',
      includeResults: 'explicit-argument',
      batchDedupeMode: 'raw-default',
    },
    expectedEffectiveValues: {
      dryRun: true,
      includeResults: true,
      batchDedupeMode: 'font-identity',
    },
    expectedExplicitOverrideFields: ['dryRun', 'includeResults'],
  });

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
    || safePreview.outputTreeInsideInputTree !== false
    || safePreview.mayOverwriteOutputTree !== false
    || safePreview.resultsIncluded !== true
    || safePreview.skipMode !== 'manifest'
    || safePreview.batchErrorMode !== 'fail-after'
    || safePreview.batchNamingMode !== 'numeric-suffix'
    || safePreview.batchDedupeMode !== 'font-identity'
    || safePreview.deduplicatedCount !== 1
    || safePreview.skippedDuplicates !== 1
    || safePreview.unsupportedFileSummary?.total !== 1
    || safePreview.unsupportedFileDecision?.summaryType !== 'unsupported-file-decision'
    || safePreview.unsupportedFileDecision?.totalUnsupportedFileCount !== 1
    || safePreview.unsupportedFileDecision?.categories?.[0] !== 'document'
  ) {
    throw new Error('Expected safe-preview preset to apply no-write safe batch defaults.');
  }
  assertConfigurationTrace(safePreview.configurationTrace, {
    context: 'workflow-presets safe-preview batch',
    appliesToTool: 'split_font_batch',
    workflowPreset: 'safe-preview',
    expectedSources: {
      dryRun: 'workflow-preset',
      includeResults: 'workflow-preset',
      batchDedupeMode: 'workflow-preset',
    },
    expectedEffectiveValues: {
      dryRun: true,
      includeResults: true,
      batchDedupeMode: 'font-identity',
    },
  });
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
    || structureFirstBatch.outputTreeInsideInputTree !== false
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
  assertConfigurationTrace(structureFirstBatchOverride.configurationTrace, {
    context: 'workflow-presets structure-first batch override',
    appliesToTool: 'split_font_batch',
    workflowPreset: 'structure-first',
    expectedSources: {
      dryRun: 'workflow-preset',
      includeResults: 'explicit-argument',
      batchDedupeMode: 'explicit-argument',
    },
    expectedEffectiveValues: {
      includeResults: true,
      batchDedupeMode: 'font-identity',
    },
    expectedExplicitOverrideFields: ['includeResults', 'batchDedupeMode'],
  });

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
  assertConfigurationTrace(undefinedOverridePreview.configurationTrace, {
    context: 'workflow-presets undefined batch override',
    appliesToTool: 'split_font_batch',
    workflowPreset: 'safe-preview',
    expectedSources: {
      dryRun: 'workflow-preset',
      includeResults: 'workflow-preset',
    },
    expectedEffectiveValues: {
      dryRun: true,
      includeResults: true,
    },
  });

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
  assertConfigurationTrace(structureFirst.configurationTrace, {
    context: 'workflow-presets structure-first organization',
    appliesToTool: 'organize_font_directory',
    workflowPreset: 'structure-first',
    expectedSources: {
      dryRun: 'workflow-preset',
      parseFonts: 'workflow-preset',
      includePlan: 'workflow-preset',
      batchDedupeMode: 'workflow-preset',
    },
    expectedEffectiveValues: {
      dryRun: true,
      parseFonts: false,
      includePlan: false,
      batchDedupeMode: 'font-identity',
    },
  });

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
  assertConfigurationTrace(explicitOverride.configurationTrace, {
    context: 'workflow-presets explicit organization override',
    appliesToTool: 'organize_font_directory',
    workflowPreset: 'structure-first',
    expectedSources: {
      dryRun: 'workflow-preset',
      parseFonts: 'explicit-argument',
      includePlan: 'explicit-argument',
      batchDedupeMode: 'workflow-preset',
    },
    expectedEffectiveValues: {
      parseFonts: true,
      includePlan: true,
      batchDedupeMode: 'font-identity',
    },
    expectedExplicitOverrideFields: ['parseFonts', 'includePlan'],
  });

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
  await runInspectCompactSmoke();
} else if (scenario === 'inspect-structure') {
  await runInspectStructureSmoke();
} else if (scenario === 'inspect-organized-staging') {
  await runInspectOrganizedStagingSmoke();
} else if (scenario === 'mcp-error') {
  await runMcpErrorSmoke();
} else if (scenario === 'mcp-schema') {
  await runMcpSchemaSmoke();
} else if (scenario === 'api-docs') {
  await runApiDocsSmoke();
} else if (scenario === 'behavior-docs') {
  await runBehaviorDocsSmoke();
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
  const ownsFixtureInput = process.argv[3] === undefined;
  const inputDir = process.argv[3] || '.font-split-batch-dry-run-input';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-batch-dry-run-output';
  console.log('Batch dry-run smoke:', inputDir, '->', outputRoot);
  if (ownsFixtureInput) {
    await fs.rm(inputDir, { recursive: true, force: true });
    await fs.rm(outputRoot, { recursive: true, force: true });
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, 'FixtureSans-Regular.ttf'), buildMinimalTtf({
      familyName: 'Fixture Sans',
      subfamilyName: 'Regular',
      glyphCount: 5,
    }));
  }
  const outputRootExistedBefore = await fsExists(outputRoot);
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
  assertSourceSafetyDecision(result.sourceSafetyDecision, {
    context: 'batch-dry-run',
    appliesToTool: 'split_font_batch',
    expectedStatus: 'source-safe-no-write',
    expectedWritesFiles: false,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: false,
    expectedOutputPathRole: 'outputRoot',
    expectedRequiresOutputAudit: false,
  });
  const batchWriteAction = (result.recommendedNextActions || []).find((action) => action.id === 'run-reviewed-batch-write');
  if (
    result.recommendedNextActionCount !== (result.recommendedNextActions || []).length
    || batchWriteAction?.tool !== 'split_font_batch'
    || batchWriteAction?.suggestedArgsField !== 'batchDecision.reviewedWriteArgs'
    || batchWriteAction?.suggestedArgs?.workflowPreset !== 'reviewed-write'
    || batchWriteAction?.suggestedArgs?.inputDir !== inputDir
    || batchWriteAction?.suggestedArgs?.outputRoot !== outputRoot
    || !batchWriteAction.inspectFields?.includes('writesOutputTree')
    || !batchWriteAction.inspectFields?.includes('batchDecision')
    || !batchWriteAction.inspectFields?.includes('dedupeDecisionSummary')
  ) {
    throw new Error('Expected batch dry-run to recommend a reviewed-write follow-up with safety and route-decision fields.');
  }
  if (batchWriteAction.suggestedArgs?.skipMode !== 'force') {
    throw new Error('Expected reviewed-write follow-up to preserve the explicit skipMode override.');
  }
  if (
    result.batchDecision?.route !== 'review-dry-run-plan'
    || result.batchDecision?.preferredNextActionId !== 'run-reviewed-batch-write'
    || result.batchDecision?.nextTool !== 'split_font_batch'
    || result.batchDecision?.reviewedWriteArgs?.inputDir !== inputDir
    || result.batchDecision?.reviewedWriteArgs?.outputRoot !== outputRoot
    || result.batchDecision?.reviewedWriteArgs?.workflowPreset !== 'reviewed-write'
    || result.batchDecision?.sourceDestructive !== false
    || result.batchDecision?.writesOutputTree !== false
  ) {
    throw new Error('Expected batch dry-run to expose a compact reviewed-write decision route.');
  }
  assertActionSuggestedArgsOmit(batchWriteAction, ['dryRun', 'includeResults', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode', 'splitFailureAction'], 'run-reviewed-batch-write suggestedArgs');
  assertInspectFieldsExist(batchWriteAction, {
    split_font_batch: result,
  }, 'batch-dry-run');
  if ((await fsExists(outputRoot)) !== outputRootExistedBefore) {
    throw new Error('Expected dry-run not to create or remove outputRoot.');
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
  if (
    collect.batchDecision?.route !== 'inspect-batch-errors'
    || collect.batchDecision?.preferredNextActionId !== 'inspect-batch-errors'
    || collect.batchDecision?.sourceDestructive !== false
  ) {
    throw new Error('Expected collect mode to expose an inspect-batch-errors decision route.');
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
} else if (scenario === 'batch-defaults') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-defaults-input';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-defaults-output';
  console.log('Batch defaults smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(inputDir, 'not-a-font.ttf'), 'not a real font');

  const assertConfigurationError = async (context, action, expectedDetails) => {
    let thrown = null;
    try {
      await action();
    } catch (error) {
      thrown = error;
    }
    if (
      thrown?.name !== 'FontSplitConfigurationError'
      || thrown.details?.summaryType !== 'configuration-error'
      || thrown.details?.option !== expectedDetails.option
      || thrown.details?.expectedType !== expectedDetails.expectedType
      || thrown.details?.omitForDefaultBehavior !== true
      || !thrown.details?.nonIntuitiveBehavior?.includes('rejected instead of silently falling back')
    ) {
      throw new Error(`${context}: expected FontSplitConfigurationError with machine-readable details.`);
    }
    return {
      name: thrown.name,
      option: thrown.details.option,
      expectedType: thrown.details.expectedType,
      received: thrown.details.received,
    };
  };

  const invalidBatchDedupe = await assertConfigurationError('invalid direct batch dedupe option', () => splitFontBatch({
    inputDir,
    outputRoot,
    dryRun: true,
    batchDedupeMode: 'semantic',
  }), {
    option: 'batchDedupeMode',
    expectedType: 'enum',
  });

  const invalidBatchLimit = await assertConfigurationError('invalid direct batch limit option', () => splitFontBatch({
    inputDir,
    outputRoot,
    dryRun: true,
    limit: 0,
  }), {
    option: 'limit',
    expectedType: 'positive-integer',
  });

  const invalidBatchBoolean = await assertConfigurationError('invalid direct batch boolean option', () => splitFontBatch({
    inputDir,
    outputRoot,
    dryRun: true,
    includeResults: 'false',
  }), {
    option: 'includeResults',
    expectedType: 'boolean',
  });

  const invalidOrganizationBoolean = await assertConfigurationError('invalid direct organization boolean option', () => organizeFontDirectory({
    inputDir,
    outputDir: `${outputRoot}-organized`,
    parseFonts: 'no',
  }), {
    option: 'parseFonts',
    expectedType: 'boolean',
  });

  const invalidInspectionLimit = await assertConfigurationError('invalid direct inspect maxFiles option', () => inspectFontInputs({
    inputDir,
    maxFiles: 0,
  }), {
    option: 'maxFiles',
    expectedType: 'positive-integer',
  });

  const invalidSingleFontOption = await assertConfigurationError('invalid direct split option', () => splitFont({
    fontPath: path.join(inputDir, 'not-a-font.ttf'),
    smallGlyphAction: 'fallback',
  }), {
    option: 'smallGlyphAction',
    expectedType: 'enum',
  });

  let defaultThrew = false;
  try {
    await splitFontBatch({
      inputDir,
      outputRoot,
      limit: 2,
      maxFiles: 10,
      silent: true,
    });
  } catch (error) {
    defaultThrew = true;
    if (error.name !== 'BatchSplitError' || error.details?.mode !== 'fail-after') {
      throw error;
    }
  }
  if (!defaultThrew) {
    throw new Error('Expected default batchErrorMode to be fail-after.');
  }

  const overridden = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 2,
    maxFiles: 10,
    skipMode: 'force',
    batchErrorMode: 'collect',
    silent: true,
  });
  if (Object.hasOwn(overridden, 'strictMode') || overridden.skipMode !== 'force' || overridden.batchErrorMode !== 'collect' || overridden.errorCount !== 1) {
    throw new Error('Expected batch defaults to omit strictMode and allow explicit batch options.');
  }

  console.log(JSON.stringify({
    defaultThrew,
    overridden: {
      skipMode: overridden.skipMode,
      batchErrorMode: overridden.batchErrorMode,
      errorCount: overridden.errorCount,
    },
    invalidConfiguration: {
      invalidBatchDedupe,
      invalidBatchLimit,
      invalidBatchBoolean,
      invalidOrganizationBoolean,
      invalidInspectionLimit,
      invalidSingleFontOption,
    },
  }, null, 2));
} else if (scenario === 'real-corpus-suite') {
  await runRealCorpusSuiteSmoke();
} else if (scenario === 'real-corpus-readonly') {
  await runRealCorpusReadonlySmoke();
} else if (scenario === 'real-corpus-targets') {
  await runRealCorpusTargetsSmoke();
} else if (scenario === 'real-corpus-integration') {
  await runRealCorpusIntegrationSmoke();
} else if (scenario === 'small-copy-original') {
  const usesGeneratedInput = !process.argv[3];
  const smallInputDir = '.font-split-small-copy-original-input';
  const smallFontPath = process.argv[3] || path.join(smallInputDir, 'SmallCopyOriginal-Regular.ttf');
  const smallOutDir = process.argv[4] || '.font-split-small-copy-original-output';

  console.log('Small glyph copy-original smoke:', smallFontPath, '->', smallOutDir);
  if (usesGeneratedInput) {
    await fs.rm(smallInputDir, { recursive: true, force: true });
    await fs.rm(smallOutDir, { recursive: true, force: true });
    await fs.mkdir(smallInputDir, { recursive: true });
    await fs.writeFile(smallFontPath, buildMinimalTtf({
      familyName: 'Small Copy Original Smoke',
      subfamilyName: 'Regular',
      glyphCount: 3,
    }));
  }
  const result = await splitFont({
    fontPath: smallFontPath,
    outDir: smallOutDir,
    smallGlyphAction: 'copy-original',
    smallGlyphThreshold: 1000000,
    fontFamily: 'SmallCopyOriginalSmokeFont',
    silent: true,
  });
  console.log(JSON.stringify(result, null, 2));
  console.log('\nInspecting output:');
  console.log(JSON.stringify(await inspectSplitOutput({ outDir: smallOutDir }), null, 2));
} else {
  throw new Error(`Unknown smoke scenario: ${scenario}`);
}

async function fsExists(filePath) {
  const { access } = await import('node:fs/promises');
  return access(filePath).then(() => true).catch(() => false);
}
