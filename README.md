# TBA3

Drei Dashboards zur Auswertung von VERA-Daten (Englisch 8, Mathe 3, Schulleitung) als Vanilla-JS-ES-Module, gebaut und ausgeliefert mit Vite.

Öffentliche Demo: <https://zepf-rptu.github.io/TBA3/> (Dashboards) und <https://zepf-rptu.github.io/TBA3/docs/> (Wiki). Die Demo zeigt ausschließlich die mitgelieferten Beispieldatensätze.

```powershell
npm install
npm run dev          # Entwicklungsserver auf http://localhost:5501/
npm run build        # Produktions-Build (Dashboards und Wiki) nach dist/
npm run preview      # dist/ auf http://localhost:8765/ ausliefern
```

Das Repository ist in sich geschlossen: Build, Prüfungen, End-to-End-Tests und `docker compose up` brauchen nichts außerhalb dieses Verzeichnisses.


## Datensätze

Die Demo-Datensätze (`Lerngruppe 8a`–`8c`, `Lerngruppe 3a`–`3c`, `Beispielschule` und `Beispielschule mit mehreren Testheften`) liegen als JSON unter `public/data/`.

Weitere Lerngruppen und Schulen können zur Laufzeit von einer API geholt werden, die der Dev- und der Preview-Server unter `/api/` an `TBA3_API` durchreichen (Standard `http://127.0.0.1:8000`, z. B. `$env:TBA3_API='https://api.example.org'; npm run dev`); ohne sie fehlt nichts an den Dashboards. `?scope=` und `?api=` brauchen eine laufende API und funktionieren deshalb nicht in der öffentlichen Demo. Ein Datensatz wird über die URL gewählt:

- `?scope=groups/<id>` (Englisch, Mathe) bzw. `?scope=schools/<id>` (Schulleitung) öffnet einen beliebigen Scope, den der Server auflösen kann. Ohne laufenden Server erscheint eine Fehlermeldung statt eines leeren Dashboards.
- `?api=http://127.0.0.1:9000/` wählt eine andere API-Adresse (nur derselbe Origin oder localhost).
- Die Demo-Datensätze haben selbst Scopes (`?scope=groups/8b_good`, `?scope=schools/sl`) und werden aus ihren Ordnern unter `public/data/` geladen; jeder andere Scope geht an die API.

## Entwicklung

Der Strukturcheck braucht Node.js (Version in `.nvmrc`; `npm install` erzwingt sie über `.npmrc`) und die mit `npm install` installierten Abhängigkeiten, weil er die Workspace-Pakete und die Glossar-Barrels importiert:

```powershell
node tools/check-structure.mjs
```

Die volle Prüfung vor einem Review:

```powershell
npm run check        # alle Prüfungen parallel (Skript "check" in package.json)
npm run lint         # oxlint (JS) + eslint (CSS)
npm run fmt          # oxfmt (JS, CSS, JSON)
npm test             # vitest: Node-Projekt + Browser-Projekt (echtes Chrome)
npm run typecheck
npm run docs:dev     # Wiki (VitePress) über die Modul-Docs neben den Quellen und docs/; docs:build schreibt dist/docs/
npm run test:e2e     # Playwright Test gegen den gebauten Preview-Server; braucht nur Chrome
npm run test:e2e:export  # optional: jedes Exportformat jeder Karte (dauert Minuten; nicht im Pre-Push-Hook)
```

Die Strukturregeln sind Lint-Regeln (`config/oxlintPlugin.mjs` für JS, `config/eslint.config.mjs` für CSS) und, wo eine Regel mehrere Dateien betrifft, in [tools/check-structure.mjs](tools/check-structure.mjs); die Importgrenzen zwischen Apps, `common/` und den Paketen prüft dependency-cruiser ([config/dependency-cruiser.mjs](config/dependency-cruiser.mjs)); der architektonische Hintergrund steht in [docs/architecture.md](docs/architecture.md). Jede Modul-Unit dokumentiert sich in einer `<unitFile>.md` neben ihrer Quelle; [docs/module-index.md](docs/module-index.md) listet sie alle mit der Klasse, von der sie erbt (generiert von `node tools/docs-sidebar.mjs`), [docs/endpoint-fields.md](docs/endpoint-fields.md) gruppiert ihre `## Daten`-Tabellen je Endpunkt (generiert von `node tools/docs-endpoint-fields.mjs`).

