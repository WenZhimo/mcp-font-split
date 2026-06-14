import { spawn } from 'node:child_process';

const TAIL_LIMIT = 60000;
const args = new Set(process.argv.slice(2));
const jsonOnly = args.has('--json');
const selfTestPass = args.has('--self-test-pass');
const selfTestFail = args.has('--self-test-fail');

function npmStep(scriptName) {
  if (process.env.npm_execpath) {
    return {
      id: scriptName,
      command: process.execPath,
      args: [process.env.npm_execpath, 'run', scriptName],
    };
  }
  if (process.platform === 'win32') {
    return {
      id: scriptName,
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', `npm.cmd run ${scriptName}`],
    };
  }
  return {
    id: scriptName,
    command: 'npm',
    args: ['run', scriptName],
  };
}

function formatDuration(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function appendTail(current, chunk) {
  const next = current + chunk;
  return next.length > TAIL_LIMIT ? next.slice(-TAIL_LIMIT) : next;
}

function defaultSteps() {
  return [
    npmStep('check:syntax'),
    npmStep('check:smoke'),
  ];
}

function selfTestSteps({ fail }) {
  return [
    {
      id: 'compact-check-self-test-pass',
      command: process.execPath,
      args: ['-e', 'console.log("self-test pass")'],
    },
    {
      id: fail ? 'compact-check-self-test-fail' : 'compact-check-self-test-pass-stderr',
      command: process.execPath,
      args: fail
        ? ['-e', 'console.log("before failure"); console.error("synthetic failure"); process.exit(3)']
        : ['-e', 'console.error("self-test stderr is captured but non-fatal")'],
    },
  ];
}

function getSteps() {
  if (selfTestPass || selfTestFail) return selfTestSteps({ fail: selfTestFail });
  return defaultSteps();
}

function runStep(step, index, total) {
  const startedAt = Date.now();
  let stdoutTail = '';
  let stderrTail = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;

  if (!jsonOnly) {
    process.stdout.write(`[${index}/${total}] ${step.id} ... `);
  }

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
      if (!jsonOnly) {
        process.stdout.write(`failed (${formatDuration(elapsedMs)})\n`);
      }
      resolve({
        id: step.id,
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
      if (!jsonOnly) {
        process.stdout.write(`failed (${formatDuration(elapsedMs)})\n`);
      }
      resolve({
        id: step.id,
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
      if (!jsonOnly) {
        process.stdout.write(`${ok ? 'ok' : 'failed'} (${formatDuration(elapsedMs)}, stdout ${stdoutBytes} bytes, stderr ${stderrBytes} bytes)\n`);
      }
      resolve({
        id: step.id,
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

function printFailureDetails(step) {
  if (jsonOnly || !step || step.ok) return;
  console.error(`\n${step.id} failed.`);
  if (step.stdoutTail?.trim()) {
    console.error('\n--- stdout tail ---');
    console.error(step.stdoutTail.trimEnd());
  }
  if (step.stderrTail?.trim()) {
    console.error('\n--- stderr tail ---');
    console.error(step.stderrTail.trimEnd());
  }
  console.error('\nRerun the failed npm script directly for full output.');
}

const startedAt = Date.now();
const steps = getSteps();
const results = [];

if (!jsonOnly) {
  console.log(`mcp-font-split compact check (${steps.length} step${steps.length === 1 ? '' : 's'})`);
}

for (let i = 0; i < steps.length; i += 1) {
  const result = await runStep(steps[i], i + 1, steps.length);
  results.push(result);
  if (!result.ok) break;
}

const failedStep = results.find((step) => !step.ok) || null;
const payload = {
  ok: !failedStep,
  summaryType: 'compact-check-result',
  elapsedMs: Date.now() - startedAt,
  totalStepCount: steps.length,
  completedStepCount: results.length,
  failedStepId: failedStep?.id || null,
  steps: results,
  nonIntuitiveBehavior: 'check:compact suppresses noisy child output on success. On failure it returns captured stdout/stderr tails; rerun the failed npm script directly for full output.',
};

printFailureDetails(failedStep);

if (jsonOnly) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`compact-check-result ${JSON.stringify({
    ok: payload.ok,
    summaryType: payload.summaryType,
    elapsedMs: payload.elapsedMs,
    totalStepCount: payload.totalStepCount,
    completedStepCount: payload.completedStepCount,
    failedStepId: payload.failedStepId,
  })}`);
}

process.exitCode = payload.ok ? 0 : 1;
