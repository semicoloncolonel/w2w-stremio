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
  test("wikipediaUrl(98) matches the 98th Academy Awards page", () => {
    expect(years.oscars.wikipediaUrl(98)).toBe("https://en.wikipedia.org/wiki/98th_Academy_Awards");
  });

  test("ceremonyYear(98) is 2026", () => {
    expect(years.oscars.ceremonyYear(98)).toBe(2026);
  });
});

describe("goldenGlobes URL builders", () => {
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
  test("sundance.wikipediaUrl(2025) matches the 2025 Sundance page", () => {
    expect(years.sundance.wikipediaUrl(2025)).toBe(
      "https://en.wikipedia.org/wiki/2025_Sundance_Film_Festival"
    );
  });

  test("cannes.wikipediaUrl(2025) matches the 2025 Cannes page", () => {
    expect(years.cannes.wikipediaUrl(2025)).toBe(
      "https://en.wikipedia.org/wiki/2025_Cannes_Film_Festival"
    );
  });

  test("berlinale.wikipediaUrl(2026) maps to the 76th Berlinale page", () => {
    expect(years.berlinale.wikipediaUrl(2026)).toBe(
      "https://en.wikipedia.org/wiki/76th_Berlin_International_Film_Festival"
    );
  });

  test("tiff.wikipediaUrl(2024) matches the 2024 TIFF page", () => {
    expect(years.tiff.wikipediaUrl(2024)).toBe(
      "https://en.wikipedia.org/wiki/2024_Toronto_International_Film_Festival"
    );
  });

  test("venice.wikipediaUrl(2024) maps to the 81st Venice page", () => {
    expect(years.venice.wikipediaUrl(2024)).toBe(
      "https://en.wikipedia.org/wiki/81st_Venice_International_Film_Festival"
    );
  });
});
