# ChartHostModule + teachingQualityConfig

## Zweck
Der Entwicklungs-Chart der Unterrichtsqualität in der SL-View „Entwicklung“. Im Modus `parallel` zeigt er je Jahrgang den Anteil pro Antwortband als Parallelkoordinaten für den gewählten Bereich (Fach×Domäne), wahlweise gestapelt. Im Modus `boxplot` wird er zum kombinierten Boxplot aus Unterrichtsqualität und Selbstwirksamkeit über die Jahre und übernimmt Titel und Untertitel des Boxplot-Eintrags.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **teachingQualityConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,students`, `comparison=year` | `type`¹ (nur `student`-Zeilen), `id`¹, `subject.name`¹, `properties[tq_mean]`¹, `properties[testPeriod]`¹; im Modus `boxplot` zusätzlich `properties[sp_mean]`¹ |
| `competence-levels` | `type=school,group` | Klassenzeilen mit `name` und `subject.name`¹: sie bestimmen die Bereiche und, mit dem Dokument darunter, die Kohorte je Bereich |
| `competence-levels` | `type=students` | `id`¹, `covariates[group]`¹ (gleich `name` der Klassenzeile), `subject.name`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Anfrage fragt `type=school,students`; `student`-Zeilen mit `tq_mean` liefert nur die Demo-Fixture, fehlen sie, legt die View die Karte nicht an. Eine `student`-Zeile zählt nur, wenn ihre `id` einer Person des gewählten Bereichs gehört (Klasse, Fach und `domain.id` wie die Klassenzeile) und ihr `subject.name` das Fach des Bereichs ist; ohne `properties[testPeriod]` (Konvention der API, nicht im Schema) fällt sie aus der Zeitreihe. Der Boxplot behält nur Jahre, in denen `tq_mean` und `sp_mean` Werte haben; im Modus `parallel` fallen Werte außerhalb 1–5 weg.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`comparison=year`) | `properties[simulated]` | Jedes Jahr gilt als gemessen; der Tooltip nennt jedes Jahr „(aktuell)“ |
| `competence-levels` (`type=school,group`) | `domain.id` | Je Fach nur ein Bereich; die Kohorte ist das ganze Fach |

Payload: `createRenderer(host, data)` erhält `{ domainResults, domainArray, history }` aus `#getChartData` der Entwicklungs-View. `domainArray` ist `groupDomainResultsBySubjectDomain(DOMAIN_RESULTS)` (`src/sl/utils/slDomainResults.js`); aus `domainArray[domainIndex]` liest der Descriptor `fach` und `summedResults[].studentId` als Kohorte. `history` liest `buildSurveyHistory` (`historyAdapter.js`) als einen Mittelwert je Person und Jahr: im Modus `parallel` `tq_mean` der Kohorte (`convertTeachingQualityToTimeline`), im Modus `boxplot` zusätzlich `sp_mean` der ganzen Schule (`LongitudinalBoxPlotChart`). Die Option `yMax` setzt die View für alle drei Karten gleich; ob die Karte entsteht, entscheidet die View über `tq_mean` in `history` (`detectHistorySurveyScales`).

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showModuleTitle`, `enableModuleExport`, `showSubtitle` | `boolean` | `true` | nein | Descriptor-Defaults aus `baseLongitudinalOptions()`; die View setzt `showSubtitle: false` |
| `yMax` | `number\|null` | `null` | nein | Nur im Modus `parallel`: Obergrenze der y-Achse in Prozent, von der View für alle drei Karten gleich gesetzt (`computeSharedYMax`); ohne sie richtet sich die Achse nach den eigenen Werten, gestapelt gilt immer 100 |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setDomainIndex(index)` | Aufruf | Bereich wechseln; parallel in place (`updateData`), bei geänderten Jahrgängen und im Boxplot voller Rerender; `syncExportControls()` |
| `setStacked(flag)` | Aufruf | Gestapelte Ansicht ein/aus (nur parallel wirksam) |
| `setChartType(type)` | Aufruf | `'parallel'` oder `'boxplot'`; lädt den passenden Glossareintrag, setzt Titel und Untertitel neu und rendert |
| `getExportIdentity()` | Override | `domain<index>`; der Charttyp gehört bewusst nicht dazu, derselbe Bereich anders gezeichnet bleibt eine Karte |
