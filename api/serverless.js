const { getRouter, publishToCentral } = require("stremio-addon-sdk");
const addonInterface = require("../addon");
const landingTemplate = require("stremio-addon-sdk/src/landingTemplate");

const router = getRouter(addonInterface);

module.exports = (req, res) => {
  // Serve the configure/landing page at root
  if (req.url === "/" || req.url === "/configure") {
    const landingHTML = landingTemplate(addonInterface.manifest);
    res.setHeader("Content-Type", "text/html");
    res.end(landingHTML);
    return;
  }

  router(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
};
