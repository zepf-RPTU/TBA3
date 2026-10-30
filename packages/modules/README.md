# @tba3/modules

Die VERA-Fachschicht aus TBA3, damit ein anderes VERA-Dashboard sie nicht nachbauen muss:
das Vokabular (Kompetenzstufen, Domänen, Vergleichsgruppen), das Glossar, die Farbpalette,
die ihre Bänder aus den geladenen Daten ableitet statt aus fester CSS — und darauf die
19 Diagramme und die Tabellenschicht mit ihren zehn konkreten Tabellen.

**Eigene Laufzeitabhängigkeiten:** DOMPurify bereinigt das HTML,
das die API in Stufenbeschreibungen liefert; Lit trägt die Module als Custom Elements
und rendert ihr HTML
(Tooltips, Menüs, Info-Boxen, Legenden); `@preact/signals-core` hält den Zustand der
Module und Renderer; Valibot prüft jedes Dokument, das im `DocumentStore` landet, gegen
sein Schema; `d3-array`, `d3-color` und `d3-interpolate` rechnen Mittelwerte und Farben
außerhalb der Diagramme, `d3-shape` liefert die Markerformen, die auch der
Tooltip-Schlüssel zeichnet. `d3` und `tabulator-tables` sind *optionale*
Peer-Abhängigkeiten: nur die Diagramm-Einstiegspunkte laden `d3` (`d3-free-entries` in
dependency-cruiser prüft es), nur die Tabellen `tabulator-tables`.

Das Paket ist `private` und wird nicht veröffentlicht: innerhalb dieses Repos
verlinkt npm es als Workspace. Ein Host außerhalb installiert zusätzlich nur die Peers, die
er tatsächlich braucht:

```bash
npm install d3 tabulator-tables   # nur, was die genutzten Einstiegspunkte verlangen
```

## Einstiegspunkte

Ein Einstiegspunkt bringt das Modul **und** die Datenaufbereitung mit, die es braucht: wer
den Aufgabenring importiert, bekommt die Raster-Helfer dazu, ohne sie suchen zu müssen. Die
Spalte **Daten** nennt die Pflichtdokumente der Auswertungsschnittstelle, die das Modul
lesen will; welche Felder genau und was ohne ein optionales Feld passiert, steht im
`<Datei>.md` neben der Quelle.

