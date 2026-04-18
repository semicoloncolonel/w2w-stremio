const { addonBuilder } = require("stremio-addon-sdk");
const storage = require("./lib/storage");
const { buildManifest } = require("./lib/manifest-template");

// Catalogs are pre-built server-side by the refresh job and stored as
// `catalog/${id}/${type}.json`. The handler is a thin storage read — no live
// scraping, no TMDB calls, no per-request resolver use.
//
// Manifest serving:
// - At boot, we attempt to load `manifest.json` from storage (written by
//   `lib/refresh.js`). That blob has dynamic `extra.options` (year + genre
//   dropdowns) populated from the actually-scraped data so Stremio shows
//   meaningful filters.
// - If the storage blob is missing (first boot, before any refresh has run)
//   we fall back to the static template (no dropdown options).
// - The SDK builds the manifest once at addonBuilder construction. To serve
//   the latest manifest dynamically we bypass the SDK's `/manifest.json`
//   route in `api/serverless.js` and read directly from storage there. The
//   catalog handler still flows through the SDK builder.

let cachedManifest = null;

async function loadManifestFromStorage() {
  try {
    const blob = await storage.getJSON("manifest.json");
    if (blob && Array.isArray(blob.catalogs)) {
      cachedManifest = blob;
      return blob;
    }
  } catch (err) {
    // Swallow — fall back to the template manifest below. Storage may be
    // unreachable on first boot or in tests.
    if (process.env.NODE_ENV !== "test") {
      console.warn("[addon] manifest.json read failed:", err.message);
    }
  }
  return null;
}

// Synchronous boot fallback: addonBuilder needs a manifest at construction
// time. We start with the template; the async refresh below upgrades it once
// storage is reachable, and api/serverless.js serves the live storage blob
// directly for /manifest.json.
const fallbackManifest = buildManifest({ perCatalogOptions: {} });
cachedManifest = fallbackManifest;

const builder = new addonBuilder(fallbackManifest);

// Kick off the async storage read so getCachedManifest() returns the live
// blob ASAP. Errors are swallowed (handled inside loadManifestFromStorage).
loadManifestFromStorage();

// Refresh the cached manifest periodically — the refresh job updates the
// storage blob roughly daily. Skip in tests (no interval needed; jest would
// hold the process open).
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
let refreshTimer = null;
if (process.env.NODE_ENV !== "test") {
  refreshTimer = setInterval(loadManifestFromStorage, REFRESH_INTERVAL_MS);
  if (refreshTimer.unref) refreshTimer.unref();
  process.on("exit", () => {
    if (refreshTimer) clearInterval(refreshTimer);
  });
}

function getCachedManifest() {
  return cachedManifest || fallbackManifest;
}

// Catalog id -> exclusion config keys. Setting any of these to true hides the
// catalog. For "w2w", exclusion only kicks in when ALL editorial sources are
// excluded — catalogs are pre-built server-side, so per-source filtering at
// request time is not possible without re-resolving.
const EXCLUSION_KEYS = {
  w2w: ["noDecider", "noVariety", "noVulture", "noIndiewire", "noNyt"],
  sundance: ["noSundance"],
  cannes: ["noCannes"],
  berlinale: ["noBerlinale"],
  venice: ["noVenice"],
  tiff: ["noTiff"],
  oscars: ["noOscars"],
  goldenGlobes: ["noGoldenGlobes"],
  emmys: ["noEmmys"],
};

function isExcluded(config, key) {
  if (!config) return false;
  const v = config[key];
  return v === true || v === "true" || v === "on";
}

function isExcludedForCatalog(config, id) {
  const keys = EXCLUSION_KEYS[id];
  if (!keys || keys.length === 0) return false;
  // For w2w, treat as excluded only when every editorial source is excluded.
  // Single-key entries are excluded when their one key is set.
  return keys.every((k) => isExcluded(config, k));
}

