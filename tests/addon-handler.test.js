// Catalog handler filter + pagination behavior.
//
// The handler is wrapped by stremio-addon-sdk's builder so we exercise it
// directly through the exported `filterAndPaginate` (pure logic, easy to
// unit-test) plus through the SDK's `get()` shim for end-to-end coverage of
// the storage read + exclusion path.

const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const ORIGINAL_ENV = { ...process.env };
let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "w2w-handler-"));
  process.env.STORAGE_BACKEND = "file";
  process.env.STORAGE_ROOT = path.join(tmpDir, ".cache", "storage");
  process.env.NODE_ENV = "test";
  jest.resetModules();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
});

function loadAddon() {
  return require("../addon");
}

function loadStorage() {
  return require("../lib/storage");
}

function makeMeta(id, name) {
  return { id, type: "movie", name, poster: `https://example.test/${id}.jpg` };
}
function makeSeriesMeta(id, name) {
  return { id, type: "series", name };
}

function awardCatalog() {
  return {
    generatedAt: new Date().toISOString(),
    source: "oscars",
    items: [
      {
        meta: makeMeta("tt0000001", "Old Pic"),
        nominations: [{ year: 2019, category: "Best Picture" }],
      },
      {
        meta: makeMeta("tt0000002", "Recent Drama"),
        nominations: [
          { year: 2024, category: "Best Picture" },
          { year: 2024, category: "Best Director" },
        ],
      },
      {
        meta: makeMeta("tt0000003", "Mid Movie"),
        nominations: [
          { year: 2022, category: "Best Picture" },
          { year: 2022, category: "Best Editing" },
        ],
      },
      {
        meta: makeMeta("tt0000004", "Across Years"),
        nominations: [
          { year: 2024, category: "Best Director" },
          { year: 2022, category: "Best Picture" },
        ],
      },
    ],
    years: [2024, 2022, 2019],
    categories: ["Best Director", "Best Editing", "Best Picture"],
  };
}

function festivalCatalog() {
  return {
    generatedAt: new Date().toISOString(),
    source: "sundance",
    items: [
      { meta: makeMeta("tt1000001", "Sundance 2025"), nominations: [{ year: 2025 }] },
      { meta: makeMeta("tt1000002", "Sundance 2024"), nominations: [{ year: 2024 }] },
    ],
    years: [2025, 2024],
    categories: [],
  };
}

function editorialCatalog() {
  return {
    generatedAt: new Date().toISOString(),
    source: "w2w",
    items: [
      {
        meta: makeMeta("tt2000001", "Variety Pick"),
        nominations: [{ year: 2026, source: "Variety" }],
      },
      {
        meta: makeMeta("tt2000002", "Vulture Pick"),
        nominations: [{ year: 2026, source: "Vulture" }],
      },
      {
        meta: makeMeta("tt2000003", "Decider Pick"),
        nominations: [{ year: 2026, source: "Decider" }],
      },
    ],
    years: [2026],
    categories: ["Decider", "Variety", "Vulture"],
  };
}

