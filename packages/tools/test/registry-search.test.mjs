/**
 * Focused tests for the complete-scope listing path used by `prism-ds search`
 * when no query is given.
 *
 * The npm ranked search index is not a directory: a package can be published
 * and still be absent from the first page of a scope query. These tests pin the
 * `_all_docs` key-range path, the ranked-search fallback, and the shared result
 * shape without touching the network.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildScopeEndpoint,
  buildSearchResult,
  listScopePackageNames,
  searchRegistry,
} from "../src/registry.mjs";

/** Build a JSON Response that the bounded registry client can read. */
function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Build a minimal current-registry packument for one exact release. */
function packumentFor(name, version = "1.2.3") {
  return {
    name,
    "dist-tags": { latest: version },
    versions: {
      [version]: {
        name,
        version,
        description: `Description for ${name}`,
        keywords: ["design-system", "prism-system"],
      },
    },
  };
}

/**
 * Route the registry client to either the replication index, the ranked search
 * endpoint, or an exact package packument. `calls` records every request URL.
 */
function createFetch({ calls = [], replication, search, packages = {} }) {
  return async (input) => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push(url);
    if (url.hostname === "replicate.npmjs.com") {
      const response = replication ? replication(url) : { rows: [] };
      return response instanceof Response ? response : jsonResponse(response);
    }
    if (url.pathname.endsWith("/-/v1/search")) {
      const response = search ? search(url) : { objects: [] };
      return response instanceof Response ? response : jsonResponse(response);
    }
    const packageName = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const packument = packages[packageName];
    return packument ? jsonResponse(packument) : jsonResponse({ error: "not found" }, 404);
  };
}

test("a no-query search enumerates the complete scope instead of trusting ranked search", async () => {
  const calls = [];
  const names = [
    "@prism-system/ui-core",
    "@prism-system/ui-system-a",
    "@prism-system/ui-system-plr",
    "@prism-system/tools",
    "@prism-system/ui-system-b",
    "@other/ui-system-x",
  ];
  const packages = {
    "@prism-system/ui-system-a": packumentFor("@prism-system/ui-system-a", "4.0.0"),
    "@prism-system/ui-system-b": packumentFor("@prism-system/ui-system-b", "4.0.0"),
    "@prism-system/ui-system-plr": packumentFor("@prism-system/ui-system-plr", "0.1.1"),
  };
  const fetchImpl = createFetch({
    calls,
    replication: () => ({
      total_rows: names.length,
      offset: 0,
      rows: names.map((id) => ({ id, key: id, value: { rev: "1-x" } })),
    }),
    search: () => {
      throw new Error("ranked search must not be used when the scope index is available");
    },
    packages,
  });

  const result = await searchRegistry({
    registry: "https://registry.npmjs.org",
    fetchImpl,
  });

  assert.equal(result.source, "scope-index");
  assert.equal(result.query, "");
  assert.equal(result.size, 250);
  assert.deepEqual(
    result.results.map((entry) => entry.name),
    ["@prism-system/ui-system-a", "@prism-system/ui-system-b", "@prism-system/ui-system-plr"],
  );
  assert.equal(result.results[2].version, "0.1.1");
  assert.match(result.results[2].description, /ui-system-plr/);
  assert.ok(
    calls.some((url) => url.hostname === "replicate.npmjs.com"),
    "the replication index is the primary listing source",
  );
  assert.ok(
    !calls.some((url) => url.pathname.endsWith("/-/v1/search")),
    "ranked search is not consulted when the complete index answers",
  );
});

test("a no-query search falls back to ranked search when the scope index is unavailable", async () => {
  const calls = [];
  const fetchImpl = createFetch({
    calls,
    replication: () => jsonResponse({ error: "not found" }, 404),
    search: () => ({
      objects: [
        {
          package: {
            name: "@prism-system/ui-system-a",
            version: "4.0.0",
            description: "System A",
            keywords: ["design-system"],
          },
        },
      ],
    }),
  });

  const result = await searchRegistry({
    registry: "https://registry.npmjs.org",
    fetchImpl,
  });

  assert.equal(result.source, "search");
  assert.equal(result.query, "");
  assert.equal(result.size, 250);
  assert.deepEqual(result.results, [
    {
      name: "@prism-system/ui-system-a",
      version: "4.0.0",
      description: "System A",
      keywords: ["design-system"],
    },
  ]);
  assert.ok(calls.some((url) => url.pathname.endsWith("/-/v1/search")));
});

test("a text query still uses ranked registry search and the 25-result default", async () => {
  const calls = [];
  const fetchImpl = createFetch({
    calls,
    replication: () => {
      throw new Error("the scope index must not be used for a text query");
    },
    search: () => ({
      objects: [
        {
          package: {
            name: "@prism-system/ui-system-a",
            version: "4.0.0",
            description: "System A",
            keywords: [],
          },
        },
      ],
    }),
  });

  const result = await searchRegistry({
    query: ["calm", "editorial"],
    registry: "https://registry.npmjs.org",
    fetchImpl,
  });

  assert.equal(result.source, "search");
  assert.equal(result.query, "calm editorial");
  assert.equal(result.size, 25);
  assert.equal(result.results[0].name, "@prism-system/ui-system-a");
  const searchUrl = calls.find((url) => url.pathname.endsWith("/-/v1/search"));
  assert.ok(searchUrl, "ranked search was called");
  assert.equal(searchUrl.searchParams.get("text"), "calm editorial");
  assert.equal(searchUrl.searchParams.get("size"), "25");
});

