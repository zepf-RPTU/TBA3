# InfoBoxModule

## Zweck
Die Hinweis-Karte („Kasten“) der SL-Views: rendert eine Box aus `public/data/sl/info_boxes.json` mit Abschnitten (Icon-Buttons, Typen `general`, `praise`, `alarm`), Textblöcken mit `{{…}}`-Platzhaltern, die gegen die geladenen Daten aufgelöst werden, Repeat-Blöcken (`[[token]]`, je Klasse oder Fach ausgerollt) und Materiallinks in die Material-View. Eine Instanz kann nacheinander mehrere Boxen zeigen (Vergleichs-View).

## Design/Idee

Das Modul hält den Zustand (aktive Box, Abschnitt, Platzhalterkontext, die `CompetenceShareQueries` über dem Port und den Text-Resolver darüber) und die Render-Pipeline: Box auflösen → Abschnitt wählen → Blöcke zu Einträgen bauen → DOM malen. Die Nachbarn sind zustandslos und einzeln testbar: `infoBoxRepeatBlocks.js` rollt Repeat-Blöcke je Klasse oder Fach aus und bekommt dafür nur den Daten-Port und den Platzhalterkontext, `infoBoxDefinitions.js` liest die Box-Definition (Blockarten, aktiver Abschnitt, Abschnittslabel und -icon aus `sectionTypes`), `infoBoxLinks.js` baut die Material-Links und rankt ihr Fach über dieselben Anteils-Queries, `infoBoxSectionDom.js` baut Buttons, Blocklisten, Link-Gruppen und den Leerzustand in ein übergebenes Element. Der Leser akzeptiert genau die Formen, die `info_boxes.json` verwendet (`docs/sl-info-box-placeholders.md`). Der Klick auf einen Abschnitts-Button läuft nicht über `render()`, sondern baut nur die Einträge des neuen Abschnitts und ruft `syncExportControls()`.

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - **InfoBoxModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹ (`school` findet die Schulzeile, `state` die Landesschnitte), `id`¹ der Schulzeile, `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne Schulzeile mit `id` bleibt jede Abfrage leer; Zeilen ohne `subject` fallen weg. Ein Anteil ist `frequency / total` der Zeile, wie in den Diagrammen.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain.id` | Alle Zeilen eines Fachs zählen als ein Fach ohne Domänen; Blöcke, die eine Domäne auswählen, entfallen |
| `competence-levels` | `domain.name` | Beschriftungen nennen nur das Fach; Sätze mit dem Domänennamen entfallen |
| `competence-levels` | Zeilen mit `type=state` (`comparison=state-average`) | Kein Landesvergleich; die Listen-Platzhalter schreiben dann „keinem Fach“ bzw. „keine Klasse“ |

Payload: kein Render-Payload. Die Box liest über die Option `slData` (`infoBoxes()`, `competenceLevelIndex()`, `competenceLevels()`); die Vorlagen stammen aus `public/data/sl/info_boxes.json`, Repo-Prosa und nicht Teil der API. Kennzahlen zu Selbstwirksamkeit und Gruppenvergleich kommen fertig über `placeholderContext.summaries`; ihre API-Felder stehen bei den Modulen, die sie berechnen (`SlDetailOverlayModule`, `groupComparisonConfig`).

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `boxKey` | `string\|null` | `null` | ja (oder im Payload) | Schlüssel in `boxes` |
| `showModuleTitle` | `boolean` | `true` | nein | Kartenkopf |
| `placeholderContext` | `{className, subjectName, locale, summaries}\|null` | `null` | nein | Was `current` und `summaries.*` in den Platzhaltern meinen; `subjectName` und `className` wählen auch das Fach bzw. die Klasse der Materiallinks. Ein `placeholderContext` im Payload von `update(data)` ersetzt ihn |
| `onLinkActivated` | `({ link, boxKey, sectionKey }) => void` | `null` | nein | Nach der Navigation über einen Materiallink |
| `slData` | `SlData` | – | ja | Daten-Port (`sl/slData.js`) für Kennzahlen, Repeat-Blöcke und Materiallinks; tba3 baut ihn mit `slDataFromStore(dataStore)` |
| `appState`, `onNavigate` | – | aus `_childOptions()` | ja | Materiallinks (`onNavigate` ist `showView` der App) |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `update(data)` | Aufruf | Neuen `boxKey` / Kontext rendern |
| `getExportIdentity()` | Override | `[boxKey, aktiver Abschnitt]`, jede Kombination ist ein eigenes Exportziel |
| `getExportControlDefinition()` | Override | Nur mit Abschnitten exportierbar |
| `onLinkActivated()` | Callback | siehe Optionen |
| Abschnitts-Buttons | intern | Klick wechselt den Abschnitt und ruft `syncExportControls()` |
