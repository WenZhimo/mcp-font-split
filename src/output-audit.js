import path from 'node:path';
import { FONT_EXTENSIONS } from './catalogs.js';
import { normalizeBooleanOption, normalizePositiveNumberOption } from './config.js';
import { summarizeFilesDetailed } from './file-scan.js';
import { OUTPUT_AUDIT_PASS_CRITERIA } from './output-audit-criteria.js';
import { resolveWorkspacePath, toRelativeWorkspacePath } from './path-utils.js';
import { readSplitManifest } from './split-manifest.js';

export const ORGANIZATION_MANIFEST_FILE_NAME = 'font-organization-manifest.json';

export function buildOutputRoleDecision({ outDirRelative, relativeEntries, maxFiles }) {
  const organizationManifest = relativeEntries.find((file) => file.relativePath === ORGANIZATION_MANIFEST_FILE_NAME);
  if (organizationManifest) {
    return {
      summaryType: 'output-role-decision',
      status: 'not-split-output',
      detectedRole: 'organized-font-source-staging',
      isSplitOutput: false,
      auditAppliesToThisDirectory: false,
      organizationManifestPath: organizationManifest.path,
      shortAnswer: 'This directory looks like organize_font_directory outputDir staging, not generated split output.',
      recommendedAction: 'inspect-staging-as-input-then-batch-preview',
      suggestedInspectInputArgs: {
        inputDir: outDirRelative,
        includeFiles: false,
        maxFiles,
      },
      suggestedBatchPreviewArgs: {
        inputDir: outDirRelative,
        workflowPreset: 'safe-preview',
        maxFiles,
      },
      mustInspectFields: ['outputRoleDecision', 'inspectionWarnings', 'auditBlockingReasons', 'structureSummary'],
      nonIntuitiveBehavior: [
        'organize_font_directory writes font-organization-manifest.json in outputDir, but that outputDir is source-like staging.',
        'inspect_split_output audits generated split output from split_font or split_font_batch, not organizer staging trees.',
      ],
    };
  }

  return {
    summaryType: 'output-role-decision',
    status: 'audit-target',
    detectedRole: 'generated-split-output-or-unknown',
    isSplitOutput: null,
    auditAppliesToThisDirectory: true,
    organizationManifestPath: null,
    shortAnswer: 'No organizer manifest was detected; continue with the split-output structure audit.',
    recommendedAction: 'continue-output-structure-audit',
    mustInspectFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'structureSummary'],
    nonIntuitiveBehavior: [
      'No organizer manifest means this is not recognized as organize_font_directory staging, but output validity still depends on outputStructureDecision and structureSummary.',
    ],
  };
}

export function buildOutputInspectionWarnings({ maxFilesHit, maxFiles, includeFiles, includeFamilies, missingManifestCount, structureIssueCount, outputRoleDecision }) {
  const warnings = [];
  const push = (code, message) => warnings.push({ code, message });

  if (maxFilesHit) {
    push('output-scan-truncated', `Output inspection hit maxFiles (${maxFiles}); rerun with a higher maxFiles before treating the audit as complete.`);
  }
  if (!includeFiles) {
    push('output-files-omitted', 'Flat files[] entries are omitted because includeFiles is false.');
  }
  if (!includeFamilies) {
    push('output-families-omitted', 'Structured families[] entries are omitted because includeFamilies is false.');
  }
  if (missingManifestCount > 0) {
    push('missing-manifests', `${missingManifestCount} output entries were inferred without split-meta.json manifests.`);
  }
  if (structureIssueCount > 0) {
    push('output-structure-issues', `${structureIssueCount} output structure issue(s) were detected; inspect structureSummary before treating the output as valid.`);
  }
  if (outputRoleDecision?.isSplitOutput === false) {
    push('organized-staging-not-split-output', 'The inspected directory contains font-organization-manifest.json, so it looks like organize_font_directory staging rather than generated split output.');
  }

  return warnings;
}

