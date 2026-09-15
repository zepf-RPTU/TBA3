# ChartHostModule + competencyDetailSectionConfig

## Zweck
Der Kompetenzstufen-Detailchart einer Gruppe (ein Fach über alle Klassen, eine Klasse über alle Fächer, oder die Schule): Balken pro Klasse, Schule und Landesschnitt, je Domäne gruppiert, wahlweise mit Unterrichtsqualität als gestapeltem Balken oder Boxplot (`qualityVizMode`). Als Vollchart im Detail-Overlay und als kompaktes Wasserzeichen in der Vorschaukarte, damit beide dieselbe Darstellung zeigen.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../../common/charts/host/chartHostModule.md)
      - **competencyDetailSectionConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹ (`group` macht eine Zeile zur Klasse, `state` zum Landesschnitt), `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Als Klasse zählt nur eine Zeile mit `type=group`; eine Zeile ohne `type` ist weder Klasse noch Landesschnitt, und fehlt er an den Klassenzeilen, hat der Chart keine Daten. Zeilen ohne `subject` fallen weg. Klassen- und Landesschnittbalken zeichnen `frequency / total` ihrer eigenen Zeile, nicht `mean`, das der Server auf vier Stellen rundet; den Schulschnitt summiert der Chart aus der `frequency` der Klassen durch deren `total`, die Schulzeile selbst liest er nicht. Der Tooltip liest Anzahl und Gesamtanzahl aus der Zeile des Balkens selbst; ein Landesschnitt ohne eigene Zahlen zeigt keine, er leiht sich nicht die der Schule.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain.id`, `domain.name` | Die Domänen eines Fachs werden nicht getrennt; alle Zeilen einer Klasse stehen in derselben Gruppe |
| `competence-levels` | Zeilen mit `type=state` (`comparison=state-average`) | Keine Landesschnitt-Balken und kein L-Schalter |
| `competence-levels` | `id` der `state`-Zeilen | In der Klassen- und Schulansicht teilen sich mehrere Landesschnitte eines Bereichs einen Schalter und einen Balkenplatz |
| `competence-levels` (`type=students`) | `properties[tq_mean]` | Keine Spalte „Q“ und kein Schalter Unterrichtsqualität |

Payload: `createRenderer(host, data)` erhält eine Chart-Gruppe aus `src/sl/views/slOverviewChartGroups.js` plus `teachingQuality`: `domainGroups` (`CompetenceLevelIndex.classGroups`, die rohen Klassenzeilen je Fach×Domäne), `stateEntries` (`CompetenceLevelIndex.stateRows`) und `isMultiDomain`; `resolveCompetencyDetailChartInput` entpackt auch ein flaches Klassen-Array. `teachingQuality` ist das Dataset `TEACHING_QUALITY` (`buildTeachingQualityByClassSubject`): je Klasse über `covariates[group]` gleich dem `name` der Klassenzeile, je Person über `id` gezählt, `className: 'Schule'` für den Schulschnitt. Aus den Optionen liest der Renderer `className`, `showOnlySchoolData`, `qualityVizMode` und `compact`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `className` | `string\|null` | `null` | nein | Klassenname für die Klassenansicht |
| `showOnlySchoolData` | `boolean` | `false` | nein | Nur das Schulaggregat zeichnen (Schulübersicht) |
| `qualityVizMode` | `string` | `'stacked_bar'` | nein | Startmodus für Unterrichtsqualität, `'boxplot'` alternativ |
| `compact` | `boolean` | `false` | nein | Wasserzeichen: nur Balkengeometrie, keine Legende, Achsen, Tooltips |
| `glossaryKey`, `glossaryReplacements` | `string`, `object` | – | nein | Titel je Panel, vom Overlay gesetzt |
| `enableModuleExport` | `boolean` | `true` | nein | Descriptor-Default |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setVizMode(mode)` | Aufruf | Unterrichtsqualität als `'stacked_bar'` oder `'boxplot'`; setzt `chart.setState({ vizMode })` in place |
