/**
 * Read-only npm Registry client for the catalog commands (`search`, `info`).
 *
 * Everything here is explicit network, read-only: it never installs, never
 * mutates the consumer, and never touches the design-systems repository. It uses
 * native `fetch` with a timeout, strict http/https URL normalization, response
 * size limits, rejected redirects, and SRI verification for tarballs. Tarballs
 * are read and parsed in memory only.
 */

import { createHash } from "node:crypto";

import { PACKAGE_SCOPE } from "./constants.mjs";
import { isSupportedPackageName, normalizeRequestedPackage } from "./consumer.mjs";
import { validateDesignSystemManifest } from "./manifest.mjs";
import { assertExactSemver, compareSemverDesc, isExactSemver } from "./semver.mjs";
import { extractTarballFile } from "./tarball.mjs";

/** Default public npm registry. */
export const DEFAULT_REGISTRY_URL = "https://registry.npmjs.org";
/** Search text used when no query words are given (list supported styles). */
export const DEFAULT_SEARCH_TEXT = PACKAGE_SCOPE;
/** Maximum accepted `--size`. */
export const MAX_SEARCH_SIZE = 250;
/** Default search page size. */
export const DEFAULT_SEARCH_SIZE = 25;

export const REGISTRY_LIMITS = Object.freeze({
  timeoutMs: 15000,
  maxJsonBytes: 5 * 1024 * 1024,
  maxTarballBytes: 32 * 1024 * 1024,
});

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize a registry URL: http(s) only, no credentials, no query, no fragment,
 * no trailing slash. Returns the canonical base URL string.
 */
export function normalizeRegistryUrl(value) {
  const text =
    value === undefined || value === null || String(value).trim() === ""
      ? DEFAULT_REGISTRY_URL
      : String(value).trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`Invalid registry URL: ${JSON.stringify(value ?? null)}.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Registry URL must use http(s): ${text}.`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("Registry URL must not contain credentials.");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("Registry URL must not contain a query or fragment.");
  }
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${pathname}`;
}

/** Build a registry endpoint URL from the base, a path, and optional params. */
export function buildRegistryEndpoint(registry, pathname, params) {
  const base = normalizeRegistryUrl(registry);
  const url = new URL(base);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}/${pathname}`;
  url.search = "";
  if (params !== undefined && params !== null) {
    url.search = new URLSearchParams(params).toString();
  }
  return url;
}

