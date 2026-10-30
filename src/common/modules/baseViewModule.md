# BaseViewModule

## Zweck
Basis aller Views (eine Seite eines Dashboards). Ergänzt `BaseModule` um das Render-Protokoll mit Abdeckung und Skeleton (abdecken → `_renderView` → aufdecken), die Beobachtung von App-State-Schlüsseln mit Suspend/Resume beim View-Wechsel, die Navigation (`navigate`, `_openStudent`), die Tour-Schritte und die Linkziele der Notizen. Die Schüler:innen-View der App (`viewKey` gleich `studentView`) einer Lerngruppe ohne Schüler:innen (`currentStudentId` beim Rendern `null`) rendert nicht, sondern zeigt nur `general.messages.no-students`: Die App wählt die Startperson, sobald die Daten da sind, und der Datensatz wechselt nur mit einem Neuladen. Eine View besitzt keine Kartenhülle und keinen eigenen Glossareintrag; sie baut ihr DOM selbst, erzeugt Kinder und verdrahtet sie. Das Element ist die View; seine Id ist die Container-Id `${appId}-${viewType}-container`.

## Kinder
Keine eigenen. Eine View erzeugt ihre Kinder in `_renderView()` mit `X.create(id, this._childOptions({...}))` bzw. `ChartHostModule.createChart(id, config, …)` (`viewKey`, `context`, `comparisonState` plus eigene Optionen; App-State-Signale und Navigations-Callbacks reicht die View als eigene Optionen) und setzt sie per lit-html (`render()`) ins eigene Template. Alle Kinder bestehen schon, bevor das Template sie verbindet, sodass ein Sync-Callback, den ein Kind in seinem ersten Inhaltsdurchlauf feuert, sein Geschwister erreicht. Der Modulbaum ist das DOM (`childModules`, `descendants()`); ein Kind, das aus dem DOM fällt, baut sich ab.

## Daten
Keine API-Daten. Auch kein Daten-Payload: die App setzt kein `data`, und jede Karte liest ihre Dokumente selbst aus dem `DocumentStore` (`context.documents`). Einem Kind reicht die View nur Identität und Auswahl (`studentId`, eine Domäne, einen Aufgabenpool) als Option oder reaktive Eigenschaft, nie Rohdaten. Die View darf den Store selbst lesen (`this.options.context.documents.get(name)` bzw. `getDataset(key)`), wo sie eine Auswahl erst bilden muss. Eine View wird pro Seitenaufruf einmal gebaut; ändert sich eine Auswahl später, setzt sie die reaktive Eigenschaft des Kinds oder ruft sein Verb gezielt auf.

## Zustand
Mechanismus, keine eigenen Schlüssel:

| Verb | Bedeutung |
|---|---|
| `watch(signal, handler)` | Folgt einem Signal, meist einem App-State-Schlüssel (`this.options.appState.vizMode`). Nur Änderungen: beim Registrieren ruft er den Handler nicht, den aktuellen Wert liest der Render selbst (`.value`). Ein Handler pro Signal; ein zweiter wirft. Aus `_renderView()` aufrufen. Solange die View verborgen ist, wird nur der letzte Wert je Signal gemerkt und beim nächsten `_onShow` in Reihenfolge der letzten Änderung geliefert; ohne Änderung, oder zurück auf den zuletzt gelieferten Wert, wird nichts geliefert. Der Handler läuft ungetrackt, seine eigenen Lesezugriffe abonnieren nichts; der Abbau (`_teardown()`) gibt den Effekt frei |
| `_onHide()`, `_onShow()` | Override: verborgen hält die View zurück, was sie beobachtet; `_onShow` liefert es nach, nach dem `_onShow` der Kinder, Handler dürfen `this.visible` prüfen. Eine Unterklasse, die einen der beiden überschreibt, ruft `super` |

`comparisonState` ist kein App-State-Schlüssel: die Chart-Hosts bekommen den Port über `_childOptions()` und folgen ihm selbst; eine View führt ihn unter Zustand nur, wenn sie selbst darauf reagiert (`watch`).

## Verdrahtung
Muster, keine eigenen Drähte: Geschwister-Sync innerhalb einer View ist direkte Verdrahtung beim Erzeugen. Das erzeugende Kind meldet über eine Callback-Option (`onDataSync`, `onStudentSelected`, `onLevelSelected`, …), die View verbindet sie mit dem Verb des Geschwisters (`applySync`, `setCompetenceLevelFilter`, `updateHighlight`, …). Ein `onStudentSelected`, das „öffnen“ bedeutet, landet auf `_openStudent(studentId)`.

