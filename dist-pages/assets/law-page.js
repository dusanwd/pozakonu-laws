(() => {
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
  const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const render = (items) => {
    list.innerHTML = items.length
      ? items.map((item) => `<article class="article-card"><div class="article-card-header"><div><h3>${item.article}</h3>${item.section ? `<p class="section-label">${item.section}</p>` : ""}</div><a href="clan-${item.articleNo}.html" class="article-link">Otvori član</a></div><p class="article-text">${item.content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p></article>`).join("")
      : '<div class="empty-state">Nema rezultata za uneti pojam.</div>';
    count.textContent = `Prikazano članova: ${items.length}${input.value.trim() ? " (filtrirano)" : ""}`;
  };

  input.addEventListener("input", () => {
    const query = normalize(input.value.trim());
    const items = !query
      ? articles
      : articles.filter((item) =>
          normalize(`${item.article} ${item.articleNo} ${item.section || ""} ${item.content}`).includes(query),
        );
    render(items);
  });
})();