# @tba3/modules

Die VERA-Fachschicht aus TBA3, damit ein anderes VERA-Dashboard sie nicht nachbauen muss:
das Vokabular (Kompetenzstufen, Domänen, Vergleichsgruppen), das Glossar, die Farbpalette,
die ihre Bänder aus den geladenen Daten ableitet statt aus fester CSS — und darauf die
17 Diagramme und die Tabellenschicht mit ihren zehn konkreten Tabellen.

**Ohne eigene Laufzeitabhängigkeiten.** `d3` und `tabulator-tables` sind *optionale*
Peer-Abhängigkeiten: wer nur `@tba3/modules/domain` importiert, lädt keins von beiden.

Das Paket ist heute `private` und wird nicht veröffentlicht: innerhalb dieses Repos
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
| `@tba3/modules/domain` | Vokabular und Regeln: Stufen, Skalen, Äquivalenztabellen, Aufgabenmittelwerte, Merkmale, Vergleichsgruppen-Labels | – | nichts |
| `@tba3/modules/en-domain` | Das Englisch-Vokabular vor der ersten Karte: `AGG_TYPE_STYLE`, `parseStyleAggregation` | `aggregations` (`type=students`) | nichts |
| `@tba3/modules/sl-domain` | Das Schulleitungs-Vokabular: Stufenleitern (`buildLevelDefinitions`, `getScaleIdForDomain`), Zeilenindex (`buildCompetenceLevelIndex`, `deriveClassNames`), Befragungsproben (`hasSurveyRows`, `detectHistorySurveyScales`, `calculateDetailedBoxPlotStats`), Kennzahlenregister (`SUMMARY_METRICS`, `DEFAULT_SUMMARY_METRIC_ID`, `deriveSummaryAverages`), die Materiallisten und `VIZ_MODES` | `competence-levels` | nichts |
| `@tba3/modules/theme` | Kompetenzstufen-Palette, Themenfarben, KS-Themen- und Hell/Dunkel-Umschaltung | – | nichts |
| `@tba3/modules/glossary` | Annotator, Baumaufbau, Schlüssel, die payloadgetriebenen Stufeneinträge, und als `sharedGlossary` der Grundbaum des Pakets | – | nichts |
| `@tba3/modules/glossary/en`, `…/ma`, `…/sl` | Die Mount-Tabelle eines Fachs (`enGlossaryFragments` usw.) für `assembleGlossary` | – | nichts |
| `@tba3/modules/tooltips` | Der Tooltip- und Popup-Singleton | – | nichts |
| `@tba3/modules/charts` | `ChartHostModule`, das ⌀-Menü, der Vergleichszustand, `applyCompetencyBandPaint` | – | `d3` |
| `@tba3/modules/charts/item-lollipop` | EN-Aufgaben-Lollipop | `items`, `aggregations` (`type=items`, `aggregation=result`) | `d3` |
| `@tba3/modules/charts/en-ks-distribution` | EN-Kompetenzstufenverteilung | `competence-levels` | `d3` |
| `@tba3/modules/charts/scatterplot` | EN-Streudiagramm **und** `ScatterplotFilterModule`, die Filterkarte daneben | `competence-levels` und `aggregations`, je `type=students` | `d3` |
| `@tba3/modules/charts/style` | EN-Hör-/Lesestil (Lollipop und Spinne) | `aggregations` (`type=students`) | `d3` |
| `@tba3/modules/charts/item-success-lollipop` | MA-Aufgabenerfolg | `items` | `d3` |
| `@tba3/modules/charts/ks-bar` | MA-Kompetenzstufenbalken einer Klasse | `competence-levels` | `d3` |
| `@tba3/modules/charts/ma-ks-distribution` | MA-Kompetenzstufenverteilung | `competence-levels` | `d3` |
| `@tba3/modules/charts/task-ring-focus` | Ein einzelner MA-Aufgabenring | `items`, `aggregations` (`type=items`/`type=students`), `competence-levels` (`type=students`) | `d3` |
| `@tba3/modules/charts/task-ring-grid` | Das MA-Aufgabenring-Raster **und** seine Layout-Helfer (`getTaskRingChartDefinitions`, `resolveDefaultDomain`, `remountChartHost`, `updateTaskRingHostIfReusable`) | wie `task-ring-focus` | `d3` |
| `@tba3/modules/charts/class-deviation` | SL-Klassenabweichung **und** die Abfragen dahinter (`CompetenceShareQueries`, `SolutionRateQueries`, `buildSummaryRows`, `estimateMinRowWidth`, `resolveLabelLineCount`) | `competence-levels` (`type=school,group`), `items` | `d3` |
| `@tba3/modules/charts/competency-detail` | SL-Kompetenzstufen im Detail (eine Fach×Domäne-Karte) | `competence-levels` (`type=school,group`) | `d3` |
| `@tba3/modules/charts/competency-overview` | SL-Kompetenzstufenübersicht | `competence-levels` (`type=school,group`) | `d3` |
| `@tba3/modules/charts/group-comparison` | SL-Gruppenvergleich | `competence-levels` (`type=school,group` und `type=students`), `aggregations` (`type=students`, `aggregation=result`) | `d3` |
| `@tba3/modules/charts/longitudinal` | Alle drei SL-Längsschnitte, der Parallelkoordinaten-Renderer und die Zeitreihen-Wandler (`convert*ToTimeline`) | `competence-levels` (`type=school,students`, `comparison=year`) | `d3` |
| `@tba3/modules/charts/longitudinal-ks-share`, `…-self-efficacy`, `…-teaching-quality` | Je ein Längsschnitt-Descriptor einzeln | wie oben | `d3` |
| `@tba3/modules/charts/parallel-coordinates` | `ParallelCoordinatesChart` als Renderer für einen eigenen Descriptor | – | `d3` |
| `@tba3/modules/charts/self-efficacy` | SL-Selbstwirksamkeit (Stapelbalken oder Boxplot) | `competence-levels` (`type=students`) | `d3` |
| `@tba3/modules/tables` | `TableModule`, die vier VERA-Tabellenbasen, Spaltenfabriken, `setDownloadFormat` | – | `tabulator-tables` |
| `@tba3/modules/tables/<name>` | Eine konkrete Tabelle, z. B. `@tba3/modules/tables/ma-class`; der Name trägt die App (`en-`, `ma-`, `sl-`), weil EN und MA je eine Klassen-, Aufgaben-, Schülerdaten- und Schülerinfo-Tabelle haben | je Tabelle, siehe ihr `.md` | `tabulator-tables` |
| `@tba3/modules/en-item-detail` | `EnItemDetailModule`, die Aufgabendetail-Karte | `items`, `aggregations` (`type=items`/`type=students`) | nichts |
| `@tba3/modules/info-box` | `InfoBoxModule` **und** die Zusammenfassungs-Namensräume, aus denen ihre Platzhalter lesen | `competence-levels` (`type=school,group`), dazu der `slData`-Port | nichts |
| `@tba3/modules/material-selection` | `MaterialSelectionModule`; die Auswahllisten dazu stehen in `@tba3/modules/sl-domain` | `competence-levels` (`type=school,group`), `items`, dazu der `slData`-Port | nichts |
| `@tba3/modules/styles/*` | Die Stylesheets, siehe unten | – | – |

