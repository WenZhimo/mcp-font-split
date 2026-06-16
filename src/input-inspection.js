import fs from 'node:fs/promises';
import path from 'node:path';
import { FONT_EXTENSIONS } from './catalogs.js';
import {
  resolveWorkspacePath,
  toRelativeWorkspacePath,
} from './path-utils.js';
import {
  buildFontIdentityKey,
  decompressWoff1,
  decompressWoff2,
  detectFontContainer,
  extractFontIdentity,
  getGlyphCount,
  parseIdentityKey,
} from './font-identity.js';
import { buildDirectoryOrganizationSafety } from './directory-organization-safety.js';

export async function ensureFontFile(fontPath) {
  const resolved = await resolveWorkspacePath(fontPath, { mustExist: true });
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) throw new Error(`Font path is not a file: ${fontPath}`);
  const ext = path.extname(resolved).toLowerCase();
  if (!FONT_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported font extension ${ext || '(none)'} for ${fontPath}`);
  }
  return resolved;
}

export async function inspectInputFontFile(file) {
  const ext = path.extname(file).toLowerCase();
  const stat = await fs.stat(file);
  const relative = toRelativeWorkspacePath(file);
  const result = {
    path: relative,
    extension: ext,
    sizeBytes: stat.size,
  };

  try {
    let buffer = new Uint8Array(await fs.readFile(file));
    const container = detectFontContainer(buffer);
    let decompressedFrom = null;

    if (container === 'woff') {
      buffer = decompressWoff1(buffer);
      decompressedFrom = 'woff';
    } else if (container === 'woff2') {
      buffer = await decompressWoff2(buffer);
      decompressedFrom = 'woff2';
    }

    const identity = extractFontIdentity(buffer);
    const identityKey = buildFontIdentityKey(buffer);
    const identityKeyDetails = parseIdentityKey(identityKey);
    const glyphCount = getGlyphCount(buffer);

    return {
      ...result,
      status: identityKey ? 'valid' : 'valid-no-identity',
      container,
      normalizedContainer: detectFontContainer(buffer),
      decompressedFrom,
      glyphCount,
      identity,
      identityBasis: identityKeyDetails?.basis || null,
      identityKey,
    };
  } catch (error) {
    return {
      ...result,
      status: 'invalid',
      container: null,
      glyphCount: null,
      identity: null,
      identityBasis: null,
      identityKey: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildDirectoryLayoutSummary({ inputDir, allFiles, fontFiles }) {
  const topLevelDirectories = new Map();
  let rootFontCount = 0;
  let nestedFontCount = 0;

  for (const file of fontFiles) {
    const parts = path.relative(inputDir, file).split(path.sep).filter(Boolean);
    if (parts.length <= 1) {
      rootFontCount++;
      continue;
    }
    nestedFontCount++;
    const first = parts[0];
    topLevelDirectories.set(first, (topLevelDirectories.get(first) || 0) + 1);
  }

  const layoutKind = fontFiles.length === 0
    ? 'empty'
    : rootFontCount > 0 && nestedFontCount > 0
      ? 'mixed'
      : nestedFontCount > 0 ? 'nested' : 'flat';

  const recommendedGroupBy = layoutKind === 'nested' || layoutKind === 'mixed'
    ? 'source-dir'
    : 'font-family';

  return {
    layoutKind,
    rootFontCount,
    nestedFontCount,
    topLevelDirectoryCount: topLevelDirectories.size,
    topLevelDirectories: [...topLevelDirectories.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }))
      .slice(0, 50)
      .map(([name, fontCount]) => ({ name, fontCount })),
    unsupportedFileCount: allFiles.length - fontFiles.length,
    recommendedBatchOptions: {
      batchGroupBy: recommendedGroupBy,
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      skipMode: 'manifest',
    },
  };
}

export function buildInputDirectoryDecision({
  inputDirRelative,
  layout,
  maxFiles,
  maxFilesHit,
  supportedFontCount,
  invalidFontCount,
  unsupportedFileDecision,
  recommendedBatchPreviewArgs,
}) {
  const directoryOrganizationSafety = buildDirectoryOrganizationSafety({
    appliesToTool: 'inspect_font_inputs',
    inputDir: inputDirRelative,
    outputDir: 'organized-fonts',
    maxFiles,
  });
  const safeOrganizationPreviewArgs = directoryOrganizationSafety.safePreviewArgs;
  const baseMustInspectFields = [
    'inputCountGuide',
    'inputDirectoryDecision',
    'inputDirectoryDecision.directoryOrganizationSafety',
    'layout',
    'recommendedBatchPreviewArgs',
    'unsupportedFileDecision',
    'unsupportedFileSummary',
    'inspectionWarnings',
    'maxFilesHit',
  ];
  let recommendedMode;
  let preferredNextTool;
  let preferredNextActionId;
  let suggestedArgs;
  let directoryStructureRisk;
  let shortAnswer;
  let successCriteria;

  if (maxFilesHit) {
    recommendedMode = 'rerun-input-scan';
    preferredNextTool = 'inspect_font_inputs';
    preferredNextActionId = 'rerun-with-higher-maxFiles';
    suggestedArgs = {
      inputDir: inputDirRelative,
      maxFiles: '<higher-than-current>',
      includeFiles: false,
    };
    directoryStructureRisk = 'unknown-until-complete-scan';
    shortAnswer = 'The input scan was truncated; rerun with a higher maxFiles before trusting layout or counts.';
    successCriteria = 'Rerun input inspection until maxFilesHit is false before choosing a batch or organization route.';
  } else if (supportedFontCount === 0) {
    recommendedMode = 'no-supported-fonts';
    preferredNextTool = null;
    preferredNextActionId = null;
    suggestedArgs = null;
    directoryStructureRisk = 'none';
    shortAnswer = 'No supported font files were found in the scanned input directory.';
    successCriteria = 'Stop or choose a different inputDir; ignored files are reported but not extracted, copied, or split.';
  } else if (invalidFontCount > 0) {
    recommendedMode = 'review-invalid-fonts';
    preferredNextTool = 'inspect_font_inputs';
    preferredNextActionId = 'review-invalid-fonts';
    suggestedArgs = null;
    directoryStructureRisk = layout.layoutKind === 'mixed' ? 'high' : 'medium';
    shortAnswer = 'Supported-extension files were found, but at least one could not be parsed as a valid font; review invalidFonts before batch writing.';
    successCriteria = 'Review invalidFonts and decide whether to fix, remove, ignore, or preserve invalid font-like files before a real batch write.';
  } else if (layout.layoutKind === 'mixed') {
    recommendedMode = 'organize-safe-preview-first';
    preferredNextTool = 'organize_font_directory';
    preferredNextActionId = 'preview-organization-layout';
    suggestedArgs = safeOrganizationPreviewArgs;
    directoryStructureRisk = 'high';
    shortAnswer = 'Fonts appear both at the input root and in nested folders; run a no-write organization preview before choosing direct batch output or copy-only staging.';
    successCriteria = 'Run organize_font_directory safe-preview, inspect sourceLayoutMismatchSummary, layoutDecision, organizationWarnings, and recommendedBatchPreviewArgs, then choose original input or copy-only staging.';
  } else {
    recommendedMode = 'batch-safe-preview-first';
    preferredNextTool = 'split_font_batch';
    preferredNextActionId = 'preview-batch-split-original-layout';
    suggestedArgs = recommendedBatchPreviewArgs;
    directoryStructureRisk = layout.layoutKind === 'nested' ? 'medium' : 'low';
    shortAnswer = 'The input layout can be previewed directly with split_font_batch safe-preview; copy-only organization is optional if the user wants a cleaner staging tree.';
    successCriteria = 'Run split_font_batch safe-preview, inspect planned paths, batchWarnings, dedupeDecisionSummary, maxFilesHit, unsupported file summaries, and errors before any reviewed write.';
  }

  const nonIntuitiveBehavior = [
    'inspect_font_inputs never writes output; this decision is routing guidance, not proof that splitting or organization succeeded.',
    'recommendedBatchPreviewArgs is safe-preview only and preserves the current scan maxFiles; a later reviewed-write call is still required to create split output.',
    'safeOrganizationPreviewArgs is also no-write; organize_font_directory only copies files when rerun with dryRun:false or workflowPreset reviewed-write.',
  ];
  if (unsupportedFileDecision?.hasArchives) {
    nonIntuitiveBehavior.push('Archive files are reported for awareness but are not extracted, copied, or split.');
  }

  return {
    summaryType: 'input-directory-decision',
    appliesToTool: 'inspect_font_inputs',
    recommendedMode,
    preferredNextTool,
    preferredNextActionId,
    shortAnswer,
    writesFilesBeforeReview: false,
    sourceDestructive: false,
    sourceFilesPreserved: true,
    layoutKind: layout.layoutKind,
    directoryStructureRisk,
    recommendedBatchGroupBy: layout.recommendedBatchOptions.batchGroupBy,
    safeBatchPreviewArgs: recommendedBatchPreviewArgs,
    safeOrganizationPreviewArgs,
    directoryOrganizationSafety,
    suggestedArgs,
    mustInspectFields: baseMustInspectFields,
    successCriteria,
    nonIntuitiveBehavior,
    evidence: {
      maxFiles,
      maxFilesHit,
      supportedFontCount,
      invalidFontCount,
      unsupportedFileCount: unsupportedFileDecision?.totalUnsupportedFileCount ?? 0,
      hasArchives: unsupportedFileDecision?.hasArchives === true,
      topLevelDirectoryCount: layout.topLevelDirectoryCount,
      rootFontCount: layout.rootFontCount,
      nestedFontCount: layout.nestedFontCount,
    },
  };
}
