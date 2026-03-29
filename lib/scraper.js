const cheerio = require("cheerio");

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
  return res.text();
}

function extractJsonLd(html) {
  const $ = cheerio.load(html);
  const results = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      results.push(data);
    } catch {
      // skip malformed JSON-LD
    }
  });
  return results;
}

function loadCheerio(html) {
  return cheerio.load(html);
}

module.exports = { fetchPage, extractJsonLd, loadCheerio };
