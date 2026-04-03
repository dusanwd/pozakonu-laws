import fs from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const MANIFEST_PATH = path.join(ROOT_DIR, "laws-manifest.json");
const LAWS_DIR = path.join(ROOT_DIR, "laws-json");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const outputArg = process.argv[2];
const OUTPUT_DIR = outputArg
  ? path.resolve(ROOT_DIR, outputArg)
  : path.join(ROOT_DIR, "dist-pages");
const OUTPUT_ASSETS_DIR = path.join(OUTPUT_DIR, "assets");
const SITE_URL = process.env.LAWS_SITE_URL ?? "https://www.pozakonu.rs/zakoni";
const SITEMAP_CHUNK_SIZE = 10000;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsonForScript(value) {
  return JSON.stringify(value).replace(/<\/script/gi, "<\\/script");
}

function normalizeArticleNo(value) {
  const raw = value.trim().toLowerCase().replace(/[–—]/g, "-");
  const match = raw.match(/^0*([0-9]+)(-[0-9]+)?([a-zčćšđž])?$/iu);
  if (!match) return raw;
  const main = String(Number(match[1]));
  const dash = match[2] ?? "";
  const suffix = (match[3] ?? "").toLowerCase();
  return `${main}${dash}${suffix}`;
}

function compareArticleNos(left, right) {
  const a = normalizeArticleNo(left ?? "");
  const b = normalizeArticleNo(right ?? "");
  return a.localeCompare(b, "sr", { numeric: true });
}

function stripLikelyTrailingHeadings(content) {
  const lines = content.trimEnd().split("\n");
  let removedAny = false;

  while (true) {
    let idx = lines.length - 1;
    while (idx >= 0 && !lines[idx].trim()) idx -= 1;
    if (idx < 0) break;
    if (!isLikelySectionHeading(lines[idx])) break;
    lines.splice(idx, 1);
    removedAny = true;
  }

  if (!removedAny) return content;
  return lines.join("\n").trimEnd();
}

function isLikelySectionHeading(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length < 3 || trimmed.length > 120) return false;
  if (/[.:;!?]$/.test(trimmed)) return false;
  if (/^\d/.test(trimmed) || /^\(\d+\)/.test(trimmed)) return false;
  if (/^član\s+\d+/i.test(trimmed)) return false;
  if (/^[IVXLCDM]+\.\s+.+$/i.test(trimmed)) return true;

  const lettersOnly = trimmed.replace(/[^A-Za-zČĆŽŠĐčćžšđ]/g, "");
  if (!lettersOnly) return false;
  const upperOnly = lettersOnly.replace(/[^A-ZČĆŽŠĐ]/g, "");
  if (upperOnly.length / lettersOnly.length >= 0.7) return true;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 8) {
    const titleCaseWords = words.filter((word) =>
      /^[A-ZČĆŽŠĐ][a-zčćžšđ-]*$/u.test(word),
    );
    if (titleCaseWords.length === words.length) return true;
  }

  return false;
}

function buildCanonicalUrl(pathname = "") {
  const normalizedPath = pathname ? `/${pathname.replace(/^\/+/, "")}` : "";
  return `${SITE_URL}${normalizedPath}`;
}

