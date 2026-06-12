import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { StaticWasm, fontSplit } from 'cn-font-split/dist/wasm/index.mjs';

const require = createRequire(import.meta.url);
const woff2Decompress = require('wawoff2/decompress');
const woff2Compress = require('wawoff2/compress');
const packageJson = require('../package.json');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const DEFAULT_WORKSPACE_ROOT = path.resolve(process.cwd());
const CN_FONT_SPLIT_PACKAGE_JSON = path.resolve(PROJECT_ROOT, 'node_modules/cn-font-split/package.json');
const CN_FONT_SPLIT_VERSION_FILE = path.resolve(PROJECT_ROOT, 'node_modules/cn-font-split/dist/version');
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2']);
const FORMAT_PRIORITY = { '.otf': 0, '.ttf': 1, '.woff2': 2, '.ttc': 3, '.otc': 4, '.woff': 5 };
const MANIFEST_FILE_NAME = 'split-meta.json';
const MANIFEST_VERSION = 1;
const ORGANIZATION_MANIFEST_FILE_NAME = 'font-organization-manifest.json';
const ORGANIZATION_MANIFEST_VERSION = 1;
const PACKAGE_VERSION = packageJson.version;
let wasmRuntimePromise;
let wasmPath;

function resolveWasmRuntimePath() {
  return process.env.FONT_SPLIT_WASM_PATH
    ? path.resolve(process.env.FONT_SPLIT_WASM_PATH)
    : path.resolve(PROJECT_ROOT, 'node_modules/cn-font-split/dist/libffi-wasm32-wasip1.wasm');
}

function getWasmRuntimePath() {
  const resolvedWasmPath = resolveWasmRuntimePath();
  if (wasmPath !== resolvedWasmPath) {
    wasmPath = resolvedWasmPath;
    wasmRuntimePromise = null;
  }
  return wasmPath;
}

async function getWasmRuntime() {
  const runtimePath = getWasmRuntimePath();
  if (!wasmRuntimePromise) {
    wasmRuntimePromise = (async () => {
      const wasmBuffer = await fs.readFile(runtimePath);
      return new StaticWasm(wasmBuffer);
    })();
  }
  return wasmRuntimePromise;
}

function resetWasmRuntime() {
  wasmRuntimePromise = null;
}

function workspaceRoot() {
  return path.resolve(process.env.FONT_SPLIT_ROOT || DEFAULT_WORKSPACE_ROOT);
}

function isInside(parent, candidate) {
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
  return path.relative(workspaceRoot(), absolutePath).replaceAll(path.sep, '/');
}

