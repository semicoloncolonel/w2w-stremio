// Per-category Golden Globes nominee scraper.
//
// Drives goldenGlobes.fetchTitlesForEdition(n) against trimmed Wikipedia
// fixtures (modern 81st layout + older 70th layout). Confirms:
//   * type assignment splits Film vs Television via the section anchor
//   * one row per (title, category) pair (no collapsing across categories)
//   * acting categories surface the italic film/series, not the person
//   * non-competitive sections (Cecil B. DeMille, Carol Burnett) are skipped
//   * older table layout (parent/sub <th> rows) is parsed correctly
//   * "Films with multiple nominations" aggregation tables don't leak in

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
const { goldenGlobes } = require("../sources/awards");

const FIXTURE_DIR = path.join(__dirname, "fixtures", "awards-wikipedia");
const fixture = (name) => fs.readFileSync(path.join(FIXTURE_DIR, name), "utf-8");

beforeEach(() => {
  fetchPage.mockReset();
});

describe("goldenGlobes.fetchTitlesForEdition (81st, modern layout)", () => {
  test("hits the per-edition Wikipedia URL", async () => {
    fetchPage.mockResolvedValueOnce(fixture("globes-81.html"));

    await goldenGlobes.fetchTitlesForEdition(81);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/81st_Golden_Globe_Awards"
    );
  });

  test("each row carries the standard scraper shape", async () => {
    fetchPage.mockResolvedValueOnce(fixture("globes-81.html"));

    const rows = await goldenGlobes.fetchTitlesForEdition(81);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toEqual({
      title: expect.any(String),
      year: undefined,
      category: expect.any(String),
      ceremonyYear: 2024,
      type: expect.stringMatching(/^(movie|series)$/),
      source: "Golden Globe Nominees (81st)",
      link: "",
    });
    for (const r of rows) {
      expect(r.ceremonyYear).toBe(2024);
      expect(r.source).toBe("Golden Globe Nominees (81st)");
    }
  });

  test("Film categories are tagged type=movie and Television categories type=series", async () => {
    fetchPage.mockResolvedValueOnce(fixture("globes-81.html"));

    const rows = await goldenGlobes.fetchTitlesForEdition(81);

    const oppenheimer = rows.find((r) => r.title === "Oppenheimer");
    expect(oppenheimer.type).toBe("movie");

    const succession = rows.find((r) => r.title === "Succession");
    expect(succession.type).toBe("series");
  });

  test("multiple categories per title produce multiple rows", async () => {
    fetchPage.mockResolvedValueOnce(fixture("globes-81.html"));

    const rows = await goldenGlobes.fetchTitlesForEdition(81);

    // Oppenheimer is in Best Picture Drama AND Best Actor Drama.
    const oppRows = rows.filter((r) => r.title === "Oppenheimer");
    expect(oppRows.length).toBeGreaterThanOrEqual(2);
    const cats = oppRows.map((r) => r.category);
    expect(cats).toContain("Best Motion Picture \u2013 Drama");
    expect(cats).toContain("Best Actor in a Motion Picture \u2013 Drama");
  });

  test("acting categories extract the italic film/series, not the actor's name", async () => {
    fetchPage.mockResolvedValueOnce(fixture("globes-81.html"));

    const rows = await goldenGlobes.fetchTitlesForEdition(81);

    const actingRows = rows.filter(
      (r) => r.category === "Best Actor in a Motion Picture \u2013 Drama"
    );
    const titles = actingRows.map((r) => r.title);
    // We want the films, not actor names like "Cillian Murphy".
    expect(titles).toEqual(
      expect.arrayContaining(["Oppenheimer", "Maestro", "Killers of the Flower Moon"])
    );
    expect(titles).not.toContain("Cillian Murphy");
    expect(titles).not.toContain("Bradley Cooper");
  });

  test("category names are preserved verbatim (no normalization)", async () => {
    fetchPage.mockResolvedValueOnce(fixture("globes-81.html"));

    const rows = await goldenGlobes.fetchTitlesForEdition(81);
    const cats = new Set(rows.map((r) => r.category));

    // Globes Wikipedia uses an en-dash separator (\u2013, "–"). We preserve
    // it as-is so the category dropdown matches the page exactly.
    expect(cats.has("Best Motion Picture \u2013 Drama")).toBe(true);
    expect(cats.has("Best Motion Picture \u2013 Musical or Comedy")).toBe(true);
  });

  test("Cecil B. DeMille and Carol Burnett honorary awards are skipped", async () => {
    fetchPage.mockResolvedValueOnce(fixture("globes-81.html"));

    const rows = await goldenGlobes.fetchTitlesForEdition(81);
    for (const r of rows) {
      expect(r.category).not.toMatch(/Cecil B/i);
      expect(r.category).not.toMatch(/Carol Burnett/i);
    }
  });

  test('"Films with multiple nominations" aggregation tables do not leak in', async () => {
    fetchPage.mockResolvedValueOnce(fixture("globes-81.html"));

    const rows = await goldenGlobes.fetchTitlesForEdition(81);
    // The aggregation table has cells with raw numbers (9, 8). If we'd
    // accidentally parsed those tables we'd see categories like "9" or row
    // titles equal to plain numbers.
    for (const r of rows) {
      expect(r.title).not.toMatch(/^\d+$/);
      expect(r.category).not.toMatch(/^\d+$/);
    }
  });
});

