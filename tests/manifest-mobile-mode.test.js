// Single-filter manifest transform.
//
// Stremio mobile and Nuvio render only the `genre` extra as a visible filter,
// so a separate `year` extra is silently dropped. `applyMobileMode` collapses
// year options into the genre extra (prefixed "Year: <n>") so those users
// can still pick a year. The catalog handler decodes the prefix back
// (covered in addon-handler.test.js).
//
// Wire-format key is still `mobileMode` — already-installed URLs use it and
// must keep working. The configure page sets it implicitly when the user
// picks Stremio Mobile or Nuvio.

const { buildManifest, applyMobileMode } = require("../lib/manifest-template");

const PER_CATALOG = {
  "oscars/movie": { years: [2025, 2024], categories: ["Best Picture", "Best Director"] },
  "sundance/movie": { years: [2025, 2024, 2023] },
  "w2w/movie": { years: [2026], categories: ["Variety", "Vulture"] },
};

function findCatalog(manifest, key) {
  return manifest.catalogs.find((c) => `${c.id}/${c.type}` === key);
}

describe("applyMobileMode", () => {
  test("merges year options into the genre extra with 'Year: ' prefix (award catalogs)", () => {
    const built = buildManifest({ perCatalogOptions: PER_CATALOG });
    const mobile = applyMobileMode(built);

    const oscars = findCatalog(mobile, "oscars/movie");
    const genre = oscars.extra.find((e) => e.name === "genre");
    const year = oscars.extra.find((e) => e.name === "year");

    expect(year).toBeUndefined();
    expect(genre.options).toEqual([
      "Year: 2025",
      "Year: 2024",
      "Best Picture",
      "Best Director",
    ]);
  });

  test("festival catalogs (no genre extra) get a synthesized genre with year options", () => {
    const built = buildManifest({ perCatalogOptions: PER_CATALOG });
    const mobile = applyMobileMode(built);

    const sundance = findCatalog(mobile, "sundance/movie");
    const genre = sundance.extra.find((e) => e.name === "genre");
    const year = sundance.extra.find((e) => e.name === "year");

    expect(year).toBeUndefined();
    expect(genre.options).toEqual(["Year: 2025", "Year: 2024", "Year: 2023"]);
  });

  test("preserves the skip extra for pagination", () => {
    const built = buildManifest({ perCatalogOptions: PER_CATALOG });
    const mobile = applyMobileMode(built);

    for (const cat of mobile.catalogs) {
      expect(cat.extra.some((e) => e.name === "skip")).toBe(true);
    }
  });

  test("editorial catalog: years and source-categories merged into single genre", () => {
    const built = buildManifest({ perCatalogOptions: PER_CATALOG });
    const mobile = applyMobileMode(built);

    const w2w = findCatalog(mobile, "w2w/movie");
    const genre = w2w.extra.find((e) => e.name === "genre");

    expect(genre.options).toEqual(["Year: 2026", "Variety", "Vulture"]);
  });

  test("does not mutate the input manifest", () => {
    const built = buildManifest({ perCatalogOptions: PER_CATALOG });
    const before = JSON.stringify(built);
    applyMobileMode(built);
    expect(JSON.stringify(built)).toBe(before);
  });

  test("catalogs without a year extra are passed through unchanged", () => {
    const stripped = {
      catalogs: [
        {
          id: "x",
          type: "movie",
          name: "X",
          extra: [{ name: "genre", isRequired: false, options: ["A"] }, { name: "skip", isRequired: false }],
        },
      ],
    };
    const out = applyMobileMode(stripped);
    expect(out.catalogs[0]).toEqual(stripped.catalogs[0]);
  });
});

describe("CONFIG_FIELDS", () => {
  const { CONFIG_FIELDS } = require("../lib/manifest-template");

  // mobileMode used to be a user-visible "Mobile mode" checkbox here. It's
  // now set implicitly by the configure-page client picker, so advertising
  // it in the manifest config would surface a redundant toggle in Stremio's
  // gear menu. The wire-format key still flows through the URL segment.
  test("does not advertise mobileMode as a manifest config field", () => {
    expect(CONFIG_FIELDS.some((c) => c.key === "mobileMode")).toBe(false);
  });

  test("contains only exclusion checkboxes (no display group)", () => {
    for (const f of CONFIG_FIELDS) {
      expect(f.type).toBe("checkbox");
      expect(f.group).toBeUndefined();
      expect(f.key.startsWith("no")).toBe(true);
    }
  });
});
