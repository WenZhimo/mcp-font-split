import fs from 'node:fs/promises';
import path from 'node:path';
import { FONT_EXTENSIONS } from './catalogs.js';
import {
  normalizeBooleanOption,
  normalizePositiveNumberOption,
} from './config.js';
import { scanFilesRecursive } from './file-scan.js';
import {
  buildDirectoryLayoutSummary,
  buildInputDirectoryDecision,
  inspectInputFontFile,
} from './input-inspection.js';
import {
  buildInputCountGuide,
  buildUnsupportedFileDecision,
  buildUnsupportedFileSummary,
} from './input-summary.js';
import { buildInputInspectionWarnings } from './decision-diagnostics.js';
import {
  resolveWorkspacePath,
  toRelativeWorkspacePath,
} from './path-utils.js';
import { buildSuggestedBatchPreviewArgs } from './suggested-args.js';

export async function inspectFontInputs(args) {
  const inputDir = await resolveWorkspacePath(args.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${args.inputDir}`);

  const maxFiles = normalizePositiveNumberOption(args, 'maxFiles', 50000, { integer: true, max: 50000 });
  const includeFiles = normalizeBooleanOption(args, 'includeFiles', true);
  const inputScan = await scanFilesRecursive(inputDir, { maxFiles });
  const allFiles = inputScan.files;
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const inputDirRelative = toRelativeWorkspacePath(inputDir);
  const unsupportedFileSummary = buildUnsupportedFileSummary(allFiles);
  const unsupportedFileDecision = buildUnsupportedFileDecision(unsupportedFileSummary);
  const layout = buildDirectoryLayoutSummary({ inputDir, allFiles, fontFiles });
  const recommendedBatchPreviewArgs = buildSuggestedBatchPreviewArgs({
    inputDir: inputDirRelative,
    recommendedBatchOptions: layout.recommendedBatchOptions,
    extraArgs: { maxFiles },
  });
  const inputCountGuide = buildInputCountGuide({
    appliesToTool: 'inspect_font_inputs',
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    unsupportedFileCount: allFiles.length - fontFiles.length,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    filesIncluded: includeFiles,
    unsupportedFileSummary,
    unsupportedFileDecision,
  });
  const entries = [];
  const byExtension = {};
  const byStatus = {};
  const byIdentityBasis = {};

  for (const file of fontFiles) {
    const entry = await inspectInputFontFile(file);
    entries.push(entry);
    byExtension[entry.extension] = (byExtension[entry.extension] || 0) + 1;
    byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
    if (entry.identityBasis) {
      byIdentityBasis[entry.identityBasis] = (byIdentityBasis[entry.identityBasis] || 0) + 1;
    }
  }

  const invalidFonts = entries.filter((entry) => entry.status === 'invalid');
  const missingIdentity = entries.filter((entry) => entry.status === 'valid-no-identity');
  const inspectionWarnings = buildInputInspectionWarnings({
    maxFilesHit: inputScan.truncated,
    maxFiles,
    includeFiles,
    invalidFontCount: invalidFonts.length,
    missingIdentityCount: missingIdentity.length,
  });
  const inputDirectoryDecision = buildInputDirectoryDecision({
    inputDirRelative,
    layout,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    supportedFontCount: fontFiles.length,
    invalidFontCount: invalidFonts.length,
    unsupportedFileDecision,
    recommendedBatchPreviewArgs,
  });

  return {
    ok: true,
    inputDir: inputDirRelative,
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    unsupportedFileCount: allFiles.length - fontFiles.length,
    inputCountGuide,
    unsupportedFileDecision,
    unsupportedFileSummary,
    validFontCount: entries.length - invalidFonts.length,
    invalidFontCount: invalidFonts.length,
    missingIdentityCount: missingIdentity.length,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    filesIncluded: includeFiles,
    layout,
    recommendedBatchPreviewArgs,
    inputDirectoryDecision,
    inspectionWarningCount: inspectionWarnings.length,
    inspectionWarnings,
    byExtension,
    byStatus,
    byIdentityBasis,
    invalidFonts: invalidFonts.map((entry) => ({
      path: entry.path,
      extension: entry.extension,
      sizeBytes: entry.sizeBytes,
      error: entry.error,
    })),
    ...(includeFiles ? { files: entries } : {}),
  };
}
