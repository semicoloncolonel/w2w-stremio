// Shared manifest builder used by both the refresh job (writes manifest.json
// to storage) and addon.js (static fallback when storage is unreachable).
//
// `perCatalogOptions` is a plain object keyed by `${id}/${type}`:
//   {
//     "oscars/movie": { years: [2024, 2023], categories: ["Best Director", ...] },
//     "sundance/movie": { years: [2025, 2024] },
//     "w2w/movie": { years: [2026], categories: ["Decider", "Variety", ...] },
//     ...
//   }
//
// Catalogs whose entry is missing from `perCatalogOptions` get empty extras
// (year/genre dropdowns omitted). Festival catalogs never get a `genre` extra.

// Catalog metadata. Order here determines order in the manifest. Each entry:
//   - id, type: catalog identity
//   - name: human-readable label shown in Stremio
//   - kind: "award" | "festival" | "editorial"  (drives which extras get built)
const CATALOG_DEFS = [
  { id: "w2w", type: "movie", name: "What to Watch", kind: "editorial" },
  { id: "w2w", type: "series", name: "What to Watch", kind: "editorial" },

  { id: "sundance", type: "movie", name: "Sundance Film Festival", kind: "festival" },
  { id: "cannes", type: "movie", name: "Cannes Film Festival", kind: "festival" },
  { id: "berlinale", type: "movie", name: "Berlinale", kind: "festival" },
  { id: "venice", type: "movie", name: "Venice Film Festival", kind: "festival" },
  { id: "tiff", type: "movie", name: "TIFF", kind: "festival" },

  { id: "oscars", type: "movie", name: "Oscar Nominees", kind: "award" },
  { id: "goldenGlobes", type: "movie", name: "Golden Globe Nominees", kind: "award" },
  { id: "goldenGlobes", type: "series", name: "Golden Globe Nominees", kind: "award" },
  { id: "emmys", type: "series", name: "Emmy Nominees", kind: "award" },
];

const CONFIG_FIELDS = [
  { key: "noDecider", type: "checkbox", title: "Exclude Decider" },
  { key: "noVariety", type: "checkbox", title: "Exclude Variety" },
  { key: "noVulture", type: "checkbox", title: "Exclude Vulture" },
  { key: "noIndiewire", type: "checkbox", title: "Exclude IndieWire" },
  { key: "noNyt", type: "checkbox", title: "Exclude New York Times" },
  { key: "noSundance", type: "checkbox", title: "Exclude Sundance" },
  { key: "noCannes", type: "checkbox", title: "Exclude Cannes" },
  { key: "noBerlinale", type: "checkbox", title: "Exclude Berlinale" },
  { key: "noVenice", type: "checkbox", title: "Exclude Venice" },
  { key: "noTiff", type: "checkbox", title: "Exclude TIFF" },
  { key: "noOscars", type: "checkbox", title: "Exclude Oscar Nominees" },
  { key: "noGoldenGlobes", type: "checkbox", title: "Exclude Golden Globe Nominees" },
  { key: "noEmmys", type: "checkbox", title: "Exclude Emmy Nominees" },
];

function buildExtras(def, opts) {
  const extras = [];
  const options = opts || {};

  // Genre extra: shown for awards (categories) and editorial (source outlets).
  // Festivals have no genre dimension.
  if (def.kind !== "festival") {
    const categories = Array.isArray(options.categories) ? options.categories : [];
    const extra = { name: "genre", isRequired: false };
    if (categories.length > 0) extra.options = categories;
    extras.push(extra);
  }

  // Year extra: shown for everyone. Stremio expects string options.
  const years = Array.isArray(options.years) ? options.years : [];
  const yearExtra = { name: "year", isRequired: false };
  if (years.length > 0) yearExtra.options = years.map((y) => String(y));
  extras.push(yearExtra);

  extras.push({ name: "skip", isRequired: false });
  return extras;
}

function buildManifest({ perCatalogOptions = {} } = {}) {
  const catalogs = CATALOG_DEFS.map((def) => {
    const key = `${def.id}/${def.type}`;
    const opts = perCatalogOptions[key];
    return {
      id: def.id,
      type: def.type,
      name: def.name,
      extra: buildExtras(def, opts),
    };
  });

  return {
    id: "community.w2w",
    version: "1.1.1",
    name: "What to Watch",
    description:
      "Editorial picks, film festival lineups (Sundance, Cannes, Berlinale, Venice, TIFF), and award nominees (Oscars, Golden Globes, Emmys) with year and category filters.",
    logo: "https://img.icons8.com/fluency/512/movie-projector.png",
    resources: ["catalog"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs,
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
    config: CONFIG_FIELDS,
  };
}

// Transform a built manifest for single-filter clients (Stremio mobile and
// Nuvio). Those clients render only the `genre` extra; separate `year`
// extras are silently dropped. We collapse year options into the genre extra
// with a "Year: <n>" prefix so users can still pick a year. The catalog
// handler decodes the prefix back into a year filter (see addon.js
// filterAndPaginate). Desktop/web manifests are untouched.
//
// The configure page picks which manifest variant a user gets by setting
// `mobileMode=on` in the URL config segment when "Stremio Mobile" or
// "Nuvio" is selected. The wire-format key stays `mobileMode` for
// backwards compatibility with already-installed URLs.
//
// Constraint: in single-filter mode users can pick year OR category at a
// time, not both. That's inherent to the clients' UI, not a bug here.
function applyMobileMode(manifest) {
  const YEAR_PREFIX = "Year: ";
  return {
    ...manifest,
    catalogs: manifest.catalogs.map((cat) => {
      const yearExtra = (cat.extra || []).find((e) => e.name === "year");
      const genreExtra = (cat.extra || []).find((e) => e.name === "genre");
      const skipExtra = (cat.extra || []).find((e) => e.name === "skip");
      if (!yearExtra) return cat;

      const yearOptions = (yearExtra.options || []).map((y) => `${YEAR_PREFIX}${y}`);
      const genreOptions = genreExtra ? genreExtra.options || [] : [];
      const merged = { name: "genre", isRequired: false };
      if (yearOptions.length > 0 || genreOptions.length > 0) {
        merged.options = [...yearOptions, ...genreOptions];
      }
      const newExtras = [merged];
      if (skipExtra) newExtras.push(skipExtra);
      return { ...cat, extra: newExtras };
    }),
  };
}

module.exports = { buildManifest, applyMobileMode, CATALOG_DEFS, CONFIG_FIELDS };
