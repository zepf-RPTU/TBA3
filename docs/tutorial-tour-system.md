# Rundgang (Tutorial-Tour)

> Dieses Dokument ist auf Deutsch, weil es eine Anleitung für die Autor:innen der
> deutschsprachigen Tour-Texte ist. Der übrige `docs/`-Bestand bleibt englisch.

## Überblick

Der Header-Button „Rundgang starten" führt Schritt für Schritt durch die aktive View: der
Bildschirm dimmt ab, ein Leuchtring umschließt jeweils ein Element, daneben steht eine Karte
mit Erklärtext und den Schaltflächen Zurück / Überspringen / Weiter (auf dem letzten Schritt
„Fertig").

Die Schritte werden **abgeleitet, nicht pro View geschrieben.** `buildTourSteps()` läuft den
registrierten Modulbaum der View ab und erzeugt einen Schritt für jedes Modul, dessen
Glossareintrag ein nicht-leeres `tutorial` besitzt. Zwei Konsequenzen, auf denen das
ganze System beruht:

- Ein Schritt entsteht in dem Moment, in dem ein Glossareintrag Tutorial-Text bekommt — ohne
  jede Codeänderung.
- Ein nur bedingt registriertes Modul (etwa das Spider-Chart der Schüler:innen-View) liefert
  einfach keinen Schritt, statt einen toten Anker zu hinterlassen.

## Dateien

| Datei | Rolle |
|---|---|
| `src/common/modules/tutorial/tourStepBuilder.js` | `buildTourSteps()` — Header-Schritt, abgeleitete Modulschritte, gemeinsame Abschlusskarten |
| `src/common/modules/tutorial/glossaryTutorial.js` | `resolveGlossaryTutorial()` — die einzige Stelle, an der `tutorial` annotiert und Token-ersetzt wird |
| `src/common/modules/tutorial/tutorialController.js` | Die Engine: Leuchtring, Karte, Fortschrittspunkte, Positionierung, Schließen |
| `src/common/app/appModule.js` | Abschnitt `GUIDED WALKTHROUGH`: `#handleInfoToggled()` leitet ab und startet, `closeTour()` beendet |
| `src/common/modules/baseViewModule.js` | `customizeTourSteps(steps)` — der einzige View-seitige Hook |
| `src/common/modules/tutorial/tutorialController.css` | `.tutorial-tour-*`; für alle drei Dashboards dieselbe Hülle |
| `src/{en,ma,sl}/**/*.glossary.json` | `tutorial` je Modul, neben dem Modul, dem es gehört |
| `src/common/app/shellGlossary.json` | `general.tour.{hover,export,notes}-help` — die Abschlusskarten aller drei Dashboards |
| `tests/e2e/tour.spec.js` | pinnt die Schrittfolge je View mit Tour |

## Woher der Text kommt

Ausschließlich aus dem Glossar. Ein Modul mit Glossareintrag bezieht seine Texte von dort und
nirgends sonst — das prüft `tools/check-structure.mjs` (Regel `glossary-copy-ownership`).

- **Kartentext:** das Feld `tutorial` des Eintrags. Fehlt es, gibt es keinen Schritt.
- **Kartenüberschrift:** `title`.
- **Wo der Eintrag liegt:** Modul-Fragmente stehen als `<owner>.glossary.json` neben ihrem
  Modul und werden vom App-Barrel (`src/{en,ma,sl}/{en,ma,sl}Glossary.js`) über
  `packages/modules/src/common/glossary/glossaryAssembly.js` an ihren Punktpfad montiert. Geteiltes Vokabular
  bleibt in `packages/modules/src/common/glossary/glossary.json`, die Abschlusskarten stehen mit der
  übrigen Shell-Copy in `src/common/app/shellGlossary.json`. Zwei Fragmente, die denselben
  Pfad beanspruchen, lassen den Zusammenbau absichtlich scheitern.
- **Glossar-Popups in der Karte funktionieren:** `resolveGlossaryTutorial()` schickt den Text
  durch `glossaryAnnotator.annotateHTML()`, und `--z-glossary` liegt über dem Overlay.

Ein Modul kann zusätzlich die Option `glossaryReplacements` setzen; dann werden `{{token}}`
im Text über `applyTemplateTokens()` (`packages/module-base/src/glossary/glossaryText.js`) ersetzt. Das ist
eine simple Wort-für-Wert-Ersetzung und hat **nichts** mit den SL-Infobox-Platzhaltern zu tun
(siehe [sl-info-box-placeholders.md](sl-info-box-placeholders.md)), auch wenn beide `{{…}}`
schreiben.

## Wie die Schrittfolge entsteht

```
Header-Schritt  →  Module mit Tutorial-Text, in Dokumentreihenfolge  →  customizeTourSteps  →  Abschlusskarten
```

1. **Header** — aus dem `glossaryPath` der View-Header-Config (`<app>.<view>.header`),
   verankert an `.header-module`. Fehlt dort `tutorial`, entfällt die Karte.
2. **Module** — Tiefensuche über `view.childModules`; ein Schritt je Modul, dessen
   `glossaryKey` auf einen Eintrag mit `tutorial` zeigt. Der Anker wird als Funktion
   gespeichert, die über das **Modul** schließt, nicht über sein Element — so überlebt er
   Tabulator-Neuaufbauten und Chart-Redraws.
3. **Reihenfolge** — sortiert per `compareDocumentPosition`, also nach Leserichtung, nicht
   nach Registrierungsreihenfolge. Die beiden weichen real voneinander ab: die Klassen-View
   registriert ihr Chart vor der Tabelle, weil das Chart beim Sync der Tabelle schon
   zuhören muss. Schritte ohne gemountetes Element nehmen an der Sortierung nicht teil und
   behalten ihren Platz — würden sie als „gleich" verglichen, wäre der Komparator nicht
   transitiv und könnte die gesamte Liste verwürfeln, nicht nur den einen Ausreißer.
4. **View-Hook** — `view.customizeTourSteps(steps)`, siehe unten. Läuft vor den
   Abschlusskarten, eine View kann also nur ihre eigenen Schritte umbauen.
5. **Abschlusskarten** — `general.tour.{hover,export,notes}-help`, für alle Dashboards gleich. Jede wird
   weggelassen, wenn ihr Anker auf dieser View nicht existiert: die Willkommens-View hat
   keine Tabelle und keinen Export-Button, dort entfallen also zwei der drei Karten.

## Eine Tour für eine View ändern

| Ziel | Vorgehen |
|---|---|
| Schritt hinzufügen oder entfernen | `tutorial` im Glossarfragment des Moduls anlegen bzw. entfernen. Kein Code. |
| Text oder Überschrift ändern | Nur der Glossareintrag (`tutorial`, `title`). |
| Reihenfolge ändern | Das DOM ändern. Die Tour folgt der Leserichtung; sie ist nirgends als Liste hinterlegt. |
| Button ein-/ausblenden | `showInfoButton` in der View-Header-Config in `src/{en,ma,sl}/*HeaderControls.js`. |

Regel für `showInfoButton`: an, sobald mindestens ein Eintrag im Modulbaum der View
`tutorial`-Text trägt; sonst aus. Ein Klick auf einer View ohne Texte würde nur „No tour steps"
loggen und den Button wieder lösen.

## Eigene Schritte ergänzen: `customizeTourSteps`

Der Hook ist für genau die Schritte gedacht, die der Modulbaum **nicht** deklarieren kann:

- Der Anker gehört keinem Modul (eine Schaltfläche in einer Toolbar).
- Das beschriebene Element existiert während der Tour gar nicht (ein geschlossener Dialog).

Alles andere gehört ins Glossar, nicht hierher. Aktuell nutzt genau eine View den Hook
(`src/en/views/enClassViewModule.js`), für genau diese zwei Fälle:

```js
customizeTourSteps(steps) {
    const glossaryData = this.getOption('glossaryData');
    const tableEl = () => this.#classTableModule?.element ?? null;

    const extras = [
        {
            path: 'en.class.filter',
            getAnchor: () => tableEl()?.querySelector(SCATTER_SEARCH_BUTTON_SELECTOR) ?? null
        },
        // Ohne `getAnchor`: bewusst zentriert, kein verlorener Anker.
        { path: 'en.class.scatterplot' }
    ].flatMap(({ path, getAnchor }) => {
        const tutorial = resolveGlossaryTutorial(glossaryData, path);
        return tutorial ? [{ getAnchor, title: tutorial.title, html: tutorial.html }] : [];
    });

    return [...steps, ...extras];
}
```

Zu beachten:

- **Text auch hier aus dem Glossar.** `resolveGlossaryTutorial()` verwenden, keine Strings im
  Code. Die `path:`-Literale werden von `tools/check-structure.mjs` als Glossarpfade geprüft.
- **Anker-Konvention.** Kein `getAnchor` = absichtlich zentrierte Karte, bleibt still. Ein
  `getAnchor`, das `null` liefert = verlorener Anker; der Controller warnt einmal beim
  Betreten des Schritts, nicht bei jedem Scroll- oder Resize-Frame.
- **Der Hook bekommt die abgeleiteten Schritte** und gibt die tatsächlich zu laufende Liste
  zurück; er darf also auch umsortieren oder entfernen.

## Wann keine Tour startet

`#handleInfoToggled()` verweigert den Start in zwei Fenstern, statt einen unvollständigen
oder unsichtbaren Rundgang zu zeigen:

- solange `ViewLifecycle.isTransitioning` einen Wechsel meldet, und
- solange der View-Container noch `BaseViewModule.RENDERING_ATTRIBUTE`
  (`data-view-rendering` → `visibility: hidden`) trägt.

Beide Prüfungen sind nötig: `showView()` räumt die erste ab, bevor `revealView()` fertig ist.
Eine leere Schrittliste führt zu einer Warnung, und der Header-Button löst sich wieder.

`closeTour()` wird an drei Stellen gerufen: beim Aus-Toggle des Buttons, in
`beforeShowView()` (die Anker einer Tour gehören zu der View, aus der sie abgeleitet wurde)
und in `destroy()`. Letzteres ist kein Zierrat: das Overlay hängt an `document.body`, die
Scroll- und Resize-Listener hängen an `window` — beides liegt außerhalb des Modulbaums und
würde die App sonst überleben.

## Stand je Dashboard

Ob eine View eine Tour hat, ist eine Inhalts-, keine Codefrage.

- **EN** — alle fünf Views; als einziger Namespace mit Headerkarten (`tutorial` am
  `header`-Eintrag der View).
- **MA** — Klassen-, Aufgaben- und Schüler:innen-View. Die Texte sind Entwürfe, abgeleitet aus
  den bis April 2026 vorhandenen `html_tutorial`/`html_text`-Einträgen und an die heutige
  Oberfläche angepasst; sie warten auf redaktionelle
  Prüfung. Übersicht und Willkommen haben noch keine Texte.
- **SL** — nur die Vergleichs-View (`sl.comparison.results`). Die Übersicht bindet mit
  `sl.results` ebenfalls einen Eintrag mit `tutorial` ein, hat aber keinen `showInfoButton`.

Die Touren im Detail — das ist, was `tests/e2e/tour.spec.js` festhält:

| App | View | Schritte | Header | Hook |
|---|---|---|---|---|
| EN | welcome | greeting, nav-cards, + notes | — (`en.welcome.header` ohne `tutorial`) | — |
| EN | overview | ks-h, scatterplot, ks-l, + 3 Abschlusskarten | ✓ | — |
| EN | class | lollipop, class-table, filter, modal, + 3 | ✓ | `customizeTourSteps` |
| EN | item | lollipop, item-table, item-details, + 3 | ✓ | — |
| EN | student | student-row, student-item-table, spider-lollipop, item-details, + 3 | ✓ | — |
| MA | class | competence-distribution, class-table, + 3 | — | — |
| MA | item | item-graph, item-table, + 3 | — | — |
| MA | student | student-item-table, item-donuts, + 3 | — | — |
| SL | comparison | results, + 3 | — | — |

Für eine weitere View genügt es, die Texte zu schreiben und `showInfoButton` zu setzen; am
Builder ist nichts zu ändern.

## Verworfene Ansätze

Kurz notiert, damit sie nicht erneut vorgeschlagen werden:

- **Benannte Anker-Registry je View (`getTutorialAnchors()`).** Schreibt von Hand ab, was der
  Modulbaum schon weiß, und driftet beim ersten Umsortieren.
- **Vollständig deklarative Schrittbeschreibungen je View.** Derselbe Einwand; übrig blieb
  davon der schmale `customizeTourSteps`-Hook.
- **Ein Vokabular aus `required` / `missing: 'center' | 'skip'`.** Löst ein Problem, das die
  Ableitung nicht hat: kein `getAnchor` heißt „bewusst zentriert", ein `null` heißt
  „verloren" und warnt.

## Tests

`tests/e2e/tour.spec.js` prüft je View die exakte Titelfolge, nicht bloß „eine Tour öffnet
sich". Weil die Schritte abgeleitet sind, benennt kein View-Code sie — ein Modul, das sich
still nicht mehr registriert oder seinen `glossaryKey` verliert, verschwände sonst unbemerkt
aus der Tour. Der Spec prüft außerdem, dass keine Anker-Warnungen auftreten.
