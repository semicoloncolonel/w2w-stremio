module.exports = function configurePage(manifest, host) {
  const protocol = host && host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const exclusionCheckboxes = (manifest.config || []).filter(
    (c) => c.type === "checkbox" && c.group !== "display"
  );

  const renderExclusion = (c) => `
        <label class="checkbox-item">
          <input type="checkbox" id="${c.key}" name="${c.key}">
          <span>${c.title.replace("Exclude ", "")}</span>
        </label>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${manifest.name} — Stremio Addon</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a1a;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 40px 20px;
    }
    .container {
      max-width: 540px;
      width: 100%;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 6px;
    }
    .subtitle {
      color: #888;
      font-size: 14px;
      margin-bottom: 32px;
      line-height: 1.5;
    }
    .tagline {
      color: #8f8;
      font-size: 13px;
      margin-bottom: 24px;
      padding: 10px 14px;
      background: #11281a;
      border: 1px solid #1f4a30;
      border-radius: 8px;
    }
    .section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #666;
      margin-bottom: 12px;
      margin-top: 28px;
    }
    .section-label:first-of-type { margin-top: 0; }
    .client-picker {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .picker-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: #141428;
      border: 1px solid #2a2a4a;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .picker-item:hover { background: #1a1a38; }
    .picker-item input[type="radio"] {
      accent-color: #5b4fcf;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }
    .picker-item:has(input:checked) {
      border-color: #5b4fcf;
      background: #1a1a38;
    }
    .picker-text { line-height: 1.3; }
    .picker-title {
      font-size: 14px;
      font-weight: 600;
      color: #eee;
    }
    .picker-sub {
      font-size: 12px;
      color: #888;
      margin-top: 2px;
    }
    .checkboxes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #141428;
      border: 1px solid #2a2a4a;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .checkbox-item:hover { background: #1a1a38; }
    .checkbox-item input[type="checkbox"] {
      accent-color: #5b4fcf;
      width: 16px;
      height: 16px;
    }
    .checkbox-item span {
      font-size: 13px;
      color: #ccc;
    }
    .actions {
      margin-top: 32px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      transition: background 0.2s, transform 0.1s;
    }
    .btn:active { transform: scale(0.98); }
    .btn-primary {
      background: #5b4fcf;
      color: #fff;
    }
    .btn-primary:hover { background: #6b5fd9; }
    .nuvio-steps {
      padding: 14px 16px;
      background: #141428;
      border: 1px solid #2a2a4a;
      border-radius: 10px;
      font-size: 13px;
      color: #ccc;
      line-height: 1.5;
    }
    .nuvio-steps strong { color: #fff; }
    .copy-row {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .copy-label {
      font-size: 11px;
      color: #666;
      margin-bottom: 6px;
    }
    .copy-input {
      flex: 1;
      padding: 8px 10px;
      background: #0d0d1a;
      border: 1px dashed #333;
      border-radius: 6px;
      color: #777;
      font-size: 11px;
      font-family: monospace;
      outline: none;
    }
    .copy-btn {
      padding: 10px 16px;
      background: #1e1e3a;
      border: 1px solid #2a2a4a;
      border-radius: 8px;
      color: #ccc;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .copy-btn:hover { background: #2a2a4a; }
    .copy-btn.copied { background: #2d4a2d; border-color: #3a6a3a; color: #8f8; }
    .sources-info {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #1e1e3a;
    }
    .sources-info h3 {
      font-size: 14px;
      color: #888;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .source-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .source-tag {
      padding: 4px 10px;
      background: #1a1a30;
      border-radius: 12px;
      font-size: 12px;
      color: #999;
    }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${manifest.name}</h1>
    <p class="subtitle">${manifest.description}</p>

    <div class="tagline">Use the year and category filters in your app to narrow down each catalog. By default, the most recent year is shown.</div>

    <div class="section-label">Install for</div>
    <div class="client-picker">
      <label class="picker-item">
        <input type="radio" name="client" value="stremio-desktop" checked>
        <div class="picker-text">
          <div class="picker-title">Stremio</div>
          <div class="picker-sub">Desktop &amp; Web — separate Year and Category filters</div>
        </div>
      </label>
      <label class="picker-item">
        <input type="radio" name="client" value="stremio-mobile">
        <div class="picker-text">
          <div class="picker-title">Stremio Mobile</div>
          <div class="picker-sub">iOS / Android — Year and Category combined into one filter</div>
        </div>
      </label>
      <label class="picker-item">
        <input type="radio" name="client" value="nuvio">
        <div class="picker-text">
          <div class="picker-title">Nuvio</div>
          <div class="picker-sub">Mobile and TV — Year and Category combined into one filter</div>
        </div>
      </label>
    </div>

    <div class="section-label">Exclude sources / catalogs</div>
    <div class="checkboxes">
      ${exclusionCheckboxes.map(renderExclusion).join("")}
    </div>

    <div class="actions">
      <a id="installBtn" class="btn btn-primary" href="#">Install in Stremio</a>

      <div id="nuvioSteps" class="nuvio-steps" hidden>
        <strong>Add to Nuvio:</strong>
        Open Nuvio → Account Dashboard → Addons → paste the URL below → Save.
      </div>

      <div id="copySection">
        <p class="copy-label" id="copyLabel">Can't open Stremio? Copy this link and paste it in Stremio's search bar:</p>
        <div class="copy-row">
          <input type="text" id="copyInput" class="copy-input" readonly value="">
          <button id="copyBtn" class="copy-btn" onclick="copyLink()">Copy</button>
        </div>
      </div>
    </div>

    <div class="sources-info">
      <h3>Catalogs included</h3>
      <div class="source-list">
        ${manifest.catalogs
          .map((c) => `<span class="source-tag">${c.name}</span>`)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join("")}
      </div>
    </div>
  </div>

  <script>
    function getSelectedClient() {
      const checked = document.querySelector('input[name="client"]:checked');
      return checked ? checked.value : 'stremio-desktop';
    }

    function getConfig() {
      const config = {};
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb.checked) config[cb.name] = 'on';
      });
      // The on-the-wire flag is still mobileMode for backwards compatibility
      // with addon URLs already installed in users' clients. Stremio Mobile
      // and Nuvio share the same single-filter rendering constraint, so they
      // both get the same flag.
      const client = getSelectedClient();
      if (client === 'stremio-mobile' || client === 'nuvio') {
        config.mobileMode = 'on';
      }
      return config;
    }

    function getManifestUrl() {
      const config = getConfig();
      const encoded = encodeURIComponent(JSON.stringify(config));
      return '${baseUrl}/' + encoded + '/manifest.json';
    }

    function updateUi() {
      const client = getSelectedClient();
      const url = getManifestUrl();
      const installBtn = document.getElementById('installBtn');
      const nuvioSteps = document.getElementById('nuvioSteps');
      const copyLabel = document.getElementById('copyLabel');
      const copyInput = document.getElementById('copyInput');

      copyInput.value = url;

      if (client === 'nuvio') {
        installBtn.hidden = true;
        nuvioSteps.hidden = false;
        copyLabel.textContent = 'Manifest URL:';
      } else {
        installBtn.hidden = false;
        nuvioSteps.hidden = true;
        installBtn.href = url.replace(/^https?/, 'stremio');
        copyLabel.textContent = client === 'stremio-mobile'
          ? 'Or paste this link into Stremio\\'s search bar:'
          : 'Can\\'t open Stremio? Copy this link and paste it in Stremio\\'s search bar:';
      }
    }

    function copyLink() {
      const input = document.getElementById('copyInput');
      const btn = document.getElementById('copyBtn');
      if (!input.value) return;

      navigator.clipboard.writeText(input.value).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      });
    }

    // Pre-fill from URL config segment (when opened via the gear icon). A
    // legacy mobileMode=on flag means the user installed via the old "Mobile
    // mode" checkbox path — default the picker to Stremio Mobile so they keep
    // getting the combined-filter manifest on re-install.
    function prefillFromUrl() {
      try {
        const parts = window.location.pathname.split('/');
        for (const part of parts) {
          const decoded = decodeURIComponent(part);
          if (decoded.startsWith('{') && decoded.endsWith('}')) {
            const config = JSON.parse(decoded);
            document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
              const v = config[cb.name];
              if (v === 'on' || v === 'true' || v === true) cb.checked = true;
            });
            if (config.mobileMode === 'on' || config.mobileMode === 'true' || config.mobileMode === true) {
              const mobile = document.querySelector('input[name="client"][value="stremio-mobile"]');
              if (mobile) mobile.checked = true;
            }
            return;
          }
        }
      } catch (e) {}
    }

    prefillFromUrl();

    document.querySelectorAll('input[type="checkbox"], input[name="client"]').forEach(el => {
      el.addEventListener('change', updateUi);
    });

    updateUi();
  </script>
</body>
</html>`;
};