function pageShell({
  title,
  description,
  canonicalPath = "",
  assetPrefix,
  bodyClass = "",
  mainContent,
  extraHead = "",
  extraScriptSrc = "",
}) {
  const canonicalUrl = buildCanonicalUrl(canonicalPath);
  return `<!doctype html>
<html lang="sr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="stylesheet" href="/zakoni/assets/styles.css" />
  ${extraHead}
</head>
<body class="${bodyClass}">
  <div class="site-shell">
    <header class="site-header">
      <div class="container header-inner">
        <a href="${assetPrefix}" class="brand" aria-label="Po Zakonu">
          <img src="/logo.svg" alt="Po Zakonu" width="160" height="40" />
        </a>
        <nav class="site-nav">
          <a href="https://www.pozakonu.rs/blog">Blog</a>
          <a href="${assetPrefix}">Zakoni</a>
          <a href="https://www.pozakonu.rs/ugovori">Ugovori</a>
          <a href="https://www.pozakonu.rs/zasto-po-zakonu">Zašto Po Zakonu</a>
          <a href="https://www.pozakonu.rs/cene">Cene</a>
          <a href="https://www.pozakonu.rs/kako-radi">Kako radi</a>
        </nav>
        <div class="header-actions">
          <a href="https://app.pozakonu.rs/prijava" class="ghost-link">Prijava</a>
          <a href="https://app.pozakonu.rs/registracija" class="cta cta-dark">Isprobaj Po Zakonu</a>
        </div>
      </div>
    </header>
    <main class="container page-main">
      ${mainContent}
    </main>
    <footer class="site-footer">
      <div class="container footer-note">
        <p><strong>Važna napomena:</strong> Po Zakonu nije advokatska kancelarija i ne pruža pravne savete. Sav sadržaj je isključivo informativnog karaktera i ne predstavlja zamenu za konsultaciju sa licenciranim advokatom. Pre donošenja pravnih odluka obratite se kvalifikovanom pravnom stručnjaku.</p>
      </div>
      <div class="container footer-meta">
        <p>© ${new Date().getFullYear()} Po Zakonu. Sva prava zadržana.</p>
        <div class="footer-links">
          <a href="https://www.pozakonu.rs/kontakt">Kontakt</a>
          <a href="https://www.pozakonu.rs/uslovi">Uslovi</a>
          <a href="https://www.pozakonu.rs/privatnost">Privatnost</a>
        </div>
      </div>
    </footer>
  </div>
  ${extraScriptSrc ? `<script src="/zakoni/assets/${extraScriptSrc}" defer></script>` : ""}
</body>
</html>`;
}

function renderIndexPage(laws) {
  const lawsJson = escapeJsonForScript(
    laws.map((law) => ({
      slug: law.slug,
      title: law.title,
      articleCount: law.articleCount,
    })),
  );

  const lawItems = laws
    .slice(0, 250)
    .map(
      (law) => `<li class="law-item" data-law-item>
  <a href="zakoni/${escapeHtml(`${law.slug}/`)}" class="law-card">
    <span class="law-card-title">${escapeHtml(law.title)}</span>
    <span class="law-card-meta">${law.articleCount} članova</span>
  </a>
</li>`,
    )
    .join("\n");

  return pageShell({
    title: "Zakoni Republike Srbije | Pozakonu.rs",
    description:
      "Pretražite zakone Republike Srbije po nazivu. Otvorite gotove statičke HTML stranice za svaki zakon i član.",
    assetPrefix: "",
    mainContent: `
      <section class="hero hero-dark">
        <h1>Zakoni Republike Srbije</h1>
        <p>Pretražite zakone po nazivu i pristupite pojedinačnim članovima sa objašnjenjima.</p>
      </section>

      <section class="panel">
        <div class="search-block">
          <label for="laws-search" class="label">Pretraga zakona</label>
          <input id="laws-search" type="search" placeholder="Unesite naziv zakona ili slug" class="search-input" data-laws-search />
          <p class="muted" data-laws-count>Prikazano: ${laws.length} / ${laws.length}</p>
        </div>
        <ul class="law-list" data-laws-list>
          ${lawItems}
        </ul>
      </section>

      <section class="cta-panel">
        <h2>Imaš pitanje o nekom zakonu?</h2>
        <p>Postavi pitanje i dobij objašnjenje uz citat konkretnog člana na razumljivom jeziku.</p>
        <a href="https://app.pozakonu.rs/registracija" class="cta cta-light">Započni besplatno</a>
      </section>

      <script type="application/json" id="laws-data">${lawsJson}</script>
    `,
    extraScriptSrc: "laws-index.js",
  });
}