Tiefe Importe (`@tba3/modules/common/domain/levels.js`) spiegeln den Quellbaum und lösen
ebenfalls auf, sind aber **instabile Interna**: kein Name, kein Pfad und kein Inhalt darin
ist zugesagt, und die nächste Umsortierung bricht sie kommentarlos. Sie sind für den
gedacht, der eine Kopie des Pakets anpasst — nicht für den, der es einbindet. Wer hier
etwas braucht, das oben nicht steht, meldet es als Lücke im Einstiegspunkt.

Es gibt **keinen** Wurzel-Export (`@tba3/modules`). Absicht: ein Sammelmodul zöge Diagramme
*und* Tabellen in jeden Graphen und damit beide Peer-Abhängigkeiten — genau das, was die
Aufteilung verhindern soll.

## 1. Ein Diagramm ohne App-State

Der häufigste Fall: Vergleichswerte liegen im Payload, es soll keine Bedienung geben.

```js
import { registerCompetenceLevelScales } from '@tba3/modules/theme';
import { ChartHostModule } from '@tba3/modules/charts';
import { maKsDistributionConfig } from '@tba3/modules/charts/ma-ks-distribution';
import '@tba3/modules/styles/tokens.css';
import '@tba3/modules/styles/stacked-bar.css';

// Zuerst die Skalen aus dem Payload registrieren — die Palette leitet ihre Bänder
// daraus ab, nicht aus fester CSS.
registerCompetenceLevelScales(competenceLevels);

const host = new ChartHostModule('ks', document.querySelector('#ks'), maKsDistributionConfig, {
    showModuleTitle: true,
});
await host.init(competenceLevels);
```

Der Host-Container braucht eine Höhe — die Karte füllt, was sie bekommt, und ein
`<div>` ohne Höhe lässt den Renderer warnen statt zeichnen.

Ohne `comparisonState` erscheint **kein ⌀-Menü**, und **alle** Vergleichsgruppen, die der
Payload mitbringt, werden gezeichnet. Das ist der Unterschied zwischen „keine Meinung“ und
„nichts anzeigen“: eine leere Liste blendet alles aus, gar kein Zustand blendet nichts aus.

## 2. Ein Diagramm mit Umschaltern, aber ohne App

```js
import { ChartHostModule, bindComparisonState, createComparisonState } from '@tba3/modules/charts';
import { maKsDistributionConfig } from '@tba3/modules/charts/ma-ks-distribution';

const comparisonState = createComparisonState(['school', 'state']);

const host = new ChartHostModule('ks', element, maKsDistributionConfig, { comparisonState });
await host.init(competenceLevels);

// Der Konstruktor liest den Anfangszustand; gebunden wird für alles danach.
const release = bindComparisonState(host, comparisonState);
```

Jetzt trägt die Kartenkopfzeile das ⌀-Menü. Zwei Regeln dazu:

