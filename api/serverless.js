const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("../addon");
const configurePage = require("../lib/configure");
const refreshHandler = require("./refresh");

const router = getRouter(addonInterface);

module.exports = (req, res) => {
  const path = decodeURIComponent(req.url).split("?")[0].replace(/\/+$/, "") || "/";

  // Vercel Cron + manual refresh trigger. Must come before any other routing
  // so the cron platform's POST/GET to /api/refresh always reaches the job.
  if (path === "/api/refresh" || path.startsWith("/api/refresh/")) {
    return refreshHandler(req, res);
  }

  // Serve custom configure page at root, /configure, and /{config}/configure
  if (path === "/" || path === "/configure" || path.endsWith("/configure")) {
    const html = configurePage(addonInterface.manifest, req.headers.host);
    res.setHeader("Content-Type", "text/html");
    res.end(html);
    return;
  }

  // Intercept configured manifest to ensure configurable flag is present
  if (path.endsWith("/manifest.json") && path !== "/manifest.json") {
    const originalWrite = res.end.bind(res);
    res.end = (data) => {
      try {
        const manifest = JSON.parse(data);
        if (!manifest.behaviorHints) manifest.behaviorHints = {};
        manifest.behaviorHints.configurable = true;
        manifest.behaviorHints.configurationRequired = false;
        originalWrite(JSON.stringify(manifest));
      } catch {
        originalWrite(data);
      }
    };
  }

  router(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
};
