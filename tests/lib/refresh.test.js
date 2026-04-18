const fs = require("fs/promises");
const os = require("os");
const path = require("path");

// Mock every source module before requiring refresh. Each source returns a
// single canned title so we can assert on counts and per-source behavior.
jest.mock("../../sources/decider", () => ({
  name: "Decider",
  id: "decider",
  fetchTitles: jest.fn(async () => [{ title: "Decider Movie", year: 2024, type: undefined }]),
}));
jest.mock("../../sources/variety", () => ({
  name: "Variety",
  id: "variety",
  fetchTitles: jest.fn(async () => [{ title: "Variety Movie", year: 2024, type: undefined }]),
}));
jest.mock("../../sources/vulture", () => ({
  name: "Vulture",
  id: "vulture",
  fetchTitles: jest.fn(async () => [{ title: "Vulture Movie", year: 2024, type: undefined }]),
}));
jest.mock("../../sources/indiewire", () => ({
  name: "IndieWire",
  id: "indiewire",
  fetchTitles: jest.fn(async () => [{ title: "IndieWire Movie", year: 2024, type: undefined }]),
}));
jest.mock("../../sources/nyt", () => ({
  name: "NYT",
  id: "nyt",
  fetchTitles: jest.fn(async () => [{ title: "NYT Movie", year: 2024, type: undefined }]),
}));
jest.mock("../../sources/rt-browse", () => ({
  name: "RT",
  id: "rtBrowse",
  fetchTitles: jest.fn(async () => [{ title: "RT Movie", year: 2024, type: "movie" }]),
}));

jest.mock("../../sources/festivals", () => ({
  sundance: {
    name: "Sundance",
    id: "sundance",
    fetchTitlesForYear: jest.fn(async (y) => [
      { title: `Sundance Movie ${y}`, year: y, type: "movie" },
    ]),
    fetchTitles: jest.fn(),
  },
  cannes: {
    name: "Cannes",
    id: "cannes",
    fetchTitlesForYear: jest.fn(async (y) => [
      { title: `Cannes Movie ${y}`, year: y, type: "movie" },
    ]),
    fetchTitles: jest.fn(),
  },
  berlinale: {
    name: "Berlinale",
    id: "berlinale",
    fetchTitlesForYear: jest.fn(async (y) => [
      { title: `Berlinale Movie ${y}`, year: y, type: "movie" },
    ]),
    fetchTitles: jest.fn(),
  },
}));

