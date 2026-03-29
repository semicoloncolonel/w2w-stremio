const { addonBuilder } = require("stremio-addon-sdk");
const { resolve } = require("./lib/resolver");

// Editorial recommendation sources
const sources = {
  decider: require("./sources/decider"),
  variety: require("./sources/variety"),
  vulture: require("./sources/vulture"),
  indiewire: require("./sources/indiewire"),
  nyt: require("./sources/nyt"),
};

// "Now Streaming" source (separate catalog)
const rtBrowse = require("./sources/rt-browse");

const catalogs = [
  {
    id: "w2w",
    type: "movie",
    name: "What to Watch",
    extra: [{ name: "skip", isRequired: false }],
  },
  {
    id: "w2w",
    type: "series",
    name: "What to Watch",
    extra: [{ name: "skip", isRequired: false }],
  },
  {
    id: "now-streaming",
    type: "movie",
    name: "Now Streaming",
    extra: [{ name: "skip", isRequired: false }],
  },
];

const manifest = {
  id: "community.w2w",
  version: "1.0.0",
  name: "What to Watch",
  description:
    "Curated recommendations from Decider, Variety, Vulture, IndieWire, and NYT",
  logo: "https://i.imgur.com/placeholder.png",
  resources: ["catalog"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs,
  behaviorHints: {
    configurable: true,
    configurationRequired: true,
  },
  config: [
    {
      key: "tmdbKey",
      type: "text",
      title: "TMDB API Key (free at themoviedb.org)",
      required: true,
    },
    { key: "noDecider", type: "checkbox", title: "Exclude Decider" },
    { key: "noVariety", type: "checkbox", title: "Exclude Variety" },
    { key: "noVulture", type: "checkbox", title: "Exclude Vulture" },
    { key: "noIndiewire", type: "checkbox", title: "Exclude IndieWire" },
    { key: "noNyt", type: "checkbox", title: "Exclude New York Times" },
    { key: "noRt", type: "checkbox", title: "Exclude Now Streaming (Rotten Tomatoes)" },
  ],
};

const builder = new addonBuilder(manifest);

// Helper: resolve an array of raw titles into Stremio metas
async function resolveTitles(rawTitles, type, tmdbKey) {
  const metas = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < rawTitles.length; i += BATCH_SIZE) {
    const batch = rawTitles.slice(i, i + BATCH_SIZE);
    const resolved = await Promise.all(
      batch.map(async (t) => {
        const meta = await resolve(t.title, t.year, t.type, tmdbKey);
        if (meta && meta.type === type) {
          if (t.sourceName) {
            meta.description = `[${t.sourceName}] ${meta.description || ""}`.trim();
          }
          return meta;
        }
        return null;
      })
    );
    for (const meta of resolved) {
      if (meta) metas.push(meta);
    }
  }

  // Deduplicate by IMDb ID
  const seen = new Set();
  return metas.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

function isExcluded(config, configKey) {
  return config[configKey] === "true" || config[configKey] === true || config[configKey] === "on";
}

builder.defineCatalogHandler(async ({ type, id, extra, config }) => {
  const tmdbKey = config?.tmdbKey;
  if (!tmdbKey) return { metas: [] };

  const skip = parseInt(extra?.skip) || 0;

  // "Now Streaming" catalog — RT Browse only
  if (id === "now-streaming") {
    if (isExcluded(config, "noRt")) return { metas: [] };

    try {
      const rawTitles = await rtBrowse.fetchTitles(config);
      const page = rawTitles.slice(skip, skip + 100);
      const metas = await resolveTitles(page, type, tmdbKey);
      console.log(`Now Streaming (${type}): ${rawTitles.length} raw → ${metas.length} resolved`);
      return { metas, cacheMaxAge: 21600, staleRevalidate: 43200, staleError: 604800 };
    } catch (err) {
      console.error("Now Streaming error:", err.message);
      return { metas: [] };
    }
  }

  // "What to Watch" catalog — merged editorial sources
  if (id !== "w2w") return { metas: [] };

  const exclusionMap = {
    noDecider: "decider",
    noVariety: "variety",
    noVulture: "vulture",
    noIndiewire: "indiewire",
    noNyt: "nyt",
  };

  const excluded = new Set();
  for (const [configKey, sourceKey] of Object.entries(exclusionMap)) {
    if (isExcluded(config, configKey)) excluded.add(sourceKey);
  }

  const enabledSources = Object.entries(sources).filter(([key]) => !excluded.has(key));
  console.log(`Fetching from ${enabledSources.length} sources (${type})...`);

  // Fetch all sources in parallel
  const results = await Promise.all(
    enabledSources.map(async ([key, source]) => {
      try {
        const titles = await source.fetchTitles(config);
        return titles.map((t) => ({ ...t, sourceName: source.name }));
      } catch (err) {
        console.error(`Error fetching ${source.name}:`, err.message);
        return [];
      }
    })
  );

  const allTitles = results.flat();
  const page = allTitles.slice(skip, skip + 100);
  const metas = await resolveTitles(page, type, tmdbKey);

  console.log(`What to Watch (${type}): ${allTitles.length} raw → ${metas.length} resolved`);

  return {
    metas,
    cacheMaxAge: 6 * 60 * 60,
    staleRevalidate: 12 * 60 * 60,
    staleError: 7 * 24 * 60 * 60,
  };
});

module.exports = builder.getInterface();
