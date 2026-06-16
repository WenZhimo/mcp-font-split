import path from 'node:path';
import { fileExists } from './path-utils.js';
import {
  appendCollisionSuffix,
  buildSourceSuffix,
  compareBatchDedupeRepresentative,
  resolveBatchFamilyDirName,
  sanitizeDirName,
} from './batch.js';

export function getOrganizationDedupeKey(entry, dedupeMode) {
  if (dedupeMode === 'none') return `unique:${entry.file}`;
  const ext = path.extname(entry.file).toLowerCase();
  if (dedupeMode === 'same-path') return `path:${entry.file.slice(0, -ext.length)}`;
  return entry.identityKey || `path:${entry.file.slice(0, -ext.length)}`;
}

export function dedupeOrganizationEntries(entries, dedupeMode) {
  if (dedupeMode === 'none') {
    return {
      selected: [...entries],
      duplicates: [],
    };
  }

  const byKey = new Map();
  const duplicates = [];
  for (const entry of entries) {
    const key = getOrganizationDedupeKey(entry, dedupeMode);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }
    if (compareBatchDedupeRepresentative(entry.file, existing.file) < 0) {
      duplicates.push({
        path: existing.path,
        duplicateOf: entry.path,
        identityKey: key,
      });
      byKey.set(key, entry);
    } else {
      duplicates.push({
        path: entry.path,
        duplicateOf: existing.path,
        identityKey: key,
      });
    }
  }

  return {
    selected: [...byKey.values()].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })),
    duplicates,
  };
}

export async function resolveOrganizationGroupName({ entry, inputDir, groupingMode }) {
  if (entry.metadataParsed === false) {
    const relativeToInput = path.relative(inputDir, entry.file);
    const segments = relativeToInput.split(path.sep).filter(Boolean);
    if (groupingMode === 'font-family') return path.basename(entry.file, path.extname(entry.file));
    return segments.length > 1 ? segments[0] : path.basename(entry.file, path.extname(entry.file));
  }
  if (entry.status === 'invalid') {
    const relativeToInput = path.relative(inputDir, entry.file);
    const segments = relativeToInput.split(path.sep).filter(Boolean);
    return segments.length > 1 ? segments[0] : path.basename(entry.file, path.extname(entry.file));
  }
  return resolveBatchFamilyDirName({ file: entry.file, inputDir, groupingMode });
}

function normalizeTargetBaseName(file) {
  return sanitizeDirName(path.basename(file, path.extname(file))) || 'font';
}

export async function chooseOrganizationTargetPath({
  outputDir,
  groupName,
  entry,
  namingMode,
  usedTargets,
  overwriteExisting,
}) {
  const extension = path.extname(entry.file);
  const baseName = normalizeTargetBaseName(entry.file);
  const safeGroupName = sanitizeDirName(groupName) || 'Fonts';
  const targetDir = path.join(outputDir, safeGroupName);
  const inputRelativePath = entry.path;
  const makeTarget = (name) => {
    const targetPath = path.join(targetDir, name);
    const relativeTarget = path.relative(outputDir, targetPath).replaceAll(path.sep, '/');
    return { targetPath, relativeTarget };
  };

  if (namingMode === 'source-suffix') {
    const suffix = buildSourceSuffix(inputRelativePath, extension);
    const target = makeTarget(`${sanitizeDirName(`${baseName}--${suffix}`)}${extension}`);
    usedTargets.add(target.relativeTarget);
    return target;
  }

  if (namingMode === 'plain') {
    const target = makeTarget(`${baseName}${extension}`);
    usedTargets.add(target.relativeTarget);
    return target;
  }

  let index = 0;
  while (true) {
    const candidate = `${appendCollisionSuffix(baseName, index)}${extension}`;
    const target = makeTarget(candidate);
    const exists = await fileExists(target.targetPath);
    if (!usedTargets.has(target.relativeTarget) && (overwriteExisting || !exists)) {
      usedTargets.add(target.relativeTarget);
      return target;
    }
    index++;
  }
}
