# SlOverviewViewModule

## Zweck
Die „Übersicht“: die Ergebnisse der Schule nach Fächern oder nach Klassen, entweder als Raster klickbarer Vorschaukarten mit Kasten oder als Tabelle. Ein Klick auf eine Karte öffnet das Detail-Overlay mit dem vollen Chart. Die View koordiniert die drei Modus-Schlüssel des Headers: `viewMode` und `displayMode` wählen den Inhalt, `vizMode` (Balken/Boxplot) wird an Tabellen, Vorschau-Hosts und Overlay durchgereicht.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **SlOverviewViewModule**

## Kinder
Kinder entstehen je Moduskombination (`viewMode` × `displayMode`) lazy beim ersten Anzeigen in einem von vier persistenten Wrappern; ein Wechsel blendet per `data-*`-Attribut um und baut die Kombination erst beim ersten Bedarf.

| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Tabelle nach Fächern (`table` × `by_subjects`) | `SlDomainTableModule` | [slDomainTableModule.md](../../../packages/modules/src/sl/modules/tables/slDomainTableModule.md) | Id `overview-domain-table`, `glossaryKey: 'sl.overview.subject-view.table'`, `vizMode` aus dem App-State, `showModuleTitle: true` |
| Tabelle nach Klassen (`table` × `by_classes`) | `SlClassTableModule` | [slClassTableModule.md](../../../packages/modules/src/sl/modules/tables/slClassTableModule.md) | Id `overview-class-table`, `glossaryKey: 'sl.overview.class-view.table'`, sonst wie oben |
| Kasten unter dem Kartenraster (`charts`, je Gruppierung) | `InfoBoxModule` | [infoBoxModule.md](../../../packages/modules/src/sl/modules/infoBox/infoBoxModule.md) | `boxKey: 'overviewBySubjects'` bzw. `'overviewByClasses'`, `glossaryKey: 'sl.results'`, `slData` (`slDataFromStore(dataStore)`) |
| Wasserzeichen einer Vorschaukarte | `ChartHostModule` + `competencyDetailSectionConfig` | [competencyDetailSectionConfig.md](../../../packages/modules/src/sl/modules/charts/competency/detail/competencyDetailSectionConfig.md) | `compact: true`, `showModuleCard: false`, `enableModuleExport: false`, `waitForStableLayout: false`, `qualityVizMode` = aktueller `vizMode`, `className`, `showOnlySchoolData` |
| Wasserzeichen der Selbstwirksamkeitskarte (nur nach Fächern, erste Karte) | `ChartHostModule` + `selfEfficacyConfig` | [selfEfficacyConfig.md](../../../packages/modules/src/sl/modules/charts/selfEfficacy/selfEfficacyConfig.md) | wie oben, `defaultVizMode` = aktueller `vizMode` |
| Detail-Overlay | `SlDetailOverlayModule` | [slDetailOverlayModule.md](../modules/slDetailOverlay/slDetailOverlayModule.md) | Eine body-gemountete Instanz `<viewId>-detail-overlay` für alle Karten, beim ersten `#openDetail` erzeugt, **nicht** als Kind registriert (in `destroy()` explizit zerstört); hostet intern dieselben beiden Configs plus einen `InfoBoxModule`-Kasten |

Die Vorschau-Hosts werden von `#syncPreviewHosts` nur gemountet, solange ihr Raster sichtbar ist (ein verstecktes misst 0). Der Abgleich läuft nur im Modus `charts` und zerstört dort die Hosts des ausgeblendeten Rasters; ein Wechsel auf `table` blendet die Raster nur per CSS aus und lässt ihre Hosts gemountet. Durchläufe sind serialisiert, damit ein Abbau nicht in ein laufendes Mounten fällt. `show()` stößt den Abgleich im Modus `charts` erneut an.

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=school,group` | beide Tabellen (die Klassenzeilen, in `DOMAIN_RESULTS` bzw. `CLASS_RESULTS`; die Stufen in `LEVEL_DEFINITIONS`); Vorschaukarten und Overlay (die Chart-Gruppen aus dem `CompetenceLevelIndex`); Kästen über `slData` |
| `competence-levels` | `comparison=state-average` | Domänentabelle (die Vergleichszeilen aus dem rohen Dokument); Vorschaukarten und Overlay (`stateEntries` der Chart-Gruppen); Kästen über `slData` |
| `competence-levels` | `type=students` | beide Tabellen (die Schülerzeilen, in `DOMAIN_RESULTS`, dazu `TEACHING_QUALITY`, `SELF_EFFICACY_BY_CLASS`, `SELF_EFFICACY_SCHOOL`); Vorschaukarten (`teachingQuality`; die Selbstwirksamkeitskarte nur mit Selbstwirksamkeitszeilen); Overlay |

Payload: kein App-Payload. Aus dem `DataStore`: roh `COMPETENCE_LEVELS`; abgeleitet `DOMAIN_RESULTS`, `CLASS_RESULTS`, `LEVEL_DEFINITIONS`, `TEACHING_QUALITY`, `SELF_EFFICACY_BY_CLASS`, `SELF_EFFICACY_SCHOOL`; die Chart-Gruppen aus `getCompetenceLevelIndex(dataStore)` über `slOverviewChartGroups.js`. Jedes Kind wird erst mit seiner Moduskombination gebaut und per `init` gefüllt: die Domänentabelle mit `{ allDomainResults, levelDefinitions, competenceLevelsData, teachingQuality, selfEfficacyByClass, selfEfficacySchool }`, die Klassentabelle mit `classArray` statt `allDomainResults` und `competenceLevelsData`, ein Vorschau-Host mit `{ ...group, teachingQuality }`, die Selbstwirksamkeitsvorschau mit den Klassen- plus der Schulzeile, die Kästen ohne Payload mit `boxKey` und dem Port `slData: slDataFromStore(dataStore)`. Das Overlay bekommt bei `show` `detailKey` (Basis der Panel- und Export-Ids, damit die Karten nicht dasselbe Exportziel teilen), `title`, `chartGroups: [group]` bzw. `isSelfEfficacy`, die beiden Selbstwirksamkeits-Datensätze, `teachingQuality`, `isByClass`, `className` und `vizMode`.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `viewMode` (`by_subjects` / `by_classes`) | Header-Umschalter „Ansicht“ | `#updateContent()`: Wrapper umblenden, Kombination lazy bauen, Vorschau-Hosts abgleichen |
| `displayMode` (`charts` / `table`) | Header-Umschalter „Darstellung“ | dito |
| `vizMode` (`stacked_bar` / `boxplot`) | Header-Umschalter „Balken/Boxplot“ (in `charts` versteckt) | Tabellen `setState({ vizMode })`, jeder Vorschau-Host `setVizMode(mode)`, Overlay `setVizMode(mode)`; später erzeugte Kinder lesen ihn aus ihren Optionen |

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Vorschaukarte `onActivate` (Klick, Enter, Leertaste) | Overlay `show({ detailKey, chartGroups \| selfEfficacy…, vizMode })` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Vier Wrapper anlegen, die drei Modus-Schlüssel beobachten, Inhalt der aktuellen Kombination bauen |
| `show()` | Override | Basis, Modus-Attribute stempeln, im Chart-Modus die Vorschau-Hosts neu abgleichen |
| `destroy()` | Override | Vorschau-Hosts, Tabellen und Kästen abbauen, Overlay zerstören, dann Basis |
