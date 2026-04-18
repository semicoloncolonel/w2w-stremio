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
    current: 98,
    ceremonyYear: (n) => 1928 + n,
    // The official `/oscars/` Letterboxd account maintains a per-edition master
    // list at this slug. The grid view (no suffix) shows just titles; the
    // `/detail/` view adds per-film notes that include the nominated category
    // names — that's what `letterboxdDetailUrl` builds and the scraper hits.
    letterboxdUrl: (n) =>
      `https://letterboxd.com/oscars/list/the-${ordinal(n)}-academy-award-feature-film-nominees/`,
    letterboxdDetailUrl: (n) =>
      `https://letterboxd.com/oscars/list/the-${ordinal(n)}-academy-award-feature-film-nominees/detail/`,
    wikipediaUrl: (n) => `https://en.wikipedia.org/wiki/${ordinal(n)}_Academy_Awards`,
  },

  goldenGlobes: {
    // 1st Golden Globe Awards held January 20, 1944 (honoring 1943 films);
    // 83rd ceremony held January 11, 2026. So ceremonyYear(n) = 1943 + n.
    current: 83,
    ceremonyYear: (n) => 1943 + n,
    letterboxdUrl: (n) => {
      const y = 1943 + n;
      return `https://letterboxd.com/filmfestival/list/${y}-golden-globes-nominations/`;
    },
    wikipediaUrl: (n) => `https://en.wikipedia.org/wiki/${ordinal(n)}_Golden_Globe_Awards`,
  },

  emmys: {
    // 1st Primetime Emmy Awards held January 25, 1949; 77th ceremony held
    // September 14, 2025. So ceremonyYear(n) = 1948 + n.
    current: 77,
    ceremonyYear: (n) => 1948 + n,
    wikipediaUrl: (n) => `https://en.wikipedia.org/wiki/${ordinal(n)}_Primetime_Emmy_Awards`,
  },

  sundance: {
    currentYear: 2025,
    letterboxdUrl: (y) => `https://letterboxd.com/sundance/list/${y}-sundance-film-festival/`,
  },

  cannes: {
    currentYear: 2025,
    letterboxdUrl: (y) =>
      `https://letterboxd.com/festival_cannes/list/festival-de-cannes-official-selection-${y}/`,
  },

  berlinale: {
    currentYear: 2026,
    letterboxdUrl: (y) => `https://letterboxd.com/berlinale_ifb/list/berlinale-programme-${y}/`,
  },

  venice: {
    // Venice International Film Festival uses post-war (1943-based) edition
    // numbering. 81st edition = 2024, 82nd = 2025. See `editionForYear`.
    // No official Letterboxd account exists; community lists are incomplete
    // (the `neperfectionist` list set is missing 2020 etc.) so we use the
    // per-edition Wikipedia page, which has reliable coverage back further
    // and yields more films per year (e.g. 244 vs 174 for 2024). Year of
    // each film is not present on Wikipedia tables — only the festival year
    // is captured (in the source label).
    currentYear: 2025,
    currentEdition: 82,
    editionForYear: (y) => y - 1943,
    wikipediaUrl: (y) =>
      `https://en.wikipedia.org/wiki/${ordinal(y - 1943)}_Venice_International_Film_Festival`,
  },

  tiff: {
    // Toronto International Film Festival. The official `tiff_net` account
    // maintains a per-year Letterboxd list with comprehensive coverage
    // (~258 films for 2024). Reuses the existing Letterboxd scraper.
    currentYear: 2025,
    letterboxdUrl: (y) =>
      `https://letterboxd.com/tiff_net/list/${y}-toronto-international-film-festival/`,
  },
};
