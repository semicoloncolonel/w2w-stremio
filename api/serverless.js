const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("../addon");
const storage = require("../lib/storage");
const configurePage = require("../lib/configure");
const refreshHandler = require("./refresh");
const { applyMobileMode } = require("../lib/manifest-template");

// Decode the SDK's URL config segment ({"key":"on",...} URL-encoded) into
// a plain object. Returns {} on any parse error so callers can treat the
// result as a normal config map.
function parseConfigSegment(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch (err) {
    return {};
  }
}

function isMobileMode(config) {
  if (!config) return false;
  const v = config.mobileMode;
  return v === true || v === "true" || v === "on";
}

const router = getRouter(addonInterface);

// Serve `/manifest.json` (and `/{config}/manifest.json`) directly from the
// storage blob written by the refresh job. The SDK's addonBuilder bakes the
// manifest in at construction time, so without this bypass the manifest
// dropdowns (year, genre options) would only update when the addon process
// restarts. The catalog handler stays on the SDK builder.
async function serveManifestFromStorage(req, res, configRaw) {
  let manifest = null;
  try {
    manifest = await storage.getJSON("manifest.json");
  } catch (err) {
    console.warn("[serverless] manifest.json read failed:", err.message);
  }
  if (!manifest) {
    // Fall back to the cached/template manifest exposed by addon.js.
    manifest = addonInterface.getCachedManifest
      ? addonInterface.getCachedManifest()
      : addonInterface.manifest;
  }

  // Mirror the SDK behavior: when a config segment is present, drop the
  // configurationRequired/configurable hints (the addon is "configured" now).
  if (configRaw) {
    const clone = JSON.parse(JSON.stringify(manifest));
    if (clone.behaviorHints) {
      delete clone.behaviorHints.configurationRequired;
      delete clone.behaviorHints.configurable;
    }
    manifest = clone;
  }

  // Mobile-mode transform: collapses year extras into the genre extra so
  // Stremio mobile clients (which only render `genre`) can filter by year.
  // See lib/manifest-template.js applyMobileMode for the rules.
  const config = parseConfigSegment(configRaw);
  if (isMobileMode(config)) {
    manifest = applyMobileMode(manifest);
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(manifest));
}

// Match `/manifest.json` or `/{config}/manifest.json`. Returns the config
// segment (raw, undecoded) when present, "" for plain `/manifest.json`,
// or null when the path is something else.
function matchManifestPath(path) {
  if (path === "/manifest.json") return "";
  const m = path.match(/^\/([^/]+)\/manifest\.json$/);
  if (m) return m[1];
  return null;
}

module.exports = (req, res) => {
  const path = decodeURIComponent(req.url).split("?")[0].replace(/\/+$/, "") || "/";

  // Vercel Cron + manual refresh trigger. Must come before any other routing
  // so the cron platform's POST/GET to /api/refresh always reaches the job.
  if (path === "/api/refresh" || path.startsWith("/api/refresh/")) {
    return refreshHandler(req, res);
  }

  // Serve custom configure page at root, /configure, and /{config}/configure
  if (path === "/" || path === "/configure" || path.endsWith("/configure")) {
    const manifest = addonInterface.getCachedManifest
      ? addonInterface.getCachedManifest()
      : addonInterface.manifest;
    const html = configurePage(manifest, req.headers.host);
    res.setHeader("Content-Type", "text/html");
    res.end(html);
    return;
  }

  // Serve the dynamic manifest from storage, bypassing the SDK router so the
  // year/genre dropdown options reflect the latest refresh.
  const configMatch = matchManifestPath(path);
  if (configMatch !== null) {
    return serveManifestFromStorage(req, res, configMatch);
  }

  router(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
};