| Import | Gibt | Daten | Braucht |
|---|---|---|---|
| `@tba3/modules/domain` | Vokabular und Regeln: Stufen, Skalen, Äquivalenztabellen, Aufgabenmittelwerte, Merkmale | – | nichts |
| `@tba3/modules/documents` | `DocumentStore` (prüft und friert jedes Dokument beim Landen ein; `DocumentShapeError`), `apiRequestLoader`, die Anfragen (`GROUP_REQUESTS`, `SCHOOL_REQUESTS`) und `valueGroupBucketsFor`: woher jede Karte ihre Daten holt | – | nichts |
| `@tba3/modules/en-domain` | Der Englisch-Datensatzkatalog (`EN_DATASETS`) | – | nichts |
| `@tba3/modules/ma-domain` | Der Mathe-Datensatzkatalog (`MA_DATASETS`, darunter die Aufgabenpools `ITEM_POOLS`), `resolveGrouping`, das eine Gruppierung mit ihren Ringen aus `ITEM_RINGS` wählt, und die Start-Gruppierung `LEITIDEE_GROUPING` | – | nichts |
| `@tba3/modules/sl-domain` | Das Schulleitungs-Vokabular, ohne d3, Tabulator, DOM und Kartenordner (`domain-boundary` in dependency-cruiser prüft es): der Datensatzkatalog (`SL_DATASETS`, `hasSlResults`), die Auswahl einer Kompetenzkarte (`selectCompetenceSlice`, `listCompetenceSubjects`, `listCompetenceGroups`), die Selbstwirksamkeitsprobe (`findSelfEfficacy`), das Kennzahlenregister (`SUMMARY_METRICS`, `DEFAULT_SUMMARY_METRIC_ID`), die Materialtypen (`MATERIAL_TYPE_OPTIONS`; die Fächer mit Material liefert der Datensatz `SL_DATASETS.AVAILABLE_MATERIAL_SUBJECTS`) und `VIZ_MODES` | `competence-levels` | nichts |
| `@tba3/modules/context` | Der App-Kontext, den die Module lesen: `createModuleContext({glossaryData, namespace, store})` baut Glossar (`GlossaryAnnotator`) und Kompetenzstufen-Palette (`CompetenceLevelPalette`) einer App und darüber ihren `DocumentStore` (`context.documents`, dessen `onLand` die Skalen bei der Palette anmeldet; seine Dataset-Builder bekommen nach ihren Eingaben Glossar und Palette); jedes Modul bekommt ihn als Option `context` | – | nichts |
| `@tba3/modules/theme` | Die Farbschicht der Palette; jede Stufe malt als `var()` eines veröffentlichten Tokens; KS-Themen- und Hell/Dunkel-Umschaltung | – | nichts |
| `@tba3/modules/glossary` | Der Baumaufbau (`assembleGlossary`) und als `sharedGlossary` der Grundbaum des Pakets | – | nichts |
| `@tba3/modules/glossary/en`, `…/ma`, `…/sl` | Die Mount-Tabelle eines Fachs (`enGlossaryFragments` usw.) für `assembleGlossary` | – | nichts |
| `@tba3/modules/tooltips` | Der Tooltip- und Popup-Singleton | – | nichts |
| `@tba3/modules/overlays` | Die Dialoge der Module: `ModalDialog`, `confirmDialog`, `showItemPreview` (die Aufgabenvorschau: Nummer, Titel und Platzhalter für die Inhalte, die künftig der Aufgabenbrowser liefern könnte) und `isUnclaimedEscape` | – | nichts |
| `@tba3/modules/sanitize` | `sanitizeHtml`: DOMPurify mit dem Profil des Aufrufers, für HTML, das nicht aus dem eigenen Code stammt | – | nichts |
| `@tba3/modules/charts` | `ChartHostModule`, das ⌀-Menü, der Vergleichszustand, die Glossar-Läufe eines Bereichs (`subjectDomainLabelRuns`, `domainListRuns`) | – | `d3` |
| `@tba3/modules/charts/item-lollipop` | EN-Aufgaben-Lollipop | `items`, `aggregations` (`type=items`) | `d3` |
| `@tba3/modules/charts/en-competence-level-distribution` | EN-Kompetenzstufenverteilung | `competence-levels` | `d3` |
| `@tba3/modules/charts/scatterplot` | EN-Streudiagramm **und** `ScatterplotFilterModule`, die Filterkarte daneben | `competence-levels` und `aggregations`, je `type=students` | `d3` |
| `@tba3/modules/charts/style` | EN-Hör-/Lesestil (Lollipop und Spinne) | `aggregations` (`type=students`) | `d3` |
| `@tba3/modules/charts/item-success-lollipop` | MA-Aufgabenerfolg | `items` | `d3` |
| `@tba3/modules/charts/competence-level-bar` | MA-Kompetenzstufenbalken einer Lerngruppe | `competence-levels` | `d3` |
| `@tba3/modules/charts/ma-competence-level-distribution` | MA-Kompetenzstufenverteilung | `competence-levels` | `d3` |
| `@tba3/modules/charts/item-ring-focus` | Ein einzelner MA-Aufgabenring | `items`, `aggregations` (`type=items`/`type=students`), `competence-levels` (`type=students`) | `d3` |
| `@tba3/modules/charts/item-ring-grid` | Das MA-Aufgabenring-Raster | wie `item-ring-focus` | `d3` |
| `@tba3/modules/charts/group-deviation` | SL-Lerngruppenabweichung (`groupDeviationConfig`) **und** die Zusammenfassung, aus der ihre Karten zeichnen (`getSchoolSummary`, je Auswahl im Store gemerkt), samt `summaryMinRowWidth`, der Mindestbreite einer Karte für das Raster | `competence-levels` (`type=school,group`), `items` | `d3` |
| `@tba3/modules/charts/competence-detail` | SL-Kompetenzstufen im Detail (eine Fach×Domäne-Karte) | `competence-levels` (`type=school,group`) | `d3` |
| `@tba3/modules/charts/competence-overview` | SL-Kompetenzstufenübersicht | `competence-levels` (`type=school,group`) | `d3` |
| `@tba3/modules/charts/group-comparison` | SL-Gruppenvergleich | `competence-levels` (`type=school,group` und `type=students`), `aggregations` (`type=students`, `aggregation=result`) | `d3` |
| `@tba3/modules/charts/longitudinal` | Alle vier SL-Längsschnitt-Descriptoren (`longitudinalCompetenceLevelShareConfig`, `selfEfficacyLongConfig`, `teachingQualityConfig`, `longitudinalBoxPlotConfig`) | `competence-levels` (`type=school,group,students`, `comparison=state-average,year`) | `d3` |
| `@tba3/modules/charts/self-efficacy` | SL-Selbstwirksamkeit (Stapelbalken oder Boxplot) | `competence-levels` (`type=students`) | `d3` |
| `@tba3/modules/tables/<name>` | Eine konkrete Tabelle, z. B. `@tba3/modules/tables/ma-group`; der Name trägt die App (`en-`, `ma-`, `sl-`), weil EN und MA je eine Lerngruppen-, Aufgaben-, Schülerdaten- und Schülerinfo-Tabelle haben | je Tabelle, siehe ihr `.md` | `tabulator-tables` |
| `@tba3/modules/en-item-detail` | `EnItemDetailModule`, die Aufgabendetail-Karte | `items`, `aggregations` (`type=items`/`type=students`) | nichts |
| `@tba3/modules/info-box` | `InfoBoxModule`; die Selbstwirksamkeits-Zusammenfassung, aus der ihre Platzhalter lesen, ist das Dataset `SL_DATASETS.SELF_EFFICACY_SUMMARY` in `@tba3/modules/sl-domain` | `competence-levels` (`type=school,group`), die `info-boxes`-Vorlagen | nichts |
| `@tba3/modules/material-selection` | `MaterialSelectionModule`; die Auswahllisten dazu stehen in `@tba3/modules/sl-domain` | `competence-levels` (`type=school,group` und `type=students`), `aggregations` (`aggregation=result`) | nichts |
| `@tba3/modules/styles/*` | Die Stylesheets, siehe unten | – | – |

