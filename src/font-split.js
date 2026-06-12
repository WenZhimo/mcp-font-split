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
const UNSUPPORTED_FILE_EXTENSION_CATEGORIES = {
  archive: new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.br']),
  document: new Set(['.txt', '.md', '.markdown', '.pdf', '.doc', '.docx', '.rtf', '.odt', '.ofl', '.license']),
  image: new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.tif', '.tiff', '.avif']),
  web: new Set(['.html', '.htm', '.css', '.js', '.mjs', '.cjs']),
  metadata: new Set(['.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.url', '.csv', '.tsv']),
  signature: new Set(['.asc', '.sig']),
  'unsupported-font': new Set(['.eot', '.svg', '.dfont', '.suit', '.fon', '.bdf', '.pcf', '.pfa', '.pfb', '.pfm', '.afm', '.cff', '.cid', '.ttx', '.ufo', '.glyphs']),
};
const FORMAT_PRIORITY = { '.otf': 0, '.ttf': 1, '.woff2': 2, '.ttc': 3, '.otc': 4, '.woff': 5 };
const MANIFEST_FILE_NAME = 'split-meta.json';
const MANIFEST_VERSION = 1;
const ORGANIZATION_MANIFEST_FILE_NAME = 'font-organization-manifest.json';
const ORGANIZATION_MANIFEST_VERSION = 1;
const PACKAGE_VERSION = packageJson.version;
const WORKFLOW_PRESETS = {
  default: {
    description: 'Use the tool defaults. Explicit arguments still apply normally.',
    writesBatchFiles: 'depends-on-dryRun',
    writesOrganizationFiles: 'depends-on-dryRun',
    batch: {},
    organize: {},
  },
  'safe-preview': {
    description: 'No-write preview for unfamiliar sources. Good first call for agents before any batch write or organization copy.',
    writesBatchFiles: false,
    writesOrganizationFiles: false,
    batch: {
      dryRun: true,
      includeResults: true,
      skipMode: 'manifest',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      batchErrorMode: 'fail-after',
      splitFailureAction: 'single-woff2',
    },
    organize: {
      dryRun: true,
      includePlan: true,
      parseFonts: true,
      batchGroupBy: 'auto',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      copyInvalidFonts: false,
      overwriteExisting: false,
    },
  },
  'reviewed-write': {
    description: 'Write-oriented settings after a preview has been reviewed. Batch writes output; organization copies into outputDir only.',
    writesBatchFiles: true,
    writesOrganizationFiles: true,
    batch: {
      dryRun: false,
      includeResults: false,
      skipMode: 'manifest',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      batchErrorMode: 'fail-after',
      splitFailureAction: 'single-woff2',
    },
    organize: {
      dryRun: false,
      includePlan: true,
      parseFonts: true,
      batchGroupBy: 'auto',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      copyInvalidFonts: false,
      overwriteExisting: false,
    },
  },
  'structure-first': {
    description: 'Fast no-write structural scan for very large or noisy directories. Metadata-sensitive decisions remain limited.',
    writesBatchFiles: false,
    writesOrganizationFiles: false,
    batch: {
      dryRun: true,
      includeResults: false,
      skipMode: 'manifest',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'same-path',
      batchErrorMode: 'fail-after',
    },
    organize: {
      dryRun: true,
      includePlan: false,
      parseFonts: false,
      batchGroupBy: 'auto',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      copyInvalidFonts: false,
      overwriteExisting: false,
    },
  },
  'source-layout': {
    description: 'Prefer source directory names as family/group names. Useful for archive-per-family folder layouts.',
    writesBatchFiles: 'depends-on-dryRun',
    writesOrganizationFiles: 'depends-on-dryRun',
    batch: {
      batchGroupBy: 'source-dir',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
    },
    organize: {
      batchGroupBy: 'source-dir',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
    },
  },
  'metadata-family': {
    description: 'Prefer internal font metadata as family/group names. Useful for flat vendor dumps.',
    writesBatchFiles: 'depends-on-dryRun',
    writesOrganizationFiles: 'depends-on-dryRun',
    batch: {
      batchGroupBy: 'font-family',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
    },
    organize: {
      batchGroupBy: 'font-family',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
    },
  },
  'preserve-all': {
    description: 'Disable pre-processing dedupe while keeping collision-safe numeric names. Useful when every source font file must be kept.',
    writesBatchFiles: 'depends-on-dryRun',
    writesOrganizationFiles: 'depends-on-dryRun',
    batch: {
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'none',
    },
    organize: {
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'none',
    },
  },
};
const WORKFLOW_PRESET_NAMES = Object.keys(WORKFLOW_PRESETS);
const GUIDANCE_DETAIL_LEVELS = ['compact', 'full'];
const GUIDANCE_SECTION_NAMES = [
  'workspace',
  'tools',
  'defaults',
  'recommendations',
  'directory-workflows',
  'examples',
  'verification',
  'warning-catalog',
  'field-catalog',
  'safe-templates',
  'response-fields',
  'path-rules',
  'workflow',
];
const GUIDANCE_COMPACT_SECTION_NAMES = [
  'workspace',
  'tools',
  'defaults',
  'recommendations',
  'directory-workflows',
  'safe-templates',
  'verification',
  'response-fields',
  'path-rules',
  'workflow',
];
const GUIDANCE_SECTION_FIELDS = {
  workspace: ['workspace'],
  tools: ['tools', 'supportedExtensions'],
  defaults: ['defaultPolicies'],
  recommendations: ['recommendedBatchOptions', 'recommendedInspectOptions', 'recommendedOrganizationOptions', 'workflowPresets', 'configurationRecipes'],
  'directory-workflows': ['directoryWorkflowDecisionMatrix'],
  examples: ['directoryWorkflowExamples'],
  verification: ['verificationChecklist'],
  'warning-catalog': ['warningCodeCatalogVersion', 'warningCodeCatalog'],
  'field-catalog': ['toolResponseFieldCatalogVersion', 'toolResponseFieldCatalog'],
  'safe-templates': ['safeInvocationTemplatesVersion', 'safeInvocationTemplates'],
  'response-fields': ['responseFieldsToCheck'],
  'path-rules': ['pathRules'],
  workflow: ['recommendedWorkflow', 'recommendedWorkflowPlanVersion', 'recommendedWorkflowPlan'],
};
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
  const relativePath = path.relative(workspaceRoot(), absolutePath).replaceAll(path.sep, '/');
  return relativePath === '' ? '.' : relativePath;
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

const WARNING_CODE_CATALOG = {
  'dry-run-no-write': {
    sources: ['batchWarnings'],
    severity: 'info',
    suggestedAction: 'Treat the response as a preview only; rerun with dryRun:false after reviewing planned output.',
  },
  'input-scan-truncated': {
    sources: ['batchWarnings', 'inspectionWarnings', 'organizationWarnings'],
    severity: 'action-required',
    suggestedAction: 'Rerun with a higher maxFiles before trusting counts, plans, or audit summaries.',
  },
  'batch-limit-truncated': {
    sources: ['batchWarnings'],
    severity: 'warning',
    suggestedAction: 'Increase limit or acknowledge that only the selected subset of deduplicated fonts was processed.',
  },
  'batch-plan-omitted': {
    sources: ['batchWarnings'],
    severity: 'info',
    suggestedAction: 'Rerun with includeResults:true when a dry-run plan must be inspected.',
  },
  'batch-results-omitted': {
    sources: ['batchWarnings'],
    severity: 'info',
    suggestedAction: 'Use summary counts for large runs, or rerun with includeResults:true when per-font results are needed.',
  },
  'existing-output-skipped': {
    sources: ['batchWarnings'],
    severity: 'warning',
    suggestedAction: 'Inspect skipMode and manifests; use skipMode:force only when reprocessing existing output is intentional.',
  },
  'errors-collected': {
    sources: ['batchWarnings'],
    severity: 'action-required',
    suggestedAction: 'Inspect errors[] before claiming the batch fully succeeded; use fail-after for stricter automation.',
  },
  'input-files-omitted': {
    sources: ['inspectionWarnings'],
    severity: 'info',
    suggestedAction: 'Rerun with includeFiles:true if per-font inspection details are needed.',
  },
  'invalid-fonts-found': {
    sources: ['inspectionWarnings'],
    severity: 'warning',
    suggestedAction: 'Inspect invalidFonts[] or files[] before processing; decide whether broken font-like files should be preserved.',
  },
  'font-identity-missing': {
    sources: ['inspectionWarnings'],
    severity: 'warning',
    suggestedAction: 'Expect identity dedupe to fall back for those fonts; inspect files[] when dedupe precision matters.',
  },
  'output-scan-truncated': {
    sources: ['inspectionWarnings'],
    severity: 'action-required',
    suggestedAction: 'Rerun inspect_split_output with a higher maxFiles before treating the audit as complete.',
  },
  'output-files-omitted': {
    sources: ['inspectionWarnings'],
    severity: 'info',
    suggestedAction: 'Rerun with includeFiles:true if flat output file details are needed.',
  },
  'output-families-omitted': {
    sources: ['inspectionWarnings'],
    severity: 'info',
    suggestedAction: 'Rerun with includeFamilies:true if structured family output details are needed.',
  },
  'legacy-output-detected': {
    sources: ['inspectionWarnings'],
    severity: 'warning',
    suggestedAction: 'Treat manifest-free output as inferred; prefer manifest-backed output for strict audits.',
  },
  'output-structure-issues': {
    sources: ['inspectionWarnings'],
    severity: 'action-required',
    suggestedAction: 'Inspect structureSummary.conforms, issues[], and unexpectedFileExamples[] before treating generated output as valid.',
  },
  'organization-dry-run': {
    sources: ['organizationWarnings'],
    severity: 'info',
    suggestedAction: 'Review planActionSummary, plan[], and recommendedNextActions before rerunning with dryRun:false.',
  },
  'organization-writes-output': {
    sources: ['organizationWarnings'],
    severity: 'info',
    suggestedAction: 'Confirm writesOutputTree and mayOverwriteOutputTree; source files are still preserved.',
  },
  'font-parsing-skipped': {
    sources: ['organizationWarnings'],
    severity: 'warning',
    suggestedAction: 'Rerun with parseFonts:true before relying on invalid-font counts, glyph counts, identity dedupe, or metadata grouping.',
  },
  'output-overwrite-enabled': {
    sources: ['organizationWarnings'],
    severity: 'action-required',
    suggestedAction: 'Confirm overwriting files in outputDir is acceptable before proceeding.',
  },
  'unsupported-files-ignored': {
    sources: ['organizationWarnings'],
    severity: 'info',
    suggestedAction: 'No action needed unless non-font assets must be preserved separately.',
  },
  'invalid-fonts-skipped': {
    sources: ['organizationWarnings'],
    severity: 'warning',
    suggestedAction: 'Use copyInvalidFonts:true only when preserving broken font-like files is intentional.',
  },
  'duplicate-fonts-skipped': {
    sources: ['organizationWarnings'],
    severity: 'info',
    suggestedAction: 'Inspect plan[] when representative choice matters; adjust batchDedupeMode if duplicates should be kept.',
  },
  'mixed-layout-detected': {
    sources: ['organizationWarnings'],
    severity: 'warning',
    suggestedAction: 'Review layout and recommendedBatchPreviewArgs before direct batch splitting.',
  },
  'output-inside-input': {
    sources: ['batchWarnings', 'organizationWarnings'],
    severity: 'action-required',
    suggestedAction: 'Use the nested output directory intentionally as a later input or exclude it from future broad scans.',
  },
};

const ALL_TOOL_NAMES = [
  'get_agent_guidance',
  'get_runtime_status',
  'inspect_font_inputs',
  'organize_font_directory',
  'split_font',
  'split_font_batch',
  'inspect_split_output',
];

