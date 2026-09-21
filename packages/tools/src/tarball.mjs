/**
 * Minimal in-memory gzip/tar reader for npm package tarballs.
 *
 * It is deliberately small and strict: it handles ustar/GNU long-name entries,
 * enforces per-entry and total size limits, rejects path traversal and absolute
 * paths, validates header checksums, and never writes to disk. It extracts only
 * the requested file (in memory) — by contract only `package/design-system.json`.
 */

import { gunzipSync } from "node:zlib";

const BLOCK_SIZE = 512;

export const TARBALL_LIMITS = Object.freeze({
  maxEntries: 4096,
  maxFileBytes: 8 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxUncompressedBytes: 128 * 1024 * 1024,
});

function readString(buffer, offset, length) {
  const slice = buffer.subarray(offset, offset + length);
  let end = slice.length;
  for (let index = 0; index < slice.length; index += 1) {
    if (slice[index] === 0) {
      end = index;
      break;
    }
  }
  return slice.subarray(0, end).toString("utf8");
}

function parseOctal(field, label) {
  const text = field.replace(/\0/g, "").trim();
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text)) {
    throw new Error(`Malformed tar header: ${label} is not octal.`);
  }
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Malformed tar header: ${label} is out of range.`);
  }
  return value;
}

function isZeroBlock(block) {
  for (const byte of block) {
    if (byte !== 0) return false;
  }
  return true;
}

function verifyChecksum(header) {
  const expected = parseOctal(readString(header, 148, 8), "checksum");
  let sum = 0;
  for (let index = 0; index < BLOCK_SIZE; index += 1) {
    sum += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (sum !== expected) {
    throw new Error("Malformed tar header: checksum mismatch.");
  }
}

/** Normalize and validate a tar entry path; rejects absolute/traversal paths. */
export function normalizeTarPath(rawPath) {
  const text = rawPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (text.startsWith("/") || /^[A-Za-z]:/.test(text)) {
    throw new Error(`Unsafe tar entry path (absolute): ${rawPath}.`);
  }
  const segments = text.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.some((segment) => segment === "..")) {
    throw new Error(`Unsafe tar entry path (traversal): ${rawPath}.`);
  }
  return segments.join("/");
}

/**
 * Parse an uncompressed tar buffer into `{ path, size, data }` regular files.
 * Throws on malformed headers, unsafe paths, or size-limit violations.
 */
export function parseTar(buffer, options = {}) {
  const limits = { ...TARBALL_LIMITS, ...options };
  const entries = [];
  let offset = 0;
  let total = 0;
  let pendingLongName = null;

  while (offset + BLOCK_SIZE <= buffer.length) {
    const header = buffer.subarray(offset, offset + BLOCK_SIZE);
    if (isZeroBlock(header)) break;
    verifyChecksum(header);

    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const size = parseOctal(readString(header, 124, 12), "size");
    const typeFlag = header[156];
    const dataStart = offset + BLOCK_SIZE;
    const paddedSize = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
    const dataEnd = dataStart + paddedSize;
    if (dataEnd > buffer.length) {
      throw new Error("Malformed tar: entry extends past the end of the archive.");
    }

    if (typeFlag === 0x4c /* 'L' GNU long name */) {
      pendingLongName = buffer
        .subarray(dataStart, dataStart + size)
        .toString("utf8")
        .replace(/\0.*$/s, "");
      offset = dataEnd;
      continue;
    }

    if (typeFlag === 0x78 /* 'x' pax extended header */ || typeFlag === 0x67 /* 'g' */) {
      offset = dataEnd;
      continue;
    }

    const rawName = pendingLongName ?? (prefix.length > 0 ? `${prefix}/${name}` : name);
    pendingLongName = null;

    const isDirectory = typeFlag === 0x35; /* '5' */
    const isFile = typeFlag === 0x30 /* '0' */ || typeFlag === 0x00;
    if (isFile) {
      if (size > limits.maxFileBytes) {
        throw new Error(`Tar entry ${rawName} exceeds the per-file size limit.`);
      }
      total += size;
      if (total > limits.maxTotalBytes) {
        throw new Error("Tar archive exceeds the total size limit.");
      }
      if (entries.length >= limits.maxEntries) {
        throw new Error("Tar archive exceeds the entry count limit.");
      }
      entries.push({
        path: normalizeTarPath(rawName),
        size,
        data: buffer.subarray(dataStart, dataStart + size),
      });
    } else if (!isDirectory) {
      // Skip links, devices, and other non-regular entries.
    }

    offset = dataEnd;
  }

  return entries;
}

/**
 * Decompress a gzip buffer and extract a single file by normalized path.
 * Throws when the gzip is malformed, the file is missing, or limits are hit.
 */
export function extractTarballFile(buffer, targetPath, options = {}) {
  const limits = { ...TARBALL_LIMITS, ...options };
  let raw;
  try {
    raw = gunzipSync(buffer, { maxOutputLength: limits.maxUncompressedBytes });
  } catch (error) {
    throw new Error(`Malformed tarball gzip: ${error.message}`);
  }
  const wanted = normalizeTarPath(targetPath);
  const entries = parseTar(raw, limits);
  const found = entries.find((entry) => entry.path === wanted);
  if (found === undefined) {
    throw new Error(`Tarball is missing ${wanted}.`);
  }
  return found.data;
}
