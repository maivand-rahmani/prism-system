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

import {
  COMPONENT_NAMES,
  CONTRACT_VERSION,
  OPTIONAL_COMPONENTS,
  PACKAGE_SCOPE,
  REQUIRED_COMPONENTS,
} from "./constants.mjs";
import { buildExtensionCatalogEntries } from "./components.mjs";
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
/** Default result cap when listing every package in the supported scope. */
export const DEFAULT_LIST_SIZE = MAX_SEARCH_SIZE;
/**
 * Public npm replication database. The public registry intentionally does not
 * expose `_all_docs`; the replication database does, and it is a complete,
 * sorted key range rather than a ranked search index.
 */
export const PUBLIC_REPLICATION_REGISTRY_URL = "https://replicate.npmjs.com/registry";
/** Maximum package names read from one replication page. */
const SCOPE_PAGE_SIZE = 1000;
/** Maximum concurrent packument reads while listing a scope. */
const SCOPE_PACKUMENT_CONCURRENCY = 6;
/**
 * Optional scope-index requests fail over to ranked search after this bound so
 * a blocked replication host never delays the command for the full registry
 * timeout.
 */
const SCOPE_INDEX_TIMEOUT_MS = 5000;

export const REGISTRY_LIMITS = Object.freeze({
  timeoutMs: 15000,
  maxJsonBytes: 5 * 1024 * 1024,
  maxTarballBytes: 32 * 1024 * 1024,
});

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate `--size` against the shared 1..250 contract. */
function normalizeSearchSize(size, fallback) {
  const value = size === undefined || size === null ? fallback : Number(size);
  if (!Number.isInteger(value) || value < 1 || value > MAX_SEARCH_SIZE) {
    throw new Error(
      `Invalid --size ${JSON.stringify(size)}; expected an integer from 1 to ${MAX_SEARCH_SIZE}.`,
    );
  }
  return value;
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
 * Map one latest packument document to the allowlisted catalog shape.
 *
 * Only the exact `dist-tags.latest` release is reported; a package without an
 * exact latest version is skipped rather than guessed.
 */
export function toCatalogEntryFromPackument(packument) {
  if (!isPlainObject(packument) || !isSupportedPackageName(packument.name)) return null;
  const distTags = isPlainObject(packument["dist-tags"]) ? packument["dist-tags"] : {};
  const version = distTags.latest;
  if (!isExactSemver(version)) return null;
  const versions = isPlainObject(packument.versions) ? packument.versions : {};
  const metadata = isPlainObject(versions[version]) ? versions[version] : null;
  if (metadata === null || metadata.version !== version) return null;
  if (metadata.name !== undefined && metadata.name !== packument.name) return null;
  const description =
    typeof metadata.description === "string"
      ? metadata.description
      : typeof packument.description === "string"
        ? packument.description
        : "";
  const keywords = Array.isArray(metadata.keywords)
    ? metadata.keywords
    : Array.isArray(packument.keywords)
      ? packument.keywords
      : [];
  return {
    name: packument.name,
    version,
    description,
    keywords: keywords.filter((keyword) => typeof keyword === "string"),
  };
}

/**
 * Build the registry endpoint used to enumerate every name in the supported
 * scope. The public npm registry uses its replication database; a custom
 * registry is probed on the same CouchDB-compatible path.
 */
export function buildScopeEndpoint(registry, params) {
  const registryUrl = normalizeRegistryUrl(registry);
  const base = registryUrl === DEFAULT_REGISTRY_URL ? PUBLIC_REPLICATION_REGISTRY_URL : registryUrl;
  return buildRegistryEndpoint(base, "_all_docs", params);
}

/**
 * Enumerate every supported package name in the configured registry's scope.
 *
 * The ranked `-/v1/search` index is not a complete directory (a newly published
 * package can be missing for days). The npm replication `_all_docs` key range
 * is complete and sorted, so it is the primary listing source. Callers fall
 * back to ranked search when a registry does not expose it.
 */
export async function listScopePackageNames({ registry, fetchImpl, timeoutMs, maxBytes } = {}) {
  const registryUrl = normalizeRegistryUrl(registry);
  const names = new Set();
  let startkey = PACKAGE_SCOPE;
  for (;;) {
    const endpoint = buildScopeEndpoint(registryUrl, {
      startkey: JSON.stringify(startkey),
      endkey: JSON.stringify(`${PACKAGE_SCOPE}\ufff0`),
      limit: String(SCOPE_PAGE_SIZE),
    });
    const payload = await fetchJsonLimited(endpoint, {
      fetchImpl,
      timeoutMs:
        typeof timeoutMs === "number"
          ? timeoutMs
          : Math.min(REGISTRY_LIMITS.timeoutMs, SCOPE_INDEX_TIMEOUT_MS),
      maxBytes,
    });
    if (!isPlainObject(payload) || !Array.isArray(payload.rows)) {
      throw new Error(
        `Registry scope index at ${endpoint.origin}${endpoint.pathname} did not return an ` +
          "_all_docs rows array.",
      );
    }
    let added = 0;
    let lastId = null;
    for (const row of payload.rows) {
      if (!isPlainObject(row) || typeof row.id !== "string") continue;
      lastId = row.id;
      if (!isSupportedPackageName(row.id) || names.has(row.id)) continue;
      names.add(row.id);
      added += 1;
    }
    if (
      payload.rows.length < SCOPE_PAGE_SIZE ||
      added === 0 ||
      lastId === null ||
      lastId === startkey
    ) {
      break;
    }
    startkey = lastId;
  }
  return [...names].sort();
}

/**
 * Resolve a one-token query to a supported package name for a direct packument
 * lookup. Multi-word descriptive queries are never reinterpreted as ids.
 */
function exactQueryPackageName(text) {
  if (typeof text !== "string" || text === "" || /\s/.test(text)) return null;
  try {
    return normalizeRequestedPackage(text);
  } catch {
    return null;
  }
}

/** Read one package's latest exact release through its packument. */
async function fetchLatestCatalogEntry({ packageName, registry, fetchImpl, timeoutMs, maxBytes }) {
  const { packument } = await fetchPackument({
    package: packageName,
    registry,
    fetchImpl,
    timeoutMs,
    maxBytes,
  });
  return toCatalogEntryFromPackument(packument);
}

/**
 * Read every supported design system by enumerating the scope, then reading
 * each package's latest packument. Deterministic by name, then version.
 *
 * A package that disappears between enumeration and its packument read is
 * reported in `warnings` instead of hiding the rest of the catalog. If no
 * package can be read at all, the caller may still fall back to ranked search.
 */
export async function listRegistryDesignSystems({
  registry,
  size,
  fetchImpl,
  timeoutMs,
  maxBytes,
} = {}) {
  const registryUrl = normalizeRegistryUrl(registry);
  const requestedSize = normalizeSearchSize(size, DEFAULT_LIST_SIZE);
  const names = await listScopePackageNames({
    registry: registryUrl,
    fetchImpl,
    timeoutMs,
    maxBytes,
  });
  const selected = names.slice(0, requestedSize);
  const results = new Array(selected.length);
  const warnings = [];
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= selected.length) return;
      const packageName = selected[index];
      try {
        const entry = await fetchLatestCatalogEntry({
          packageName,
          registry: registryUrl,
          fetchImpl,
          timeoutMs,
          maxBytes,
        });
        if (entry === null) {
          warnings.push(`${packageName} has no exact latest release.`);
          continue;
        }
        results[index] = entry;
      } catch (error) {
        warnings.push(`${packageName}: ${error.message}`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SCOPE_PACKUMENT_CONCURRENCY, selected.length) }, worker),
  );
  const entries = results.filter((entry) => entry !== null);
  if (entries.length === 0 && warnings.length > 0) {
    throw new Error(`No supported design-system release could be read: ${warnings.join(" ")}`);
  }
  entries.sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return compareSemverDesc(a.version, b.version);
  });
  return {
    registry: registryUrl,
    query: "",
    size: requestedSize,
    source: "scope-index",
    warnings,
    results: entries,
  };
}

