# SlDetailOverlayModule

## Zweck
Vollbild-Overlay der SL-Übersicht: ein Klick auf eine Vorschaukarte öffnet den vollständigen Kompetenzstufen-Chart eines Fachs, einer Klasse oder der Schule, daneben die passende Infobox („Kasten“). Drei Layouts: Fach (Chart + Kasten), Klasse oder Schule (Selbstwirksamkeit + Chart + Kasten) und Selbstwirksamkeit allein (Chart + Kasten). Alle Karten teilen sich eine Instanz; Backdrop-Klick, Schließen-Button und Escape schließen das Overlay.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../packages/module-base/src/modules/baseModule.md)
  - **SlDetailOverlayModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹, `properties[sp_mean]`¹ — die Selbstwirksamkeitswerte hinter der Kasten-Zusammenfassung des SW-Layouts und der Selbstwirksamkeitsspalte des Klassen-Layouts |

¹ In der Spezifikation optional, für die Selbstwirksamkeitsteile dieses Moduls Pflicht. Ohne `sp_mean` gibt es keine Selbstwirksamkeitszeilen: das SW-Layout öffnet die Übersicht dann gar nicht, das Klassen-Layout zeigt nur Chart und Kasten. Ohne `id` entdoppelt der Aufbau jede Klasse und die Schule auf einen einzigen Wert; Anzahl, Mittelwert und Rangfolge im Kasten stimmen dann nicht.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`) | `covariates[group]` | Keine Klassenzeilen: der SW-Kasten fasst nur die Schule zusammen (keine beste oder schwächste Klasse), im Klassen-Layout hat nur die Schulkarte eine Selbstwirksamkeitsspalte |
| `competence-levels` (`type=school,group`) | `name` der Klassenzeile gleich dem `covariates[group]`-Wert ihrer Schülerzeilen | Das Klassen-Layout findet zur Klasse keine Selbstwirksamkeitszeile und zeigt nur Chart und Kasten |

Payload: `show(params)` erhält den Payload der geklickten Karte, den `#openDetail` der Übersicht aus dem `DataStore` baut: `detailKey` (`sp`, `subject-<Fach>`, `class-<Klasse>` oder `school`; fließt in die Panel-Ids und damit in die Exportziele), `title`, `chartGroups` (genau eine Gruppe aus `slOverviewChartGroups.js` über den `CompetenceLevelIndex`, mit den Landesschnittzeilen als `stateEntries`), `selfEfficacyByClass`/`selfEfficacySchool`, `teachingQuality`, `isSelfEfficacy`/`isByClass`/`className` (Layout und Kasten-Schlüssel) und `vizMode`. Der Chart-Host mit `competencyDetailSectionConfig` bekommt `{ ...group, teachingQuality }`; der mit `selfEfficacyConfig` im SW-Layout alle Klassenzeilen plus die Schulzeile, im Klassen-Layout die Zeile der Klasse bzw. auf der Schulkarte die Schulzeile. Der Kasten (`InfoBoxModule`) bekommt keinen Payload, sondern den Port `slData: slDataFromStore(dataStore)` und den `boxKey` `overviewSubjectSpecific`, `overviewClassSpecific`, `overviewSchoolSpecific` oder `overviewSelfEfficacy`; im SW-Layout dazu `placeholderContext.summaries.selfEfficacy` aus `buildSelfEfficacyInfoBoxSummary`, sonst `placeholderContext` mit `subjectName` = `subjectName` der Gruppe (das Fach aus dem Payload, nicht der Glossartitel der Karte; `null` im Klassen-Layout) und `className` der Klasse.

## Optionen
Keine eigenen `setDefaults`. Das Modul liest aus den `_childOptions()` der View:

| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `glossaryData` | `object` | – | ja | Auflösung der Paneltitel (`#resolveChartTitle`, `#resolveOverviewPreviewTitle`) |
| `dataStore`, `appState`, `onNavigate`, … | – | – | – | an die Chart-Hosts durchgereicht; für den Kasten baut es daraus den Daten-Port (`slDataFromStore`) |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `show(params)` | Aufruf | Overlay öffnen, vorherigen Inhalt zerstören, Layout nach `isSelfEfficacy` / `isByClass` bauen |
| `setVizMode(mode)` | Aufruf | `setVizMode` an beide Chart-Hosts; der Modus gilt auch für das nächste `show` |
| `hide()` | Aufruf | Overlay ausblenden, Kinder zerstören |
| `destroy()` | Override | `hide()` plus Overlay-DOM entfernen |
| `onLinkActivated` des Kastens | intern verdrahtet | ein Materiallink im Kasten schließt das Overlay |
