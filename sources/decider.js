const { parseRSS, extractTitleFromHeadline, extractYear, isListArticle } = require("../lib/parser");

const FEED_URL = "https://decider.com/what-to-watch/feed/";

async function fetchTitles() {
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

  return titles;
}

module.exports = { fetchTitles, name: "Decider Picks", id: "decider" };
