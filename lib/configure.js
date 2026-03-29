module.exports = function configurePage(manifest, host) {
  const protocol = host && host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

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
    .field {
      margin-bottom: 16px;
    }
    .field label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #ccc;
      margin-bottom: 6px;
    }
    .field input[type="text"] {
      width: 100%;
      padding: 12px 14px;
      background: #141428;
      border: 1px solid #2a2a4a;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    .field input[type="text"]:focus {
      border-color: #5b4fcf;
    }
    .field input[type="text"]::placeholder {
      color: #555;
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
    .btn-secondary {
      background: #1e1e3a;
      color: #ccc;
      border: 1px solid #2a2a4a;
    }
    .btn-secondary:hover { background: #2a2a4a; }
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
    .divider {
      height: 1px;
      background: #1e1e3a;
      margin: 24px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${manifest.name}</h1>
    <p class="subtitle">${manifest.description}</p>

    <div class="section-label">Required</div>
    <div class="field">
      <label for="tmdbKey">TMDB API Key</label>
      <input type="text" id="tmdbKey" placeholder="Enter your TMDB API key (free at themoviedb.org)">
    </div>

    <div class="section-label">Exclude Sources</div>
    <div class="checkboxes">
      ${manifest.config
        .filter((c) => c.type === "checkbox")
        .map(
          (c) => `
        <label class="checkbox-item">
          <input type="checkbox" id="${c.key}" name="${c.key}">
          <span>${c.title.replace("Exclude ", "")}</span>
        </label>`
        )
        .join("")}
    </div>

    <div class="actions">
      <a id="installBtn" class="btn btn-primary" href="#">
        Install in Stremio
      </a>
      <div id="copySection" style="display:none">
        <p class="copy-label">Can't open Stremio? Copy this link and paste it in Stremio's search bar:</p>
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
    function getConfig() {
      const config = {};
      const tmdbKey = document.getElementById('tmdbKey').value.trim();
      if (tmdbKey) config.tmdbKey = tmdbKey;
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb.checked) config[cb.name] = 'on';
      });
      return config;
    }

    function getManifestUrl() {
      const config = getConfig();
      if (!config.tmdbKey) return null;
      const encoded = encodeURIComponent(JSON.stringify(config));
      return '${baseUrl}/' + encoded + '/manifest.json';
    }

    function updateLinks() {
      const url = getManifestUrl();
      const installBtn = document.getElementById('installBtn');
      const copyInput = document.getElementById('copyInput');
      const copySection = document.getElementById('copySection');

      if (url) {
        const stremioUrl = url.replace(/^https?/, 'stremio');
        installBtn.href = stremioUrl;
        copyInput.value = url;
        copySection.style.display = 'block';
      } else {
        installBtn.href = '#';
        copyInput.value = '';
        copySection.style.display = 'none';
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

    // Update links on any input change
    document.getElementById('tmdbKey').addEventListener('input', updateLinks);
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', updateLinks);
    });

    updateLinks();
  </script>
</body>
</html>`;
};
