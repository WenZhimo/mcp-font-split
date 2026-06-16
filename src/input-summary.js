import path from 'node:path';
import {
  FONT_EXTENSIONS,
  UNSUPPORTED_FILE_CATEGORY_DETAILS,
  UNSUPPORTED_FILE_EXTENSION_CATEGORIES,
} from './catalogs.js';
import { toRelativeWorkspacePath } from './path-utils.js';

export function buildUnsupportedFileSummary(files, { maxExamples = 20 } = {}) {
  const unsupportedFiles = files.filter((file) => !FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const byExtension = new Map();
  const byCategory = new Map();
  for (const file of unsupportedFiles) {
    const extension = path.extname(file).toLowerCase() || '<none>';
    byExtension.set(extension, (byExtension.get(extension) || 0) + 1);
    const category = categorizeUnsupportedFileExtension(extension);
    byCategory.set(category, (byCategory.get(category) || 0) + 1);
  }
  const sortedCategoryEntries = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const categoryDetails = sortedCategoryEntries.map(([category, count]) => {
    const details = UNSUPPORTED_FILE_CATEGORY_DETAILS[category] || UNSUPPORTED_FILE_CATEGORY_DETAILS.other;
    return {
      category,
      count,
      meaning: details.meaning,
      handling: details.handling,
      extensions: details.extensions || [...(UNSUPPORTED_FILE_EXTENSION_CATEGORIES[category] || [])].sort(),
    };
  });
  const archiveCount = byCategory.get('archive') || 0;

  return {
    total: unsupportedFiles.length,
    byExtension: [...byExtension.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([extension, count]) => ({ extension, count })),
    byCategory: sortedCategoryEntries
      .map(([category, count]) => ({ category, count })),
    categoryDetails,
    handlingSummary: {
      unsupportedFilesIgnored: true,
      unsupportedFilesCopiedByOrganization: false,
      unsupportedFilesSplitByBatch: false,
      archivesExtracted: false,
      archiveCount,
      note: archiveCount > 0
        ? 'Archive files are counted for awareness only; this tool does not extract archives, copy them during organization, or split them in batch processing.'
        : 'Unsupported files are counted for awareness only; this tool does not copy them during organization or split them in batch processing.',
    },
    examples: unsupportedFiles
      .slice(0, maxExamples)
      .map((file) => toRelativeWorkspacePath(file)),
    examplesTruncated: unsupportedFiles.length > maxExamples,
  };
}

export function buildUnsupportedFileDecision(summary = {}) {
  const total = summary.total || 0;
  const byCategory = Array.isArray(summary.byCategory) ? summary.byCategory : [];
  const byExtension = Array.isArray(summary.byExtension) ? summary.byExtension : [];
  const categoryCounts = Object.fromEntries(byCategory.map((item) => [item.category, item.count]));
  const extensions = byExtension.map((item) => item.extension).filter(Boolean);
  const categories = byCategory.map((item) => item.category).filter(Boolean);
  const extensionsBeyondZipTxt = extensions.filter((extension) => extension !== '.zip' && extension !== '.txt');
  const archiveCount = categoryCounts.archive || 0;
  const unsupportedFontAdjacentCount = categoryCounts['unsupported-font'] || 0;
  const otherFileCount = categoryCounts.other || 0;
  const handlingSummary = summary.handlingSummary || {};

  return {
    summaryType: 'unsupported-file-decision',
    status: total > 0 ? 'ignored-files-present' : 'no-ignored-files',
    totalUnsupportedFileCount: total,
    categoryCount: categories.length,
    categories,
    extensionCount: extensions.length,
    extensions,
    extensionsBeyondZipTxt,
    extensionsBeyondZipTxtCount: extensionsBeyondZipTxt.length,
    hasArchives: archiveCount > 0,
    archiveCount,
    hasUnsupportedFontAdjacentFiles: unsupportedFontAdjacentCount > 0,
    unsupportedFontAdjacentCount,
    hasOtherFiles: otherFileCount > 0,
    otherFileCount,
    hasMultipleCategories: categories.length > 1,
    hasExtensionsBeyondZipTxt: extensionsBeyondZipTxt.length > 0,
    ignoredByDesign: total > 0,
    reviewRecommended: total > 0,
    recommendedAction: total > 0
      ? 'inspect-unsupportedFileSummary-before-writing'
      : 'continue',
    handlingSummary: {
      unsupportedFilesIgnored: handlingSummary.unsupportedFilesIgnored !== false,
      unsupportedFilesCopiedByOrganization: handlingSummary.unsupportedFilesCopiedByOrganization === true,
      unsupportedFilesSplitByBatch: handlingSummary.unsupportedFilesSplitByBatch === true,
      archivesExtracted: handlingSummary.archivesExtracted === true,
    },
    nonIntuitiveBehavior: archiveCount > 0
      ? 'Archive files are counted for awareness only; this tool does not extract archives, copy them during organization, or split them in batch processing.'
      : 'Unsupported files are counted for awareness only; this tool does not copy them during organization or split them in batch processing.',
  };
}

export function buildInputCountGuide({
  appliesToTool,
  scannedFileCount,
  supportedFontCount,
  unsupportedFileCount,
  maxFiles,
  maxFilesHit,
  filesIncluded,
  supportedFieldName = 'supportedFontCount',
  unsupportedFieldName = 'unsupportedFileCount',
  unsupportedFileSummary,
  unsupportedFileDecision,
} = {}) {
  const countCompleteness = maxFilesHit ? 'truncated' : 'complete-for-scanned-root';
  const fileDetailsVisibility = filesIncluded === true
    ? 'included'
    : filesIncluded === false
      ? 'omitted-by-request'
      : 'not-returned-by-this-tool';
  const handling = unsupportedFileDecision?.handlingSummary || unsupportedFileSummary?.handlingSummary || {};
  const unsupportedFilesIgnored = handling.unsupportedFilesIgnored !== false;
  const unsupportedFilesCopiedByOrganization = handling.unsupportedFilesCopiedByOrganization === true;
  const unsupportedFilesSplitByBatch = handling.unsupportedFilesSplitByBatch === true;
  const archivesExtracted = handling.archivesExtracted === true;
  const mustInspectFields = [
    'inputCountGuide',
    'scannedFileCount',
    supportedFieldName,
    unsupportedFieldName,
    'maxFilesHit',
    'unsupportedFileDecision',
    'unsupportedFileSummary',
  ];
  if (filesIncluded !== undefined) mustInspectFields.push('filesIncluded');
  const fileDetailsBehavior = fileDetailsVisibility === 'included'
    ? 'filesIncluded true means supported-font inspection entries are included; unsupported files remain summarized in unsupportedFileSummary.'
    : fileDetailsVisibility === 'omitted-by-request'
      ? 'filesIncluded false means per-file detail was intentionally omitted; it does not mean no files exist.'
      : 'This tool does not return per-file inspection entries, so fileDetailsVisibility does not mean files are absent.';
  const nonIntuitiveBehavior = [
    fileDetailsBehavior,
    'maxFilesHit true means scanned counts are truncated and should not be used as complete corpus totals.',
    'Unsupported files are counted and reported for context, but they are not extracted, copied by organization, or split by batch processing.',
    'Archive files are counted as unsupported files; archive extraction is outside this tool layer.',
  ];

  return {
    summaryType: 'input-count-guide',
    appliesToTool,
    scannedFileCount,
    supportedFontCount,
    supportedFieldName,
    unsupportedFileCount,
    unsupportedFieldName,
    maxFiles,
    maxFilesHit,
    countCompleteness,
    filesIncluded: filesIncluded === undefined ? null : filesIncluded,
    fileDetailsVisibility,
    unsupportedFilesHandling: {
      unsupportedFilesIgnored,
      unsupportedFilesCopiedByOrganization,
      unsupportedFilesSplitByBatch,
      archivesExtracted,
    },
    unsupportedFileCategoryCount: unsupportedFileDecision?.categoryCount ?? unsupportedFileSummary?.byCategory?.length ?? 0,
    unsupportedFileExtensionCount: unsupportedFileDecision?.extensionCount ?? unsupportedFileSummary?.byExtension?.length ?? 0,
    mustInspectFields,
    recommendedAction: maxFilesHit
      ? 'rerun-with-higher-maxFiles-before-trusting-counts'
      : 'continue',
    directAnswer: maxFilesHit
      ? `The scan returned ${scannedFileCount} files but maxFilesHit true means more source files existed beyond maxFiles ${maxFiles}; counts are incomplete.`
      : `The scan counted ${scannedFileCount} files under the scanned root: ${supportedFontCount} supported font files and ${unsupportedFileCount} unsupported files.`,
    nonIntuitiveBehavior,
  };
}

function categorizeUnsupportedFileExtension(extension) {
  if (extension === '<none>') return 'extensionless';
  for (const [category, extensions] of Object.entries(UNSUPPORTED_FILE_EXTENSION_CATEGORIES)) {
    if (extensions.has(extension)) return category;
  }
  return 'other';
}
