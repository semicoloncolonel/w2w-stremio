const { parseRSS, extractTitleFromHeadline, extractYear, isListArticle } = require("../lib/parser");
const cache = require("../lib/cache");

const FEED_URL = "https://decider.com/what-to-watch/feed/";
const CACHE_KEY = "source:decider";
const CACHE_TTL = 6 * 60 * 60 * 1000;

async function fetchTitles() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const items = await parseRSS(FEED_URL);
  const titles = [];

  for (const item of items) {
    const rawTitle = item.title;
    if (isListArticle(rawTitle)) continue;
    // Decider often uses "Stream It or Skip It: 'Title' on Platform" format
    const cleanTitle = extractTitleFromHeadline(rawTitle);
    if (!cleanTitle || cleanTitle.length < 2) continue;

    const year = extractYear(rawTitle) || extractYear(item.description);

    titles.push({
      title: cleanTitle,
      year,
      type: undefined, // let resolver figure it out
      source: "Decider",
      link: item.link,
    });
  }

  cache.set(CACHE_KEY, titles, CACHE_TTL);
  return titles;
}

module.exports = { fetchTitles, name: "Decider Picks", id: "decider" };
