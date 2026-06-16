import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { StaticWasm } from 'cn-font-split/dist/wasm/index.mjs';
import { FONT_EXTENSIONS } from './catalogs.js';
import {
  PROJECT_ROOT,
  pathStatus,
  workspaceRoot,
} from './path-utils.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const CN_FONT_SPLIT_PACKAGE_JSON = path.resolve(PROJECT_ROOT, 'node_modules/cn-font-split/package.json');
const CN_FONT_SPLIT_VERSION_FILE = path.resolve(PROJECT_ROOT, 'node_modules/cn-font-split/dist/version');

export const PACKAGE_VERSION = packageJson.version;

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

export async function getWasmRuntime() {
  const runtimePath = getWasmRuntimePath();
  if (!wasmRuntimePromise) {
    wasmRuntimePromise = (async () => {
      const wasmBuffer = await fs.readFile(runtimePath);
      return new StaticWasm(wasmBuffer);
    })();
  }
  return wasmRuntimePromise;
}

export function resetWasmRuntime() {
  wasmRuntimePromise = null;
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
