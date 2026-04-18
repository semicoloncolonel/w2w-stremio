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
  "w2w/movie",
  "w2w/series",
  "now-streaming/movie",
  "sundance/movie",
  "sundance-all/movie",
  "cannes/movie",
  "cannes-all/movie",
  "berlinale/movie",
  "berlinale-all/movie",
  "oscars/movie",
  "oscars-all/movie",
  "goldenGlobes/movie",
  "goldenGlobes-all/movie",
  "goldenGlobes/series",
  "goldenGlobes-all/series",
  "emmys/series",
  "emmys-all/series",
];

describe("manifest stability", () => {
  const manifest = addon.manifest;

  test("exposes the exact set of catalog (id, type) pairs", () => {
    const actual = manifest.catalogs.map((c) => `${c.id}/${c.type}`).sort();
    const expected = [...EXPECTED_CATALOG_KEYS].sort();
    expect(actual).toEqual(expected);
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
    expect(manifest.config.some((c) => c.key === "tmdbKey")).toBe(false);
  });

  test("version is semver major.minor.patch", () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