Andere Pfade lösen **nicht** auf: alles unter `src/` ist Interna, und kein Name, kein Pfad
und kein Inhalt darin ist zugesagt. Wer etwas braucht, das oben nicht steht, meldet es als
Lücke im Einstiegspunkt.

Es gibt **keinen** Wurzel-Export (`@tba3/modules`): ein Sammelmodul zöge Diagramme
*und* Tabellen und damit beide Peer-Abhängigkeiten in jeden Graphen.

## 1. Ein Diagramm ohne App-State

Der häufigste Fall: Vergleichswerte liegen im Payload, es soll keine Bedienung geben.

```js
import { createModuleContext } from '@tba3/modules/context';
import { GROUP_REQUESTS, apiRequestLoader } from '@tba3/modules/documents';
import { ChartHostModule } from '@tba3/modules/charts';
import { maCompetenceLevelDistributionConfig } from '@tba3/modules/charts/ma-competence-level-distribution';
import '@tba3/module-base/styles/tokens.css';
import '@tba3/modules/styles/tokens.css';
import '@tba3/modules/styles/stacked-bar.css';

// Der Kontext hält Glossar, Palette und den Store dieser Seite. Die Karte liest ihre Daten
// aus dem Store, der nur die Anfragen schickt, die sie braucht. Beim Landen registriert der
// Kontext die Skalen — die Palette leitet ihre Bänder daraus ab, nicht aus fester CSS.
const context = createModuleContext({
    glossaryData: null,
    namespace: '',
    store: {
        requests: GROUP_REQUESTS.ma,
        loadRequest: apiRequestLoader({ baseUrl: 'https://api.example/', scope: 'groups/3a' }),
    },
});

const host = ChartHostModule.createChart('competence-levels', maCompetenceLevelDistributionConfig, {
    showModuleTitle: true,
    context,
});
document.querySelector('#competence-levels').append(host);
await host.updateComplete;
```