function renderLawPage(law, articles) {
  const articleCards = articles
    .map(
      (article) => `<article class="article-card" data-article-item>
  <div class="article-card-header">
    <div>
      <h3>${escapeHtml(article.article)}</h3>
      ${
        article.section
          ? `<p class="section-label">${escapeHtml(article.section)}</p>`
          : ""
      }
    </div>
    <a href="${escapeHtml(`${law.slug}/`)}/${escapeHtml(`clan-${article.articleNo}.html`)}" class="article-link">Otvori član</a>
  </div>
  <p class="article-text">${escapeHtml(article.content)}</p>
</article>`,
    )
    .join("\n");

  const articlesJson = escapeJsonForScript(articles);

  return pageShell({
    title: `${law.law} | Pozakonu.rs`,
    description: `Pročitajte ${law.law} na Pozakonu.rs. Dostupno članova: ${articles.length}.`,
    canonicalPath: law.slug,
    assetPrefix: "../",
    mainContent: `
      <section class="notice">
        <p><strong>Izvor teksta:</strong> Službeni glasnik Republike Srbije</p>
        <p class="notice-sub">Ovaj tekst služi informativnim svrhama i nije zvanični izvor.</p>
      </section>

      <section class="hero hero-dark compact">
        <h1>${escapeHtml(law.law)}</h1>
        <p>Dobijte personalizovano tumačenje — besplatno.</p>
        <a href="https://app.pozakonu.rs/registracija" class="cta cta-light">Postavi pitanje</a>
      </section>

      <section class="panel">
        <div class="search-block">
          <label for="articles-search" class="label">Pretraga zakona po tekstu</label>
          <input id="articles-search" type="search" placeholder="Unesi pojam, broj člana ili deo teksta..." class="search-input" data-articles-search />
          <p class="muted" data-articles-count>Prikazano članova: ${articles.length}</p>
        </div>
        <div class="article-list" data-articles-list>
          ${articleCards}
        </div>
      </section>

      <section class="cta-panel">
        <h2>Treba ti tumačenje ovog zakona?</h2>
        <p>Po Zakonu pomaže da brzo dođeš do objašnjenja konkretnog člana i praktičnog značenja propisa.</p>
        <a href="https://app.pozakonu.rs/registracija" class="cta cta-light">Isprobaj Po Zakonu</a>
      </section>

      <script type="application/json" id="articles-data">${articlesJson}</script>
    `,
    extraScriptSrc: "law-page.js",
  });
}

function renderArticlePage({ law, article, prevArticle, nextArticle }) {
  const navHtml =
    prevArticle || nextArticle
      ? `<nav class="article-nav" aria-label="Navigacija članova">
  ${prevArticle ? `<a href="clan-${escapeHtml(prevArticle.articleNo)}.html">← Član ${escapeHtml(prevArticle.articleNo)}</a>` : "<span></span>"}
  ${nextArticle ? `<a href="clan-${escapeHtml(nextArticle.articleNo)}.html">Član ${escapeHtml(nextArticle.articleNo)} →</a>` : "<span></span>"}
</nav>`
      : "";

  return pageShell({
    title: `${article.article} – ${law.law} | Pozakonu.rs`,
    description: `Pročitajte ${article.article.toLowerCase()} zakona ${law.law} na Pozakonu.rs.`,
    canonicalPath: `${law.slug}/clan-${article.articleNo}`,
    assetPrefix: "../",
    mainContent: `
      <section class="notice">
        <p><strong>Izvor teksta:</strong> Službeni glasnik Republike Srbije</p>
        <p class="notice-sub">Ovaj tekst služi informativnim svrhama i nije zvanični izvor.</p>
      </section>

      <section class="panel article-panel">
        <div>
          <p class="breadcrumbs"><a href="../">Nazad na pregled zakona</a> / <a href="./">${escapeHtml(law.law)}</a></p>
          <h1>${escapeHtml(article.article)}</h1>
          ${article.section ? `<p class="section-label">${escapeHtml(article.section)}</p>` : ""}
        </div>
        <p class="article-full-text">${escapeHtml(article.content)}</p>
        ${navHtml}
      </section>

      <section class="cta-panel">
        <h2>Želite detaljnije objašnjenje ovog člana?</h2>
        <p>Dobijte personalizovano tumačenje konkretnog člana i njegov praktični značaj.</p>
        <a href="https://app.pozakonu.rs/registracija" class="cta cta-light">Postavi pitanje</a>
      </section>
    `,
  });
}