// filterAndPaginate(data, extra) applies Year + Genre filters, sorts, and
// paginates the items array. Returns the post-filter items slice.
//
// Filter rules:
// 1. Year — if `extra.year` is provided, keep items whose `nominations[]`
//    includes a matching `year` (parsed as Number). If NOT provided AND
//    `data.years.length > 0`, default to `data.years[0]` (most recent).
//    Exception: editorial catalogs (`id === "w2w"`) — no default year filter,
//    since editorial nominations all carry the current calendar year so a
//    "default to most recent" is meaningless.
// 2. Genre — if `extra.genre` is provided, keep items whose `nominations[]`
//    includes a matching `category` (awards) OR `source` (editorial w2w).
//    Match exactly, case-sensitive.
// 3. Sort by most recent nomination year DESC, then alpha by `meta.name`.
// 4. Paginate: `skip = parseInt(extra?.skip) || 0`, return slice(skip, +100).
function filterAndPaginate(data, extra, id) {
  const items = data.items || [];
  const years = Array.isArray(data.years) ? data.years : [];

  // Mobile mode encodes year filters into the genre extra as "Year: 2024"
  // (Stremio mobile only renders the genre extra). Decode that prefix here so
  // the catalog handler treats it as a year filter regardless of which
  // manifest variant the user installed. Web users never produce this shape.
  const rawGenre = extra && extra.genre ? String(extra.genre) : null;
  const yearPrefixMatch = rawGenre ? rawGenre.match(/^Year:\s*(\d{4})$/i) : null;
  const yearFromGenre = yearPrefixMatch ? Number(yearPrefixMatch[1]) : null;
  const genreFilter = yearFromGenre != null ? null : rawGenre;

  let yearFilter = null;
  if (yearFromGenre != null) {
    yearFilter = yearFromGenre;
  } else if (extra && extra.year != null && extra.year !== "") {
    const y = Number(extra.year);
    if (!Number.isNaN(y)) yearFilter = y;
  } else if (id !== "w2w" && years.length > 0) {
    yearFilter = years[0];
  }

  // When BOTH year and genre are set we require a single nomination matching
  // both (otherwise filtering by "2024 + Best Picture" would also match a film
  // that won Best Editing in 2024 and was nominated for Best Picture in 2018).
  // When only one filter is set, any matching nomination keeps the item.
  function nomYearMatches(n) {
    return yearFilter == null || Number(n.year) === yearFilter;
  }
  function nomGenreMatches(n) {
    return !genreFilter || n.category === genreFilter || n.source === genreFilter;
  }
  let filtered = items;
  if (yearFilter != null || genreFilter) {
    filtered = filtered.filter(
      (it) =>
        Array.isArray(it.nominations) &&
        it.nominations.some((n) => nomYearMatches(n) && nomGenreMatches(n))
    );
  }

  // Sort by most-recent-nomination-year DESC, then alpha by meta.name.
  const sorted = [...filtered].sort((a, b) => {
    const aYear = Math.max(...(a.nominations || []).map((n) => Number(n.year) || 0), 0);
    const bYear = Math.max(...(b.nominations || []).map((n) => Number(n.year) || 0), 0);
    if (bYear !== aYear) return bYear - aYear;
    const aName = (a.meta && a.meta.name) || "";
    const bName = (b.meta && b.meta.name) || "";
    return aName.localeCompare(bName);
  });

  const skip = parseInt(extra && extra.skip) || 0;
  return sorted.slice(skip, skip + 100);
}

builder.defineCatalogHandler(async ({ type, id, extra, config }) => {
  if (isExcludedForCatalog(config, id, type)) return { metas: [] };

  // Storage read can throw when the blob backend is misconfigured
  // (missing/invalid BLOB_READ_WRITE_TOKEN, network blip, etc). The SDK turns
  // thrown handler errors into HTTP 500, which Stremio surfaces as a catalog
  // load failure. Treat read errors as "no data yet" so the client gets an
  // empty shelf instead of a hard error, and log so operators can see why.
  let data;
  try {
    data = await storage.getJSON(`catalog/${id}/${type}.json`);
  } catch (err) {
    console.warn(`[addon] storage read failed for ${id}/${type}:`, err.message);
    return { metas: [] };
  }
  if (!data || !Array.isArray(data.items)) return { metas: [] };

  const items = filterAndPaginate(data, extra || {}, id);
  return {
    metas: items.map((it) => it.meta),
    cacheMaxAge: 3600,
    staleRevalidate: 21600,
    staleError: 604800,
  };
});

const addonInterface = builder.getInterface();

module.exports = addonInterface;
module.exports.getCachedManifest = getCachedManifest;
module.exports.loadManifestFromStorage = loadManifestFromStorage;
module.exports.filterAndPaginate = filterAndPaginate;
module.exports.isExcludedForCatalog = isExcludedForCatalog;
module.exports.EXCLUSION_KEYS = EXCLUSION_KEYS;
