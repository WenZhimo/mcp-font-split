import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const SYNTAX_CHECK_ROOTS = [
  'batch-run.js',
  'scripts',
  'src',
];

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

async function collectJavaScriptFiles(entryPath) {
  const stat = await fs.stat(entryPath);
  if (stat.isFile()) {
    return entryPath.endsWith('.js') ? [toPosixPath(entryPath)] : [];
  }
  if (!stat.isDirectory()) return [];

  const entries = await fs.readdir(entryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const childPath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJavaScriptFiles(childPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(toPosixPath(childPath));
    }
  }
  return files;
}

async function getSyntaxCheckFiles() {
  const files = new Set();
  for (const root of SYNTAX_CHECK_ROOTS) {
    for (const file of await collectJavaScriptFiles(root)) {
      files.add(file);
    }
  }
  return [...files].sort();
}

const syntaxCheckFiles = await getSyntaxCheckFiles();

if (process.argv.includes('--list-json')) {
  console.log(JSON.stringify({
    summaryType: 'syntax-check-file-list',
    roots: SYNTAX_CHECK_ROOTS,
    fileCount: syntaxCheckFiles.length,
    files: syntaxCheckFiles,
  }, null, 2));
  process.exit(0);
}

for (const file of syntaxCheckFiles) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    console.error(`Failed to syntax-check ${file}: ${result.error.message}`);
    process.exitCode = 1;
    break;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
