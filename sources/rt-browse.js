const { fetchPage, extractJsonLd } = require("../lib/scraper");
const cache = require("../lib/cache");

const URL = "https://www.rottentomatoes.com/browse/movies_at_home/sort:newest";
const CACHE_KEY = "source:rt-browse";
const CACHE_TTL = 6 * 60 * 60 * 1000;

async function fetchTitles() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  try {
    const html = await fetchPage(URL);
    const jsonLdBlocks = extractJsonLd(html);
    const titles = [];

    for (const block of jsonLdBlocks) {
      // Look for ItemList with movie entries
      if (block["@type"] === "ItemList" && Array.isArray(block.itemListElement)) {
        for (const item of block.itemListElement) {
          const name = item.name || item.item?.name;
          if (!name) continue;

          titles.push({
            title: name,
            year: undefined,
            type: "movie",
            source: "Rotten Tomatoes",
            link: item.url || item.item?.url || "",
          });
        }
      }
    }

    // If JSON-LD didn't work, try parsing the page HTML
    if (titles.length === 0) {
      const cheerio = require("cheerio");
      const $ = cheerio.load(html);

      // RT uses tile structures for movie browsing
      $('[data-qa="discovery-media-list-item"]').each((_, el) => {
        const name = $(el).find('[data-qa="discovery-media-list-item-title"]').text().trim();
        if (name) {
          titles.push({
            title: name,
            year: undefined,
            type: "movie",
            source: "Rotten Tomatoes",
            link: "",
          });
        }
      });

      // Alternative selector patterns
      if (titles.length === 0) {
        $("a[href*='/m/']").each((_, el) => {
          const name = $(el).find("span.p--small").text().trim();
          if (name && name.length > 1) {
            titles.push({
              title: name,
              year: undefined,
              type: "movie",
              source: "Rotten Tomatoes",
              link: "https://www.rottentomatoes.com" + ($(el).attr("href") || ""),
            });
          }
        });
      }
    }

    cache.set(CACHE_KEY, titles, CACHE_TTL);
    return titles;
  } catch (err) {
    console.error("RT Browse fetch error:", err.message);
    return [];
  }
}

module.exports = { fetchTitles, name: "Rotten Tomatoes", id: "rtBrowse" };