const TOOL_RESPONSE_FIELD_CATALOG_VERSION = 1;
const TOOL_RESPONSE_FIELD_CATALOG = {
  ok: {
    sourceTools: ALL_TOOL_NAMES,
    meaning: 'Tool-level success flag. It means the selected policy completed, not necessarily that a normal multi-subset split happened.',
    agentAction: 'Inspect tool-specific outcome, warning, truncation, and error fields before claiming success.',
  },
  node: {
    sourceTools: ['get_runtime_status'],
    meaning: 'Node.js runtime details, including whether the current version satisfies package.json engines.',
    agentAction: 'If node.ok is false, handle recommendedActions before processing fonts.',
  },
  workspace: {
    sourceTools: ['get_agent_guidance', 'get_runtime_status'],
    meaning: 'Resolved FONT_SPLIT_ROOT workspace and configuration status.',
    agentAction: 'Confirm paths are inside the intended workspace before reading or writing local fonts.',
  },
  guidanceView: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Summary of get_agent_guidance response shaping, including detailLevel, included sections, omitted sections, and available sections.',
    agentAction: 'Use this to decide whether to request full guidance or additional sections before relying on omitted catalogs or examples.',
  },
  wasm: {
    sourceTools: ['get_runtime_status'],
    meaning: 'Resolved cn-font-split WASM runtime path and filesystem status.',
    agentAction: 'If missing or not a file, follow recommendedActions before splitting.',
  },
  'wasm.fontSplitWasmPathConfigured': {
    sourceTools: ['get_runtime_status'],
    meaning: 'Whether FONT_SPLIT_WASM_PATH overrides the packaged cn-font-split WASM runtime.',
    agentAction: 'Disclose custom-runtime use when debugging compatibility or reproducibility.',
  },
  cnFontSplit: {
    sourceTools: ['get_runtime_status'],
    meaning: 'cn-font-split package and WASM runtime version metadata.',
    agentAction: 'Use this to diagnose version drift between the wrapper, package, and WASM runtime.',
  },
  'cnFontSplit.packageVersion': {
    sourceTools: ['get_runtime_status'],
    meaning: 'Installed cn-font-split package version.',
    agentAction: 'Compare with expected dependency versions when reproducing behavior.',
  },
  'cnFontSplit.runtimeVersion': {
    sourceTools: ['get_runtime_status'],
    meaning: 'Recorded cn-font-split WASM runtime release, when available.',
    agentAction: 'Record or repair the runtime when runtimeVersion is missing unexpectedly.',
  },
  recommendedActions: {
    sourceTools: ['get_runtime_status'],
    meaning: 'Machine-readable setup remediation actions.',
    agentAction: 'Handle action-required items before calling writing tools.',
  },
  supportedFontCount: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Number of scanned files with supported font extensions.',
    agentAction: 'Use with maxFilesHit and warning fields before trusting source coverage.',
  },
  unsupportedFileSummary: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory'],
    meaning: 'Compact summary of all ignored non-font files, including extension counts, <none> for extensionless files, and a small set of example paths.',
    agentAction: 'Use this when source directories include archives, docs, generated files, or other noise that will not be organized or split.',
  },
  validFontCount: {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Number of supported-extension files whose basic font metadata was parsed successfully.',
    agentAction: 'Treat null as unknown when metadata parsing was intentionally skipped.',
  },
  invalidFontCount: {
    sourceTools: ['inspect_font_inputs', 'organize_font_directory'],
    meaning: 'Number of supported-extension files that failed font metadata parsing.',
    agentAction: 'Inspect invalidFonts[] or organization warnings before deciding whether broken font-like files should be preserved.',
  },
  missingIdentityCount: {
    sourceTools: ['inspect_font_inputs'],
    meaning: 'Number of parseable fonts without a usable batch identity key.',
    agentAction: 'Expect identity dedupe to fall back for these fonts when precision matters.',
  },
  resultType: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Specific processing result classification, including subset, fallback, and copy-original cases.',
    agentAction: 'Use this instead of ok alone when reporting what was produced.',
  },
  outputMode: {
    sourceTools: ['split_font', 'split_font_batch', 'inspect_split_output'],
    meaning: 'Broad output category: subset, single-woff2, or copy-original.',
    agentAction: 'Disclose non-subset modes because they are not normal multi-subset output.',
  },
  performedSplit: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'True only when normal cn-font-split multi-subset processing actually ran.',
    agentAction: 'Do not claim multi-subset splitting when this is false.',
  },
  usedFallback: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'True when the result used a fallback path such as single-WOFF2 output.',
    agentAction: 'Tell the user fallback output was used and inspect warnings.',
  },
  warnings: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Per-font warnings from processing one selected font.',
    agentAction: 'Review before treating a font as cleanly processed.',
  },
  manifestPath: {
    sourceTools: ['split_font', 'split_font_batch'],
    meaning: 'Path to the split-meta.json manifest for a processed font entry.',
    agentAction: 'Use this as the strongest per-font evidence of what options and source file produced the output.',
  },
  warningCodeCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of machine-readable warning codes emitted by batch, inspection, and organization tools.',
    agentAction: 'Use it to interpret warning severity and choose follow-up actions.',
  },
  warningCodeCatalogVersion: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Version of warningCodeCatalog.',
    agentAction: 'Use this for compatibility checks in automated agents.',
  },
  safetySummary: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Compact source/output safety summary for batch or directory organization calls.',
    agentAction: 'Inspect this before treating a call as non-destructive, dry-run only, or output-writing.',
  },
  toolResponseFieldCatalog: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of important response fields, their source tools, meanings, and suggested agent actions.',
    agentAction: 'Use it as the runtime API map before interpreting tool responses.',
  },
  toolResponseFieldCatalogVersion: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Version of toolResponseFieldCatalog.',
    agentAction: 'Use this for compatibility checks in automated agents.',
  },
  safeInvocationTemplates: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable safe starting calls for common AI-agent workflows.',
    agentAction: 'Choose the closest template, customize placeholder paths and limits, then inspect the listed fields.',
  },
  safeInvocationTemplatesVersion: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Version of safeInvocationTemplates.',
    agentAction: 'Use this for compatibility checks in automated agents.',
  },
  recommendedWorkflowPlan: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Ordered workflow plan that composes safeInvocationTemplates into phases for the selected guidance workflow.',
    agentAction: 'Follow the ordered steps, inspect each listed field, and only advance from preview to write after the reviewed conditions are satisfied.',
  },
  recommendedWorkflowPlanVersion: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Version of recommendedWorkflowPlan.',
    agentAction: 'Use this for compatibility checks in automated agents.',
  },
  batchWarnings: {
    sourceTools: ['split_font_batch'],
    meaning: 'Summary-level batch notices with machine-readable codes.',
    agentAction: 'Inspect every action-required or warning item before claiming the batch fully succeeded.',
  },
  batchWarningCount: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of batchWarnings entries.',
    agentAction: 'Use as a compact signal that batchWarnings needs attention.',
  },
  errorCount: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of per-font processing errors collected by the batch run.',
    agentAction: 'If nonzero, inspect errors[] and do not report full success.',
  },
  errors: {
    sourceTools: ['split_font_batch'],
    meaning: 'Collected per-font processing errors when batchErrorMode allows collection.',
    agentAction: 'Summarize failed inputs and consider rerunning with fail-after for stricter automation.',
  },
  maxFilesHit: {
    sourceTools: ['inspect_font_inputs', 'split_font_batch', 'organize_font_directory', 'inspect_split_output'],
    meaning: 'True when a scan stopped at maxFiles before covering all files.',
    agentAction: 'Rerun with a higher maxFiles before trusting counts, plans, or audits.',
  },
  dryRun: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the call only planned work instead of writing output.',
    agentAction: 'Confirm this explicitly because split_font_batch defaults to false while organize_font_directory defaults to true.',
  },
  planned: {
    sourceTools: ['split_font_batch'],
    meaning: 'Per-font dry-run plan entries for batch output paths and skip decisions.',
    agentAction: 'Review before rerunning a batch with dryRun:false.',
  },
  plannedCount: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of planned batch entries returned for a dry-run.',
    agentAction: 'Use with planIncluded and batchWarnings to decide whether per-font planning was visible.',
  },
  wouldProcessCount: {
    sourceTools: ['split_font_batch'],
    meaning: 'Number of selected fonts that would be processed in a dry-run.',
    agentAction: 'Check before writing to avoid surprising no-op or oversized runs.',
  },
  skippedDuplicates: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Number of equivalent fonts skipped by the selected dedupe policy.',
    agentAction: 'Inspect dedupe mode and plans when representative choice matters.',
  },
  inspectionWarnings: {
    sourceTools: ['inspect_font_inputs', 'inspect_split_output'],
    meaning: 'Summary-level inspection notices with machine-readable codes.',
    agentAction: 'Inspect before trusting source or output audit results.',
  },
  inspectionWarningCount: {
    sourceTools: ['inspect_font_inputs', 'inspect_split_output'],
    meaning: 'Number of inspectionWarnings entries.',
    agentAction: 'Use as a compact signal that inspectionWarnings needs attention.',
  },
  organizationWarnings: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Summary-level organization notices with machine-readable codes.',
    agentAction: 'Review before using recommendedBatchPreviewArgs or running a real copy.',
  },
  organizationWarningCount: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Number of organizationWarnings entries.',
    agentAction: 'Use as a compact signal that organizationWarnings needs attention.',
  },
  recommendedNextActions: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Machine-readable follow-up checklist for batch and directory organization workflows.',
    agentAction: 'Treat as guidance and inspect each action inspectFields before proceeding.',
  },
  operationMode: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Organization mode: plan-only for dry runs, copy-only for real organization runs.',
    agentAction: 'Use it to confirm the organizer did not split fonts and did not modify source files.',
  },
  copiedCount: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Number of font files copied into the organization output directory.',
    agentAction: 'Use with planActionSummary and organizationManifestPath to verify copy-only work.',
  },
  organizationManifestPath: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Path to the font-organization-manifest.json written by a non-dry-run organization call.',
    agentAction: 'Use this as evidence of the copied staging layout when dryRun is false.',
  },
  planActionSummary: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Compact counts of planned or executed organization actions.',
    agentAction: 'Use it when plan[] is omitted or too large, but do not treat it as a substitute for detailed review when copying.',
  },
  plan: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Per-font copy or skip plan entries for directory organization.',
    agentAction: 'Review before running with dryRun:false, especially when overwriteExisting or duplicate skipping is involved.',
  },
  sourceDestructive: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether source files can be moved, deleted, or rewritten. Batch and organization calls should report false.',
    agentAction: 'Verify this remains false before calling a workflow source-safe.',
  },
  sourceFilesPreserved: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the source tree is preserved by the call. Batch and organization calls should report true.',
    agentAction: 'Use with sourceDestructive and writesSourceTree to verify source non-destructiveness.',
  },
  writesSourceTree: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the input directory tree is written by the call. This can be true when outputRoot/outputDir is inside inputDir, even though source font files are preserved.',
    agentAction: 'If true, explain that writes are limited to the nested output tree and verify sourceDestructive remains false.',
  },
  writesOutputTree: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the call may write generated output, copies, or manifests into its output tree.',
    agentAction: 'Confirm this before telling the user a call was dry-run only.',
  },
  outputTreeInsideInputTree: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the configured output tree is inside or equal to the input directory tree.',
    agentAction: 'When true, future broad scans of the inputDir can reprocess generated or organized copies unless the output directory is excluded or used intentionally.',
  },
  mayOverwriteOutputTree: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether the call may replace existing files in its output tree.',
    agentAction: 'Warn or verify intent when true.',
  },
  parsedFontMetadata: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Whether the organizer parsed font metadata during planning.',
    agentAction: 'If false, do not rely on invalid-font counts, glyph counts, identity dedupe, or metadata family grouping.',
  },
  unparsedFontCount: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Number of supported-extension files intentionally not parsed because parseFonts was false.',
    agentAction: 'Rerun with parseFonts:true when metadata-sensitive decisions matter.',
  },
  effectiveBatchDedupeMode: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Actual dedupe mode used after accounting for parseFonts limitations.',
    agentAction: 'Check for same-path fallback when font-identity was requested but parsing was skipped.',
  },
  dedupeLimitedByParsing: {
    sourceTools: ['organize_font_directory'],
    meaning: 'True when identity dedupe could not run because font parsing was skipped.',
    agentAction: 'Rerun with parseFonts:true before trusting identity dedupe.',
  },
  recommendedBatchOptions: {
    sourceTools: ['organize_font_directory', 'get_agent_guidance'],
    meaning: 'Suggested split_font_batch option fragment from guidance or layout analysis. It is not a complete safe invocation by itself.',
    agentAction: 'Prefer recommendedBatchPreviewArgs for a copyable no-write preview call after organize_font_directory; use this field only as policy overrides after reviewing layout and warnings.',
  },
  configurationRecipes: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable mapping from common user intent to preset-first tool calls and explicit tradeoffs.',
    agentAction: 'Use these recipes to choose workflowPreset and the smallest necessary overrides before previewing or writing output.',
  },
  recommendedBatchPreviewArgs: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Copyable no-write split_font_batch preview arguments for the detected layout. It includes inputDir, workflowPreset safe-preview, and only layout-specific overrides.',
    agentAction: 'Use this before writing batch output, then inspect safetySummary, batchWarnings, maxFilesHit, unsupportedFileSummary, skippedDuplicates, and errors.',
  },
  layout: {
    sourceTools: ['organize_font_directory'],
    meaning: 'Detected source directory shape and recommended batch grouping.',
    agentAction: 'Use it when the source directory may not match the desired family grouping.',
  },
  'layout.layoutKind': {
    sourceTools: ['organize_font_directory'],
    meaning: 'Detected source layout kind: empty, flat, nested, or mixed.',
    agentAction: 'Use flat or mixed as a signal to dry-run organization before direct batch splitting.',
  },
  directoryWorkflowDecisionMatrix: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Machine-readable table mapping common directory scenarios to first tool, options, follow-up, safety flags, and fields to inspect.',
    agentAction: 'Use it to choose a safe workflow instead of guessing from path shape.',
  },
  directoryWorkflowExamples: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Concrete directory-shape examples and corresponding safe first calls.',
    agentAction: 'Match user-described layouts to examples, then verify against actual tool responses.',
  },
  resultsIncluded: {
    sourceTools: ['split_font_batch'],
    meaning: 'Whether per-font batch results[] are included.',
    agentAction: 'If false, rely on summary counters or rerun with includeResults:true when per-font details are needed.',
  },
  planIncluded: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Whether per-item planned actions are included.',
    agentAction: 'If false, use summary fields or rerun with includeResults/includePlan true before detailed review.',
  },
  workflowPreset: {
    sourceTools: ['split_font_batch', 'organize_font_directory'],
    meaning: 'Named configuration preset applied before explicit arguments. Explicit tool arguments override preset values.',
    agentAction: 'Use this to explain why effective defaults such as dryRun, parseFonts, skip mode, or dedupe mode were selected.',
  },
  workflowPresets: {
    sourceTools: ['get_agent_guidance'],
    meaning: 'Catalog of named workflow presets, their intended use, write behavior, and expanded batch/organization defaults.',
    agentAction: 'Prefer these presets for common workflows, then pass explicit overrides only for user-specific choices.',
  },
  manifestCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of output entries backed by split-meta.json manifests.',
    agentAction: 'Prefer manifest-backed counts for strict output audits.',
  },
  legacyOutputCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of output entries inferred without manifests.',
    agentAction: 'Treat these as less certain and consider rerunning processing with manifest output.',
  },
  structureSummary: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Machine-readable check for whether output files fit the documented split-output directory structure, including unexpected files, manifest coverage, and per-entry output-mode requirements.',
    agentAction: 'Require structureSummary.conforms true before claiming the output directory is structurally valid; inspect issues[] and unexpectedFileExamples[] when false.',
  },
  auditStatus: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Compact output audit status: pass, incomplete, or action-required.',
    agentAction: 'Require auditStatus pass, auditPassed true, maxFilesHit false, and structureSummary.conforms true before reporting an output audit as complete.',
  },
  auditPassed: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Boolean shortcut for auditStatus === pass.',
    agentAction: 'Treat false as a signal to inspect auditBlockingReasons and structureSummary before reporting completion.',
  },
  auditBlockingReasons: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Compact list of machine-readable reasons that prevent the output audit from passing.',
    agentAction: 'Inspect each code and follow issueCodes when structureSummary contains detailed structure failures.',
  },
  subsetOutputCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of inspected output entries that look like normal subset output.',
    agentAction: 'Use with singleWoff2OutputCount and copyOriginalOutputCount when summarizing output modes.',
  },
  singleWoff2OutputCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of inspected output entries that look like single-WOFF2 fallback output.',
    agentAction: 'Disclose these separately from normal multi-subset output.',
  },
  copyOriginalOutputCount: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Number of inspected output entries that only recorded copy-original handling.',
    agentAction: 'Disclose that these entries do not contain generated WOFF2/CSS output.',
  },
  filesIncluded: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Whether flat output files[] details are included.',
    agentAction: 'Rerun with includeFiles:true when file-level audit details are required.',
  },
  familiesIncluded: {
    sourceTools: ['inspect_split_output'],
    meaning: 'Whether structured families[] details are included.',
    agentAction: 'Rerun with includeFamilies:true when family-level audit details are required.',
  },
};

