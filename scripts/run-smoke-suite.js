import { spawn } from 'node:child_process';

const TAIL_LIMIT = 60000;

const SMOKE_STEPS = [
  ['smoke:agent-guidance'],
  ['smoke:runtime-status'],
  ['smoke:font-inputs', '.font-split-input-inspect'],
  ['smoke:scan-limits', '.font-split-scan-limits'],
  ['smoke:workspace-root-path'],
  ['smoke:organize', '.font-split-organize-input', '.font-split-organize-output'],
  ['smoke:organize-copy', '.font-split-organize-copy-input', '.font-split-organize-copy-output'],
  ['smoke:organize-valid', '.font-split-organize-valid-input', '.font-split-organize-valid-output'],
  ['smoke:organize-structure', '.font-split-organize-structure-input', '.font-split-organize-structure-output'],
  ['smoke:organize-output-inside', '.font-split-organize-inside-input', 'organized-fonts'],
  ['smoke:check-compact'],
  ['smoke:batch-run', '.font-split-batch-run-cli', '.font-split-batch-run-cli-output'],
  ['smoke:batch-identity', '.font-split-batch-identity-input', '.font-split-batch-identity-output'],
  ['smoke:workflow-presets', '.font-split-preset-input', '.font-split-preset-output'],
  ['smoke:small-copy-original'],
  ['smoke:inspect-compact', '.font-split-inspect-compact'],
  ['smoke:inspect-structure', '.font-split-inspect-structure'],
  ['smoke:inspect-organized-staging', '.font-split-inspect-organized-staging'],
  ['smoke:mcp-error'],
  ['smoke:mcp-schema'],
  ['smoke:api-docs'],
  ['smoke:behavior-docs'],
  ['smoke:batch-error-mode', '.font-split-error-mode-input', '.font-split-error-mode-output'],
  ['smoke:batch-defaults', '.font-split-defaults-input', '.font-split-defaults-output'],
];

function appendTail(current, chunk) {
  const next = current + chunk;
  return next.length > TAIL_LIMIT ? next.slice(-TAIL_LIMIT) : next;
}

function formatDuration(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function quoteArg(arg) {
  return /\s/.test(arg) ? JSON.stringify(arg) : arg;
}

function npmRunStep(stepParts) {
  const [scriptName, ...extraArgs] = stepParts;
  const npmArgs = ['run', scriptName, ...(extraArgs.length > 0 ? ['--', ...extraArgs] : [])];

  if (process.env.npm_execpath) {
    return {
      id: scriptName,
      command: process.execPath,
      args: [process.env.npm_execpath, ...npmArgs],
      displayCommand: `npm ${npmArgs.map(quoteArg).join(' ')}`,
    };
  }

  return {
    id: scriptName,
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: npmArgs,
    displayCommand: `npm ${npmArgs.map(quoteArg).join(' ')}`,
  };
}

function runStep(step, index, total) {
  const startedAt = Date.now();
  let stdoutTail = '';
  let stderrTail = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;

  process.stdout.write(`[${index}/${total}] ${step.displayCommand} ... `);

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(step.command, step.args, {
        cwd: process.cwd(),
        env: process.env,
        windowsHide: true,
      });
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      process.stdout.write(`failed (${formatDuration(elapsedMs)})\n`);
      resolve({
        ...step,
        ok: false,
        exitCode: null,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs,
        stdoutBytes,
        stderrBytes,
        stdoutTail,
        stderrTail,
      });
      return;
    }

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      stdoutTail = appendTail(stdoutTail, chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      stderrTail = appendTail(stderrTail, chunk.toString('utf8'));
    });
    child.on('error', (error) => {
      const elapsedMs = Date.now() - startedAt;
      process.stdout.write(`failed (${formatDuration(elapsedMs)})\n`);
      resolve({
        ...step,
        ok: false,
        exitCode: null,
        error: error.message,
        elapsedMs,
        stdoutBytes,
        stderrBytes,
        stdoutTail,
        stderrTail,
      });
    });
    child.on('close', (code) => {
      const elapsedMs = Date.now() - startedAt;
      const ok = code === 0;
      process.stdout.write(`${ok ? 'ok' : 'failed'} (${formatDuration(elapsedMs)}, stdout ${stdoutBytes} bytes, stderr ${stderrBytes} bytes)\n`);
      resolve({
        ...step,
        ok,
        exitCode: code,
        elapsedMs,
        stdoutBytes,
        stderrBytes,
        ...(ok ? {} : { stdoutTail, stderrTail }),
      });
    });
  });
}

function printFailureDetails(failedStep) {
  if (!failedStep) return;

  console.error(`\nSmoke step failed: ${failedStep.id}`);
  console.error(`Command: ${failedStep.displayCommand}`);
  if (failedStep.exitCode !== null) {
    console.error(`Exit code: ${failedStep.exitCode}`);
  }
  if (failedStep.error) {
    console.error(`Error: ${failedStep.error}`);
  }
  if (failedStep.stdoutTail?.trim()) {
    console.error('\n--- stdout tail ---');
    console.error(failedStep.stdoutTail.trimEnd());
  }
  if (failedStep.stderrTail?.trim()) {
    console.error('\n--- stderr tail ---');
    console.error(failedStep.stderrTail.trimEnd());
  }
  console.error('\nRerun that npm command directly for full output.');
}

const startedAt = Date.now();
const steps = SMOKE_STEPS.map(npmRunStep);
const results = [];

console.log(`mcp-font-split smoke suite (${steps.length} steps)`);

for (let i = 0; i < steps.length; i += 1) {
  const result = await runStep(steps[i], i + 1, steps.length);
  results.push(result);
  if (!result.ok) break;
}

const failedStep = results.find((step) => !step.ok) || null;
printFailureDetails(failedStep);

console.log(`smoke-suite-result ${JSON.stringify({
  ok: !failedStep,
  summaryType: 'smoke-suite-result',
  elapsedMs: Date.now() - startedAt,
  totalStepCount: steps.length,
  completedStepCount: results.length,
  failedStepId: failedStep?.id || null,
})}`);

process.exitCode = failedStep ? 1 : 0;
