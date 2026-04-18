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

// Cap on /detail/ pagination follow. Letterboxd renders ~100 entries per page
// and Oscar editions cap around 50 films, so 1 page is the norm — but we walk
// `a.next` defensively in case Letterboxd changes the page size.
const OSCARS_MAX_DETAIL_PAGES = 5;

// Acting categories embed the nominee's name as ", <Person>" after the
// category label (e.g. "Best Actor in a Leading Role, Cillian Murphy"). Strip
// that suffix so the dropdown groups all acting nominations under the same
// canonical category name.
function stripPersonSuffix(category) {
  const idx = category.indexOf(",");
  return idx === -1 ? category.trim() : category.slice(0, idx).trim();
}

// Parse one /detail/ page of the master per-edition Letterboxd list. Each
// `article.list-detailed-entry` carries a `data-item-name="Title (YYYY)"` and
// a `.notes` block with one <a> per nominated category. Returns one row per
// (film, category) pair plus the next-page URL (or null).
function parseOscarsDetailPage(html) {
  const $ = loadCheerio(html);
  const rows = [];

  $("article.list-detailed-entry").each((_, el) => {
    const $el = $(el);
    const name = $el.find("[data-item-name]").attr("data-item-name");
    if (!name) return;

    const match = name.match(/^(.+?)\s*\((\d{4})\)\s*$/);
    const title = match ? match[1].trim() : name.trim();
    const year = match ? parseInt(match[2], 10) : undefined;

    // Each <a> inside .notes is one nominated category. The leading <p> tag
    // ("N nominations / M wins") has no <a>, so it's skipped naturally.
    $el.find(".notes a").each((__, link) => {
      const raw = $(link).text().trim();
      if (!raw) return;
      const category = stripPersonSuffix(raw);
      if (!category) return;
      rows.push({ title, year, category });
    });
  });

  const nextHref = $("a.next").attr("href");
  const nextUrl = nextHref ? `https://letterboxd.com${nextHref}` : null;
  return { rows, nextUrl };
}

async function oscarsFetchTitlesForEdition(n) {
  const sourceLabel = `Oscar Nominees (${years.ordinal(n)})`;
  const ceremonyYear = years.oscars.ceremonyYear(n);
  const out = [];

  let url = years.oscars.letterboxdDetailUrl(n);
  let pageCount = 0;

  while (url && pageCount < OSCARS_MAX_DETAIL_PAGES) {
    let html;
    try {
      html = await fetchPage(url);
    } catch (err) {
      console.error(`${sourceLabel} fetch error (${url}):`, err.message);
      break;
    }

    const { rows, nextUrl } = parseOscarsDetailPage(html);
    for (const r of rows) {
      out.push({
        title: r.title,
        year: r.year,
        category: r.category,
        ceremonyYear,
        type: "movie",
        source: sourceLabel,
        link: "",
      });
    }

    url = nextUrl;
    pageCount++;
    if (url) await new Promise((r) => setTimeout(r, 500));
  }

  // Distinct films vs total rows — useful sanity-check during refresh runs.
  const distinctFilms = new Set(out.map((r) => `${r.title.toLowerCase()}::${r.year || ""}`)).size;
  console.log(`${sourceLabel}: ${out.length} nominations across ${distinctFilms} films`);
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
