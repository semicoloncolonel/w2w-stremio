// Refresh job — the addon's "phone home" brain.
//
// Walks every configured scraper, resolves titles to IMDb metas via a
// server-owned TMDB key, and writes one JSON blob per catalog under
// `catalog/${id}/${type}.json`. Future catalog handler reads from storage
// instead of running the scrapers itself.
//
// Design notes:
// - All resolution memoization lives in a per-run Map (no lib/cache use).
// - One source failing is logged and skipped; the rest still produce output.
// - Resolver concurrency is bounded by a batch size of 5.
// - The TMDB key is taken from `tmdbKey` arg (defaults to env) and never logged
//   or returned in any response/return value.

const storage = require("./storage");
const resolver = require("./resolver");
const years = require("../config/years");
const { sundance, cannes, berlinale } = require("../sources/festivals");
const { oscars, goldenGlobes, emmys } = require("../sources/awards");
const decider = require("../sources/decider");
const variety = require("../sources/variety");
const vulture = require("../sources/vulture");
const indiewire = require("../sources/indiewire");
const nyt = require("../sources/nyt");
const rtBrowse = require("../sources/rt-browse");

const festivals = { sundance, cannes, berlinale };
const awards = { oscars, goldenGlobes, emmys };

const RESOLVE_BATCH = 5;
const DEFAULT_YEARS_BACK = 10;

function dedupKey(t) {
  return `${(t.title || "").toLowerCase()}::${t.year || ""}`;
}

function storageKeyFor(job) {
  return `catalog/${job.id}/${job.type}.json`;
}

