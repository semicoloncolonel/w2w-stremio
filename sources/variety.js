const { parseRSS, extractTitleFromHeadline, extractYear, isListArticle } = require("../lib/parser");

const FEED_URL = "https://variety.com/e/what-to-watch/feed/";

async function fetchTitles() {
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

  return titles;
}

module.exports = { fetchTitles, name: "Variety Picks", id: "variety" };
