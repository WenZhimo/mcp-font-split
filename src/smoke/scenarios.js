import { runAgentGuidanceSmoke } from './guidance-scenarios.js';
import {
  runBatchCompactSmoke,
  runBatchDefaultsSmoke,
  runBatchDryRunSmoke,
  runBatchErrorModeSmoke,
  runBatchIdentityDedupeSmoke,
  runBatchIncrementalSmoke,
  runBatchRunCliSmoke,
  runWorkflowPresetsSmoke,
} from './batch-scenarios.js';
import { runCheckCompactSmoke } from './check-scenarios.js';
import { runApiDocsSmoke, runBehaviorDocsSmoke } from './docs-checks.js';
import {
  runFontInputsSmoke,
  runRuntimeStatusSmoke,
  runScanLimitsSmoke,
  runWorkspaceRootPathSmoke,
} from './input-scenarios.js';
import {
  runInspectCompactSmoke,
  runInspectOrganizedStagingSmoke,
  runInspectSmoke,
  runInspectStructureSmoke,
} from './inspect-scenarios.js';
import { runMcpErrorSmoke, runMcpSchemaSmoke } from './mcp-scenarios.js';
import {
  runOrganizeCopySmoke,
  runOrganizeDryRunSmoke,
  runOrganizeOutputInsideInputSmoke,
  runOrganizeStructureOnlySmoke,
  runOrganizeValidFontSmoke,
} from './organize-scenarios.js';
import {
  runRealCorpusIntegrationSmoke,
  runRealCorpusReadonlySmoke,
  runRealCorpusSuiteSmoke,
  runRealCorpusTargetsSmoke,
} from './real-corpus.js';
import {
  runSingleSmoke,
  runSmallCopyOriginalSmoke,
} from './single-scenarios.js';

const SMOKE_SCENARIOS = new Map([
  ['single', runSingleSmoke],
  ['batch-incremental', runBatchIncrementalSmoke],
  ['inspect', runInspectSmoke],
  ['agent-guidance', runAgentGuidanceSmoke],
  ['runtime-status', runRuntimeStatusSmoke],
  ['font-inputs', runFontInputsSmoke],
  ['scan-limits', runScanLimitsSmoke],
  ['workspace-root-path', runWorkspaceRootPathSmoke],
  ['organize-dry-run', runOrganizeDryRunSmoke],
  ['organize-copy', runOrganizeCopySmoke],
  ['organize-valid-font', runOrganizeValidFontSmoke],
  ['organize-structure-only', runOrganizeStructureOnlySmoke],
  ['organize-output-inside-input', runOrganizeOutputInsideInputSmoke],
  ['check-compact', runCheckCompactSmoke],
  ['batch-run-cli', runBatchRunCliSmoke],
  ['batch-identity-dedupe', runBatchIdentityDedupeSmoke],
  ['workflow-presets', runWorkflowPresetsSmoke],
  ['inspect-compact', runInspectCompactSmoke],
  ['inspect-structure', runInspectStructureSmoke],
  ['inspect-organized-staging', runInspectOrganizedStagingSmoke],
  ['mcp-error', runMcpErrorSmoke],
  ['mcp-schema', runMcpSchemaSmoke],
  ['api-docs', runApiDocsSmoke],
  ['behavior-docs', runBehaviorDocsSmoke],
  ['batch-compact', runBatchCompactSmoke],
  ['batch-dry-run', runBatchDryRunSmoke],
  ['batch-error-mode', runBatchErrorModeSmoke],
  ['batch-defaults', runBatchDefaultsSmoke],
  ['real-corpus-suite', runRealCorpusSuiteSmoke],
  ['real-corpus-readonly', runRealCorpusReadonlySmoke],
  ['real-corpus-targets', runRealCorpusTargetsSmoke],
  ['real-corpus-integration', runRealCorpusIntegrationSmoke],
  ['small-copy-original', runSmallCopyOriginalSmoke],
]);

const SMOKE_SCENARIO_GROUPS = Object.freeze({
  single: ['single', 'small-copy-original'],
  batch: [
    'batch-incremental',
    'batch-run-cli',
    'batch-identity-dedupe',
    'workflow-presets',
    'batch-compact',
    'batch-dry-run',
    'batch-error-mode',
    'batch-defaults',
  ],
  input: ['runtime-status', 'font-inputs', 'scan-limits', 'workspace-root-path'],
  organize: [
    'organize-dry-run',
    'organize-copy',
    'organize-valid-font',
    'organize-structure-only',
    'organize-output-inside-input',
  ],
  inspect: ['inspect', 'inspect-compact', 'inspect-structure', 'inspect-organized-staging'],
  guidance: ['agent-guidance'],
  docs: ['api-docs', 'behavior-docs'],
  mcp: ['mcp-error', 'mcp-schema'],
  localCheck: ['check-compact'],
  realCorpus: ['real-corpus-suite', 'real-corpus-readonly', 'real-corpus-targets', 'real-corpus-integration'],
});

function assertSmokeScenarioOwnership() {
  const ownedScenarios = new Map();
  for (const [groupName, scenarioNames] of Object.entries(SMOKE_SCENARIO_GROUPS)) {
    for (const scenarioName of scenarioNames) {
      if (!SMOKE_SCENARIOS.has(scenarioName)) {
        throw new Error(`Smoke scenario group ${groupName} references unknown scenario: ${scenarioName}`);
      }
      if (ownedScenarios.has(scenarioName)) {
        throw new Error(`Smoke scenario ${scenarioName} is assigned to both ${ownedScenarios.get(scenarioName)} and ${groupName}.`);
      }
      ownedScenarios.set(scenarioName, groupName);
    }
  }

  for (const scenarioName of SMOKE_SCENARIOS.keys()) {
    if (!ownedScenarios.has(scenarioName)) {
      throw new Error(`Smoke scenario ${scenarioName} must be assigned to exactly one scenario group.`);
    }
  }
}

assertSmokeScenarioOwnership();

async function runSmokeScenario(scenario) {
  const runScenario = SMOKE_SCENARIOS.get(scenario);
  if (!runScenario) {
    throw new Error(`Unknown smoke scenario: ${scenario}`);
  }
  await runScenario();
}

export {
  SMOKE_SCENARIO_GROUPS,
  SMOKE_SCENARIOS,
  runSmokeScenario,
};
