/**
 * The handwritten typography contract (DS-5).
 *
 * A design-system consumer can only rely on the handwriting token and the
 * `Text` variant if the bundled WOFF2 subsets really cover Russian, English,
 * and digits. This test reads the shipped font bytes and checks their cmap
 * tables directly, so a broken or Latin-only subset fails before release.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { brotliDecompressSync } from "node:zlib";

const packageRoot = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const fontsDirectory = join(packageRoot, "src", "fonts");

/** WOFF2 known table tags, indexed by the flags tag value (spec section 5.1). */
const KNOWN_TAGS = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
];

function readUIntBase128(buffer, state) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const byte = buffer[state.offset];
    state.offset += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error("invalid WOFF2 UIntBase128 value");
}

function readWoff2Tables(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "wOF2") throw new Error("not a WOFF2 file");
  const numTables = buffer.readUInt16BE(12);
  const totalCompressedSize = buffer.readUInt32BE(20);
  const state = { offset: 48 };
  const entries = [];
  for (let index = 0; index < numTables; index += 1) {
    const flags = buffer[state.offset];
    state.offset += 1;
    const tagIndex = flags & 0x3f;
    const transformVersion = (flags >> 6) & 0x03;
    let tag;
    if (tagIndex === 0x3f) {
      tag = buffer.toString("ascii", state.offset, state.offset + 4);
      state.offset += 4;
    } else {
      tag = KNOWN_TAGS[tagIndex];
    }
    const origLength = readUIntBase128(buffer, state);
    const transformed =
      tag === "glyf" || tag === "loca" ? transformVersion !== 3 : transformVersion !== 0;
    const transformLength = transformed ? readUIntBase128(buffer, state) : null;
    entries.push({ tag, origLength, transformLength });
  }
  const decompressed = brotliDecompressSync(
    buffer.subarray(state.offset, state.offset + totalCompressedSize),
  );
  const tables = new Map();
  let cursor = 0;
  for (const entry of entries) {
    const length = entry.transformLength ?? entry.origLength;
    tables.set(entry.tag, decompressed.subarray(cursor, cursor + length));
    cursor += length;
  }
  return tables;
}

function readCmapCodepoints(cmap) {
  const supported = new Set();
  const numTables = cmap.readUInt16BE(2);
  for (let index = 0; index < numTables; index += 1) {
    const platform = cmap.readUInt16BE(4 + index * 8);
    const encoding = cmap.readUInt16BE(6 + index * 8);
    const subtable = cmap.readUInt32BE(8 + index * 8);
    const isUnicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!isUnicode) continue;
    const format = cmap.readUInt16BE(subtable);
    if (format === 4) {
      const segCountX2 = cmap.readUInt16BE(subtable + 6);
      const segCount = segCountX2 / 2;
      const endCodes = subtable + 14;
      const startCodes = endCodes + segCountX2 + 2;
      const idDeltas = startCodes + segCountX2;
      const idRangeOffsets = idDeltas + segCountX2;
      for (let segment = 0; segment < segCount; segment += 1) {
        const end = cmap.readUInt16BE(endCodes + segment * 2);
        const start = cmap.readUInt16BE(startCodes + segment * 2);
        const delta = cmap.readInt16BE(idDeltas + segment * 2);
        const rangeOffsetPosition = idRangeOffsets + segment * 2;
        const rangeOffset = cmap.readUInt16BE(rangeOffsetPosition);
        for (let code = start; code <= end && code < 0xffff; code += 1) {
          let glyph;
          if (rangeOffset === 0) {
            glyph = (code + delta) & 0xffff;
          } else {
            const glyphPosition = rangeOffsetPosition + rangeOffset + (code - start) * 2;
            if (glyphPosition + 2 > cmap.length) continue;
            glyph = cmap.readUInt16BE(glyphPosition);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) supported.add(code);
        }
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(subtable + 12);
      for (let group = 0; group < groups; group += 1) {
        const record = subtable + 16 + group * 12;
        const start = cmap.readUInt32BE(record);
        const end = cmap.readUInt32BE(record + 4);
        for (let code = start; code <= end; code += 1) supported.add(code);
      }
    }
  }
  return supported;
}

function readFamilyCoverage(prefix) {
  const subsetFiles = [
    "latin.woff2",
    "latin-ext.woff2",
    "cyrillic.woff2",
    "cyrillic-ext.woff2",
  ].map((subset) => join(fontsDirectory, `${prefix}-${subset}`));
  const supported = new Set();
  for (const file of subsetFiles) {
    const tables = readWoff2Tables(readFileSync(file));
    const cmap = tables.get("cmap");
    assert.ok(cmap, `${file} contains a cmap table`);
    for (const code of readCmapCodepoints(cmap)) supported.add(code);
  }
  return { files: subsetFiles, supported };
}

const LATIN = Array.from({ length: 26 }, (_, index) => 0x41 + index).concat(
  Array.from({ length: 26 }, (_, index) => 0x61 + index),
);
const CYRILLIC = Array.from({ length: 32 }, (_, index) => 0x410 + index).concat([0x401, 0x451]);
const DIGITS = Array.from({ length: 10 }, (_, index) => 0x30 + index);

test("the self-hosted handwriting family covers Cyrillic, Latin, and digits", () => {
  const { files, supported } = readFamilyCoverage("caveat");
  assert.equal(files.length, 4, "all four Caveat subsets are packaged");
  const missing = (codes) =>
    codes.filter((code) => !supported.has(code)).map((code) => `U+${code.toString(16)}`);
  assert.deepEqual(missing(LATIN), [], "Latin letters are covered");
  assert.deepEqual(missing(CYRILLIC), [], "Cyrillic letters are covered");
  assert.deepEqual(missing(DIGITS), [], "digits are covered");
});

test("fonts.css declares the Caveat subsets and the token exposes the family", () => {
  const css = readFileSync(join(packageRoot, "src", "styles", "fonts.css"), "utf8");
  for (const subset of ["latin", "latin-ext", "cyrillic", "cyrillic-ext"]) {
    assert.match(
      css,
      new RegExp(
        `@font-face \\{[^}]*font-family: "Caveat";[^}]*url\\("\\.\\./fonts/caveat-${subset}\\.woff2"\\)`,
        "s",
      ),
      `fonts.css declares the Caveat ${subset} subset`,
    );
  }
  const tokens = readFileSync(join(packageRoot, "tokens.source.json"), "utf8");
  assert.match(tokens, /"handwriting": "Caveat, \\"Segoe Print\\", cursive"/);
});
