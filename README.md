# TBA3

Drei Dashboards zur Auswertung von VERA-Daten (Englisch 8, Mathe 3, Schulleitung) als Vanilla-JS-ES-Module, gebaut und ausgeliefert mit Vite.

Öffentliche Demo: <https://zepf-rptu.github.io/TBA3/> (Dashboards) und <https://zepf-rptu.github.io/TBA3/docs/> (Wiki). Die Demo zeigt ausschließlich die mitgelieferten Beispieldatensätze.

```powershell
npm install
npm run dev          # Entwicklungsserver auf http://localhost:5501/
npm run build        # Produktions-Build nach dist/
npm run preview      # dist/ auf http://localhost:8765/ ausliefern
```

Das Repository ist in sich geschlossen: Build, Prüfungen, End-to-End-Tests und `docker compose up` brauchen nichts außerhalb dieses Verzeichnisses.

## WICHTIG
Dies ist eine Vorabveröffentlichung eines WIP-Projekts, insbesondere folgende Punkte sind noch in der Überarbeitung:
- Jegliche Docs (vor allem auf Modulebene)
- Wie Module API Daten verarbeiten
- Jegliche Texte
- Tablet-Kompatibilität
- Responsivität
- Design-Details
- Das Modul-Export-System
- Handling von verschiedenen Kompetenzskalentypen (insbesondere innerhalb einer Chart, wie bei SL)
- Allgemein Standardisierungen, Vereinheitlichungen und Simplifizierungen

Es ist durchaus mäglich, dass einige Features noch nicht zu 100% so funktionieren wie sie sollen.


## Datensätze

Die Demo-Datensätze (`Klasse 8a`–`8c`, `Klasse 3a`–`3c`, `Beispielschule`) liegen als JSON unter `public/data/` und sind die einzigen Einträge in den Datensatz-Auswahlen der Dashboards. Sie enthalten pseudonymisierte, maschinell erzeugte Namen; die Aufgaben-Ids, Aufgabentitel und Normierungsparameter stammen aus dem IQB-Aufgabenkatalog und sind für die Veröffentlichung freigegeben.

Weitere Klassen und Schulen können zur Laufzeit von einer API geholt werden, die der Dev- und der Preview-Server unter `/api/` an Port 8000 durchreichen; ohne sie fehlt nichts an den Dashboards. `?scope=` und `?api=` brauchen eine laufende API und funktionieren deshalb nicht in der öffentlichen Demo. Ein Datensatz wird über die URL gewählt:

- `?scope=groups/<id>` (Englisch, Mathe) bzw. `?scope=schools/<id>` (Schulleitung) öffnet einen beliebigen Scope, den der Server auflösen kann. Ohne laufenden Server erscheint eine Fehlermeldung statt eines leeren Dashboards.
- `?api=http://127.0.0.1:9000/` wählt eine andere API-Adresse (nur derselbe Origin oder localhost).
- Die Demo-Ordner lassen sich auch über die API-Schnittstelle laden — `?scope=groups/8b_good`, `?scope=schools/sl` — weil Dev- und Preview-Server sie mit einem kleinen Vite-Plugin (`config/fixtureApiPlugin.js`) unter `/api/` ausliefern. So bleibt der API-Pfad ohne Server testbar.

## Entwicklung

Der Strukturcheck benötigt nur Node.js (Version in `.nvmrc`; `npm install` erzwingt sie über `.npmrc`):

```powershell
node tools/check-structure.mjs
```

Die volle Prüfung vor einem Review:

```powershell
npm run check        # Strukturcheck + Unused-Check (knip) + Fixture-/Modulindex-/Klassenhierarchie-Check + Lint + Format-Check + Unit-Tests + Typecheck + Build + Wiki-Build
npm run lint         # oxlint (JS) + eslint (CSS)
npm run fmt          # oxfmt (JS) + prettier (CSS/JSON)
npm test             # vitest: Node-Projekt + Browser-Projekt (echtes Chrome)
npm run typecheck
npm run docs:dev     # Wiki (VitePress) über die Modul-Docs neben den Quellen und docs/; docs:build schreibt dist/docs/
npm run test:e2e     # vitest, E2E-Projekt (Playwright-Bibliothek) gegen den gebauten Preview-Server; braucht nur Chrome
```

`node tools/check-structure.mjs` prüft die Modulstruktur-Guardrails; die Regeln sind in [tools/check-structure.mjs](tools/check-structure.mjs) selbst dokumentiert, der architektonische Hintergrund in [docs/architecture.md](docs/architecture.md). Jede Modul-Unit dokumentiert sich in einer `<unitFile>.md` neben ihrer Quelle; [docs/module-index.md](docs/module-index.md) listet sie alle (generiert von `node tools/docs-sidebar.mjs`). Den Abschnitt `## Klassenhierarchie` jeder Unit-Doc schreibt `node tools/docs-hierarchy.mjs`.

`npm install` richtet über das `prepare`-Skript den Pre-Push-Hook aus `tools/hooks` ein, der `npm run check` ausführt. Auf GitHub laufen dieselbe Prüfung und die E2E-Suite als Actions (`.github/workflows/ci.yml`); `pages.yml` baut Dashboards und Wiki für GitHub Pages (`TBA3_BASE` setzt den Unterpfad, siehe `vite.config.js`).

## Auslieferung

`docker compose up --build` baut das Image und startet nginx mit den gebauten Dashboards und ihren Demo-Datensätzen auf http://127.0.0.1:8080/. `/api/` ist vorbereitet, aber ohne einen Container namens `api` antwortet es mit 502.

## Lizenz

Der Quellcode steht unter der MIT-Lizenz, siehe die Datei `LICENSE` im Repository. Davon ausgenommen sind:

- das Hintergrundbild der Startseiten `public/assets/welcome-splash-background.jpg` (Freepik-Lizenz, siehe [Bildmaterial](#bildmaterial));
- die in einen Build gebündelten Fremdkomponenten (d3, Tabulator, Quill, jsPDF, Material Symbols, Inter u. a.), die unter ihren eigenen Lizenzen bleiben — die Hinweise dazu stehen in der Datei `NOTICE`, die mit jedem Build nach `dist/` kopiert wird.

## Bildmaterial

Der Hintergrund der Startseiten (`public/assets/welcome-splash-background.jpg`) stammt von
Freepik und steht unter der freien Freepik-Lizenz: Designed by
[vectorpocket / Freepik](https://www.freepik.com). Der Lizenztext liegt unverändert daneben
in [public/assets/welcome-splash-background.LICENSE.txt](public/assets/welcome-splash-background.LICENSE.txt).
Die Datei darf nicht unterlizenziert werden und ist von der Lizenz dieses Projekts
ausgenommen.
