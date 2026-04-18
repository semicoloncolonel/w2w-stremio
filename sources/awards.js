const { fetchPage, loadCheerio } = require("../lib/scraper");
const years = require("../config/years");

// Letterboxd film-list scraper (one page).
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

  const nextLink = $("a.next").attr("href");
  return {
    films,
    nextUrl: nextLink ? `https://letterboxd.com${nextLink}` : null,
  };
}

// Walk Letterboxd "next page" links until exhausted (or MAX_PAGES hit).
async function fetchAllLetterboxdPages(baseUrl) {
  const allFilms = [];
  let url = baseUrl;
  let pageCount = 0;
  const MAX_PAGES = 5;

  while (url && pageCount < MAX_PAGES) {
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

// Wikipedia scraper for TV award nominees. `url` is the parameter; the
// "Television" heading + tables convention is shared by Golden Globes and
// Emmy pages.
async function fetchWikipediaTVNominees(url) {
  const html = await fetchPage(url);
  const $ = loadCheerio(html);

  const shows = new Set();
  const tvHeading = $("#Television");
  if (tvHeading.length > 0) {
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

  // Fallback: pages like Emmys are entirely TV, so no "Television" heading.
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
    source: "",
    link: "",
  }));
}

// --- Oscars (Letterboxd, films only) ---------------------------------------

async function oscarsFetchTitlesForEdition(n) {
  const url = years.oscars.letterboxdUrl(n);
  const sourceLabel = `Oscar Nominees (${years.ordinal(n)})`;
  const films = await fetchAllLetterboxdPages(url);

  const seen = new Set();
  const out = [];
  for (const film of films) {
    const k = film.title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...film, source: sourceLabel });
  }
  console.log(`${sourceLabel}: ${out.length} films`);
  return out;
}

const oscars = {
  name: "Oscar Nominees",
  id: "oscars",
  fetchTitlesForEdition: oscarsFetchTitlesForEdition,
  // Backward-compat wrapper for the current addon.js catalog handler. Batch D
  // will replace the call site with a direct edition lookup; until then this
  // keeps the existing "current edition" behavior intact.
  fetchTitles() {
    return oscarsFetchTitlesForEdition(years.oscars.current);
  },
};

// --- Golden Globes (Letterboxd films + Wikipedia TV) ------------------------

async function goldenGlobesFetchTitlesForEdition(n) {
  const sourceLabel = `Golden Globe Nominees (${years.ordinal(n)})`;
  const seen = new Set();
  const out = [];

  // Films from Letterboxd
  try {
    const films = await fetchAllLetterboxdPages(years.goldenGlobes.letterboxdUrl(n));
    for (const f of films) {
      const k = f.title.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...f, source: sourceLabel });
    }
  } catch (err) {
    console.error(`${sourceLabel} Letterboxd error:`, err.message);
  }

  // TV nominees from Wikipedia
  try {
    const tvShows = await fetchWikipediaTVNominees(years.goldenGlobes.wikipediaUrl(n));
    for (const s of tvShows) {
      const k = s.title.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...s, source: sourceLabel });
    }
  } catch (err) {
    console.error(`${sourceLabel} Wikipedia error:`, err.message);
  }

  console.log(`${sourceLabel}: ${out.length} total (film + TV)`);
  return out;
}

const goldenGlobes = {
  name: "Golden Globe Nominees",
  id: "goldenGlobes",
  fetchTitlesForEdition: goldenGlobesFetchTitlesForEdition,
  fetchTitles() {
    return goldenGlobesFetchTitlesForEdition(years.goldenGlobes.current);
  },
};

// --- Emmys (Wikipedia, TV only) --------------------------------------------

async function emmysFetchTitlesForEdition(n) {
  const sourceLabel = `Emmy Nominees (${years.ordinal(n)})`;
  try {
    const titles = await fetchWikipediaTVNominees(years.emmys.wikipediaUrl(n));
    const tagged = titles.map((t) => ({ ...t, source: sourceLabel }));
    console.log(`${sourceLabel}: ${tagged.length} shows`);
    return tagged;
  } catch (err) {
    console.error(`${sourceLabel} scrape error:`, err.message);
    return [];
  }
}

const emmys = {
  name: "Emmy Nominees",
  id: "emmys",
  fetchTitlesForEdition: emmysFetchTitlesForEdition,
  fetchTitles() {
    return emmysFetchTitlesForEdition(years.emmys.current);
  },
};

module.exports = { oscars, goldenGlobes, emmys };
