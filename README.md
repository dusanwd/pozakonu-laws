# pozakonu-laws

Repo za generator gotovih HTML stranica za laws sajt.

Sadržaj repoa:

- `laws-json/`: JSON fajl za svaki zakon
- `laws-manifest.json`: manifest svih zakona i članova
- `scripts/build-pages.mjs`: generator statičkih HTML stranica
- `public/`: shared asseti

## Cilj

Ovaj repo koristi već izvezene podatke iz `laws-json/` i pravi:

- landing HTML stranicu sa pretragom zakona
- HTML stranicu svakog zakona
- HTML stranicu svakog pojedinačnog člana

Vizuelni stil prati `pozakonu-site`, ali bez Next runtime sloja.

## Struktura podataka

Svaki zakon postoji kao poseban JSON fajl u `laws-json/`.

`laws-manifest.json` sadrži:

- `slug`
- `fileName`
- `title`
- `backendLawSlug`
- `articleNos`
- `articleCount`

## Generisanje stranica

Pokretanje generatora:

```bash
npm run build-pages
```

Upis direktno u `pozakonu-site/public/zakoni`:

```bash
npm run build-pages:site
```

Script:

- čita `laws-manifest.json`
- prolazi kroz sve fajlove u `laws-json/`
- pravi `dist-pages/index.html`
- pravi `dist-pages/<slug>/index.html` za svaki zakon
- pravi `dist-pages/<slug>/clan-<articleNo>.html` za svaki član
- generiše shared `assets/`, `robots.txt` i `sitemap.xml`

Podrazumevani output ide u `dist-pages/`.

Ako koristiš `npm run build-pages:site`, generator čisti i puni:

- `../pozakonu-site/public/zakoni/`

## Napomene

- Izvor tekstova zakona je informativan i nije zvanični pravni izvor.
- Repo trenutno koristi lokalne JSON fajlove kao source of truth.
- SEO metadata, `robots` i `sitemap` su uključeni u app.
