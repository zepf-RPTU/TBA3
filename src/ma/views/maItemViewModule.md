# MaItemViewModule

## Zweck
Die Aufgaben-View der Mathe-3-Klasse: links die Aufgabentabelle mit einem einklappbaren Lösungsquoten-Lollipop darüber, rechts das Aufgabenring-Raster je Leitidee. Im Modus `chart-only` weicht beides einem großen Raster mit Leitidee-Auswahl und dem Fokus-Chart der gewählten Leitidee; im Modus `table-only` bleibt nur die linke Spalte, in der dann auch der Lollipop sichtbar wird.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - [MaLayoutViewBase](maLayoutViewBase.md)
      - **MaItemViewModule**

## Kinder
Alle drei Kinder werden einmal konstruiert; der Layout-Modus ändert nur, welche Container sichtbar sind und welche zusätzlichen Hosts `MaLayoutViewBase` mountet.

| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Aufgabentabelle | `MaItemTableModule` | [maItemTableModule.md](../../../packages/modules/src/ma/modules/tables/maItemTableModule.md) | `showModuleTitle: true`, `onItemPreview` (→ `itemPreviewOverlay`); hydriert erst, wenn der Container Breite hat (sonst `waitForStableElementBox`, höchstens 10 Frames) |
| Lösungsquoten-Lollipop | `ChartHostModule` + `itemSuccessLollipopConfig` | [itemSuccessLollipopConfig.md](../../../packages/modules/src/ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopConfig.md) | `averages` aus den Vergleichsmittelwerten des Payloads |
| Aufgabenringe (Modus `both`) | `ChartHostModule` + `taskRingGridConfig` | [taskRingGridConfig.md](../../../packages/modules/src/ma/modules/charts/taskRing/taskRingGridConfig.md) | Payload `{ itemArray, studentArray, domains, selectedStudents: null }` |
| Chart-only-Raster und Fokus-Chart | siehe `MaLayoutViewBase` | [maLayoutViewBase.md](maLayoutViewBase.md#kinder) | Raster ohne Schüler:innen-Auswahl (`selectedStudents: []`); Fokus-Chart für alle Schüler:innen |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `items` | – | Aufgabentabelle, Lösungsquoten-Lollipop, Aufgabenringe und Fokus-Chart (die Klassenzeilen, in `ITEM_RECORDS`; die Leitideen in `DOMAINS`) |
| `items` | `comparison=school-average,state-average` | Lösungsquoten-Lollipop (die Vergleichszeilen, als Option `averages`) |
| `aggregations` | `type=items`, `aggregation=result` | Aufgabentabelle (Richtig / Falsch / Unbearbeitet in `ITEM_RECORDS`) |
| `competence-levels` | `type=students` | Aufgabenringe und Fokus-Chart (die Klassengröße: Zahl der Zeilen in `STUDENT_RECORDS`) |

Payload: `_renderView` liest aus dem App-Payload `getData()` `itemArray`, `studentArray`, `schoolAverages`, `stateAverages` und `otherAverages`; die Leitideen liefert `getMaDomains(dataStore)`. Die Tabelle erhält `{ itemsData }` (aus `itemArray`), das Lollipop `{ itemArray }` und beim Bau `averages`: je Vergleichsgruppe `id`, `name`, `label`, Rollenfarbe, `typeIndex`, Symbol und einen `generator`, der die Prozentwerte über `iqbId` zuordnet (ein fehlender Wert wird einmal je Gruppe und Aufgabe gewarnt, der Marker entfällt). Die Ringe erhalten `{ itemArray, studentArray, domains, selectedStudents: null }`; das Chart-only-Raster baut `MaLayoutViewBase` mit `selectedStudents: []`, das Fokus-Chart ohne Argumente (`selectedStudents: null`). Die Ergebnisse je Person (`aggregations`, `type=students`) stecken in `ITEM_RECORDS`, erreichen hier aber kein Kind: ohne Schüler:innen-Auswahl zeichnen die Ringe nur Klassenwerte. Alle drei Kinder werden gemountet und parallel hydriert, die Tabelle erst, wenn ihr Container Breite hat.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `comparisonState` (über `observeActiveComparisons`) | Ø-Dropdown im Chart-Kopf des Lollipops (`comparisonModeControl`) | Lollipop `setActiveModes(activeModes)` |

`layoutMode` und `chartOnlyDomainId` beobachtet die Basis, siehe [maLayoutViewBase.md](maLayoutViewBase.md#zustand).

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Chart-only-Raster `onDomainSelected(domainId)` | `MaLayoutViewBase` → `appState.updateState({ chartOnlyDomainId })` |

## Optionen
Keine eigenen; `focusGlossaryKey` bleibt ungesetzt.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_getLayoutConfig()` | Override | `{ focusChartContainerId: 'ma-item-focus', contentContainerSelector: '.item-view-content' }` |
| `_renderView()` | Override | Split-View-Gerüst bauen, Beobachter anmelden, drei Kinder konstruieren, mounten und parallel hydrieren |
| `_onChartOnlyModeEntered()` | Override | Chart-only-Raster (`ma-item-taskRing-chartOnly`) und Fokus-Chart aufbauen, dabei `_chartOnlyInitializing` setzen |
| `_getLayoutTableModule()` | Override | Aufgabentabelle, sobald Tabulator sie gebaut hat |
