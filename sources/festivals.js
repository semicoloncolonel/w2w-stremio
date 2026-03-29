const { fetchPage, loadCheerio } = require("../lib/scraper");
const cache = require("../lib/cache");

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days — festival lineups are static once announced

// Letterboxd list URLs for each festival
const FESTIVAL_LISTS = {
  sundance: {
    name: "Sundance",
    urls: ["https://letterboxd.com/sundance/list/2025-sundance-film-festival/"],
  },
  cannes: {
    name: "Cannes",
    urls: ["https://letterboxd.com/festival_cannes/list/festival-de-cannes-official-selection-2025/"],
  },
  berlinale: {
    name: "Berlinale",
    urls: ["https://letterboxd.com/berlinale_ifb/list/berlinale-programme-2026/"],
  },
};

async function fetchListPage(url) {
  const html = await fetchPage(url);
  const $ = loadCheerio(html);
  const films = [];

  $("div.react-component[data-film-id]").each((_, el) => {
    const name = $(el).attr("data-item-name");
    if (!name) return;

    // Parse "Title (Year)" format
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

  // Check for next page
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
      if (url) await new Promise((r) => setTimeout(r, 500)); // polite delay
    } catch (err) {
      console.error(`Festival page error (${url}):`, err.message);
      break;
    }
  }

  return allFilms;
}

function createFestivalSource(key) {
  const festival = FESTIVAL_LISTS[key];
  if (!festival) return null;

  const cacheKey = `source:festival:${key}`;

  async function fetchTitles() {
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const allFilms = [];
    const seen = new Set();

    for (const url of festival.urls) {
      const films = await fetchAllPages(url);
      for (const film of films) {
        const k = film.title.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        allFilms.push({ ...film, source: festival.name });
      }
    }

    console.log(`${festival.name}: ${allFilms.length} films from Letterboxd`);
    cache.set(cacheKey, allFilms, CACHE_TTL);
    return allFilms;
  }

  return {
    fetchTitles,
    name: festival.name,
    id: key,
  };
}

// Export individual festival sources
const sundance = createFestivalSource("sundance");
const cannes = createFestivalSource("cannes");
const berlinale = createFestivalSource("berlinale");

module.exports = { sundance, cannes, berlinale, FESTIVAL_LISTS };