/** Read a response body while enforcing a byte limit. */
async function readLimitedBody(response, maxBytes, href) {
  const contentLength = response.headers?.get?.("content-length");
  if (contentLength !== null && contentLength !== undefined) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(`Registry response from ${href} exceeds the size limit.`);
    }
  }
  if (response.body === null || response.body === undefined) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error(`Registry response from ${href} exceeds the size limit.`);
    }
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Registry response from ${href} exceeds the size limit.`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Fetch a URL with strict limits: http(s), no credentials, timeout, size cap,
 * and no redirects (redirect responses fail closed).
 */
export async function fetchLimited(url, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = REGISTRY_LIMITS.timeoutMs,
    maxBytes = REGISTRY_LIMITS.maxJsonBytes,
    accept = "application/json",
  } = options;
  if (typeof fetchImpl !== "function") {
    throw new Error("Global fetch is unavailable; Node.js >= 20 is required.");
  }
  const target = url instanceof URL ? url : new URL(String(url));
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error(`Registry URL must use http(s): ${target.href}.`);
  }
  if (target.username !== "" || target.password !== "") {
    throw new Error("Registry URL must not contain credentials.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(target, {
      redirect: "error",
      signal: controller.signal,
      headers: { accept },
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Registry request timed out after ${timeoutMs}ms: ${target.href}.`);
    }
    throw new Error(`Registry request failed for ${target.href}: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`Registry responded ${response.status} for ${target.href}.`);
  }
  const body = await readLimitedBody(response, maxBytes, target.href);
  return { body, response, url: target };
}

/** Fetch and parse a JSON document with the same limits as {@link fetchLimited}. */
export async function fetchJsonLimited(url, options = {}) {
  const { body, url: target } = await fetchLimited(url, options);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch (error) {
    throw new Error(`Registry returned invalid JSON for ${target.href}: ${error.message}`);
  }
}

/** Verify an npm SRI `dist.integrity` string (sha512/sha1) when present. */
export function verifySriIntegrity(data, integrity) {
  if (integrity === undefined || integrity === null || String(integrity).trim() === "") {
    return { ok: true, skipped: true };
  }
  const entries = String(integrity)
    .trim()
    .split(/\s+/)
    .map((entry) => /^(sha512|sha1)-([A-Za-z0-9+/=]+)$/.exec(entry))
    .filter((match) => match !== null);
  if (entries.length === 0) {
    throw new Error(`Unsupported dist.integrity format: ${JSON.stringify(integrity)}.`);
  }
  const tried = [];
  for (const match of entries) {
    const algorithm = match[1];
    const expected = match[2];
    const actual = createHash(algorithm).update(data).digest("base64");
    if (actual === expected) return { ok: true, algorithm };
    tried.push(algorithm);
  }
  throw new Error(`Tarball integrity mismatch (${tried.join(", ")}).`);
}

/** Map one registry search result to the allowlisted catalog shape. */
export function toCatalogEntry(object) {
  const pkg = isPlainObject(object) ? object.package : null;
  if (!isPlainObject(pkg)) return null;
  if (!isSupportedPackageName(pkg.name)) return null;
  if (!isExactSemver(pkg.version)) return null;
  return {
    name: pkg.name,
    version: pkg.version,
    description: typeof pkg.description === "string" ? pkg.description : "",
    keywords: Array.isArray(pkg.keywords)
      ? pkg.keywords.filter((keyword) => typeof keyword === "string")
      : [],
  };
}

/**
 * Read-only npm Registry search, filtered to supported `@prism-system/ui-*`
 * packages and sorted deterministically by name, then version.
 */
export async function searchRegistry({
  query,
  registry,
  size = DEFAULT_SEARCH_SIZE,
  fetchImpl,
  timeoutMs,
  maxBytes,
} = {}) {
  const registryUrl = normalizeRegistryUrl(registry);
  const words = Array.isArray(query) ? query : query === undefined ? [] : [query];
  const text = words
    .filter((word) => String(word).trim() !== "")
    .join(" ")
    .trim();
  const requestedSize = size === undefined || size === null ? DEFAULT_SEARCH_SIZE : Number(size);
  if (!Number.isInteger(requestedSize) || requestedSize < 1 || requestedSize > MAX_SEARCH_SIZE) {
    throw new Error(
      `Invalid --size ${JSON.stringify(size)}; expected an integer from 1 to ${MAX_SEARCH_SIZE}.`,
    );
  }
  const endpoint = buildRegistryEndpoint(registryUrl, "-/v1/search", {
    text: text === "" ? DEFAULT_SEARCH_TEXT : text,
    size: String(requestedSize),
  });
  const payload = await fetchJsonLimited(endpoint, { fetchImpl, timeoutMs, maxBytes });
  const objects = isPlainObject(payload) && Array.isArray(payload.objects) ? payload.objects : [];
  const results = objects
    .map(toCatalogEntry)
    .filter((entry) => entry !== null)
    .sort((a, b) => {
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      return compareSemverDesc(a.version, b.version);
    });
  return { registry: registryUrl, query: text, size: requestedSize, results };
}

/** Fetch a package packument from the registry. */
export async function fetchPackument({
  package: requested,
  registry,
  fetchImpl,
  timeoutMs,
  maxBytes,
} = {}) {
  const packageName = normalizeRequestedPackage(requested);
  const registryUrl = normalizeRegistryUrl(registry);
  const endpoint = buildRegistryEndpoint(registryUrl, encodeURIComponent(packageName));
  const packument = await fetchJsonLimited(endpoint, { fetchImpl, timeoutMs, maxBytes });
  if (!isPlainObject(packument)) {
    throw new Error(`Registry packument for ${packageName} must be a JSON object.`);
  }
  if (packument.name !== packageName) {
    throw new Error(
      `Registry packument name ${JSON.stringify(packument.name ?? null)} does not match "${packageName}".`,
    );
  }
  return { registry: registryUrl, packageName, packument };
}

/**
 * Resolve the exact version to use. An omitted version is resolved only through
 * an exact `dist-tags.latest`; an explicit version must be exact semver.
 */
export function resolvePackumentVersion(packument, requestedVersion) {
  const versions = isPlainObject(packument.versions) ? packument.versions : {};
  let version;
  if (
    requestedVersion === undefined ||
    requestedVersion === null ||
    String(requestedVersion).trim() === ""
  ) {
    const latest = isPlainObject(packument["dist-tags"])
      ? packument["dist-tags"].latest
      : undefined;
    if (typeof latest !== "string" || !isExactSemver(latest)) {
      throw new Error("Registry packument has no exact dist-tags.latest version.");
    }
    version = latest;
  } else {
    version = assertExactSemver(String(requestedVersion).trim());
  }
  const metadata = versions[version];
  if (!isPlainObject(metadata)) {
    throw new Error(`Registry has no published version ${version}.`);
  }
  if (metadata.version !== version) {
    throw new Error(
      `Registry metadata version ${JSON.stringify(metadata.version ?? null)} does not match ${version}.`,
    );
  }
  return { version, metadata };
}

/** Validate the public registry metadata required to trust a design-system version. */
export function validateRegistryMetadata({ packageName, version, metadata }) {
  const failures = [];
  if (metadata.name !== undefined && metadata.name !== packageName) {
    failures.push(
      `metadata name ${JSON.stringify(metadata.name)} does not match "${packageName}".`,
    );
  }
  if (metadata.version !== version) {
    failures.push(
      `metadata version ${JSON.stringify(metadata.version ?? null)} does not match ${version}.`,
    );
  }
  if (metadata.prismSystem?.contract !== "v2") {
    failures.push(
      `prismSystem.contract must be "v2" (received ${JSON.stringify(metadata.prismSystem?.contract ?? null)}).`,
    );
  }
  if (metadata.exports?.["./manifest"] !== "./design-system.json") {
    failures.push(
      `exports["./manifest"] must be "./design-system.json" (received ${JSON.stringify(metadata.exports?.["./manifest"] ?? null)}).`,
    );
  }
  if (failures.length > 0) {
    throw new Error(
      `Unsupported registry metadata for "${packageName}@${version}": ${failures.join(" ")}`,
    );
  }
}

/** Validate the shipped manifest identity, version, contract, schema, and shape. */
export function validateManifestShape(manifest, { packageName, version }) {
  if (!isPlainObject(manifest)) {
    throw new Error("Registry manifest must be a JSON object.");
  }
  return validateDesignSystemManifest(manifest, {
    packageName,
    version,
    label: ` for "${packageName}@${version}"`,
  });
}

/** Download and verify a tarball, returning its bytes (in memory only). */
export async function downloadTarball({ tarball, integrity, fetchImpl, timeoutMs, maxBytes } = {}) {
  if (typeof tarball !== "string" || tarball.trim() === "") {
    throw new Error("Registry metadata is missing dist.tarball.");
  }
  let url;
  try {
    url = new URL(tarball);
  } catch {
    throw new Error(`Invalid dist.tarball URL: ${JSON.stringify(tarball)}.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`dist.tarball must use http(s): ${tarball}.`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("dist.tarball must not contain credentials.");
  }
  const { body } = await fetchLimited(url, {
    fetchImpl,
    timeoutMs,
    maxBytes: maxBytes ?? REGISTRY_LIMITS.maxTarballBytes,
    accept: "application/octet-stream",
  });
  verifySriIntegrity(body, integrity);
  return body;
}