export function buildOutputAuditStatus({ maxFilesHit, maxFiles, structureSummary, outputRoleDecision }) {
  const auditBlockingReasons = [];
  if (outputRoleDecision?.isSplitOutput === false) {
    auditBlockingReasons.push({
      code: 'not-split-output',
      message: 'The inspected directory appears to be organize_font_directory staging, not generated split output.',
      issueCodes: ['organized-staging-not-split-output'],
      recommendedAction: outputRoleDecision.recommendedAction,
      organizationManifestPath: outputRoleDecision.organizationManifestPath,
    });
  }
  if (maxFilesHit) {
    auditBlockingReasons.push({
      code: 'output-scan-truncated',
      message: `Output inspection hit maxFiles (${maxFiles}); rerun with a higher maxFiles before treating the audit as complete.`,
    });
  }
  if (structureSummary?.conforms !== true) {
    auditBlockingReasons.push({
      code: 'output-structure-issues',
      message: 'Output structure issues were detected; inspect structureSummary before treating the output as valid.',
      issueCodes: (structureSummary?.issues || []).map((issue) => issue.code),
    });
  }

  const auditStatus = maxFilesHit
    ? 'incomplete'
    : auditBlockingReasons.length > 0 ? 'action-required' : 'pass';
  return {
    auditStatus,
    auditPassed: auditStatus === 'pass',
    auditBlockingReasons,
  };
}

export function buildOutputStructureDecision({
  auditStatusSummary,
  maxFilesHit,
  maxFiles,
  structureSummary,
  outputRoleDecision,
}) {
  const auditStatus = auditStatusSummary.auditStatus;
  const auditPassed = auditStatusSummary.auditPassed === true;
  const auditBlockingReasons = auditStatusSummary.auditBlockingReasons || [];
  const blockingReasonCodes = auditBlockingReasons.map((reason) => reason.code).filter(Boolean);
  const issueCodes = [
    ...new Set([
      ...auditBlockingReasons.flatMap((reason) => reason.issueCodes || []),
      ...(structureSummary?.issues || []).map((issue) => issue.code),
    ].filter(Boolean)),
  ];
  const recommendedAction = outputRoleDecision?.isSplitOutput === false
    ? outputRoleDecision.recommendedAction
    : auditStatus === 'pass'
    ? 'continue'
    : maxFilesHit
      ? 'rerun-inspect-split-output-with-higher-maxFiles'
      : 'inspect-structureSummary-issues';

  return {
    summaryType: 'output-structure-decision',
    status: auditStatus,
    auditPassed,
    structureConforms: structureSummary?.conforms === true,
    reviewRecommended: auditStatus !== 'pass',
    recommendedAction,
    maxFiles,
    maxFilesHit: Boolean(maxFilesHit),
    blockingReasonCodes,
    issueCodes,
    outputRole: outputRoleDecision?.detectedRole,
    isSplitOutput: outputRoleDecision?.isSplitOutput ?? null,
    auditAppliesToThisDirectory: outputRoleDecision?.auditAppliesToThisDirectory !== false,
    layoutKind: structureSummary?.layoutKind,
    issueCount: structureSummary?.issueCount || 0,
    unexpectedFileCount: structureSummary?.unexpectedFileCount || 0,
    unexpectedDepthFileCount: structureSummary?.unexpectedDepthFileCount || 0,
    manifestCoverageOk: structureSummary?.manifestCoverageOk === true,
    manifestCount: structureSummary?.manifestCount || 0,
    fontEntryCount: structureSummary?.fontEntryCount || 0,
    missingManifestCount: structureSummary?.missingManifestCount || 0,
    outputModeCounts: structureSummary?.outputModeCounts || {},
    evidenceFields: ['outputRoleDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'maxFilesHit', 'inspectionWarnings', 'structureSummary'],
    passCriteria: OUTPUT_AUDIT_PASS_CRITERIA,
    nonIntuitiveBehavior: 'ok:true means the output directory inspection ran; it does not by itself mean the output structure passed. Check outputStructureDecision.status before reporting completion.',
  };
}

export function inferLegacyResultType(fontEntry) {
  if (fontEntry.manifest?.result?.resultType) return fontEntry.manifest.result.resultType;
  if (!fontEntry.hasCss && fontEntry.hasManifest) return 'copy-original-small-glyph';
  if (!fontEntry.hasCss) return 'unknown';
  if (fontEntry.hasReporter || fontEntry.hasProto || fontEntry.woff2Count > 1) return 'subset';
  if (fontEntry.woff2Count === 1) return 'single-woff2';
  return 'unknown';
}

export function buildFontEntryInspection(groupName, splitDirName, originalFiles, outputFiles, manifest) {
  const byExtension = {};
  for (const file of outputFiles) {
    byExtension[file.extension || '(none)'] = (byExtension[file.extension || '(none)'] || 0) + 1;
  }
  const woff2Count = byExtension['.woff2'] || 0;
  const hasCss = outputFiles.some((file) => path.basename(file.path) === 'result.css');
  const hasHtml = outputFiles.some((file) => path.basename(file.path) === 'index.html');
  const hasReporter = outputFiles.some((file) => path.basename(file.path) === 'reporter.bin');
  const hasProto = outputFiles.some((file) => path.basename(file.path) === 'index.proto');
  const resultType = inferLegacyResultType({ manifest, hasCss, hasReporter, hasProto, woff2Count });
  return {
    groupName,
    fontBaseName: splitDirName,
    splitDir: outputFiles[0] ? outputFiles[0].path.split('/').slice(0, -1).join('/') : null,
    originalFiles,
    outputFiles,
    fileCount: outputFiles.length,
    byExtension,
    woff2Count,
    hasCss,
    hasHtml,
    hasReporter,
    hasProto,
    hasManifest: Boolean(manifest),
    manifest,
    outputMode: manifest?.result?.outputMode || (resultType === 'subset' ? 'subset' : resultType.startsWith('single-woff2') ? 'single-woff2' : resultType === 'copy-original-small-glyph' ? 'copy-original' : 'unknown'),
    resultType,
  };
}

export function relativePathInside(baseRelativePath, itemRelativePath) {
  if (baseRelativePath === '.') return itemRelativePath;
  if (itemRelativePath === baseRelativePath) return '';
  const prefix = `${baseRelativePath}/`;
  return itemRelativePath.startsWith(prefix) ? itemRelativePath.slice(prefix.length) : itemRelativePath;
}

export function relativePathDepth(relativePath) {
  return relativePath.split('/').filter(Boolean).length;
}

function incrementDepthCount(counts, depth) {
  const key = String(depth);
  counts[key] = (counts[key] || 0) + 1;
}

function sortedDepthCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts)
      .sort(([left], [right]) => Number(left) - Number(right)),
  );
}

