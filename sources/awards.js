const { fetchPage, loadCheerio } = require("../lib/scraper");
const years = require("../config/years");

// --- Wikipedia category-aware scraper ---------------------------------------
//
// Both Golden Globes and Emmy per-edition pages organise nominees into
// `<table class="wikitable">` blocks under top-level section anchors:
//   * Globes: <h3 id="Film">, <h3 id="Television">
//   * Emmys: <h3 id="Programs">, <h3 id="Acting"> (with <h4>Lead/Supporting</h4>
//     children), <h3 id="Directing">, <h3 id="Writing">
// Each section heading lives inside `<div class="mw-heading mw-headingN">`,
// so we walk siblings of *that wrapper* (not the heading itself) until the
// next mw-heading2/mw-heading3.
//
// Two table layouts in the wild:
//   * Modern (~2017+): each <td> cell starts with
//     `<div><b><a>Category Name</a></b></div>` followed by a <ul> of nominees.
//     Italicised <i> elements within <ul> are the films/series; plain text
//     before the <i> on acting rows is the nominee's name.
//   * Pre-2017: rows of <th colspan="2">Parent Category</th>, optionally
//     followed by <tr><th>SubA</th><th>SubB</th></tr>, then a <tr> with
//     two <td>s of nominees. Synthesise category as "Parent – Sub" when both
//     present, fallback to parent label otherwise.
//
// Aggregation tables ("Films with multiple nominations/wins") are filtered
// out by detecting `<th>Nominations</th>` or `<th>Wins</th>` headers.

// Category-name skiplist applied per-cell. These are honorary / lifetime
// achievement awards that don't nominate films/series — even when they sneak
// into the same competitive table.
const NON_COMPETITIVE_CATEGORY_PATTERNS = [
  /cecil b\.? demille/i,
  /carol burnett/i,
  /governors award/i,
  /honorary/i,
  /humanitarian/i,
  /lifetime achievement/i,
  /special award/i,
];

function isNonCompetitiveCategory(name) {
  return NON_COMPETITIVE_CATEGORY_PATTERNS.some((re) => re.test(name));
}

// True if the table is one of the "Films/Series with multiple
// nominations/wins" summary tables that sit between or after the category
// tables. They have `<th>` headers like "Nominations" or "Wins" — category
// tables have no such header row.
function isAggregationTable($, table) {
  const headers = $(table).find("tr").first().find("th");
  let aggregation = false;
  headers.each((_, th) => {
    const txt = $(th).text().trim().toLowerCase();
    if (txt === "nominations" || txt === "wins") aggregation = true;
  });
  return aggregation;
}

// Walk forward from a section heading's wrapper until the next heading of
// equal/greater level (h2 or h3). Returns the wikitables found in between.
function tablesUnderSection($, headingEl) {
  const $h = $(headingEl);
  const wrapper = $h.parent().is(".mw-heading") ? $h.parent() : $h;
  const tables = [];
  let cur = wrapper.next();
  while (cur.length) {
    if (cur.is("div.mw-heading2") || cur.is("div.mw-heading3") || cur.is("h2") || cur.is("h3")) {
      break;
    }
    if (cur.is("table.wikitable") && !isAggregationTable($, cur[0])) {
      tables.push(cur[0]);
    }
    cur = cur.next();
  }
  return tables;
}

