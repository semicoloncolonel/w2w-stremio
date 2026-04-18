jest.mock("../../lib/scraper", () => {
  const actual = jest.requireActual("../../lib/scraper");
  return {
    ...actual,
    fetchPage: jest.fn(),
  };
});

const { fetchPage } = require("../../lib/scraper");
const { sundance, cannes, berlinale } = require("../../sources/festivals");

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