function expectedDepthsForLayout(layoutKind) {
  if (layoutKind === 'single-family') {
    return {
      originalFontDepths: [1],
      outputFileDepths: [2],
      meaning: 'Single-family output keeps original fonts at the output root and generated files one level below.',
    };
  }
  if (layoutKind === 'family-tree') {
    return {
      originalFontDepths: [2],
      outputFileDepths: [3],
      meaning: 'Family-tree output keeps original fonts inside family directories and generated files one level below each font entry.',
    };
  }
  return {
    originalFontDepths: [],
    outputFileDepths: [],
    meaning: 'No stable expected depth is available until the output layout is single-family or family-tree.',
  };
}

function buildOutputRootLevelDiagnosis({
  layoutKind,
  depthIssueFiles,
  expectedDepths,
  fileDepthCounts,
  originalDepthCounts,
  maxDepth,
}) {
  if (layoutKind === 'empty') {
    return {
      summaryType: 'output-root-level-diagnosis',
      status: 'empty',
      likelyCause: 'empty-output',
      recommendedAction: 'Verify outDir points to the generated output root and rerun the producing tool if needed.',
    };
  }

  if (layoutKind === 'single-family' || layoutKind === 'family-tree') {
    if (depthIssueFiles.length === 0) {
      return {
        summaryType: 'output-root-level-diagnosis',
        status: 'expected-root',
        likelyCause: 'none',
        recommendedAction: 'Continue with manifest and output-mode checks before reporting structural success.',
      };
    }

    const expectedOutputDepth = Math.max(...expectedDepths.outputFileDepths);
    const expectedOriginalDepth = Math.min(...expectedDepths.originalFontDepths);
    const hasTooDeepFiles = maxDepth > expectedOutputDepth;
    const hasTooShallowFiles = Object.keys(fileDepthCounts).some((depth) => Number(depth) < expectedOriginalDepth);
    const likelyCause = hasTooDeepFiles
      ? 'generated-files-too-deep'
      : hasTooShallowFiles
        ? 'outDir-points-too-low-or-mixed-root'
        : 'unexpected-output-depth';

    return {
      summaryType: 'output-root-level-diagnosis',
      status: 'unexpected-depth',
      likelyCause,
      recommendedAction: 'Inspect unexpectedDepthFileExamples and rerun inspect_split_output against the intended split-output root, or regenerate output into a clean root.',
    };
  }

  if (layoutKind === 'mixed') {
    return {
      summaryType: 'output-root-level-diagnosis',
      status: 'mixed-root',
      likelyCause: 'single-family-and-family-tree-outputs-mixed',
      recommendedAction: 'Inspect whether multiple output roots were merged or rerun inspect_split_output against a single generated output root.',
    };
  }

  const hasOriginals = Object.keys(originalDepthCounts).length > 0;
  return {
    summaryType: 'output-root-level-diagnosis',
    status: 'unknown-root',
    likelyCause: hasOriginals ? 'originals-at-unexpected-depths' : 'no-recognized-original-fonts',
    recommendedAction: 'Inspect depthProfile, unexpectedFileExamples, and unexpectedDepthFileExamples, then choose the correct output root or regenerate output.',
  };
}

