// Refresh job — the addon's "phone home" brain.
//
// Walks every configured scraper, resolves titles to IMDb metas via a
// server-owned TMDB key, and writes one JSON blob per catalog under
// `catalog/${id}/${type}.json`. Also writes a top-level `manifest.json`
// blob with extras (year/genre dropdowns) populated from the actually-
// scraped data so the manifest reflects what the handler can serve.
//
// Per-catalog blob shape:
//   {
//     generatedAt: "...",
//     source: "<human description>",
//     items: [
//       {
//         meta: { id, type, name, poster, ... },
//         nominations: [
//           { year, category }   // awards
//           { year }             // festivals
//           { year, source }     // editorial (year = current calendar year)
//         ]
//       }
//     ],
//     years: [<sorted desc>],
//     categories: [<sorted asc, deduped>]   // omitted for festivals
//   }
//
// Items are aggregated by `meta.id` (IMDb id) — a film nominated in
// multiple editions/categories appears once with N nominations entries.
//
// Design notes:
// - Resolver memoization lives in a per-run Map (no lib/cache use).
// - One source failing is logged and skipped; the rest still produce output.
// - Resolver concurrency is bounded by a batch size of 5.
// - The TMDB key is taken from `tmdbKey` arg (defaults to env) and never logged
//   or returned in any response/return value.

const storage = require("./storage");
const resolver = require("./resolver");
const years = require("../config/years");
const { sundance, cannes, berlinale, venice, tiff } = require("../sources/festivals");
const { oscars, goldenGlobes, emmys } = require("../sources/awards");
const decider = require("../sources/decider");
const variety = require("../sources/variety");
const vulture = require("../sources/vulture");
const indiewire = require("../sources/indiewire");
const nyt = require("../sources/nyt");
const { buildManifest } = require("./manifest-template");

const festivals = { sundance, cannes, berlinale, venice, tiff };
const awards = { oscars, goldenGlobes, emmys };
const editorialSources = [decider, variety, vulture, indiewire, nyt];

const RESOLVE_BATCH = 5;
const DEFAULT_YEARS_BACK = 10;

function storageKeyFor(id, type) {
  return `catalog/${id}/${type}.json`;
}

// Resolve a single raw title via the per-run memo. Returns {meta, key}: meta
// may be null when the resolver couldn't find an IMDb id; key is the memo
// cache key (used for telemetry only — no functional purpose).
async function resolveOne(raw, tmdbKey, resolverMemo) {
  const memoKey = `${(raw.title || "").toLowerCase()}::${raw.year || ""}::${raw.type || ""}`;
  if (resolverMemo.has(memoKey)) return resolverMemo.get(memoKey);
  const meta = await resolver.resolve(raw.title, raw.year, raw.type, tmdbKey);
  resolverMemo.set(memoKey, meta);
  return meta;
}

// Resolve every raw row, in batches of RESOLVE_BATCH, via the per-run memo.
// Returns an array of {raw, meta} pairs (meta may be null/skipped). Rows
// whose meta failed to resolve OR whose resolved type doesn't match
// `expectedType` are dropped.
async function resolveRows(rawRows, expectedType, tmdbKey, resolverMemo) {
  const out = [];
  for (let i = 0; i < rawRows.length; i += RESOLVE_BATCH) {
    const batch = rawRows.slice(i, i + RESOLVE_BATCH);
    const metas = await Promise.all(batch.map((r) => resolveOne(r, tmdbKey, resolverMemo)));
    for (let j = 0; j < batch.length; j++) {
      const meta = metas[j];
      if (!meta) continue;
      if (meta.type !== expectedType) continue;
      out.push({ raw: batch[j], meta });
    }
  }
  return out;
}

