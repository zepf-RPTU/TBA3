# MaLayoutViewBase

## Zweck
Zwischenbasis der beiden MA-Views mit Layout-Umschaltung (`item`, `student`): eine Tabelle links, das Aufgabenring-Raster rechts, und auf Wunsch nur eines von beiden. Die Basis besitzt die drei Layout-Modi `both` / `table-only` / `chart-only` (`LAYOUT_MODES` aus `maConstants.js`), das Split-View-Gerüst mit dem Chart-only-Panel, das Chart-only-Raster mit Leitidee-Auswahl und den Fokus-Chart, der eine Leitidee groß zeigt. Die Unterklasse steuert nur ihre linke Spalte, ihre Container-Ids und welche Schüler:innen der Fokus-Chart markiert.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **MaLayoutViewBase**
      - [MaItemViewModule](maItemViewModule.md)
      - [MaStudentViewModule](maStudentViewModule.md)

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Chart-only-Raster (`_taskRingChartOnlyModule`) | `ChartHostModule` + `taskRingGridConfig` | [taskRingGridConfig.md](../../../packages/modules/src/ma/modules/charts/taskRing/taskRingGridConfig.md) | `enableDomainSelection: true`, `onDomainSelected` → App-State; gemountet über `remountChartHost` mit `updateTaskRingHostIfReusable` als Reuse-Probe |
| Fokus-Chart (`_focusChartInstances`, eine Instanz je fokussierter Leitidee) | `ChartHostModule` + `taskRingFocusConfig` | [taskRingFocusConfig.md](../../../packages/modules/src/ma/modules/charts/taskRing/taskRingFocusConfig.md) | `glossaryKey` aus `focusGlossaryKey`, falls gesetzt; Reuse-Probe: ein lebender Host nimmt jede Leitidee per `update` |

Beide leben nur im Modus `chart-only` und werden über `remountChartHost` in Platz getauscht; monotone Request-Tokens (`_chartOnlyRequestId`, `_focusChartRequestId`) lassen einen überholten Tausch abbrechen, statt einen Host zu mounten, den die View schon verlassen hat. Die Kinder der Modi `both` / `table-only` (Tabelle, Split-View-Raster) konstruiert die Unterklasse.

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `items` | – | Chart-only-Raster und Fokus-Chart (die Klassenzeilen, in `ITEM_RECORDS`; die Leitideen in `DOMAINS`) |
| `competence-levels` | `type=students` | Chart-only-Raster und Fokus-Chart (`STUDENT_RECORDS`: die Klassengröße, mit Auswahl der Name im Tooltip) |
| `aggregations` | `type=students` | Chart-only-Raster und Fokus-Chart, nur mit Schüler:innen-Auswahl (Ergebnisse je Person in `ITEM_RECORDS`) |

Payload: aus dem App-Payload `getData()` werden `itemArray` und `studentArray` gelesen, die Leitideen liefert `getMaDomains(dataStore)`. Das Chart-only-Raster erhält `{ itemArray, studentArray, domains, selectedStudents, selectedDomain }` (`selectedDomain` aus `chartOnlyDomainId`, damit ein später gebautes Raster die Leitidee der anderen Layout-View übernimmt), der Fokus-Chart `{ domainItems, studentArray, domain, selectedStudents }` mit den nach `domain` gefilterten Aufgaben; ohne explizite Leitidee gilt die im Raster gewählte, ohne Raster die, die es wählen würde (`resolveDefaultDomain`). Die Auswahl `selectedStudents` gibt die Unterklasse vor. Ohne Leitideen zeigt der Fokus-Container den Leerzustand `Keine Leitideen verfügbar`.

## Zustand
Angemeldet in `_setupLayoutEventListeners()`, das die Unterklasse aus ihrem Event-Setup ruft:

| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `layoutMode` | Layout-Umschalter im Header (`maHeaderControls.js`), `MaAppModule.beforeShowView` aus `options.viewMode` (Nav-Karten) | `_updateLayoutMode(mode)`; zusätzlich gleicht `show()` den Modus ab, falls er sich im Verborgenen geändert hat |
| `chartOnlyDomainId` | Ring-Klick im Chart-only-Raster dieser oder der anderen Layout-View (`#onDomainSelected`) | Raster `selectDomain(id)`, dann `_onDomainSelectedInChartOnly(domain)` für den Fokus-Chart; ignoriert außerhalb von `chart-only` und während `_chartOnlyInitializing` |

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Chart-only-Raster `onDomainSelected(domainId)` | `appState.updateState({ chartOnlyDomainId })` – nur schreiben, der eigene Beobachter rendert; ein geseedetes Raster meldet den Seed zurück, den `updateState` als unverändert verwirft |

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `focusGlossaryKey` | `string` | – | nein | `glossaryKey` des Fokus-Chart-Hosts anstelle des Config-Standards |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_getLayoutConfig()` | Override (abstrakt) | `{ focusChartContainerId, contentContainerSelector }` der Unterklasse |
| `_getContentContainerSelector()` | Override | Selektor des Elements, das die Modusklasse trägt; Standard aus `_getLayoutConfig()`, sonst `.view-content` |
| `_renderTaskRingSplitView({ viewClassName, contentClassName, leftSectionClassName, leftSectionChildren, chartContainerId, chartOnlyContainerId, focusChartContainerId, chartOnlyContainerClassName, outerWrapperClassName?, topChildren? })` | Helfer | Split-View-Gerüst bauen: linke Spalte, rechter Chart-Platzhalter, Chart-only-Panel mit Raster- und Fokus-Platzhalter; startet mit `layout-mode-both` |
| `_setupLayoutEventListeners()` | Helfer | Beobachter für `layoutMode` und `chartOnlyDomainId` anmelden (siehe Zustand) |
| `_updateLayoutMode(mode)` | Helfer | Modusklasse tauschen, bei `chart-only` `_onChartOnlyModeEntered()`, Tabellenbreiten im nächsten Frame, Übergang per `_handleLayoutTransition` |
| `_handleLayoutTransition(mode, contentContainer)` | Override | Inhalt wieder sichtbar machen: `both` sofort plus `_refreshChildCharts`, `chart-only` nach Chart-Aufbau (Sicherheitsnetz 500 ms), sonst nach 50 ms |
| `_onChartOnlyModeEntered()` | Override (abstrakt) | Chart-only-Raster und Fokus-Chart aufbauen |
| `_onDomainSelectedInChartOnly(domain)` | Override (Hook) | Standard: `_createFocusChart(domain)` für alle Schüler:innen |
| `_getLayoutTableModule()` | Override (Hook) | Tabellenmodul der View, dessen Spalten dem Layoutmodus folgen; Standard: `null` |
| `_updateTableColumnWidths(mode)` | Helfer | Einmal pro Modus `redraw()` auf `_getLayoutTableModule()`, sobald dessen Container sichtbare Maße hat |
| `_createFocusChart(domain?, selectedStudents?)` | Helfer | Fokus-Host für die Leitidee mounten oder per `update` wiederverwenden |
| `_cleanupFocusCharts({ preserveHost? })` | Helfer | Fokus-Hosts zerstören und abmelden; mit `preserveHost` bleibt der Container leer an seiner Stelle |
| `_createTaskRingGridForChartOnly({ containerId, domains, selectedStudents? })` | Helfer | Chart-only-Raster mounten oder wiederverwenden, danach `_revealContentAfterChartCreation` |
| `_revealContentAfterChartCreation(delay?)` | Helfer | Inhalt nach Chart-Aufbau sichtbar schalten (Standard 180 ms) |
| `_refreshChildCharts()` | Helfer | `refreshCharts()` auf sichtbaren Fokus-, Chart-only- und sonstigen Chart-Kindern |
| `show()` | Override | Basis, dann `layoutMode` aus dem App-State abgleichen und die Charts nachzeichnen |
| `destroy()` | Override | Fokus-Hosts abbauen, dann Basis |
| `currentLayoutMode` | Getter | Aktueller Modus |
| `_currentLayoutMode`, `_lastTableWidthMode`, `_focusChartInstances`, `_chartOnlyInitializing`, `_taskRingChartOnlyModule` | Felder | Modus; Modus der letzten Breitenanpassung; Fokus-Hosts je Leitidee; Sperre gegen Doppelrender beim Chart-only-Aufbau; Chart-only-Raster |
