jest.mock("../../lib/scraper", () => {
  const actual = jest.requireActual("../../lib/scraper");
  return {
    ...actual,
    fetchPage: jest.fn(),
  };
});

const { fetchPage } = require("../../lib/scraper");
const { oscars, goldenGlobes, emmys } = require("../../sources/awards");

beforeEach(() => {
  fetchPage.mockReset();
});

// Letterboxd list pages embed films as <div class="react-component"
// data-film-id=...> with `data-item-name="Title (Year)"`. Anything else on the
// page is irrelevant for our scraper, so the snippets stay tiny.
function letterboxdHtml(films) {
  const cards = films
    .map(
      ([name]) =>
        `<div class="react-component" data-film-id="${name}" data-item-name="${name}"></div>`
    )
    .join("");
  // No `<a class="next">` -> no pagination, scraper stops after one page.
  return `<html><body>${cards}</body></html>`;
}

// Wikipedia TV-section snippet: a heading the scraper anchors on, followed
// by a wikitable whose <li><i><a> entries are show titles.
function wikipediaTvHtml(shows) {
  const lis = shows
    .map((title) => `<li><i><a href="/wiki/${title}">${title}</a></i></li>`)
    .join("");
  return `
    <html><body>
      <h2><span id="Television">Television</span></h2>
      <table class="wikitable"><tbody><tr><td><ul>${lis}</ul></td></tr></tbody></table>
    </body></html>
  `;
}

// Wikipedia all-TV page (no Television heading -> fallback path).
function wikipediaAllTvHtml(shows) {
  const lis = shows
    .map((title) => `<li><i><a href="/wiki/${title}">${title}</a></i></li>`)
    .join("");
  return `
    <html><body>
      <table class="wikitable"><tbody><tr><td><ul>${lis}</ul></td></tr></tbody></table>
    </body></html>
  `;
}

describe("oscars.fetchTitlesForEdition", () => {
  test("hits the edition-specific Letterboxd URL and returns parsed films", async () => {
    fetchPage.mockResolvedValueOnce(letterboxdHtml([["Anora (2024)"], ["The Brutalist (2024)"]]));

    const titles = await oscars.fetchTitlesForEdition(98);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(
      "https://letterboxd.com/oscars/list/the-98th-academy-award-nominees-all-feature/"
    );
    expect(titles).toHaveLength(2);
    expect(titles[0]).toMatchObject({
      title: "Anora",
      year: 2024,
      type: "movie",
      source: "Oscar Nominees (98th)",
    });
    expect(titles[1]).toMatchObject({ title: "The Brutalist", year: 2024 });
  });
});

describe("emmys.fetchTitlesForEdition", () => {
  test("hits the edition-specific Wikipedia URL and returns parsed shows", async () => {
    fetchPage.mockResolvedValueOnce(wikipediaAllTvHtml(["Shogun", "The Bear"]));

    const titles = await emmys.fetchTitlesForEdition(77);

    expect(fetchPage).toHaveBeenCalledWith(
      "https://en.wikipedia.org/wiki/77th_Primetime_Emmy_Awards"
    );
    const names = titles.map((t) => t.title).sort();
    expect(names).toEqual(["Shogun", "The Bear"]);
    for (const t of titles) {
      expect(t.type).toBe("series");
      expect(t.source).toBe("Emmy Nominees (77th)");
    }
  });
});

describe("goldenGlobes.fetchTitlesForEdition", () => {
  test("merges Letterboxd films + Wikipedia TV nominees and dedupes by title", async () => {
    // First fetchPage call = Letterboxd films (one page, no `next`).
    // Second fetchPage call = Wikipedia TV. We seed an overlapping title
    // ("Shogun") to confirm the dedupe logic.
    fetchPage
      .mockResolvedValueOnce(
        letterboxdHtml([
          ["Anora (2024)"],
          ["Shogun (2024)"], // intentional collision with the TV list below
        ])
      )
      .mockResolvedValueOnce(wikipediaTvHtml(["Shogun", "The Bear"]));

    const titles = await goldenGlobes.fetchTitlesForEdition(83);

    expect(fetchPage).toHaveBeenNthCalledWith(
      1,
      "https://letterboxd.com/filmfestival/list/2026-golden-globes-nominations/"
    );
    expect(fetchPage).toHaveBeenNthCalledWith(
      2,
      "https://en.wikipedia.org/wiki/83rd_Golden_Globe_Awards"
    );

    const names = titles.map((t) => t.title);
    expect(names).toEqual(["Anora", "Shogun", "The Bear"]);
    for (const t of titles) {
      expect(t.source).toBe("Golden Globe Nominees (83rd)");
    }
  });
});

describe("backward-compat fetchTitles wrapper", () => {
  test("oscars.fetchTitles() delegates to the current edition", async () => {
    fetchPage.mockResolvedValueOnce(letterboxdHtml([["Anora (2024)"]]));
    await oscars.fetchTitles();
    // The current edition is centralised in config/years; we only assert the
    // URL shape so this test keeps working when the bumps roll over.
    const url = fetchPage.mock.calls[0][0];
    expect(url).toMatch(
      /^https:\/\/letterboxd\.com\/oscars\/list\/the-\d+(?:st|nd|rd|th)-academy-award-nominees-all-feature\/$/
    );
  });
});
