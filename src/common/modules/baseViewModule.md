# BaseViewModule

## Zweck
Basis aller Views (eine Seite eines Dashboards) und über `BaseAppModule` auch der App-Module. Ergänzt `BaseModule` um das Render-Protokoll mit Abdeckung und Skeleton (`beginViewRender` → `_renderView` → `revealView`), die Beobachtung von App-State-Schlüsseln mit Suspend/Resume beim View-Wechsel, das gemeinsame Registrieren-Mounten-Hydrieren der Kinder (`_hydrateChildren`), die Navigation (`navigate`, `_openStudent`), die Tour-Schritte und die Linkziele der Notizen. Eine View besitzt keine Kartenhülle und keinen eigenen Glossareintrag; sie baut ihr DOM selbst, konstruiert Kinder und verdrahtet sie.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - **BaseViewModule**
    - [BaseAppModule](../app/appModule.md)
    - [EnClassViewModule](../../en/views/enClassViewModule.md)
    - [EnItemViewModule](../../en/views/enItemViewModule.md)
    - [EnOverviewViewModule](../../en/views/enOverviewViewModule.md)
    - [EnStudentViewModule](../../en/views/enStudentViewModule.md)
    - [MaClassViewModule](../../ma/views/maClassViewModule.md)
    - [MaHelpViewModule](../../ma/views/maHelpViewModule.md)
    - [MaLayoutViewBase](../../ma/views/maLayoutViewBase.md)
    - [MaOverviewViewModule](../../ma/views/maOverviewViewModule.md)
    - [ReportViewModule](../views/report/reportViewModule.md)
    - [SlComparisonViewModule](../../sl/views/slComparisonViewModule.md)
    - [SlLongitudinalViewModule](../../sl/views/slLongitudinalViewModule.md)
    - [SlMaterialViewModule](../../sl/views/slMaterialViewModule.md)
    - [SlOverviewViewModule](../../sl/views/slOverviewViewModule.md)
    - [SlSummaryViewModule](../../sl/views/slSummaryViewModule.md)
    - [SlWelcomeViewModule](../../sl/views/slWelcomeViewModule.md)
    - [WelcomeSplashViewModule](../views/welcomeSplashViewModule.md)

## Kinder
Keine eigenen. Eine View konstruiert ihre Kinder in `_renderView()` mit `...this._childOptions()` (App-State, `onNavigate`, `dataStore`, `glossaryData`) plus eigenen Optionen und meldet sie mit `registerChildModule(child)` an, damit `destroy()` kaskadiert. `_hydrateChildren([[kind, payload?], …])` registriert und mountet erst alle Einträge und hydriert sie dann gemeinsam, sodass ein Sync-Callback, den ein Kind beim Hydrieren feuert, sein Geschwister schon erreicht. Ein Kind, das nur nach dem Hydrieren eines anderen leben darf, bekommt einen zweiten Aufruf.

## Daten
Keine API-Daten. Den App-Payload bekommt die View über `init(appData)`, Rohdokumente liest die Unterklasse aus dem `DataStore` (`getOption('dataStore').getRawData(key)` bzw. `getDataset(key)`); daraus formt sie je Kind den Payload, einmalig beim Hydrieren. Eine View wird pro Seitenaufruf einmal gebaut und nie erneut mit Daten versorgt; wo ein Kind später neue Daten braucht, ruft die View dessen `update(...)` gezielt auf.

## Zustand
Mechanismus, keine eigenen Schlüssel:

