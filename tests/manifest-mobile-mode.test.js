// Mobile-mode manifest transform.
//
// Stremio's mobile clients only render the `genre` extra as a visible filter,
// so a separate `year` extra is silently dropped. `applyMobileMode` collapses
// year options into the genre extra (prefixed "Year: <n>") so mobile users
// can pick a year. The catalog handler decodes the prefix back (covered in
// addon-handler.test.js).

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

describe("mobileMode checkbox in CONFIG_FIELDS", () => {
  const { CONFIG_FIELDS } = require("../lib/manifest-template");

  test("mobileMode is registered as a display-group checkbox", () => {
    const entry = CONFIG_FIELDS.find((c) => c.key === "mobileMode");
    expect(entry).toBeDefined();
    expect(entry.type).toBe("checkbox");
    expect(entry.group).toBe("display");
  });
});