const GENERATED_RESIDUE_FILE_NAMES = new Set([
  'result.css',
  'split-meta.json',
]);

function isGeneratedResidueCandidate(file) {
  const baseName = path.basename(file.path);
  return GENERATED_RESIDUE_FILE_NAMES.has(baseName) || file.extension === '.woff2';
}

function buildStaleResidueDiagnosis({ unexpectedFiles, entryIssueExamples, maxExamples }) {
  const unexpectedGeneratedFiles = unexpectedFiles.filter(isGeneratedResidueCandidate);
  const copyOriginalExtraOutputExamples = entryIssueExamples
    .filter((issue) => issue.code === 'copy-original-extra-output');
  const suspectedResidueCount = unexpectedGeneratedFiles.length + copyOriginalExtraOutputExamples.length;

  if (suspectedResidueCount === 0) {
    return {
      summaryType: 'output-stale-residue-diagnosis',
      status: 'none-detected',
      likelyCause: 'none',
      suspectedResidueCount: 0,
      unexpectedGeneratedFileCount: 0,
      copyOriginalExtraOutputCount: 0,
      examples: [],
      recommendedAction: 'No stale generated-output residue is suggested by the compact audit; continue with manifest and depth checks.',
    };
  }

  const likelyCause = unexpectedGeneratedFiles.length > 0 && copyOriginalExtraOutputExamples.length > 0
    ? 'unexpected-generated-files-and-copy-original-extra-output'
    : unexpectedGeneratedFiles.length > 0
      ? 'unexpected-generated-files'
      : 'copy-original-entry-has-generated-output';

  return {
    summaryType: 'output-stale-residue-diagnosis',
    status: 'suspected-residue',
    likelyCause,
    suspectedResidueCount,
    unexpectedGeneratedFileCount: unexpectedGeneratedFiles.length,
    copyOriginalExtraOutputCount: copyOriginalExtraOutputExamples.length,
    examples: [
      ...unexpectedGeneratedFiles
        .slice(0, maxExamples)
        .map((file) => ({
          code: 'unexpected-generated-file',
          path: file.path,
        })),
      ...copyOriginalExtraOutputExamples
        .slice(0, Math.max(0, maxExamples - unexpectedGeneratedFiles.length))
        .map((issue) => ({
          code: issue.code,
          familyName: issue.familyName,
          fontBaseName: issue.fontBaseName,
          hasCss: issue.hasCss,
          woff2Count: issue.woff2Count,
        })),
    ],
    examplesTruncated: suspectedResidueCount > maxExamples,
    recommendedAction: 'Regenerate into a clean output root or remove stale generated files before treating the audit as complete.',
  };
}

