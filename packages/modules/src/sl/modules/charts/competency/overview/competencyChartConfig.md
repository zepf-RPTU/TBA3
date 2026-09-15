# ChartHostModule + competencyChartConfig

## Zweck
Die Kompetenzstufenverteilung auf der SL-Startseite: alle Fächer, Domänen und Klassen der Schule nebeneinander als gestapelte Balken, mit Landesschnitt-Vergleich und HTML-Legende. Wächst die Breite über den Container hinaus, scrollt der SVG-Bereich horizontal.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../../common/charts/host/chartHostModule.md)
      - **competencyChartConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹ (`group` macht eine Zeile zur Klasse, `school` findet die Schulzeile, `state` die Landesschnitte), `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Als Klasse zählt nur eine Zeile mit `type=group`; ohne `type` ist keine Zeile eine Klasse, und der Chart zeigt seinen Hinweis auf fehlende Daten. Zeilen ohne `subject` fallen weg. Die Balken zeichnen `frequency / total`, nicht `mean`, das der Server auf vier Stellen rundet; eine Klasse mit `total` 0 zeigt statt eines Balkens den Hinweis auf fehlende Teilnahme, eine Landesschnittzeile mit `total` 0 fällt weg. Der Tooltip jedes Balkens — Klasse, Schulschnitt, Landesschnitt — liest Anzahl und Gesamtanzahl aus der eigenen Zeile (`frequency`, `total`), nicht aus der Schulzeile, neben der der Balken steht.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | Zeile mit `type=school` und `id` je Fach×Domäne | Der Schulschnitt wird aus den Klassen summiert (`frequency` durch die Summe der `total`) |
| `competence-levels` | `domain.id`, `domain.name` | Ein nach Domänen geteiltes Fach wird eine Balkengruppe unter dem Fachnamen, die je Klasse nur die erste Zeile zeigt |
| `competence-levels` | Zeilen mit `type=state` (`comparison=state-average`) | Keine Landesschnitt-Balken und kein L-Schalter |

Payload: `createRenderer(host, data)` erhält `{ competenceLevels }` von der Startseiten-View: das rohe `competence-levels`-Dokument (`SL_DATA_KEYS.COMPETENCE_LEVELS`). Der Renderer trennt es selbst mit `buildCompetenceLevelIndex` in Schul-, Klassen- und Landesschnittzeilen und rechnet es mit `parseCompetenceLevels` in Anteile um; keine datenbezogenen Optionen.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `glossaryKey` | `string` | – | ja (von der View) | Titel und Untertitel |
| `enableModuleExport` | `boolean` | `true` | nein | Descriptor-Default |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|

Keine `publicAPI`.
