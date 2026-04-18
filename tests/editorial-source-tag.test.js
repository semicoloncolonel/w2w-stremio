// Stability guard for editorial source labels.
//
// Each editorial source (Decider/Variety/Vulture/IndieWire/NYT) must tag
// every returned title with a `source` string matching the canonical outlet
// name. The catalog handler exposes these labels as a `genre` filter dropdown
// (Phase 1 of the filters work) so users can narrow the merged "What to
// Watch" feed to a single outlet. Renames are user-visible breakage.

const SOURCES = [
  { module: "../sources/decider", expected: "Decider" },
  { module: "../sources/variety", expected: "Variety" },
  { module: "../sources/vulture", expected: "Vulture" },
  { module: "../sources/indiewire", expected: "IndieWire" },
  { module: "../sources/nyt", expected: "NYT" },
];

describe("editorial source labels", () => {
  test.each(SOURCES)("%# $expected source code contains its label", ({ module, expected }) => {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.resolve(__dirname, `${module}.js`);
    const code = fs.readFileSync(filePath, "utf-8");
    expect(code).toMatch(new RegExp(`source:\\s*["']${expected}["']`));
  });
});
