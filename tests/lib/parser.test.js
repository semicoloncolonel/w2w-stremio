const { extractYear, extractTitleFromHeadline, isListArticle } = require("../../lib/parser");

describe("extractYear", () => {
  test("pulls four-digit year out of a title string", () => {
    expect(extractYear("Oppenheimer (2023)")).toBe(2023);
  });
  test("returns undefined when no year present", () => {
    expect(extractYear("Oppenheimer")).toBeUndefined();
  });
});

describe("extractTitleFromHeadline", () => {
  test("strips 'Stream It or Skip It:' prefix and quoted title", () => {
    expect(
      extractTitleFromHeadline("Stream It or Skip It: 'Cheaper by the Dozen' on Disney+")
    ).toBe("Cheaper by the Dozen");
  });
  test("strips trailing platform info", () => {
    expect(extractTitleFromHeadline("The Bear on Hulu")).toBe("The Bear");
  });
  test("strips parenthetical year", () => {
    expect(extractTitleFromHeadline("Oppenheimer (2023)")).toBe("Oppenheimer");
  });
});

describe("isListArticle", () => {
  test("detects 'best of' list articles", () => {
    expect(isListArticle("The 25 Best Shows on Netflix")).toBe(true);
  });
  test("rejects a single-title recommendation headline", () => {
    expect(isListArticle("Stream It or Skip It: The Bear")).toBe(false);
  });
});
