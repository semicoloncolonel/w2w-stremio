const { fetchPage, loadCheerio } = require("../lib/scraper");
const { extractTitleFromHeadline, extractYear } = require("../lib/parser");

const URL = "https://editorial.rottentomatoes.com/";

const RECOMMENDATION_PATTERNS = [
  /best .*(movies?|shows?|series)/i,
  /\d+ .*(movies?|shows?|series)/i,
  /what to watch/i,
  /new .*(streaming|on|to stream)/i,
  /must[- ]watch/i,
  /binge/i,
];

function isRecommendationArticle(title) {
  return RECOMMENDATION_PATTERNS.some((p) => p.test(title));
}

async function fetchTitles() {
  try {
    const html = await fetchPage(URL);
    const $ = loadCheerio(html);
    const titles = [];

    // RT Editorial uses WordPress with article cards
    $("article, .article-card, .post, .entry").each((_, el) => {
      const headline =
        $(el).find("h2, h3, .title, .headline").first().text().trim() ||
        $(el).find("a").first().text().trim();

      if (!headline || !isRecommendationArticle(headline)) return;

      const cleanTitle = extractTitleFromHeadline(headline);
      if (!cleanTitle || cleanTitle.length < 2) return;

      const link = $(el).find("a").first().attr("href") || "";

      titles.push({
        title: cleanTitle,
        year: extractYear(headline),
        type: undefined,
        source: "RT Editorial",
        link: link.startsWith("http") ? link : `https://editorial.rottentomatoes.com${link}`,
      });
    });

    // Also try generic link-based extraction if article selectors didn't match
    if (titles.length === 0) {
      $("a").each((_, el) => {
        const text = $(el).text().trim();
        const href = $(el).attr("href") || "";
        if (text.length > 10 && isRecommendationArticle(text)) {
          const cleanTitle = extractTitleFromHeadline(text);
          if (cleanTitle && cleanTitle.length > 2) {
            titles.push({
              title: cleanTitle,
              year: extractYear(text),
              type: undefined,
              source: "RT Editorial",
              link: href.startsWith("http") ? href : `https://editorial.rottentomatoes.com${href}`,
            });
          }
        }
      });
    }

    return titles;
  } catch (err) {
    console.error("RT Editorial fetch error:", err.message);
    return [];
  }
}

module.exports = { fetchTitles, name: "RT — Editorial Picks", id: "rtEditorial" };
