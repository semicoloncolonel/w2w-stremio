const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("../addon");
const configurePage = require("../lib/configure");

const router = getRouter(addonInterface);

module.exports = (req, res) => {
  // Serve custom configure page at root and /configure
  const path = req.url.split("?")[0].replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/configure") {
    const html = configurePage(addonInterface.manifest, req.headers.host);
    res.setHeader("Content-Type", "text/html");
    res.end(html);
    return;
  }

  router(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
};
