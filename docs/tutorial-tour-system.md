# Rundgang (Tutorial-Tour)

## Überblick

Der Header-Button „Rundgang starten" führt Schritt für Schritt durch die aktive View: der
Bildschirm dimmt ab, ein Leuchtring umschließt jeweils ein Element, daneben steht eine Karte
mit Erklärtext und den Schaltflächen Zurück / Überspringen / Weiter (auf dem letzten Schritt
„Fertig").

Die Schritte werden **abgeleitet, nicht pro View geschrieben.** `buildTourSteps()` läuft den
registrierten Modulbaum der View ab und erzeugt einen Schritt für jedes Modul, dessen
Glossareintrag ein nicht-leeres `tutorial` besitzt. Daraus folgt:

- Ein Schritt entsteht in dem Moment, in dem ein Glossareintrag Tutorial-Text bekommt — ohne
  jede Codeänderung.
- Ein nur bedingt registriertes Modul (etwa das Spider-Chart der Schüler:innen-View) liefert
  einfach keinen Schritt, statt einen toten Anker zu hinterlassen.

## Dateien

| Datei | Rolle |
|---|---|
| `src/common/modules/tutorial/tourStepBuilder.js` | `buildTourSteps()` — Header-Schritt, abgeleitete Modulschritte, Extras der View, gemeinsame Abschlusskarten |
| `src/common/modules/tutorial/glossaryTutorial.js` | `tourStep()` — baut jede Karte aus ihrem Glossareintrag; die einzige Stelle, an der `tutorial` annotiert und Token-ersetzt wird |
| `src/common/modules/tutorial/tutorialController.js` | Die Engine: Leuchtring, Karte, Fortschrittspunkte, Positionierung (Floating UI), Schließen |
| `src/common/app/appModule.js` | Abschnitt `GUIDED WALKTHROUGH`: `#handleInfoClicked()` leitet ab und startet; `TutorialController.close()` beendet |
| `src/common/modules/baseViewModule.js` | `tourExtras` — die einzige View-seitige Angabe |
| `src/common/modules/tutorial/tutorialController.css` | `.tutorial-tour-*`; für alle drei Dashboards dieselbe Hülle |
| `src/{en,ma,sl}/**/*.glossary.json` | `tutorial` je Modul, neben dem Modul, dem es gehört |
| `src/common/app/shellGlossary.json` | `general.tour.{hover,export,notes}-help` — die Abschlusskarten aller drei Dashboards |
| `tests/e2e/tour.spec.js` | pinnt die Schrittfolge je View mit Tour |

## Woher der Text kommt

Ausschließlich aus dem Glossar. Ein Modul mit Glossareintrag bezieht seine Texte von dort und
nirgends sonst — das prüft oxlint (Regel `tba3/glossary-copy-ownership`, `config/oxlintPlugin.mjs`).

- **Kartentext:** das Feld `tutorial` des Eintrags. Fehlt es, gibt es keinen Schritt.
- **Kartenüberschrift:** `title`.
- **Wo der Eintrag liegt:** Modul-Fragmente stehen als `<owner>.glossary.json` neben ihrem
  Modul und werden vom App-Barrel (`src/{en,ma,sl}/{en,ma,sl}Glossary.js`) über
  `packages/modules/src/common/glossary/glossaryAssembly.js` an ihren Punktpfad montiert. Geteiltes Vokabular
  bleibt in `packages/modules/src/common/glossary/glossary.json`, die Abschlusskarten stehen mit der
  übrigen Shell-Copy in `src/common/app/shellGlossary.json`. Zwei Fragmente, die denselben
  Pfad beanspruchen, lassen den Zusammenbau absichtlich scheitern.
- **Glossar-Popups in der Karte funktionieren:** `tourStep()` schickt den Text
  durch `glossaryAnnotator.annotateHTML()`, und ein Popup ist ein Popover, das nach dem
  Overlay geöffnet wird — der Top Layer stapelt es darüber.

Ein Modul kann zusätzlich die Option `glossaryReplacements` setzen; dann werden `{{token}}`
im Titel über `applyTemplateTokens()` und im Tutorial-Text, der Markup ist, über
`applyMarkupTokens()` mit escapten Werten ersetzt (`packages/module-base/src/glossary/glossaryText.js`); ein
Wert aus Textläufen (`[{text, glossaryKey?}]`, etwa eine Domäne) setzt jeden Lauf mit Schlüssel als
Begriff seines Eintrags ein. Das ist
eine simple Wort-für-Wert-Ersetzung und hat **nichts** mit den SL-Infobox-Platzhaltern zu tun
(siehe [sl-info-box-placeholders.md](../packages/modules/docs/sl-info-box-placeholders.md)), auch wenn beide `{{…}}`
schreiben.

## Wie die Schrittfolge entsteht

```
Header-Schritt  →  Module mit Tutorial-Text, in Dokumentreihenfolge  →  tourExtras  →  Abschlusskarten
```

1. **Header** — aus dem `headerGlossaryPath` des `viewConfig`-Eintrags der View (meist `<app>.<view>.header`),
   verankert an `.header-module`. Fehlt dort `tutorial`, entfällt die Karte. Die Header-Tokens
   der App (`headerTokens`, z. B. `{{Fach}}`) füllt der Schritt wie der Header selbst.
2. **Module** — Tiefensuche über `view.descendants()`; ein Schritt je Karte, deren
   `glossaryKey` auf einen Eintrag mit `tutorial` zeigt. Der Anker wird als Funktion
   gespeichert, die über das **Modul** schließt, nicht über sein Element — so überlebt er
   Tabulator-Neuaufbauten und Chart-Redraws. Karten mit demselben Eintrag *und* denselben
   `glossaryReplacements` sind ein Inhalt in zwei Layout-Modi (MA: Split- und
   Nur-Chart-Raster) und erhalten einen Schritt, verankert an der sichtbaren; ein Eintrag,
   den mehrere Karten mit verschiedenen Werten füllen (EN: eine Verteilung je Domäne), gibt
   je Karte einen Schritt.
3. **Reihenfolge** — die Dokumentreihenfolge, in der `descendants()` die Karten liefert,
   also die Leserichtung.
4. **Extras der View** — `view.tourExtras`, siehe unten; sie folgen den abgeleiteten
   Schritten und stehen vor den Abschlusskarten.
5. **Abschlusskarten** — `general.tour.{hover,export,notes}-help`, für alle Dashboards gleich. Jede wird
   weggelassen, wenn ihr Anker auf dieser View nicht existiert: die Willkommens-View hat
   keine Tabelle und keinen Export-Button, dort entfallen also zwei der drei Karten.

## Eine Tour für eine View ändern

| Ziel | Vorgehen |
|---|---|
| Schritt hinzufügen oder entfernen | `tutorial` im Glossarfragment des Moduls anlegen bzw. entfernen. Kein Code. |
| Text oder Überschrift ändern | Nur der Glossareintrag (`tutorial`, `title`). |
| Reihenfolge ändern | Das DOM ändern. Die Tour folgt der Leserichtung; sie ist nirgends als Liste hinterlegt. |
| Button ein-/ausblenden | `tour: true` im `viewConfig`-Eintrag der View (`VIEWS` in `src/{en,ma,sl}/*AppModule.js`). |

Regel für `tour`: an, sobald mindestens ein Eintrag im Modulbaum der View
`tutorial`-Text trägt; sonst aus. Eine View ohne eigene Texte bekäme sonst nur die
Abschlusskarten, deren Anker es auf ihr gibt — eine Tour aus zwei, drei allgemeinen Karten.

## Eigene Schritte ergänzen: `tourExtras`

Die Angabe ist für genau die Schritte gedacht, die der Modulbaum **nicht** deklarieren kann:

- Der Anker gehört keinem Modul (eine Schaltfläche in einer Toolbar).
- Das beschriebene Element existiert während der Tour gar nicht (ein geschlossener Dialog).

Alles andere gehört ins Glossar, nicht hierher. Beispiel mit beiden Fällen:

```js
get tourExtras() {
    return [
        {
            glossaryPath: 'en.group.filter',
            getAnchor: () =>
                this.#groupTableModule?.querySelector(SCATTER_SEARCH_BUTTON_SELECTOR) ?? null,
        },
        // Ohne `getAnchor`: bewusst zentriert, kein verlorener Anker.
        { glossaryPath: 'en.group.scatterplot' },
    ];
}
```

Zu beachten:

- **Text auch hier aus dem Glossar.** Die View nennt nur den Pfad; der Builder baut die
  Karte mit `tourStep()`. Die `glossaryPath:`-Literale prüft `tools/check-structure.mjs`
  als Glossarpfade.
- **Anker-Konvention.** Kein `getAnchor` = absichtlich zentrierte Karte, bleibt still. Ein
  `getAnchor`, das `null` liefert = verlorener Anker; der Controller warnt einmal beim
  Betreten des Schritts, nicht bei jedem Scroll- oder Resize-Frame.

## Wann keine Tour startet

`#handleInfoClicked()` verweigert den Start, solange `ViewLifecycle.isSettled(view)` nein
sagt — während eines View-Wechsels und solange die View noch verdeckt rendert —, statt einen
unvollständigen oder unsichtbaren Rundgang zu zeigen; dann erscheint der Hinweis
`general.messages.tour-busy`, und der Header-Button bleibt ungedrückt. Eine leere
Schrittliste startet ebenfalls nichts.

Eine Tour endet beim erneuten Klick auf den Button, vor jedem View-Wechsel (die Anker einer
Tour gehören zu der View, aus der sie abgeleitet wurde) und mit der App: das Overlay hängt an `document.body`, und
Floating UIs `autoUpdate` beobachtet Scrollen und Größe der Seite — beides liegt außerhalb
des Modulbaums und würde die App sonst überleben.

## Barrierefreiheit

Die Karte ist ein `role="dialog"`, benannt durch ihre Überschrift. Ein für Screenreader
gedachter Text „Schritt n von m" (`general.messages.tour-progress`) steht in der Karte; die
Punkte sind seine sichtbare Form. Beim Start bekommt „Weiter" den Fokus, beim Schließen geht
er an das Element zurück, das ihn vorher hatte. Das Scrollen zum Anker ist sanft, außer bei
`prefers-reduced-motion`.

## Stand je Dashboard

Ob eine View eine Tour hat, ist eine Inhalts-, keine Codefrage.

- **EN** — alle fünf Views; als einziger Namespace mit Headerkarten (`tutorial` am
  `header`-Eintrag der View).
- **MA** — Lerngruppen-, Aufgaben- und Schüler:innen-View. Die Texte sind Entwürfe und
  warten auf redaktionelle Prüfung. Übersicht und Willkommen haben noch keine Texte.
- **SL** — nur die Vergleichs-View (`sl.comparison.results`).

Die exakte Schrittfolge je View steht in `TOURS` in `tests/e2e/tour.spec.js`.

Für eine weitere View genügt es, die Texte zu schreiben und `tour: true` zu setzen; am
Builder ist nichts zu ändern.

## Tests

`tests/e2e/tour.spec.js` prüft je View die exakte Titelfolge, nicht bloß „eine Tour öffnet
sich". Weil die Schritte abgeleitet sind, benennt kein View-Code sie — ein Modul, das sich
still nicht mehr registriert oder seinen `glossaryKey` verliert, verschwände sonst unbemerkt
aus der Tour. Der Spec prüft außerdem, dass keine Anker-Warnungen auftreten.
