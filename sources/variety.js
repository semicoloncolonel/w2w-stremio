const { parseRSS, extractTitleFromHeadline, extractYear, isListArticle } = require("../lib/parser");
const cache = require("../lib/cache");

const FEED_URL = "https://variety.com/e/what-to-watch/feed/";
const CACHE_KEY = "source:variety";
const CACHE_TTL = 6 * 60 * 60 * 1000;

async function fetchTitles() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const items = await parseRSS(FEED_URL);
  const titles = [];

  for (const item of items) {
    if (isListArticle(item.title)) continue;
    const cleanTitle = extractTitleFromHeadline(item.title);
    if (!cleanTitle || cleanTitle.length < 2) continue;

    titles.push({
      title: cleanTitle,
      year: extractYear(item.title) || extractYear(item.description),
      type: undefined,
      source: "Variety",
      link: item.link,
    });
  }

  cache.set(CACHE_KEY, titles, CACHE_TTL);
  return titles;
}

module.exports = { fetchTitles, name: "Variety Picks", id: "variety" };