- **Der ID-Raum ist gemeinsam.** Zwei Diagramme, die dieselbe ID anbieten, schalten
  zusammen — genau das macht ein Menü überall gleichbedeutend.
- **Ein Zustand ohne `setActive` ist schreibgeschützt**, und dann wird gar kein Menü
  gebaut. So zeigt ein Nur-Lese-Dialog dieselben Mittelwerte, ohne sie ändern zu können.

## 3. Mit und ohne Glossar

Das Glossar ist optional. Ohne es gibt `annotateHTML` seine Eingabe unverändert zurück, und
jeder Begriff, der sonst ein Popup trüge, bleibt schlichter Text. Nichts muss deshalb
weggelassen werden — auch `initGlossaryPopups()` ist ohne Glossar nur eine Warnung.

```js
import { glossaryAnnotator } from '@tba3/modules/glossary';
import { tooltipService } from '@tba3/modules/tooltips';

glossaryAnnotator.init(meinGlossarBaum, 'en'); // optional
tooltipService.setupDelegatedTooltips();
tooltipService.initGlossaryPopups(); // ohne Glossar ein no-op
```

Der Baum braucht mindestens `tree[namespace].shared.element_texts`. Wer keinen eigenen hat,
setzt ihn aus `glossary.json` und der Mount-Tabelle des Fachs zusammen; die legt jedes Fragment
an genau den Pfad, an dem seine Karte liest:

```js
import { assembleGlossary, sharedGlossary } from '@tba3/modules/glossary';
import { maGlossaryFragments } from '@tba3/modules/glossary/ma';

glossaryAnnotator.init(assembleGlossary(sharedGlossary, { ...maGlossaryFragments }), 'ma');
```

Eigene Texte kommen als weitere Basis dazu: `assembleGlossary([basis, eigeneTexte], …)`.
Beansprucht die eigene Basis einen Eintrag, den das Paket schon hat, scheitert der Zusammenbau.

## Stylesheets

Jede Karte importiert ihr eigenes CSS selbst; hinzu kommen die geteilten Blätter:

| Blatt | Wofür |
|---|---|
| `tokens.css` | **Zuerst importieren.** Vorgabewerte für jede Custom Property, die die Blätter lesen und nicht selbst setzen |
| `stacked-bar.css` | Die gestapelten KS-Balken |
| `competence-levels.css` | Der `.competency-level`-Haken, den `createGerLevelHtml` setzt |
| `html-legend-panel.css` | Die Legendenchips |
| `table-base.css`, `table-header-layout.css`, `table-host.css` | Die Tabulator-Überschreibungen, **nach** `tabulator-tables/dist/css/tabulator.min.css` |
| `glossary-popup.css` | Nur nötig, wenn Glossar-Popups benutzt werden; das Tooltip-CSS bringt `tooltipService.js` selbst mit |
| `modal-backdrop.css` | Der Vollbild-Hintergrund der Overlays (SL-Detail, Aufgabenvorschau, EN-Streudiagrammfilter) |

`tokens.css` ist nichts als Vorgabe: keine `!important`, alles auf `:root`, also gewinnt ein
eigenes Blatt allein durch die Reihenfolge. Wer ein eigenes Designsystem hat, lässt die
Datei weg — schuldet dann aber jede Property darin, denn eine fehlende ergibt eine ungesetzte
Farbe, keinen Fehler.

**Kaskadenschichten.** Die Blätter wiederholen `@layer vendor, foundation, common, modules,
views;`, weil das CSS eines Chunks vor dem Einstiegsblatt auf der Seite sein kann und die
erste `@layer`-Anweisung die Reihenfolge festlegt. Wer selbst Schichten deklariert, muss
diese Reihenfolge deklarieren — oder akzeptieren, dass diese Blätter sie anlegen.

## Was noch fehlt

Diagramme und Tabellen bekommen ihre Konfiguration als Optionen: welche Domänen es gibt, wie die
Spalten des Datensatzes heißen, welche Äquivalenztabellen gelten. Dieses Stück — in TBA3
`enConfig.js` — gehört bewusst **nicht** zum Paket: es beschreibt einen Datensatz, nicht die
Fachlichkeit. [`docs/datenvertrag.md`](./docs/datenvertrag.md) sagt, was ein Host dafür
liefern muss.

Ebenso öffnet das Paket keine Aufgabenvorschau: die EN- und MA-Aufgaben- und Schülerdatentabellen
reichen den Payload der angeklickten Aufgabe an die Option `onItemPreview`, und der Host
entscheidet, was er zeigt. Ohne Handler gibt es keinen Vorschau-Button.

Die SL-Infoboxen und -Materialien lesen ihre Dokumente über einen Port statt über einen
Datenspeicher: der Typ `SlData` (`src/sl/slData.js` im Paket) nennt, was sie brauchen
(`competence-levels`, `items`, `students_competence-levels`, die `info_boxes`-Vorlagen und die
Survey-Aggregate). Der Host übergibt ihn als Option `slData`; ohne ihn zeigen die Karten ihre
Leerzustände.
