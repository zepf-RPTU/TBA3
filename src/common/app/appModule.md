# BaseAppModule

## Zweck
Koordinator eines Dashboards, von `EnAppModule`, `MaAppModule` und `SlAppModule` beerbt. Besitzt den `AppState`, den `DataStore`, die View-Container mit lazy geladenen View-Modulen und dem View-Wechsel (`ViewLifecycle`), das Hash-Routing (`ViewRouter`), den gemeinsamen Header (`HeaderOrchestrator` mit `HeaderModule`), die Sidebar (`SidebarModule`), die Notizen (`NotesController`), die Tour (`TutorialController`), die Sammelexport-Leiste sowie Tooltip- und Glossardienste. Die Unterklasse liefert Konfiguration, Anfangszustand, Header-Configs und Hooks; sie rendert selbst nichts außer App-Chrome.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../modules/baseViewModule.md)
    - **BaseAppModule**
      - [EnAppModule](../../en/enAppModule.md)
      - [MaAppModule](../../ma/maAppModule.md)
      - [SlAppModule](../../sl/slAppModule.md)

## Views
Keine eigenen; die Unterklasse übergibt sie in `configure(CONFIG)` als `viewConfig`-Map. Ihre Schlüsselreihenfolge ist die einzige Definition der View-Reihenfolge (Sidebar, Router, Nav-Karten). Ein Eintrag:

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `containerId`, `buttonId` | ja | Id des View-Containers und des Sidebar-Buttons |
| `icon` | ja | Material-Symbols-Name |
| `load` | ja | `() => import(...).then(m => m.Klasse)`; im Konstruktor auf Funktion geprüft, damit ein Tippfehler nicht erst beim Navigieren auffällt |
| `navigationGlossaryPath` | ja | Glossareintrag, dessen `title` der Name der View ist; `configure()` löst ihn in `label` auf, das Sidebar, Notizen, Berichtskarten und die MA-Hilfe lesen (fehlt der Titel: Marker `MISSING_GLOSSARY_TITLE`) |
| `sidebarPinBottom` | nein | Diesen Button ans Sidebar-Ende pinnen |
| `skeleton` | nein | Platzhalterform (`stack` Standard, `rows`, `split`, `triple`, `grid`) |

`initializeView(viewType, container)` lädt die Klasse, baut sie mit `getViewModuleOptions(viewType)` + `skeleton`, ruft `init(getData())` und registriert sie als Kind; ein Fehler zerstört die halbe Instanz und wirft weiter (Kaltstart: Fehlerpanel des Bootstraps, sonst Rollback auf die vorige View). Das Modul der Startview wird vor dem Daten-Fetch vorgeladen, die übrigen nach der ersten Freigabe (`prefetchOtherViewModules`).

## Daten
Die Unterklasse deklariert ihre Anfragen in einer Acquisition-Spec und holt den Datensatz in `initializeComponents()`, bevor sie `super` ruft, damit der Header mit geladenen Daten rendert. `datasetAcquisition.js` lädt die Dokumente parallel (Quelle `folder` oder `scope`), registriert die Kompetenzstufen-Skalen und schreibt die Rohdokumente in den `DataStore`; was die Unterklasse daraus ableitet, legt sie per `setData` als App-Payload ab, und jede View bekommt ihn als `init(getData())`, den `DataStore` über ihre Optionen.

## Zustand
Der `AppState` wird in `configure()` aus `getInitialState()` gebaut. Basis-Schlüssel:

| Key | Schreibt | Liest |
|---|---|---|
| `currentView` | `ViewLifecycle` beim Wechsel | `ViewLifecycle` (`getCurrentView`), Tour, SL-Header-Control `viz-mode` (`getStateValue`); Router und Sidebar lesen ihn nicht, sie bekommen die aktive View über `onViewActivated` |
| `comparisonState` | Ø-Toggles (`seedComparisonState`, Header) | Views über `observeActiveComparisons` |

Alle weiteren Schlüssel (Modi, `currentStudentId`, `layoutMode`, …) definiert die Unterklasse in `getInitialState()`; Header-Controls schreiben sie über `updateState`, Views beobachten sie. Der `_buildHeaderControlContext(extras)` gibt den Control-Fabriken nur `getStateValue`/`updateState` plus App-Extras, damit `*HeaderControls.js` ohne App-Instanz testbar bleibt.

## Hooks
| Hook | Zweck |
|---|---|
| `configure(config)` | Pflicht im Konstruktor nach `super()`: `viewConfig`, `defaultView`, `sidebarConfig`, `headerContainerId` |
| `setViewHeaderConfigs(map)` | Pro View `{ glossaryPath, controls }` aus `build*ViewHeaderConfigs(ctx)` |
| `getInitialState()` | Anfangszustand (Basis: `{ currentView: null }`) |
| `getContainerClassPrefix()` | `'en'`, `'ma'`, `'sl'`: Klassenpräfix der Container und Glossar-Namespace |
| `getViewModuleOptions(viewType)` | Basis: `{ appState, comparisonState, glossaryData, onNavigate, dataStore, viewConfig }`; Unterklassen ergänzen View-spezifisches |
| `initializeComponents()` | Basis: Header, Sammelexport-Leiste, Tooltips/Glossar; Unterklasse lädt davor Daten, danach App-Chrome |
| `createHeaderElements()`, `createFooterElements()` | Elemente vor bzw. nach den View-Containern; Basis baut Sidebar und Header-Container |
| `beforeShowView(viewType, options)` | Vor dem Anzeigen: Basis schließt die Tour und aktualisiert den Header; aus `options` abgeleiteter Zustand gehört hierher, nicht in `showView` |
| `afterShowView(viewType, { previousView })` | Nach dem Anzeigen: Basis stellt den Notizen-Tab um |
| `showView(viewType, options?)`, `refreshThemeInCurrentView()`, `closeTour()` | Öffentliche Verben; Sidebar, Notizen, Nav-Karten und Views navigieren über `showView` |
| `getCurrentView()`, `getViewModule(v)`, `getViewContainer(v)`, `getHeaderModule()`, `getViewHeaderConfig(v?)`, `appState`, `dataStore` | Accessoren für Unterklassen |
| `destroy()` | Tour schließen, Sidebar und Router abbauen, dann Basis |
