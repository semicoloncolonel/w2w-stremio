// Catalog-id stability guard.
//
// Existing Stremio installs key off `(catalog.id, catalog.type)`. If one of
// these pairs disappears or is renamed, installed users' saved catalogs break
// and they have to re-install. This test locks the current set: adding new
// pairs is fine (update the array), removing or renaming is intentional and
// requires a version bump decision.
//
// If you need to remove or rename a catalog:
//   1. Understand that this will break existing installs.
//   2. Bump manifest `version` major.
//   3. Update this list.

const addon = require("../addon");

const EXPECTED_CATALOG_KEYS = [
  // Movies
  "w2w/movie",
  "sundance/movie",
  "cannes/movie",
  "berlinale/movie",
  "venice/movie",
  "tiff/movie",
  "oscars/movie",
  "goldenGlobes/movie",
  // Series
  "w2w/series",
  "goldenGlobes/series",
  "emmys/series",
];

describe("manifest stability", () => {
  const manifest = addon.manifest;

  test("exposes the exact set of catalog (id, type) pairs", () => {
    const actual = manifest.catalogs.map((c) => `${c.id}/${c.type}`).sort();
    const expected = [...EXPECTED_CATALOG_KEYS].sort();
    expect(actual).toEqual(expected);
  });

  test("has 11 catalog entries total — no extras, no missing", () => {
    expect(manifest.catalogs).toHaveLength(EXPECTED_CATALOG_KEYS.length);
  });

  test("every catalog has a name and a skip extra for pagination", () => {
    for (const c of manifest.catalogs) {
      expect(typeof c.name).toBe("string");
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.extra).toEqual(expect.arrayContaining([{ name: "skip", isRequired: false }]));
    }
  });

  test("does not require configuration (no user TMDB key)", () => {
    expect(manifest.behaviorHints.configurationRequired).toBe(false);
    expect(manifest.behaviorHints.configurable).toBe(true);
    expect(manifest.config.some((c) => c.key === "tmdbKey")).toBe(false);
  });

  test("version is exactly 1.1.0", () => {
    expect(manifest.version).toBe("1.1.0");
  });

  test("preserves required core fields", () => {
    expect(manifest.idPrefixes).toEqual(["tt"]);
    expect(manifest.resources).toEqual(["catalog"]);
    expect(manifest.types).toEqual(expect.arrayContaining(["movie", "series"]));
  });
});
