import fs from 'node:fs/promises';
import path from 'node:path';
import { ORGANIZATION_MANIFEST_FILE_NAME } from './output-audit.js';
import { PACKAGE_VERSION } from './runtime-status.js';

const ORGANIZATION_MANIFEST_VERSION = 1;

export function buildPlanActionSummary(plan) {
  const byAction = {
    'would-copy': 0,
    copied: 0,
    'would-skip-target-exists': 0,
    'skipped-target-exists': 0,
    'skipped-duplicate': 0,
    'skipped-invalid': 0,
    error: 0,
  };

  for (const item of plan) {
    byAction[item.action] = (byAction[item.action] || 0) + 1;
  }

  return {
    total: plan.length,
    byAction,
  };
}

export function buildOrganizationManifest({ inputDirRelative, outputDirRelative, options, result }) {
  return {
    manifestVersion: ORGANIZATION_MANIFEST_VERSION,
    toolVersion: PACKAGE_VERSION,
    inputDir: inputDirRelative,
    outputDir: outputDirRelative,
    options,
    generatedAt: new Date().toISOString(),
    summary: {
      scannedFileCount: result.scannedFileCount,
      supportedFontCount: result.supportedFontCount,
      copiedCount: result.copiedCount,
      skippedCount: result.skippedCount,
      errorCount: result.errorCount,
      safetySummary: result.safetySummary,
      sourceSafetyDecision: result.sourceSafetyDecision,
    },
    entries: result.plan
      .filter((item) => item.action === 'copied' || item.action === 'would-copy' || item.action === 'skipped-target-exists')
      .map((item) => ({
        source: item.source,
        target: item.target,
        targetPath: item.targetPath,
        groupName: item.groupName,
        action: item.action,
      })),
  };
}

export async function writeOrganizationManifest(outputDir, manifest) {
  await fs.writeFile(path.join(outputDir, ORGANIZATION_MANIFEST_FILE_NAME), JSON.stringify(manifest, null, 2));
}