jest.mock("../../sources/awards", () => ({
  oscars: {
    name: "Oscars",
    id: "oscars",
    fetchTitlesForEdition: jest.fn(async (n) => [
      { title: `Oscar Movie ${n}`, year: 1928 + n, type: "movie" },
    ]),
    fetchTitles: jest.fn(),
  },
  goldenGlobes: {
    name: "Golden Globes",
    id: "goldenGlobes",
    fetchTitlesForEdition: jest.fn(async (n) => [
      { title: `GG Movie ${n}`, year: 1943 + n, type: "movie" },
      { title: `GG Series ${n}`, year: 1943 + n, type: "series" },
    ]),
    fetchTitles: jest.fn(),
  },
  emmys: {
    name: "Emmys",
    id: "emmys",
    fetchTitlesForEdition: jest.fn(async (n) => [
      { title: `Emmy Show ${n}`, year: 1948 + n, type: "series" },
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
  // Re-mocked modules survive resetModules thanks to jest.mock factory hoisting.
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

describe("refresh.run", () => {
  test("throws when TMDB key is missing and env is unset", async () => {
    delete process.env.TMDB_API_KEY;
    const { refresh } = freshRefresh();
    await expect(refresh.run({ log: silentLog() })).rejects.toThrow("TMDB_API_KEY is required");
  });

  test("happy path writes a blob for every expected catalog key", async () => {
    const { refresh, resolver, storage } = freshRefresh();

    // Resolver returns a generic meta whose type matches the input type when
    // present, otherwise defaults to "movie".
    let counter = 0;
    resolver.resolve.mockImplementation(async (title, year, type) => {
      counter += 1;
      const resolvedType = type === "series" ? "series" : "movie";
      return {
        id: `tt${String(counter).padStart(7, "0")}`,
        type: resolvedType,
        name: title,
        year,
      };
    });

    const result = await refresh.run({ yearsBack: 1, log: silentLog() });

    expect(result.ok).toBe(true);
    expect(typeof result.durationMs).toBe("number");

    const expectedKeys = [
      "catalog/w2w/movie.json",
      "catalog/w2w/series.json",
      "catalog/now-streaming/movie.json",
      "catalog/sundance/movie.json",
      "catalog/cannes/movie.json",
      "catalog/berlinale/movie.json",
      "catalog/sundance-all/movie.json",
      "catalog/cannes-all/movie.json",
      "catalog/berlinale-all/movie.json",
      "catalog/oscars/movie.json",
      "catalog/goldenGlobes/movie.json",
      "catalog/goldenGlobes/series.json",
      "catalog/emmys/series.json",
      "catalog/oscars-all/movie.json",
      "catalog/goldenGlobes-all/movie.json",
      "catalog/goldenGlobes-all/series.json",
      "catalog/emmys-all/series.json",
    ];

    for (const key of expectedKeys) {
      const blob = await storage.getJSON(key);
      expect(blob).not.toBeNull();
      expect(blob.metas).toBeInstanceOf(Array);
      expect(typeof blob.generatedAt).toBe("string");
      expect(typeof blob.source).toBe("string");
      expect(result.counts[key]).toBeGreaterThanOrEqual(0);
    }
  });

  test("festival 'all years' iterates yearsBack distinct years", async () => {
    const { refresh, resolver, festivals } = freshRefresh();
    resolver.resolve.mockResolvedValue(null); // we only care about call shape

    await refresh.run({ yearsBack: 3, log: silentLog() });

    // currentYear=2025 (sundance) -> calls for 2025, 2024, 2023; plus the
    // standalone "current year" job adds another 2025 call.
    const callsToYears = festivals.sundance.fetchTitlesForYear.mock.calls.map((c) => c[0]);
    expect(callsToYears).toContain(2025);
    expect(callsToYears).toContain(2024);
    expect(callsToYears).toContain(2023);
    // The historical aggregator alone should have exactly 3 distinct years
    const distinctYears = new Set(callsToYears);
    expect(distinctYears.size).toBe(3);
  });

  test("excludes metas whose resolved type does not match the job type", async () => {
    const { refresh, resolver, storage } = freshRefresh();

    // Resolver always returns a movie. The series-typed jobs should end up empty.
    let counter = 0;
    resolver.resolve.mockImplementation(async (title) => {
      counter += 1;
      return { id: `tt${counter}`, type: "movie", name: title };
    });

    await refresh.run({ yearsBack: 1, log: silentLog() });

    const seriesBlob = await storage.getJSON("catalog/emmys/series.json");
    expect(seriesBlob.metas).toEqual([]);

    const movieBlob = await storage.getJSON("catalog/oscars/movie.json");
    expect(movieBlob.metas.length).toBeGreaterThan(0);
  });

  test("one source throwing does not abort the run; other jobs still write blobs", async () => {
    const { refresh, resolver, storage, festivals } = freshRefresh();

    resolver.resolve.mockImplementation(async (title, year, type) => ({
      id: `tt-${title}`,
      type: type === "series" ? "series" : "movie",
      name: title,
    }));

    festivals.sundance.fetchTitlesForYear.mockRejectedValue(new Error("sundance is down"));

    const log = silentLog();
    const result = await refresh.run({ yearsBack: 1, log });

    expect(result.ok).toBe(true);

    // The "sundance/movie" current-year job ran fetchRaw which threw — its
    // counts entry should be an error marker.
    expect(result.counts["catalog/sundance/movie.json"]).toEqual({ error: "sundance is down" });

    // Cannes (independent) still produced a blob.
    const cannes = await storage.getJSON("catalog/cannes/movie.json");
    expect(cannes).not.toBeNull();
    expect(cannes.metas.length).toBeGreaterThan(0);

    // The historical aggregator swallows per-year errors and still writes a
    // (possibly empty) blob.
    const sundanceAll = await storage.getJSON("catalog/sundance-all/movie.json");
    expect(sundanceAll).not.toBeNull();
  });
});
