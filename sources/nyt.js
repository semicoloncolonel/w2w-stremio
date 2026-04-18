const { fetchPage, loadCheerio } = require("../lib/scraper");
const cache = require("../lib/cache");

// Only need page 1 — it has the 4 most recent weekly column picks
const SPOTLIGHT_URL = "https://www.nytimes.com/spotlight/what-to-watch";
const CACHE_KEY = "source:nyt";
const CACHE_TTL = 6 * 60 * 60 * 1000;

// Match the weekly "What to Watch" column format
const WEEKLY_COLUMN =
  /\u2018([^\u2019]+)\u2019,?\s+(Plus\s+\d+\s+Things?\s+to\s+Watch|Reboot|Is\s+Back)/i;

async function fetchTitles() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const titles = [];
  const seen = new Set();

  try {
    const html = await fetchPage(SPOTLIGHT_URL);
    const $ = loadCheerio(html);

    $(".css-1j88qqx, .css-bko25c a, .css-1x50auk a, .css-j9v18q a, h3 a").each((_, el) => {
      const headline = $(el).text().trim();
      if (!headline) return;

      const match = headline.match(WEEKLY_COLUMN);
      if (!match) return;

      let title = match[1]
        .trim()
        .replace(/[,:]\s*$/, "")
        .trim();
      if (title.length < 2) return;

      const key = title.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      titles.push({
        title,
        year: undefined,
        type: undefined,
        source: "NYT",
        link: "",
      });
    });
  } catch (err) {
    console.error("NYT spotlight error:", err.message);
  }

  console.log(`NYT weekly column: ${titles.length} picks (last 4 weeks)`);
  cache.set(CACHE_KEY, titles, CACHE_TTL);
  return titles;
}

module.exports = { fetchTitles, name: "NYT Picks", id: "nyt" };
