const fs = require("fs/promises");
const os = require("os");
const path = require("path");

// Mock every source module before requiring refresh. Each editorial source
// returns a single canned title tagged with its outlet name. Award/festival
// sources return per-edition/year rows so we can assert aggregation across
// editions (same IMDb id appearing in multiple years).
jest.mock("../../sources/decider", () => ({
  name: "Decider",
  id: "decider",
  fetchTitles: jest.fn(async () => [
    { title: "Decider Movie", year: 2024, type: undefined, source: "Decider" },
  ]),
}));
jest.mock("../../sources/variety", () => ({
  name: "Variety",
  id: "variety",
  fetchTitles: jest.fn(async () => [
    { title: "Variety Movie", year: 2024, type: undefined, source: "Variety" },
  ]),
}));
jest.mock("../../sources/vulture", () => ({
  name: "Vulture",
  id: "vulture",
  fetchTitles: jest.fn(async () => [
    { title: "Vulture Movie", year: 2024, type: undefined, source: "Vulture" },
  ]),
}));
jest.mock("../../sources/indiewire", () => ({
  name: "IndieWire",
  id: "indiewire",
  fetchTitles: jest.fn(async () => [
    { title: "IndieWire Movie", year: 2024, type: undefined, source: "IndieWire" },
  ]),
}));
jest.mock("../../sources/nyt", () => ({
  name: "NYT",
  id: "nyt",
  fetchTitles: jest.fn(async () => [
    { title: "NYT Movie", year: 2024, type: undefined, source: "NYT" },
  ]),
}));

jest.mock("../../sources/festivals", () => ({
  sundance: {
    name: "Sundance",
    id: "sundance",
    fetchTitlesForYear: jest.fn(async (y) => [
      { title: `Sundance Movie ${y}`, year: y, type: "movie", source: `Sundance (${y})` },
    ]),
    fetchTitles: jest.fn(),
  },
  cannes: {
    name: "Cannes",
    id: "cannes",
    fetchTitlesForYear: jest.fn(async (y) => [
      { title: `Cannes Movie ${y}`, year: y, type: "movie", source: `Cannes (${y})` },
    ]),
    fetchTitles: jest.fn(),
  },
  berlinale: {
    name: "Berlinale",
    id: "berlinale",
    fetchTitlesForYear: jest.fn(async (y) => [
      { title: `Berlinale Movie ${y}`, year: y, type: "movie", source: `Berlinale (${y})` },
    ]),
    fetchTitles: jest.fn(),
  },
  venice: {
    name: "Venice",
    id: "venice",
    fetchTitlesForYear: jest.fn(async (y) => [
      { title: `Venice Movie ${y}`, year: undefined, type: "movie", source: `Venice (${y})` },
    ]),
    fetchTitles: jest.fn(),
  },
  tiff: {
    name: "TIFF",
    id: "tiff",
    fetchTitlesForYear: jest.fn(async (y) => [
      { title: `TIFF Movie ${y}`, year: y, type: "movie", source: `TIFF (${y})` },
    ]),
    fetchTitles: jest.fn(),
  },
}));

jest.mock("../../sources/awards", () => ({
  oscars: {
    name: "Oscars",
    id: "oscars",
    // Two categories per edition for the same film, so aggregation can be
    // observed (one item with two nominations entries).
    fetchTitlesForEdition: jest.fn(async (n) => [
      {
        title: "Oscar Movie",
        year: 1928 + n,
        category: "Best Picture",
        ceremonyYear: 1928 + n,
        type: "movie",
        source: `Oscars ${n}`,
      },
      {
        title: "Oscar Movie",
        year: 1928 + n,
        category: "Best Director",
        ceremonyYear: 1928 + n,
        type: "movie",
        source: `Oscars ${n}`,
      },
    ]),
    fetchTitles: jest.fn(),
  },
  goldenGlobes: {
    name: "Golden Globes",
    id: "goldenGlobes",
    fetchTitlesForEdition: jest.fn(async (n) => [
      {
        title: "GG Movie",
        year: 1943 + n,
        category: "Best Drama",
        ceremonyYear: 1943 + n,
        type: "movie",
        source: `GG ${n}`,
      },
      {
        title: "GG Series",
        year: 1943 + n,
        category: "Best TV Drama",
        ceremonyYear: 1943 + n,
        type: "series",
        source: `GG ${n}`,
      },
    ]),
    fetchTitles: jest.fn(),
  },
  emmys: {
    name: "Emmys",
    id: "emmys",
    fetchTitlesForEdition: jest.fn(async (n) => [
      {
        title: "Emmy Show",
        year: 1948 + n,
        category: "Outstanding Drama Series",
        ceremonyYear: 1948 + n,
        type: "series",
        source: `Emmys ${n}`,
      },
    ]),
    fetchTitles: jest.fn(),
  },
}));