// Pull out italicised work titles from a <td> cell. Each <li> is one nominee:
//   * Pure film/series row: <li><i><a>Title</a></i> (Network)</li> — the
//     first <i> in the <li>'s direct children is the work.
//   * Acting row: <li>Person – <i><a>Title</a></i> as Character</li> — same
//     selector picks the work.
// We only look at top-level <i> per <li> (descendants would also include
// hyperlinked actor names that happen to sit inside <i> in rare cases —
// haven't seen this in practice but the narrower selector is safer).
function extractTitlesFromCell($, cellEl) {
  const titles = [];
  const seen = new Set();
  $(cellEl)
    .find("li")
    .each((_, li) => {
      // First top-level <i> inside this <li>. .find("> i") doesn't behave
      // ideally with cheerio when the <i> is nested in a <b>, so fall back to
      // scanning children recursively but stopping at the first <i>.
      const $li = $(li);
      // The work title is in the first <i> that is NOT inside a nested <ul>
      // (sub-ul = nominees not yet visited; we'll hit them on their own
      // iteration). Skip <i> that lives inside a <ul> descendant.
      let firstI = null;
      $li.find("i").each((__, iEl) => {
        if (firstI) return;
        // Reject if this <i> is inside a child <ul> of $li (it belongs to a
        // nested sibling <li>, which the .each() loop will visit on its own).
        if ($(iEl).parentsUntil(li, "ul").length > 0) return;
        firstI = iEl;
      });
      if (!firstI) return;
      const title = $(firstI).text().trim();
      if (!title || title.length < 2) return;
      const key = title.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      titles.push(title);
    });
  return titles;
}

// Parse a "modern" cell: starts with <div><b><a>Category</a></b></div>,
// followed by <ul> of nominees. Returns [{category, titles[]}] (or [] if
// the cell doesn't match the modern pattern).
function parseModernCell($, cellEl) {
  const headerLink = $(cellEl).find("> div b a, > div > b a").first();
  if (!headerLink.length) return null;
  const category = headerLink.text().trim();
  if (!category) return null;
  if (isNonCompetitiveCategory(category)) return { category, titles: [], skip: true };
  const titles = extractTitlesFromCell($, cellEl);
  return { category, titles };
}

// Parse a single wikitable. Returns array of {category, titles[]}.
function parseTable($, tableEl) {
  const out = [];

  // Try modern per-cell layout first. If at least one cell matches, treat
  // the whole table as modern (mixing the two layouts inside one table is
  // not something we've seen on Wikipedia).
  let modernHits = 0;
  $(tableEl)
    .find("> tbody > tr > td, > tr > td")
    .each((_, td) => {
      const parsed = parseModernCell($, td);
      if (!parsed) return;
      modernHits++;
      if (parsed.skip) return;
      out.push(parsed);
    });
  if (modernHits > 0) return out;

  // Old layout: walk rows tracking the most recent parent header (colspan>=2
  // <th>) and optional sub-header row (multiple <th>s without colspan).
  let parentCategory = null;
  let subHeaders = null;
  $(tableEl)
    .find("> tbody > tr, > tr")
    .each((_, tr) => {
      const $tr = $(tr);
      const ths = $tr.find("> th");
      const tds = $tr.find("> td");

      if (ths.length && !tds.length) {
        // Header row.
        if (ths.length === 1 && ths.first().attr("colspan")) {
          parentCategory = ths.first().text().trim();
          subHeaders = null;
        } else if (ths.length >= 2) {
          // Sub-header row: capture as labels paired with the upcoming tds.
          subHeaders = ths.toArray().map((th) => $(th).text().trim());
        }
        return;
      }

      if (!tds.length || !parentCategory) return;
      if (isNonCompetitiveCategory(parentCategory)) {
        // Reset sub-headers but skip the row entirely.
        subHeaders = null;
        return;
      }

      tds.each((idx, td) => {
        const titles = extractTitlesFromCell($, td);
        if (!titles.length) return;
        const sub = subHeaders && subHeaders[idx];
        const category = sub ? `${parentCategory} \u2013 ${sub}` : parentCategory;
        out.push({ category, titles });
      });
      // Sub-headers consumed by this row; reset.
      subHeaders = null;
    });

  return out;
}