async function pathStatus(targetPath) {
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

async function readPackageVersion(packageJsonPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    return {
      version: parsed.version || null,
      error: null,
    };
  } catch (error) {
    return {
      version: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readRuntimeVersionEntries(versionFilePath) {
  try {
    const entries = (await fs.readFile(versionFilePath, 'utf8'))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const wasmEntry = entries.find((entry) => entry.startsWith('wasm32-wasip1@')) || null;
    return {
      entries,
      wasmVersion: wasmEntry ? wasmEntry.slice('wasm32-wasip1@'.length) : null,
      error: null,
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        entries: [],
        wasmVersion: null,
        error: null,
      };
    }
    return {
      entries: [],
      wasmVersion: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function minimumMajorFromEngineRange(range) {
  if (typeof range !== 'string') return null;
  const match = range.match(/>=\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function getNodeRuntimeInfo() {
  const requiredVersion = packageJson.engines?.node || null;
  const requiredMajor = minimumMajorFromEngineRange(requiredVersion);
  const major = Number(process.versions.node.split('.')[0]);
  const ok = Number.isFinite(major) && (requiredMajor === null || major >= requiredMajor);
  return {
    version: process.version,
    versionWithoutPrefix: process.versions.node,
    major,
    requiredVersion,
    requiredMajor,
    ok,
  };
}

function buildRuntimeRecommendedActions({
  nodeRuntime,
  workspace,
  workspaceRootPath,
  wasm,
  cnFontSplitPackage,
  cnFontSplitPackageInfo,
  cnFontSplitRuntimeInfo,
  wasmPathConfigured,
}) {
  const actions = [];

  if (nodeRuntime.ok === false) {
    actions.push({
      code: 'upgrade-node-runtime',
      severity: 'error',
      message: `Run mcp-font-split with Node ${nodeRuntime.requiredVersion || 'required by package.json'} before starting the MCP server. Current runtime: ${nodeRuntime.version}`,
    });
  }

  if (!workspace.exists || !workspace.isDirectory) {
    actions.push({
      code: 'fix-workspace-root',
      severity: 'error',
      message: `Set FONT_SPLIT_ROOT to an existing directory, or start the MCP server from the intended font workspace. Current root: ${workspaceRootPath}`,
    });
  }

  if (!cnFontSplitPackage.exists || !cnFontSplitPackage.isFile || !cnFontSplitPackageInfo.version) {
    actions.push({
      code: 'install-dependencies',
      severity: 'error',
      message: 'Install npm dependencies so cn-font-split package metadata is available.',
      command: 'npm install',
    });
  }

  if (!wasm.exists || !wasm.isFile) {
    actions.push({
      code: 'install-wasm-runtime',
      severity: 'error',
      message: 'Install the cn-font-split WASM runtime before splitting fonts, or set FONT_SPLIT_WASM_PATH to an existing WASM file.',
      command: 'npm run install:wasm',
    });
  }

  if (cnFontSplitRuntimeInfo.error) {
    actions.push({
      code: 'inspect-wasm-runtime-version',
      severity: 'warning',
      message: `Could not read the cn-font-split runtime version file: ${cnFontSplitRuntimeInfo.error}`,
    });
  } else if (wasm.exists && wasm.isFile && !cnFontSplitRuntimeInfo.wasmVersion) {
    actions.push({
      code: 'record-wasm-runtime-version',
      severity: 'warning',
      message: wasmPathConfigured
        ? 'A custom FONT_SPLIT_WASM_PATH is configured, so the cn-font-split runtime release could not be inferred from the packaged version file.'
        : 'The WASM file exists, but its cn-font-split runtime release is not recorded.',
      ...(wasmPathConfigured ? {} : { command: 'npm run install:wasm -- --force' }),
    });
  }

  return actions;
}

export async function getRuntimeStatus() {
  const configuredRoot = process.env.FONT_SPLIT_ROOT || null;
  const configuredWasmPath = process.env.FONT_SPLIT_WASM_PATH || null;
  const root = workspaceRoot();
  const runtimePath = getWasmRuntimePath();
  const nodeRuntime = getNodeRuntimeInfo();
  const workspace = await pathStatus(root);
  const wasm = await pathStatus(runtimePath);
  const cnFontSplitPackage = await pathStatus(CN_FONT_SPLIT_PACKAGE_JSON);
  const cnFontSplitVersionFile = await pathStatus(CN_FONT_SPLIT_VERSION_FILE);
  const cnFontSplitPackageInfo = await readPackageVersion(CN_FONT_SPLIT_PACKAGE_JSON);
  const cnFontSplitRuntimeInfo = await readRuntimeVersionEntries(CN_FONT_SPLIT_VERSION_FILE);
  const recommendedActions = buildRuntimeRecommendedActions({
    nodeRuntime,
    workspace,
    workspaceRootPath: root,
    wasm,
    cnFontSplitPackage,
    cnFontSplitPackageInfo,
    cnFontSplitRuntimeInfo,
    wasmPathConfigured: configuredWasmPath !== null,
  });
  const checks = [
    {
      name: 'node-runtime',
      ok: nodeRuntime.ok,
      message: nodeRuntime.ok
        ? `Node ${nodeRuntime.version} satisfies ${nodeRuntime.requiredVersion || 'package requirements'}`
        : `Node ${nodeRuntime.version} does not satisfy ${nodeRuntime.requiredVersion || 'package requirements'}`,
    },
    {
      name: 'workspace-root',
      ok: workspace.exists && workspace.isDirectory,
      message: workspace.exists && workspace.isDirectory ? 'workspace root is available' : 'workspace root is missing or not a directory',
    },
    {
      name: 'wasm-runtime',
      ok: wasm.exists && wasm.isFile,
      message: wasm.exists && wasm.isFile ? 'cn-font-split WASM runtime is available' : 'cn-font-split WASM runtime is missing',
    },
    {
      name: 'cn-font-split-package',
      ok: cnFontSplitPackage.exists && cnFontSplitPackage.isFile && Boolean(cnFontSplitPackageInfo.version),
      message: cnFontSplitPackageInfo.version ? `cn-font-split package ${cnFontSplitPackageInfo.version} is available` : 'cn-font-split package metadata is missing',
    },
  ];

  return {
    ok: checks.every((check) => check.ok),
    packageName: packageJson.name,
    packageVersion: PACKAGE_VERSION,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    projectRoot: PROJECT_ROOT,
    node: nodeRuntime,
    workspace: {
      root,
      fontSplitRootConfigured: configuredRoot !== null,
      configuredRoot,
      ...workspace,
    },
    wasm: {
      path: runtimePath,
      fontSplitWasmPathConfigured: configuredWasmPath !== null,
      configuredPath: configuredWasmPath,
      ...wasm,
    },
    cnFontSplit: {
      packageJsonPath: CN_FONT_SPLIT_PACKAGE_JSON,
      packageVersion: cnFontSplitPackageInfo.version,
      packageError: cnFontSplitPackageInfo.error,
      packageJson: cnFontSplitPackage,
      runtimeVersionPath: CN_FONT_SPLIT_VERSION_FILE,
      runtimeVersion: cnFontSplitRuntimeInfo.wasmVersion,
      runtimeVersionEntries: cnFontSplitRuntimeInfo.entries,
      runtimeVersionError: cnFontSplitRuntimeInfo.error,
      runtimeVersionFile: cnFontSplitVersionFile,
    },
    supportedExtensions: [...FONT_EXTENSIONS],
    checks,
    recommendedActions,
  };
}

export function getAgentGuidance(args = {}) {
  const workflow = ['overview', 'single', 'batch', 'inspect', 'organize'].includes(args.workflow) ? args.workflow : 'overview';
  const configuredRoot = process.env.FONT_SPLIT_ROOT || null;
  const root = workspaceRoot();
  const commonPathRules = [
    'Resolve every relative path inside FONT_SPLIT_ROOT.',
    'If FONT_SPLIT_ROOT is not configured and the user has not named a workspace, ask before processing private local fonts.',
    'Use inspect_font_inputs before large or unfamiliar font libraries.',
    'Use organize_font_directory with dryRun true when the source directory layout does not match the desired batch grouping; it is source-non-destructive and defaults to plan-only.',
    'Use dryRun with includeResults true to preview batch naming, dedupe, and skip decisions without writing output.',
    'For repeatable automation, prefer strictMode true or explicit skipMode manifest plus batchErrorMode fail-after.',
  ];
  const verificationChecklist = [
    {
      id: 'runtime-ready',
      appliesTo: ['overview', 'single', 'batch', 'inspect', 'organize'],
      check: 'Before splitting, get_runtime_status.ok is true, or every recommendedActions[] item has been handled.',
      responseFields: ['ok', 'recommendedActions', 'node', 'workspace', 'wasm', 'cnFontSplit'],
    },
    {
      id: 'input-scan-complete',
      appliesTo: ['overview', 'batch', 'inspect', 'organize'],
      check: 'Before trusting a source scan, inspect maxFilesHit and inspectionWarnings; rerun with a higher maxFiles when truncated.',
      responseFields: ['maxFilesHit', 'inspectionWarnings', 'supportedFontCount', 'invalidFontCount', 'missingIdentityCount'],
    },
    {
      id: 'layout-plan-reviewed',
      appliesTo: ['overview', 'batch', 'organize'],
      check: 'When source layout may not match the intended output grouping, call organize_font_directory with dryRun true and inspect layout, recommendedBatchOptions, sourceDestructive, writesSourceTree, writesOutputTree, mayOverwriteOutputTree, and organizationWarnings before applying any copy plan.',
      responseFields: ['layout', 'recommendedBatchOptions', 'destructive', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'mayOverwriteOutputTree', 'organizationWarnings', 'plan'],
    },
    {
      id: 'batch-plan-reviewed',
      appliesTo: ['overview', 'batch'],
      check: 'For unfamiliar batch runs, review a dryRun plan before writing output.',
      responseFields: ['dryRun', 'planIncluded', 'plannedCount', 'wouldProcessCount', 'skippedDuplicates'],
    },
    {
      id: 'process-outcome-checked',
      appliesTo: ['single', 'batch'],
      check: 'After processing, inspect resultType, outputMode, performedSplit, usedFallback, warnings, batchWarnings, errorCount, and errors before claiming success.',
      responseFields: ['resultType', 'outputMode', 'performedSplit', 'usedFallback', 'warnings', 'batchWarnings', 'errorCount', 'errors'],
    },
    {
      id: 'fallback-disclosed',
      appliesTo: ['single', 'batch'],
      check: 'If usedFallback is true or outputMode is single-woff2/copy-original, say that the result was not a normal multi-subset split.',
      responseFields: ['usedFallback', 'outputMode', 'resultType'],
    },
    {
      id: 'output-audited',
      appliesTo: ['overview', 'batch', 'inspect'],
      check: 'After batch processing, inspect the output directory and verify maxFilesHit and inspectionWarnings before treating the audit as complete.',
      responseFields: ['maxFilesHit', 'inspectionWarnings', 'manifestCount', 'legacyOutputCount', 'subsetOutputCount', 'singleWoff2OutputCount', 'copyOriginalOutputCount'],
    },
  ];

  const workflows = {
    overview: [
      'Call get_agent_guidance to orient yourself.',
      'Call get_runtime_status when diagnosing setup, workspace, cn-font-split package, or WASM runtime availability.',
      'Call inspect_font_inputs for a no-write source preflight.',
      'Call organize_font_directory with dryRun true if directory layout is flat/mixed/unfamiliar or if the user asks to stage fonts into a cleaner structure.',
      'Call split_font_batch with dryRun true to preview output layout.',
      'Call split_font_batch with includeResults false for full-library processing.',
      'Call inspect_split_output after processing; use includeFiles false and includeFamilies false for compact summaries.',
    ],
    single: [
      'Call split_font with one fontPath.',
      'Inspect resultType, outputMode, performedSplit, usedFallback, warnings, and manifestPath.',
      'Use splitFailureAction single-woff2 only when fallback output is acceptable.',
    ],
    batch: [
      'Call inspect_font_inputs with includeFiles false for a compact source summary.',
      'Call organize_font_directory with dryRun true when source directory structure and desired family grouping do not match.',
      'Call split_font_batch with dryRun true and includeResults true to review planned paths.',
      'Use batchNamingMode numeric-suffix and batchDedupeMode font-identity unless the user asks for another policy.',
      'Use includeResults false for large real runs.',
      'Call inspect_split_output on the outputRoot when done; use includeFiles false and includeFamilies false for large outputs.',
    ],
    inspect: [
      'Call get_runtime_status to verify workspace, cn-font-split package, and WASM runtime availability when setup is uncertain.',
      'Call inspect_font_inputs to audit source directories before processing.',
      'Call inspect_split_output to audit generated output directories; set includeFiles false and includeFamilies false when only summary counts are needed.',
      'If maxFilesHit is true, rerun with a higher maxFiles before treating the summary as complete.',
    ],
    organize: [
      'Call organize_font_directory with dryRun true first; review layout, recommendedBatchOptions, organizationWarnings, and plan before writing copies.',
      'If the plan is acceptable, call organize_font_directory again with dryRun false to copy selected fonts into outputDir. This never moves or deletes source files.',
      'After organizing, run inspect_font_inputs on outputDir or split_font_batch with inputDir set to outputDir.',
      'If organizationWarnings contains output-overwrite-enabled or output-inside-input, disclose the risk before proceeding.',
    ],
  };

  return {
    ok: true,
    purpose: 'AI-agent guidance for using mcp-font-split safely and predictably.',
    workflow,
    agentOptimized: true,
    workspace: {
      root,
      fontSplitRootConfigured: configuredRoot !== null,
      configuredRoot,
      relativePathBase: 'FONT_SPLIT_ROOT',
    },
    tools: [
      { name: 'get_agent_guidance', useWhen: 'Orient an AI coding assistant before choosing a font-splitting workflow.' },
      { name: 'get_runtime_status', useWhen: 'Check workspace, Node engine compatibility, mcp-font-split package, cn-font-split package/runtime, and WASM availability without writing files.' },
      { name: 'inspect_font_inputs', useWhen: 'Preflight source fonts without writing output.' },
      { name: 'organize_font_directory', useWhen: 'Plan or copy-organize a mismatched font directory layout. Defaults to dryRun true and never moves or deletes source files.' },
      { name: 'split_font', useWhen: 'Process one known font file.' },
      { name: 'split_font_batch', useWhen: 'Scan, dedupe, name, skip-check, and process many fonts.' },
      { name: 'inspect_split_output', useWhen: 'Audit generated output structure and manifests.' },
    ],
    supportedExtensions: [...FONT_EXTENSIONS],
    defaultPolicies: {
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      batchErrorMode: 'collect',
      skipMode: 'legacy-css',
      strictMode: false,
      inspectInputMaxFiles: 50000,
      batchMaxFiles: 5000,
      outputInspectMaxFiles: 200000,
      organizeDryRun: true,
      organizeOutputDir: 'organized-fonts',
      organizeSourceDestructive: false,
    },
    recommendedBatchOptions: {
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      strictMode: true,
      includeResults: false,
      splitFailureAction: 'single-woff2',
    },
    recommendedInspectOptions: {
      includeFiles: false,
      includeFamilies: false,
      maxFiles: 200000,
    },
    recommendedOrganizationOptions: {
      dryRun: true,
      includePlan: true,
      batchGroupBy: 'auto',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      copyInvalidFonts: false,
      overwriteExisting: false,
    },
    verificationChecklist,
    responseFieldsToCheck: [
      'ok',
      'node',
      'workspace',
      'wasm',
      'wasm.fontSplitWasmPathConfigured',
      'cnFontSplit',
      'cnFontSplit.packageVersion',
      'cnFontSplit.runtimeVersion',
      'recommendedActions',
      'resultType',
      'outputMode',
      'performedSplit',
      'usedFallback',
      'warnings',
      'batchWarnings',
      'batchWarningCount',
      'errorCount',
      'errors',
      'maxFilesHit',
      'inspectionWarnings',
      'inspectionWarningCount',
      'organizationWarnings',
      'organizationWarningCount',
      'destructive',
      'sourceDestructive',
      'writesSourceTree',
      'writesOutputTree',
      'mayOverwriteOutputTree',
      'recommendedBatchOptions',
      'resultsIncluded',
      'planIncluded',
      'manifestCount',
      'legacyOutputCount',
      'filesIncluded',
      'familiesIncluded',
    ],
    pathRules: commonPathRules,
    recommendedWorkflow: workflows[workflow],
  };
}

async function listFilesRecursive(root, { maxFiles = 5000, excludeDirs = [] } = {}) {
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

async function scanFilesRecursive(root, { maxFiles = 5000, excludeDirs = [] } = {}) {
  const probeLimit = maxFiles + 1;
  const files = await listFilesRecursive(root, { maxFiles: probeLimit, excludeDirs });
  return {
    files: files.slice(0, maxFiles),
    truncated: files.length > maxFiles,
  };
}

async function summarizeFilesDetailed(dir, { maxFiles = 5000 } = {}) {
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

async function summarizeFiles(dir, { maxFiles = 5000 } = {}) {
  return (await summarizeFilesDetailed(dir, { maxFiles })).files;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function normalizeOptionalNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeOptionalBoolean(value) {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeProcessingOptions(args) {
  const smallGlyphAction = args.smallGlyphAction === 'skip' ? 'copy-original' : args.smallGlyphAction;
  const smallGlyphActions = ['subset', 'single-woff2', 'copy-original'];
  return {
    oversizedKernAction: args.oversizedKernAction === 'strip' ? 'strip' : 'preserve',
    smallGlyphAction: smallGlyphActions.includes(smallGlyphAction) ? smallGlyphAction : 'subset',
    smallGlyphThreshold: Number.isFinite(args.smallGlyphThreshold) && args.smallGlyphThreshold > 0
      ? Math.floor(args.smallGlyphThreshold)
      : 50,
    splitFailureAction: args.splitFailureAction === 'single-woff2' ? 'single-woff2' : 'error',
  };
}

function normalizeBatchOptions(args) {
  const strictMode = args.strictMode === true;
  return {
    strictMode,
    skipMode: ['legacy-css', 'manifest', 'force'].includes(args.skipMode) ? args.skipMode : strictMode ? 'manifest' : 'legacy-css',
    batchGroupBy: ['auto', 'source-dir', 'font-family'].includes(args.batchGroupBy) ? args.batchGroupBy : 'auto',
    batchNamingMode: ['plain', 'numeric-suffix', 'source-suffix'].includes(args.batchNamingMode) ? args.batchNamingMode : 'numeric-suffix',
    batchDedupeMode: ['none', 'same-path', 'font-identity'].includes(args.batchDedupeMode) ? args.batchDedupeMode : 'font-identity',
    batchErrorMode: ['collect', 'fail-fast', 'fail-after'].includes(args.batchErrorMode) ? args.batchErrorMode : strictMode ? 'fail-after' : 'collect',
    debugBatchDecisions: args.debugBatchDecisions === true,
  };
}

function normalizeOrganizationOptions(args) {
  return {
    dryRun: args.dryRun !== false,
    includePlan: args.includePlan !== false,
    batchGroupBy: ['auto', 'source-dir', 'font-family'].includes(args.batchGroupBy) ? args.batchGroupBy : 'auto',
    batchNamingMode: ['plain', 'numeric-suffix', 'source-suffix'].includes(args.batchNamingMode) ? args.batchNamingMode : 'numeric-suffix',
    batchDedupeMode: ['none', 'same-path', 'font-identity'].includes(args.batchDedupeMode) ? args.batchDedupeMode : 'font-identity',
    copyInvalidFonts: args.copyInvalidFonts === true,
    overwriteExisting: args.overwriteExisting === true,
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildEffectiveConfigSnapshot(args, processingOptions) {
  const snapshot = {
    processingOptions,
  };

  if (['plain', 'numeric-suffix', 'source-suffix'].includes(args.batchNamingMode)) {
    snapshot.batchNamingMode = args.batchNamingMode;
  }
  if (['none', 'same-path', 'font-identity'].includes(args.batchDedupeMode)) {
    snapshot.batchDedupeMode = args.batchDedupeMode;
  }
  if (['collect', 'fail-fast', 'fail-after'].includes(args.batchErrorMode)) {
    snapshot.batchErrorMode = args.batchErrorMode;
  }

  const optionalStrings = [
    'fontFamily', 'fontWeight', 'fontStyle', 'fontDisplay', 'cssFileName',
    'previewText', 'previewName', 'renameOutputFont', 'buildMode',
  ];
  for (const key of optionalStrings) {
    const value = normalizeOptionalString(args[key]);
    if (value !== undefined) snapshot[key] = value;
  }

  const optionalNumbers = [
    'chunkSize', 'chunkSizeTolerance', 'maxAllowSubsetsCount',
  ];
  for (const key of optionalNumbers) {
    const value = normalizeOptionalNumber(args[key]);
    if (value !== undefined) snapshot[key] = value;
  }

  const optionalBooleans = [
    'languageAreas', 'testHtml', 'reporter', 'multiThreads', 'fontFeature',
    'reduceMins', 'autoSubset', 'subsetRemainChars', 'strictMode',
  ];
  for (const key of optionalBooleans) {
    const value = normalizeOptionalBoolean(args[key]);
    if (value !== undefined) snapshot[key] = value;
  }

  if (Array.isArray(args.subsets) && args.subsets.length > 0) {
    snapshot.subsets = args.subsets;
  }

  return snapshot;
}

function classifyResultType({ outputMode, splitFailureFallbackApplied, skipReason }) {
  if (outputMode === 'copy-original') return 'copy-original-small-glyph';
  if (outputMode !== 'single-woff2') return 'subset';
  if (splitFailureFallbackApplied) return 'single-woff2-split-failure';
  if (skipReason === 'small glyph fallback explicitly enabled') return 'single-woff2-small-glyph';
  return 'single-woff2';
}

function buildWarnings({ decompressedFrom, oversizedKernDetected, oversizedKernStripped, usedFallback, skipped, skipReason }) {
  const warnings = [];
  if (decompressedFrom) warnings.push(`input was decompressed from ${decompressedFrom}`);
  if (oversizedKernDetected && !oversizedKernStripped) warnings.push('oversized kern table detected but preserved');
  if (oversizedKernStripped) warnings.push('oversized kern table stripped before splitting');
  if ((usedFallback || skipped) && skipReason) warnings.push(skipReason);
  return warnings;
}

function buildBatchWarnings({
  dryRun,
  includeResults,
  inputScanTruncated,
  maxFiles,
  deduplicatedCount,
  selectedCount,
  skippedExisting,
  errorCount,
  batchErrorMode,
}) {
  const warnings = [];
  const push = (code, message) => warnings.push({ code, message });

  if (dryRun) {
    push('dry-run-no-write', 'dryRun is true; no output files were written.');
  }
  if (inputScanTruncated) {
    push('input-scan-truncated', `Input scan hit maxFiles (${maxFiles}); rerun with a higher maxFiles before treating counts as complete.`);
  }
  if (selectedCount < deduplicatedCount) {
    push('batch-limit-truncated', `Batch limit selected ${selectedCount} of ${deduplicatedCount} deduplicated fonts.`);
  }
  if (!includeResults) {
    push(
      dryRun ? 'batch-plan-omitted' : 'batch-results-omitted',
      dryRun
        ? 'Dry-run plan details are omitted because includeResults is false.'
        : 'Per-font result details are omitted because includeResults is false.',
    );
  }
  if (skippedExisting > 0) {
    push('existing-output-skipped', `${skippedExisting} selected fonts were skipped because existing output matched the selected skipMode.`);
  }
  if (errorCount > 0 && batchErrorMode === 'collect') {
    push('errors-collected', 'Per-font errors were collected in errors[]; inspect them before claiming the batch fully succeeded.');
  }

  return warnings;
}

function buildInputInspectionWarnings({ maxFilesHit, maxFiles, includeFiles, invalidFontCount, missingIdentityCount }) {
  const warnings = [];
  const push = (code, message) => warnings.push({ code, message });

  if (maxFilesHit) {
    push('input-scan-truncated', `Input inspection hit maxFiles (${maxFiles}); rerun with a higher maxFiles before treating counts as complete.`);
  }
  if (!includeFiles) {
    push('input-files-omitted', 'Per-font inspection entries are omitted because includeFiles is false.');
  }
  if (invalidFontCount > 0) {
    push('invalid-fonts-found', `${invalidFontCount} supported-extension files could not be parsed as fonts.`);
  }
  if (missingIdentityCount > 0) {
    push('font-identity-missing', `${missingIdentityCount} parseable fonts do not have a usable batch identity key.`);
  }

  return warnings;
}

function buildOutputInspectionWarnings({ maxFilesHit, maxFiles, includeFiles, includeFamilies, legacyOutputCount }) {
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
  if (legacyOutputCount > 0) {
    push('legacy-output-detected', `${legacyOutputCount} output entries were inferred without split-meta.json manifests.`);
  }

  return warnings;
}

function buildOrganizationWarnings({
  dryRun,
  overwriteExisting,
  inputScanTruncated,
  maxFiles,
  unsupportedFileCount,
  invalidFontCount,
  copyInvalidFonts,
  skippedDuplicateCount,
  layoutKind,
  outputDirInsideInput,
}) {
  const warnings = [];
  const push = (code, message) => warnings.push({ code, message });

  if (dryRun) {
    push('organization-dry-run', 'dryRun is true; no directories or files were written.');
  } else {
    push('organization-writes-output', 'dryRun is false; this tool may create directories and copy files into outputDir, but it never moves or deletes source files.');
  }
  if (overwriteExisting) {
    push('output-overwrite-enabled', 'overwriteExisting is true; matching files in outputDir may be replaced, but source files are still not modified.');
  }
  if (inputScanTruncated) {
    push('input-scan-truncated', `Directory organization scan hit maxFiles (${maxFiles}); rerun with a higher maxFiles before treating the plan as complete.`);
  }
  if (unsupportedFileCount > 0) {
    push('unsupported-files-ignored', `${unsupportedFileCount} non-font files were ignored. This organizer only plans supported font extensions.`);
  }
  if (invalidFontCount > 0 && !copyInvalidFonts) {
    push('invalid-fonts-skipped', `${invalidFontCount} supported-extension files could not be parsed as fonts and were skipped. Set copyInvalidFonts true only if preserving broken font-like files is intentional.`);
  }
  if (skippedDuplicateCount > 0) {
    push('duplicate-fonts-skipped', `${skippedDuplicateCount} equivalent fonts were skipped by the selected batchDedupeMode.`);
  }
  if (layoutKind === 'mixed') {
    push('mixed-layout-detected', 'Fonts were found both at the input root and inside nested folders. Review recommendedBatchOptions before splitting.');
  }
  if (outputDirInsideInput) {
    push('output-inside-input', 'outputDir is inside inputDir. Future scans should exclude that output directory to avoid reprocessing organized copies.');
  }

  return warnings;
}

function logBatchDecision(enabled, event, details) {
  if (!enabled) return;
  console.log(JSON.stringify({ scope: 'batch-decision', event, ...details }));
}

function buildBatchError({ mode, errors, summary }) {
  const error = new Error(`split_font_batch failed with ${errors.length} error(s) in ${mode} mode.`);
  error.name = 'BatchSplitError';
  error.details = { mode, errors, summary };
  return error;
}

function manifestPathForSplitDir(splitDir) {
  return path.join(splitDir, MANIFEST_FILE_NAME);
}

async function writeSplitManifest(splitDir, manifest) {
  await fs.writeFile(manifestPathForSplitDir(splitDir), JSON.stringify(manifest, null, 2));
}

async function readSplitManifest(splitDir) {
  try {
    return JSON.parse(await fs.readFile(manifestPathForSplitDir(splitDir), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function buildSplitManifest({ inputRelativePath, inputStat, groupName, outDirRelative, splitDirRelative, effectiveConfig, result }) {
  return {
    manifestVersion: MANIFEST_VERSION,
    toolVersion: PACKAGE_VERSION,
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

async function resolveBatchFamilyDirName({ file, inputDir, groupingMode }) {
  const relativeToInput = path.relative(inputDir, file);
  const segments = relativeToInput.split(path.sep);
  if (groupingMode === 'source-dir') {
    return segments.length > 1 ? segments[0] : path.basename(file, path.extname(file));
  }

  const inputBytes = new Uint8Array(await fs.readFile(file));
  const metadataFamily = extractFontFamily(inputBytes) || path.basename(file, path.extname(file));
  if (groupingMode === 'font-family') {
    return metadataFamily;
  }

  if (segments.length > 1) return segments[0];
  return metadataFamily;
}

async function shouldSkipExistingOutput({ skipMode, resolvedOutDir, splitDirName, inputRelativePath, inputStat, effectiveConfig }) {
  const splitDir = path.join(resolvedOutDir, splitDirName);
  const marker = path.join(splitDir, 'result.css');
  if (skipMode === 'force') {
    return { shouldSkip: false, reason: 'force' };
  }

  if (skipMode === 'legacy-css') {
    return { shouldSkip: await fileExists(marker), reason: 'legacy-css' };
  }

  const manifest = await readSplitManifest(splitDir);
  if (!manifest) return { shouldSkip: false, reason: 'missing-manifest' };
  const sameSource = manifest.source?.input === inputRelativePath
    && manifest.source?.sizeBytes === inputStat.size
    && manifest.source?.mtimeMs === inputStat.mtimeMs;
  const sameConfig = stableStringify(manifest.effectiveConfig) === stableStringify(effectiveConfig);
  const sameTool = manifest.toolVersion === PACKAGE_VERSION && manifest.manifestVersion === MANIFEST_VERSION;
  return { shouldSkip: sameSource && sameConfig && sameTool, reason: sameSource && sameConfig && sameTool ? 'manifest' : 'stale-manifest', manifest };
}

function inferLegacyResultType(fontEntry) {
  if (fontEntry.manifest?.result?.resultType) return fontEntry.manifest.result.resultType;
  if (!fontEntry.hasCss && fontEntry.hasManifest) return 'copy-original-small-glyph';
  if (!fontEntry.hasCss) return 'unknown';
  if (fontEntry.hasReporter || fontEntry.hasProto || fontEntry.woff2Count > 1) return 'subset';
  if (fontEntry.woff2Count === 1) return 'single-woff2';
  return 'unknown';
}

function buildFontEntryInspection(groupName, splitDirName, originalFiles, outputFiles, manifest) {
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

function buildFontSplitConfig(input, outDir, args) {
  const css = {};
  if (normalizeOptionalString(args.fontFamily)) css.fontFamily = args.fontFamily;
  if (normalizeOptionalString(args.fontWeight)) css.fontWeight = args.fontWeight;
  if (normalizeOptionalString(args.fontStyle)) css.fontStyle = args.fontStyle;
  if (normalizeOptionalString(args.fontDisplay)) css.fontDisplay = args.fontDisplay;
  if (normalizeOptionalString(args.cssFileName)) css.fileName = args.cssFileName;

  const previewImage = {};
  if (normalizeOptionalString(args.previewText)) previewImage.text = args.previewText;
  if (normalizeOptionalString(args.previewName)) previewImage.name = args.previewName;

  const config = {
    input,
    outDir,
    silent: args.silent !== false,
  };

  if (Object.keys(css).length > 0) config.css = css;
  if (Object.keys(previewImage).length > 0) config.previewImage = previewImage;
  if (Array.isArray(args.subsets) && args.subsets.length > 0) config.subsets = args.subsets;

  const numericFields = [
    ['chunkSize', 'chunkSize'],
    ['chunkSizeTolerance', 'chunkSizeTolerance'],
    ['maxAllowSubsetsCount', 'maxAllowSubsetsCount'],
  ];
  for (const [argName, configName] of numericFields) {
    const value = normalizeOptionalNumber(args[argName]);
    if (value !== undefined) config[configName] = value;
  }

  const booleanFields = [
    ['languageAreas', 'languageAreas'],
    ['testHtml', 'testHtml'],
    ['reporter', 'reporter'],
    ['multiThreads', 'multiThreads'],
    ['fontFeature', 'fontFeature'],
    ['reduceMins', 'reduceMins'],
    ['autoSubset', 'autoSubset'],
    ['subsetRemainChars', 'subsetRemainChars'],
  ];
  for (const [argName, configName] of booleanFields) {
    const value = normalizeOptionalBoolean(args[argName]);
    if (value !== undefined) config[configName] = value;
  }

  if (normalizeOptionalString(args.renameOutputFont)) config.renameOutputFont = args.renameOutputFont;
  if (normalizeOptionalString(args.buildMode)) config.buildMode = args.buildMode;

  return config;
}

function decodeFontNameValue(source, strStart, length, platformID, encodingID) {
  if (platformID === 3 && (encodingID === 1 || encodingID === 10)) {
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    const chars = [];
    for (let j = 0; j < length; j += 2) {
      chars.push(view.getUint16(strStart + j));
    }
    return String.fromCharCode(...chars);
  }

  if (platformID === 0) {
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    const chars = [];
    for (let j = 0; j < length; j += 2) {
      chars.push(view.getUint16(strStart + j));
    }
    return String.fromCharCode(...chars);
  }

  if (platformID === 1) {
    return new TextDecoder('latin1').decode(source.slice(strStart, strStart + length));
  }

  return null;
}

function nameRecordScore(platformID, encodingID) {
  if (platformID === 3 && (encodingID === 1 || encodingID === 10)) return 3;
  if (platformID === 0) return 2;
  if (platformID === 1) return 1;
  return 0;
}

function toNameRecordMap(scoredRecords) {
  const records = new Map();
  for (const [nameID, item] of scoredRecords.entries()) {
    records.set(nameID, item.value);
  }
  return records;
}

function readFontNameRecords(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);
  let headerOffset = 0;

  if (magic === 0x74746366) {
    headerOffset = view.getUint32(12);
  }

  const numTables = view.getUint16(headerOffset + 4);
  let nameTableOffset = 0;

  for (let i = 0; i < numTables; i++) {
    const entryOffset = headerOffset + 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(entryOffset), view.getUint8(entryOffset + 1),
      view.getUint8(entryOffset + 2), view.getUint8(entryOffset + 3),
    );
    if (tag === 'name') {
      nameTableOffset = view.getUint32(entryOffset + 8);
      break;
    }
  }

  if (!nameTableOffset) return new Map();

  const nameCount = view.getUint16(nameTableOffset + 2);
  const stringOffset = nameTableOffset + view.getUint16(nameTableOffset + 4);
  const records = new Map();

  for (let i = 0; i < nameCount; i++) {
    const recordOffset = nameTableOffset + 6 + i * 12;
    const platformID = view.getUint16(recordOffset);
    const encodingID = view.getUint16(recordOffset + 2);
    const nameID = view.getUint16(recordOffset + 6);
    const length = view.getUint16(recordOffset + 8);
    const offset = view.getUint16(recordOffset + 10);
    const strStart = stringOffset + offset;

    const decoded = decodeFontNameValue(buffer, strStart, length, platformID, encodingID);
    const score = nameRecordScore(platformID, encodingID);
    const existing = records.get(nameID);
    if (!decoded || score === 0 || (existing && existing.score >= score)) continue;
    records.set(nameID, { value: decoded, score });
  }

  return toNameRecordMap(records);
}

function readFontFamilyName(buffer) {
  return readFontNameRecords(buffer).get(1) || null;
}

// WOFF has the sfnt tables wrapped; the name table offset is in the WOFF directory
function parseWoffNameTable(nameTableBuf) {
  return readFontNameTableRecords(nameTableBuf);
}

function readFontFamilyNameFromWoff(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);

  // wOFF (WOFF1)
  if (magic === 0x774F4646) {
    const numTables = view.getUint16(12);
    for (let i = 0; i < numTables; i++) {
      const entryOffset = 44 + i * 20;
      const tag = String.fromCharCode(
        view.getUint8(entryOffset), view.getUint8(entryOffset + 1),
        view.getUint8(entryOffset + 2), view.getUint8(entryOffset + 3),
      );
      if (tag === 'name') {
        const compOffset = view.getUint32(entryOffset + 4);
        const compLength = view.getUint32(entryOffset + 8);
        const origLength = view.getUint32(entryOffset + 12);
        if (compLength === origLength) {
          // uncompressed
          const nameTable = buffer.slice(compOffset, compOffset + origLength);
          return parseWoffNameTable(nameTable).get(1) || null;
        }
        return null; // compressed, skip
      }
    }
  }

  // WOFF2: too complex to decompress inline, return null.
  if (magic === 0x774F4632) return null;

  return null;
}

function readFontNameTableRecords(nameTableBuf) {
  const view = new DataView(nameTableBuf.buffer, nameTableBuf.byteOffset, nameTableBuf.byteLength);
  const nameCount = view.getUint16(2);
  const stringOffset = view.getUint16(4);
  const records = new Map();

  for (let i = 0; i < nameCount; i++) {
    const recordOffset = 6 + i * 12;
    const platformID = view.getUint16(recordOffset);
    const encodingID = view.getUint16(recordOffset + 2);
    const nameID = view.getUint16(recordOffset + 6);
    const length = view.getUint16(recordOffset + 8);
    const offset = view.getUint16(recordOffset + 10);
    const strStart = stringOffset + offset;

    const decoded = decodeFontNameValue(nameTableBuf, strStart, length, platformID, encodingID);
    const score = nameRecordScore(platformID, encodingID);
    const existing = records.get(nameID);
    if (!decoded || score === 0 || (existing && existing.score >= score)) continue;
    records.set(nameID, { value: decoded, score });
  }
  return toNameRecordMap(records);
}

function normalizeIdentityName(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized || null;
}

function extractFontIdentity(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);
  if (magic === 0x774F4646 || magic === 0x774F4632) {
    return {
      family: normalizeIdentityName(readFontFamilyNameFromWoff(buffer)),
      subfamily: null,
      fullName: null,
      postscriptName: null,
    };
  }
  const records = readFontNameRecords(buffer);
  return {
    family: normalizeIdentityName(records.get(16) || records.get(1)),
    subfamily: normalizeIdentityName(records.get(17) || records.get(2)),
    fullName: normalizeIdentityName(records.get(4)),
    postscriptName: normalizeIdentityName(records.get(6)),
  };
}

function buildFontIdentityKey(buffer) {
  const identity = extractFontIdentity(buffer);
  if (identity.family && identity.subfamily) {
    return stableStringify({
      basis: 'family-subfamily',
      family: identity.family,
      subfamily: identity.subfamily,
    });
  }
  if (identity.fullName) {
    return stableStringify({
      basis: 'full-name',
      fullName: identity.fullName,
    });
  }
  if (identity.postscriptName) {
    return stableStringify({
      basis: 'postscript-name',
      postscriptName: identity.postscriptName,
    });
  }
  if (identity.family) {
    return stableStringify({
      basis: 'family',
      family: identity.family,
    });
  }
  return null;
}

function extractFontFamily(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);

  // WOFF1 / WOFF2
  if (magic === 0x774F4646 || magic === 0x774F4632) {
    return readFontFamilyNameFromWoff(buffer);
  }

  // TTF/OTF/TTC
  return readFontFamilyName(buffer);
}

function sanitizeDirName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}

function appendCollisionSuffix(baseName, index) {
  return index === 0 ? baseName : `${baseName}-${index}`;
}

function buildSourceSuffix(inputRelativePath, extension) {
  const normalizedInput = inputRelativePath.replaceAll('\\', '/');
  const sourceHash = createHash('sha1').update(normalizedInput).digest('hex').slice(0, 8);
  const extensionLabel = extension.replace(/^\./, '') || 'font';
  return `${extensionLabel}-${sourceHash}`;
}

function buildBatchOutputNames({ inputRelativePath, fontBaseName, fontFileName }) {
  const extension = path.extname(fontFileName);
  const suffix = buildSourceSuffix(inputRelativePath, extension);
  const splitDirName = sanitizeDirName(`${fontBaseName}--${suffix}`);
  return {
    splitDirName,
    copiedOriginalFileName: `${splitDirName}${extension}`,
  };
}

async function listExistingSplitDirNames(resolvedOutDir, fontBaseName) {
  let entries;
  try {
    entries = await fs.readdir(resolvedOutDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name === fontBaseName || name.startsWith(`${fontBaseName}-`))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function resolveStableBatchOutputNames({ resolvedOutDir, fontBaseName, fontFileName, inputRelativePath }) {
  const extension = path.extname(fontFileName);
  const existingNames = await listExistingSplitDirNames(resolvedOutDir, fontBaseName);
  const seen = new Set(existingNames);

  for (const name of existingNames) {
    const manifest = await readSplitManifest(path.join(resolvedOutDir, name));
    if (manifest?.source?.input === inputRelativePath) {
      return {
        splitDirName: name,
        copiedOriginalFileName: `${name}${extension}`,
      };
    }
  }

  let index = 0;
  while (true) {
    const candidate = appendCollisionSuffix(fontBaseName, index);
    const candidateDir = path.join(resolvedOutDir, candidate);
    const manifest = await readSplitManifest(candidateDir);
    if (manifest?.source?.input === inputRelativePath) {
      return {
        splitDirName: candidate,
        copiedOriginalFileName: `${candidate}${extension}`,
      };
    }
    if (manifest) {
      index++;
      continue;
    }
    if (seen.has(candidate)) {
      index++;
      continue;
    }
    if (await fileExists(candidateDir)) {
      index++;
      continue;
    }
    return {
      splitDirName: candidate,
      copiedOriginalFileName: index === 0 ? fontFileName : `${candidate}${extension}`,
    };
  }
}

async function buildBatchDedupeIdentity(file) {
  const ext = path.extname(file).toLowerCase();
  if (!FONT_EXTENSIONS.has(ext)) return null;
  try {
    let buffer = new Uint8Array(await fs.readFile(file));
    if (buffer.byteLength < 4) return null;
    const magic = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0);
    if (magic === 0x774F4646) {
      buffer = decompressWoff1(buffer);
    } else if (magic === 0x774F4632) {
      buffer = await decompressWoff2(buffer);
    }
    return buildFontIdentityKey(buffer);
  } catch {
    return null;
  }
}

function detectFontContainer(buffer) {
  if (buffer.byteLength < 4) return 'unknown';
  const magic = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0);
  if (magic === 0x00010000) return 'ttf';
  if (magic === 0x4F54544F) return 'otf-cff';
  if (magic === 0x74746366) return 'collection';
  if (magic === 0x774F4646) return 'woff';
  if (magic === 0x774F4632) return 'woff2';
  return 'unknown';
}

function parseIdentityKey(identityKey) {
  if (!identityKey) return null;
  try {
    return JSON.parse(identityKey);
  } catch {
    return null;
  }
}

async function inspectInputFontFile(file) {
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

function compareBatchDedupeRepresentative(candidate, existing) {
  const candidateExt = path.extname(candidate).toLowerCase();
  const existingExt = path.extname(existing).toLowerCase();
  const priorityDelta = (FORMAT_PRIORITY[candidateExt] ?? 9) - (FORMAT_PRIORITY[existingExt] ?? 9);
  if (priorityDelta !== 0) return priorityDelta;
  return toRelativeWorkspacePath(candidate).localeCompare(
    toRelativeWorkspacePath(existing),
    undefined,
    { numeric: true },
  );
}

function buildDirectoryLayoutSummary({ inputDir, allFiles, fontFiles }) {
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
      strictMode: true,
    },
  };
}

function getOrganizationDedupeKey(entry, dedupeMode) {
  if (dedupeMode === 'none') return `unique:${entry.file}`;
  const ext = path.extname(entry.file).toLowerCase();
  if (dedupeMode === 'same-path') return `path:${entry.file.slice(0, -ext.length)}`;
  return entry.identityKey || `path:${entry.file.slice(0, -ext.length)}`;
}

function dedupeOrganizationEntries(entries, dedupeMode) {
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

async function resolveOrganizationGroupName({ entry, inputDir, groupingMode }) {
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

async function chooseOrganizationTargetPath({
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

function buildOrganizationManifest({ inputDirRelative, outputDirRelative, options, result }) {
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

async function writeOrganizationManifest(outputDir, manifest) {
  await fs.writeFile(path.join(outputDir, ORGANIZATION_MANIFEST_FILE_NAME), JSON.stringify(manifest, null, 2));
}

function decompressWoff1(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const signature = view.getUint32(0);
  if (signature !== 0x774F4646) return buffer; // not WOFF1, return as-is

  const sfntFlavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  const totalSfntSize = view.getUint32(16);

  // Build sfnt offset table
  const sfntHeaderSize = 12 + numTables * 16;
  const sfnt = new Uint8Array(totalSfntSize);
  const sfntView = new DataView(sfnt.buffer);

  // Write sfnt header
  sfntView.setUint32(0, sfntFlavor);
  sfntView.setUint16(4, numTables);
  // searchRange, entrySelector, rangeShift
  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= numTables) { searchRange *= 2; entrySelector++; }
  searchRange *= 16;
  sfntView.setUint16(6, searchRange);
  sfntView.setUint16(8, entrySelector);
  sfntView.setUint16(10, numTables * 16 - searchRange);

  let dataOffset = sfntHeaderSize;

  for (let i = 0; i < numTables; i++) {
    const woffEntry = 44 + i * 20;
    const tag = view.getUint32(woffEntry);
    const offset = view.getUint32(woffEntry + 4);
    const compLength = view.getUint32(woffEntry + 8);
    const origLength = view.getUint32(woffEntry + 12);
    const origChecksum = view.getUint32(woffEntry + 16);

    let tableData;
    if (compLength === origLength) {
      tableData = buffer.slice(offset, offset + origLength);
    } else {
      tableData = inflateSync(buffer.slice(offset, offset + compLength));
    }

    // Write sfnt table record
    const recordOffset = 12 + i * 16;
    sfntView.setUint32(recordOffset, tag);
    sfntView.setUint32(recordOffset + 4, origChecksum);
    sfntView.setUint32(recordOffset + 8, dataOffset);
    sfntView.setUint32(recordOffset + 12, origLength);

    // Write table data
    sfnt.set(tableData instanceof Uint8Array ? tableData : new Uint8Array(tableData), dataOffset);

    // Align to 4 bytes
    dataOffset += origLength;
    while (dataOffset % 4 !== 0) dataOffset++;
  }

  return new Uint8Array(sfnt.buffer, 0, dataOffset);
}

function fileExists(filePath) {
  return fs.stat(filePath).then(() => true).catch(() => false);
}

async function decompressWoff2(buffer) {
  const result = await woff2Decompress(Buffer.from(buffer));
  return new Uint8Array(result);
}

async function compressWoff2(buffer) {
  const result = await woff2Compress(Buffer.from(buffer));
  return new Uint8Array(result);
}

function inspectOversizedKern(buffer, thresholdRatio = 0.8) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);
  if (magic === 0x774F4646 || magic === 0x774F4632 || magic === 0x74746366) {
    return {
      supported: false,
      hasKern: false,
      kernBytes: 0,
      fontBytes: buffer.byteLength,
      ratio: 0,
      thresholdRatio,
      oversized: false,
    };
  }

  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = String.fromCharCode(buffer[off], buffer[off + 1], buffer[off + 2], buffer[off + 3]);
    if (tag !== 'kern') continue;
    const kernBytes = view.getUint32(off + 12);
    const ratio = buffer.byteLength > 0 ? kernBytes / buffer.byteLength : 0;
    return {
      supported: true,
      hasKern: true,
      kernBytes,
      fontBytes: buffer.byteLength,
      ratio,
      thresholdRatio,
      oversized: ratio >= thresholdRatio,
    };
  }

  return {
    supported: true,
    hasKern: false,
    kernBytes: 0,
    fontBytes: buffer.byteLength,
    ratio: 0,
    thresholdRatio,
    oversized: false,
  };
}

function stripOversizedKern(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);
  if (magic === 0x774F4646 || magic === 0x774F4632 || magic === 0x74746366) {
    return { buffer, stripped: false };
  }

  const numTables = view.getUint16(4);
  let kernIndex = -1;
  let kernLength = 0;

  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = String.fromCharCode(buffer[off], buffer[off + 1], buffer[off + 2], buffer[off + 3]);
    if (tag === 'kern') {
      kernIndex = i;
      kernLength = view.getUint32(off + 12);
      break;
    }
  }

  if (kernIndex === -1 || kernLength < buffer.byteLength * 0.8) {
    return { buffer, stripped: false };
  }

  // Rebuild sfnt without kern table
  const newNumTables = numTables - 1;
  const headerSize = 12 + newNumTables * 16;
  const tables = [];

  for (let i = 0; i < numTables; i++) {
    if (i === kernIndex) continue;
    const off = 12 + i * 16;
    const tableOffset = view.getUint32(off + 8);
    const tableLength = view.getUint32(off + 12);
    tables.push({
      tag: buffer.slice(off, off + 4),
      checksum: view.getUint32(off + 4),
      data: buffer.slice(tableOffset, tableOffset + tableLength),
    });
  }

  let totalSize = headerSize;
  for (const t of tables) {
    totalSize += t.data.byteLength;
    totalSize += (4 - (totalSize % 4)) % 4;
  }

  const result = new Uint8Array(totalSize);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, magic);
  rv.setUint16(4, newNumTables);
  let sr = 1, es = 0;
  while (sr * 2 <= newNumTables) { sr *= 2; es++; }
  sr *= 16;
  rv.setUint16(6, sr);
  rv.setUint16(8, es);
  rv.setUint16(10, newNumTables * 16 - sr);

  let dataOffset = headerSize;
  for (let i = 0; i < tables.length; i++) {
    const recOff = 12 + i * 16;
    result.set(tables[i].tag, recOff);
    rv.setUint32(recOff + 4, tables[i].checksum);
    rv.setUint32(recOff + 8, dataOffset);
    rv.setUint32(recOff + 12, tables[i].data.byteLength);
    result.set(tables[i].data, dataOffset);
    dataOffset += tables[i].data.byteLength;
    dataOffset += (4 - (dataOffset % 4)) % 4;
  }

  return { buffer: result, stripped: true };
}

function getGlyphCount(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);
  let headerOffset = 0;
  if (magic === 0x74746366) headerOffset = view.getUint32(12);

  const numTables = view.getUint16(headerOffset + 4);
  for (let i = 0; i < numTables; i++) {
    const off = headerOffset + 12 + i * 16;
    const tag = String.fromCharCode(buffer[off], buffer[off + 1], buffer[off + 2], buffer[off + 3]);
    if (tag === 'maxp') {
      const tableOffset = view.getUint32(off + 8);
      return view.getUint16(tableOffset + 4);
    }
  }
  return -1;
}

async function writeGeneratedFiles(baseDir, generated) {
  for (const item of generated) {
    const outputPath = path.resolve(baseDir, item.name);
    if (!isInside(baseDir, outputPath)) {
      throw new Error(`Generated file path escapes output directory: ${item.name}`);
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, item.data);
  }
}

async function emitSmallGlyphFallback({ inputBytes, splitDir, fontFamily, fontBaseName, args, reason = 'too few glyphs for useful subsetting' }) {
  const woff2Name = `${fontBaseName}.woff2`;
  const cssName = args.cssFileName || 'result.css';
  const css = [
    '@font-face {',
    `  font-family: ${JSON.stringify(fontFamily)};`,
    `  src: url("./${woff2Name}") format("woff2");`,
    args.fontWeight ? `  font-weight: ${args.fontWeight};` : null,
    args.fontStyle ? `  font-style: ${args.fontStyle};` : null,
    `  font-display: ${args.fontDisplay || 'swap'};`,
    '}',
    '',
  ].filter(Boolean).join('\n');

  const generated = [
    { name: woff2Name, data: await compressWoff2(inputBytes) },
    { name: cssName, data: Buffer.from(css, 'utf8') },
  ];

  if (args.testHtml) {
    const previewText = args.previewText || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789';
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${fontFamily}</title>
  <link rel="stylesheet" href="./${cssName}" />
  <style>body { font-family: ${JSON.stringify(fontFamily)}, sans-serif; padding: 24px; white-space: pre-wrap; }</style>
</head>
<body>${previewText.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</body>
</html>`;
    generated.push({ name: 'index.html', data: Buffer.from(html, 'utf8') });
  }

  await writeGeneratedFiles(splitDir, generated);
  return { generated, skipped: true, reason };
}

async function clearSplitDirForCopyOriginal(splitDir) {
  await fs.rm(splitDir, { recursive: true, force: true });
  await fs.mkdir(splitDir, { recursive: true });
}

async function ensureFontFile(fontPath) {
  const resolved = await resolveWorkspacePath(fontPath, { mustExist: true });
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) throw new Error(`Font path is not a file: ${fontPath}`);
  const ext = path.extname(resolved).toLowerCase();
  if (!FONT_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported font extension ${ext || '(none)'} for ${fontPath}`);
  }
  return resolved;
}

export async function splitFont(args) {
  const startedAt = Date.now();
  const processingOptions = normalizeProcessingOptions(args);
  const input = await ensureFontFile(args.fontPath);
  const inputStat = await fs.stat(input);
  const inputRelativePath = toRelativeWorkspacePath(input);
  const fontBaseName = path.basename(input, path.extname(input));
  const fontFileName = path.basename(input);
  const splitDirName = args.splitDirName || fontBaseName;
  const copiedOriginalFileName = args.copiedOriginalFileName || fontFileName;
  let inputBytes = new Uint8Array(await fs.readFile(input));
  const inputFormat = path.extname(input).toLowerCase().slice(1) || 'unknown';

  let decompressedFrom = null;
  const magic = new DataView(inputBytes.buffer, inputBytes.byteOffset, 4).getUint32(0);
  if (magic === 0x774F4646) {
    inputBytes = decompressWoff1(inputBytes);
    decompressedFrom = 'woff';
  } else if (magic === 0x774F4632) {
    inputBytes = await decompressWoff2(inputBytes);
    decompressedFrom = 'woff2';
  }

  const kernInspection = inspectOversizedKern(inputBytes);
  let oversizedKernStripped = false;
  if (processingOptions.oversizedKernAction === 'strip' && kernInspection.oversized) {
    const kernNormalized = stripOversizedKern(inputBytes);
    inputBytes = kernNormalized.buffer;
    oversizedKernStripped = kernNormalized.stripped;
  }

  const familyName = args.fontFamily || extractFontFamily(inputBytes) || fontBaseName;
  const safeFamilyName = sanitizeDirName(familyName);
  const groupName = args.groupName || safeFamilyName;

  const rootDir = await resolveWorkspacePath(
    args.outDir || path.join('split-output', groupName),
  );
  const splitDir = path.join(rootDir, splitDirName);
  await fs.mkdir(splitDir, { recursive: true });

  const destFontPath = path.join(rootDir, copiedOriginalFileName);
  await fs.copyFile(input, destFontPath);

  const before = new Set((await summarizeFiles(rootDir)).map((file) => file.path));

  const glyphCount = getGlyphCount(inputBytes);
  let generated;
  let skipped = false;
  let skipReason = null;
  let outputMode = 'subset';
  let splitFailureFallbackApplied = false;
  let splitFailureMessage = null;

  const shouldEmitSmallGlyphFallback = (
    glyphCount > 0
    && glyphCount <= processingOptions.smallGlyphThreshold
    && processingOptions.smallGlyphAction === 'single-woff2'
  );
  const shouldCopyOriginalSmallGlyph = (
    glyphCount > 0
    && glyphCount <= processingOptions.smallGlyphThreshold
    && processingOptions.smallGlyphAction === 'copy-original'
  );

  if (shouldCopyOriginalSmallGlyph) {
    await clearSplitDirForCopyOriginal(splitDir);
    generated = [];
    skipped = true;
    skipReason = 'small glyph copy-original explicitly enabled';
    outputMode = 'copy-original';
  } else if (shouldEmitSmallGlyphFallback) {
    const fallback = await emitSmallGlyphFallback({
      inputBytes,
      splitDir,
      fontFamily: familyName,
      fontBaseName,
      args,
      reason: 'small glyph fallback explicitly enabled',
    });
    generated = fallback.generated;
    skipped = fallback.skipped;
    skipReason = fallback.reason;
    outputMode = 'single-woff2';
  } else {
    const config = buildFontSplitConfig(inputBytes, splitDir, args);
    const wasm = await getWasmRuntime();
    try {
      generated = (await fontSplit(config, wasm.WasiHandle, { logger: () => {} })).filter(Boolean);
      await writeGeneratedFiles(splitDir, generated);
    } catch (error) {
      splitFailureMessage = error instanceof Error ? error.message : String(error);
      if (processingOptions.splitFailureAction === 'single-woff2') {
        const fallback = await emitSmallGlyphFallback({
          inputBytes,
          splitDir,
          fontFamily: familyName,
          fontBaseName,
          args,
          reason: 'split failure fallback explicitly enabled',
        });
        generated = fallback.generated;
        skipped = fallback.skipped;
        skipReason = fallback.reason;
        outputMode = 'single-woff2';
        splitFailureFallbackApplied = true;
      } else {
        throw error;
      }
    }
  }

  const usedFallback = outputMode === 'single-woff2';
  const performedSplit = outputMode === 'subset';
  const resultType = classifyResultType({ outputMode, splitFailureFallbackApplied, skipReason });
  const warnings = buildWarnings({
    decompressedFrom,
    oversizedKernDetected: kernInspection.oversized,
    oversizedKernStripped,
    usedFallback,
    skipped,
    skipReason,
  });
  const effectiveConfig = buildEffectiveConfigSnapshot(args, processingOptions);

  const files = await summarizeFiles(rootDir);
  const createdFiles = files.filter((file) => !before.has(file.path));

  const result = {
    ok: true,
    input: inputRelativePath,
    fontFamily: familyName,
    groupName,
    outDir: toRelativeWorkspacePath(rootDir),
    splitDir: toRelativeWorkspacePath(splitDir),
    durationMs: Date.now() - startedAt,
    generatedFileCount: generated.length,
    glyphCount,
    skipped,
    skipReason,
    outputMode,
    resultType,
    performedSplit,
    usedFallback,
    copiedOriginalPath: toRelativeWorkspacePath(destFontPath),
    warnings,
    decompressedFrom,
    oversizedKernDetected: kernInspection.oversized,
    oversizedKernStripped,
    splitFailureFallbackApplied,
    fileCount: files.length,
    createdFileCount: createdFiles.length,
    files,
    createdFiles,
    processing: {
      inputFormat,
      decompressedFrom,
      oversizedKern: {
        ...kernInspection,
        action: processingOptions.oversizedKernAction,
        stripped: oversizedKernStripped,
      },
      smallGlyph: {
        glyphCount,
        threshold: processingOptions.smallGlyphThreshold,
        action: processingOptions.smallGlyphAction,
        matchedThreshold: glyphCount > 0 && glyphCount <= processingOptions.smallGlyphThreshold,
        downgraded: resultType === 'single-woff2-small-glyph',
        skippedSplit: resultType === 'copy-original-small-glyph',
      },
      splitFailure: {
        action: processingOptions.splitFailureAction,
        fallbackApplied: splitFailureFallbackApplied,
        failureMessage: splitFailureMessage,
      },
    },
  };

  const manifest = buildSplitManifest({
    inputRelativePath,
    inputStat,
    groupName,
    outDirRelative: result.outDir,
    splitDirRelative: result.splitDir,
    effectiveConfig,
    result,
  });
  await writeSplitManifest(splitDir, manifest);
  result.manifestPath = toRelativeWorkspacePath(manifestPathForSplitDir(splitDir));
  result.manifestWritten = true;

  return result;
}

export async function splitFontBatch(args) {
  const inputDir = await resolveWorkspacePath(args.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${args.inputDir}`);

  const batchOptions = normalizeBatchOptions(args);
  const processingOptions = normalizeProcessingOptions(args);
  const includeResults = args.includeResults !== false;
  const dryRun = args.dryRun === true;
  const outputRoot = args.outputRoot || 'split-output';
  const outputRootName = path.basename(outputRoot);

  const maxFiles = args.maxFiles || 5000;
  const inputScan = await scanFilesRecursive(inputDir, {
    maxFiles,
    excludeDirs: [outputRootName],
  });
  const allFiles = inputScan.files;
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));

  let deduplicated;
  if (batchOptions.batchDedupeMode === 'none') {
    deduplicated = [...fontFiles];
  } else if (batchOptions.batchDedupeMode === 'same-path') {
    const byBaseName = new Map();
    for (const file of fontFiles) {
      const ext = path.extname(file).toLowerCase();
      const base = file.slice(0, -ext.length);
      const existing = byBaseName.get(base);
      if (!existing || compareBatchDedupeRepresentative(file, existing) < 0) {
        if (existing) {
          logBatchDecision(batchOptions.debugBatchDecisions, 'dedupe-replace', {
            mode: batchOptions.batchDedupeMode,
            winner: toRelativeWorkspacePath(file),
            loser: toRelativeWorkspacePath(existing),
            reason: 'same-path-priority',
          });
        }
        byBaseName.set(base, file);
      } else {
        logBatchDecision(batchOptions.debugBatchDecisions, 'dedupe-drop', {
          mode: batchOptions.batchDedupeMode,
          winner: toRelativeWorkspacePath(existing),
          loser: toRelativeWorkspacePath(file),
          reason: 'same-path-priority',
        });
      }
    }
    deduplicated = [...byBaseName.values()];
  } else {
    const byIdentity = new Map();
    for (const file of fontFiles) {
      const ext = path.extname(file).toLowerCase();
      const identityKey = await buildBatchDedupeIdentity(file);
      const key = identityKey || `path:${file.slice(0, -ext.length)}`;
      const existing = byIdentity.get(key);
      if (!existing || compareBatchDedupeRepresentative(file, existing) < 0) {
        if (existing) {
          logBatchDecision(batchOptions.debugBatchDecisions, 'dedupe-replace', {
            mode: batchOptions.batchDedupeMode,
            winner: toRelativeWorkspacePath(file),
            loser: toRelativeWorkspacePath(existing),
            identityKey: key,
            reason: identityKey ? 'font-identity-priority' : 'path-fallback-priority',
          });
        }
        byIdentity.set(key, file);
      } else {
        logBatchDecision(batchOptions.debugBatchDecisions, 'dedupe-drop', {
          mode: batchOptions.batchDedupeMode,
          winner: toRelativeWorkspacePath(existing),
          loser: toRelativeWorkspacePath(file),
          identityKey: key,
          reason: identityKey ? 'font-identity-priority' : 'path-fallback-priority',
        });
      }
    }
    deduplicated = [...byIdentity.values()];
  }

  const deduplicatedCount = deduplicated.length;
  const skippedCount = fontFiles.length - deduplicatedCount;
  const selected = deduplicated.slice(0, args.limit || 20);

  const results = [];
  const planned = [];
  const errors = [];
  const processingSummary = {
    decompressedInputs: 0,
    oversizedKernDetected: 0,
    oversizedKernStripped: 0,
    smallGlyphDowngrades: 0,
    smallGlyphCopyOriginals: 0,
    failureFallbacks: 0,
    subsetOutputs: 0,
    singleWoff2Outputs: 0,
    copyOriginalOutputs: 0,
  };
  let skippedExisting = 0;
  let skippedLegacy = 0;
  let skippedByManifest = 0;
  let reprocessedBecauseSourceChanged = 0;
  let reprocessedBecauseOptionsChanged = 0;
  let wouldProcessCount = 0;

  for (const file of selected) {
    const relative = toRelativeWorkspacePath(file);
    try {
      const groupName = sanitizeDirName(await resolveBatchFamilyDirName({
        file,
        inputDir,
        groupingMode: batchOptions.batchGroupBy,
      }));
      const outDir = path.join(outputRoot, groupName);
      const fontBaseName = path.basename(file, path.extname(file));
      const fontFileName = path.basename(file);
      const resolvedOutDir = await resolveWorkspacePath(outDir);
      let batchOutputNames;
      if (batchOptions.batchNamingMode === 'plain') {
        batchOutputNames = {
          splitDirName: fontBaseName,
          copiedOriginalFileName: fontFileName,
        };
      } else if (batchOptions.batchNamingMode === 'source-suffix') {
        batchOutputNames = buildBatchOutputNames({
          inputRelativePath: relative,
          fontBaseName,
          fontFileName,
        });
      } else {
        batchOutputNames = await resolveStableBatchOutputNames({
          resolvedOutDir,
          fontBaseName,
          fontFileName,
          inputRelativePath: relative,
        });
      }
      logBatchDecision(batchOptions.debugBatchDecisions, 'naming', {
        mode: batchOptions.batchNamingMode,
        input: relative,
        groupName,
        splitDirName: batchOutputNames.splitDirName,
        copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
      });

      const inputStat = await fs.stat(file);
      const effectiveConfig = buildEffectiveConfigSnapshot({ ...args, ...batchOptions, groupName }, processingOptions);
      const skipDecision = await shouldSkipExistingOutput({
        skipMode: batchOptions.skipMode,
        resolvedOutDir,
        splitDirName: batchOutputNames.splitDirName,
        inputRelativePath: relative,
        inputStat,
        effectiveConfig,
      });
      logBatchDecision(batchOptions.debugBatchDecisions, 'skip-check', {
        mode: batchOptions.skipMode,
        input: relative,
        splitDirName: batchOutputNames.splitDirName,
        reason: skipDecision.reason,
        shouldSkip: skipDecision.shouldSkip,
      });

      if (skipDecision.shouldSkip) {
        skippedExisting++;
        if (skipDecision.reason === 'legacy-css') skippedLegacy++;
        if (skipDecision.reason === 'manifest') skippedByManifest++;
        if (dryRun) {
          planned.push({
            input: relative,
            groupName,
            outDir: toRelativeWorkspacePath(resolvedOutDir),
            splitDir: toRelativeWorkspacePath(path.join(resolvedOutDir, batchOutputNames.splitDirName)),
            copiedOriginalPath: toRelativeWorkspacePath(path.join(resolvedOutDir, batchOutputNames.copiedOriginalFileName)),
            splitDirName: batchOutputNames.splitDirName,
            copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
            wouldProcess: false,
            skipReason: skipDecision.reason,
          });
        }
        args.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'skipped' });
        continue;
      }
      if (skipDecision.reason === 'stale-manifest' && skipDecision.manifest) {
        const sameSource = skipDecision.manifest.source?.input === relative
          && skipDecision.manifest.source?.sizeBytes === inputStat.size
          && skipDecision.manifest.source?.mtimeMs === inputStat.mtimeMs;
        if (sameSource) {
          reprocessedBecauseOptionsChanged++;
        } else {
          reprocessedBecauseSourceChanged++;
        }
      }

      if (dryRun) {
        wouldProcessCount++;
        planned.push({
          input: relative,
          groupName,
          outDir: toRelativeWorkspacePath(resolvedOutDir),
          splitDir: toRelativeWorkspacePath(path.join(resolvedOutDir, batchOutputNames.splitDirName)),
          copiedOriginalPath: toRelativeWorkspacePath(path.join(resolvedOutDir, batchOutputNames.copiedOriginalFileName)),
          splitDirName: batchOutputNames.splitDirName,
          copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
          wouldProcess: true,
          skipReason: skipDecision.reason,
        });
        args.onProgress?.({ current: planned.length + errors.length, total: selected.length, file: relative, status: 'planned' });
        continue;
      }

      const result = await splitFont({
        ...args,
        fontPath: relative,
        outDir,
        groupName,
        splitDirName: batchOutputNames.splitDirName,
        copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
        batchNamingMode: batchOptions.batchNamingMode,
        batchDedupeMode: batchOptions.batchDedupeMode,
      });
      results.push(result);
      if (result.decompressedFrom) processingSummary.decompressedInputs++;
      if (result.oversizedKernDetected) processingSummary.oversizedKernDetected++;
      if (result.oversizedKernStripped) processingSummary.oversizedKernStripped++;
      if (result.splitFailureFallbackApplied) processingSummary.failureFallbacks++;
      if (result.outputMode === 'single-woff2') {
        processingSummary.singleWoff2Outputs++;
        if (result.processing?.smallGlyph?.downgraded) processingSummary.smallGlyphDowngrades++;
      } else if (result.outputMode === 'copy-original') {
        processingSummary.copyOriginalOutputs++;
        if (result.processing?.smallGlyph?.skippedSplit) processingSummary.smallGlyphCopyOriginals++;
      } else {
        processingSummary.subsetOutputs++;
      }
      args.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'done' });
    } catch (error) {
      resetWasmRuntime();
      logBatchDecision(batchOptions.debugBatchDecisions, 'error', {
        input: relative,
        message: error instanceof Error ? error.message : String(error),
      });
      errors.push({ file: relative, error: error instanceof Error ? error.message : String(error) });
      args.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'error' });
      if (batchOptions.batchErrorMode === 'fail-fast') {
        throw buildBatchError({
          mode: batchOptions.batchErrorMode,
          errors,
          summary: {
            inputDir: toRelativeWorkspacePath(inputDir),
            outputRoot,
            dryRun,
            discoveredFontCount: fontFiles.length,
            deduplicatedCount,
            selectedFontCount: selected.length,
            processedFontCount: results.length,
            skippedExisting,
          },
        });
      }
    }
  }

  const batchWarnings = buildBatchWarnings({
    dryRun,
    includeResults,
    inputScanTruncated: inputScan.truncated,
    maxFiles,
    deduplicatedCount,
    selectedCount: selected.length,
    skippedExisting,
    errorCount: errors.length,
    batchErrorMode: batchOptions.batchErrorMode,
  });

  const response = {
    ok: true,
    inputDir: toRelativeWorkspacePath(inputDir),
    outputRoot,
    dryRun,
    strictMode: batchOptions.strictMode,
    skipMode: batchOptions.skipMode,
    batchGroupBy: batchOptions.batchGroupBy,
    batchErrorMode: batchOptions.batchErrorMode,
    scannedFileCount: allFiles.length,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    discoveredFontCount: fontFiles.length,
    deduplicatedCount,
    skippedDuplicates: skippedCount,
    selectedFontCount: selected.length,
    skippedExisting,
    skippedLegacy,
    skippedByManifest,
    reprocessedBecauseSourceChanged,
    reprocessedBecauseOptionsChanged,
    processedFontCount: results.length,
    errorCount: errors.length,
    errors,
    batchWarningCount: batchWarnings.length,
    batchWarnings,
    resultsIncluded: includeResults,
    processingSummary,
    ...(dryRun ? {
      plannedCount: planned.length,
      wouldProcessCount,
      planIncluded: includeResults,
    } : {}),
    ...(includeResults && dryRun ? { planned } : {}),
    ...(includeResults && !dryRun ? { results } : {}),
  };

  if (errors.length > 0 && batchOptions.batchErrorMode === 'fail-after') {
    throw buildBatchError({
      mode: batchOptions.batchErrorMode,
      errors,
      summary: response,
    });
  }

  return response;
}

export async function inspectFontInputs(args) {
  const inputDir = await resolveWorkspacePath(args.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${args.inputDir}`);

  const maxFiles = args.maxFiles || 50000;
  const includeFiles = args.includeFiles !== false;
  const inputScan = await scanFilesRecursive(inputDir, { maxFiles });
  const allFiles = inputScan.files;
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
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

  return {
    ok: true,
    inputDir: toRelativeWorkspacePath(inputDir),
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    unsupportedFileCount: allFiles.length - fontFiles.length,
    validFontCount: entries.length - invalidFonts.length,
    invalidFontCount: invalidFonts.length,
    missingIdentityCount: missingIdentity.length,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    filesIncluded: includeFiles,
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

export async function organizeFontDirectory(args) {
  const inputDir = await resolveWorkspacePath(args.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${args.inputDir}`);

  const options = normalizeOrganizationOptions(args);
  const outputDir = await resolveWorkspacePath(args.outputDir || 'organized-fonts');
  if (path.resolve(inputDir) === path.resolve(outputDir)) {
    throw new Error('outputDir must be different from inputDir.');
  }

  const maxFiles = args.maxFiles || 50000;
  const scan = await scanFilesRecursive(inputDir, {
    maxFiles,
    excludeDirs: [path.basename(outputDir)],
  });
  const allFiles = scan.files;
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const layout = buildDirectoryLayoutSummary({ inputDir, allFiles, fontFiles });
  const entries = [];

  for (const file of fontFiles) {
    entries.push({
      ...(await inspectInputFontFile(file)),
      file,
    });
  }

  const validEntries = entries.filter((entry) => entry.status !== 'invalid');
  const invalidEntries = entries.filter((entry) => entry.status === 'invalid');
  const dedupe = dedupeOrganizationEntries(validEntries, options.batchDedupeMode);
  const selectedEntries = [
    ...dedupe.selected,
    ...(options.copyInvalidFonts ? invalidEntries : []),
  ].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  const plan = [];
  const errors = [];
  const usedTargets = new Set();
  let copiedCount = 0;
  let skippedTargetExists = 0;

  for (const duplicate of dedupe.duplicates) {
    plan.push({
      source: duplicate.path,
      action: 'skipped-duplicate',
      reason: 'deduped by selected batchDedupeMode',
      duplicateOf: duplicate.duplicateOf,
      identityKey: duplicate.identityKey,
    });
  }

  if (!options.copyInvalidFonts) {
    for (const entry of invalidEntries) {
      plan.push({
        source: entry.path,
        action: 'skipped-invalid',
        reason: entry.error || 'font metadata could not be parsed',
      });
    }
  }

  for (const entry of selectedEntries) {
    try {
      const groupName = sanitizeDirName(await resolveOrganizationGroupName({
        entry,
        inputDir,
        groupingMode: options.batchGroupBy,
      })) || 'Fonts';
      const target = await chooseOrganizationTargetPath({
        outputDir,
        groupName,
        entry,
        namingMode: options.batchNamingMode,
        usedTargets,
        overwriteExisting: options.overwriteExisting,
      });
      const targetExists = await fileExists(target.targetPath);
      const action = options.dryRun
        ? targetExists && !options.overwriteExisting ? 'would-skip-target-exists' : 'would-copy'
        : targetExists && !options.overwriteExisting ? 'skipped-target-exists' : 'copied';
      const planItem = {
        source: entry.path,
        target: target.relativeTarget,
        targetPath: toRelativeWorkspacePath(target.targetPath),
        groupName,
        action,
        status: entry.status,
        identityKey: entry.identityKey,
        glyphCount: entry.glyphCount,
      };
      plan.push(planItem);

      if (options.dryRun || action === 'would-skip-target-exists') {
        continue;
      }
      if (action === 'skipped-target-exists') {
        skippedTargetExists++;
        continue;
      }
      await fs.mkdir(path.dirname(target.targetPath), { recursive: true });
      await fs.copyFile(entry.file, target.targetPath);
      copiedCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ file: entry.path, error: message });
      plan.push({
        source: entry.path,
        action: 'error',
        reason: message,
      });
    }
  }

  const inputDirRelative = toRelativeWorkspacePath(inputDir);
  const outputDirRelative = toRelativeWorkspacePath(outputDir);
  const skippedCount = plan.filter((item) => item.action.startsWith('skipped') || item.action === 'would-skip-target-exists').length;
  const outputDirInsideInput = isInside(inputDir, outputDir);
  const sourceDestructive = false;
  const writesSourceTree = false;
  const writesOutputTree = !options.dryRun;
  const mayOverwriteOutputTree = !options.dryRun && options.overwriteExisting;
  const destructive = mayOverwriteOutputTree;
  const warnings = buildOrganizationWarnings({
    dryRun: options.dryRun,
    overwriteExisting: options.overwriteExisting,
    inputScanTruncated: scan.truncated,
    maxFiles,
    unsupportedFileCount: layout.unsupportedFileCount,
    invalidFontCount: invalidEntries.length,
    copyInvalidFonts: options.copyInvalidFonts,
    skippedDuplicateCount: dedupe.duplicates.length,
    layoutKind: layout.layoutKind,
    outputDirInsideInput,
  });

  const result = {
    ok: errors.length === 0,
    dryRun: options.dryRun,
    inputDir: inputDirRelative,
    outputDir: outputDirRelative,
    maxFiles,
    maxFilesHit: scan.truncated,
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    validFontCount: validEntries.length,
    invalidFontCount: invalidEntries.length,
    unsupportedFileCount: layout.unsupportedFileCount,
    deduplicatedCount: dedupe.selected.length,
    skippedDuplicates: dedupe.duplicates.length,
    selectedFontCount: selectedEntries.length,
    copiedCount,
    skippedTargetExists,
    skippedCount,
    errorCount: errors.length,
    errors,
    destructive,
    sourceDestructive,
    writesSourceTree,
    writesOutputTree,
    mayOverwriteOutputTree,
    sourceFilesPreserved: true,
    operationMode: options.dryRun ? 'plan-only' : 'copy-only',
    batchGroupBy: options.batchGroupBy,
    batchNamingMode: options.batchNamingMode,
    batchDedupeMode: options.batchDedupeMode,
    copyInvalidFonts: options.copyInvalidFonts,
    overwriteExisting: options.overwriteExisting,
    layout,
    recommendedBatchOptions: layout.recommendedBatchOptions,
    organizationWarningCount: warnings.length,
    organizationWarnings: warnings,
    planIncluded: options.includePlan,
    ...(options.includePlan ? { plan } : {}),
  };

  if (!options.dryRun) {
    await fs.mkdir(outputDir, { recursive: true });
    const manifest = buildOrganizationManifest({
      inputDirRelative,
      outputDirRelative,
      options,
      result: {
        ...result,
        plan,
      },
    });
    await writeOrganizationManifest(outputDir, manifest);
    result.organizationManifestPath = toRelativeWorkspacePath(path.join(outputDir, ORGANIZATION_MANIFEST_FILE_NAME));
    result.organizationManifestWritten = true;
  } else {
    result.organizationManifestWritten = false;
  }

  return result;
}

export async function inspectSplitOutput(args) {
  const outDir = await resolveWorkspacePath(args.outDir || 'split-output', { mustExist: true });
  const outDirRelative = toRelativeWorkspacePath(outDir);
  const maxFiles = args.maxFiles || 200000;
  const includeFiles = args.includeFiles !== false;
  const includeFamilies = args.includeFamilies !== false;
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
    relativePath: file.path === outDirRelative ? '' : file.path.slice(`${outDirRelative}/`.length),
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
      const familyName = path.basename(outDirRelative);
      const family = ensureFamily(familyName);
      if (relativeParts.length === 1 && FONT_EXTENSIONS.has(file.extension)) {
        family.originals.push(file);
        continue;
      }
      if (relativeParts.length >= 2) {
        const splitDirName = relativeParts[0];
        if (!family.splitDirs.has(splitDirName)) family.splitDirs.set(splitDirName, []);
        family.splitDirs.get(splitDirName).push(file);
      }
      continue;
    }

    const familyName = relativeParts[0];
    const family = ensureFamily(familyName);
    if (relativeParts.length === 2 && FONT_EXTENSIONS.has(file.extension)) {
      family.originals.push(file);
      continue;
    }
    if (relativeParts.length >= 3) {
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
  let legacyOutputCount = 0;

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
      if (entry.hasManifest) manifestCount++; else legacyOutputCount++;
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

  const inspectionWarnings = buildOutputInspectionWarnings({
    maxFilesHit: outputSummary.truncated,
    maxFiles,
    includeFiles,
    includeFamilies,
    legacyOutputCount,
  });

  return {
    ok: true,
    outDir: outDirRelative,
    maxFiles,
    maxFilesHit: outputSummary.truncated,
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
    legacyOutputCount,
    familiesIncluded: includeFamilies,
    ...(includeFiles ? { files } : {}),
    ...(includeFamilies ? { families } : {}),
  };
}
