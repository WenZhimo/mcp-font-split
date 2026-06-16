import fs from 'node:fs/promises';
import path from 'node:path';

export const MANIFEST_FILE_NAME = 'split-meta.json';
export const MANIFEST_VERSION = 1;

export function manifestPathForSplitDir(splitDir) {
  return path.join(splitDir, MANIFEST_FILE_NAME);
}

export async function writeSplitManifest(splitDir, manifest) {
  await fs.writeFile(manifestPathForSplitDir(splitDir), JSON.stringify(manifest, null, 2));
}

export async function readSplitManifest(splitDir) {
  try {
    return JSON.parse(await fs.readFile(manifestPathForSplitDir(splitDir), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function buildSplitManifest({
  toolVersion,
  inputRelativePath,
  inputStat,
  groupName,
  outDirRelative,
  splitDirRelative,
  effectiveConfig,
  result,
}) {
  return {
    manifestVersion: MANIFEST_VERSION,
    toolVersion,
    source: {
      input: inputRelativePath,
      sizeBytes: inputStat.size,
      mtimeMs: inputStat.mtimeMs,
    },
    grouping: {
      groupName,
      outDir: outDirRelative,
      splitDir: splitDirRelative,
      splitDirName: path.basename(splitDirRelative),
    },
    effectiveConfig,
    result: {
      outputMode: result.outputMode,
      resultType: result.resultType,
      glyphCount: result.glyphCount,
      skipped: result.skipped,
      skipReason: result.skipReason,
      copiedOriginalPath: result.copiedOriginalPath,
      decompressedFrom: result.decompressedFrom,
      oversizedKernDetected: result.oversizedKernDetected,
      oversizedKernStripped: result.oversizedKernStripped,
      splitFailureFallbackApplied: result.splitFailureFallbackApplied,
      performedSplit: result.performedSplit,
      usedFallback: result.usedFallback,
    },
  };
}
