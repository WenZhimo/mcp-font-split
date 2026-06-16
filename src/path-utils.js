import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const DEFAULT_WORKSPACE_ROOT = path.resolve(process.cwd());

export function workspaceRoot() {
  return path.resolve(process.env.FONT_SPLIT_ROOT || DEFAULT_WORKSPACE_ROOT);
}

export function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveWorkspacePath(inputPath, { mustExist = false } = {}) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new Error('Path must be a non-empty string.');
  }

  const root = workspaceRoot();
  const resolved = path.resolve(root, inputPath);
  if (!isInside(root, resolved)) {
    throw new Error(`Path is outside allowed font workspace: ${inputPath}`);
  }

  if (mustExist) {
    return fs.stat(resolved).then(() => resolved);
  }
  return Promise.resolve(resolved);
}

export function toRelativeWorkspacePath(absolutePath) {
  const relativePath = path.relative(workspaceRoot(), absolutePath).replaceAll(path.sep, '/');
  return relativePath === '' ? '.' : relativePath;
}

export async function pathStatus(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    return {
      exists: true,
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      sizeBytes: stat.size,
    };
  } catch (error) {
    return {
      exists: false,
      isFile: false,
      isDirectory: false,
      sizeBytes: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
