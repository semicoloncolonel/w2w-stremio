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
    letterboxdUrl: (n) =>
      `https://letterboxd.com/oscars/list/the-${ordinal(n)}-academy-award-nominees-all-feature/`,
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
};
