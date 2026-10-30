# SlDetailsViewModule

## Zweck
Die „Details“: die Ergebnisse der Schule nach Fächern oder nach Lerngruppen, entweder als Raster klickbarer Vorschaukarten mit Kasten oder als Tabelle. Ein Klick auf eine Karte öffnet das Detail-Overlay mit dem vollen Chart. `detailsGrouping` und `displayMode` des Headers wählen den Inhalt.

## Design/Idee

Im Anschluss an die beiden Startübersichten bietet diese Ansicht die Möglichkeit, die Ergebnisse aller Fächer und Lerngruppen erschöpfend und vollständig zu erfassen. Eine Menüleiste oberhalb der Seite lässt dabei flexibel zwischen unterschiedlichen Modi der Aggregation wechseln (Gruppierung: lerngruppenübergreifend pro Fach oder fachübergreifend pro Lerngruppe; Darstellung: Diagramme oder Tabellen; Diagrammart: klassische Balken oder Boxplots für Unterrichtsqualität und Selbstwirksamkeit). In der graphischen Darstellung („Diagramme“) steht erneut ein rechtsseitiger Infokasten zur Verfügung, der mithilfe ausgewählter und verbalisierter Teilergebnisse die Exploration begleiten soll.

In dieser Ansicht tauchen erstmalig die fiktiven Merkmale „Selbstwirksamkeit“ und „Unterrichtsqualität“ auf; diese sind nicht Gegenstand der Lernstandserhebung bzw. Vergleichsarbeiten. Die entwickelnden Schulleitungen wünschten jedoch explizit die Anbindung zusätzlicher Merkmale, um die Ergebnisse der Testung in Bezug zu den allgemeinen Lernbedingungen der SuS setzen zu können. Selbstwirksamkeit beschreibt dabei exemplarisch ein fachübergreifendes Merkmal der SuS, Unterrichtsqualität beschreibt eine vom Kompetenzbegriff losgelöste Beurteilung des Unterrichts durch die SuS.

Ziel der Ansicht ist eine umfassende und erschöpfende Abbildung aller Ergebnisse; den Schulleitungen soll eine freie und selbstbestimmte Exploration der Ergebnisse ermöglicht werden. Textbausteine liefern Hinweise auf potenzielle Entwicklungsfelder; Auswahl, Darstellung und vor allem Umfang der Exploration liegen jedoch im Ermessen der betrachtenden Schulleitung.

Alle vier Abschnitte stehen im Template, gebaut wird jeder erst beim ersten Anzeigen; ein Moduswechsel blendet danach nur per `data-*`-Attribut um, sodass Tabellen und Karten ihren Zustand behalten.

## Kinder
Kinder entstehen je Moduskombination (`displayMode` × `detailsGrouping`) beim ersten Anzeigen in einem von vier Abschnitten: ein Kartenraster samt Kasten oder eine Tabelle. Ein Wechsel blendet nur um und meldet das den Modulen der Abschnitte (`refreshVisibility()`), sodass sie nachziehen, was sie versteckt aufgeschoben haben; schnelles Umschalten baut keine Kombination doppelt.

| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Tabelle nach Fächern (`table` × `by_subjects`) | `SlDomainTableModule` | [slDomainTableModule.md](../../../packages/modules/src/sl/modules/tables/slDomainTableModule.md) | `glossaryKey: 'sl.details.subject-view.table'`, `vizMode`: das App-Signal, `showModuleTitle: true` |
| Tabelle nach Lerngruppen (`table` × `by_groups`) | `SlGroupTableModule` | [slGroupTableModule.md](../../../packages/modules/src/sl/modules/tables/slGroupTableModule.md) | `glossaryKey: 'sl.details.group-view.table'`, sonst wie oben |
| Kasten neben dem Kartenraster (`charts`, je Gruppierung; im gestapelten Layout darunter) | `InfoBoxModule` | [infoBoxModule.md](../../../packages/modules/src/sl/modules/infoBox/infoBoxModule.md) | `data = { boxKey: 'detailsBySubjects' }` bzw. `'detailsByGroups'`, `glossaryKey: 'sl.results'`, `onOpenMaterial` (aus `navigate('material', { statePatch: materialStatePatch(selection) })`) |
| Wasserzeichen einer Vorschaukarte | `ChartHostModule` + `competenceDetailSectionConfig` | [competenceDetailSectionConfig.md](../../../packages/modules/src/sl/modules/charts/competence/detail/competenceDetailSectionConfig.md) | `thumbnail: true`, `vizMode`: das App-Signal, die Auswahl der Karte: `subjectName`, `groupName`, `showOnlySchoolData` |
| Wasserzeichen der Selbstwirksamkeitskarte (nur nach Fächern, erste Karte) | `ChartHostModule` + `selfEfficacyConfig` | [selfEfficacyConfig.md](../../../packages/modules/src/sl/modules/charts/selfEfficacy/selfEfficacyConfig.md) | wie oben |
| Detail-Overlay | `SlDetailOverlayModule` | [slDetailOverlayModule.md](../modules/slDetailOverlay/slDetailOverlayModule.md) | beim ersten Kartenklick erzeugt, beim Abbau der View entfernt; `vizMode`: das App-Signal, `onOpenMaterial` |

Die Vorschau-Hosts entstehen mit ihrem Raster und werden mit dem Kasten im selben Render gesetzt; das Raster ist dann eingehängt und sichtbar, jede Karte misst also ihre Größe. Der Aufbau wartet auf die `contentComplete` aller Hosts und des Kastens.

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=school,group` | beide Tabellen (die Lerngruppenzeilen, in `DOMAIN_RESULTS` bzw. `GROUP_RESULTS`; die Stufen in `LEVEL_DEFINITIONS`); Vorschaukarten und Overlay (welche Karten es gibt, aus dem `CompetenceLevelIndex`; die Lerngruppen- und Schulzeilen lesen die Charts selbst); Kästen (lesen den Store selbst) |
| `competence-levels` | `comparison=state-average` | Domänentabelle (die Vergleichszeilen aus dem rohen Dokument); Vorschaukarten und Overlay (die Landesschnittzeilen aus dem `CompetenceLevelIndex`); Kästen (lesen den Store selbst) |
| `competence-levels` | `type=students` | beide Tabellen (die Schülerzeilen, in `DOMAIN_RESULTS`, dazu `TEACHING_QUALITY`, `SELF_EFFICACY_BY_GROUP`, `SELF_EFFICACY_SCHOOL`); Vorschaukarten (`TEACHING_QUALITY`; die Selbstwirksamkeitskarte nur mit Selbstwirksamkeitszeilen); Overlay |

Payload: nur Auswahl. Welche Karten es gibt, baut `slDetailsChartGroups.js` fertig (`buildSubjectCards` / `buildGroupCards`: je Karte Titel, Wasserzeichen und Detail; das Detail beschreibt [slDetailOverlayModule.md](../modules/slDetailOverlay/slDetailOverlayModule.md#daten)) aus `COMPETENCE_LEVEL_INDEX` (Fachkarten nennen ihre Domänen als Token `{{Domänen}}`) und `hasSelfEfficacy` des Datasets `SL_DATASETS.SURVEY_ROWS`. Die Karten nach Lerngruppen haben keinen Untertitel, und ihr Overlay-Chart startet mit `averagesHidden`: Vergleiche und (neben Lerngruppenbalken) der Schulschnitt sind aus, bis die Betrachter:in sie einschaltet.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `detailsGrouping` (`by_subjects` / `by_groups`) | Header-Umschalter „Ansicht“ | Abschnitt umblenden, Kombination beim ersten Mal bauen |
| `displayMode` (`charts` / `table`) | Header-Umschalter „Darstellung“ | dito |
| `vizMode` (`stacked_bar` / `boxplot`) | Header-Umschalter „Balken/Boxplot“ | Kein Beobachter: das Signal geht als Option `vizMode` an Tabellen, Vorschau-Hosts und die Chart-Hosts des Overlays, die ihm selbst folgen |

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Vorschaukarte (Klick, Enter, Leertaste) | Overlay `open(card.detail)` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Vier Abschnitte rendern, `detailsGrouping` und `displayMode` beobachten, Inhalt der aktuellen Kombination bauen und abwarten |