// Aggregate resolved (raw, meta) pairs into the per-catalog item shape.
// `nominationFor(raw)` extracts the nomination object for that raw row
// (e.g. `{year, category}` for awards). Nominations are deduped per item by
// stable JSON stringification.
function aggregateItems(resolved, nominationFor) {
  const byId = new Map();
  for (const { raw, meta } of resolved) {
    const existing = byId.get(meta.id);
    const nom = nominationFor(raw);
    if (!nom) continue;
    if (existing) {
      const seen = existing._seenNomKeys;
      const key = JSON.stringify(nom);
      if (!seen.has(key)) {
        seen.add(key);
        existing.nominations.push(nom);
      }
    } else {
      const seen = new Set([JSON.stringify(nom)]);
      byId.set(meta.id, { meta, nominations: [nom], _seenNomKeys: seen });
    }
  }
  // Strip the internal seen-set before returning.
  return [...byId.values()].map(({ meta, nominations }) => ({ meta, nominations }));
}

// Compute sorted `years` (desc) and `categories` (asc, deduped) arrays from
// an aggregated items list. `categoriesField` is the property name on the
// nomination object to draw category-like values from ("category" for awards,
// "source" for editorial). Pass `null` for festivals to omit categories.
function computeFacets(items, categoriesField) {
  const yearSet = new Set();
  const catSet = new Set();
  for (const item of items) {
    for (const nom of item.nominations) {
      if (nom.year != null) yearSet.add(nom.year);
      if (categoriesField && nom[categoriesField]) catSet.add(nom[categoriesField]);
    }
  }
  const yearsSorted = [...yearSet].sort((a, b) => b - a);
  const categoriesSorted = categoriesField ? [...catSet].sort((a, b) => a.localeCompare(b)) : null;
  return { years: yearsSorted, categories: categoriesSorted };
}

// --- Per-catalog raw-row collectors ----------------------------------------

// For each award edition (current down to current - editionsBack + 1), call
// the source's per-edition fetch and tag each row with its edition. Returns
// the flat list of raw rows: {title, year, category, ceremonyYear, type, ...}.
async function collectAwardRows(key, editionsBack, log) {
  const source = awards[key];
  const latest = years[key].current;
  const out = [];
  for (let n = latest; n > latest - editionsBack; n--) {
    if (n < 1) break;
    try {
      const rows = await source.fetchTitlesForEdition(n);
      for (const r of rows) out.push(r);
    } catch (err) {
      log.error(`[refresh] award ${key} edition ${n}:`, err.message);
    }
  }
  return out;
}

// For each festival year (currentYear down to currentYear - yearsBack + 1),
// call the source's per-year fetch. Tag each row with the festival year `y`
// (NOT the row's `year` field — Wikipedia-sourced Venice has `year`
// undefined and the festival year is what populates the `year` filter).
async function collectFestivalRows(key, yearsBack, log) {
  const source = festivals[key];
  const latest = years[key].currentYear;
  const out = [];
  for (let y = latest; y > latest - yearsBack; y--) {
    try {
      const rows = await source.fetchTitlesForYear(y);
      for (const r of rows) out.push({ ...r, _festivalYear: y });
    } catch (err) {
      log.error(`[refresh] festival ${key} year ${y}:`, err.message);
    }
  }
  return out;
}

// Editorial: fetch each source once. Tag each row with its source name (we
// rely on the source already setting `source` to its outlet name — Variety,
// Decider, etc. — verified in Task 5).
async function collectEditorialRows(log) {
  const out = [];
  await Promise.all(
    editorialSources.map(async (s) => {
      try {
        const rows = await s.fetchTitles();
        for (const r of rows) out.push(r);
      } catch (err) {
        log.error(`[refresh] editorial ${s.name}:`, err.message);
      }
    })
  );
  return out;
}

// --- Job definitions -------------------------------------------------------

