# SlMatrixViewModule

## Zweck
„Gesamtbild“: die schulweite Kompetenzstufenverteilung als Chart-Karte, daneben ein Kasten „Entwicklungspotenziale“ mit dem Analysetext aus `info-boxes.json`.

## Design/Idee

In einer alternativen Übersicht, welche den ursprünglichen Entwurf der entwickelnden Schulleitungen darstellt, werden Kompetenzstufenverteilungen aller Domänen und Lerngruppen inklusive Schul- und Landeswert innerhalb einer Graphik abgebildet. Ein nebenstehender Info-Kasten teilinterpretiert ausgewählte Ergebnisse anhand vorformulierter Textbausteine. Die entwickelnden Schulleitungen waren jedoch bis zuletzt unzufrieden bezüglich der Komplexität der Darstellung, weshalb die Rückmeldung um das SlSummaryViewModule erweitert wurde.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Kompetenzstufenverteilung | `ChartHostModule` + `competenceChartConfig` | [competenceChartConfig.md](../../../packages/modules/src/sl/modules/charts/competence/overview/competenceChartConfig.md) | `glossaryKey: 'sl.matrix.chart'`, `showModuleTitle: true` |
| Kasten „Entwicklungspotenziale“ | `InfoBoxModule` | [infoBoxModule.md](../../../packages/modules/src/sl/modules/infoBox/infoBoxModule.md) | `data = { boxKey: 'matrix' }`, `glossaryKey: 'sl.matrix.text'`, `onOpenMaterial` (aus `navigate('material', { statePatch: materialStatePatch(selection) })`) |

Was ein Kasten aussagen darf (nur Kompetenzstufenanteile, keine Lösungsquote, kein KMK-Standardname): [sl-info-box-placeholders.md](../../../packages/modules/docs/sl-info-box-placeholders.md).

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=school,group` | Kompetenzstufenverteilung (über `COMPETENCE_LEVEL_INDEX`); Kasten (liest den Store selbst) |
| `competence-levels` | `comparison=state-average` | Kompetenzstufenverteilung (die Landesschnittzeilen desselben Dokuments); Kasten (liest den Store selbst) |

Payload: keiner. Die View prüft den Store nur auf Ergebnisse (`hasSlResults`): ohne warnt sie, rendert die leere Kartenzeile und baut keines der beiden Kinder. Der Chart bekommt keinen Payload und liest `COMPETENCE_LEVEL_INDEX` selbst; der Kasten liest Vorlage und Zahlen selbst aus dem Store.

## Zustand
Keine App-State-Schlüssel beobachtet.

## Verdrahtung
Keine Geschwister-Verdrahtung.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Chart-Host und Kasten erzeugen und gemeinsam in die Kartenzeile (`chartsRowTemplate`) setzen |