export function buildOutputStructureSummary({
  outDirRelative,
  files,
  families,
  fontEntryCount,
  manifestCount,
  missingManifestCount,
}) {
  const classifiedPaths = new Set();
  const originalDepthCounts = {};
  const fileDepthCounts = {};
  const outputModeCounts = {};
  const entryIssueExamples = [];
  let unknownOutputModeCount = 0;
  let webOutputMissingCount = 0;
  let copyOriginalExtraOutputCount = 0;

  for (const file of files) {
    incrementDepthCount(fileDepthCounts, relativePathDepth(relativePathInside(outDirRelative, file.path)));
  }

  const recordOriginalDepth = (file) => {
    const depth = relativePathDepth(relativePathInside(outDirRelative, file.path));
    incrementDepthCount(originalDepthCounts, depth);
  };

  for (const family of families) {
    for (const originalFile of family.originalFiles || []) {
      classifiedPaths.add(originalFile.path);
      recordOriginalDepth(originalFile);
    }

    for (const entry of family.fontEntries || []) {
      const outputMode = entry.outputMode || 'unknown';
      outputModeCounts[outputMode] = (outputModeCounts[outputMode] || 0) + 1;
      for (const outputFile of entry.outputFiles || []) classifiedPaths.add(outputFile.path);

      if (!['subset', 'single-woff2', 'copy-original'].includes(outputMode)) {
        unknownOutputModeCount++;
        entryIssueExamples.push({
          code: 'unknown-output-mode',
          familyName: entry.groupName,
          fontBaseName: entry.fontBaseName,
          outputMode,
        });
        continue;
      }

      if ((outputMode === 'subset' || outputMode === 'single-woff2') && (!entry.hasCss || entry.woff2Count === 0)) {
        webOutputMissingCount++;
        entryIssueExamples.push({
          code: 'web-output-missing',
          familyName: entry.groupName,
          fontBaseName: entry.fontBaseName,
          outputMode,
          hasCss: entry.hasCss,
          woff2Count: entry.woff2Count,
        });
      }

      if (outputMode === 'copy-original' && (entry.hasCss || entry.woff2Count > 0)) {
        copyOriginalExtraOutputCount++;
        entryIssueExamples.push({
          code: 'copy-original-extra-output',
          familyName: entry.groupName,
          fontBaseName: entry.fontBaseName,
          hasCss: entry.hasCss,
          woff2Count: entry.woff2Count,
        });
      }
    }
  }

  const rootOriginalCount = originalDepthCounts[1] || 0;
  const familyTreeOriginalCount = originalDepthCounts[2] || 0;
  const unexpectedOriginalDepthCount = Object.entries(originalDepthCounts)
    .filter(([depth]) => depth !== '1' && depth !== '2')
    .reduce((count, [, value]) => count + value, 0);

  const layoutKind = files.length === 0
    ? 'empty'
    : rootOriginalCount > 0 && familyTreeOriginalCount === 0 && unexpectedOriginalDepthCount === 0
      ? 'single-family'
      : familyTreeOriginalCount > 0 && rootOriginalCount === 0 && unexpectedOriginalDepthCount === 0
        ? 'family-tree'
        : rootOriginalCount > 0 && familyTreeOriginalCount > 0
          ? 'mixed'
          : 'unknown';

  const depthIssueFiles = [];
  let maxDepth = 0;
  for (const file of files) {
    const depth = relativePathDepth(relativePathInside(outDirRelative, file.path));
    maxDepth = Math.max(maxDepth, depth);
    if (
      (layoutKind === 'single-family' && depth > 2)
      || (layoutKind === 'family-tree' && (depth === 1 || depth > 3))
    ) {
      depthIssueFiles.push(file);
    }
  }

  const unexpectedFiles = files.filter((file) => !classifiedPaths.has(file.path));
  const issues = [];
  const pushIssue = (code, message, count) => {
    if (count > 0) issues.push({ code, message, count });
  };

  pushIssue('empty-output', 'No output files were found.', files.length === 0 ? 1 : 0);
  pushIssue('mixed-output-layout', 'Original font files appear at both root and family-directory depths.', layoutKind === 'mixed' ? 1 : 0);
  pushIssue('unknown-output-layout', 'The output tree does not match the expected single-family or family-tree layout.', layoutKind === 'unknown' ? 1 : 0);
  pushIssue('unexpected-original-depth', 'Original font files were detected at unexpected path depths.', unexpectedOriginalDepthCount);
  pushIssue('unexpected-output-files', 'Files were found outside recognized family/font-entry output locations.', unexpectedFiles.length);
  pushIssue('unexpected-output-depth', 'Files were found at path depths outside the documented output structure.', depthIssueFiles.length);
  pushIssue('missing-manifests', 'Some font entries do not include split-meta.json and were conservatively inferred from file structure.', missingManifestCount);
  pushIssue('unknown-output-mode', 'Some font entries have an unknown output mode.', unknownOutputModeCount);
  pushIssue('web-output-missing', 'Some subset or single-WOFF2 entries are missing result.css or WOFF2 files.', webOutputMissingCount);
  pushIssue('copy-original-extra-output', 'Some copy-original entries unexpectedly contain generated CSS or WOFF2 files.', copyOriginalExtraOutputCount);

  const maxExamples = 20;
  const expectedDepths = expectedDepthsForLayout(layoutKind);
  const rootLevelDiagnosis = buildOutputRootLevelDiagnosis({
    layoutKind,
    depthIssueFiles,
    expectedDepths,
    fileDepthCounts,
    originalDepthCounts,
    maxDepth,
  });
  const staleResidueDiagnosis = buildStaleResidueDiagnosis({
    unexpectedFiles,
    entryIssueExamples,
    maxExamples,
  });
  return {
    conforms: issues.length === 0,
    layoutKind,
    rootLevelDiagnosis,
    staleResidueDiagnosis,
    depthProfile: {
      summaryType: 'output-depth-profile',
      layoutKind,
      maxDepth,
      fileDepthCounts: sortedDepthCounts(fileDepthCounts),
      originalFontDepthCounts: sortedDepthCounts(originalDepthCounts),
      expectedOriginalFontDepths: expectedDepths.originalFontDepths,
      expectedOutputFileDepths: expectedDepths.outputFileDepths,
      rootOriginalCount,
      familyTreeOriginalCount,
      unexpectedOriginalDepthCount,
      unexpectedDepthFileCount: depthIssueFiles.length,
      meaning: expectedDepths.meaning,
      nonIntuitiveBehavior: 'Depths are relative to the inspected outDir; unexpected depths often mean outDir points one level too high or generated files were placed below the documented split-output shape.',
    },
    familyCount: families.length,
    fontEntryCount,
    manifestCount,
    missingManifestCount,
    manifestCoverageOk: manifestCount === fontEntryCount,
    classifiedFileCount: classifiedPaths.size,
    unexpectedFileCount: unexpectedFiles.length,
    unexpectedFileExamples: unexpectedFiles
      .slice(0, maxExamples)
      .map((file) => file.path),
    unexpectedFileExamplesTruncated: unexpectedFiles.length > maxExamples,
    unexpectedDepthFileCount: depthIssueFiles.length,
    unexpectedDepthFileExamples: depthIssueFiles
      .slice(0, maxExamples)
      .map((file) => file.path),
    unexpectedDepthFileExamplesTruncated: depthIssueFiles.length > maxExamples,
    outputModeCounts,
    entryIssueExamples: entryIssueExamples.slice(0, maxExamples),
    entryIssueExamplesTruncated: entryIssueExamples.length > maxExamples,
    issueCount: issues.length,
    issues,
  };
}