// Top-level: fetch a Wikipedia award page and return one row per
// (title, category) pair, tagged with the caller-supplied `type` per
// section. `sectionTypes` maps a section id ("Film", "Television",
// "Programs", ...) to "movie" or "series".
async function fetchWikipediaCategorizedNominees(url, sectionIds, sectionTypes) {
  const html = await fetchPage(url);
  const $ = loadCheerio(html);
  const rows = [];
  const seenTables = new Set();

  for (const id of sectionIds) {
    const heading = $(`h2#${id}, h3#${id}, h4#${id}`).first();
    if (!heading.length) continue;
    const type = sectionTypes(id);
    if (!type) continue;
    for (const table of tablesUnderSection($, heading[0])) {
      // Dedupe: an h3 walk includes tables that an h4 walk would also pick
      // up (Emmys' Acting parent + Lead/Supporting children).
      if (seenTables.has(table)) continue;
      seenTables.add(table);
      for (const { category, titles } of parseTable($, table)) {
        for (const title of titles) {
          rows.push({ title, category, type });
        }
      }
    }
  }

  return rows;
}

// --- Oscars (Wikipedia, films only) ---------------------------------------
//
// Each per-edition page (e.g. /wiki/97th_Academy_Awards) puts every category
// in one big wikitable under `<h3 id="Awards">`. Each `<td>` of that table
// has the modern `<div><b><a>Category Name</a></b></div><ul>...</ul>` layout
// the Wikipedia scraper above already understands.

async function oscarsFetchTitlesForEdition(n) {
  const sourceLabel = `Oscar Nominees (${years.ordinal(n)})`;
  const ceremonyYear = years.oscars.ceremonyYear(n);
  let rows;
  try {
    rows = await fetchWikipediaCategorizedNominees(
      years.oscars.wikipediaUrl(n),
      ["Awards"],
      () => "movie"
    );
  } catch (err) {
    console.error(`${sourceLabel} Wikipedia error:`, err.message);
    return [];
  }

  const out = rows.map((r) => ({
    title: r.title,
    year: undefined,
    category: r.category,
    ceremonyYear,
    type: "movie",
    source: sourceLabel,
    link: "",
  }));

  const distinctFilms = new Set(out.map((r) => r.title.toLowerCase())).size;
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

// --- Golden Globes (Wikipedia, film + TV) ----------------------------------

async function goldenGlobesFetchTitlesForEdition(n) {
  const sourceLabel = `Golden Globe Nominees (${years.ordinal(n)})`;
  const ceremonyYear = years.goldenGlobes.ceremonyYear(n);
  let rows;
  try {
    rows = await fetchWikipediaCategorizedNominees(
      years.goldenGlobes.wikipediaUrl(n),
      ["Film", "Television"],
      (id) => (id === "Film" ? "movie" : id === "Television" ? "series" : null)
    );
  } catch (err) {
    console.error(`${sourceLabel} Wikipedia error:`, err.message);
    return [];
  }

  const out = rows.map((r) => ({
    title: r.title,
    year: undefined,
    category: r.category,
    ceremonyYear,
    type: r.type,
    source: sourceLabel,
    link: "",
  }));

  const distinctTitles = new Set(out.map((r) => r.title.toLowerCase())).size;
  console.log(`${sourceLabel}: ${out.length} nominations across ${distinctTitles} titles`);
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
  const ceremonyYear = years.emmys.ceremonyYear(n);
  let rows;
  try {
    rows = await fetchWikipediaCategorizedNominees(
      years.emmys.wikipediaUrl(n),
      // Walk h3 sections only — h4s (Lead/Supporting) are children of
      // "Acting" and their tables are reached transitively via the parent
      // walk + the seenTables dedupe.
      ["Programs", "Acting", "Directing", "Writing"],
      () => "series"
    );
  } catch (err) {
    console.error(`${sourceLabel} scrape error:`, err.message);
    return [];
  }

  const out = rows.map((r) => ({
    title: r.title,
    year: undefined,
    category: r.category,
    ceremonyYear,
    type: "series",
    source: sourceLabel,
    link: "",
  }));

  const distinctTitles = new Set(out.map((r) => r.title.toLowerCase())).size;
  console.log(`${sourceLabel}: ${out.length} nominations across ${distinctTitles} shows`);
  return out;
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
