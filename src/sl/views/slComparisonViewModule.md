# SlComparisonViewModule

## Zweck
Der „Vergleich“: ein verteilungsbasierter Vergleich von Schüler:innengruppen als Chart-Karte, daneben ein Kasten, der die aktuell gezeigte Gegenüberstellung zusammenfasst. Welcher Kasten-Text gilt, folgt der Messgrößenfamilie des Charts (`metricMode`): `comparisonCompetency`, `comparisonRating`, `comparisonPoints`, sonst `comparison`.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **SlComparisonViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Gruppenvergleich | `ChartHostModule` + `groupComparisonConfig` | [groupComparisonConfig.md](../../../packages/modules/src/sl/modules/charts/groupComparison/groupComparisonConfig.md) | Id `sl-comparison-group-chart`, `onComparisonSummaryChanged`. Die Gruppen-/Untergruppen-Selects sind eine modul-lokale Leiste über dem Chart-Body — eine begründete Ausnahme vom Header-Vertrag, [standards-reference.md](../../../docs/standards-reference.md) §4.3 Header Action Toolbar |
| Kasten | `InfoBoxModule` | [infoBoxModule.md](../../../packages/modules/src/sl/modules/infoBox/infoBoxModule.md) | Id `sl-comparison-text`, `glossaryKey: 'sl.comparison.results'`; `boxKey` und `placeholderContext.summaries.comparison` aus der jüngsten Zusammenfassung |

Der Kasten wird in einem ersten `_hydrateChildren`-Durchlauf vor dem Chart hydriert, weil der erste Render des Charts `onComparisonSummaryChanged` feuert und dessen Zusammenfassung schon landen muss. Nach dem Chart-Render holt die View zusätzlich `chart.getCurrentSummary()` ab und wendet sie auf den Kasten an.

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=school,group` | Gruppenvergleich (die Klassenzeilen, in `DOMAIN_RESULTS`); Kasten über `slData` |
| `competence-levels` | `comparison=state-average` | Kasten über `slData` (Landesvergleich) |
| `competence-levels` | `type=students` | Gruppenvergleich (die Schülerzeilen, in `DOMAIN_RESULTS` sowie in `COMPARISON_SELF_EFFICACY` und `COMPARISON_TEACHING_QUALITY`) |
| `aggregations` | `type=students`, `aggregation=result` | Gruppenvergleich (in `COMPARISON_POINTS`) |

Payload: kein App-Payload. Aus dem `DataStore` die abgeleiteten Datensätze `DOMAIN_RESULTS`, `COMPARISON_SELF_EFFICACY`, `COMPARISON_TEACHING_QUALITY` und `COMPARISON_POINTS` (nur dieser mit Rückfall `null`); der Chart erhält `{ domainResults, comparisonSP, comparisonTQ, comparisonPoints }`. Der Kasten erhält `{ boxKey, placeholderContext }` und den Port `slData: slDataFromStore(dataStore)`. Hydriert wird in zwei Batches, erst der Kasten, dann der Chart, weil dessen erster Render `onComparisonSummaryChanged` feuert; danach holt die View `chart.getCurrentSummary()` ab und wendet sie auf den Kasten an.

## Zustand
Keine App-State-Schlüssel beobachtet.

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Chart-Host `onComparisonSummaryChanged(summary)` | Kasten `update({ boxKey, placeholderContext })` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Kartenzeile bauen, Chart-Host mounten und Payload lesen, Kasten mounten, erst Kasten und dann Chart hydrieren, Zusammenfassung anwenden |
