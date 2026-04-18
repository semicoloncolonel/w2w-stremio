// Per-category Oscar nominee scraper.
//
// The Letterboxd `/oscars/` account hosts one "feature film nominees" master
// list per ceremony. Its grid view is a flat list of films; the `/detail/`
// view augments each entry with per-film notes that link out to every
// nominated category. We scrape the detail view so we can tag each
// (film, category) pair as one row, ready for the downstream nominations
// aggregation in Task 6.
//
// Fixtures are trimmed copies of the real Letterboxd HTML — just the article
// scaffold + .notes block per film — kept under tests/fixtures/oscars-letterboxd/.

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
const { oscars } = require("../sources/awards");

const FIXTURE_DIR = path.join(__dirname, "fixtures", "oscars-letterboxd");
const fixture = (name) => fs.readFileSync(path.join(FIXTURE_DIR, name), "utf-8");

beforeEach(() => {
  fetchPage.mockReset();
});

describe("oscars.fetchTitlesForEdition (Letterboxd /detail/ scraper)", () => {
  test("hits the per-edition /detail/ URL", async () => {
    fetchPage.mockResolvedValueOnce(fixture("96-detail-page1.html"));

    await oscars.fetchTitlesForEdition(96);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(
      "https://letterboxd.com/oscars/list/the-96th-academy-award-feature-film-nominees/detail/"
    );
  });

  test("returns one row per (film, category) pair with the expected shape", async () => {
    fetchPage.mockResolvedValueOnce(fixture("96-detail-page1.html"));

    const rows = await oscars.fetchTitlesForEdition(96);

    // Every row carries the standard scraper shape plus category +
    // ceremonyYear. We pick the first row to assert exact field set.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toEqual({
      title: expect.any(String),
      year: expect.any(Number),
      category: expect.any(String),
      ceremonyYear: 2024,
      type: "movie",
      source: "Oscar Nominees (96th)",
      link: "",
    });

    // Every row must be tagged with the same edition's ceremonyYear/source.
    for (const r of rows) {
      expect(r.ceremonyYear).toBe(2024);
      expect(r.source).toBe("Oscar Nominees (96th)");
      expect(r.type).toBe("movie");
    }
  });

  test("films with multiple nominations produce one row per category", async () => {
    fetchPage.mockResolvedValueOnce(fixture("96-detail-page1.html"));

    const rows = await oscars.fetchTitlesForEdition(96);

    const oppenheimer = rows.filter((r) => r.title === "Oppenheimer");
    // The fixture's Oppenheimer notes block lists 13 individual nominations.
    expect(oppenheimer).toHaveLength(13);
    const cats = oppenheimer.map((r) => r.category);
    expect(cats).toContain("Best Motion Picture of the Year");
    expect(cats).toContain("Best Director");
    expect(cats).toContain("Best Original Score");
  });

  test("strips the ', <Person>' suffix from acting categories", async () => {
    fetchPage.mockResolvedValueOnce(fixture("96-detail-page1.html"));

    const rows = await oscars.fetchTitlesForEdition(96);

    // The raw notes text reads "Best Actor in a Leading Role, Cillian Murphy".
    // We collapse all acting nominations under the canonical category label
    // so the genre dropdown surfaces one entry, not one-per-actor.
    const oppCats = rows
      .filter((r) => r.title === "Oppenheimer")
      .map((r) => r.category);
    expect(oppCats).toContain("Best Actor in a Leading Role");
    expect(oppCats).toContain("Best Actor in a Supporting Role");
    for (const c of oppCats) {
      expect(c).not.toMatch(/,/);
    }
  });

  test("the same category title appearing on multiple films yields multiple rows", async () => {
    // The aggregation that collapses by IMDb id lives in lib/refresh.js (Task
    // 6). At the scraper layer we want one row per (film, category) so the
    // refresh job can build per-title `nominations` arrays cleanly.
    fetchPage.mockResolvedValueOnce(fixture("96-detail-page1.html"));

    const rows = await oscars.fetchTitlesForEdition(96);

    const bestPicture = rows.filter((r) => r.category === "Best Motion Picture of the Year");
    const titles = bestPicture.map((r) => r.title);
    // Anatomy of a Fall, Oppenheimer, and Past Lives all show up in the
    // fixture's Best Picture nominations.
    expect(titles).toEqual(expect.arrayContaining(["Oppenheimer", "Anatomy of a Fall", "Past Lives"]));
    // No deduping at scraper level — we want the raw cross-product.
    expect(new Set(titles).size).toBe(titles.length);
  });

  test("walks `a.next` pagination on the detail view", async () => {
    fetchPage
      .mockResolvedValueOnce(fixture("paginated-page1.html"))
      .mockResolvedValueOnce(fixture("paginated-page2.html"));

    const rows = await oscars.fetchTitlesForEdition(97);

    expect(fetchPage).toHaveBeenNthCalledWith(
      1,
      "https://letterboxd.com/oscars/list/the-97th-academy-award-feature-film-nominees/detail/"
    );
    expect(fetchPage).toHaveBeenNthCalledWith(
      2,
      "https://letterboxd.com/oscars/list/the-97th-academy-award-feature-film-nominees/detail/page/2/"
    );
    const titles = rows.map((r) => r.title);
    expect(titles).toEqual(["Anora", "The Brutalist"]);
  });

  test("stops paginating once `a.next` is missing (page1 is terminal)", async () => {
    fetchPage.mockResolvedValueOnce(fixture("96-detail-page1.html"));

    await oscars.fetchTitlesForEdition(96);

    // Single page = single fetchPage call. No infinite loop, no extra fetches.
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  test("returns [] (and does not throw) when the master list fetch fails", async () => {
    fetchPage.mockRejectedValueOnce(new Error("Fetch failed: 503"));

    const rows = await oscars.fetchTitlesForEdition(96);

    expect(rows).toEqual([]);
  });

  test("ceremonyYear matches years.oscars.ceremonyYear(n) for non-current editions", async () => {
    fetchPage.mockResolvedValueOnce(fixture("96-detail-page1.html"));

    const rows = await oscars.fetchTitlesForEdition(95);
    // 95th ceremony honors 2022 films, held in 2023 → ceremonyYear = 2023.
    for (const r of rows) {
      expect(r.ceremonyYear).toBe(2023);
      expect(r.source).toBe("Oscar Nominees (95th)");
    }
  });
});

describe("oscars.fetchTitles backward-compat wrapper", () => {
  test("delegates to fetchTitlesForEdition(years.oscars.current)", async () => {
    fetchPage.mockResolvedValueOnce(fixture("96-detail-page1.html"));

    await oscars.fetchTitles();

    // The current edition lives in config/years; we assert the URL shape only
    // so this test keeps working past the next ceremony bump.
    const calledUrl = fetchPage.mock.calls[0][0];
    expect(calledUrl).toMatch(
      /^https:\/\/letterboxd\.com\/oscars\/list\/the-\d+(?:st|nd|rd|th)-academy-award-feature-film-nominees\/detail\/$/
    );
  });
});