const SAFE_INVOCATION_TEMPLATES_VERSION = 1;
const SAFE_INVOCATION_TEMPLATES = [
  {
    id: 'runtime-diagnostic',
    tool: 'get_runtime_status',
    useWhen: 'Setup, workspace, Node version, package version, or WASM runtime availability is uncertain.',
    writesFiles: false,
    sourceDestructive: false,
    args: {},
    customizableFields: [],
    inspectFields: ['ok', 'recommendedActions', 'node', 'workspace', 'wasm', 'cnFontSplit'],
    nextStep: 'Handle recommendedActions before calling tools that write output.',
  },
  {
    id: 'source-preflight-compact',
    tool: 'inspect_font_inputs',
    useWhen: 'The source directory is large, unfamiliar, or may contain invalid font-like files.',
    writesFiles: false,
    sourceDestructive: false,
    args: {
      inputDir: '<font-source-dir>',
      maxFiles: 50000,
      includeFiles: false,
    },
    customizableFields: ['inputDir', 'maxFiles', 'includeFiles'],
    inspectFields: ['maxFilesHit', 'inspectionWarnings', 'supportedFontCount', 'unsupportedFileSummary', 'validFontCount', 'invalidFontCount', 'missingIdentityCount'],
    nextStep: 'If maxFilesHit is true or invalid fonts are found, resolve that before relying on batch counts.',
  },
  {
    id: 'directory-mismatch-plan',
    tool: 'organize_font_directory',
    useWhen: 'The source directory is flat, mixed, unfamiliar, or does not match the desired family grouping.',
    writesFiles: false,
    sourceDestructive: false,
    args: {
      inputDir: '<font-source-dir>',
      workflowPreset: 'safe-preview',
    },
    customizableFields: ['inputDir', 'outputDir', 'workflowPreset', 'maxFiles', 'parseFonts', 'includePlan', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode'],
    inspectFields: ['safetySummary', 'layout', 'recommendedBatchOptions', 'recommendedBatchPreviewArgs', 'unsupportedFileSummary', 'organizationWarnings', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'planActionSummary', 'plan'],
    nextStep: 'Use recommendedBatchPreviewArgs for a batch dry-run, or copy to a staging directory only after reviewing the plan.',
  },
  {
    id: 'structure-first-large-directory',
    tool: 'organize_font_directory',
    useWhen: 'The directory is very large/noisy and the agent first needs only directory shape, not metadata-sensitive decisions.',
    writesFiles: false,
    sourceDestructive: false,
    args: {
      inputDir: '<font-source-dir>',
      workflowPreset: 'structure-first',
    },
    customizableFields: ['inputDir', 'outputDir', 'workflowPreset', 'maxFiles', 'includePlan'],
    inspectFields: ['parsedFontMetadata', 'unparsedFontCount', 'effectiveBatchDedupeMode', 'dedupeLimitedByParsing', 'unsupportedFileSummary', 'organizationWarnings', 'layout', 'recommendedBatchOptions', 'recommendedBatchPreviewArgs', 'planActionSummary'],
    nextStep: 'Rerun with parseFonts:true before trusting invalid-font counts, glyph counts, identity dedupe, or font-family grouping.',
  },
  {
    id: 'copy-organized-staging',
    tool: 'organize_font_directory',
    useWhen: 'The user wants a cleaner staging directory after a dry-run organization plan has been reviewed.',
    writesFiles: true,
    sourceDestructive: false,
    args: {
      inputDir: '<font-source-dir>',
      outputDir: 'organized-fonts',
      workflowPreset: 'reviewed-write',
    },
    customizableFields: ['inputDir', 'outputDir', 'workflowPreset', 'maxFiles', 'parseFonts', 'includePlan', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode', 'overwriteExisting'],
    inspectFields: ['safetySummary', 'operationMode', 'copiedCount', 'organizationManifestPath', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'unsupportedFileSummary', 'organizationWarnings', 'planActionSummary'],
    nextStep: 'Use outputDir as the next split_font_batch input only after checking organizationWarnings.',
  },
  {
    id: 'batch-dry-run-preview',
    tool: 'split_font_batch',
    useWhen: 'Before writing batch split output for an unfamiliar or newly organized source directory.',
    writesFiles: false,
    sourceDestructive: false,
    args: {
      inputDir: '<font-source-dir-or-organized-outputDir>',
      outputRoot: 'split-output',
      workflowPreset: 'safe-preview',
      limit: 50000,
      maxFiles: 50000,
    },
    customizableFields: ['inputDir', 'outputRoot', 'workflowPreset', 'limit', 'maxFiles', 'includeResults', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode', 'splitFailureAction'],
    inspectFields: ['safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'dryRun', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileSummary', 'skippedDuplicates', 'errorCount', 'errors'],
    nextStep: 'If the plan is acceptable, rerun with dryRun:false; use includeResults:false for large real runs.',
  },
  {
    id: 'batch-process-reviewed-plan',
    tool: 'split_font_batch',
    useWhen: 'A batch dry-run has been reviewed and the user wants to write split output.',
    writesFiles: true,
    sourceDestructive: false,
    args: {
      inputDir: '<font-source-dir-or-organized-outputDir>',
      outputRoot: 'split-output',
      workflowPreset: 'reviewed-write',
      limit: 50000,
      maxFiles: 50000,
    },
    customizableFields: ['inputDir', 'outputRoot', 'workflowPreset', 'limit', 'maxFiles', 'skipMode', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode', 'splitFailureAction'],
    inspectFields: ['safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'batchWarnings', 'batchWarningCount', 'errorCount', 'errors', 'resultsIncluded', 'maxFilesHit', 'unsupportedFileSummary'],
    nextStep: 'Run inspect_split_output on outputRoot before reporting completion.',
  },
  {
    id: 'output-audit-compact',
    tool: 'inspect_split_output',
    useWhen: 'After processing a batch or when auditing an existing split-output directory.',
    writesFiles: false,
    sourceDestructive: false,
    args: {
      outDir: 'split-output',
      maxFiles: 200000,
      includeFiles: false,
      includeFamilies: false,
    },
    customizableFields: ['outDir', 'maxFiles', 'includeFiles', 'includeFamilies'],
    inspectFields: ['auditStatus', 'auditPassed', 'auditBlockingReasons', 'maxFilesHit', 'inspectionWarnings', 'structureSummary', 'manifestCount', 'legacyOutputCount', 'subsetOutputCount', 'singleWoff2OutputCount', 'copyOriginalOutputCount', 'filesIncluded', 'familiesIncluded'],
    nextStep: 'Require auditStatus pass and structureSummary.conforms true; if maxFilesHit is true or legacy/structure issues are detected, disclose uncertainty or rerun with more detail.',
  },
];
const RECOMMENDED_WORKFLOW_PLAN_VERSION = 1;

function buildRecommendedWorkflowPlan(workflow) {
  const auditStep = {
    id: 'audit-output',
    templateId: 'output-audit-compact',
    required: true,
    writesFiles: false,
    sourceDestructive: false,
    goal: 'Audit the generated output directory before reporting completion.',
    inspectFields: ['auditStatus', 'auditPassed', 'auditBlockingReasons', 'structureSummary', 'maxFilesHit', 'inspectionWarnings', 'manifestCount', 'legacyOutputCount'],
    completeWhen: 'auditStatus is pass, auditPassed is true, structureSummary.conforms is true, maxFilesHit is false, and inspectionWarnings contain no action-required structure or truncation issues.',
  };
  const plans = {
    overview: {
      id: 'safe-agent-batch-workflow',
      summary: 'Default AI-agent path for an unfamiliar font directory: diagnose, preflight, resolve layout ambiguity, preview batch output, write only after review, then audit output.',
      orderedSteps: [
        {
          id: 'runtime-check',
          templateId: 'runtime-diagnostic',
          required: false,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Confirm the workspace, Node runtime, package versions, and WASM runtime are usable when setup is uncertain.',
          inspectFields: ['ok', 'recommendedActions', 'workspace', 'wasm', 'cnFontSplit'],
          completeWhen: 'ok is true, or every recommendedActions item has been handled.',
        },
        {
          id: 'source-preflight',
          templateId: 'source-preflight-compact',
          required: true,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Count supported fonts and ignored non-font files without writing output.',
          inspectFields: ['maxFilesHit', 'inspectionWarnings', 'supportedFontCount', 'unsupportedFileSummary', 'invalidFontCount'],
          completeWhen: 'maxFilesHit is false, or the caller intentionally accepts a bounded summary.',
        },
        {
          id: 'layout-decision',
          templateId: 'directory-mismatch-plan',
          required: 'when-layout-is-flat-mixed-unfamiliar-or-user-wants-staging',
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Use the organizer dry-run to decide whether direct batch splitting is safe or whether a copy-only staging directory is useful.',
          inspectFields: ['safetySummary', 'layout', 'recommendedBatchPreviewArgs', 'organizationWarnings', 'planActionSummary'],
          completeWhen: 'The desired grouping is clear and any organizationWarnings have been reviewed.',
        },
        {
          id: 'batch-preview',
          templateId: 'batch-dry-run-preview',
          required: true,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Preview dedupe, naming, skip checks, warnings, and planned output paths before writing.',
          inspectFields: ['safetySummary', 'dryRun', 'planned', 'batchWarnings', 'maxFilesHit', 'skippedDuplicates', 'errorCount', 'errors'],
          completeWhen: 'dryRun is true, sourceDestructive is false, maxFilesHit is false, and planned paths/warnings are acceptable.',
        },
        {
          id: 'reviewed-write',
          templateId: 'batch-process-reviewed-plan',
          required: 'after-preview-review',
          writesFiles: true,
          sourceDestructive: false,
          goal: 'Write split output only after the preview has been reviewed.',
          inspectFields: ['safetySummary', 'batchWarnings', 'errorCount', 'errors', 'recommendedNextActions'],
          completeWhen: 'errorCount is zero and the response recommends or allows output audit.',
        },
        auditStep,
      ],
      decisionPoints: [
        {
          id: 'staging-needed',
          when: 'The user wants a cleaner source staging directory, or the source layout is too ambiguous for direct grouping.',
          useTemplateId: 'copy-organized-staging',
          inspectFields: ['safetySummary', 'copiedCount', 'organizationWarnings', 'organizationManifestPath'],
          nextInput: 'Use the organizer outputDir as split_font_batch inputDir only after reviewing warnings.',
        },
        {
          id: 'direct-batch-ok',
          when: 'The source layout already matches the desired grouping.',
          useTemplateId: 'batch-dry-run-preview',
          inspectFields: ['safetySummary', 'planned', 'batchWarnings', 'unsupportedFileSummary'],
          nextInput: 'Use the original inputDir for split_font_batch.',
        },
      ],
    },
    single: {
      id: 'single-font-workflow',
      summary: 'Process one known font path, then interpret resultType/outputMode instead of treating ok:true as normal subset proof.',
      orderedSteps: [
        {
          id: 'runtime-check',
          templateId: 'runtime-diagnostic',
          required: false,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Check setup when the workspace or runtime is uncertain.',
          inspectFields: ['ok', 'recommendedActions', 'workspace', 'wasm'],
          completeWhen: 'ok is true, or every recommendedActions item has been handled.',
        },
        {
          id: 'split-known-font',
          tool: 'split_font',
          required: true,
          writesFiles: true,
          sourceDestructive: false,
          goal: 'Process the named font file.',
          inspectFields: ['resultType', 'outputMode', 'performedSplit', 'usedFallback', 'warnings', 'manifestPath'],
          completeWhen: 'manifestPath exists and any fallback/copy-original result has been disclosed.',
        },
        {
          id: 'audit-single-output',
          templateId: 'output-audit-compact',
          required: true,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Audit the single-font output directory when reporting generated files.',
          inspectFields: ['auditStatus', 'auditPassed', 'auditBlockingReasons', 'structureSummary', 'manifestCount', 'inspectionWarnings'],
          completeWhen: 'auditStatus is pass and structureSummary.conforms is true, or any structure limitation is disclosed.',
        },
      ],
      decisionPoints: [
        {
          id: 'fallback-result',
          when: 'resultType is single-woff2-* or copy-original-small-glyph.',
          action: 'Tell the user this was not a normal multi-subset split.',
          inspectFields: ['resultType', 'outputMode', 'usedFallback', 'warnings'],
        },
      ],
    },
    batch: {
      id: 'batch-workflow',
      summary: 'Preflight source inputs, optionally resolve layout mismatch, preview batch output, write reviewed output, then audit structure.',
      orderedSteps: [
        {
          id: 'source-preflight',
          templateId: 'source-preflight-compact',
          required: true,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Understand source size, ignored files, invalid fonts, and scan truncation before batch processing.',
          inspectFields: ['maxFilesHit', 'supportedFontCount', 'unsupportedFileSummary', 'invalidFontCount', 'missingIdentityCount'],
          completeWhen: 'The source scan is complete enough for the requested batch scope.',
        },
        {
          id: 'layout-decision',
          templateId: 'directory-mismatch-plan',
          required: 'when-layout-is-not-obviously-compatible',
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Check whether source directory layout matches desired family grouping.',
          inspectFields: ['layout', 'recommendedBatchPreviewArgs', 'organizationWarnings', 'planActionSummary'],
          completeWhen: 'The grouping strategy is chosen and any layout warnings are reviewed.',
        },
        {
          id: 'batch-preview',
          templateId: 'batch-dry-run-preview',
          required: true,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Preview selected fonts, dedupe, naming, skip decisions, and warnings.',
          inspectFields: ['safetySummary', 'dryRun', 'planned', 'batchWarnings', 'skippedDuplicates', 'errorCount', 'errors'],
          completeWhen: 'The preview paths, warnings, and dedupe policy match the user intent.',
        },
        {
          id: 'reviewed-write',
          templateId: 'batch-process-reviewed-plan',
          required: 'after-preview-review',
          writesFiles: true,
          sourceDestructive: false,
          goal: 'Run the reviewed batch write.',
          inspectFields: ['safetySummary', 'batchWarnings', 'errorCount', 'errors', 'recommendedNextActions'],
          completeWhen: 'errorCount is zero and output audit is available.',
        },
        auditStep,
      ],
      decisionPoints: [
        {
          id: 'preserve-all-files',
          when: 'The user requires every supported source font file to be preserved even if duplicates appear equivalent.',
          action: 'Use workflowPreset preserve-all or explicitly set batchDedupeMode none before previewing.',
          inspectFields: ['batchDedupeMode', 'planned', 'skippedDuplicates'],
        },
      ],
    },
    inspect: {
      id: 'inspection-workflow',
      summary: 'Use read-only tools to verify source inputs or generated output, increasing maxFiles when scans are truncated.',
      orderedSteps: [
        {
          id: 'source-preflight',
          templateId: 'source-preflight-compact',
          required: 'when-inspecting-source-fonts',
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Inspect source font inputs without writing output.',
          inspectFields: ['maxFilesHit', 'inspectionWarnings', 'supportedFontCount', 'unsupportedFileSummary'],
          completeWhen: 'maxFilesHit is false, or truncation is disclosed.',
        },
        auditStep,
      ],
      decisionPoints: [
        {
          id: 'need-details',
          when: 'A compact scan shows warnings, missing manifests, invalid fonts, or structure issues.',
          action: 'Rerun with includeFiles:true or includeFamilies:true only for the narrowed area that needs detail.',
          inspectFields: ['auditStatus', 'auditPassed', 'auditBlockingReasons', 'inspectionWarnings', 'structureSummary', 'filesIncluded', 'familiesIncluded'],
        },
      ],
    },
    organize: {
      id: 'organization-workflow',
      summary: 'Plan directory cleanup with a dry run, copy to a staging directory only after review, then inspect or batch-preview that staged directory.',
      orderedSteps: [
        {
          id: 'organization-plan',
          templateId: 'directory-mismatch-plan',
          required: true,
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Plan source grouping and copy actions without writing.',
          inspectFields: ['safetySummary', 'layout', 'recommendedBatchPreviewArgs', 'organizationWarnings', 'planActionSummary', 'plan'],
          completeWhen: 'The copy plan and grouping policy are acceptable.',
        },
        {
          id: 'copy-staging',
          templateId: 'copy-organized-staging',
          required: 'only-if-user-wants-staging',
          writesFiles: true,
          sourceDestructive: false,
          goal: 'Copy selected fonts into outputDir without moving or deleting source files.',
          inspectFields: ['safetySummary', 'copiedCount', 'organizationWarnings', 'organizationManifestPath'],
          completeWhen: 'sourceDestructive is false and copiedCount/organizationWarnings match the reviewed plan.',
        },
        {
          id: 'inspect-staging',
          templateId: 'source-preflight-compact',
          required: 'after-copy-staging',
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Inspect the staging output as the next source directory.',
          inspectFields: ['supportedFontCount', 'unsupportedFileSummary', 'maxFilesHit', 'inspectionWarnings'],
          completeWhen: 'The staging directory contains the expected supported fonts.',
        },
        {
          id: 'preview-next-batch',
          templateId: 'batch-dry-run-preview',
          required: 'before-splitting-staging-or-original-source',
          writesFiles: false,
          sourceDestructive: false,
          goal: 'Preview split output using either recommendedBatchPreviewArgs or the staged outputDir.',
          inspectFields: ['safetySummary', 'planned', 'batchWarnings', 'skippedDuplicates'],
          completeWhen: 'The batch preview matches the selected grouping and dedupe policy.',
        },
      ],
      decisionPoints: [
        {
          id: 'copy-not-needed',
          when: 'The user only wants split output and recommendedBatchPreviewArgs are acceptable.',
          action: 'Skip copy-organized-staging and run split_font_batch safe-preview on the original inputDir.',
          inspectFields: ['recommendedBatchPreviewArgs', 'layout', 'organizationWarnings'],
        },
      ],
    },
  };
  return plans[workflow] || plans.overview;
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

function uniqueAllowedValues(values, allowed) {
  const allowedSet = new Set(allowed);
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!allowedSet.has(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function buildGuidanceView(args) {
  const detailLevel = GUIDANCE_DETAIL_LEVELS.includes(args.detailLevel) ? args.detailLevel : 'compact';
  const rawSections = Array.isArray(args.sections) ? args.sections : null;
  const requestedSections = rawSections ? uniqueAllowedValues(rawSections, GUIDANCE_SECTION_NAMES) : null;
  const ignoredSections = rawSections ? rawSections.filter((section) => !GUIDANCE_SECTION_NAMES.includes(section)) : [];
  const defaultSections = detailLevel === 'compact' ? GUIDANCE_COMPACT_SECTION_NAMES : GUIDANCE_SECTION_NAMES;
  const sectionsIncluded = requestedSections?.length ? requestedSections : defaultSections;
  return {
    detailLevel,
    availableDetailLevels: GUIDANCE_DETAIL_LEVELS,
    availableSections: GUIDANCE_SECTION_NAMES,
    compactDefaultSections: GUIDANCE_COMPACT_SECTION_NAMES,
    sectionsRequested: rawSections,
    sectionsIncluded,
    omittedSections: GUIDANCE_SECTION_NAMES.filter((section) => !sectionsIncluded.includes(section)),
    ignoredSections,
  };
}

function selectGuidanceSections(guidance, sectionsIncluded) {
  const selected = {
    ok: guidance.ok,
    purpose: guidance.purpose,
    workflow: guidance.workflow,
    agentOptimized: guidance.agentOptimized,
    guidanceView: guidance.guidanceView,
  };
  for (const section of sectionsIncluded) {
    for (const fieldName of GUIDANCE_SECTION_FIELDS[section] || []) {
      selected[fieldName] = guidance[fieldName];
    }
  }
  return selected;
}

export function getAgentGuidance(args = {}) {
  const workflow = ['overview', 'single', 'batch', 'inspect', 'organize'].includes(args.workflow) ? args.workflow : 'overview';
  const guidanceView = buildGuidanceView(args);
  const configuredRoot = process.env.FONT_SPLIT_ROOT || null;
  const root = workspaceRoot();
  const commonPathRules = [
    'Resolve every relative path inside FONT_SPLIT_ROOT.',
    'If FONT_SPLIT_ROOT is not configured and the user has not named a workspace, ask before processing private local fonts.',
    'Use inspect_font_inputs before large or unfamiliar font libraries.',
    'Use organize_font_directory with dryRun true when the source directory layout does not match the desired batch grouping; it is source-non-destructive and defaults to plan-only.',
    'Use dryRun with includeResults true to preview batch naming, dedupe, and skip decisions without writing output.',
    'Batch defaults already use skipMode manifest and batchErrorMode fail-after; pass force only when reprocessing is intentional, and pass collect only when the caller checks errors[] and errorCount.',
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
      responseFields: ['maxFilesHit', 'inspectionWarnings', 'supportedFontCount', 'unsupportedFileSummary', 'invalidFontCount', 'missingIdentityCount'],
    },
    {
      id: 'layout-plan-reviewed',
      appliesTo: ['overview', 'batch', 'organize'],
      check: 'When source layout may not match the intended output grouping, call organize_font_directory with dryRun true and inspect safetySummary, layout, recommendedBatchOptions, recommendedBatchPreviewArgs, sourceDestructive, writesSourceTree, writesOutputTree, outputTreeInsideInputTree, mayOverwriteOutputTree, organizationWarnings, and planActionSummary before applying any copy plan.',
      responseFields: ['safetySummary', 'layout', 'recommendedBatchOptions', 'recommendedBatchPreviewArgs', 'recommendedNextActions', 'unsupportedFileSummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'organizationWarnings', 'planActionSummary', 'plan'],
    },
    {
      id: 'batch-plan-reviewed',
      appliesTo: ['overview', 'batch'],
      check: 'For unfamiliar batch runs, review a dryRun plan and safetySummary before writing output.',
      responseFields: ['safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'dryRun', 'planIncluded', 'plannedCount', 'wouldProcessCount', 'skippedDuplicates'],
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
      check: 'After batch processing, inspect the output directory and require auditStatus pass, auditPassed true, structureSummary.conforms true, maxFilesHit false, and no action-required inspectionWarnings before treating the audit as complete.',
      responseFields: ['auditStatus', 'auditPassed', 'auditBlockingReasons', 'maxFilesHit', 'inspectionWarnings', 'structureSummary', 'manifestCount', 'legacyOutputCount', 'subsetOutputCount', 'singleWoff2OutputCount', 'copyOriginalOutputCount'],
    },
    {
      id: 'local-real-corpus-suite-passed',
      appliesTo: ['overview', 'batch', 'organize'],
      check: 'When maintaining this package or changing functionality-affecting behavior, run npm run smoke:real-corpus-suite -- <font-corpus-dir> against a local real corpus before calling the change complete. This is a representative reliability gate, not a per-directory acceptance audit.',
      command: 'npm run smoke:real-corpus-suite -- <font-corpus-dir>',
      verboseCommand: 'npm run smoke:real-corpus-suite -- <font-corpus-dir> --verbose',
      responseFields: [],
    },
  ];

  const workflows = {
    overview: [
      'Call get_agent_guidance to orient yourself.',
      'Use workflowPreset safe-preview for first no-write batch or organization calls, then reviewed-write only after reviewing the preview.',
      'Call get_runtime_status when diagnosing setup, workspace, cn-font-split package, or WASM runtime availability.',
      'Call inspect_font_inputs for a no-write source preflight.',
      'Call organize_font_directory with dryRun true if directory layout is flat/mixed/unfamiliar or if the user asks to stage fonts into a cleaner structure.',
      'Call split_font_batch with dryRun true to preview output layout.',
      'Call split_font_batch with includeResults false for full-library processing.',
      'Call inspect_split_output after processing; require auditStatus pass and structureSummary.conforms true; use includeFiles false / includeFamilies false for compact summaries.',
    ],
    single: [
      'Call split_font with one fontPath.',
      'Inspect resultType, outputMode, performedSplit, usedFallback, warnings, and manifestPath.',
      'Use splitFailureAction single-woff2 only when fallback output is acceptable.',
    ],
    batch: [
      'Call inspect_font_inputs with includeFiles false for a compact source summary.',
      'Call organize_font_directory with dryRun true when source directory structure and desired family grouping do not match.',
      'Call split_font_batch with workflowPreset safe-preview to review planned paths without writing.',
      'Use batchNamingMode numeric-suffix and batchDedupeMode font-identity unless the user asks for another policy.',
      'Use includeResults false for large real runs.',
      'Call inspect_split_output on the outputRoot when done; require auditStatus pass and structureSummary.conforms true; use includeFiles false / includeFamilies false for large outputs.',
    ],
    inspect: [
      'Call get_runtime_status to verify workspace, cn-font-split package, and WASM runtime availability when setup is uncertain.',
      'Call inspect_font_inputs to audit source directories before processing.',
      'Call inspect_split_output to audit generated output directories; require auditStatus pass and structureSummary.conforms true; set includeFiles false / includeFamilies false when only summary counts are needed.',
      'If maxFilesHit is true, rerun with a higher maxFiles before treating the summary as complete.',
    ],
    organize: [
      'Call organize_font_directory with workflowPreset safe-preview first; review layout, recommendedBatchPreviewArgs, organizationWarnings, and plan before writing copies.',
      'If the plan is acceptable, call organize_font_directory again with workflowPreset reviewed-write to copy selected fonts into outputDir. This never moves or deletes source files.',
      'Use parseFonts false only when the user needs a fast structure-first plan; inspect parsedFontMetadata and dedupeLimitedByParsing before relying on identity dedupe or font-family grouping.',
      'After organizing, run inspect_font_inputs on outputDir or split_font_batch with inputDir set to outputDir.',
      'If organizationWarnings contains output-overwrite-enabled or output-inside-input, disclose the risk before proceeding.',
    ],
  };
  const directoryWorkflowDecisionMatrix = [
    {
      id: 'known-single-font',
      useWhen: 'The user named one known font file and does not need directory scanning.',
      firstTool: 'split_font',
      writesFilesByDefault: true,
      sourceDestructive: false,
      recommendedOptions: {
        fontPath: '<path-to-font>',
      },
      mustInspectFields: ['resultType', 'outputMode', 'performedSplit', 'usedFallback', 'warnings', 'manifestPath'],
      nonIntuitiveBehavior: 'ok:true may still mean single-woff2 fallback or copy-original instead of normal multi-subset output.',
    },
    {
      id: 'known-good-batch-layout',
      useWhen: 'The source directory layout already matches the intended family grouping.',
      firstTool: 'split_font_batch',
      writesFilesByDefault: false,
      sourceDestructive: false,
      recommendedOptions: {
        workflowPreset: 'safe-preview',
      },
      followUpTool: 'split_font_batch',
      followUpOptions: {
        workflowPreset: 'reviewed-write',
      },
      mustInspectFields: ['safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'dryRun', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileSummary', 'skippedDuplicates', 'errorCount', 'errors'],
      nonIntuitiveBehavior: 'split_font_batch dryRun defaults to false, so agents should set dryRun:true explicitly for planning.',
    },
    {
      id: 'unknown-or-mixed-directory-layout',
      useWhen: 'The source directory is flat, mixed, unfamiliar, or may not match the desired output grouping.',
      firstTool: 'organize_font_directory',
      writesFilesByDefault: false,
      sourceDestructive: false,
      recommendedOptions: {
        workflowPreset: 'safe-preview',
      },
      followUpTool: 'split_font_batch',
      followUpOptions: {
        inputDir: '<original-inputDir-or-organized-outputDir>',
        workflowPreset: 'safe-preview',
      },
      mustInspectFields: ['safetySummary', 'layout', 'recommendedBatchOptions', 'recommendedBatchPreviewArgs', 'unsupportedFileSummary', 'organizationWarnings', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'planActionSummary', 'plan'],
      nonIntuitiveBehavior: 'organize_font_directory defaults to dryRun:true and never moves or deletes source files; dryRun:false copies into outputDir only.',
    },
    {
      id: 'large-or-noisy-directory-first-pass',
      useWhen: 'The library is very large or metadata parsing is expected to be slow/noisy, and the agent only needs a structure-first recommendation.',
      firstTool: 'organize_font_directory',
      writesFilesByDefault: false,
      sourceDestructive: false,
      recommendedOptions: {
        workflowPreset: 'structure-first',
      },
      mustInspectFields: ['parsedFontMetadata', 'unparsedFontCount', 'effectiveBatchDedupeMode', 'dedupeLimitedByParsing', 'unsupportedFileSummary', 'organizationWarnings', 'planActionSummary', 'layout', 'recommendedBatchOptions', 'recommendedBatchPreviewArgs'],
      nonIntuitiveBehavior: 'parseFonts:false means validFontCount and invalidFontCount are null, not zero; identity dedupe and metadata family grouping are limited.',
    },
    {
      id: 'user-wants-clean-staging-directory',
      useWhen: 'The user explicitly wants an organized copy of the source fonts before splitting.',
      firstTool: 'organize_font_directory',
      writesFilesByDefault: false,
      sourceDestructive: false,
      recommendedOptions: {
        workflowPreset: 'safe-preview',
      },
      followUpTool: 'organize_font_directory',
      followUpOptions: {
        workflowPreset: 'reviewed-write',
      },
      mustInspectFields: ['safetySummary', 'operationMode', 'copiedCount', 'organizationManifestPath', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'unsupportedFileSummary', 'organizationWarnings', 'planActionSummary'],
      nonIntuitiveBehavior: 'A real organize run is copy-only. overwriteExisting:true can replace files in outputDir but still does not modify source files.',
    },
  ];
  const directoryWorkflowExamples = [
    {
      id: 'flat-vendor-dump',
      sourceShape: [
        'fonts/',
        '  BrandSans-Regular.ttf',
        '  BrandSans-Bold.otf',
        '  readme.txt',
      ],
      likelyLayoutKind: 'flat',
      concern: 'Root-level font files have no directory grouping, so family grouping depends on font metadata.',
      firstTool: 'organize_font_directory',
      firstCall: {
        inputDir: 'fonts',
        workflowPreset: 'safe-preview',
      },
      ifPlanLooksGood: [
        'If the user only wants split output, call split_font_batch on the original inputDir using recommendedBatchPreviewArgs.',
        'If the user wants a cleaner source staging directory, call organize_font_directory again with dryRun:false, then split_font_batch with inputDir set to outputDir.',
      ],
      safety: {
        sourceDestructive: false,
        defaultWritesFiles: false,
        realOrganizerMode: 'copy-only',
      },
      mustInspectFields: ['safetySummary', 'layout.layoutKind', 'recommendedBatchOptions', 'recommendedBatchPreviewArgs', 'unsupportedFileSummary', 'organizationWarnings', 'planActionSummary', 'plan'],
    },
    {
      id: 'archive-per-family-folders',
      sourceShape: [
        'fonts/',
        '  BrandSans/',
        '    Regular.ttf',
        '    Bold.ttf',
        '  OtherSerif/',
        '    Regular.otf',
      ],
      likelyLayoutKind: 'nested',
      concern: 'Each top-level source folder already looks like a family grouping.',
      firstTool: 'split_font_batch',
      firstCall: {
        inputDir: 'fonts',
        workflowPreset: 'safe-preview',
        batchGroupBy: 'source-dir',
      },
      ifPlanLooksGood: [
        'Run split_font_batch again with dryRun:false, usually includeResults:false for large libraries.',
        'Use organize_font_directory only if the user explicitly wants a copied staging directory.',
      ],
      safety: {
        sourceDestructive: false,
        defaultWritesFiles: false,
        realOrganizerMode: 'not-needed-unless-staging',
      },
      mustInspectFields: ['safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileSummary', 'skippedDuplicates', 'errors'],
    },
    {
      id: 'mixed-root-and-nested-fonts',
      sourceShape: [
        'fonts/',
        '  LooseDisplay.ttf',
        '  BrandSans/',
        '    Regular.ttf',
        '  OtherSerif/',
        '    Regular.otf',
      ],
      likelyLayoutKind: 'mixed',
      concern: 'Root-level and nested fonts are mixed, so direct batch grouping can surprise users.',
      firstTool: 'organize_font_directory',
      firstCall: {
        inputDir: 'fonts',
        workflowPreset: 'safe-preview',
      },
      ifPlanLooksGood: [
        'Prefer reviewing recommendedBatchPreviewArgs before splitting.',
        'Use copy-only organization when the user wants a stable staging source that separates loose and nested inputs.',
      ],
      safety: {
        sourceDestructive: false,
        defaultWritesFiles: false,
        realOrganizerMode: 'copy-only',
      },
      mustInspectFields: ['safetySummary', 'layout.layoutKind', 'organizationWarnings', 'recommendedBatchOptions', 'recommendedBatchPreviewArgs', 'unsupportedFileSummary', 'sourceDestructive', 'writesSourceTree', 'outputTreeInsideInputTree', 'planActionSummary'],
    },
    {
      id: 'large-noisy-first-pass',
      sourceShape: [
        'fonts/',
        '  many folders and files',
        '  archives, docs, screenshots, and font-like files',
      ],
      likelyLayoutKind: 'unknown',
      concern: 'Metadata parsing may be slow or noisy, and the first question is only how the directory is shaped.',
      firstTool: 'organize_font_directory',
      firstCall: {
        inputDir: 'fonts',
        workflowPreset: 'structure-first',
      },
      ifPlanLooksGood: [
        'Use this only as a structure-first scan.',
        'Rerun with parseFonts:true before relying on invalid-font counts, glyph counts, font-family grouping, or identity dedupe.',
      ],
      safety: {
        sourceDestructive: false,
        defaultWritesFiles: false,
        realOrganizerMode: 'copy-only-when-dryRun-false',
      },
      mustInspectFields: ['parsedFontMetadata', 'unparsedFontCount', 'effectiveBatchDedupeMode', 'dedupeLimitedByParsing', 'unsupportedFileSummary', 'organizationWarnings', 'planActionSummary', 'recommendedBatchPreviewArgs'],
    },
  ];
  const configurationRecipes = [
    {
      id: 'safe-default-batch',
      userIntent: 'Split an unfamiliar font directory with the default agent-safe behavior.',
      firstTool: 'split_font_batch',
      previewArgs: {
        inputDir: '<font-source-dir>',
        outputRoot: 'split-output',
        workflowPreset: 'safe-preview',
      },
      writeArgsAfterReview: {
        inputDir: '<font-source-dir>',
        outputRoot: 'split-output',
        workflowPreset: 'reviewed-write',
      },
      writesFilesBeforeReview: false,
      sourceDestructive: false,
      tradeoffs: [
        'Uses font-identity dedupe, numeric-suffix naming, manifest skip checks, and fail-after error handling.',
        'Preview before writing; inspect batchWarnings, maxFilesHit, skippedDuplicates, errors, and safetySummary.',
      ],
      auditAfterWrite: {
        tool: 'inspect_split_output',
        requiredFields: ['auditStatus', 'auditPassed', 'structureSummary', 'maxFilesHit', 'inspectionWarnings'],
        passWhen: 'auditStatus is pass, auditPassed is true, structureSummary.conforms is true, and maxFilesHit is false.',
      },
    },
    {
      id: 'preserve-every-source-font',
      userIntent: 'Keep every supported source font file even when files look like duplicate formats of the same font.',
      firstTool: 'split_font_batch',
      previewArgs: {
        inputDir: '<font-source-dir>',
        outputRoot: 'split-output',
        workflowPreset: 'safe-preview',
        batchDedupeMode: 'none',
      },
      writeArgsAfterReview: {
        inputDir: '<font-source-dir>',
        outputRoot: 'split-output',
        workflowPreset: 'reviewed-write',
        batchDedupeMode: 'none',
      },
      writesFilesBeforeReview: false,
      sourceDestructive: false,
      tradeoffs: [
        'Disables pre-processing dedupe, so more output entries and more naming collisions are expected.',
        'Keep batchNamingMode numeric-suffix unless the user explicitly wants another collision policy.',
      ],
      inspectFields: ['planned', 'plannedCount', 'skippedDuplicates', 'batchWarnings', 'outputTreeInsideInputTree'],
    },
    {
      id: 'source-folder-families',
      userIntent: 'Use existing top-level source folders as family/group names.',
      firstTool: 'split_font_batch',
      previewArgs: {
        inputDir: '<font-source-dir>',
        outputRoot: 'split-output',
        workflowPreset: 'safe-preview',
        batchGroupBy: 'source-dir',
      },
      writeArgsAfterReview: {
        inputDir: '<font-source-dir>',
        outputRoot: 'split-output',
        workflowPreset: 'reviewed-write',
        batchGroupBy: 'source-dir',
      },
      writesFilesBeforeReview: false,
      sourceDestructive: false,
      tradeoffs: [
        'Best for archive-per-family or vendor folders where source paths already express grouping.',
        'If root-level and nested fonts are mixed, dry-run organize_font_directory first to avoid surprising grouping.',
      ],
      inspectFields: ['layout', 'recommendedBatchPreviewArgs', 'planned', 'batchWarnings', 'unsupportedFileSummary'],
    },
    {
      id: 'metadata-family-groups',
      userIntent: 'Group a flat source directory by internal font family metadata.',
      firstTool: 'organize_font_directory',
      previewArgs: {
        inputDir: '<font-source-dir>',
        workflowPreset: 'safe-preview',
        batchGroupBy: 'font-family',
      },
      followUpPreviewArgs: {
        inputDir: '<font-source-dir-or-organized-outputDir>',
        outputRoot: 'split-output',
        workflowPreset: 'safe-preview',
        batchGroupBy: 'font-family',
      },
      writesFilesBeforeReview: false,
      sourceDestructive: false,
      tradeoffs: [
        'Requires font metadata parsing; invalid or unparseable fonts may be skipped by organization unless copyInvalidFonts is explicitly enabled.',
        'Use organize_font_directory first when source layout is flat or mixed so recommendedBatchPreviewArgs can be reviewed.',
      ],
      inspectFields: ['parsedFontMetadata', 'invalidFontCount', 'layout', 'recommendedBatchPreviewArgs', 'organizationWarnings'],
    },
    {
      id: 'fast-structure-first-scan',
      userIntent: 'Quickly inspect a very large or noisy directory before paying for metadata parsing.',
      firstTool: 'organize_font_directory',
      previewArgs: {
        inputDir: '<font-source-dir>',
        workflowPreset: 'structure-first',
      },
      writesFilesBeforeReview: false,
      sourceDestructive: false,
      tradeoffs: [
        'parseFonts is false, so validFontCount and invalidFontCount are null rather than zero.',
        'Identity dedupe and font-family grouping are limited until rerun with parseFonts:true or safe-preview.',
      ],
      inspectFields: ['parsedFontMetadata', 'unparsedFontCount', 'dedupeLimitedByParsing', 'unsupportedFileSummary', 'recommendedBatchPreviewArgs'],
    },
    {
      id: 'copy-clean-staging-directory',
      userIntent: 'Create a cleaner copied staging directory before splitting.',
      firstTool: 'organize_font_directory',
      previewArgs: {
        inputDir: '<font-source-dir>',
        outputDir: 'organized-fonts',
        workflowPreset: 'safe-preview',
      },
      writeArgsAfterReview: {
        inputDir: '<font-source-dir>',
        outputDir: 'organized-fonts',
        workflowPreset: 'reviewed-write',
      },
      writesFilesBeforeReview: false,
      writeBehavior: 'copy-only-outputDir',
      sourceDestructive: false,
      tradeoffs: [
        'Real organization writes copy selected fonts into outputDir only; it never moves, deletes, or rewrites source files.',
        'overwriteExisting only affects files in outputDir and should be enabled explicitly.',
      ],
      inspectFields: ['safetySummary', 'operationMode', 'copiedCount', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'organizationWarnings', 'planActionSummary'],
    },
    {
      id: 'large-reviewed-write',
      userIntent: 'Run a full-library write after a preview has been reviewed.',
      firstTool: 'split_font_batch',
      writeArgsAfterReview: {
        inputDir: '<font-source-dir-or-organized-outputDir>',
        outputRoot: 'split-output',
        workflowPreset: 'reviewed-write',
        limit: 50000,
        maxFiles: 50000,
      },
      writesFilesBeforeReview: false,
      sourceDestructive: false,
      tradeoffs: [
        'includeResults is false through reviewed-write, keeping large responses compact.',
        'Always follow the audit-split-output next action and require auditStatus pass before reporting completion.',
      ],
      inspectFields: ['safetySummary', 'batchWarnings', 'errorCount', 'errors', 'recommendedNextActions', 'resultsIncluded'],
    },
  ];

  const guidance = {
    ok: true,
    purpose: 'AI-agent guidance for using mcp-font-split safely and predictably.',
    workflow,
    agentOptimized: true,
    guidanceView,
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
      batchErrorMode: 'fail-after',
      skipMode: 'manifest',
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
      skipMode: 'manifest',
      batchErrorMode: 'fail-after',
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
      parseFonts: true,
      batchGroupBy: 'auto',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      copyInvalidFonts: false,
      overwriteExisting: false,
    },
    workflowPresets: buildWorkflowPresetCatalog(),
    configurationRecipes,
    directoryWorkflowDecisionMatrix,
    directoryWorkflowExamples,
    verificationChecklist,
    warningCodeCatalogVersion: 1,
    warningCodeCatalog: WARNING_CODE_CATALOG,
    toolResponseFieldCatalogVersion: TOOL_RESPONSE_FIELD_CATALOG_VERSION,
    toolResponseFieldCatalog: TOOL_RESPONSE_FIELD_CATALOG,
    safeInvocationTemplatesVersion: SAFE_INVOCATION_TEMPLATES_VERSION,
    safeInvocationTemplates: SAFE_INVOCATION_TEMPLATES,
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
      'workflowPresets',
      'workflowPreset',
      'configurationRecipes',
      'supportedFontCount',
      'unsupportedFileSummary',
      'validFontCount',
      'invalidFontCount',
      'missingIdentityCount',
      'resultType',
      'outputMode',
      'performedSplit',
      'usedFallback',
      'warnings',
      'manifestPath',
      'guidanceView',
      'warningCodeCatalog',
      'safetySummary',
      'toolResponseFieldCatalog',
      'safeInvocationTemplates',
      'recommendedWorkflowPlan',
      'recommendedWorkflowPlanVersion',
      'batchWarnings',
      'batchWarningCount',
      'errorCount',
      'errors',
      'maxFilesHit',
      'dryRun',
      'planned',
      'plannedCount',
      'wouldProcessCount',
      'skippedDuplicates',
      'inspectionWarnings',
      'inspectionWarningCount',
      'organizationWarnings',
      'organizationWarningCount',
      'recommendedNextActions',
      'warningCodeCatalogVersion',
      'toolResponseFieldCatalogVersion',
      'safeInvocationTemplatesVersion',
      'operationMode',
      'copiedCount',
      'organizationManifestPath',
      'planActionSummary',
      'plan',
      'sourceDestructive',
      'sourceFilesPreserved',
      'writesSourceTree',
      'writesOutputTree',
      'outputTreeInsideInputTree',
      'mayOverwriteOutputTree',
      'parsedFontMetadata',
      'unparsedFontCount',
      'effectiveBatchDedupeMode',
      'dedupeLimitedByParsing',
      'recommendedBatchOptions',
      'recommendedBatchPreviewArgs',
      'layout',
      'layout.layoutKind',
      'directoryWorkflowDecisionMatrix',
      'directoryWorkflowExamples',
      'resultsIncluded',
      'planIncluded',
      'manifestCount',
      'legacyOutputCount',
      'auditStatus',
      'auditPassed',
      'auditBlockingReasons',
      'structureSummary',
      'subsetOutputCount',
      'singleWoff2OutputCount',
      'copyOriginalOutputCount',
      'filesIncluded',
      'familiesIncluded',
    ],
    pathRules: commonPathRules,
    recommendedWorkflow: workflows[workflow],
    recommendedWorkflowPlanVersion: RECOMMENDED_WORKFLOW_PLAN_VERSION,
    recommendedWorkflowPlan: buildRecommendedWorkflowPlan(workflow),
  };
  return selectGuidanceSections(guidance, guidanceView.sectionsIncluded);
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

function buildUnsupportedFileSummary(files, { maxExamples = 20 } = {}) {
  const unsupportedFiles = files.filter((file) => !FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const byExtension = new Map();
  const byCategory = new Map();
  for (const file of unsupportedFiles) {
    const extension = path.extname(file).toLowerCase() || '<none>';
    byExtension.set(extension, (byExtension.get(extension) || 0) + 1);
    const category = categorizeUnsupportedFileExtension(extension);
    byCategory.set(category, (byCategory.get(category) || 0) + 1);
  }

  return {
    total: unsupportedFiles.length,
    byExtension: [...byExtension.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([extension, count]) => ({ extension, count })),
    byCategory: [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([category, count]) => ({ category, count })),
    examples: unsupportedFiles
      .slice(0, maxExamples)
      .map((file) => toRelativeWorkspacePath(file)),
    examplesTruncated: unsupportedFiles.length > maxExamples,
  };
}

function categorizeUnsupportedFileExtension(extension) {
  if (extension === '<none>') return 'extensionless';
  for (const [category, extensions] of Object.entries(UNSUPPORTED_FILE_EXTENSION_CATEGORIES)) {
    if (extensions.has(extension)) return category;
  }
  return 'other';
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

function getWorkflowPresetName(value) {
  return typeof value === 'string' && WORKFLOW_PRESET_NAMES.includes(value) ? value : 'default';
}

function dropUndefinedOptions(args = {}) {
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
}

function applyWorkflowPreset(args = {}, scope) {
  const workflowPreset = getWorkflowPresetName(args.workflowPreset);
  const preset = WORKFLOW_PRESETS[workflowPreset] || WORKFLOW_PRESETS.default;
  const scopePreset = preset[scope] || {};
  const explicitArgs = dropUndefinedOptions(args);
  return {
    workflowPreset,
    args: {
      ...scopePreset,
      ...explicitArgs,
      workflowPreset,
    },
  };
}

function buildWorkflowPresetCatalog() {
  return WORKFLOW_PRESET_NAMES.map((id) => {
    const preset = WORKFLOW_PRESETS[id];
    return {
      id,
      description: preset.description,
      writesBatchFiles: preset.writesBatchFiles,
      writesOrganizationFiles: preset.writesOrganizationFiles,
      batchDefaults: preset.batch,
      organizationDefaults: preset.organize,
      explicitOptionsOverridePreset: true,
    };
  });
}

function normalizeProcessingOptions(args) {
  const smallGlyphActions = ['subset', 'single-woff2', 'copy-original'];
  return {
    oversizedKernAction: args.oversizedKernAction === 'strip' ? 'strip' : 'preserve',
    smallGlyphAction: smallGlyphActions.includes(args.smallGlyphAction) ? args.smallGlyphAction : 'subset',
    smallGlyphThreshold: Number.isFinite(args.smallGlyphThreshold) && args.smallGlyphThreshold > 0
      ? Math.floor(args.smallGlyphThreshold)
      : 50,
    splitFailureAction: args.splitFailureAction === 'single-woff2' ? 'single-woff2' : 'error',
  };
}

function normalizeBatchOptions(args) {
  return {
    workflowPreset: getWorkflowPresetName(args.workflowPreset),
    skipMode: ['manifest', 'force'].includes(args.skipMode) ? args.skipMode : 'manifest',
    batchGroupBy: ['auto', 'source-dir', 'font-family'].includes(args.batchGroupBy) ? args.batchGroupBy : 'auto',
    batchNamingMode: ['plain', 'numeric-suffix', 'source-suffix'].includes(args.batchNamingMode) ? args.batchNamingMode : 'numeric-suffix',
    batchDedupeMode: ['none', 'same-path', 'font-identity'].includes(args.batchDedupeMode) ? args.batchDedupeMode : 'font-identity',
    batchErrorMode: ['collect', 'fail-fast', 'fail-after'].includes(args.batchErrorMode) ? args.batchErrorMode : 'fail-after',
    debugBatchDecisions: args.debugBatchDecisions === true,
  };
}

function normalizeOrganizationOptions(args) {
  return {
    workflowPreset: getWorkflowPresetName(args.workflowPreset),
    dryRun: args.dryRun !== false,
    includePlan: args.includePlan !== false,
    parseFonts: args.parseFonts !== false,
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
    'reduceMins', 'autoSubset', 'subsetRemainChars',
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
  outputTreeInsideInputTree,
}) {
  const warnings = [];
  const push = (code, message) => warnings.push({ code, message });

  if (dryRun) {
    push('dry-run-no-write', 'dryRun is true; no output files were written.');
  }
  if (outputTreeInsideInputTree) {
    push('output-inside-input', 'outputRoot is inside or equal to inputDir. Future scans should exclude that output directory unless reprocessing generated output is intentional.');
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

function buildBatchSafetySummary({ dryRun, selectedCount, outputTreeInsideInputTree }) {
  const writesOutputTree = dryRun !== true;
  const writesSourceTree = writesOutputTree && outputTreeInsideInputTree;
  const mayOverwriteOutputTree = writesOutputTree && selectedCount > 0;
  const writeScope = !writesOutputTree
    ? 'none'
    : outputTreeInsideInputTree ? 'output-tree-inside-input-tree' : 'output-tree-only';
  const overwriteScope = !mayOverwriteOutputTree
    ? 'none'
    : outputTreeInsideInputTree ? 'output-tree-inside-input-tree' : 'output-tree-only';
  const summary = dryRun
    ? 'Batch dry run; no output files were written and source files were only scanned.'
    : outputTreeInsideInputTree
      ? 'Batch output write; outputRoot is inside or equal to inputDir, so the input tree receives generated output files, but source font files are never moved, deleted, or rewritten.'
      : 'Batch output write; selected fonts are written only into outputRoot and source files are never moved, deleted, or rewritten.';
  return {
    operationMode: dryRun ? 'preview-only' : 'batch-output',
    sourceDestructive: false,
    sourceFilesPreserved: true,
    writesSourceTree,
    writesOutputTree,
    outputTreeInsideInputTree,
    mayOverwriteOutputTree,
    writeScope,
    overwriteScope,
    summary,
  };
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

function buildOutputInspectionWarnings({ maxFilesHit, maxFiles, includeFiles, includeFamilies, legacyOutputCount, structureIssueCount }) {
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
  if (structureIssueCount > 0) {
    push('output-structure-issues', `${structureIssueCount} output structure issue(s) were detected; inspect structureSummary before treating the output as valid.`);
  }

  return warnings;
}

function buildOutputAuditStatus({ maxFilesHit, maxFiles, structureSummary }) {
  const auditBlockingReasons = [];
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

function buildOrganizationWarnings({
  dryRun,
  parseFonts,
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
  if (!parseFonts) {
    push('font-parsing-skipped', 'parseFonts is false; the organizer did not read font metadata, so identity dedupe, glyph counts, invalid-font detection, and font-family grouping are limited.');
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
    push('mixed-layout-detected', 'Fonts were found both at the input root and inside nested folders. Review recommendedBatchPreviewArgs before splitting.');
  }
  if (outputDirInsideInput) {
    push('output-inside-input', 'outputDir is inside or equal to inputDir. Future scans should exclude that output directory to avoid reprocessing organized copies.');
  }

  return warnings;
}

function omitPresetDefaults(values, defaults = {}) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .filter(([key, value]) => !Object.is(value, defaults[key])),
  );
}

function buildSuggestedOrganizationArgs({
  inputDir,
  outputDir,
  workflowPreset,
  options,
  optionOverrides = {},
  extraArgs = {},
}) {
  const presetDefaults = WORKFLOW_PRESETS[workflowPreset]?.organize || {};
  const values = { ...options, ...optionOverrides };
  const presetOverrides = omitPresetDefaults({
    dryRun: values.dryRun,
    includePlan: values.includePlan,
    parseFonts: values.parseFonts,
    batchGroupBy: values.batchGroupBy,
    batchNamingMode: values.batchNamingMode,
    batchDedupeMode: values.batchDedupeMode,
    copyInvalidFonts: values.copyInvalidFonts,
    overwriteExisting: values.overwriteExisting,
  }, presetDefaults);

  return {
    inputDir,
    outputDir,
    workflowPreset,
    ...presetOverrides,
    ...extraArgs,
  };
}

function buildSuggestedBatchPreviewArgs({ inputDir, recommendedBatchOptions = {}, extraArgs = {} }) {
  const presetDefaults = {
    batchGroupBy: 'auto',
    ...WORKFLOW_PRESETS['safe-preview'].batch,
  };
  return {
    inputDir,
    workflowPreset: 'safe-preview',
    ...omitPresetDefaults(recommendedBatchOptions, presetDefaults),
    ...extraArgs,
  };
}

function buildSuggestedBatchWriteArgs({ inputDir, outputRoot, effectiveArgs, batchOptions }) {
  const presetDefaults = {
    batchGroupBy: 'auto',
    ...WORKFLOW_PRESETS['reviewed-write'].batch,
  };
  const overrides = omitPresetDefaults({
    skipMode: batchOptions.skipMode,
    batchGroupBy: batchOptions.batchGroupBy,
    batchNamingMode: batchOptions.batchNamingMode,
    batchDedupeMode: batchOptions.batchDedupeMode,
    batchErrorMode: batchOptions.batchErrorMode,
    splitFailureAction: effectiveArgs.splitFailureAction,
  }, presetDefaults);
  return {
    inputDir,
    outputRoot,
    workflowPreset: 'reviewed-write',
    ...(effectiveArgs.limit !== undefined ? { limit: effectiveArgs.limit } : {}),
    ...(effectiveArgs.maxFiles !== undefined ? { maxFiles: effectiveArgs.maxFiles } : {}),
    ...overrides,
  };
}

function buildSuggestedBatchRerunArgs({ inputDir, outputRoot, workflowPreset, effectiveArgs, batchOptions }) {
  const presetDefaults = {
    batchGroupBy: 'auto',
    ...(WORKFLOW_PRESETS[workflowPreset]?.batch || {}),
  };
  const overrides = omitPresetDefaults({
    skipMode: batchOptions.skipMode,
    batchGroupBy: batchOptions.batchGroupBy,
    batchNamingMode: batchOptions.batchNamingMode,
    batchDedupeMode: batchOptions.batchDedupeMode,
    batchErrorMode: batchOptions.batchErrorMode,
    splitFailureAction: effectiveArgs.splitFailureAction,
  }, presetDefaults);
  return {
    inputDir,
    outputRoot,
    workflowPreset,
    ...(effectiveArgs.limit !== undefined ? { limit: effectiveArgs.limit } : {}),
    maxFiles: '<higher-than-current>',
    ...overrides,
  };
}

function buildBatchAuditArgs({ outputRoot }) {
  return {
    outDir: outputRoot,
    includeFiles: false,
    includeFamilies: false,
    maxFiles: 200000,
  };
}

function buildBatchNextActions({
  dryRun,
  inputDirRelative,
  outputRoot,
  effectiveArgs,
  batchOptions,
  maxFiles,
  maxFilesHit,
  selectedFontCount,
  errorCount,
  writesOutputTree,
}) {
  const actions = [];
  const push = (action) => actions.push(action);

  if (maxFilesHit) {
    const rerunWorkflowPreset = dryRun ? 'safe-preview' : 'reviewed-write';
    push({
      id: 'rerun-batch-with-higher-maxFiles',
      priority: 'high',
      tool: 'split_font_batch',
      reason: `The batch scan hit maxFiles (${maxFiles}); the planned or processed set may be incomplete.`,
      suggestedArgs: buildSuggestedBatchRerunArgs({
        inputDir: inputDirRelative,
        outputRoot,
        workflowPreset: rerunWorkflowPreset,
        effectiveArgs,
        batchOptions,
      }),
      inspectFields: ['maxFilesHit', 'unsupportedFileSummary', 'batchWarnings', 'discoveredFontCount', 'deduplicatedCount', 'selectedFontCount'],
    });
  }

  if (errorCount > 0) {
    push({
      id: 'inspect-batch-errors',
      priority: 'high',
      tool: 'split_font_batch',
      reason: 'The batch response contains per-font errors; inspect errors[] before reporting the batch as successful.',
      inspectFields: ['errorCount', 'errors', 'batchWarnings', 'processedFontCount'],
    });
  }

  if (dryRun) {
    if (selectedFontCount > 0) {
      push({
        id: 'run-reviewed-batch-write',
        priority: maxFilesHit || errorCount > 0 ? 'medium' : 'high',
        tool: 'split_font_batch',
        reason: 'The dry-run wrote no files; after reviewing planned paths and warnings, rerun with reviewed-write to create output.',
        suggestedArgs: buildSuggestedBatchWriteArgs({
          inputDir: inputDirRelative,
          outputRoot,
          effectiveArgs,
          batchOptions,
        }),
        inspectFields: ['safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'batchWarnings', 'errorCount', 'errors', 'resultsIncluded', 'maxFilesHit', 'unsupportedFileSummary'],
      });
    }
    return actions;
  }

  if (writesOutputTree) {
    push({
      id: 'audit-split-output',
      priority: errorCount > 0 ? 'medium' : 'high',
      tool: 'inspect_split_output',
      reason: 'A real batch write can create or update output files; inspect the output directory before reporting completion.',
      suggestedArgs: buildBatchAuditArgs({ outputRoot }),
      inspectFields: ['auditStatus', 'auditPassed', 'auditBlockingReasons', 'maxFilesHit', 'inspectionWarnings', 'structureSummary', 'manifestCount', 'legacyOutputCount', 'subsetOutputCount', 'singleWoff2OutputCount', 'copyOriginalOutputCount'],
      successCriteria: 'Require auditStatus pass, auditPassed true, structureSummary.conforms true, maxFilesHit false, and no action-required inspectionWarnings before treating output as structurally valid.',
    });
  }

  return actions;
}

function buildOrganizationNextActions({
  options,
  inputDirRelative,
  outputDirRelative,
  maxFiles,
  maxFilesHit,
  layout,
  warnings,
  errorCount,
  selectedFontCount,
  copiedCount,
}) {
  const actions = [];
  const warningCodes = new Set(warnings.map((warning) => warning.code));
  const push = (action) => actions.push(action);

  if (maxFilesHit) {
    push({
      id: 'rerun-with-higher-maxFiles',
      priority: 'high',
      tool: 'organize_font_directory',
      reason: `The organization scan hit maxFiles (${maxFiles}); the plan may be incomplete.`,
      suggestedArgs: buildSuggestedOrganizationArgs({
        inputDir: inputDirRelative,
        outputDir: outputDirRelative,
        workflowPreset: options.parseFonts ? 'safe-preview' : 'structure-first',
        options,
        extraArgs: { maxFiles: '<higher-than-current>' },
      }),
      inspectFields: ['maxFilesHit', 'layout', 'unsupportedFileSummary', 'organizationWarnings', 'planActionSummary', 'plan'],
    });
  }

  if (!options.parseFonts) {
    push({
      id: 'rerun-with-font-parsing',
      priority: 'high',
      tool: 'organize_font_directory',
      reason: 'parseFonts:false is structure-only; rerun with parsing before relying on invalid-font counts, glyph counts, identity dedupe, or metadata family grouping.',
      suggestedArgs: buildSuggestedOrganizationArgs({
        inputDir: inputDirRelative,
        outputDir: outputDirRelative,
        workflowPreset: 'safe-preview',
        options,
        optionOverrides: { dryRun: true, parseFonts: true },
      }),
      inspectFields: ['parsedFontMetadata', 'validFontCount', 'invalidFontCount', 'effectiveBatchDedupeMode', 'dedupeLimitedByParsing', 'unsupportedFileSummary', 'organizationWarnings', 'planActionSummary'],
    });
  }

  if (warningCodes.has('invalid-fonts-skipped')) {
    push({
      id: 'decide-on-invalid-fonts',
      priority: 'medium',
      tool: 'organize_font_directory',
      reason: 'Some supported-extension files looked like fonts but could not be parsed and were skipped.',
      suggestedArgs: buildSuggestedOrganizationArgs({
        inputDir: inputDirRelative,
        outputDir: outputDirRelative,
        workflowPreset: 'safe-preview',
        options,
        optionOverrides: { dryRun: true, copyInvalidFonts: true },
      }),
      inspectFields: ['invalidFontCount', 'organizationWarnings', 'planActionSummary', 'plan'],
      note: 'Use copyInvalidFonts:true only when preserving broken font-like files is intentional.',
    });
  }

  if (layout.layoutKind === 'mixed') {
    push({
      id: 'review-mixed-layout-grouping',
      priority: 'medium',
      tool: 'split_font_batch',
      reason: 'Fonts were found both at the input root and in nested folders; direct batch grouping can surprise users.',
      suggestedArgs: buildSuggestedBatchPreviewArgs({
        inputDir: inputDirRelative,
        recommendedBatchOptions: layout.recommendedBatchOptions,
      }),
      inspectFields: ['safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileSummary', 'skippedDuplicates', 'errors'],
    });
  }

  if (warningCodes.has('output-inside-input')) {
    push({
      id: 'avoid-reprocessing-organized-copies',
      priority: 'medium',
      tool: 'split_font_batch',
      reason: 'outputDir is inside or equal to inputDir, so future broad scans can accidentally process organized copies as source fonts.',
      suggestedArgs: buildSuggestedBatchPreviewArgs({
        inputDir: outputDirRelative,
        recommendedBatchOptions: layout.recommendedBatchOptions,
      }),
      inspectFields: ['safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'inputDir', 'maxFilesHit', 'unsupportedFileSummary', 'batchWarnings', 'planned'],
      note: 'Use the organized outputDir intentionally as the next inputDir, or keep future scans scoped so they do not reprocess organized copies.',
    });
  }

  if (errorCount > 0) {
    push({
      id: 'inspect-organization-errors',
      priority: 'high',
      tool: 'organize_font_directory',
      reason: 'The organization run reported per-file errors.',
      inspectFields: ['errorCount', 'errors', 'planActionSummary', 'plan'],
    });
  }

  if (options.dryRun) {
    push({
      id: 'review-plan-before-writing',
      priority: 'high',
      tool: 'organize_font_directory',
      reason: 'dryRun:true wrote no files; review the plan and warnings before choosing a write step.',
      inspectFields: ['safetySummary', 'planActionSummary', 'plan', 'unsupportedFileSummary', 'organizationWarnings', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree'],
    });

    if (selectedFontCount > 0) {
      push({
        id: 'preview-batch-split-original-layout',
        priority: 'medium',
        tool: 'split_font_batch',
        reason: 'If the user only needs split output, preview splitting the original inputDir with the recommended batch options.',
        suggestedArgs: buildSuggestedBatchPreviewArgs({
          inputDir: inputDirRelative,
          recommendedBatchOptions: layout.recommendedBatchOptions,
        }),
        inspectFields: ['safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileSummary', 'skippedDuplicates', 'errors'],
      });
      push({
        id: 'copy-organized-staging-directory',
        priority: 'medium',
        tool: 'organize_font_directory',
        reason: 'If the user wants a cleaner staging directory, rerun the reviewed plan in copy-only mode.',
        suggestedArgs: buildSuggestedOrganizationArgs({
          inputDir: inputDirRelative,
          outputDir: outputDirRelative,
          workflowPreset: 'reviewed-write',
          options,
          optionOverrides: { dryRun: false, overwriteExisting: false },
        }),
        inspectFields: ['safetySummary', 'operationMode', 'copiedCount', 'organizationManifestPath', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'unsupportedFileSummary', 'organizationWarnings', 'planActionSummary'],
      });
    }
  } else if (copiedCount > 0) {
    push({
      id: 'inspect-organized-output',
      priority: 'medium',
      tool: 'inspect_font_inputs',
      reason: 'The organizer copied fonts into outputDir; inspect that staging directory before splitting it.',
      suggestedArgs: {
        inputDir: outputDirRelative,
        includeFiles: false,
      },
      inspectFields: ['supportedFontCount', 'unsupportedFileSummary', 'invalidFontCount', 'missingIdentityCount', 'inspectionWarnings'],
    });
    push({
      id: 'preview-batch-split-organized-output',
      priority: 'medium',
      tool: 'split_font_batch',
      reason: 'Preview splitting the organized staging directory before writing split output.',
      suggestedArgs: buildSuggestedBatchPreviewArgs({
        inputDir: outputDirRelative,
        recommendedBatchOptions: layout.recommendedBatchOptions,
      }),
      inspectFields: ['safetySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'planned', 'batchWarnings', 'maxFilesHit', 'unsupportedFileSummary', 'skippedDuplicates', 'errors'],
    });
  }

  return actions;
}

function buildPlanActionSummary(plan) {
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
  if (skipMode === 'force') {
    return { shouldSkip: false, reason: 'force' };
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

function relativePathInside(baseRelativePath, itemRelativePath) {
  if (baseRelativePath === '.') return itemRelativePath;
  if (itemRelativePath === baseRelativePath) return '';
  const prefix = `${baseRelativePath}/`;
  return itemRelativePath.startsWith(prefix) ? itemRelativePath.slice(prefix.length) : itemRelativePath;
}

function relativePathDepth(relativePath) {
  return relativePath.split('/').filter(Boolean).length;
}

function buildOutputStructureSummary({
  outDirRelative,
  files,
  families,
  fontEntryCount,
  manifestCount,
  legacyOutputCount,
}) {
  const classifiedPaths = new Set();
  const originalDepthCounts = {};
  const outputModeCounts = {};
  const entryIssueExamples = [];
  let unknownOutputModeCount = 0;
  let webOutputMissingCount = 0;
  let copyOriginalExtraOutputCount = 0;

  const recordOriginalDepth = (file) => {
    const depth = relativePathDepth(relativePathInside(outDirRelative, file.path));
    originalDepthCounts[depth] = (originalDepthCounts[depth] || 0) + 1;
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
  for (const file of files) {
    const depth = relativePathDepth(relativePathInside(outDirRelative, file.path));
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
  pushIssue('missing-manifests', 'Some font entries do not include split-meta.json and were inferred as legacy output.', legacyOutputCount);
  pushIssue('unknown-output-mode', 'Some font entries have an unknown output mode.', unknownOutputModeCount);
  pushIssue('web-output-missing', 'Some subset or single-WOFF2 entries are missing result.css or WOFF2 files.', webOutputMissingCount);
  pushIssue('copy-original-extra-output', 'Some copy-original entries unexpectedly contain generated CSS or WOFF2 files.', copyOriginalExtraOutputCount);

  const maxExamples = 20;
  return {
    conforms: issues.length === 0,
    layoutKind,
    familyCount: families.length,
    fontEntryCount,
    manifestCount,
    legacyOutputCount,
    manifestCoverageOk: manifestCount === fontEntryCount,
    classifiedFileCount: classifiedPaths.size,
    unexpectedFileCount: unexpectedFiles.length,
    unexpectedFileExamples: unexpectedFiles
      .slice(0, maxExamples)
      .map((file) => file.path),
    unexpectedFileExamplesTruncated: unexpectedFiles.length > maxExamples,
    unexpectedDepthFileCount: depthIssueFiles.length,
    outputModeCounts,
    entryIssueExamples: entryIssueExamples.slice(0, maxExamples),
    entryIssueExamplesTruncated: entryIssueExamples.length > maxExamples,
    issueCount: issues.length,
    issues,
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

async function resolveStableBatchOutputNames({ resolvedOutDir, fontBaseName, fontFileName, inputRelativePath, reservedNames = new Set() }) {
  const extension = path.extname(fontFileName);
  const existingNames = await listExistingSplitDirNames(resolvedOutDir, fontBaseName);
  const seen = new Set([...existingNames, ...reservedNames]);

  for (const name of existingNames) {
    const manifest = await readSplitManifest(path.join(resolvedOutDir, name));
    if (manifest?.source?.input === inputRelativePath && !reservedNames.has(name)) {
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
    if (manifest?.source?.input === inputRelativePath && !reservedNames.has(candidate)) {
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
      safetySummary: result.safetySummary,
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

export async function splitFontBatch(args = {}) {
  const presetContext = applyWorkflowPreset(args, 'batch');
  const effectiveArgs = presetContext.args;
  const inputDir = await resolveWorkspacePath(effectiveArgs.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${effectiveArgs.inputDir}`);

  const batchOptions = normalizeBatchOptions(effectiveArgs);
  const processingOptions = normalizeProcessingOptions(effectiveArgs);
  const includeResults = effectiveArgs.includeResults !== false;
  const dryRun = effectiveArgs.dryRun === true;
  const outputRoot = effectiveArgs.outputRoot || 'split-output';
  const outputRootName = path.basename(outputRoot);
  const resolvedOutputRoot = await resolveWorkspacePath(outputRoot);
  const outputTreeInsideInputTree = isInside(inputDir, resolvedOutputRoot);

  const maxFiles = effectiveArgs.maxFiles || 5000;
  const inputScan = await scanFilesRecursive(inputDir, {
    maxFiles,
    excludeDirs: [outputRootName],
  });
  const allFiles = inputScan.files;
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const unsupportedFileSummary = buildUnsupportedFileSummary(allFiles);

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
  const selected = deduplicated.slice(0, effectiveArgs.limit || 20);

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
  let skippedByManifest = 0;
  let reprocessedBecauseSourceChanged = 0;
  let reprocessedBecauseOptionsChanged = 0;
  let wouldProcessCount = 0;
  const batchOutputNameReservations = new Map();

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
        const reservationKey = path.resolve(resolvedOutDir);
        const reservedNames = batchOutputNameReservations.get(reservationKey) || new Set();
        batchOutputNames = await resolveStableBatchOutputNames({
          resolvedOutDir,
          fontBaseName,
          fontFileName,
          inputRelativePath: relative,
          reservedNames,
        });
        reservedNames.add(batchOutputNames.splitDirName);
        batchOutputNameReservations.set(reservationKey, reservedNames);
      }
      logBatchDecision(batchOptions.debugBatchDecisions, 'naming', {
        mode: batchOptions.batchNamingMode,
        input: relative,
        groupName,
        splitDirName: batchOutputNames.splitDirName,
        copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
      });

      const inputStat = await fs.stat(file);
      const effectiveConfig = buildEffectiveConfigSnapshot({ ...effectiveArgs, ...batchOptions, groupName }, processingOptions);
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
        effectiveArgs.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'skipped' });
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
        effectiveArgs.onProgress?.({ current: planned.length + errors.length, total: selected.length, file: relative, status: 'planned' });
        continue;
      }

      const result = await splitFont({
        ...effectiveArgs,
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
      effectiveArgs.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'done' });
    } catch (error) {
      resetWasmRuntime();
      logBatchDecision(batchOptions.debugBatchDecisions, 'error', {
        input: relative,
        message: error instanceof Error ? error.message : String(error),
      });
      errors.push({ file: relative, error: error instanceof Error ? error.message : String(error) });
      effectiveArgs.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'error' });
      if (batchOptions.batchErrorMode === 'fail-fast') {
        const fastFailSafetySummary = buildBatchSafetySummary({
          dryRun,
          selectedCount: selected.length,
          outputTreeInsideInputTree,
        });
        throw buildBatchError({
          mode: batchOptions.batchErrorMode,
          errors,
          summary: {
            inputDir: toRelativeWorkspacePath(inputDir),
            outputRoot,
            safetySummary: fastFailSafetySummary,
            sourceDestructive: fastFailSafetySummary.sourceDestructive,
            sourceFilesPreserved: fastFailSafetySummary.sourceFilesPreserved,
            writesSourceTree: fastFailSafetySummary.writesSourceTree,
            writesOutputTree: fastFailSafetySummary.writesOutputTree,
            outputTreeInsideInputTree: fastFailSafetySummary.outputTreeInsideInputTree,
            mayOverwriteOutputTree: fastFailSafetySummary.mayOverwriteOutputTree,
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
    outputTreeInsideInputTree,
  });
  const safetySummary = buildBatchSafetySummary({
    dryRun,
    selectedCount: selected.length,
    outputTreeInsideInputTree,
  });
  const inputDirRelative = toRelativeWorkspacePath(inputDir);
  const recommendedNextActions = buildBatchNextActions({
    dryRun,
    inputDirRelative,
    outputRoot,
    effectiveArgs,
    batchOptions,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    selectedFontCount: selected.length,
    errorCount: errors.length,
    writesOutputTree: safetySummary.writesOutputTree,
  });

  const response = {
    ok: true,
    inputDir: inputDirRelative,
    outputRoot,
    workflowPreset: batchOptions.workflowPreset,
    safetySummary,
    sourceDestructive: safetySummary.sourceDestructive,
    sourceFilesPreserved: safetySummary.sourceFilesPreserved,
    writesSourceTree: safetySummary.writesSourceTree,
    writesOutputTree: safetySummary.writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    mayOverwriteOutputTree: safetySummary.mayOverwriteOutputTree,
    dryRun,
    skipMode: batchOptions.skipMode,
    batchGroupBy: batchOptions.batchGroupBy,
    batchNamingMode: batchOptions.batchNamingMode,
    batchDedupeMode: batchOptions.batchDedupeMode,
    batchErrorMode: batchOptions.batchErrorMode,
    scannedFileCount: allFiles.length,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    unsupportedFileSummary,
    discoveredFontCount: fontFiles.length,
    deduplicatedCount,
    skippedDuplicates: skippedCount,
    selectedFontCount: selected.length,
    skippedExisting,
    skippedByManifest,
    reprocessedBecauseSourceChanged,
    reprocessedBecauseOptionsChanged,
    processedFontCount: results.length,
    errorCount: errors.length,
    errors,
    batchWarningCount: batchWarnings.length,
    batchWarnings,
    recommendedNextActionCount: recommendedNextActions.length,
    recommendedNextActions,
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
  const unsupportedFileSummary = buildUnsupportedFileSummary(allFiles);
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
    unsupportedFileSummary,
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

export async function organizeFontDirectory(args = {}) {
  const presetContext = applyWorkflowPreset(args, 'organize');
  const effectiveArgs = presetContext.args;
  const inputDir = await resolveWorkspacePath(effectiveArgs.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${effectiveArgs.inputDir}`);

  const options = normalizeOrganizationOptions(effectiveArgs);
  const outputDir = await resolveWorkspacePath(effectiveArgs.outputDir || 'organized-fonts');
  if (path.resolve(inputDir) === path.resolve(outputDir)) {
    throw new Error('outputDir must be different from inputDir.');
  }

  const maxFiles = effectiveArgs.maxFiles || 50000;
  const scan = await scanFilesRecursive(inputDir, {
    maxFiles,
    excludeDirs: [path.basename(outputDir)],
  });
  const allFiles = scan.files;
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const unsupportedFileSummary = buildUnsupportedFileSummary(allFiles);
  const layout = buildDirectoryLayoutSummary({ inputDir, allFiles, fontFiles });
  const entries = [];

  for (const file of fontFiles) {
    if (options.parseFonts) {
      entries.push({
        ...(await inspectInputFontFile(file)),
        file,
        metadataParsed: true,
      });
    } else {
      const stat = await fs.stat(file);
      entries.push({
        path: toRelativeWorkspacePath(file),
        extension: path.extname(file).toLowerCase(),
        sizeBytes: stat.size,
        status: 'not-parsed',
        container: null,
        glyphCount: null,
        identity: null,
        identityBasis: null,
        identityKey: null,
        metadataParsed: false,
        file,
      });
    }
  }

  const validEntries = entries.filter((entry) => entry.status !== 'invalid');
  const invalidEntries = entries.filter((entry) => entry.status === 'invalid');
  const effectiveDedupeMode = options.parseFonts ? options.batchDedupeMode : options.batchDedupeMode === 'none' ? 'none' : 'same-path';
  const dedupe = dedupeOrganizationEntries(validEntries, effectiveDedupeMode);
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
      reason: 'deduped by effective batchDedupeMode',
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
  const planActionSummary = buildPlanActionSummary(plan);
  const skippedCount = plan.filter((item) => item.action.startsWith('skipped') || item.action === 'would-skip-target-exists').length;
  const outputDirInsideInput = isInside(inputDir, outputDir);
  const sourceDestructive = false;
  const writesOutputTree = !options.dryRun;
  const writesSourceTree = writesOutputTree && outputDirInsideInput;
  const mayOverwriteOutputTree = !options.dryRun && options.overwriteExisting;
  const operationMode = options.dryRun ? 'plan-only' : 'copy-only';
  const writeScope = !writesOutputTree
    ? 'none'
    : outputDirInsideInput ? 'output-tree-inside-input-tree' : 'output-tree-only';
  const overwriteScope = !mayOverwriteOutputTree
    ? 'none'
    : outputDirInsideInput ? 'output-tree-inside-input-tree' : 'output-tree-only';
  const summary = options.dryRun
    ? 'Plan-only dry run; no files are written and source files are only scanned.'
    : outputDirInsideInput
      ? 'Copy-only organization; outputDir is inside or equal to inputDir, so the input tree receives organized copies, but source font files are never moved, deleted, or rewritten.'
      : mayOverwriteOutputTree
        ? 'Copy-only organization; selected fonts are copied into outputDir and existing output files may be replaced, but source files are never moved, deleted, or rewritten.'
        : 'Copy-only organization; selected fonts are copied into outputDir without replacing existing output files, and source files are never moved, deleted, or rewritten.';
  const safetySummary = {
    operationMode,
    sourceDestructive,
    sourceFilesPreserved: true,
    writesSourceTree,
    writesOutputTree,
    outputTreeInsideInputTree: outputDirInsideInput,
    mayOverwriteOutputTree,
    writeScope,
    overwriteScope,
    summary,
  };
  const warnings = buildOrganizationWarnings({
    dryRun: options.dryRun,
    overwriteExisting: options.overwriteExisting,
    inputScanTruncated: scan.truncated,
    maxFiles,
    parseFonts: options.parseFonts,
    unsupportedFileCount: layout.unsupportedFileCount,
    invalidFontCount: invalidEntries.length,
    copyInvalidFonts: options.copyInvalidFonts,
    skippedDuplicateCount: dedupe.duplicates.length,
    layoutKind: layout.layoutKind,
    outputDirInsideInput,
  });
  const recommendedBatchPreviewArgs = buildSuggestedBatchPreviewArgs({
    inputDir: inputDirRelative,
    recommendedBatchOptions: layout.recommendedBatchOptions,
  });
  const recommendedNextActions = buildOrganizationNextActions({
    options,
    inputDirRelative,
    outputDirRelative,
    maxFiles,
    maxFilesHit: scan.truncated,
    layout,
    warnings,
    errorCount: errors.length,
    selectedFontCount: selectedEntries.length,
    copiedCount,
  });

  const result = {
    ok: errors.length === 0,
    workflowPreset: options.workflowPreset,
    dryRun: options.dryRun,
    inputDir: inputDirRelative,
    outputDir: outputDirRelative,
    maxFiles,
    maxFilesHit: scan.truncated,
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    parsedFontMetadata: options.parseFonts,
    unparsedFontCount: options.parseFonts ? 0 : entries.length,
    validFontCount: options.parseFonts ? validEntries.length : null,
    invalidFontCount: options.parseFonts ? invalidEntries.length : null,
    unsupportedFileCount: layout.unsupportedFileCount,
    unsupportedFileSummary,
    deduplicatedCount: dedupe.selected.length,
    skippedDuplicates: dedupe.duplicates.length,
    selectedFontCount: selectedEntries.length,
    copiedCount,
    skippedTargetExists,
    skippedCount,
    errorCount: errors.length,
    errors,
    safetySummary,
    sourceDestructive,
    writesSourceTree,
    writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    mayOverwriteOutputTree,
    sourceFilesPreserved: true,
    operationMode,
    parseFonts: options.parseFonts,
    requestedBatchDedupeMode: options.batchDedupeMode,
    effectiveBatchDedupeMode: effectiveDedupeMode,
    dedupeLimitedByParsing: !options.parseFonts && options.batchDedupeMode === 'font-identity',
    batchGroupBy: options.batchGroupBy,
    batchNamingMode: options.batchNamingMode,
    batchDedupeMode: options.batchDedupeMode,
    copyInvalidFonts: options.copyInvalidFonts,
    overwriteExisting: options.overwriteExisting,
    layout,
    recommendedBatchOptions: layout.recommendedBatchOptions,
    recommendedBatchPreviewArgs,
    recommendedNextActionCount: recommendedNextActions.length,
    recommendedNextActions,
    organizationWarningCount: warnings.length,
    organizationWarnings: warnings,
    planActionSummary,
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

  const structureSummary = buildOutputStructureSummary({
    outDirRelative,
    files,
    families,
    fontEntryCount,
    manifestCount,
    legacyOutputCount,
  });

  const inspectionWarnings = buildOutputInspectionWarnings({
    maxFilesHit: outputSummary.truncated,
    maxFiles,
    includeFiles,
    includeFamilies,
    legacyOutputCount,
    structureIssueCount: structureSummary.issueCount,
  });
  const auditStatusSummary = buildOutputAuditStatus({
    maxFilesHit: outputSummary.truncated,
    maxFiles,
    structureSummary,
  });

  return {
    ok: true,
    outDir: outDirRelative,
    maxFiles,
    maxFilesHit: outputSummary.truncated,
    ...auditStatusSummary,
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
    structureSummary,
    familiesIncluded: includeFamilies,
    ...(includeFiles ? { files } : {}),
    ...(includeFamilies ? { families } : {}),
  };
}
