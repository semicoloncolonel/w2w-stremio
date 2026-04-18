// config/years.js
// Centralised knowledge about award/festival editions and how to build URLs
// from an edition number or calendar year. Pure functions/constants only —
// no I/O, no external deps, safe to require from anywhere.

// Convert a positive integer to its English ordinal: 1 -> "1st", 22 -> "22nd",
// 111 -> "111th". Handles the 11/12/13 exception (which beats the 1/2/3 rule)
// at any magnitude (e.g. 111th, 112th, 113th).
function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

module.exports = {
  ordinal,

  oscars: {
    // 1st Academy Awards held May 16, 1929 (honoring 1927/28 films); 98th
    // ceremony held March 15, 2026. So ceremonyYear(n) = 1928 + n.
    //
    // Wikipedia is the only source we use: the official Letterboxd /oscars/
    // account began returning HTTP 403 on the /detail/ list URL in 2026, and
    // the Wikipedia per-edition page has the same category data going back
    // decades with a stable URL pattern.
    current: 98,
    ceremonyYear: (n) => 1928 + n,
    wikipediaUrl: (n) => `https://en.wikipedia.org/wiki/${ordinal(n)}_Academy_Awards`,
  },

  goldenGlobes: {
    // 1st Golden Globe Awards held January 20, 1944 (honoring 1943 films);
    // 83rd ceremony held January 11, 2026. So ceremonyYear(n) = 1943 + n.
    current: 83,
    ceremonyYear: (n) => 1943 + n,
    wikipediaUrl: (n) => `https://en.wikipedia.org/wiki/${ordinal(n)}_Golden_Globe_Awards`,
  },

  emmys: {
    // 1st Primetime Emmy Awards held January 25, 1949; 77th ceremony held
    // September 14, 2025. So ceremonyYear(n) = 1948 + n.
    current: 77,
    ceremonyYear: (n) => 1948 + n,
    wikipediaUrl: (n) => `https://en.wikipedia.org/wiki/${ordinal(n)}_Primetime_Emmy_Awards`,
  },

  // Festivals all use Wikipedia as the data source. We previously tried the
  // official Letterboxd accounts (sundance/, festival_cannes/, berlinale_ifb/,
  // tiff_net/) but coverage was inconsistent across years — Cannes only kept
  // a 2025 list, Berlinale only kept the current edition, Sundance only had
  // 2023+, etc. Wikipedia has reliable per-edition pages going back decades
  // and the scraper for it (lib/scraper.js + sources/festivals.js) was already
  // proven by Venice. The cost is that Wikipedia tables don't expose per-film
  // release year, so the resolver falls back to title-only TMDB matching.

  sundance: {
    currentYear: 2025,
    wikipediaUrl: (y) => `https://en.wikipedia.org/wiki/${y}_Sundance_Film_Festival`,
  },

  cannes: {
    currentYear: 2025,
    wikipediaUrl: (y) => `https://en.wikipedia.org/wiki/${y}_Cannes_Film_Festival`,
  },

  berlinale: {
    // 1st Berlinale was held in 1951; 75th = 2025, 76th = 2026.
    // edition = year - 1950.
    currentYear: 2026,
    wikipediaUrl: (y) =>
      `https://en.wikipedia.org/wiki/${ordinal(y - 1950)}_Berlin_International_Film_Festival`,
  },

  venice: {
    // Venice International Film Festival uses post-war (1943-based) edition
    // numbering. 81st edition = 2024, 82nd = 2025.
    currentYear: 2025,
    currentEdition: 82,
    editionForYear: (y) => y - 1943,
    wikipediaUrl: (y) =>
      `https://en.wikipedia.org/wiki/${ordinal(y - 1943)}_Venice_International_Film_Festival`,
  },

  tiff: {
    // Toronto International Film Festival. Wikipedia per-year pages
    // (e.g. /wiki/2024_Toronto_International_Film_Festival) have ~300+
    // films per edition with stable URLs.
    currentYear: 2025,
    wikipediaUrl: (y) => `https://en.wikipedia.org/wiki/${y}_Toronto_International_Film_Festival`,
  },
};