Das Element, in das der Host kommt, braucht eine Höhe — die Karte füllt, was sie bekommt, und ein
`<div>` ohne Höhe lässt den Renderer warnen statt zeichnen.

Ohne `comparisonState` erscheint **kein ⌀-Menü**, und **alle** Vergleichsgruppen, die der
Payload mitbringt, werden gezeichnet. Das ist der Unterschied zwischen „keine Meinung“ und
„nichts anzeigen“: eine leere Liste blendet alles aus, gar kein Zustand blendet nichts aus.

## 2. Ein Diagramm mit Umschaltern, aber ohne App

```js
import { ChartHostModule, createComparisonState } from '@tba3/modules/charts';
import { maCompetenceLevelDistributionConfig } from '@tba3/modules/charts/ma-competence-level-distribution';

const comparisonState = createComparisonState(); // zeigt zunächst keine Vergleichsgruppe
comparisonState.setActive('school', true);
comparisonState.setActive('state', true);

const host = ChartHostModule.createChart('competence-levels', maCompetenceLevelDistributionConfig, {
    comparisonState,
    context, // wie in Abschnitt 1
});
element.append(host);
await host.updateComplete;

// Die Lesungen sind Signal-Lesungen: das gezeichnete Diagramm folgt jedem Umschalten selbst.
comparisonState.setActive('state', false);
```

Jetzt trägt die Kartenkopfzeile das ⌀-Menü. Zwei Regeln dazu:

- **Der ID-Raum ist gemeinsam.** Zwei Diagramme, die dieselbe ID anbieten, schalten
  zusammen — genau das macht ein Menü überall gleichbedeutend.
- **Ein Zustand ohne `setActive` ist schreibgeschützt**, und dann wird gar kein Menü
  gebaut. So zeigt ein Nur-Lese-Dialog dieselben Mittelwerte, ohne sie ändern zu können.

## 3. Mit und ohne Glossar

Das Glossar ist optional. Ohne Baum (`glossaryData: null`) gibt `annotateHTML` seine Eingabe
unverändert zurück, und jeder Begriff, der sonst ein Popup trüge, bleibt schlichter Text.
Nichts muss deshalb weggelassen werden: `tooltipService.init(glossary)` schaltet die
Glossar-Popups nur ein, wenn das übergebene Glossar initialisiert ist.

```js
import { createModuleContext } from '@tba3/modules/context';
import { tooltipService } from '@tba3/modules/tooltips';

const context = createModuleContext({ glossaryData: meinGlossarBaum, namespace: 'en' });
tooltipService.init(context.glossary); // ohne Baum nur die Tooltips
// …
tooltipService.dispose(); // beim Abbau des Hosts: Listener, Tooltip-Element und Popups weg
```

Der Baum braucht mindestens `tree[namespace].shared.element_texts`. Wer keinen eigenen hat,
setzt ihn aus `glossary.json` und der Mount-Tabelle des Fachs zusammen; die legt jedes Fragment
an genau den Pfad, an dem seine Karte liest:

```js
import { assembleGlossary, sharedGlossary } from '@tba3/modules/glossary';
import { maGlossaryFragments } from '@tba3/modules/glossary/ma';

const context = createModuleContext({
    glossaryData: assembleGlossary(sharedGlossary, { ...maGlossaryFragments }),
    namespace: 'ma',
});
```

Eigene Texte kommen als weitere Basis dazu: `assembleGlossary([basis, eigeneTexte], …)`.
Beansprucht die eigene Basis einen Eintrag, den das Paket schon hat, scheitert der Zusammenbau.
Die EN-Texte nennen ihre Skala über Begriffs-Tokens (`{{Stufe}}`, `{{Stufen}}`, `{{Skala}}`); ein
EN-Host reicht sie als dritte Angabe mit: `assembleGlossary(…, { ...enGlossaryFragments },
{ terms: EN_GLOSSARY_TERMS })`, beides aus `@tba3/modules/glossary/en`.

## Stylesheets

Jede Karte importiert ihr eigenes CSS selbst; hinzu kommen die geteilten Blätter:

