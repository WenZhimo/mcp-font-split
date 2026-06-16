import fs from 'node:fs/promises';
import path from 'node:path';
import {
  inspectSplitOutput,
  splitFont,
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
import {
  runBatchIncrementalSmoke,
  runBatchRunCliSmoke,
  runBatchIdentityDedupeSmoke,
  runWorkflowPresetsSmoke,
  runBatchCompactSmoke,
  runBatchDryRunSmoke,
  runBatchErrorModeSmoke,
  runBatchDefaultsSmoke,
} from './smoke/batch-scenarios.js';
import { buildMinimalTtf } from './smoke/fixtures.js';
import { runApiDocsSmoke, runBehaviorDocsSmoke } from './smoke/docs-checks.js';
import { runCheckCompactSmoke } from './smoke/check-scenarios.js';
import {
  runRealCorpusSuiteSmoke,
  runRealCorpusReadonlySmoke,
  runRealCorpusTargetsSmoke,
  runRealCorpusIntegrationSmoke,
} from './smoke/real-corpus.js';

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
  await runBatchIncrementalSmoke();
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
  await runCheckCompactSmoke();
} else if (scenario === 'batch-run-cli') {
  await runBatchRunCliSmoke();
} else if (scenario === 'batch-identity-dedupe') {
  await runBatchIdentityDedupeSmoke();
} else if (scenario === 'workflow-presets') {
  await runWorkflowPresetsSmoke();
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
  await runBatchCompactSmoke();
} else if (scenario === 'batch-dry-run') {
  await runBatchDryRunSmoke();
} else if (scenario === 'batch-error-mode') {
  await runBatchErrorModeSmoke();
} else if (scenario === 'batch-defaults') {
  await runBatchDefaultsSmoke();
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