async function fetchMergedEditorial(log) {
  const srcs = [decider, variety, vulture, indiewire, nyt];
  const results = await Promise.all(
    srcs.map((s) =>
      s.fetchTitles().catch((err) => {
        log.error(`[refresh] editorial ${s.name}:`, err.message);
        return [];
      })
    )
  );
  const out = [];
  const seen = new Set();
  for (const titles of results) {
    for (const t of titles) {
      const k = dedupKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

async function fetchFestivalAllYears(key, yearsBack, log) {
  const source = festivals[key];
  const latest = years[key].currentYear;
  const out = [];
  const seen = new Set();
  for (let y = latest; y > latest - yearsBack; y--) {
    try {
      const titles = await source.fetchTitlesForYear(y);
      for (const t of titles) {
        const k = dedupKey(t);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
    } catch (err) {
      log.error(`[refresh] festival ${key} year ${y}:`, err.message);
    }
  }
  return out;
}

async function fetchAwardAllEditions(key, editionsBack, log) {
  const source = awards[key];
  const latest = years[key].current;
  const out = [];
  const seen = new Set();
  for (let n = latest; n > latest - editionsBack; n--) {
    if (n < 1) break;
    try {
      const titles = await source.fetchTitlesForEdition(n);
      for (const t of titles) {
        const k = dedupKey(t);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
      }
    } catch (err) {
      log.error(`[refresh] award ${key} edition ${n}:`, err.message);
    }
  }
  return out;
}

function buildJobs(yearsBack, log) {
  return [
    // Editorial — merged across all 5 sources, split by resolved type
    {
      id: "w2w",
      type: "movie",
      summary: "merged editorial (decider/variety/vulture/indiewire/nyt)",
      fetchRaw: () => fetchMergedEditorial(log),
    },
    {
      id: "w2w",
      type: "series",
      summary: "merged editorial (decider/variety/vulture/indiewire/nyt)",
      fetchRaw: () => fetchMergedEditorial(log),
    },

    // Now Streaming — RT browse
    {
      id: "now-streaming",
      type: "movie",
      summary: "rt-browse now streaming",
      fetchRaw: () => rtBrowse.fetchTitles(),
    },

    // Festivals — current year
    {
      id: "sundance",
      type: "movie",
      summary: `sundance ${years.sundance.currentYear}`,
      fetchRaw: () => festivals.sundance.fetchTitlesForYear(years.sundance.currentYear),
    },
    {
      id: "cannes",
      type: "movie",
      summary: `cannes ${years.cannes.currentYear}`,
      fetchRaw: () => festivals.cannes.fetchTitlesForYear(years.cannes.currentYear),
    },
    {
      id: "berlinale",
      type: "movie",
      summary: `berlinale ${years.berlinale.currentYear}`,
      fetchRaw: () => festivals.berlinale.fetchTitlesForYear(years.berlinale.currentYear),
    },

    // Festivals — historical (yearsBack window)
    {
      id: "sundance-all",
      type: "movie",
      summary: `sundance last ${yearsBack} years`,
      fetchRaw: () => fetchFestivalAllYears("sundance", yearsBack, log),
    },
    {
      id: "cannes-all",
      type: "movie",
      summary: `cannes last ${yearsBack} years`,
      fetchRaw: () => fetchFestivalAllYears("cannes", yearsBack, log),
    },
    {
      id: "berlinale-all",
      type: "movie",
      summary: `berlinale last ${yearsBack} years`,
      fetchRaw: () => fetchFestivalAllYears("berlinale", yearsBack, log),
    },

    // Awards — current edition
    {
      id: "oscars",
      type: "movie",
      summary: `oscars edition ${years.oscars.current}`,
      fetchRaw: () => awards.oscars.fetchTitlesForEdition(years.oscars.current),
    },
    {
      id: "goldenGlobes",
      type: "movie",
      summary: `goldenGlobes edition ${years.goldenGlobes.current}`,
      fetchRaw: () => awards.goldenGlobes.fetchTitlesForEdition(years.goldenGlobes.current),
    },
    {
      id: "goldenGlobes",
      type: "series",
      summary: `goldenGlobes edition ${years.goldenGlobes.current}`,
      fetchRaw: () => awards.goldenGlobes.fetchTitlesForEdition(years.goldenGlobes.current),
    },
    {
      id: "emmys",
      type: "series",
      summary: `emmys edition ${years.emmys.current}`,
      fetchRaw: () => awards.emmys.fetchTitlesForEdition(years.emmys.current),
    },

    // Awards — historical (yearsBack editions)
    {
      id: "oscars-all",
      type: "movie",
      summary: `oscars last ${yearsBack} editions`,
      fetchRaw: () => fetchAwardAllEditions("oscars", yearsBack, log),
    },
    {
      id: "goldenGlobes-all",
      type: "movie",
      summary: `goldenGlobes last ${yearsBack} editions`,
      fetchRaw: () => fetchAwardAllEditions("goldenGlobes", yearsBack, log),
    },
    {
      id: "goldenGlobes-all",
      type: "series",
      summary: `goldenGlobes last ${yearsBack} editions`,
      fetchRaw: () => fetchAwardAllEditions("goldenGlobes", yearsBack, log),
    },
    {
      id: "emmys-all",
      type: "series",
      summary: `emmys last ${yearsBack} editions`,
      fetchRaw: () => fetchAwardAllEditions("emmys", yearsBack, log),
    },
  ];
}

async function resolveTitlesForJob(rawTitles, expectedType, tmdbKey, resolverMemo) {
  const metas = [];
  for (let i = 0; i < rawTitles.length; i += RESOLVE_BATCH) {
    const batch = rawTitles.slice(i, i + RESOLVE_BATCH);
    const resolved = await Promise.all(
      batch.map(async (t) => {
        const memoKey = `${(t.title || "").toLowerCase()}::${t.year || ""}::${t.type || ""}`;
        if (resolverMemo.has(memoKey)) return resolverMemo.get(memoKey);
        const meta = await resolver.resolve(t.title, t.year, t.type, tmdbKey);
        resolverMemo.set(memoKey, meta);
        return meta;
      })
    );
    for (const meta of resolved) {
      if (meta && meta.type === expectedType) metas.push(meta);
    }
  }
  // Title variants pointing at the same imdb id can still collide — last write wins.
  const byId = new Map();
  for (const m of metas) if (!byId.has(m.id)) byId.set(m.id, m);
  return [...byId.values()];
}

async function run({
  yearsBack = Number(process.env.REFRESH_YEARS_BACK) || DEFAULT_YEARS_BACK,
  tmdbKey = process.env.TMDB_API_KEY,
  log = console,
} = {}) {
  if (!tmdbKey) {
    throw new Error("TMDB_API_KEY is required");
  }

  const startedAt = Date.now();
  const jobs = buildJobs(yearsBack, log);
  const resolverMemo = new Map();
  const counts = {};

  for (const job of jobs) {
    const key = storageKeyFor(job);
    try {
      const raw = await job.fetchRaw();
      const metas = await resolveTitlesForJob(raw, job.type, tmdbKey, resolverMemo);
      const payload = {
        metas,
        generatedAt: new Date().toISOString(),
        source: job.summary,
      };
      await storage.putJSON(key, payload);
      counts[key] = metas.length;
    } catch (err) {
      log.error(`[refresh] job ${key} failed:`, err.message);
      counts[key] = { error: err.message };
    }
  }

  return {
    ok: true,
    counts,
    durationMs: Date.now() - startedAt,
  };
}

module.exports = { run };
