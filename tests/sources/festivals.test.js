// All festivals (Sundance, Cannes, Berlinale, TIFF, Venice) scrape the
// per-edition Wikipedia page now — the official Letterboxd accounts had
// inconsistent year coverage. The Venice fixture is a real trimmed
// Wikipedia page, used as the primary regression check for the wikitable
// parser. Other festivals get URL-shape + tagging assertions, since they
// share the same `fetchWikipediaFilms` code path.

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

// Minimal wikitable stub matching what fetchWikipediaFilms expects: each
// `<tr>`'s first cell holds a `<i>Title</i>` (or `<i><a>Title</a></i>` if
// we want to test the link extraction).
function wikitableHtml(titles) {
  const rows = titles
    .map((t) => `<tr><td><i><a href="/wiki/${t.replace(/\s+/g, "_")}">${t}</a></i></td></tr>`)
    .join("");
  return `<html><body><div id="mw-content-text">
    <table class="wikitable"><tbody>${rows}</tbody></table>
  </div></body></html>`;
}

beforeEach(() => {
  fetchPage.mockReset();
});

describe("sundance.fetchTitlesForYear", () => {
  test("hits the per-year Wikipedia URL and tags rows with the festival year", async () => {
    fetchPage.mockResolvedValueOnce(wikitableHtml(["A Real Pain"]));

    const titles = await sundance.fetchTitlesForYear(2025);

    expect(fetchPage).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/2025_Sundance_Film_Festival"
    );
    expect(titles).toEqual([
      {
        title: "A Real Pain",
        year: undefined,
        type: "movie",
        source: "Sundance (2025)",
        link: "https://en.wikipedia.org/wiki/A_Real_Pain",
      },
    ]);
  });
});

describe("cannes.fetchTitlesForYear", () => {
  test("hits the per-year Wikipedia URL", async () => {
    fetchPage.mockResolvedValueOnce(wikitableHtml(["Anora"]));

    const titles = await cannes.fetchTitlesForYear(2025);

    expect(fetchPage).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/2025_Cannes_Film_Festival"
    );
    expect(titles[0].source).toBe("Cannes (2025)");
  });
});

describe("berlinale.fetchTitlesForYear", () => {
  test("maps year=2026 to the 76th Berlinale Wikipedia page", async () => {
    fetchPage.mockResolvedValueOnce(wikitableHtml(["The Settlers"]));

    const titles = await berlinale.fetchTitlesForYear(2026);

    expect(fetchPage).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/76th_Berlin_International_Film_Festival"
    );
    expect(titles[0].source).toBe("Berlinale (2026)");
  });
});

describe("tiff.fetchTitlesForYear", () => {
  test("hits the per-year TIFF Wikipedia URL", async () => {
    fetchPage.mockResolvedValueOnce(wikitableHtml(["Anora", "The Substance"]));

    const titles = await tiff.fetchTitlesForYear(2024);

    expect(fetchPage).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/2024_Toronto_International_Film_Festival"
    );
    expect(titles.map((t) => t.title)).toEqual(["Anora", "The Substance"]);
    expect(titles.every((t) => t.source === "TIFF (2024)")).toBe(true);
  });
});

describe("backward-compat fetchTitles wrapper", () => {
  test("sundance.fetchTitles() delegates to the current year", async () => {
    fetchPage.mockResolvedValueOnce(wikitableHtml(["X"]));
    await sundance.fetchTitles();
    const url = fetchPage.mock.calls[0][0];
    expect(url).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\/\d{4}_Sundance_Film_Festival$/);
  });
});

describe("venice.fetchTitlesForYear (real Wikipedia fixture)", () => {
  test("hits the per-edition Wikipedia URL and extracts italicized titles from wikitable rows", async () => {
    fetchPage.mockResolvedValueOnce(fixture("venice-2024.html"));

    const titles = await venice.fetchTitlesForYear(2024);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/81st_Venice_International_Film_Festival"
    );
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
    expect(titles[0].year).toBeUndefined();
    expect(titles[0].link).toBe("https://en.wikipedia.org/wiki/The_Brutalist");
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

describe("error handling", () => {
  test("returns [] when the Wikipedia fetch fails", async () => {
    fetchPage.mockRejectedValueOnce(new Error("Fetch failed: 404"));
    const rows = await sundance.fetchTitlesForYear(2018);
    expect(rows).toEqual([]);
  });
});