`npm install` richtet über das `prepare`-Skript den Pre-Push-Hook aus `tools/hooks` ein, der `npm run check` ausführt, vor einem Push von `main` zusätzlich `npm run test:e2e`. Auf GitHub laufen dieselbe Prüfung und die E2E-Suite als Actions (`.github/workflows/ci.yml`), auch für Pull Requests; unabhängig davon baut derselbe Workflow bei jedem Push auf `main` Dashboards und Wiki für GitHub Pages (`TBA3_BASE` setzt den Unterpfad, siehe `vite.config.js`), denn was dort ankommt, hat den Pre-Push-Hook schon bestanden.

## Auslieferung

`docker compose up --build` baut das Image und startet nginx mit den gebauten Dashboards und ihren Demo-Datensätzen auf http://127.0.0.1:8080/, das Wiki unter http://127.0.0.1:8080/docs/. `/api/` ist vorbereitet, aber ohne einen Container namens `api` antwortet es mit 502. Läuft der Stack, prüft `npm run test:docker` das Image: Routen, Header, vorkomprimierte Dateien und dass die Dashboards unter der Header-CSP starten (`tests/e2e-docker/`).

## Mitarbeit

**Entwickelnde Lehrkräfte und Schulleitungen**

MA – Mathe 3:

- Elena Gabriel, Grundschule Maxdorf, Rheinland-Pfalz
- Katrin Lesoine, Grundschule Maxdorf, Rheinland-Pfalz
- Ulrike Völkert, Pädagogisches Landesinstitut, Rheinland-Pfalz
- Karin Weinacht, GS Goetheschule-Nord, Rheinland-Pfalz

EN – Englisch 8:

- Svenja Damnitz, IGS Betzdorf-Kirchen, Rheinland-Pfalz
- Veronika Walther, Friedrich-Adolf-Richter-Schule, Thüringen
- Claudia Zohn, Caroline-Neuber-Schule, Sachsen

SL – Schulleitung:

- Maxi Heß, Universitätsschule Dresden, Sachsen
- Jessica Knop, Grundschule Surendorf, Schleswig-Holstein

**Programmierung & Design (zepf / RPTU)**

M. Sc. Kai Mannweiler, <mannweil@rptu.de>

**Entwicklung & Projektkoordination (zepf / RPTU)**

M. Sc. Michael Poller, <m.poller@rptu.de>

**Projektverantwortung (zepf / RPTU)**

- Prof. Dr. Ingmar Hosenfeld, <i.hosenfeld@rptu.de>
- Dr. Michael Zimmer-Müller, <michael.zimmermueller@rptu.de>

## Lizenz

Der Quellcode steht unter der MIT-Lizenz, siehe die Datei `LICENSE` im Repository. Davon ausgenommen sind:

- das Hintergrundbild der Startseiten `src/styles/welcome-splash-background.{avif,webp,jpg}` (Freepik-Lizenz, siehe [Bildmaterial](#bildmaterial));
- die in einen Build gebündelten Fremdkomponenten (d3, Tabulator, Quill, jsPDF, Material Symbols, Inter u. a.), die unter ihren eigenen Lizenzen bleiben — die Hinweise dazu stehen in der Datei `NOTICE`, die mit jedem Build nach `dist/` kopiert wird.

## Bildmaterial

Der Hintergrund der Startseiten (`src/styles/welcome-splash-background.{avif,webp,jpg}`) stammt von
Freepik und steht unter der freien Freepik-Lizenz: Designed by
[vectorpocket / Freepik](https://www.freepik.com). Der Lizenztext liegt unverändert daneben
in [src/styles/welcome-splash-background.LICENSE.txt](src/styles/welcome-splash-background.LICENSE.txt).
Die Datei darf nicht unterlizenziert werden und ist von der Lizenz dieses Projekts
ausgenommen.