async function copyPublicAsset(fileName, outputName = fileName) {
  const source = path.join(PUBLIC_DIR, fileName);
  const target = path.join(OUTPUT_ASSETS_DIR, outputName);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function writeOutputFile(relativePath, contents) {
  const filePath = path.join(OUTPUT_DIR, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, "utf8");
}

async function writeSharedAssets() {
  const styles = `@font-face {
  font-family: "Nunito";
  src: url("/zakoni/assets/fonts/Nunito-Regular.ttf") format("truetype");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: "Nunito";
  src: url("/zakoni/assets/fonts/Nunito-Bold.ttf") format("truetype");
  font-style: normal;
  font-weight: 700;
  font-display: swap;
}

@font-face {
  font-family: "Nunito";
  src: url("/zakoni/assets/fonts/Nunito-ExtraBold.ttf") format("truetype");
  font-style: normal;
  font-weight: 800;
  font-display: swap;
}

:root {
  --bg: #f8fafc;
  --surface: rgba(255,255,255,0.86);
  --surface-solid: #ffffff;
  --text: #0f172a;
  --muted: #64748b;
  --border: rgba(226,232,240,0.9);
  --dark-blue: #254568;
  --dark-blue-200: #1b2a4b;
  --amber-bg: #fffbeb;
  --amber-border: #fde68a;
  --amber-text: #92400e;
  --shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
  --radius-xl: 24px;
  --radius-lg: 18px;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  color: var(--text);
  font-family: "Nunito", "Segoe UI", system-ui, sans-serif;
  background: var(--bg) url("./background.jpeg") center/cover fixed no-repeat;
}
a { color: inherit; text-decoration: none; }
code {
  background: rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 0.15rem 0.35rem;
  font-size: 0.95em;
}
input::placeholder,
textarea::placeholder {
  color: #94a3b8;
  opacity: 1;
}
.site-shell { min-height: 100vh; display: flex; flex-direction: column; }
.container { width: min(1152px, calc(100% - 48px)); margin: 0 auto; }
.site-header,
.site-footer {
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(12px);
}
.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid rgba(255,255,255,0.6);
}
.header-inner,
.footer-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.header-inner {
  padding: 16px 0;
  min-height: 72px;
}
.brand {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}
.brand img {
  display: block;
  width: 160px;
  height: 40px;
}
.site-nav,
.header-actions,
.footer-links { display: flex; align-items: center; gap: 12px; }
.site-nav {
  flex: 1 1 auto;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.875rem;
}
.header-actions {
  flex: 0 0 auto;
  gap: 16px;
}
.site-nav a,
.ghost-link,
.footer-links a {
  padding: 8px 12px;
  color: #475569;
  font-size: 0.875rem;
  font-weight: 700;
  transition: 0.2s ease;
}
.site-nav a:hover,
.ghost-link:hover,
.footer-links a:hover {
  color: var(--text);
  transform: scale(1.05);
}
.ghost-link {
  line-height: 1.2;
}
.header-actions .cta {
  padding: 8px 20px;
  font-size: 0.875rem;
  line-height: 1.2;
}
.page-main {
  flex: 1;
  padding-top: 80px;
  padding-bottom: 96px;
}
.hero,
.panel,
.cta-panel,
.notice {
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow);
}
.hero,
.cta-panel {
  padding: 32px;
  color: white;
}
.hero-dark { background: var(--dark-blue); }
.hero.compact { text-align: center; }
.hero h1,
.cta-panel h2,
.panel h1 {
  margin: 0;
  line-height: 1.15;
}
.hero h1 { font-size: 1.875rem }
.hero p,
.cta-panel p {
  margin: 16px 0 0;
  color: #cbd5e1;
  line-height: 1.65;
  font-size: 0.875rem;
}
.panel {
  margin-top: 24px;
  padding: 24px;
  background: var(--surface);
  border: 1px solid rgba(255,255,255,0.72);
}
.notice {
  font-size: 0.875rem;
  padding: 14px 16px;
  background: var(--amber-bg);
  border: 1px solid var(--amber-border);
  color: var(--amber-text);
  margin-bottom: 24px;
}
.notice p { margin: 0; }
.notice-sub { margin-top: 6px !important; }
.cta-panel {
  background: var(--dark-blue-200);
  text-align: center;
  margin-top: 24px;
}
.cta {
  display: inline-block;
  margin-top: 24px;
  border-radius: 999px;
  padding: 12px 22px;
  font-size: 0.95rem;
  font-weight: 500;
  transition: 0.2s ease;
  cursor: pointer;
}
.cta-dark {
  background: #314158;
  color: white;
  margin-top: 0;
}
.cta-dark:hover {
  background: rgba(255,255,255,0.7);
  color: var(--text);
}
.cta-light {
  background: rgba(255,255,255,0.9);
  color: var(--text);
}
.cta-light:hover {
  background: #314158;
  color: white;
}
.search-block { margin-bottom: 16px; }
.label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  color: #334155;
}
.search-input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  background: white;
  color: var(--text);
  padding: 14px 16px;
  font-size: 0.95rem;
  outline: none;
}
.search-input:focus {
  border-color: #94a3b8;
  box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.18);
  
}
.muted {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 0.82rem;
}
.law-list,
.article-list {
  display: grid;
  gap: 12px;
}
.law-list { list-style: none; padding: 0; margin: 0; }
.law-card,
.article-card {
  display: block;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--surface-solid);
  transition: 0.2s ease;
}
.law-card {
  padding: 16px;
}
.law-card:hover,
.article-card:hover {
  border-color: #fecaca;
}
.law-card-title {
  display: block;
  font-size: 0.98rem;
  font-weight: 500;
}
.law-card-meta {
  display: block;
  margin-top: 6px;
  font-size: 0.8rem;
  color: var(--muted);
}
.article-card { padding: 18px; }
.article-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.article-card h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}
.article-link {
  white-space: nowrap;
  font-size: 0.82rem;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
  color: #334155;
  cursor: pointer;
}
.article-link:hover {
  color: #94A3B8;
}
.article-text,
.article-full-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.72;
  color: #334155;
}
.article-text { margin: 12px 0 0; font-size: 0.92rem; }
.article-full-text { margin: 16px 0 0; font-size: 0.9rem; color: #64748B; }
.section-label {
  margin: 10px 0 0;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.article-panel h1 {
  margin-top: 25px;
  font-size: 1.875rem;
  font-weight: 500;
}
.article-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--border);
  margin-top: 20px;
  padding-top: 20px;
  font-size: 0.9rem;
  font-weight: 500;
}
.article-nav a {
  cursor: pointer;
}
.article-nav a:hover,
.breadcrumbs a:hover { text-decoration: underline; color: #475569; }
.breadcrumbs {
  margin: 0;
  font-size: 0.88rem;
  color: var(--muted);
  cursor: pointer;
}
.footer-note {
  padding: 18px 0;
  border-bottom: 1px solid rgba(203, 213, 225, 0.5);
}
.footer-note p {
  margin: 0;
  text-align: center;
  font-size: 0.78rem;
  line-height: 1.65;
  color: var(--muted);
}
.footer-meta {
  padding: 28px 0 40px;
  color: var(--muted);
  font-size: 0.9rem;
}
.empty-state {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: #f8fafc;
  padding: 16px;
  color: var(--muted);
}
@media (max-width: 900px) {
  .site-nav { display: none; }
}
@media (max-width: 720px) {
  .container { width: min(100% - 28px, 1120px); }
  .header-inner,
  .footer-meta,
  .article-card-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .header-actions {
    width: 100%;
    justify-content: space-between;
  }
  .hero, .panel, .cta-panel { padding: 20px; }
}
`;

  const lawsIndexScript = `(() => {
  const dataEl = document.getElementById("laws-data");
  const input = document.querySelector("[data-laws-search]");
  const count = document.querySelector("[data-laws-count]");
  const list = document.querySelector("[data-laws-list]");
  if (!dataEl || !input || !count || !list) return;

  const parseData = () => {
    const raw = dataEl.textContent || "[]";

    try {
      return JSON.parse(raw);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = raw;
      return JSON.parse(textarea.value || "[]");
    }
  };

  const laws = parseData();
  const normalize = (value) => value.trim().toLocaleLowerCase("sr");

  const render = (items) => {
    list.innerHTML = items.length
      ? items.map((law) => \`<li class="law-item"><a href="zakoni/\${law.slug}/" class="law-card"><span class="law-card-title">\${law.title}</span><span class="law-card-meta">\${law.articleCount} članova</span></a></li>\`).join("")
      : '<li class="empty-state">Nema rezultata za unetu pretragu.</li>';
    count.textContent = \`Prikazano: \${items.length} / \${laws.length}\`;
  };

  input.addEventListener("input", () => {
    const query = normalize(input.value);
    const items = !query
      ? laws
      : laws.filter((law) => normalize(\`\${law.title} \${law.slug}\`).includes(query));
    render(items);
  });
})();`;

  const lawPageScript = `(() => {
  const dataEl = document.getElementById("articles-data");
  const input = document.querySelector("[data-articles-search]");
  const count = document.querySelector("[data-articles-count]");
  const list = document.querySelector("[data-articles-list]");
  if (!dataEl || !input || !count || !list) return;

  const parseData = () => {
    const raw = dataEl.textContent || "[]";

    try {
      return JSON.parse(raw);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = raw;
      return JSON.parse(textarea.value || "[]");
    }
  };

  const articles = parseData();
  const normalize = (value) => value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();

  const render = (items) => {
    list.innerHTML = items.length
      ? items.map((item) => \`<article class="article-card"><div class="article-card-header"><div><h3>\${item.article}</h3>\${item.section ? \`<p class="section-label">\${item.section}</p>\` : ""}</div><a href="clan-\${item.articleNo}.html" class="article-link">Otvori član</a></div><p class="article-text">\${item.content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p></article>\`).join("")
      : '<div class="empty-state">Nema rezultata za uneti pojam.</div>';
    count.textContent = \`Prikazano članova: \${items.length}\${input.value.trim() ? " (filtrirano)" : ""}\`;
  };

  input.addEventListener("input", () => {
    const query = normalize(input.value.trim());
    const items = !query
      ? articles
      : articles.filter((item) =>
          normalize(\`\${item.article} \${item.articleNo} \${item.section || ""} \${item.content}\`).includes(query),
        );
    render(items);
  });
})();`;

  await fs.mkdir(OUTPUT_ASSETS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(OUTPUT_ASSETS_DIR, "styles.css"),
    styles,
    "utf8",
  );
  await fs.writeFile(
    path.join(OUTPUT_ASSETS_DIR, "laws-index.js"),
    lawsIndexScript,
    "utf8",
  );
  await fs.writeFile(
    path.join(OUTPUT_ASSETS_DIR, "law-page.js"),
    lawPageScript,
    "utf8",
  );
}

function buildUrlSetSitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join("\n")}
</urlset>
`;
}

function buildSitemapIndexXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <sitemap><loc>${escapeHtml(url)}</loc></sitemap>`).join("\n")}
</sitemapindex>
`;
}

async function writeSitemap(urls) {
  const sitemapIndexUrls = [];
  let chunkNumber = 0;

  for (let index = 0; index < urls.length; index += SITEMAP_CHUNK_SIZE) {
    chunkNumber += 1;
    const chunk = urls.slice(index, index + SITEMAP_CHUNK_SIZE);
    const fileName = `sitemap-${chunkNumber}.xml`;

    await writeOutputFile(fileName, buildUrlSetSitemapXml(chunk));
    sitemapIndexUrls.push(buildCanonicalUrl(fileName));
  }

  await writeOutputFile("sitemap.xml", buildSitemapIndexXml(sitemapIndexUrls));
}

async function writeRobots() {
  const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
  await writeOutputFile("robots.txt", robots);
}

async function main() {
  const startedAt = Date.now();
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  const laws = manifest.laws;
  const sitemapUrls = [SITE_URL];
  let htmlCount = 0;

  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await writeSharedAssets();
  await copyPublicAsset("background.jpeg");
  await copyPublicAsset("logo.svg");
  await copyPublicAsset("logo-white.svg");
  await copyPublicAsset("fonts/Nunito-Regular.ttf", "fonts/Nunito-Regular.ttf");
  await copyPublicAsset("fonts/Nunito-Bold.ttf", "fonts/Nunito-Bold.ttf");
  await copyPublicAsset(
    "fonts/Nunito-ExtraBold.ttf",
    "fonts/Nunito-ExtraBold.ttf",
  );

  await writeOutputFile("index.html", renderIndexPage(laws));
  htmlCount += 1;

  for (const lawEntry of laws) {
    const filePath = path.join(LAWS_DIR, lawEntry.fileName);
    const law = JSON.parse(await fs.readFile(filePath, "utf8"));
    const articles = [...law.articles]
      .filter((article) => Boolean(article.articleNo))
      .sort((a, b) => compareArticleNos(a.articleNo, b.articleNo))
      .map((article) => ({
        article: article.article,
        articleNo: article.articleNo ?? article.article,
        section: article.section,
        content: stripLikelyTrailingHeadings(article.content),
      }))
      .filter((article) => article.content.trim().length > 0);

    law.slug = lawEntry.slug;

    await writeOutputFile(
      `${lawEntry.slug}/index.html`,
      renderLawPage(law, articles),
    );
    htmlCount += 1;
    sitemapUrls.push(buildCanonicalUrl(lawEntry.slug));

    for (let index = 0; index < articles.length; index += 1) {
      const article = articles[index];
      const prevArticle = index > 0 ? articles[index - 1] : null;
      const nextArticle =
        index < articles.length - 1 ? articles[index + 1] : null;
      const relativePath = `${lawEntry.slug}/clan-${article.articleNo}.html`;

      await writeOutputFile(
        relativePath,
        renderArticlePage({
          law,
          article,
          prevArticle,
          nextArticle,
        }),
      );

      htmlCount += 1;
      sitemapUrls.push(
        buildCanonicalUrl(`${lawEntry.slug}/clan-${article.articleNo}`),
      );
    }
  }

  await writeSitemap(sitemapUrls);
  await writeRobots();

  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `Generated ${htmlCount.toLocaleString("sr")} HTML pages in ${OUTPUT_DIR} for ${laws.length} laws in ${durationSeconds}s.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