/**
 * Resolve, validate, download, and read a design system's manifest from the
 * registry. Read-only; never writes to disk.
 */
export async function fetchDesignSystemInfo({
  package: requested,
  version,
  registry,
  fetchImpl,
  timeoutMs,
  maxBytes,
  maxTarballBytes,
} = {}) {
  const {
    registry: registryUrl,
    packageName,
    packument,
  } = await fetchPackument({
    package: requested,
    registry,
    fetchImpl,
    timeoutMs,
    maxBytes,
  });
  const { version: resolvedVersion, metadata } = resolvePackumentVersion(packument, version);
  validateRegistryMetadata({ packageName, version: resolvedVersion, metadata });
  const tarball = await downloadTarball({
    tarball: metadata.dist?.tarball,
    integrity: metadata.dist?.integrity,
    fetchImpl,
    timeoutMs,
    maxBytes: maxTarballBytes,
  });
  const manifestText = extractTarballFile(tarball, "package/design-system.json");
  let manifest;
  try {
    manifest = JSON.parse(manifestText.toString("utf8"));
  } catch (error) {
    throw new Error(`Registry manifest is not valid JSON: ${error.message}`);
  }
  validateManifestShape(manifest, { packageName, version: resolvedVersion });
  return { package: packageName, version: resolvedVersion, registry: registryUrl, manifest };
}

/** Build the stable, allowlisted `info --json` object (includes the full manifest). */
export function buildInfoResult(info) {
  const design = isPlainObject(info.manifest.design) ? info.manifest.design : {};
  return {
    package: info.package,
    version: info.version,
    name: info.manifest.name,
    design: {
      density: typeof design.density === "string" ? design.density : null,
      theme: typeof design.theme === "string" ? design.theme : null,
      radius: typeof design.radius === "string" ? design.radius : null,
      keywords: Array.isArray(design.keywords)
        ? design.keywords.filter((keyword) => typeof keyword === "string")
        : [],
    },
    components: info.manifest.components,
    rules: info.manifest.rules,
    manifest: info.manifest,
  };
}

/** Build the stable, allowlisted `search --json` payload. */
export function buildSearchResult(result) {
  return {
    registry: result.registry,
    query: result.query,
    size: result.size,
    results: result.results,
  };
}
