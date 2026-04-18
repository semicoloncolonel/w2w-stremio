const { XMLParser } = require("fast-xml-parser");

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

async function parseRSS(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "W2W-Stremio/1.0" },
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status} ${url}`);
  const xml = await res.text();
  const parsed = xmlParser.parse(xml);

  const channel = parsed?.rss?.channel;
  if (!channel) return [];

  const items = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];

  return items.map((item) => ({
    title: decodeEntities(item.title || ""),
    link: item.link || "",
    date: item.pubDate || "",
    description: decodeEntities(
      typeof item.description === "string" ? item.description : item.description?.["#text"] || ""
    ),
    image:
      item["media:thumbnail"]?.["@_url"] ||
      item["media:content"]?.["@_url"] ||
      item.enclosure?.["@_url"] ||
      "",
  }));
}

function decodeEntities(str) {
  return str
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8218;/g, ",")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#038;|&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// Extract a clean title from an editorial headline
// e.g. "Stream It or Skip It: 'Cheaper by the Dozen' on Disney+" → "Cheaper by the Dozen"
function extractTitleFromHeadline(headline) {
  let title = headline;

  // Remove common prefixes
  const prefixes = [
    /^stream it or skip it:\s*/i,
    /^what to watch:\s*/i,
    /^now streaming:\s*/i,
    /^new on \w+:\s*/i,
    /^review:\s*/i,
    /^\d+\.\s*/,
  ];
  for (const prefix of prefixes) {
    title = title.replace(prefix, "");
  }

  // Extract quoted title if present
  const quoted = title.match(/['''""«»"]([^'''""«»"]+)['''""«»"]/);
  if (quoted) return quoted[1].trim();

  // Remove trailing platform info: "on Netflix", "on Hulu", etc.
  title = title.replace(
    /\s+on\s+(Netflix|Hulu|Disney\+|Max|Amazon|Prime Video|Apple TV\+|Peacock|Paramount\+|Tubi|Roku|Starz|Showtime|BritBox|Crunchyroll|Mubi|Shudder).*$/i,
    ""
  );

  // Remove parenthetical year
  title = title.replace(/\s*\(\d{4}\)\s*$/, "");

  // Remove trailing season/episode info
  title = title.replace(/\s+season\s+\d+.*$/i, "");

  return title.trim();
}

// Try to extract a year from a headline or description
function extractYear(text) {
  const match = text.match(/\((\d{4})\)/);
  return match ? parseInt(match[1]) : undefined;
}

// Detect headlines that are list/calendar articles, not individual title recommendations
function isListArticle(headline) {
  const patterns = [
    /what's coming to/i,
    /\d+ best .*(movies|shows|series)/i,
    /the \d+ best/i,
    /ranked$/i,
    /finally releases/i,
    /star .* on sparking/i,
    /coming to .* in (january|february|march|april|may|june|july|august|september|october|november|december)/i,
  ];
  return patterns.some((p) => p.test(headline));
}

module.exports = { parseRSS, extractTitleFromHeadline, extractYear, decodeEntities, isListArticle };