| Blatt | Wofür |
|---|---|
| `tokens.css` | **Zuerst importieren**, direkt nach `@tba3/module-base/styles/tokens.css`, das die Designtokens beider Pakete vorgibt (Marke, Schrift, Abstände, Radien, Schatten, Bewegung, Text- und Flächenfarben). Vorgabewerte für jede weitere Custom Property, die die Blätter lesen und nicht selbst setzen |
| `stacked-bar.css` | Die gestapelten KS-Balken |
| `competence-levels.css` | Der `.competence-level`-Haken, den `createGerLevelHtml` und `createItemLevelHtml` (`common/services/itemCompetenceLevelAppearance.js`) setzen, und für das Graustufen-Thema (`data-competence-level-theme='grayscale'`) die Varianten der übrigen Datenfarben |
| `html-legend-panel.css` | Die Legendenchips; den Vorlesehinweis eines ausgeblendeten Eintrags verbirgt `.visually-hidden` aus `@tba3/module-base/styles/layout.css` |
| `detail-rows.css` | Die Teile einer Aufgaben-Statistikkarte: Abschnitte, Leistungszeilen, Schüler:innen-Liste und die Leer-Meldung (`.empty-message`) |
| `table-base.css`, `table-header-layout.css`, `table-host.css` | Die Tabulator-Überschreibungen, **nach** `tabulator-tables/dist/css/tabulator.min.css` |
| `glossary-popup.css` | Nur nötig, wenn Glossar-Popups benutzt werden; das Tooltip-CSS bringen `tooltipService.js` und `cursorTooltip.js` selbst mit |
| `modal-dialog.css` | Die Hülle eines modalen `<dialog>`-Overlays (`ModalDialog`, `confirmDialog`): Reset, `::backdrop`, Ein- und Ausblenden, Karte und ✕ |

Beide `tokens.css` sind nichts als Vorgabe: keine `!important`, alles auf `:root`, also gewinnt ein
eigenes Blatt allein durch die Reihenfolge. Wer ein eigenes Designsystem hat, lässt die
Dateien weg — schuldet dann aber jede Property darin, denn eine fehlende ergibt eine ungesetzte
Farbe, keinen Fehler.

**Eine App pro Seite.** Die Farben, die JS berechnet (jede Kompetenzstufe mit ihrer
Schriftfarbe, die SL-Bewertungsbänder), schreibt die Palette als Tokens auf `:root`
(`paletteTokens.js`). Zwei Apps auf einer Seite schrieben dieselben Tokens aus zwei
Paletten, und die spätere übermalte die Stufenfarben der früheren.

**Kaskadenschichten.** Die Blätter der Karten wiederholen
`@layer vendor, foundation, common, modules, views;`, weil das CSS eines Chunks vor dem Einstiegsblatt auf der Seite sein kann und die
erste `@layer`-Anweisung die Reihenfolge festlegt. Wer selbst Schichten deklariert, muss
diese Reihenfolge deklarieren — oder akzeptieren, dass diese Blätter sie anlegen. Die
geteilten Blätter oben tragen keine Schicht: der Host legt sie selbst in eine
(`@import '…' layer(common)`), sonst schlagen sie als ungeschichtete Regeln jede Kartenregel.

## Was der Host selbst liefert

Jede Karte holt ihre Daten selbst aus dem `DocumentStore` ihres Kontexts
(`context.documents`); [`docs/datenvertrag.md`](./docs/datenvertrag.md) sagt, wie ein Host ihn baut
und welche Optionen daneben bleiben. Die Fixture-Ordner einer TBA3-Demo lädt das Paket nicht:
dafür braucht es einen eigenen Loader des Hosts.

Ebenso öffnet das Paket keine Aufgabenvorschau von selbst: die EN- und MA-Aufgaben- und
Schülerdatentabellen reichen den Payload der angeklickten Aufgabe an `context.itemPreview`, das
der Host einmal in seinen Kontext legt (etwa `(item) => showItemPreview(context.glossary, item)`
aus `@tba3/modules/overlays`). Ohne es gibt es keinen Vorschau-Button.

