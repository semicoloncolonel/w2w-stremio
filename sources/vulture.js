const { fetchPage, loadCheerio } = require("../lib/scraper");
const { extractYear } = require("../lib/parser");

const TAG_URL = "https://www.vulture.com/tags/what-to-watch/";

// Noise to filter out from scraped headings
const NOISE_PATTERNS = [
  /^what you need/i,
  /^the weekend watch/i,
  /^sign up/i,
  /^featured/i,
  /^back in theaters/i,
  /^grand finale/i,
  /^finally streaming/i,
  /^your last chance/i,
  /^related$/i,
  /^tags/i,
  /^most (viewed|popular)/i,
  /^latest news/i,
  /^what is your email/i,
  /^sign in/i,
  /^create your/i,
  /^you're in/i,
  /^\.$/,
  /best movies and tv shows/i,
  /^vulture/i,
  /^double feature$/i,
  /^#\d+/,
  /^you're in/i,
];

function isNoise(text) {
  return NOISE_PATTERNS.some((p) => p.test(text));
}

async function fetchTitles() {
  try {
    // Step 1: Get the most recent weekly article URL from the tag page
    const listHtml = await fetchPage(TAG_URL);
    const $list = loadCheerio(listHtml);
    const articleUrls = [];

    $list("a").each((_, el) => {
      const href = $list(el).attr("href") || "";
      const text = $list(el).text().trim();
      if (
        text.includes("Best Movies and TV Shows to Watch") &&
        href.includes("vulture.com/article/")
      ) {
        if (!articleUrls.includes(href)) articleUrls.push(href);
      }
    });

    if (articleUrls.length === 0) {
      console.log("Vulture: no weekly articles found");
      return [];
    }

    // Step 2: Scrape the most recent 2 articles for show/movie names
    const titles = [];
    const seen = new Set();
    const toScrape = articleUrls.slice(0, 2);

    for (const url of toScrape) {
      try {
        const html = await fetchPage(url);
        const $ = loadCheerio(html);

        $("h2, h3, strong, b").each((_, el) => {
          let text = $(el).text().trim();
          // Remove leading dot+whitespace (Vulture's formatting)
          text = text.replace(/^\.\s*/, "");
          // Remove "season X" suffix for cleaner matching
          const cleanForKey = text.replace(/\s+season\s+\d+.*$/i, "").trim();

          if (text.length < 3 || text.length > 100) return;
          if (isNoise(text)) return;

          const key = cleanForKey.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);

          titles.push({
            title: cleanForKey,
            year: extractYear(text),
            type: undefined,
            source: "Vulture",
            link: url,
          });
        });
      } catch (err) {
        console.error(`Vulture article error (${url}):`, err.message);
      }
    }

    console.log(`Vulture: ${titles.length} titles from ${toScrape.length} articles`);
    return titles;
  } catch (err) {
    console.error("Vulture fetch error:", err.message);
    return [];
  }
}

module.exports = { fetchTitles, name: "Vulture Picks", id: "vulture" };
