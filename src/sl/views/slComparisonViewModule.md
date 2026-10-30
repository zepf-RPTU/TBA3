# SlComparisonViewModule

## Zweck
Der „Gruppenvergleich“: ein verteilungsbasierter Vergleich von Schüler:innengruppen als Chart-Karte, daneben ein Kasten, der die aktuell gezeigte Gegenüberstellung zusammenfasst. Welcher Kasten-Text gilt, folgt der Messgrößenfamilie des Charts: `comparisonCompetence`, `comparisonRating` oder `comparisonPoints`; bevor das Chart eine Zusammenfassung meldet (etwa ohne Kompetenzdaten), zeigt der Kasten seinen Leerhinweis.

## Design/Idee

Es handelt sich um ein experimentelles Tool zum direkten, benutzerdefinierten und zweiseitigen Gruppenvergleich. Mögliche Anwendungsfälle sind beispielsweise der direkte Vergleich zweier Lerngruppen innerhalb eines Fachs, die Gegenüberstellung von männlichen und weiblichen SuS innerhalb einer Lerngruppe oder der Vergleich der Unterrichtsqualität innerhalb eines Fachs zwischen zwei Parallelgruppen. Die entwickelnden Schulleitungen wünschten sich ein flexibles Instrument, um ad hoc und nach individuellen Hypothesen geleitet einfache deskriptive Vergleiche vornehmen und visualisieren zu können.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Gruppenvergleich | `ChartHostModule` + `groupComparisonConfig` | [groupComparisonConfig.md](../../../packages/modules/src/sl/modules/charts/groupComparison/groupComparisonConfig.md) | Die View folgt dem Host-Zustand `selection`. Die Gruppen-/Untergruppen-Selects sind eine modul-lokale Leiste über dem Chart-Body — eine begründete Ausnahme vom Header-Vertrag, [standards-reference.md](../../../docs/standards-reference.md) unter „Header Action Toolbar“ |
| Kasten | `InfoBoxModule` | [infoBoxModule.md](../../../packages/modules/src/sl/modules/infoBox/infoBoxModule.md) | `glossaryKey: 'sl.comparison.results'`; `boxKey` (nach `chartType`) und `placeholderContext.comparison` (die Auswahl des Charts) aus der jüngsten Auswahl |

Der Kasten startet mit `data = {}` (Leerzustand); seinen Inhalt bekommt er von der ersten Auswahl, die der Host-Zustand `selection` trägt, sobald der Host seinen Renderer hält. Beide rendern hinter der Abdeckung der View, sodass der Leerzustand nur stehen bleibt, wenn der Chart nie entsteht.

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=school,group` | Gruppenvergleich (die Lerngruppenzeilen, in `DOMAIN_RESULTS`); Kasten (liest den Store selbst) |
| `competence-levels` | `comparison=state-average` | Kasten (Landesvergleich, liest den Store selbst) |
| `competence-levels` | `type=students` | Gruppenvergleich (die Schülerzeilen, in `DOMAIN_RESULTS` sowie in `COMPARISON_SELF_EFFICACY` und `COMPARISON_TEACHING_QUALITY`) |
| `aggregations` | `type=students`, `aggregation=result` | Gruppenvergleich (in `COMPARISON_POINTS`) |

Payload: nur Auswahl. Die View liest den Store nicht. Der Chart bekommt keinen Payload und liest seine Datasets (`COMPARISON_SOURCES`, `COMPARISON_ROWS`, `POINTS_MIXED_BOOKLETS`) selbst. Der Kasten liest die Zusammenfassung selbst aus dem Store (`GROUP_COMPARISON_SUMMARY`, je Auswahl gebaut).

## Zustand
Keine App-State-Schlüssel beobachtet.

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Chart-Host-Zustand `selection` (`watch`) | Kasten `data = { boxKey, placeholderContext: { comparison: selection } }` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Chart-Host und Kasten erzeugen, Kasten auf den Leerzustand setzen, beide in die Kartenzeile (`chartsRowTemplate`) setzen |