describe("filterAndPaginate", () => {
  test("year default for awards: returns only most-recent-year items", () => {
    const addon = loadAddon();
    const data = awardCatalog();
    const result = addon.filterAndPaginate(data, {}, "oscars");
    const ids = result.map((it) => it.meta.id);
    // Default year = 2024. Items with a 2024 nomination: Recent Drama, Across Years.
    expect(ids.sort()).toEqual(["tt0000002", "tt0000004"].sort());
  });

  test("year default for festivals: returns only most-recent-year items", () => {
    const addon = loadAddon();
    const data = festivalCatalog();
    const result = addon.filterAndPaginate(data, {}, "sundance");
    expect(result.map((it) => it.meta.id)).toEqual(["tt1000001"]);
  });

  test("explicit year: returns only matching nominations", () => {
    const addon = loadAddon();
    const data = awardCatalog();
    const result = addon.filterAndPaginate(data, { year: "2022" }, "oscars");
    const ids = result.map((it) => it.meta.id).sort();
    expect(ids).toEqual(["tt0000003", "tt0000004"]);
  });

  test("explicit year accepts numeric values", () => {
    const addon = loadAddon();
    const data = awardCatalog();
    const result = addon.filterAndPaginate(data, { year: 2019 }, "oscars");
    expect(result.map((it) => it.meta.id)).toEqual(["tt0000001"]);
  });

  test("genre filter: returns only the matching category", () => {
    const addon = loadAddon();
    const data = awardCatalog();
    const result = addon.filterAndPaginate(data, { year: "2022", genre: "Best Editing" }, "oscars");
    expect(result.map((it) => it.meta.id)).toEqual(["tt0000003"]);
  });

  test("year + genre AND-combine", () => {
    const addon = loadAddon();
    const data = awardCatalog();
    const result = addon.filterAndPaginate(data, { year: "2024", genre: "Best Picture" }, "oscars");
    expect(result.map((it) => it.meta.id)).toEqual(["tt0000002"]);
  });

  test("mobile mode: 'Year: 2022' in genre slot acts as year filter", () => {
    const addon = loadAddon();
    const data = awardCatalog();
    const result = addon.filterAndPaginate(data, { genre: "Year: 2022" }, "oscars");
    const ids = result.map((it) => it.meta.id).sort();
    expect(ids).toEqual(["tt0000003", "tt0000004"]);
  });

  test("mobile mode: 'Year: 2025' in genre slot for festival filters by year, not category", () => {
    const addon = loadAddon();
    const data = festivalCatalog();
    const result = addon.filterAndPaginate(data, { genre: "Year: 2025" }, "sundance");
    expect(result.map((it) => it.meta.id)).toEqual(["tt1000001"]);
  });

  test("mobile mode: bare category in genre slot still works as category filter", () => {
    const addon = loadAddon();
    const data = awardCatalog();
    // Default year filter (most recent = 2024) AND genre = "Best Director".
    // Recent Drama (2024 Best Director) and Across Years (2024 Best Director) match.
    const result = addon.filterAndPaginate(data, { genre: "Best Director" }, "oscars");
    expect(result.map((it) => it.meta.id).sort()).toEqual(["tt0000002", "tt0000004"]);
  });

  test("editorial: no default year filter (returns all items)", () => {
    const addon = loadAddon();
    const data = editorialCatalog();
    const result = addon.filterAndPaginate(data, {}, "w2w");
    expect(result).toHaveLength(3);
  });

  test("editorial genre matches against `source` field", () => {
    const addon = loadAddon();
    const data = editorialCatalog();
    const result = addon.filterAndPaginate(data, { genre: "Variety" }, "w2w");
    expect(result.map((it) => it.meta.id)).toEqual(["tt2000001"]);
  });

  test("pagination via extra.skip slices the filtered set", () => {
    const addon = loadAddon();
    const items = Array.from({ length: 250 }, (_, i) => ({
      meta: makeMeta(`tt30000${String(i).padStart(2, "0")}`, `Movie ${i}`),
      nominations: [{ year: 2024, category: "Best Picture" }],
    }));
    const data = {
      items,
      years: [2024],
      categories: ["Best Picture"],
    };
    const page1 = addon.filterAndPaginate(data, {}, "oscars");
    const page2 = addon.filterAndPaginate(data, { skip: "100" }, "oscars");
    const page3 = addon.filterAndPaginate(data, { skip: "200" }, "oscars");
    expect(page1).toHaveLength(100);
    expect(page2).toHaveLength(100);
    expect(page3).toHaveLength(50);
    // No overlap between pages.
    const ids1 = new Set(page1.map((it) => it.meta.id));
    const ids2 = new Set(page2.map((it) => it.meta.id));
    for (const id of ids1) expect(ids2.has(id)).toBe(false);
  });

  test("sort: most recent nomination year DESC, then alpha", () => {
    const addon = loadAddon();
    const data = {
      items: [
        { meta: makeMeta("tt1", "Charlie"), nominations: [{ year: 2024 }] },
        { meta: makeMeta("tt2", "Alpha"), nominations: [{ year: 2024 }] },
        { meta: makeMeta("tt3", "Bravo"), nominations: [{ year: 2024 }] },
      ],
      years: [2024],
      categories: [],
    };
    const result = addon.filterAndPaginate(data, {}, "sundance");
    expect(result.map((it) => it.meta.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });
});

describe("catalog handler (via SDK get())", () => {
  test("returns metas slice with cache headers from a stored catalog", async () => {
    const storage = loadStorage();
    await storage.putJSON("catalog/oscars/movie.json", awardCatalog());
    const addon = loadAddon();

    const resp = await addon.get("catalog", "movie", "oscars", {}, {});
    expect(Array.isArray(resp.metas)).toBe(true);
    expect(resp.cacheMaxAge).toBe(3600);
    expect(resp.staleRevalidate).toBe(21600);
    expect(resp.staleError).toBe(604800);
  });

  test("missing storage blob returns empty metas", async () => {
    const addon = loadAddon();
    const resp = await addon.get("catalog", "movie", "oscars", {}, {});
    expect(resp.metas).toEqual([]);
  });

  test("excluded catalog (config.noOscars=true) returns empty metas", async () => {
    const storage = loadStorage();
    await storage.putJSON("catalog/oscars/movie.json", awardCatalog());
    const addon = loadAddon();
    const resp = await addon.get("catalog", "movie", "oscars", {}, { noOscars: true });
    expect(resp.metas).toEqual([]);
  });

  test("w2w excluded only when ALL editorial sources excluded", async () => {
    const storage = loadStorage();
    await storage.putJSON("catalog/w2w/movie.json", editorialCatalog());
    const addon = loadAddon();

    // Excluding only Decider should NOT hide w2w.
    const partial = await addon.get("catalog", "movie", "w2w", {}, { noDecider: true });
    expect(partial.metas.length).toBeGreaterThan(0);

    // Excluding all five outlets DOES hide w2w.
    const all = await addon.get(
      "catalog",
      "movie",
      "w2w",
      {},
      {
        noDecider: true,
        noVariety: true,
        noVulture: true,
        noIndiewire: true,
        noNyt: true,
      }
    );
    expect(all.metas).toEqual([]);
  });

  test("series catalog read works (emmys)", async () => {
    const storage = loadStorage();
    await storage.putJSON("catalog/emmys/series.json", {
      generatedAt: new Date().toISOString(),
      source: "emmys",
      items: [
        {
          meta: makeSeriesMeta("tt5000001", "Drama Show"),
          nominations: [{ year: 2024, category: "Outstanding Drama Series" }],
        },
      ],
      years: [2024],
      categories: ["Outstanding Drama Series"],
    });
    const addon = loadAddon();
    const resp = await addon.get("catalog", "series", "emmys", {}, {});
    expect(resp.metas.map((m) => m.id)).toEqual(["tt5000001"]);
  });
});
