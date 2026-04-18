// Oscars now use the per-edition Wikipedia page (the Letterboxd /oscars/
// account began returning HTTP 403 in 2026). The Wikipedia category-table
// parser is exhaustively covered by the globes/emmys tests, so here we
// just verify the oscars wrapper:
//   * hits the right wikipediaUrl
//   * tags every row with type=movie + ceremonyYear + the "Oscar Nominees
//     (Nth)" source label
//   * swallows fetch errors and returns []

jest.mock("../lib/scraper", () => {
  const actual = jest.requireActual("../lib/scraper");
  return {
    ...actual,
    fetchPage: jest.fn(),
  };
});

const { fetchPage } = require("../lib/scraper");
const { oscars } = require("../sources/awards");

// Minimal modern wikitable cell layout — same shape parseModernCell expects.
function oscarsWikiHtml(rows) {
  const cells = rows
    .map(({ category, films }) => {
      const lis = films.map((f) => `<li><i>${f}</i></li>`).join("");
      return `<td><div><b><a>${category}</a></b></div><ul>${lis}</ul></td>`;
    })
    .join("");
  return `<html><body><div id="mw-content-text">
    <div class="mw-heading mw-heading3"><h3 id="Awards">Awards</h3></div>
    <table class="wikitable"><tbody><tr>${cells}</tr></tbody></table>
  </div></body></html>`;
}

beforeEach(() => {
  fetchPage.mockReset();
});

describe("oscars.fetchTitlesForEdition", () => {
  test("hits the per-edition Wikipedia URL", async () => {
    fetchPage.mockResolvedValueOnce(oscarsWikiHtml([]));

    await oscars.fetchTitlesForEdition(97);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith("https://en.wikipedia.org/wiki/97th_Academy_Awards");
  });

  test("returns one row per (film, category) pair tagged movie + ceremonyYear", async () => {
    fetchPage.mockResolvedValueOnce(
      oscarsWikiHtml([
        { category: "Best Picture", films: ["Anora", "The Brutalist"] },
        { category: "Best Director", films: ["Anora"] },
      ])
    );

    const rows = await oscars.fetchTitlesForEdition(97);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      title: "Anora",
      year: undefined,
      category: "Best Picture",
      ceremonyYear: 2025,
      type: "movie",
      source: "Oscar Nominees (97th)",
      link: "",
    });

    const anora = rows.filter((r) => r.title === "Anora");
    expect(anora.map((r) => r.category).sort()).toEqual(["Best Director", "Best Picture"]);
  });

  test("returns [] when the Wikipedia fetch fails", async () => {
    fetchPage.mockRejectedValueOnce(new Error("Fetch failed: 503"));

    const rows = await oscars.fetchTitlesForEdition(97);
    expect(rows).toEqual([]);
  });
});

describe("oscars.fetchTitles backward-compat wrapper", () => {
  test("delegates to fetchTitlesForEdition(years.oscars.current)", async () => {
    fetchPage.mockResolvedValueOnce(oscarsWikiHtml([]));

    await oscars.fetchTitles();

    const url = fetchPage.mock.calls[0][0];
    expect(url).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\/\d+(?:st|nd|rd|th)_Academy_Awards$/);
  });
});
