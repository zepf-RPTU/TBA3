# MaLayoutViewBase

## Zweck
Zwischenbasis einer MA-View mit Layout-Umschaltung: eine Tabelle links, das Aufgabenring-Raster rechts, und auf Wunsch nur eines von beiden. Die Basis besitzt die drei Layout-Modi `both` / `table-only` / `chart-only` (`LAYOUT_MODES` aus `maConstants.js`), das Split-View-Gerüst mit dem Chart-only-Panel, das Chart-only-Raster mit Ring-Auswahl und den Fokus-Chart, der einen Ring der gewählten Gruppierung groß zeigt. Die Basis gibt auch die Render-Reihenfolge vor; die Unterklasse nennt in einem Wert (`_splitView()`) ihren Gerüst-Präfix, ihre linke Spalte (und eine Kopfzeile) und die Person, die alle drei Ring-Hosts markieren.

## Design/Idee

Je nach Umfang der Tabelle sowie Auflösung des verwendeten Endgeräts kann die Seite überladen wirken. Neben der zweiseitigen Ansicht stehen daher einseitige Ansichten zur Verfügung, in denen jeweils nur die Tabelle oder aber die donut charts (samt Detailkasten) gezeigt werden. Über Schaltflächen in der Kopfzeile der Seite kann zwischen den Ansichten gewechselt werden.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Split-Raster (rechte Spalte des Split-Panels) | `ChartHostModule` + `itemRingGridConfig` | [itemRingGridConfig.md](../../../packages/modules/src/ma/modules/charts/itemRing/itemRingGridConfig.md) | `ringGrouping` (App-State `itemRingGrouping`), `student` aus `_splitView()` |
| Chart-only-Raster | `ChartHostModule` + `itemRingGridConfig` | [itemRingGridConfig.md](../../../packages/modules/src/ma/modules/charts/itemRing/itemRingGridConfig.md) | `onRingSelected` → App-State; `ringGrouping`, `student` wie das Split-Raster; `ringId` (App-State `chartOnlyRingId`) |
| Fokus-Chart (ein Host für jeden Ring nacheinander) | `ChartHostModule` + `itemRingFocusConfig` | [itemRingFocusConfig.md](../../../packages/modules/src/ma/modules/charts/itemRing/itemRingFocusConfig.md) | `ringGrouping`, `ringId`, `student` wie das Chart-only-Raster |

Alle drei werden mit dem Gerüst erzeugt; Chart-only-Raster und Fokus-Chart erst beim ersten Betreten von `chart-only` ins Chart-only-Panel gesetzt. Sie folgen ihren Signalen selbst, auch verborgen; die View reicht danach nichts nach. Das Split-Panel (Modi `both` / `table-only`) folgt derselben Regel. Der Modulbaum ist das DOM: Notizlinks und Tour sehen nur die Kinder eines schon gefüllten Panels und die Kopfzeile (`top`), die sofort steht.

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `items` | – | Chart-only-Raster und Fokus-Chart (die Lerngruppenzeilen, in `ITEM_RECORDS`; die Ringe je Gruppierung in `ITEM_RINGS`) |
| `competence-levels` | `type=students` | Chart-only-Raster und Fokus-Chart (`STUDENT_RECORDS`: die Lerngruppengröße, mit Auswahl der Name im Tooltip) |
| `aggregations` | `type=students` | Chart-only-Raster und Fokus-Chart, nur mit Schüler:innen-Auswahl (Ergebnisse je Person in `ITEM_RECORDS`) |

Payload: keiner. Die drei Ring-Hosts bekommen nur Signale als Optionen und lesen Aufgaben, Personen und Ringe selbst aus dem Store. Die View liest den Store nur, um bei einem Gruppierungswechsel den Ring zu prüfen (`ITEM_RINGS`, die Ringe der Gruppierung `itemRingGrouping`). Der Ring ist `chartOnlyRingId`; solange niemand einen Ring geklickt hat, ist der Key `null`, und Raster wie Fokus-Chart beider Views zeigen denselben Ring, den ersten mit Aufgaben (`resolveShownRing`, unabhängig von der Schüler:innen-Auswahl). Die markierte Person nennt die Unterklasse als `student` in `_splitView()`; ohne sie zeigen die Ringe die Lerngruppe.

## Zustand
Die Basis beobachtet zwei Keys; `chartOnlyRingId` und `currentStudentId` lesen die Ring-Hosts selbst:

| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `layoutMode` | Layout-Umschalter im Header, `statePatch` einer Navigation | Modusklasse umsetzen, Sichtbarkeit der Module auffrischen, das Panel des Modus füllen |
| `itemRingGrouping` | Gruppierungsmenü jedes Ringrasters der App | `chartOnlyRingId` auf `null`, wenn die neue Gruppierung den Ring nicht kennt; die Raster bauen sich selbst neu (`rebuildOn`), der Fokus-Chart folgt der Gruppierung selbst |

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Chart-only-Raster `onRingSelected(ringId)` | `appState.chartOnlyRingId.value = ringId` – nur schreiben, beide Chart-only-Hosts beider Views folgen dem Key |
| Fokus-Chart `onStudentSelected(studentId)` | `_openStudent(studentId)` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | `_splitView()` einmal lesen, das Gerüst im gespeicherten `layoutMode` rendern, die Beobachter anmelden und das Panel dieses Modus füllen, bevor die View erscheint |
| `_showCompetences()` | Geschützt | Signal für die Option `showCompetences` der Tabelle: wahr nur im Modus `table-only` |
| `_splitView()` | Abstrakt | Einmal gelesen: `{ prefix, left, top?, gridGlossaryKey?, student? }`. `prefix` benennt Wurzelklasse und Host-Ids der View; `left` sind die Module der linken Spalte (gesetzt beim ersten Füllen des Split-Panels, das auf ihr `contentComplete` wartet), `top` ein Modul darüber (sofort gesetzt); `gridGlossaryKey` wird `glossaryKey` beider Raster, `student` (ein Signal) die Person, die alle drei Ring-Hosts markieren |