## Optionen
Die View ist generisch über den State ihrer App: `@augments {BaseViewModule<EnState>}` typisiert `this.options.appState` (seine Schlüssel und deren Werte), und `watch` reicht dem Handler den Werttyp des Signals.

| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `appState` | `State<TState>` | – | ja | Geteilter App-State, ein Signal je Schlüssel, typisiert nach dem State der App (`EnState`, `MaState`, `SlState`) |
| `comparisonState` | `ComparisonState` | – | ja | Vergleichszustand als Port; `_childOptions()` reicht ihn an jedes Kind weiter |
| `onNavigate` | `(view, options) => void` | – | ja | Ziel von `navigate()`; die App verbindet es mit `showView` |
| `studentView` | `string` | – | nein | Die View, in der `_openStudent` eine Person öffnet (`students.view` der App); fehlt in einer App ohne Schüler:innen |
| `viewConfig` | `object` | – | ja | `viewConfig`-Map der App (Labels, Icons, Reihenfolge) |
| `context` | `AppContext` | – | ja | Kontext der App (`appContext.js`: `documents`, der `DocumentStore` mit Dokumenten und abgeleiteten Datensätzen; `glossaryData`, der assemblierte Glossarbaum; `runtime`, die Host-Dienste der Karten; dazu Glossar, Palette, App-Kennung, Export-Datensatz und -Warenkorb); `_childOptions()` reicht ihn an jedes Kind weiter |
| `skeleton` | `string` | `'stack'` | nein | Form des Platzhalters (`stack`, `rows`, `split`, `split-wide`, `triple`, `grid`), aus dem `viewConfig`-Eintrag der View |
| `viewKey` | `string` | – | nein | Schlüssel der View in der `viewConfig` der App; die App setzt ihn, `_childOptions()` reicht ihn an jedes Kind weiter |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderContent()` | final | Abdecken (Skeleton, `aria-busy`), `_renderView()` abwarten (die Schüler:innen-View ohne Person zeigt stattdessen den Hinweis), dann die `contentComplete` aller Kinder, freigeben, sobald der Teilbaum ruht (`whenSettled()`, mit Zeitgrenze), nach Layout und Mindestanzeigezeit; wirft ein Schritt, bleibt die View abgedeckt, Freigabe-Warter werden aufgelöst; nicht überschreiben |
| `_renderView()` | Override (abstrakt) | DOM bauen, Beobachter anmelden, Kinder erzeugen und ins Template setzen; läuft hinter der Abdeckung |
| `whenRevealed()` | Aufruf | Promise auf die Freigabe der View. Nur die neueste Abdeckung gibt frei: eine überholte (ein späterer Render, ein späteres `coverWhile`) überlässt das Aufdecken der neueren |
| `coverWhile(work)` | Aufruf | Die View abdecken, solange `work` einen Teil von ihr an Ort und Stelle neu baut (ein Layoutwechsel), und danach aufdecken wie ein Render: mit Skeleton und dessen Mindestanzeigezeit, sobald der Teilbaum ruht. Eine neuere Abdeckung überholt sie. Lehnt `work` ab, deckt sie trotzdem auf und gibt den Fehler weiter |
| `navigate(viewTarget, options?)` | Aufruf | `onNavigate` aufrufen |
| `_selectStudent(studentId)` | Helfer | `currentStudentId` schreiben, ohne zu navigieren (Auswahl innerhalb der Schüler:innen-View) |
| `_openStudent(studentId)` | Helfer | `currentStudentId` schreiben, dann zur Option `studentView` navigieren — in der Schüler:innen-View selbst (`viewKey` gleich `studentView`) nur schreiben; wirft in einer App ohne sie |
| `tourExtras` | Getter, Override | Tour-Schritte, die kein Modul deklariert (`{glossaryPath, getAnchor?}`); Standard `[]` |
| `getNotesLinkTargets()` | Override | Standard: jedes Kind, das eine `ContentModule` mit `showModuleTitle` ist, beschriftet mit `cardTitle`; eine Karte mit fehlendem Glossartext fällt weg |
| `_teardown()` | Override | Den Skeleton, den die View hielt, entfernen, Abdeckungsattribute löschen, Freigabe-Warter auflösen, Beobachter leeren, dann Basis |