function buildJobs({ yearsBack, editionsBack, currentCalendarYear, log }) {
  return [
    // Editorial — merged, split by resolved type.
    {
      id: "w2w",
      type: "movie",
      summary: "merged editorial (decider/variety/vulture/indiewire/nyt)",
      collect: () => collectEditorialRows(log),
      nominationFor: (raw) => ({ year: currentCalendarYear, source: raw.source || "Unknown" }),
      categoriesField: "source",
    },
    {
      id: "w2w",
      type: "series",
      summary: "merged editorial (decider/variety/vulture/indiewire/nyt)",
      collect: () => collectEditorialRows(log),
      nominationFor: (raw) => ({ year: currentCalendarYear, source: raw.source || "Unknown" }),
      categoriesField: "source",
    },

    // Festivals — single catalog spans the historical window via filtering.
    ...["sundance", "cannes", "berlinale", "venice", "tiff"].map((key) => ({
      id: key,
      type: "movie",
      summary: `${key} last ${yearsBack} years`,
      collect: () => collectFestivalRows(key, yearsBack, log),
      nominationFor: (raw) => ({ year: raw._festivalYear }),
      categoriesField: null,
    })),

    // Awards — single catalog spans the historical window via filtering.
    {
      id: "oscars",
      type: "movie",
      summary: `oscars last ${editionsBack} editions`,
      collect: () => collectAwardRows("oscars", editionsBack, log),
      nominationFor: (raw) => ({ year: raw.ceremonyYear, category: raw.category }),
      categoriesField: "category",
    },
    {
      id: "goldenGlobes",
      type: "movie",
      summary: `goldenGlobes last ${editionsBack} editions`,
      collect: () => collectAwardRows("goldenGlobes", editionsBack, log),
      nominationFor: (raw) => ({ year: raw.ceremonyYear, category: raw.category }),
      categoriesField: "category",
    },
    {
      id: "goldenGlobes",
      type: "series",
      summary: `goldenGlobes last ${editionsBack} editions`,
      collect: () => collectAwardRows("goldenGlobes", editionsBack, log),
      nominationFor: (raw) => ({ year: raw.ceremonyYear, category: raw.category }),
      categoriesField: "category",
    },
    {
      id: "emmys",
      type: "series",
      summary: `emmys last ${editionsBack} editions`,
      collect: () => collectAwardRows("emmys", editionsBack, log),
      nominationFor: (raw) => ({ year: raw.ceremonyYear, category: raw.category }),
      categoriesField: "category",
    },
  ];
}

async function run({
  yearsBack = Number(process.env.REFRESH_YEARS_BACK) || DEFAULT_YEARS_BACK,
  editionsBack = Number(process.env.REFRESH_EDITIONS_BACK) || undefined,
  tmdbKey = process.env.TMDB_API_KEY,
  log = console,
} = {}) {
  if (!tmdbKey) {
    throw new Error("TMDB_API_KEY is required");
  }

  const effectiveEditionsBack = editionsBack || yearsBack;
  const currentCalendarYear = new Date().getFullYear();
  const startedAt = Date.now();
  const jobs = buildJobs({
    yearsBack,
    editionsBack: effectiveEditionsBack,
    currentCalendarYear,
    log,
  });
  const resolverMemo = new Map();
  const counts = {};
  const perCatalogOptions = {};

  for (const job of jobs) {
    const key = storageKeyFor(job.id, job.type);
    try {
      const rawRows = await job.collect();
      const resolved = await resolveRows(rawRows, job.type, tmdbKey, resolverMemo);
      const items = aggregateItems(resolved, job.nominationFor);
      const facets = computeFacets(items, job.categoriesField);

      const payload = {
        generatedAt: new Date().toISOString(),
        source: job.summary,
        items,
        years: facets.years,
      };
      if (facets.categories !== null) {
        payload.categories = facets.categories;
      } else {
        payload.categories = [];
      }
      await storage.putJSON(key, payload);

      counts[key] = items.length;
      perCatalogOptions[`${job.id}/${job.type}`] = {
        years: facets.years,
        categories: facets.categories || [],
      };
    } catch (err) {
      log.error(`[refresh] job ${key} failed:`, err.message);
      counts[key] = { error: err.message };
    }
  }

  // Emit the dynamic manifest reflecting the years/categories we just stored.
  // The handler's static fallback will be used until this blob lands.
  try {
    const manifest = buildManifest({ perCatalogOptions });
    await storage.putJSON("manifest.json", manifest);
  } catch (err) {
    log.error("[refresh] manifest emission failed:", err.message);
  }

  return {
    ok: true,
    counts,
    durationMs: Date.now() - startedAt,
  };
}

module.exports = { run };
