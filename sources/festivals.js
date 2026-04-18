const { fetchPage, loadCheerio } = require("../lib/scraper");
const years = require("../config/years");

// All festivals scrape the per-edition Wikipedia page. We previously used the
// official festival Letterboxd accounts but coverage was inconsistent: Cannes
// only kept a current-year list, Berlinale only kept the current edition,
// Sundance only had 2023+, etc. Wikipedia has reliable per-edition pages
// going back decades and a stable URL pattern (encoded in config/years.js).
// The cost: Wikipedia tables don't carry per-film release year, so the
// downstream TMDB resolver matches by title only — fine for festival
// catalogs where the festival year already implies the film's recency.
const FESTIVALS = {
  sundance: { name: "Sundance", configKey: "sundance" },
  cannes: { name: "Cannes", configKey: "cannes" },
  berlinale: { name: "Berlinale", configKey: "berlinale" },
  tiff: { name: "TIFF", configKey: "tiff" },
  venice: { name: "Venice", configKey: "venice" },
};

// Pull film titles from a per-edition Wikipedia page. Two complementary
// passes — modern festival pages (~2024+) lay films out in `table.wikitable`
// rows, but older pages (Sundance 2016-2023, etc.) use bullet lists under
// section headings, with each film as `<li><i><a>Title</a></i></li>`.
// We collect from both paths and dedupe at the call site.
//
// The `<ol class="references">` filter on the list pass is important: footnote
// references italicise publication names ("Variety", "Deadline Hollywood")
// which would otherwise be picked up as fake films.
async function fetchWikipediaFilms(url) {
  const html = await fetchPage(url);
  const $ = loadCheerio(html);
  const films = [];

  $("#mw-content-text table.wikitable").each((_, table) => {
    $(table)
      .find("tr")
      .each((__, tr) => {
        const $cells = $(tr).find("td, th");
        if ($cells.length === 0) return;
        const $italic = $($cells[0]).find("i").first();
        const title = $italic.text().trim();
        if (!title) return;
        if (/^english title$|^original title$/i.test(title)) return;
        const href = $italic.find("a").attr("href") || "";
        const link = href ? `https://en.wikipedia.org${href}` : "";
        films.push({
          title,
          year: undefined,
          type: "movie",
          source: "",
          link,
        });
      });
  });

  $("#mw-content-text li i a").each((_, a) => {
    const $a = $(a);
    if ($a.parents("ol.references").length > 0) return;
    if ($a.parents("table.wikitable").length > 0) return;
    const title = $a.text().trim();
    if (!title) return;
    const href = $a.attr("href") || "";
    const link = href ? `https://en.wikipedia.org${href}` : "";
    films.push({
      title,
      year: undefined,
      type: "movie",
      source: "",
      link,
    });
  });

  return films;
}

function createFestivalSource(key) {
  const meta = FESTIVALS[key];
  if (!meta) return null;
  const cfg = years[meta.configKey];

  async function fetchTitlesForYear(y) {
    const sourceLabel = `${meta.name} (${y})`;
    const url = cfg.wikipediaUrl(y);
    let films;
    try {
      films = await fetchWikipediaFilms(url);
    } catch (err) {
      console.error(`${sourceLabel} fetch error (${url}):`, err.message);
      return [];
    }

    const seen = new Set();
    const out = [];
    for (const film of films) {
      const k = film.title.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...film, source: sourceLabel });
    }
    console.log(`${sourceLabel}: ${out.length} films from Wikipedia`);
    return out;
  }

  return {
    name: meta.name,
    id: key,
    fetchTitlesForYear,
    fetchTitles() {
      return fetchTitlesForYear(cfg.currentYear);
    },
  };
}

const sundance = createFestivalSource("sundance");
const cannes = createFestivalSource("cannes");
const berlinale = createFestivalSource("berlinale");
const tiff = createFestivalSource("tiff");
const venice = createFestivalSource("venice");

module.exports = { sundance, cannes, berlinale, tiff, venice };
