const { fetchPage, loadCheerio } = require("../lib/scraper");
const years = require("../config/years");

// Per-festival metadata. URL building lives in config/years; this map only
// supplies the human-readable name and the years.<key> lookup.
//
// Source rationale (verified 2026-04-17):
// - Sundance / Cannes / Berlinale / TIFF: official Letterboxd accounts with
//   per-year lists. Use the shared `fetchAllPages` Letterboxd scraper.
// - Venice: NO official Letterboxd account. Community lists exist
//   (`neperfectionist`) but coverage is patchy — 2020 returns 404 and
//   recent-year totals (~170) are smaller than Wikipedia (~200-250). We
//   scrape the per-edition Wikipedia page instead, which uses
//   `table.wikitable` rows with the film title in italics in column 1.
const FESTIVALS = {
  sundance: { name: "Sundance", configKey: "sundance", scraper: "letterboxd" },
  cannes: { name: "Cannes", configKey: "cannes", scraper: "letterboxd" },
  berlinale: { name: "Berlinale", configKey: "berlinale", scraper: "letterboxd" },
  tiff: { name: "TIFF", configKey: "tiff", scraper: "letterboxd" },
  venice: { name: "Venice", configKey: "venice", scraper: "wikipedia" },
};

// Letterboxd festival-list scraper (one page).
async function fetchListPage(url) {
  const html = await fetchPage(url);
  const $ = loadCheerio(html);
  const films = [];

  $("div.react-component[data-film-id]").each((_, el) => {
    const name = $(el).attr("data-item-name");
    if (!name) return;

    const match = name.match(/^(.+?)\s*\((\d{4})\)\s*$/);
    const title = match ? match[1].trim() : name.trim();
    const year = match ? parseInt(match[2]) : undefined;

    films.push({
      title,
      year,
      type: "movie",
      source: "",
      link: `https://letterboxd.com${$(el).attr("data-item-link") || ""}`,
    });
  });

  const nextLink = $("a.next").attr("href");
  return { films, nextUrl: nextLink ? `https://letterboxd.com${nextLink}` : null };
}

async function fetchAllPages(baseUrl) {
  const allFilms = [];
  let url = baseUrl;
  let pageCount = 0;
  const MAX_PAGES = 5;

  while (url && pageCount < MAX_PAGES) {
    try {
      const { films, nextUrl } = await fetchListPage(url);
      allFilms.push(...films);
      url = nextUrl;
      pageCount++;
      if (url) await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`Festival page error (${url}):`, err.message);
      break;
    }
  }

  return allFilms;
}

// Wikipedia festival-page scraper. Used for Venice (no official Letterboxd
// list). Walks every `table.wikitable` in the article body and pulls the
// italic title from each row's first cell. Wikipedia tables don't expose the
// film's release year, so `year` is left undefined — that's fine, the
// festival year is conveyed via the `source` label.
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
        // Skip header-ish rows (e.g. column "English title" italicized as a
        // header label). Real header cells use <th>, but defensively check
        // for known column-name strings.
        if (/^english title$|^original title$/i.test(title)) return;
        // Try to get a stable Wikipedia link if present, for parity with
        // the Letterboxd `link` field (used by downstream IMDb resolution).
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

  return films;
}

function createFestivalSource(key) {
  const meta = FESTIVALS[key];
  if (!meta) return null;

  async function fetchTitlesForYear(y) {
    const cfg = years[meta.configKey];
    const sourceLabel = `${meta.name} (${y})`;
    let films;
    if (meta.scraper === "wikipedia") {
      const url = cfg.wikipediaUrl(y);
      films = await fetchWikipediaFilms(url);
    } else {
      const url = cfg.letterboxdUrl(y);
      films = await fetchAllPages(url);
    }

    const seen = new Set();
    const out = [];
    for (const film of films) {
      const k = film.title.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...film, source: sourceLabel });
    }
    console.log(`${sourceLabel}: ${out.length} films from ${meta.scraper}`);
    return out;
  }

  return {
    name: meta.name,
    id: key,
    fetchTitlesForYear,
    // Backward-compat wrapper for the current addon.js catalog handler. Batch D
    // will replace the call site with a direct year lookup; until then this
    // keeps the existing "current year" behavior intact.
    fetchTitles() {
      return fetchTitlesForYear(years[meta.configKey].currentYear);
    },
  };
}

const sundance = createFestivalSource("sundance");
const cannes = createFestivalSource("cannes");
const berlinale = createFestivalSource("berlinale");
const tiff = createFestivalSource("tiff");
const venice = createFestivalSource("venice");

module.exports = { sundance, cannes, berlinale, tiff, venice };