| Verb | Bedeutung |
|---|---|
| `observeState(key, handler)` | Ein Beobachter pro Schlüssel (ein zweiter ersetzt den ersten mit Warnung). Aus `_renderView()` aufrufen, nie im Konstruktor. Während `suspend()` wird nur der letzte Wert je Schlüssel gemerkt und bei `resume()` in Reihenfolge der letzten Änderung geliefert; ohne Änderung wird nichts geliefert |
| `observeActiveComparisons(handler)` | Belegt den Schlüssel `comparisonState` und liefert `comparisonState.getActiveModes()`, das Argument für `setActiveModes` jedes Mittelwert-Charts |
| `suspend()`, `resume()`, `isSuspended` | Werden von `ViewLifecycle` beim View-Wechsel gerufen; `resume()` läuft nach `show()`, Handler dürfen `this.visible` prüfen |
| `onResume()` | Hook für Resume-Arbeit, die kein beobachteter Schlüssel ist (eigener Service-Listener, Statuszeile); nie beim ersten Anzeigen |

Modus-Zustand und die gewählte Schüler:in sind App-State: ein Header-Control oder eine klickende View schreibt den Schlüssel, die Views, die ihn rendern, beobachten ihn und rufen schlichte Verben der Kinder.

## Verdrahtung
Muster, keine eigenen Drähte: Geschwister-Sync innerhalb einer View ist direkte Verdrahtung im Konstruktionsschritt. Das erzeugende Kind meldet über eine Callback-Option (`onDataSync`, `onStudentSelected`, `onLevelSelected`, …), die View verbindet sie mit dem Verb des Geschwisters (`applySync`, `setKsLevelFilter`, `setState`, …). Ein `onStudentSelected`, das „öffnen“ bedeutet, landet auf `_openStudent(studentId)`. Es gibt keinen Event-Bus.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `appState` | `AppState` | – | ja für `observeState` | Geteilter App-State; ohne `observe`-Funktion warnt `observeState` und liefert `null` |
| `comparisonState` | `ComparisonState` | – | nein | Vergleichszustand als Port; `_childOptions()` reicht ihn an jedes Kind weiter |
| `onNavigate` | `(view, options) => void` | – | nein | Ziel von `navigate()`; die App verbindet es mit `showView` |
| `dataStore` | `DataStore` | – | nein | Rohdaten und abgeleitete Datensätze |
| `glossaryData` | `object` | – | nein | Assemblierter Glossarbaum, an Kinder durchgereicht |
| `viewConfig` | `object` | – | nein | `viewConfig`-Map der App (Labels, Icons, Reihenfolge) |
| `skeleton` | `string` | `'stack'` | nein | Form des Platzhalters (`stack`, `rows`, `split`, `triple`, `grid`), aus dem `viewConfig`-Eintrag der View |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_doRender(data)` | final | Abdecken, `_renderView(data)` abwarten, freigeben; nicht überschreiben |
| `_renderView(data)` | Override (abstrakt) | DOM bauen, Beobachter anmelden, Kinder konstruieren und hydrieren; läuft hinter der Abdeckung |
| `beginViewRender()`, `revealView()`, `whenRevealed()` | Aufruf | Abdeckung setzen (`data-view-rendering`, `aria-busy`, Skeleton), nach `whenSubtreeSettled` + Layout + Mindestanzeigezeit freigeben; Promise auf die Freigabe. Ein überholter Render gibt nicht frei |
| `_hydrateChildren(entries)` | Helfer | Siehe Kinder |
| `getContainer(id, name)` | Helfer | `document.getElementById` mit Warnung bei Fehlen |
| `navigate(viewTarget, options?)` | Aufruf | `onNavigate` aufrufen |
| `_openStudent(studentId)` | Helfer | `currentStudentId` schreiben, dann `navigate('student')` |
| `customizeTourSteps(steps)` | Override | Aus dem Modulbaum abgeleitete Tour-Schritte anpassen; Standard unverändert |
| `getNotesLinkTargets()` | Override | Standard: jedes Kind mit `showModuleTitle`, beschriftet mit seinem sichtbaren Titel |
| `destroy()` | Aufruf | Abdeckung und Skeleton entfernen, Freigabe-Warter auflösen, Beobachter leeren, dann Basis |
| `isSuspended` | Getter | Suspend-Zustand |
