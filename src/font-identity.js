import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { FONT_EXTENSIONS } from './catalogs.js';
import { stableStringify } from './stable-json.js';

const require = createRequire(import.meta.url);
const woff2Decompress = require('wawoff2/decompress');
const woff2Compress = require('wawoff2/compress');

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

function parseWoffNameTable(nameTableBuf) {
  return readFontNameTableRecords(nameTableBuf);
}

function readFontFamilyNameFromWoff(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);

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
          const nameTable = buffer.slice(compOffset, compOffset + origLength);
          return parseWoffNameTable(nameTable).get(1) || null;
        }
        return null;
      }
    }
  }

  if (magic === 0x774F4632) return null;

  return null;
}

function normalizeIdentityName(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized || null;
}

export function extractFontIdentity(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);
  if (magic === 0x774F4646 || magic === 0x774F4632) {
    const family = normalizeIdentityName(readFontFamilyNameFromWoff(buffer));
    return {
      family,
      subfamily: null,
      typographicFamily: null,
      typographicSubfamily: null,
      opentypeFamily: family,
      opentypeSubfamily: null,
      fullName: null,
      postscriptName: null,
    };
  }
  const records = readFontNameRecords(buffer);
  const typographicFamily = normalizeIdentityName(records.get(16));
  const typographicSubfamily = normalizeIdentityName(records.get(17));
  const opentypeFamily = normalizeIdentityName(records.get(1));
  const opentypeSubfamily = normalizeIdentityName(records.get(2));
  return {
    family: typographicFamily || opentypeFamily,
    subfamily: typographicSubfamily || opentypeSubfamily,
    typographicFamily,
    typographicSubfamily,
    opentypeFamily,
    opentypeSubfamily,
    fullName: normalizeIdentityName(records.get(4)),
    postscriptName: normalizeIdentityName(records.get(6)),
  };
}

export function buildFontIdentityKey(buffer) {
  const identity = extractFontIdentity(buffer);
  if (identity.typographicFamily && identity.typographicSubfamily) {
    return stableStringify({
      basis: 'typographic-family-subfamily',
      family: identity.typographicFamily,
      subfamily: identity.typographicSubfamily,
      nameIds: [16, 17],
    });
  }
  if (identity.opentypeFamily && identity.opentypeSubfamily) {
    return stableStringify({
      basis: 'opentype-family-subfamily',
      family: identity.opentypeFamily,
      subfamily: identity.opentypeSubfamily,
      nameIds: [1, 2],
    });
  }
  if (identity.fullName) {
    return stableStringify({
      basis: 'full-name',
      fullName: identity.fullName,
      nameIds: [4],
    });
  }
  if (identity.postscriptName) {
    return stableStringify({
      basis: 'postscript-name',
      postscriptName: identity.postscriptName,
      nameIds: [6],
    });
  }
  if (identity.typographicFamily) {
    return stableStringify({
      basis: 'typographic-family',
      family: identity.typographicFamily,
      nameIds: [16],
    });
  }
  if (identity.opentypeFamily) {
    return stableStringify({
      basis: 'opentype-family',
      family: identity.opentypeFamily,
      nameIds: [1],
    });
  }
  return null;
}

export function extractFontFamily(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);

  if (magic === 0x774F4646 || magic === 0x774F4632) {
    return readFontFamilyNameFromWoff(buffer);
  }

  return readFontFamilyName(buffer);
}

export async function buildBatchDedupeIdentity(file) {
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

export function detectFontContainer(buffer) {
  if (buffer.byteLength < 4) return 'unknown';
  const magic = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0);
  if (magic === 0x00010000) return 'ttf';
  if (magic === 0x4F54544F) return 'otf-cff';
  if (magic === 0x74746366) return 'collection';
  if (magic === 0x774F4646) return 'woff';
  if (magic === 0x774F4632) return 'woff2';
  return 'unknown';
}

export function parseIdentityKey(identityKey) {
  if (!identityKey) return null;
  try {
    return JSON.parse(identityKey);
  } catch {
    return null;
  }
}

export function decompressWoff1(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const signature = view.getUint32(0);
  if (signature !== 0x774F4646) return buffer;

  const sfntFlavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  const totalSfntSize = view.getUint32(16);

  const sfntHeaderSize = 12 + numTables * 16;
  const sfnt = new Uint8Array(totalSfntSize);
  const sfntView = new DataView(sfnt.buffer);

  sfntView.setUint32(0, sfntFlavor);
  sfntView.setUint16(4, numTables);
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

    const recordOffset = 12 + i * 16;
    sfntView.setUint32(recordOffset, tag);
    sfntView.setUint32(recordOffset + 4, origChecksum);
    sfntView.setUint32(recordOffset + 8, dataOffset);
    sfntView.setUint32(recordOffset + 12, origLength);

    sfnt.set(tableData instanceof Uint8Array ? tableData : new Uint8Array(tableData), dataOffset);

    dataOffset += origLength;
    while (dataOffset % 4 !== 0) dataOffset++;
  }

  return new Uint8Array(sfnt.buffer, 0, dataOffset);
}

export async function decompressWoff2(buffer) {
  const result = await woff2Decompress(Buffer.from(buffer));
  return new Uint8Array(result);
}

export async function compressWoff2(buffer) {
  const result = await woff2Compress(Buffer.from(buffer));
  return new Uint8Array(result);
}

export function inspectOversizedKern(buffer, thresholdRatio = 0.8) {
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

export function stripOversizedKern(buffer) {
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

export function getGlyphCount(buffer) {
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