describe("goldenGlobes.fetchTitlesForEdition (70th, pre-2017 layout)", () => {
  test("parses parent/sub <th> rows into 'Parent \u2013 Sub' categories", async () => {
    fetchPage.mockResolvedValueOnce(fixture("globes-70.html"));

    const rows = await goldenGlobes.fetchTitlesForEdition(70);

    expect(fetchPage).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/70th_Golden_Globe_Awards"
    );

    const cats = new Set(rows.map((r) => r.category));
    expect(cats.has("Best Motion Picture \u2013 Drama")).toBe(true);
    expect(cats.has("Best Motion Picture \u2013 Musical or Comedy")).toBe(true);
    expect(cats.has("Best Performance in a Motion Picture \u2013 Drama \u2013 Actor")).toBe(true);
    expect(cats.has("Best Performance in a Motion Picture \u2013 Drama \u2013 Actress")).toBe(true);
  });

  test("falls back to the parent label when there's no sub-header row", async () => {
    fetchPage.mockResolvedValueOnce(fixture("globes-70.html"));

    const rows = await goldenGlobes.fetchTitlesForEdition(70);

    const animated = rows.filter((r) => r.category === "Best Animated Feature Film");
    const titles = animated.map((r) => r.title);
    expect(titles).toEqual(
      expect.arrayContaining(["Brave", "Frankenweenie", "Hotel Transylvania"])
    );
  });

  test("Cecil B. DeMille honorary section is skipped in old layout too", async () => {
    fetchPage.mockResolvedValueOnce(fixture("globes-70.html"));
    const rows = await goldenGlobes.fetchTitlesForEdition(70);
    for (const r of rows) expect(r.category).not.toMatch(/Cecil B/i);
  });

  test("Television section parses with type=series and ceremonyYear=2013", async () => {
    fetchPage.mockResolvedValueOnce(fixture("globes-70.html"));

    const rows = await goldenGlobes.fetchTitlesForEdition(70);

    const tv = rows.filter((r) => r.type === "series");
    expect(tv.length).toBeGreaterThan(0);
    for (const r of tv) expect(r.ceremonyYear).toBe(2013);

    const homeland = rows.filter((r) => r.title === "Homeland");
    // Best Series – Drama AND Best Performance in a TV Series – Drama – Actor
    // and – Actress (because Damian Lewis & Claire Danes are both nominated
    // for Homeland in the fixture).
    expect(homeland.length).toBeGreaterThanOrEqual(2);
    for (const r of homeland) expect(r.type).toBe("series");
  });
});

describe("goldenGlobes.fetchTitlesForEdition error handling", () => {
  test("returns [] when the Wikipedia fetch fails", async () => {
    fetchPage.mockRejectedValueOnce(new Error("Fetch failed: 503"));

    const rows = await goldenGlobes.fetchTitlesForEdition(81);
    expect(rows).toEqual([]);
  });
});
