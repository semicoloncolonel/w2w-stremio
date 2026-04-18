const years = require("../../config/years");

describe("ordinal", () => {
  test("handles single-digit roots 1-4 with st/nd/rd/th", () => {
    expect(years.ordinal(1)).toBe("1st");
    expect(years.ordinal(2)).toBe("2nd");
    expect(years.ordinal(3)).toBe("3rd");
    expect(years.ordinal(4)).toBe("4th");
  });

  test("handles the 11/12/13 teens exception", () => {
    expect(years.ordinal(10)).toBe("10th");
    expect(years.ordinal(11)).toBe("11th");
    expect(years.ordinal(12)).toBe("12th");
    expect(years.ordinal(13)).toBe("13th");
  });

  test("returns to st/nd/rd at 21/22/23", () => {
    expect(years.ordinal(21)).toBe("21st");
    expect(years.ordinal(22)).toBe("22nd");
    expect(years.ordinal(23)).toBe("23rd");
  });

  test("handles two-digit endings ending in 8 (98)", () => {
    expect(years.ordinal(98)).toBe("98th");
  });

  test("re-applies the basic rule above 100 (101st)", () => {
    expect(years.ordinal(101)).toBe("101st");
  });

  test("re-applies the teens exception above 100 (111th-113th, 112th)", () => {
    expect(years.ordinal(111)).toBe("111th");
    expect(years.ordinal(112)).toBe("112th");
  });
});

describe("oscars URL builders", () => {
  test("letterboxdUrl(98) matches the known 98th master nominee list", () => {
    expect(years.oscars.letterboxdUrl(98)).toBe(
      "https://letterboxd.com/oscars/list/the-98th-academy-award-feature-film-nominees/"
    );
  });

  test("letterboxdDetailUrl(98) appends /detail/ to the master list URL", () => {
    expect(years.oscars.letterboxdDetailUrl(98)).toBe(
      "https://letterboxd.com/oscars/list/the-98th-academy-award-feature-film-nominees/detail/"
    );
  });

  test("ceremonyYear(98) is 2026", () => {
    expect(years.oscars.ceremonyYear(98)).toBe(2026);
  });
});

describe("goldenGlobes URL builders", () => {
  test("letterboxdUrl(83) matches the known 2026 nominations list", () => {
    expect(years.goldenGlobes.letterboxdUrl(83)).toBe(
      "https://letterboxd.com/filmfestival/list/2026-golden-globes-nominations/"
    );
  });

  test("wikipediaUrl(83) matches the 83rd Golden Globe Awards page", () => {
    expect(years.goldenGlobes.wikipediaUrl(83)).toBe(
      "https://en.wikipedia.org/wiki/83rd_Golden_Globe_Awards"
    );
  });
});

describe("emmys URL builders", () => {
  test("wikipediaUrl(77) matches the 77th Primetime Emmy Awards page", () => {
    expect(years.emmys.wikipediaUrl(77)).toBe(
      "https://en.wikipedia.org/wiki/77th_Primetime_Emmy_Awards"
    );
  });

  test("ceremonyYear(77) is 2025", () => {
    expect(years.emmys.ceremonyYear(77)).toBe(2025);
  });
});

describe("festival URL builders", () => {
  test("sundance.letterboxdUrl(2025) matches the known 2025 list", () => {
    expect(years.sundance.letterboxdUrl(2025)).toBe(
      "https://letterboxd.com/sundance/list/2025-sundance-film-festival/"
    );
  });

  test("cannes.letterboxdUrl(2025) matches the known 2025 list", () => {
    expect(years.cannes.letterboxdUrl(2025)).toBe(
      "https://letterboxd.com/festival_cannes/list/festival-de-cannes-official-selection-2025/"
    );
  });

  test("berlinale.letterboxdUrl(2026) matches the known 2026 list", () => {
    expect(years.berlinale.letterboxdUrl(2026)).toBe(
      "https://letterboxd.com/berlinale_ifb/list/berlinale-programme-2026/"
    );
  });
});