test("an exact package name resolves directly from its packument, bypassing ranked search", async () => {
  const calls = [];
  const fetchImpl = createFetch({
    calls,
    packages: {
      "@prism-system/ui-system-plr": packumentFor("@prism-system/ui-system-plr", "0.1.1"),
    },
    replication: () => {
      throw new Error("the scope index must not be used for an exact query");
    },
    search: () => {
      throw new Error("ranked search must not be used for an exact package name");
    },
  });

  const result = await searchRegistry({
    query: ["@prism-system/ui-system-plr"],
    registry: "https://registry.npmjs.org",
    fetchImpl,
  });

  assert.equal(result.source, "exact");
  assert.equal(result.query, "@prism-system/ui-system-plr");
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].name, "@prism-system/ui-system-plr");
  assert.equal(result.results[0].version, "0.1.1");
  assert.ok(!calls.some((url) => url.pathname.endsWith("/-/v1/search")));
});

test("an exact system id resolves directly and a one-word miss still falls back to ranked search", async () => {
  const directCalls = [];
  const direct = await searchRegistry({
    query: ["system-plr"],
    registry: "https://registry.npmjs.org",
    fetchImpl: createFetch({
      calls: directCalls,
      packages: {
        "@prism-system/ui-system-plr": packumentFor("@prism-system/ui-system-plr", "0.1.1"),
      },
    }),
  });
  assert.equal(direct.source, "exact");
  assert.equal(direct.results[0].name, "@prism-system/ui-system-plr");

  const fallbackCalls = [];
  const fallback = await searchRegistry({
    query: ["plr"],
    registry: "https://registry.npmjs.org",
    fetchImpl: createFetch({
      calls: fallbackCalls,
      packages: {},
      search: () => ({
        objects: [
          {
            package: {
              name: "@prism-system/ui-system-plr",
              version: "0.1.1",
              description: "Plan Like Rahmani",
              keywords: [],
            },
          },
        ],
      }),
    }),
  });
  assert.equal(fallback.source, "search");
  assert.equal(fallback.results[0].name, "@prism-system/ui-system-plr");
  assert.ok(fallbackCalls.some((url) => url.pathname.endsWith("/-/v1/search")));
});

test("scope enumeration pages through _all_docs without losing the boundary package", async () => {
  const pageOne = Array.from({ length: 1000 }, (_, index) => ({
    id: `@prism-system/ui-system-${String(index).padStart(4, "0")}`,
  }));
  const pageTwo = [{ id: "@prism-system/ui-system-zzzz" }];
  const calls = [];
  let page = 0;
  const fetchImpl = async (input) => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push(url);
    page += 1;
    return jsonResponse({ rows: page === 1 ? pageOne : pageTwo });
  };

  const names = await listScopePackageNames({
    registry: "https://registry.npmjs.org",
    fetchImpl,
  });

  assert.equal(names.length, 1001);
  assert.equal(calls.length, 2);
  assert.equal(names[0], "@prism-system/ui-system-0000");
  assert.equal(names[1000], "@prism-system/ui-system-zzzz");
  assert.equal(
    calls[1].searchParams.get("startkey"),
    JSON.stringify("@prism-system/ui-system-0999"),
  );
});

test("custom registries probe their own CouchDB-compatible scope endpoint", () => {
  const endpoint = buildScopeEndpoint("https://registry.example.test", {
    startkey: JSON.stringify("@prism-system/ui-"),
  });
  assert.equal(endpoint.origin, "https://registry.example.test");
  assert.equal(endpoint.pathname, "/_all_docs");
  assert.equal(endpoint.searchParams.get("startkey"), JSON.stringify("@prism-system/ui-"));
});

test("a package whose latest packument cannot be read is reported without hiding the rest", async () => {
  const fetchImpl = createFetch({
    replication: () => ({
      rows: [{ id: "@prism-system/ui-system-a" }, { id: "@prism-system/ui-system-b" }],
    }),
    packages: {
      "@prism-system/ui-system-a": packumentFor("@prism-system/ui-system-a"),
    },
  });

  const result = await searchRegistry({
    registry: "https://registry.npmjs.org",
    fetchImpl,
  });

  assert.equal(result.source, "scope-index");
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].name, "@prism-system/ui-system-a");
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /ui-system-b/);
});

test("the stable search JSON carries the listing source and warnings", () => {
  assert.deepEqual(
    buildSearchResult({
      registry: "https://registry.npmjs.org",
      query: "",
      size: 250,
      source: "scope-index",
      warnings: ["one package could not be read"],
      results: [],
    }),
    {
      registry: "https://registry.npmjs.org",
      query: "",
      size: 250,
      source: "scope-index",
      warnings: ["one package could not be read"],
      results: [],
    },
  );
});

test("an invalid --size fails before any registry request", async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return jsonResponse({ rows: [] });
  };

  await assert.rejects(
    searchRegistry({ size: "0", registry: "https://registry.npmjs.org", fetchImpl }),
    /Invalid --size/,
  );
  assert.equal(requests, 0);
});
