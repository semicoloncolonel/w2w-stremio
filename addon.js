const { addonBuilder } = require("stremio-addon-sdk");
const storage = require("./lib/storage");

// Catalogs are pre-built server-side by the refresh job and stored as
// `catalog/${id}/${type}.json`. The handler is a thin storage read — no live
// scraping, no TMDB calls, no per-request resolver use.

const catalogs = [
  { id: "w2w", type: "movie", name: "What to Watch" },
  { id: "w2w", type: "series", name: "What to Watch" },
  { id: "now-streaming", type: "movie", name: "Now Streaming" },

  { id: "sundance", type: "movie", name: "Sundance Film Festival" },
  { id: "sundance-all", type: "movie", name: "Sundance Film Festival — All Years" },
  { id: "cannes", type: "movie", name: "Cannes Film Festival" },
  { id: "cannes-all", type: "movie", name: "Cannes Film Festival — All Years" },
  { id: "berlinale", type: "movie", name: "Berlinale" },
  { id: "berlinale-all", type: "movie", name: "Berlinale — All Years" },

  { id: "oscars", type: "movie", name: "Oscar Nominees" },
  { id: "oscars-all", type: "movie", name: "Oscar Nominees — All Editions" },
  { id: "goldenGlobes", type: "movie", name: "Golden Globe Nominees" },
  { id: "goldenGlobes-all", type: "movie", name: "Golden Globe Nominees — All Editions" },
  { id: "goldenGlobes", type: "series", name: "Golden Globe Nominees" },
  { id: "goldenGlobes-all", type: "series", name: "Golden Globe Nominees — All Editions" },
  { id: "emmys", type: "series", name: "Emmy Nominees" },
  { id: "emmys-all", type: "series", name: "Emmy Nominees — All Editions" },
].map((c) => ({ ...c, extra: [{ name: "skip", isRequired: false }] }));

const manifest = {
  id: "community.w2w",
  version: "2.0.0",
  name: "What to Watch",
  description:
    "Editorial picks, new streaming releases, film festival lineups (Sundance, Cannes, Berlinale — current and historical), and award nominees (Oscars, Golden Globes, Emmys — current and all-time). Refreshed every 6 hours server-side; no API key required.",
  logo: "https://img.icons8.com/fluency/512/movie-projector.png",
  resources: ["catalog"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs,
  behaviorHints: {
    configurable: true,
    configurationRequired: false,
  },
  config: [
    { key: "noDecider", type: "checkbox", title: "Exclude Decider" },
    { key: "noVariety", type: "checkbox", title: "Exclude Variety" },
    { key: "noVulture", type: "checkbox", title: "Exclude Vulture" },
    { key: "noIndiewire", type: "checkbox", title: "Exclude IndieWire" },
    { key: "noNyt", type: "checkbox", title: "Exclude New York Times" },
    { key: "noRt", type: "checkbox", title: "Exclude Now Streaming (Rotten Tomatoes)" },
    { key: "noSundance", type: "checkbox", title: "Exclude Sundance" },
    { key: "noSundanceAll", type: "checkbox", title: "Exclude Sundance (All Years)" },
    { key: "noCannes", type: "checkbox", title: "Exclude Cannes" },
    { key: "noCannesAll", type: "checkbox", title: "Exclude Cannes (All Years)" },
    { key: "noBerlinale", type: "checkbox", title: "Exclude Berlinale" },
    { key: "noBerlinaleAll", type: "checkbox", title: "Exclude Berlinale (All Years)" },
    { key: "noOscars", type: "checkbox", title: "Exclude Oscar Nominees" },
    { key: "noOscarsAll", type: "checkbox", title: "Exclude Oscar Nominees (All Editions)" },
    { key: "noGoldenGlobes", type: "checkbox", title: "Exclude Golden Globe Nominees" },
    {
      key: "noGoldenGlobesAll",
      type: "checkbox",
      title: "Exclude Golden Globe Nominees (All Editions)",
    },
    { key: "noEmmys", type: "checkbox", title: "Exclude Emmy Nominees" },
    { key: "noEmmysAll", type: "checkbox", title: "Exclude Emmy Nominees (All Editions)" },
  ],
};

const builder = new addonBuilder(manifest);

// Catalog id -> exclusion config keys. Setting any of these to true hides the
// catalog. For "w2w", exclusion only kicks in when ALL editorial sources are
// excluded — catalogs are pre-built server-side, so per-source filtering at
// request time is not possible without re-resolving.
const EXCLUSION_KEYS = {
  w2w: ["noDecider", "noVariety", "noVulture", "noIndiewire", "noNyt"],
  "now-streaming": ["noRt"],
  sundance: ["noSundance"],
  "sundance-all": ["noSundanceAll"],
  cannes: ["noCannes"],
  "cannes-all": ["noCannesAll"],
  berlinale: ["noBerlinale"],
  "berlinale-all": ["noBerlinaleAll"],
  oscars: ["noOscars"],
  "oscars-all": ["noOscarsAll"],
  goldenGlobes: ["noGoldenGlobes"],
  "goldenGlobes-all": ["noGoldenGlobesAll"],
  emmys: ["noEmmys"],
  "emmys-all": ["noEmmysAll"],
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

builder.defineCatalogHandler(async ({ type, id, extra, config }) => {
  if (isExcludedForCatalog(config, id, type)) return { metas: [] };

  const skip = parseInt(extra?.skip) || 0;
  const data = await storage.getJSON(`catalog/${id}/${type}.json`);
  if (!data || !Array.isArray(data.metas)) return { metas: [] };

  const metas = data.metas.slice(skip, skip + 100);
  return { metas, cacheMaxAge: 3600, staleRevalidate: 21600, staleError: 604800 };
});

module.exports = builder.getInterface();
