const { fetchPage, loadCheerio } = require("../lib/scraper");
const years = require("../config/years");

// Per-festival metadata. URL building lives in config/years; this map only
// supplies the human-readable name and the years.<key> lookup.
const FESTIVALS = {
  sundance: { name: "Sundance", configKey: "sundance" },
  cannes: { name: "Cannes", configKey: "cannes" },
  berlinale: { name: "Berlinale", configKey: "berlinale" },
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

function createFestivalSource(key) {
  const meta = FESTIVALS[key];
  if (!meta) return null;

  async function fetchTitlesForYear(y) {
    const url = years[meta.configKey].letterboxdUrl(y);
    const sourceLabel = `${meta.name} (${y})`;
    const films = await fetchAllPages(url);

    const seen = new Set();
    const out = [];
    for (const film of films) {
      const k = film.title.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...film, source: sourceLabel });
    }
    console.log(`${sourceLabel}: ${out.length} films from Letterboxd`);
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

module.exports = { sundance, cannes, berlinale };
