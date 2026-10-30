# InfoBoxModule

## Zweck
Die SL-Hinweis-Karte („Kasten“): rendert eine Box aus `public/data/sl/info-boxes.json` mit Abschnitten (Icon-Buttons, Typen `general`, `praise`, `alarm`), Textblöcken mit `{{…}}`-Platzhaltern, die gegen die geladenen Daten aufgelöst werden, Repeat-Blöcken (je Lerngruppe, Fach oder Domäne des Fachs ausgerollt) und Materiallinks auf die Materialseiten (`onOpenMaterial`). Eine Instanz kann nacheinander mehrere Boxen zeigen (`boxKey`).

## Design/Idee

Neben der graphischen Darstellung wünschten die entwickelnden Schulleitungen explizit eine Verbalisierung ausgewählter Teilergebnisse. Der rechtsseitige Info-Kasten enthält drei über Symbole wählbare Abschnitte, in welchen mithilfe von kurzen Textbausteinen automatisiert einzelne Ergebnisse aufgegriffen werden. Zentrale Metrik des fächer- und lerngruppenübergreifenden Vergleichs ist dabei der Anteil der SuS, der eine bestimmte Kompetenzstufe erreicht. Der erste Abschnitt fasst allgemeine Wertebereiche und Fach- bzw. Lerngruppenunterschiede zusammen; der zweite Abschnitt greift herausragende Ergebnisse am oberen Ende des Leistungsspektrums heraus (bspw. bestes Fach, beste Lerngruppe); der dritte Abschnitt beschreibt Bereiche erhöhten Entwicklungsbedarfs am unteren Ende des Leistungsspektrums. Darüber hinaus verlinken Schaltflächen zur Materialsammlung, welche aktuell nur Platzhalter enthält, in der tatsächlichen Anwendung jedoch die Brücke zur unmittelbaren Weiterarbeit schaffen soll.

