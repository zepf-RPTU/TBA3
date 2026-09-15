# ChartHostModule + selfEfficacyLongConfig

## Zweck
Der Entwicklungs-Chart der Selbstwirksamkeit in der SL-View „Entwicklung“: je Jahrgang der Anteil der Schüler:innen pro Antwortband (1 bis 5, gebucketet) als Parallelkoordinaten, wahlweise gestapelt. Im Boxplot-Modus der View wird die Karte ausgeblendet, weil der kombinierte Boxplot im Unterrichtsqualitäts-Chart sie mit abdeckt.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **selfEfficacyLongConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,students`, `comparison=year` | `type`¹ (nur `student`-Zeilen), `id`¹, `properties[sp_mean]`¹, `properties[testPeriod]`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Anfrage fragt `type=school,students`; `student`-Zeilen mit `sp_mean` liefert nur die Demo-Fixture, fehlen sie, legt die View die Karte nicht an. Eine Zeile ohne `properties[testPeriod]` (Konvention der API, nicht im Schema) fällt aus der Zeitreihe; ohne `id` fasst jedes Jahr alle Personen zu einem Wert zusammen. Werte außerhalb 1–5 fallen weg.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`comparison=year`) | `properties[simulated]` | Jedes Jahr gilt als gemessen; sichtbar nur im Tooltip, der jedes Jahr „(aktuell)“ nennt |

Payload: `createRenderer(host, data)` erhält `{ domainResults, domainArray, history }` aus `#getChartData` der Entwicklungs-View; gelesen wird nur `history`, über `buildSurveyHistory` (`historyAdapter.js`) als ein Mittelwert je Person und Jahr, ohne Filter nach Fach. Die Option `yMax` setzt die View für alle drei Karten gleich; ob die Karte entsteht, entscheidet die View über `sp_mean` in `history` (`detectHistorySurveyScales`).

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showModuleTitle`, `enableModuleExport`, `showSubtitle` | `boolean` | `true` | nein | Descriptor-Defaults aus `baseLongitudinalOptions()`; die View setzt `showSubtitle: false` |
| `yMax` | `number\|null` | `null` | nein | Obergrenze der y-Achse in Prozent, von der View für alle drei Karten gleich gesetzt (`computeSharedYMax`); ohne sie richtet sich die Achse nach den eigenen Werten, gestapelt gilt immer 100 |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setStacked(flag)` | Aufruf | Gestapelte Ansicht ein/aus, per `chart.setState({ isStacked })` |

Kein `setDomainIndex`: Selbstwirksamkeit ist fachunabhängig. Kein `getExportIdentity`: ein Host, eine Darstellung.
