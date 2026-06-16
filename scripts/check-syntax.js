import { spawnSync } from 'node:child_process';

const SYNTAX_CHECK_FILES = [
  'batch-run.js',
  'scripts/check-syntax.js',
  'scripts/install-cn-font-split-wasm.js',
  'scripts/run-check-compact.js',
  'scripts/run-smoke-suite.js',
  'src/path-utils.js',
  'src/file-scan.js',
  'src/split-manifest.js',
  'src/output-audit.js',
  'src/batch.js',
  'src/directory-organization-safety.js',
  'src/guidance.js',
  'src/guidance-workflows.js',
  'src/agent-guidance.js',
  'src/input-summary.js',
  'src/input-inspection.js',
  'src/decision-diagnostics.js',
  'src/suggested-args.js',
  'src/next-actions.js',
  'src/split-config.js',
  'src/single-split-output.js',
  'src/organization-manifest.js',
  'src/organization-planning.js',
  'src/font-split.js',
  'src/server.js',
  'src/smoke-test.js',
  'src/mcp-response.js',
  'src/smoke/fixtures.js',
  'src/smoke/docs-checks.js',
  'src/smoke/assertions.js',
  'src/smoke/real-corpus-coverage-summary.js',
  'src/smoke/real-corpus-report.js',
  'src/smoke/real-corpus-response-assertions.js',
  'src/smoke/real-corpus-subprocess-summary.js',
  'src/smoke/real-corpus.js',
  'src/smoke/mcp-scenarios.js',
  'src/smoke/inspect-scenarios.js',
  'src/smoke/input-scenarios.js',
  'src/smoke/guidance-scenarios.js',
  'src/smoke/organize-scenarios.js',
  'src/smoke/batch-scenarios.js',
  'src/smoke/check-scenarios.js',
  'src/smoke/single-scenarios.js',
  'src/smoke/scenarios.js',
];

for (const file of SYNTAX_CHECK_FILES) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
