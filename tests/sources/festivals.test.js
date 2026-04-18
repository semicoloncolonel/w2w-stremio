jest.mock("../../lib/scraper", () => {
  const actual = jest.requireActual("../../lib/scraper");
  return {
    ...actual,
    fetchPage: jest.fn(),
  };
});

const fs = require("fs");
const path = require("path");
const { fetchPage } = require("../../lib/scraper");
const { sundance, cannes, berlinale, tiff, venice } = require("../../sources/festivals");

const FIXTURES = path.join(__dirname, "..", "fixtures", "festivals");
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), "utf8");

beforeEach(() => {
  fetchPage.mockReset();
});

// Mirror the awards-test snippet: minimal Letterboxd list page with no
// pagination link, so the scraper stops after one fetchPage call.
function letterboxdHtml(films) {
  const cards = films
    .map(
      ([name]) =>
        `<div class="react-component" data-film-id="${name}" data-item-name="${name}" data-item-link="/film/${name}/"></div>`
    )
    .join("");
  return `<html><body>${cards}</body></html>`;
}

describe("sundance.fetchTitlesForYear", () => {
  test("hits the year-specific Letterboxd URL and returns parsed films", async () => {
    fetchPage.mockResolvedValueOnce(letterboxdHtml([["A Real Pain (2024)"]]));

    const titles = await sundance.fetchTitlesForYear(2025);

    expect(fetchPage).toHaveBeenCalledWith(
      "https://letterboxd.com/sundance/list/2025-sundance-film-festival/"
    );
    expect(titles).toHaveLength(1);
    expect(titles[0]).toMatchObject({
      title: "A Real Pain",
      year: 2024,
      type: "movie",
      source: "Sundance (2025)",
    });
  });
});

describe("cannes.fetchTitlesForYear", () => {
  test("hits the year-specific Letterboxd URL and tags with the year", async () => {
    fetchPage.mockResolvedValueOnce(letterboxdHtml([["Anora (2024)"]]));

    const titles = await cannes.fetchTitlesForYear(2025);

    expect(fetchPage).toHaveBeenCalledWith(
      "https://letterboxd.com/festival_cannes/list/festival-de-cannes-official-selection-2025/"
    );
    expect(titles[0].source).toBe("Cannes (2025)");
  });
});

describe("berlinale.fetchTitlesForYear", () => {
  test("hits the year-specific Letterboxd URL and tags with the year", async () => {
    fetchPage.mockResolvedValueOnce(letterboxdHtml([["The Settlers (2023)"]]));

    const titles = await berlinale.fetchTitlesForYear(2026);

    expect(fetchPage).toHaveBeenCalledWith(
      "https://letterboxd.com/berlinale_ifb/list/berlinale-programme-2026/"
    );
    expect(titles[0].source).toBe("Berlinale (2026)");
  });
});

describe("backward-compat fetchTitles wrapper", () => {
  test("sundance.fetchTitles() delegates to the current year", async () => {
    fetchPage.mockResolvedValueOnce(letterboxdHtml([["A Real Pain (2024)"]]));
    await sundance.fetchTitles();
    const url = fetchPage.mock.calls[0][0];
    expect(url).toMatch(
      /^https:\/\/letterboxd\.com\/sundance\/list\/\d{4}-sundance-film-festival\/$/
    );
  });
});

describe("tiff.fetchTitlesForYear", () => {
  test("hits the year-specific tiff_net Letterboxd URL, follows pagination, and dedupes", async () => {
    fetchPage.mockResolvedValueOnce(fixture("tiff-2024-page1.html"));
    fetchPage.mockResolvedValueOnce(fixture("tiff-2024-page2.html"));

    const titles = await tiff.fetchTitlesForYear(2024);

    expect(fetchPage).toHaveBeenNthCalledWith(
      1,
      "https://letterboxd.com/tiff_net/list/2024-toronto-international-film-festival/"
    );
    expect(fetchPage).toHaveBeenNthCalledWith(
      2,
      "https://letterboxd.com/tiff_net/list/2024-toronto-international-film-festival/page/2/"
    );
    // page1 has 3 unique films, page2 adds 1 new + 1 dupe -> 4 unique
    expect(titles).toHaveLength(4);
    expect(titles.map((t) => t.title)).toEqual([
      "Anora",
      "The Substance",
      "Conclave",
      "The Brutalist",
    ]);
    expect(titles[0]).toMatchObject({
      title: "Anora",
      year: 2024,
      type: "movie",
      source: "TIFF (2024)",
    });
    expect(titles[0].link).toBe("https://letterboxd.com/film/anora/");
  });

  test("stops paginating when no a.next link exists", async () => {
    fetchPage.mockResolvedValueOnce(fixture("tiff-2024-page2.html"));
    await tiff.fetchTitlesForYear(2023);
    // single fetchPage call: page2 has no a.next
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(
      "https://letterboxd.com/tiff_net/list/2023-toronto-international-film-festival/"
    );
  });
});

describe("venice.fetchTitlesForYear", () => {
  test("hits the per-edition Wikipedia URL and extracts italicized titles from wikitable rows", async () => {
    fetchPage.mockResolvedValueOnce(fixture("venice-2024.html"));

    const titles = await venice.fetchTitlesForYear(2024);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/81st_Venice_International_Film_Festival"
    );
    // 4 unique titles (The Brutalist appears twice and is deduped, "Should Not Appear" lives outside wikitable)
    expect(titles.map((t) => t.title)).toEqual([
      "The Brutalist",
      "Babygirl",
      "Joker: Folie à Deux",
      "Wolfs",
    ]);
    expect(titles[0]).toMatchObject({
      title: "The Brutalist",
      type: "movie",
      source: "Venice (2024)",
    });
    // Wikipedia tables don't expose film year
    expect(titles[0].year).toBeUndefined();
    // When the title cell has an <a>, link points at the absolute Wikipedia URL
    expect(titles[0].link).toBe("https://en.wikipedia.org/wiki/The_Brutalist");
    // When there's no <a>, link is empty string (Wolfs has plain <i>)
    const wolfs = titles.find((t) => t.title === "Wolfs");
    expect(wolfs.link).toBe("");
  });

  test("uses the correct edition-to-year mapping (year - 1943)", async () => {
    fetchPage.mockResolvedValueOnce("<div id='mw-content-text'></div>");
    await venice.fetchTitlesForYear(2025);
    expect(fetchPage).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/82nd_Venice_International_Film_Festival"
    );

    fetchPage.mockResolvedValueOnce("<div id='mw-content-text'></div>");
    await venice.fetchTitlesForYear(2020);
    expect(fetchPage).toHaveBeenLastCalledWith(
      "https://en.wikipedia.org/wiki/77th_Venice_International_Film_Festival"
    );
  });

  test("source label uses festival year, not film year", async () => {
    fetchPage.mockResolvedValueOnce(fixture("venice-2024.html"));
    const titles = await venice.fetchTitlesForYear(2024);
    expect(titles.every((t) => t.source === "Venice (2024)")).toBe(true);
  });
});
