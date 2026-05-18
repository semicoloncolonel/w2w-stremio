// Configure page HTML smoke tests.
//
// configurePage() returns a self-contained HTML string for the install UI.
// These tests cover the client-picker structure and the conditional install
// affordances per client. No DOM rendering — just string-level assertions on
// the generated HTML.

const configurePage = require("../lib/configure");
const { buildManifest } = require("../lib/manifest-template");

function render() {
  const manifest = buildManifest({ perCatalogOptions: {} });
  return configurePage(manifest, "addon.example.com");
}

describe("configure page", () => {
  test("renders three client-picker radio options", () => {
    const html = render();
    expect(html).toMatch(/name="client"\s+value="stremio-desktop"/);
    expect(html).toMatch(/name="client"\s+value="stremio-mobile"/);
    expect(html).toMatch(/name="client"\s+value="nuvio"/);
  });

  test("Stremio Desktop is the default selection", () => {
    const html = render();
    // The desktop radio should carry the `checked` attribute; the others
    // should not.
    const desktopMatch = html.match(/value="stremio-desktop"[^>]*?>/);
    const mobileMatch = html.match(/value="stremio-mobile"[^>]*?>/);
    const nuvioMatch = html.match(/value="nuvio"[^>]*?>/);
    expect(desktopMatch && desktopMatch[0]).toMatch(/\schecked\b/);
    expect(mobileMatch && mobileMatch[0]).not.toMatch(/\schecked\b/);
    expect(nuvioMatch && nuvioMatch[0]).not.toMatch(/\schecked\b/);
  });

  test("includes the Stremio install button and the Nuvio steps block", () => {
    const html = render();
    expect(html).toContain('id="installBtn"');
    expect(html).toContain('id="nuvioSteps"');
    // Nuvio steps default-hidden — JS reveals on selection.
    expect(html).toMatch(/id="nuvioSteps"[^>]*\bhidden\b/);
  });

  test("does not render a Mobile mode checkbox", () => {
    const html = render();
    // The old display-group checkbox is gone; the picker subsumes it.
    expect(html).not.toMatch(/name="mobileMode"/);
    expect(html).not.toMatch(/Mobile mode/);
  });

  test("inline script sets mobileMode for mobile and Nuvio clients", () => {
    const html = render();
    // The getConfig() implementation should set mobileMode='on' when the
    // picker is on stremio-mobile or nuvio. Smoke-check the literal string.
    expect(html).toContain("'stremio-mobile'");
    expect(html).toContain("'nuvio'");
    expect(html).toMatch(/config\.mobileMode\s*=\s*['"]on['"]/);
  });

  test("renders exclusion checkboxes from manifest config", () => {
    const html = render();
    expect(html).toContain('name="noDecider"');
    expect(html).toContain('name="noOscars"');
  });

  test("manifest URL points at the host that was passed in", () => {
    const html = render();
    expect(html).toContain("https://addon.example.com/");
  });

  test("uses http for localhost hosts", () => {
    const manifest = buildManifest({ perCatalogOptions: {} });
    const html = configurePage(manifest, "localhost:7000");
    expect(html).toContain("http://localhost:7000/");
    expect(html).not.toContain("https://localhost:7000/");
  });
});
