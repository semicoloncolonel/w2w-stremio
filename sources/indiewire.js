const { fetchPage, loadCheerio } = require("../lib/scraper");

const URLS = [
  { url: "https://www.indiewire.com/gallery/best-new-movies-streaming/", type: "movie" },
  { url: "https://www.indiewire.com/gallery/best-new-tv-shows/", type: "series" },
];

// Strings that are definitely not show/movie titles
const NOISE = new Set([
  "most popular",
  "you may also like",
  "related",
  "advertisement",
  "netflix",
  "hulu",
  "amazon prime",
  "disney plus",
  "apple tv+",
  "max",
  "peacock",
  "paramount+",
  "criterion channel",
  "mubi",
  "ifc films unlimited",
  "the criterion channel",
  "prime video",
]);

function cleanTitle(text) {
  let title = text;
  // Remove leading number prefix: "1. " or "10. "
  title = title.replace(/^\d+\.\s*/, "");
  // Remove trailing platform in parens: (Netflix), (Hulu), etc.
  title = title.replace(/\s*\([^)]*\)\s*$/, "");
  // Remove all quote characters (straight and curly)
  title = title.replace(/[\u201c\u201d\u201e\u201f\u2018\u2019\u201a\u201b"']/g, "");
  return title.trim();
}

function isNoise(text) {
  const lower = text.toLowerCase().trim();
  if (NOISE.has(lower)) return true;
  // Filter out author names (typically "Firstname Lastname" with no other words)
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(text) && text.length < 30) return true;
  return false;
}

async function fetchTitles() {
  const titles = [];
  const seen = new Set();

  for (const { url, type } of URLS) {
    try {
      const html = await fetchPage(url);
      const $ = loadCheerio(html);

      $("h2, h3, .gallery-item-title, .slide-title").each((_, el) => {
        const rawText = $(el).text().trim();
        if (!rawText || rawText.length < 3 || rawText.length > 150) return;

        const title = cleanTitle(rawText);
        if (!title || title.length < 2) return;
        if (isNoise(title)) return;

        const key = title.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        titles.push({
          title,
          year: undefined,
          type,
          source: "IndieWire",
          link: url,
        });
      });
    } catch (err) {
      console.error(`IndieWire fetch error (${url}):`, err.message);
    }
  }

  console.log(`IndieWire: ${titles.length} titles scraped`);
  return titles;
}

module.exports = { fetchTitles, name: "IndieWire Picks", id: "indiewire" };
