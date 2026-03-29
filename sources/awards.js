const { fetchPage, loadCheerio } = require("../lib/scraper");
const cache = require("../lib/cache");

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days — nominees don't change once announced

// Letterboxd lists for film awards
const AWARDS_LISTS = {
  oscars: {
    name: "Oscar Nominees",
    urls: [
      "https://letterboxd.com/oscars/list/the-98th-academy-award-nominees-all-feature/",
    ],
    type: "movie",
  },
  goldenGlobes: {
    name: "Golden Globe Nominees",
    urls: [
      "https://letterboxd.com/filmfestival/list/2026-golden-globes-nominations/",
    ],
    type: "movie",
  },
};

// Letterboxd scraper (same approach as festivals)
async function fetchLetterboxdList(url) {
  const html = await fetchPage(url);
  const $ = loadCheerio(html);
  const films = [];

  $("div.react-component[data-film-id]").each((_, el) => {
    const name = $(el).attr("data-item-name");
    if (!name) return;

    const match = name.match(/^(.+?)\s*\((\d{4})\)\s*$/);
    const title = match ? match[1].trim() : name.trim();
    const year = match ? parseInt(match[2]) : undefined;

    films.push({ title, year, type: "movie", source: "", link: "" });
  });

  // Check for next page
  const nextLink = $("a.next").attr("href");
  return {
    films,
    nextUrl: nextLink ? `https://letterboxd.com${nextLink}` : null,
  };
}

async function fetchAllLetterboxdPages(baseUrl) {
  const allFilms = [];
  let url = baseUrl;
  let pageCount = 0;

  while (url && pageCount < 5) {
    try {
      const { films, nextUrl } = await fetchLetterboxdList(url);
      allFilms.push(...films);
      url = nextUrl;
      pageCount++;
      if (url) await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`Awards page error (${url}):`, err.message);
      break;
    }
  }
  return allFilms;
}

// Wikipedia scraper for TV award nominees
async function fetchWikipediaTVNominees(url, sourceName) {
  const html = await fetchPage(url);
  const $ = loadCheerio(html);

  const shows = new Set();
  // Find the Television section heading and get tables after it
  const tvHeading = $("#Television");
  if (tvHeading.length > 0) {
    // Get tables that come after the Television heading
    tvHeading
      .closest("h3, h2")
      .nextAll("table.wikitable")
      .not(".plainrowheaders")
      .find("li i a")
      .each((_, el) => {
        const title = $(el).text().trim();
        if (title && title.length > 1) shows.add(title);
      });
  }

  // If no TV section found, fall back to all tables (for Emmys which are all TV)
  if (shows.size === 0) {
    $("table.wikitable")
      .not(".plainrowheaders")
      .find("li i a")
      .each((_, el) => {
        const title = $(el).text().trim();
        if (title && title.length > 1) shows.add(title);
      });
  }

  return [...shows].map((title) => ({
    title,
    year: undefined,
    type: "series",
    source: sourceName,
    link: "",
  }));
}

function createAwardsSource(key) {
  const award = AWARDS_LISTS[key];
  if (!award) return null;

  const cacheKey = `source:awards:${key}`;

  async function fetchTitles() {
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const allFilms = [];
    const seen = new Set();

    for (const url of award.urls) {
      const films = await fetchAllLetterboxdPages(url);
      for (const film of films) {
        const k = film.title.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        allFilms.push({ ...film, source: award.name });
      }
    }

    console.log(`${award.name}: ${allFilms.length} films`);
    cache.set(cacheKey, allFilms, CACHE_TTL);
    return allFilms;
  }

  return { fetchTitles, name: award.name, id: key };
}

// Emmy source (Wikipedia — all TV)
const emmys = {
  name: "Emmy Nominees",
  id: "emmys",
  async fetchTitles() {
    const cached = cache.get("source:awards:emmys");
    if (cached) return cached;

    try {
      const titles = await fetchWikipediaTVNominees(
        "https://en.wikipedia.org/wiki/77th_Primetime_Emmy_Awards",
        "Emmy Nominees"
      );
      console.log(`Emmy Nominees: ${titles.length} shows`);
      cache.set("source:awards:emmys", titles, CACHE_TTL);
      return titles;
    } catch (err) {
      console.error("Emmy scrape error:", err.message);
      return [];
    }
  },
};

// Golden Globes: Letterboxd for films + Wikipedia for TV
const goldenGlobesBase = createAwardsSource("goldenGlobes");
const goldenGlobes = {
  name: "Golden Globe Nominees",
  id: "goldenGlobes",
  async fetchTitles() {
    const cached = cache.get("source:awards:goldenGlobes:merged");
    if (cached) return cached;

    const seen = new Set();
    const allTitles = [];

    // Films from Letterboxd
    try {
      const films = await goldenGlobesBase.fetchTitles();
      for (const f of films) {
        const k = f.title.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          allTitles.push(f);
        }
      }
    } catch (err) {
      console.error("GG Letterboxd error:", err.message);
    }

    // TV shows from Wikipedia
    try {
      const tvShows = await fetchWikipediaTVNominees(
        "https://en.wikipedia.org/wiki/83rd_Golden_Globe_Awards",
        "Golden Globe Nominees"
      );
      for (const s of tvShows) {
        const k = s.title.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          allTitles.push(s);
        }
      }
    } catch (err) {
      console.error("GG Wikipedia error:", err.message);
    }

    console.log(`Golden Globe Nominees: ${allTitles.length} total (film + TV)`);
    cache.set("source:awards:goldenGlobes:merged", allTitles, CACHE_TTL);
    return allTitles;
  },
};

const oscars = createAwardsSource("oscars");

module.exports = { oscars, goldenGlobes, emmys };
