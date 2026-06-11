#!/usr/bin/env node
import http from 'node:http';
import https from 'node:https';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const WASM_FILE = 'libffi-wasm32-wasip1.wasm';
const LATEST_RELEASE_URL = 'https://ungh.cc/repos/KonghaYao/cn-font-split/releases/latest';
const MAX_REDIRECTS = 5;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cnFontSplitRoot = join(projectRoot, 'node_modules', 'cn-font-split');
const cnFontSplitPackageJson = join(cnFontSplitRoot, 'package.json');
const outputDir = join(cnFontSplitRoot, 'dist');
const outputPath = join(outputDir, WASM_FILE);
const force = process.argv.includes('--force') || process.env.CN_FONT_SPLIT_WASM_FORCE === '1';

function isRedirect(statusCode) {
  return [301, 302, 303, 307, 308].includes(statusCode);
}

function getArgValue(name) {
  const prefixed = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefixed));
  if (match) {
    return match.slice(prefixed.length);
  }

  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }

  return null;
}

async function fileExists(path) {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function assertFile(path, label) {
  const stats = await stat(path);
  if (!stats.isFile() || stats.size === 0) {
    throw new Error(`${label} is missing or empty: ${path}`);
  }
  return stats;
}

async function readTextUrl(url, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error(`Too many redirects while requesting ${url}`);
  }

  const client = url.startsWith('https:') ? https : http;

  return await new Promise((resolvePromise, rejectPromise) => {
    const request = client.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'mcp-font-split-wasm-installer'
        }
      },
      (response) => {
        if (isRedirect(response.statusCode) && response.headers.location) {
          response.resume();
          const nextUrl = new URL(response.headers.location, url).toString();
          readTextUrl(nextUrl, redirectCount + 1).then(resolvePromise, rejectPromise);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          rejectPromise(new Error(`HTTP ${response.statusCode} while requesting ${url}`));
          return;
        }

        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolvePromise(body));
      }
    );

    request.on('error', rejectPromise);
    request.setTimeout(30000, () => {
      request.destroy(new Error(`Timed out while requesting ${url}`));
    });
  });
}

async function downloadFile(url, destination, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error(`Too many redirects while downloading ${url}`);
  }

  const client = url.startsWith('https:') ? https : http;

  await new Promise((resolvePromise, rejectPromise) => {
    const request = client.get(
      url,
      {
        headers: {
          'User-Agent': 'mcp-font-split-wasm-installer'
        }
      },
      (response) => {
        if (isRedirect(response.statusCode) && response.headers.location) {
          response.resume();
          const nextUrl = new URL(response.headers.location, url).toString();
          downloadFile(nextUrl, destination, redirectCount + 1).then(resolvePromise, rejectPromise);
          return;
        }

        if (response.statusCode !== 200) {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            if (body.length < 1000) {
              body += chunk;
            }
          });
          response.on('end', () => {
            rejectPromise(new Error(`HTTP ${response.statusCode} while downloading ${url}: ${body}`));
          });
          return;
        }

        const file = createWriteStream(destination);
        response.pipe(file);
        file.on('finish', () => file.close(resolvePromise));
        file.on('error', rejectPromise);
      }
    );

    request.on('error', rejectPromise);
    request.setTimeout(30000, () => {
      request.destroy(new Error(`Timed out while downloading ${url}`));
    });
  });
}

async function readCnFontSplitPackageVersion() {
  const packageJson = JSON.parse(await readFile(cnFontSplitPackageJson, 'utf8'));
  return packageJson.version || 'unknown';
}

async function resolveReleaseVersion() {
  const pinnedVersion = getArgValue('--version') || process.env.CN_FONT_SPLIT_WASM_VERSION;
  if (pinnedVersion) {
    return pinnedVersion;
  }

  const latestReleaseJson = JSON.parse(await readTextUrl(LATEST_RELEASE_URL));
  if (!latestReleaseJson.release || !latestReleaseJson.release.tag) {
    throw new Error(`Unable to resolve latest cn-font-split release from ${LATEST_RELEASE_URL}`);
  }
  return latestReleaseJson.release.tag;
}

async function main() {
  await assertFile(cnFontSplitPackageJson, 'cn-font-split package.json');

  if (!force && await fileExists(outputPath)) {
    console.log(`${WASM_FILE} already exists at ${outputPath}`);
    console.log('Use npm run install:wasm -- --force to download it again.');
    return;
  }

  const packageVersion = await readCnFontSplitPackageVersion();
  const releaseVersion = await resolveReleaseVersion();
  const ghHost = process.env.CN_FONT_SPLIT_GH_HOST || 'https://github.com';
  const downloadUrl = `${ghHost}/KonghaYao/cn-font-split/releases/download/${releaseVersion}/${WASM_FILE}`;
  const tempPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  const backupPath = `${outputPath}.${process.pid}.${Date.now()}.backup`;
  const hadExistingWasm = await fileExists(outputPath);

  await mkdir(outputDir, { recursive: true });
  if (hadExistingWasm) {
    await copyFile(outputPath, backupPath);
  }

  console.log(`Installed cn-font-split package version: ${packageVersion}`);
  console.log(`Downloading cn-font-split WASM release: ${releaseVersion}`);
  console.log(downloadUrl);

  try {
    await downloadFile(downloadUrl, tempPath);
    const stats = await assertFile(tempPath, WASM_FILE);
    await rename(tempPath, outputPath);
    console.log(`Installed ${WASM_FILE} (${stats.size} bytes) at ${outputPath}`);
  } catch (error) {
    await rm(tempPath, { force: true });
    if (hadExistingWasm) {
      await copyFile(backupPath, outputPath);
      console.error(`Restored previous ${WASM_FILE} after installer failure.`);
    }
    throw error;
  } finally {
    await rm(backupPath, { force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