/** Read-only ranked npm Registry search with the shared result contract. */
async function searchRegistryByText({
  registry,
  text,
  query = text,
  size,
  fetchImpl,
  timeoutMs,
  maxBytes,
}) {
  const registryUrl = normalizeRegistryUrl(registry);
  const requestedSize = normalizeSearchSize(size, DEFAULT_SEARCH_SIZE);
  const endpoint = buildRegistryEndpoint(registryUrl, "-/v1/search", {
    text,
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
  return {
    registry: registryUrl,
    query,
    size: requestedSize,
    source: "search",
    warnings: [],
    results,
  };
}

/**
 * Read-only npm Registry listing/search, filtered to supported
 * `@prism-system/ui-*` packages and sorted deterministically by name, then
 * version.
 *
 * An omitted query lists the complete scope through the replication key range;
 * a one-token package name or id is resolved directly through its packument;
 * any other query uses ranked registry search. If the scope index or direct
 * packument is unavailable, the command falls back to ranked search rather
 * than failing.
 */
export async function searchRegistry({
  query,
  registry,
  size,
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
  const requestedSize = normalizeSearchSize(
    size,
    text === "" ? DEFAULT_LIST_SIZE : DEFAULT_SEARCH_SIZE,
  );
  if (text === "") {
    try {
      return await listRegistryDesignSystems({
        registry: registryUrl,
        size: requestedSize,
        fetchImpl,
        timeoutMs,
        maxBytes,
      });
    } catch (listingError) {
      try {
        return await searchRegistryByText({
          registry: registryUrl,
          text: DEFAULT_SEARCH_TEXT,
          query: "",
          size: requestedSize,
          fetchImpl,
          timeoutMs,
          maxBytes,
        });
      } catch (searchError) {
        throw new Error(
          `Scope listing failed (${listingError.message}); fallback ranked search also failed ` +
            `(${searchError.message}).`,
        );
      }
    }
  }
  const exactPackage = exactQueryPackageName(text);
  if (exactPackage !== null) {
    try {
      const entry = await fetchLatestCatalogEntry({
        packageName: exactPackage,
        registry: registryUrl,
        fetchImpl,
        timeoutMs,
        maxBytes,
      });
      if (entry !== null) {
        return {
          registry: registryUrl,
          query: text,
          size: requestedSize,
          source: "exact",
          warnings: [],
          results: [entry],
        };
      }
    } catch {
      // A one-token descriptive query is not an error; fall through to ranked
      // search when the direct packument does not exist or cannot be read.
    }
  }
  return searchRegistryByText({
    registry: registryUrl,
    text,
    size: requestedSize,
    fetchImpl,
    timeoutMs,
    maxBytes,
  });
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
  if (metadata.prismSystem?.contractVersion !== CONTRACT_VERSION) {
    failures.push(
      `prismSystem.contractVersion must be the numeric ${CONTRACT_VERSION} (received ${JSON.stringify(
        metadata.prismSystem?.contractVersion ?? null,
      )}).`,
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
  // The registry metadata contract and the shipped manifest's contract metadata
  // must agree; a mismatch fails closed.
  const declaredContractVersion = metadata.prismSystem?.contractVersion;
  if (
    declaredContractVersion !== undefined &&
    declaredContractVersion !== manifest.contractVersion
  ) {
    throw new Error(
      `Registry metadata contractVersion ${JSON.stringify(
        declaredContractVersion,
      )} does not match the shipped manifest contractVersion ${JSON.stringify(
        manifest.contractVersion ?? null,
      )} for "${packageName}@${resolvedVersion}".`,
    );
  }
  return { package: packageName, version: resolvedVersion, registry: registryUrl, manifest };
}

/**
 * Build the stable, allowlisted `info --json` object (includes the full manifest).
 *
 * It reports the visual design direction, the actual available
 * components/capabilities, the flattened token groups/names, and the
 * documentation / Showcase links, all read from the already-validated manifest.
 */
export function buildInfoResult(info) {
  const manifest = info.manifest;
  const design = isPlainObject(manifest.design) ? manifest.design : {};
  const components = isPlainObject(manifest.components) ? manifest.components : {};
  const tokens = isPlainObject(manifest.tokens) ? manifest.tokens : {};
  const entrypoints = isPlainObject(manifest.entrypoints) ? manifest.entrypoints : {};
  const extensions = buildExtensionCatalogEntries(manifest);
  return {
    package: info.package,
    version: info.version,
    name: manifest.name,
    contractVersion: CONTRACT_VERSION,
    design: {
      density: typeof design.density === "string" ? design.density : null,
      theme: typeof design.theme === "string" ? design.theme : null,
      radius: typeof design.radius === "string" ? design.radius : null,
      keywords: Array.isArray(design.keywords)
        ? design.keywords.filter((keyword) => typeof keyword === "string")
        : [],
    },
    components: manifest.components,
    entrypoints,
    extensions,
    availableExtensions: extensions.map((extension) => extension.name),
    rules: manifest.rules,
    availableComponents: COMPONENT_NAMES.filter((name) => name in components),
    capabilities: {
      required: [...REQUIRED_COMPONENTS],
      optional: OPTIONAL_COMPONENTS.filter((name) => name in components),
    },
    tokens: {
      groups: isPlainObject(tokens.groups) ? tokens.groups : {},
      artifacts: isPlainObject(tokens.artifacts) ? tokens.artifacts : {},
    },
    docs: isPlainObject(manifest.docs) ? manifest.docs : {},
    showcase: {
      route: `/showcase/${manifest.id}`,
    },
    manifest,
  };
}

/** Build the stable, allowlisted `search --json` payload. */
export function buildSearchResult(result) {
  return {
    registry: result.registry,
    query: result.query,
    size: result.size,
    source: typeof result.source === "string" ? result.source : null,
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    results: result.results,
  };
}