jest.mock("../../lib/resolver", () => ({
  resolve: jest.fn(),
}));

const ORIGINAL_ENV = { ...process.env };
let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "w2w-refresh-"));
  process.env.STORAGE_BACKEND = "file";
  process.env.STORAGE_ROOT = path.join(tmpDir, ".cache", "storage");
  process.env.TMDB_API_KEY = "test-key";

  jest.clearAllMocks();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
});

function freshRefresh() {
  jest.resetModules();
  return {
    refresh: require("../../lib/refresh"),
    storage: require("../../lib/storage"),
    resolver: require("../../lib/resolver"),
    festivals: require("../../sources/festivals"),
    awards: require("../../sources/awards"),
    decider: require("../../sources/decider"),
  };
}

function silentLog() {
  return { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
}

// Resolver impl that maps the raw title to a stable IMDb id (so the same
// title across multiple editions resolves to the same meta and aggregation
// kicks in). The resolved type follows the input type when known; otherwise
// defaults to "movie".
function makeStableResolver() {
  let counter = 0;
  const titleToId = new Map();
  return jest.fn(async (title, year, type) => {
    if (!titleToId.has(title)) {
      counter += 1;
      titleToId.set(title, `tt${String(counter).padStart(7, "0")}`);
    }
    const resolvedType = type === "series" ? "series" : "movie";
    return {
      id: titleToId.get(title),
      type: resolvedType,
      name: title,
      year,
      poster: `https://example.test/${titleToId.get(title)}.jpg`,
    };
  });
}

describe("refresh.run", () => {
  test("throws when TMDB key is missing and env is unset", async () => {
    delete process.env.TMDB_API_KEY;
    const { refresh } = freshRefresh();
    await expect(refresh.run({ log: silentLog() })).rejects.toThrow("TMDB_API_KEY is required");
  });

  test("writes the new catalog set (drops now-streaming + *-all, adds venice + tiff)", async () => {
    const { refresh, resolver, storage } = freshRefresh();
    resolver.resolve.mockImplementation(makeStableResolver());

    const result = await refresh.run({ yearsBack: 1, log: silentLog() });
    expect(result.ok).toBe(true);

    const expectedKeys = [
      "catalog/w2w/movie.json",
      "catalog/w2w/series.json",
      "catalog/sundance/movie.json",
      "catalog/cannes/movie.json",
      "catalog/berlinale/movie.json",
      "catalog/venice/movie.json",
      "catalog/tiff/movie.json",
      "catalog/oscars/movie.json",
      "catalog/goldenGlobes/movie.json",
      "catalog/goldenGlobes/series.json",
      "catalog/emmys/series.json",
    ];
    for (const key of expectedKeys) {
      const blob = await storage.getJSON(key);
      expect(blob).not.toBeNull();
      expect(blob.items).toBeInstanceOf(Array);
      expect(typeof blob.generatedAt).toBe("string");
      expect(typeof blob.source).toBe("string");
      expect(blob.years).toBeInstanceOf(Array);
      expect(blob.categories).toBeInstanceOf(Array);
    }

    // Catalogs that should NOT exist anymore.
    for (const key of [
      "catalog/now-streaming/movie.json",
      "catalog/sundance-all/movie.json",
      "catalog/cannes-all/movie.json",
      "catalog/berlinale-all/movie.json",
      "catalog/oscars-all/movie.json",
      "catalog/goldenGlobes-all/movie.json",
      "catalog/goldenGlobes-all/series.json",
      "catalog/emmys-all/series.json",
    ]) {
      expect(await storage.getJSON(key)).toBeNull();
    }
  });

  test("aggregates same IMDb id across multiple editions into one item", async () => {
    const { refresh, resolver, storage } = freshRefresh();
    resolver.resolve.mockImplementation(makeStableResolver());

    await refresh.run({ yearsBack: 3, log: silentLog() });

    const oscars = await storage.getJSON("catalog/oscars/movie.json");
    // 3 editions x 2 categories = 6 raw rows for the same title "Oscar Movie"
    // → exactly one aggregated item with 6 nominations.
    expect(oscars.items).toHaveLength(1);
    expect(oscars.items[0].nominations).toHaveLength(6);
    for (const nom of oscars.items[0].nominations) {
      expect(typeof nom.year).toBe("number");
      expect(typeof nom.category).toBe("string");
    }
    // Categories sorted ascending, deduped.
    expect(oscars.categories).toEqual(["Best Director", "Best Picture"]);
    // Years sorted descending.
    expect(oscars.years).toEqual([...oscars.years].sort((a, b) => b - a));
  });

  test("festival nominations have only year (no category)", async () => {
    const { refresh, resolver, storage } = freshRefresh();
    resolver.resolve.mockImplementation(makeStableResolver());

    await refresh.run({ yearsBack: 3, log: silentLog() });

    const sundance = await storage.getJSON("catalog/sundance/movie.json");
    // 3 distinct titles (different per year) → 3 items, each with 1 nomination.
    expect(sundance.items).toHaveLength(3);
    for (const item of sundance.items) {
      expect(item.nominations).toHaveLength(1);
      expect(item.nominations[0]).toHaveProperty("year");
      expect(item.nominations[0]).not.toHaveProperty("category");
      expect(item.nominations[0]).not.toHaveProperty("source");
    }
    expect(sundance.categories).toEqual([]);
    // Years sorted descending. With currentYear=2025, yearsBack=3 → 2025,2024,2023.
    expect(sundance.years).toEqual([2025, 2024, 2023]);
  });

  test("Venice festival year comes from the parameter, not the row's year field", async () => {
    const { refresh, resolver, storage } = freshRefresh();
    resolver.resolve.mockImplementation(makeStableResolver());

    await refresh.run({ yearsBack: 2, log: silentLog() });

    const venice = await storage.getJSON("catalog/venice/movie.json");
    expect(venice.items.length).toBeGreaterThan(0);
    for (const item of venice.items) {
      for (const nom of item.nominations) {
        expect(typeof nom.year).toBe("number");
      }
    }
    // currentYear=2025, yearsBack=2 → 2025, 2024.
    expect(venice.years).toEqual([2025, 2024]);
  });

  test("editorial nominations have year + source", async () => {
    const { refresh, resolver, storage } = freshRefresh();
    resolver.resolve.mockImplementation(makeStableResolver());

    await refresh.run({ yearsBack: 1, log: silentLog() });

    const w2wMovie = await storage.getJSON("catalog/w2w/movie.json");
    expect(w2wMovie.items.length).toBeGreaterThan(0);
    for (const item of w2wMovie.items) {
      for (const nom of item.nominations) {
        expect(typeof nom.year).toBe("number");
        expect(typeof nom.source).toBe("string");
        expect(nom).not.toHaveProperty("category");
      }
    }
    // categories field for editorial is the union of source names, sorted asc.
    expect(w2wMovie.categories).toEqual(
      [...w2wMovie.categories].sort((a, b) => a.localeCompare(b))
    );
    // All five outlets show up given each mock returns a distinct title.
    expect(w2wMovie.categories).toEqual(
      expect.arrayContaining(["Decider", "IndieWire", "NYT", "Variety", "Vulture"])
    );
    // Year is the current calendar year.
    const currentYear = new Date().getFullYear();
    for (const item of w2wMovie.items) {
      for (const nom of item.nominations) {
        expect(nom.year).toBe(currentYear);
      }
    }
  });

  test("excludes resolved metas whose type does not match the job type", async () => {
    const { refresh, resolver, storage } = freshRefresh();

    // Resolver always returns a movie, so series-typed jobs end up empty.
    let counter = 0;
    resolver.resolve.mockImplementation(async (title) => {
      counter += 1;
      return { id: `tt${counter}`, type: "movie", name: title };
    });

    await refresh.run({ yearsBack: 1, log: silentLog() });

    const seriesBlob = await storage.getJSON("catalog/emmys/series.json");
    expect(seriesBlob.items).toEqual([]);

    const movieBlob = await storage.getJSON("catalog/oscars/movie.json");
    expect(movieBlob.items.length).toBeGreaterThan(0);
  });

  test("one source throwing does not abort the run; other jobs still write blobs", async () => {
    const { refresh, resolver, storage, festivals } = freshRefresh();
    resolver.resolve.mockImplementation(makeStableResolver());

    festivals.sundance.fetchTitlesForYear.mockRejectedValue(new Error("sundance is down"));

    const log = silentLog();
    const result = await refresh.run({ yearsBack: 1, log });

    expect(result.ok).toBe(true);

    // Per-year errors are logged inside the collector but not propagated, so the
    // sundance blob still writes — just with zero items.
    const sundance = await storage.getJSON("catalog/sundance/movie.json");
    expect(sundance).not.toBeNull();
    expect(sundance.items).toEqual([]);

    // Cannes (independent) still produced a blob with items.
    const cannes = await storage.getJSON("catalog/cannes/movie.json");
    expect(cannes).not.toBeNull();
    expect(cannes.items.length).toBeGreaterThan(0);
  });

  test("emits a manifest.json blob with extras populated from per-catalog facets", async () => {
    const { refresh, resolver, storage } = freshRefresh();
    resolver.resolve.mockImplementation(makeStableResolver());

    await refresh.run({ yearsBack: 2, log: silentLog() });

    const manifest = await storage.getJSON("manifest.json");
    expect(manifest).not.toBeNull();
    expect(manifest.id).toBe("community.w2w");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.catalogs).toBeInstanceOf(Array);

    // Oscars (movie) catalog has both genre + year + skip, with options
    // populated from the stored years/categories.
    const oscars = manifest.catalogs.find((c) => c.id === "oscars" && c.type === "movie");
    expect(oscars).toBeDefined();
    const oscarsExtraNames = oscars.extra.map((e) => e.name);
    expect(oscarsExtraNames).toEqual(expect.arrayContaining(["genre", "year", "skip"]));
    const oscarsGenre = oscars.extra.find((e) => e.name === "genre");
    expect(oscarsGenre.options).toEqual(["Best Director", "Best Picture"]);
    const oscarsYear = oscars.extra.find((e) => e.name === "year");
    expect(oscarsYear.options.length).toBeGreaterThan(0);
    // Year options are strings (Stremio convention).
    for (const y of oscarsYear.options) expect(typeof y).toBe("string");
  });

  test("manifest extras for festival catalogs do NOT have a genre extra", async () => {
    const { refresh, resolver, storage } = freshRefresh();
    resolver.resolve.mockImplementation(makeStableResolver());

    await refresh.run({ yearsBack: 1, log: silentLog() });

    const manifest = await storage.getJSON("manifest.json");
    const festivalIds = ["sundance", "cannes", "berlinale", "venice", "tiff"];
    for (const id of festivalIds) {
      const cat = manifest.catalogs.find((c) => c.id === id && c.type === "movie");
      expect(cat).toBeDefined();
      const extraNames = cat.extra.map((e) => e.name);
      expect(extraNames).not.toContain("genre");
      expect(extraNames).toEqual(expect.arrayContaining(["year", "skip"]));
    }
  });

  test("REFRESH_EDITIONS_BACK overrides the award edition window independently", async () => {
    const { refresh, resolver, awards } = freshRefresh();
    resolver.resolve.mockImplementation(makeStableResolver());

    await refresh.run({ yearsBack: 1, editionsBack: 4, log: silentLog() });

    const oscarEditions = awards.oscars.fetchTitlesForEdition.mock.calls.map((c) => c[0]);
    expect(new Set(oscarEditions).size).toBe(4);
  });
});
