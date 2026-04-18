// Helper: build a fetch mock response
function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function errorResponse(status) {
  return { ok: false, status, json: async () => ({}) };
}

// Sample TMDB search hit for a movie
const MOVIE_HIT = {
  id: 872585,
  title: "Oppenheimer",
  release_date: "2023-07-19",
  poster_path: "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
  overview: "The story of J. Robert Oppenheimer.",
};

// Sample TMDB search hit for a TV series
const TV_HIT = {
  id: 136315,
  name: "The Bear",
  first_air_date: "2022-06-23",
  poster_path: "/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg",
  overview: "A young chef returns to Chicago.",
};

const MOVIE_EXTERNAL = { imdb_id: "tt15398776" };
const TV_EXTERNAL = { imdb_id: "tt14452776" };

describe("resolve", () => {
  let resolver;

  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn();
    resolver = require("../../lib/resolver");
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.fetch;
  });

  test("returns null when title is empty", async () => {
    const result = await resolver.resolve("", 2023, "movie", "key");
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("returns null when tmdbKey is empty", async () => {
    const result = await resolver.resolve("Oppenheimer", 2023, "movie", "");
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("movie search hits /search/movie and returns meta with imdb id", async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ results: [MOVIE_HIT] }))
      .mockResolvedValueOnce(jsonResponse(MOVIE_EXTERNAL));

    const result = await resolver.resolve("Oppenheimer", 2023, "movie", "key");

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const searchUrl = global.fetch.mock.calls[0][0];
    expect(searchUrl).toContain("/search/movie");
    expect(searchUrl).toContain("query=Oppenheimer");
    expect(searchUrl).toContain("year=2023");

    const externalUrl = global.fetch.mock.calls[1][0];
    expect(externalUrl).toContain("/movie/872585/external_ids");

    expect(result).toEqual({
      id: "tt15398776",
      type: "movie",
      name: "Oppenheimer",
      poster: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
      year: 2023,
      description: "The story of J. Robert Oppenheimer.",
    });
  });

  test("series search hits /search/tv endpoint", async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ results: [TV_HIT] }))
      .mockResolvedValueOnce(jsonResponse(TV_EXTERNAL));

    const result = await resolver.resolve("The Bear", 2022, "series", "key");

    const searchUrl = global.fetch.mock.calls[0][0];
    expect(searchUrl).toContain("/search/tv");
    expect(searchUrl).toContain("first_air_date_year=2022");

    const externalUrl = global.fetch.mock.calls[1][0];
    expect(externalUrl).toContain("/tv/136315/external_ids");

    expect(result).toMatchObject({
      id: "tt14452776",
      type: "series",
      name: "The Bear",
      year: 2022,
    });
  });

  test("unknown type uses /search/multi endpoint", async () => {
    const multiHit = { ...MOVIE_HIT, media_type: "movie" };
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ results: [multiHit] }))
      .mockResolvedValueOnce(jsonResponse(MOVIE_EXTERNAL));

    const result = await resolver.resolve("Oppenheimer", undefined, undefined, "key");

    const searchUrl = global.fetch.mock.calls[0][0];
    expect(searchUrl).toContain("/search/multi");
    expect(result).toMatchObject({ id: "tt15398776", type: "movie" });
  });

  test("retries once on 429 and ultimately succeeds", async () => {
    jest.useFakeTimers();

    global.fetch
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(jsonResponse({ results: [MOVIE_HIT] }))
      .mockResolvedValueOnce(jsonResponse(MOVIE_EXTERNAL));

    const promise = resolver.resolve("Oppenheimer", 2023, "movie", "key");
    // Allow the rejected fetch to settle and the setTimeout to be scheduled
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1500);

    const result = await promise;
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ id: "tt15398776", type: "movie" });
  });

  test("returns null when search yields no results", async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ results: [] }));

    const result = await resolver.resolve("Nonexistent Title", 1999, "movie", "key");

    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("caches successful resolves so repeat calls skip network", async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ results: [MOVIE_HIT] }))
      .mockResolvedValueOnce(jsonResponse(MOVIE_EXTERNAL));

    const first = await resolver.resolve("Oppenheimer", 2023, "movie", "key");
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const second = await resolver.resolve("Oppenheimer", 2023, "movie", "key");
    // Second call must come straight from the in-memory cache
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
  });
});
