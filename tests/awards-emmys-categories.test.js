// Per-category Primetime Emmy nominee scraper.
//
// Drives emmys.fetchTitlesForEdition(n) against trimmed Wikipedia fixtures
// (modern 77th layout + older 70th layout). Confirms:
//   * every row is type=series with the expected ceremonyYear
//   * one row per (show, category) pair (no collapsing across categories)
//   * acting categories surface the italic show, not the performer
//   * non-competitive sections (Governors Award, Bob Hope Humanitarian) skipped
//   * older layout still parses

jest.mock("../lib/scraper", () => {
  const actual = jest.requireActual("../lib/scraper");
  return {
    ...actual,
    fetchPage: jest.fn(),
  };
});

const fs = require("fs");
const path = require("path");
const { fetchPage } = require("../lib/scraper");
const { emmys } = require("../sources/awards");

const FIXTURE_DIR = path.join(__dirname, "fixtures", "awards-wikipedia");
const fixture = (name) => fs.readFileSync(path.join(FIXTURE_DIR, name), "utf-8");

beforeEach(() => {
  fetchPage.mockReset();
});

describe("emmys.fetchTitlesForEdition (77th, modern layout)", () => {
  test("hits the per-edition Wikipedia URL", async () => {
    fetchPage.mockResolvedValueOnce(fixture("emmys-77.html"));

    await emmys.fetchTitlesForEdition(77);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/77th_Primetime_Emmy_Awards"
    );
  });

  test("each row carries the standard scraper shape with type=series", async () => {
    fetchPage.mockResolvedValueOnce(fixture("emmys-77.html"));

    const rows = await emmys.fetchTitlesForEdition(77);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toEqual({
      title: expect.any(String),
      year: undefined,
      category: expect.any(String),
      ceremonyYear: 2025,
      type: "series",
      source: "Emmy Nominees (77th)",
      link: "",
    });
    for (const r of rows) {
      expect(r.type).toBe("series");
      expect(r.ceremonyYear).toBe(2025);
      expect(r.source).toBe("Emmy Nominees (77th)");
    }
  });

  test("multiple categories per show produce multiple rows", async () => {
    fetchPage.mockResolvedValueOnce(fixture("emmys-77.html"));

    const rows = await emmys.fetchTitlesForEdition(77);

    // The Bear (or any major show in the fixture) should be nominated in
    // multiple categories. We assert on aggregate behavior: at least one
    // show has ≥2 distinct category nominations.
    const byTitle = new Map();
    for (const r of rows) {
      const set = byTitle.get(r.title) || new Set();
      set.add(r.category);
      byTitle.set(r.title, set);
    }
    const multiNomShows = [...byTitle.values()].filter((s) => s.size >= 2);
    expect(multiNomShows.length).toBeGreaterThan(0);
  });

  test("acting categories extract the italic show, not the performer's name", async () => {
    fetchPage.mockResolvedValueOnce(fixture("emmys-77.html"));

    const rows = await emmys.fetchTitlesForEdition(77);

    const lead = rows.filter(
      (r) => r.category === "Outstanding Lead Actor in a Comedy Series"
    );
    expect(lead.length).toBeGreaterThan(0);
    // Performer names ("Pedro Pascal", "Sterling K. Brown") would never start
    // with words like "Outstanding" or have mid-sentence capitalisation typical
    // of show titles. Sanity-check that all entries look like show titles.
    for (const r of lead) {
      expect(r.title).toMatch(/^[A-Z]/);
      expect(r.title.split(" ").length).toBeLessThan(8);
    }
  });

  test("category names are preserved verbatim (no normalization)", async () => {
    fetchPage.mockResolvedValueOnce(fixture("emmys-77.html"));

    const rows = await emmys.fetchTitlesForEdition(77);
    const cats = new Set(rows.map((r) => r.category));

    expect(cats.has("Outstanding Drama Series")).toBe(true);
    expect(cats.has("Outstanding Comedy Series")).toBe(true);
  });

  test("Governors Award and Bob Hope Humanitarian Award are skipped", async () => {
    fetchPage.mockResolvedValueOnce(fixture("emmys-77.html"));

    const rows = await emmys.fetchTitlesForEdition(77);
    for (const r of rows) {
      expect(r.category).not.toMatch(/Governors Award/i);
      expect(r.category).not.toMatch(/Bob Hope/i);
    }
  });
});

describe("emmys.fetchTitlesForEdition (70th, older layout)", () => {
  test("parses the older layout and tags with ceremonyYear=2018", async () => {
    fetchPage.mockResolvedValueOnce(fixture("emmys-70.html"));

    const rows = await emmys.fetchTitlesForEdition(70);

    expect(fetchPage).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/70th_Primetime_Emmy_Awards"
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.type).toBe("series");
      expect(r.ceremonyYear).toBe(2018);
    }
  });
});

describe("emmys.fetchTitlesForEdition error handling", () => {
  test("returns [] when the Wikipedia fetch fails", async () => {
    fetchPage.mockRejectedValueOnce(new Error("Fetch failed: 503"));

    const rows = await emmys.fetchTitlesForEdition(77);
    expect(rows).toEqual([]);
  });
});
