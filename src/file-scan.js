import fs from 'node:fs/promises';
import path from 'node:path';
import { toRelativeWorkspacePath } from './path-utils.js';

export async function listFilesRecursive(root, { maxFiles = 5000, excludeDirs = [] } = {}) {
  const results = [];
  const baseExclude = ['node_modules', '.git', 'font-split-mcp', '__MACOSX'];
  const shouldExclude = (name) => {
    if (name.startsWith('._')) return true;
    if (baseExclude.includes(name)) return true;
    if (name === 'split-output' || name.startsWith('split-output-')) return true;
    return excludeDirs.includes(name);
  };
  async function walk(dir) {
    if (results.length >= maxFiles) return;
    const entries = (await fs.readdir(dir, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const entry of entries) {
      if (shouldExclude(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
      if (results.length >= maxFiles) return;
    }
  }
  await walk(root);
  return results;
}

export async function scanFilesRecursive(root, { maxFiles = 5000, excludeDirs = [] } = {}) {
  const probeLimit = maxFiles + 1;
  const files = await listFilesRecursive(root, { maxFiles: probeLimit, excludeDirs });
  return {
    files: files.slice(0, maxFiles),
    truncated: files.length > maxFiles,
  };
}

export async function summarizeFilesDetailed(dir, { maxFiles = 5000 } = {}) {
  let files = [];
  let truncated = false;
  try {
    const scan = await scanFilesRecursive(dir, { maxFiles });
    files = scan.files;
    truncated = scan.truncated;
  } catch (error) {
    if (error.code === 'ENOENT') return { files: [], truncated: false };
    throw error;
  }

  const summaries = await Promise.all(files.map(async (file) => {
    const stat = await fs.stat(file);
    return {
      path: toRelativeWorkspacePath(file),
      sizeBytes: stat.size,
      extension: path.extname(file).toLowerCase(),
    };
  }));

  summaries.sort((a, b) => a.path.localeCompare(b.path));
  return { files: summaries, truncated };
}

export async function summarizeFiles(dir, { maxFiles = 5000 } = {}) {
  return (await summarizeFilesDetailed(dir, { maxFiles })).files;
}
