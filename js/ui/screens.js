export function renderApp(root, view) {
  root.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div></div>
        <label>
          <span class="sr-only">${escapeHtml(view.messages.language_label)}</span>
          <select class="lang-select" id="languageSelect" aria-label="${escapeHtml(view.messages.language_label)}">
            ${view.languageOptions}
          </select>
        </label>
      </div>
      <main class="card">${view.screenHtml}</main>
    </div>
    ${view.showLogo ? `
      <a class="logo-link" href="https://www.rq-inn.com/" target="_blank" rel="noreferrer">
        <img src="./image/rq-inn-logo.png" alt="RQ-INN">
      </a>
    ` : ""}
  `;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