Was eine Box sagt, entscheidet `resolveInfoBox` in `infoBoxContent.js`, ohne DOM: aus Kontext (Store, Palette, Glossar) und dem Payload der Karte (`boxKey`, `placeholderContext`) plus dem zuletzt gezeigten Abschnitt liefert es die Buttons der Abschnitte (Schlüssel, Icon, Tooltip aus `sectionTypes`), den gezeigten Abschnitt (der zuletzt gezeigte, solange die Box ihn hat, sonst der erste) und dessen Einträge, oder `null` ohne Box oder ohne Abschnitte. Das Modul hält nur den Zustand `{ box, section }`, die Buttons, den Leerzustand und den Export. Ein Klick auf einen Abschnitts-Button startet keinen Inhaltsdurchlauf: er löst denselben Payload (`data`) auf dem neuen Abschnitt neu auf. Die Nachbarn sind zustandslos und einzeln testbar: `infoBoxRepeatBlocks.js` rollt Repeat-Blöcke je Lerngruppe (alphabetisch, nur mit Schulzeile), Fach oder Domäne des Fachs der Box (Payload-Reihenfolge; ein Fach ohne Domänen ergibt keine Zeile) aus und bekommt dafür nur den `CompetenceLevelIndex` und den Platzhalterkontext, `infoBoxLinks.js` baut die Material-Links und rankt ihr Fach über die Anteils-Queries des Stores (Ranking-Modus des Abschnitts, sonst seines Typs), `infoBoxSectionDom.js` baut Buttons, Blocklisten, Link-Gruppen und den Leerzustand in ein übergebenes Element. Der Resolver liefert je Textblock Segmente (Text oder aufgelöster Wert; ein Wert, der eine Domäne nennt, auch als Textläufe, deren Domänenlauf den Eintrag zu dieser Domäne dieses Fachs trägt) oder `null`, wenn ein Platzhalter nicht auflöst und der ganze Block entfällt; die Warnung nennt Box, Abschnitt, Parameter und Kontext. Ohne `boxKey` zeigt die Box den Leerzustand, dessen Satz aus `messages.empty` ihres eigenen Glossareintrags kommt; fehlt er, wirft das Modul. Der Leser akzeptiert genau die Formen, die `info-boxes.json` verwendet (`packages/modules/docs/sl-info-box-placeholders.md`).

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹ (`school` findet die Schulzeile, `state` den Landesschnitt; bei mehreren `state`-`id`s entfallen die Landesvergleiche), `id`¹ der Schulzeile, `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` (ohne `total`: `.mean`) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne Schulzeile mit `id` bleibt jede Abfrage leer; Zeilen ohne `subject` fallen weg. Ein Anteil ist `frequency / total` der Zeile, ohne `total` ihr `mean`, wie in den Diagrammen.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain.id` | Alle Zeilen eines Fachs zählen als ein Fach ohne Domänen; Blöcke, die eine Domäne auswählen, entfallen |
| `competence-levels` | Zeilen mit `type=state` (`comparison=state-average`) | Kein Landesvergleich: jeder Satz mit Landesvergleich entfällt (ebenso bei mehreren `state`-`id`s); `empty=` (etwa „keinem Fach“) steht nur, wenn ein Landesschnitt da ist und kein Fach bzw. keine Lerngruppe passt |
| `competence-levels` (`type=students`) | `properties[sp_mean]`, `covariates[group]`, `id` | Die Sätze mit `summaries.selfEfficacy` entfallen |
| `competence-levels` (`type=students`), `aggregations` (`type=students`, `aggregation=result`) | die Felder des Gruppenvergleichs ([groupComparisonConfig](../charts/groupComparison/groupComparisonConfig.md#daten)), nur wenn der Kasten `comparison` erhält | Die Sätze mit `summaries.comparison` entfallen |

Dokumente (`static documents`): `info-boxes.json` und die Datasets `sl.competenceLevelIndex` und `sl.availableMaterialSubjects` (`SL_DATASETS.COMPETENCE_LEVEL_INDEX`, `SL_DATASETS.AVAILABLE_MATERIAL_SUBJECTS`, aus `competence-levels.json`; das zweite nennt die Fächer, zu denen ein Materiallink führen kann). Die Vorlagen stammen aus `public/data/sl/info-boxes.json`, Repo-Prosa und nicht Teil der API; lädt die Datei nicht, scheitert `ensure` und der Render wirft. Aus ihrem `meta` kommen die Locale, die Beschriftung der Materiallinks (`materialLinkLabel`) und die Anführungszeichen der Repeat-Namen (`quotedLabel`).

Payload (nur Auswahl): `{ boxKey, placeholderContext }` als Eigenschaft `data`; jeder neue Wert rendert neu, so lässt sich die Box an Ort und Stelle tauschen. `boxKey` ist ein Schlüssel in `boxes`; ohne ihn zeigt die Box den Leerzustand (noch nichts zu sagen), ein unbekannter Schlüssel warnt. `placeholderContext` (`{groupName, subjectName, comparison}`) sagt, was `current` in den Platzhaltern meint; `subjectName` und `groupName` wählen auch das Fach bzw. die Lerngruppe der Materiallinks. Die Kennzahlen unter `summaries.*` rechnet die Karte selbst aus dem Store: `summaries.selfEfficacy` ist das Dataset `sl.selfEfficacySummary` (`SL_DATASETS.SELF_EFFICACY_SUMMARY`, `buildSelfEfficacyInfoBoxSummary` über `sl.selfEfficacyByGroup` und `sl.selfEfficacySchool`), `summaries.comparison` entsteht nur, wenn der Payload `comparison` trägt — die Auswahl des Gruppenvergleichs (`{ chartType, subjectIndex, category, scopeFilter, group1, group2 }`) —, als Dataset `GROUP_COMPARISON_SUMMARY` (`groupComparisonSummary.js`), mit der Auswahl gelesen und je Auswahl gebaut. Die Anteile aller Platzhalter und Links liest die Karte aus dem Dataset `COMPETENCE_SHARES` (`slCompetenceShares.js`).

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showModuleTitle` | `boolean` | `true` | nein | Kartenkopf |
| `context` | `ModuleContext` | – | ja | Liest Palette (Stufen eines Bandalias wie `ge_medium`), Glossar (Domänenlinks über `resolveDomainEntryKey`) und Dokumentspeicher |
| `onOpenMaterial` | `({ subject, type }) => Promise<void>` | – | nein | Öffnet die Materialseite zu Fach und Typ eines Materiallinks; ohne sie sind die Links deaktiviert |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `data` | Eigenschaft (reaktiv) | Neuen `boxKey` / Kontext setzen; startet den Inhaltsdurchlauf |
| `getExportIdentity()` | Override | `[boxKey, aktiver Abschnitt]`, jede Kombination ist ein eigenes Exportziel |
| `_getExportType()` | Override | `'visual'`, nur mit Abschnitten exportierbar |
