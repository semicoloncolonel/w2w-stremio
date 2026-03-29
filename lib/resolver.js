const cache = require("./cache");

const TMDB_BASE = "https://api.themoviedb.org/3";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

async function resolve(title, year, type, tmdbKey) {
  if (!title || !tmdbKey) return null;

  const cacheKey = `resolve:${title.toLowerCase()}:${year || ""}:${type || ""}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const meta = await searchTMDB(title, year, type, tmdbKey);
    if (meta) {
      cache.set(cacheKey, meta, CACHE_TTL);
    }
    return meta;
  } catch (err) {
    console.error(`Resolver error for "${title}":`, err.message);
    return null;
  }
}

async function searchTMDB(title, year, type, apiKey) {
  // If type is known, search specifically; otherwise use multi-search
  const searchType =
    type === "movie" ? "movie" : type === "series" ? "tv" : "multi";
  const endpoint = `${TMDB_BASE}/search/${searchType}`;

  const params = new URLSearchParams({
    api_key: apiKey,
    query: title,
    include_adult: "false",
  });

  if (year) {
    if (searchType === "movie") params.set("year", String(year));
    else if (searchType === "tv") params.set("first_air_date_year", String(year));
  }

  const res = await fetch(`${endpoint}?${params}`);
  if (!res.ok) {
    if (res.status === 429) {
      // Rate limited — wait and retry once
      await new Promise((r) => setTimeout(r, 1500));
      return searchTMDB(title, year, type, apiKey);
    }
    throw new Error(`TMDB ${res.status}`);
  }

  const data = await res.json();
  const results = data.results || [];
  if (results.length === 0) return null;

  // Pick best match: prefer exact title match, then first result
  const normalizedTitle = title.toLowerCase();
  const best =
    results.find(
      (r) =>
        (r.title || r.name || "").toLowerCase() === normalizedTitle
    ) || results[0];

  // Get external IDs (IMDb)
  const mediaType = best.media_type || (searchType === "multi" ? undefined : searchType);
  const tmdbType = mediaType === "tv" ? "tv" : "movie";
  const imdbId = await getImdbId(best.id, tmdbType, apiKey);

  if (!imdbId) return null;

  const posterPath = best.poster_path
    ? `https://image.tmdb.org/t/p/w500${best.poster_path}`
    : undefined;

  return {
    id: imdbId,
    type: tmdbType === "tv" ? "series" : "movie",
    name: best.title || best.name,
    poster: posterPath,
    year: extractYearFromDate(best.release_date || best.first_air_date),
    description: best.overview || undefined,
  };
}

async function getImdbId(tmdbId, tmdbType, apiKey) {
  const cacheKey = `imdb:${tmdbType}:${tmdbId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(
    `${TMDB_BASE}/${tmdbType}/${tmdbId}/external_ids?api_key=${apiKey}`
  );
  if (!res.ok) return null;

  const data = await res.json();
  const imdbId = data.imdb_id;
  if (imdbId) cache.set(cacheKey, imdbId, CACHE_TTL);
  return imdbId;
}

function extractYearFromDate(dateStr) {
  if (!dateStr) return undefined;
  const y = parseInt(dateStr.substring(0, 4));
  return isNaN(y) ? undefined : y;
}

module.exports = { resolve };