export async function inspectSplitOutput(args) {
  const outDir = await resolveWorkspacePath(args.outDir || 'split-output', { mustExist: true });
  const outDirRelative = toRelativeWorkspacePath(outDir);
  const maxFiles = normalizePositiveNumberOption(args, 'maxFiles', 200000, { integer: true, max: 200000 });
  const includeFiles = normalizeBooleanOption(args, 'includeFiles', true);
  const includeFamilies = normalizeBooleanOption(args, 'includeFamilies', true);
  const outputSummary = await summarizeFilesDetailed(outDir, { maxFiles });
  const files = outputSummary.files;
  const byExtension = {};
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.sizeBytes;
    byExtension[file.extension || '(none)'] = (byExtension[file.extension || '(none)'] || 0) + 1;
  }

  const relativeEntries = files.map((file) => ({
    ...file,
    relativePath: relativePathInside(outDirRelative, file.path),
  }));
  const maxDepth = relativeEntries.reduce((depth, file) => Math.max(depth, file.relativePath.split('/').filter(Boolean).length), 0);
  const singleFamilyLayout = maxDepth <= 2;

  const familyMap = new Map();
  const ensureFamily = (familyName) => {
    if (!familyMap.has(familyName)) {
      familyMap.set(familyName, { originals: [], splitDirs: new Map() });
    }
    return familyMap.get(familyName);
  };

  for (const file of relativeEntries) {
    const relativeParts = file.relativePath.split('/').filter(Boolean);
    if (relativeParts.length === 0) continue;

    if (singleFamilyLayout) {
      if (relativeParts.length === 1 && FONT_EXTENSIONS.has(file.extension)) {
        const family = ensureFamily(path.basename(outDirRelative));
        family.originals.push(file);
        continue;
      }
      if (relativeParts.length >= 2) {
        const family = ensureFamily(path.basename(outDirRelative));
        const splitDirName = relativeParts[0];
        if (!family.splitDirs.has(splitDirName)) family.splitDirs.set(splitDirName, []);
        family.splitDirs.get(splitDirName).push(file);
      }
      continue;
    }

    const familyName = relativeParts[0];
    if (relativeParts.length === 2 && FONT_EXTENSIONS.has(file.extension)) {
      const family = ensureFamily(familyName);
      family.originals.push(file);
      continue;
    }
    if (relativeParts.length >= 3) {
      const family = ensureFamily(familyName);
      const splitDirName = relativeParts[1];
      if (!family.splitDirs.has(splitDirName)) family.splitDirs.set(splitDirName, []);
      family.splitDirs.get(splitDirName).push(file);
    }
  }

  const families = [];
  let fontEntryCount = 0;
  let manifestCount = 0;
  let subsetOutputCount = 0;
  let singleWoff2OutputCount = 0;
  let copyOriginalOutputCount = 0;
  let missingManifestCount = 0;

  for (const [familyName, family] of [...familyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const fontEntries = [];
    for (const [splitDirName, outputFiles] of [...family.splitDirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const splitDirPath = singleFamilyLayout
        ? path.join(outDir, splitDirName)
        : path.join(outDir, familyName, splitDirName);
      const manifest = await readSplitManifest(splitDirPath);
      const manifestCopiedOriginalPath = manifest?.result?.copiedOriginalPath || null;
      const originalFiles = manifestCopiedOriginalPath
        ? family.originals.filter((file) => file.path === manifestCopiedOriginalPath)
        : family.originals.filter((file) => path.basename(file.path, file.extension) === splitDirName);
      const entry = buildFontEntryInspection(familyName, splitDirName, originalFiles, outputFiles, manifest);
      fontEntries.push(entry);
      fontEntryCount++;
      if (entry.hasManifest) manifestCount++; else missingManifestCount++;
      if (entry.outputMode === 'subset') subsetOutputCount++;
      if (entry.outputMode === 'single-woff2') singleWoff2OutputCount++;
      if (entry.outputMode === 'copy-original') copyOriginalOutputCount++;
    }
    families.push({
      familyName,
      originalFiles: family.originals,
      fontEntryCount: fontEntries.length,
      fontEntries,
    });
  }

  const structureSummary = buildOutputStructureSummary({
    outDirRelative,
    files,
    families,
    fontEntryCount,
    manifestCount,
    missingManifestCount,
  });
  const outputRoleDecision = buildOutputRoleDecision({
    outDirRelative,
    relativeEntries,
    maxFiles,
  });

  const inspectionWarnings = buildOutputInspectionWarnings({
    maxFilesHit: outputSummary.truncated,
    maxFiles,
    includeFiles,
    includeFamilies,
    missingManifestCount,
    structureIssueCount: structureSummary.issueCount,
    outputRoleDecision,
  });
  const auditStatusSummary = buildOutputAuditStatus({
    maxFilesHit: outputSummary.truncated,
    maxFiles,
    structureSummary,
    outputRoleDecision,
  });
  const outputStructureDecision = buildOutputStructureDecision({
    auditStatusSummary,
    maxFilesHit: outputSummary.truncated,
    maxFiles,
    structureSummary,
    outputRoleDecision,
  });

  return {
    ok: true,
    outDir: outDirRelative,
    maxFiles,
    maxFilesHit: outputSummary.truncated,
    ...auditStatusSummary,
    outputRoleDecision,
    outputStructureDecision,
    fileCount: files.length,
    totalBytes,
    byExtension,
    filesIncluded: includeFiles,
    inspectionWarningCount: inspectionWarnings.length,
    inspectionWarnings,
    familyCount: families.length,
    fontEntryCount,
    manifestCount,
    subsetOutputCount,
    singleWoff2OutputCount,
    copyOriginalOutputCount,
    missingManifestCount,
    structureSummary,
    familiesIncluded: includeFamilies,
    ...(includeFiles ? { files } : {}),
    ...(includeFamilies ? { families } : {}),
  };
}
