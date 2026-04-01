(() => {
  const dataEl = document.getElementById("laws-data");
  const input = document.querySelector("[data-laws-search]");
  const count = document.querySelector("[data-laws-count]");
  const list = document.querySelector("[data-laws-list]");
  if (!dataEl || !input || !count || !list) return;

  const laws = JSON.parse(dataEl.textContent || "[]");
  const normalize = (value) => value.trim().toLocaleLowerCase("sr");

  const render = (items) => {
    list.innerHTML = items.length
      ? items.map((law) => `<li class="law-item"><a href="${law.slug}/" class="law-card"><span class="law-card-title">${law.title}</span><span class="law-card-meta">${law.articleCount} članova</span></a></li>`).join("")
      : '<li class="empty-state">Nema rezultata za unetu pretragu.</li>';
    count.textContent = `Prikazano: ${items.length} / ${laws.length}`;
  };

  input.addEventListener("input", () => {
    const query = normalize(input.value);
    const items = !query
      ? laws
      : laws.filter((law) => normalize(`${law.title} ${law.slug}`).includes(query));
    render(items);
  });
})();