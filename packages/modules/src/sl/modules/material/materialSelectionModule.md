# MaterialSelectionModule

## Zweck
Zeigt die Seiten des SL-Bereichs „Material“: pro Kombination aus Fach (Gesamt, Deutsch, Mathematik, …) und Seitentyp (Übersicht, Ergebniszusammenfassung, Datensicht, Leitfragen) eine HTML-Seite. Die Auswahl trifft der View-Header, sodass eine Instanz nacheinander jede Kombination anzeigt. Für eine Kombination ohne Inhalt erscheint ein „in Bearbeitung“-Hinweis statt einer leeren Karte.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - **MaterialSelectionModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹ (`school` findet die Schulzeile, `state` die Landesschnitte), `id`¹ der Schulzeile, `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.mean`, `.frequency`, `.total` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne Schulzeile mit `id` bleiben Klassenliste, Verteilungen und Anteile leer („—“), mit der Klassenliste auch die Lösungsquoten der Klassen; die „Ø Lösungsquote“ der Schule und ihr Δ zum Land zeigen weiter Werte, weil sie die `items`-Zeilen über die Klassenzeilen und die `state`-Zeilen lesen, nicht über die Schul-`id`; Zeilen ohne `subject` fallen weg. Die Verteilungssäulen zeichnen `mean`, der Anteil ab Kompetenzstufe rechnet `frequency` durch das `total` der Zeile.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain.id`, `domain.name` | Alle Zeilen eines Fachs zählen als eine Domäne; die Verteilung zeigt je Schule und Land nur die erste Zeile |
| `competence-levels` | Zeilen mit `type=state` (`comparison=state-average`) | Säule „Land“ zeigt „—“, das Δ zum Anteil „—“, der Satz sagt „gleich viele“ |
| `items` (`type=school,group`) | `id` (gleich `id` der Klassenzeile in `competence-levels`), `subject.name`, `items[].descriptiveStatistics.frequency`, `.total` | Spalte „Ø Lösungsquote“ zeigt „—“, die beste Klasse im Fach heißt „[Klasse]“ |
| `items` (`comparison=state-average`) | Zeilen mit `type=state` | Das Δ zur Lösungsquote zeigt „—“, der Satz sagt „auf Höhe von“ |
| `competence-levels` (`type=students`) | `covariates[group]` (gleich `name` der Klassenzeile), `subject.name` | Getestete „0“, die Tabelle Klassenergebnisse bleibt leer, Spannweiten „—“, Badge „VERA-[Klassenstufe]“ |
| `competence-levels` (`type=students`) | `id` | Je Klasse zählt eine Person |
| `competence-levels` (`type=students`) | `covariates[gender]` | Der Anteil weiblich rechnet nur über die Schüler:innen mit Geschlechtsangabe; hat keine eine, zeigt die Zelle nur die Anzahl ohne Anteil |
| `competence-levels` (`type=students`) | `properties[tq_mean]`, `properties[sp_mean]` | Die Spalten „Ø berichtete Unterrichtsqualität“ bzw. „Ø Selbstwirksamkeit“ und ihre Sätze entfallen |

Payload: kein Render-Payload; `init()` und `update()` erhalten nichts. Die Seiten stammen aus `materialContent.json` (mitgebündelt, Repo-Inhalt und nicht Teil der API), Schlüssel `"<Fach>|<Seitentyp>"`. Jeden Eintrag rendert `MaterialContentResolver` (`materialContentResolver.js`: Vorlagen, HTML und Formulierungen). Die Zahlen dahinter liest `MaterialSubjectContext` (`materialSubjectContext.js`) über die Option `slData` (`competenceLevelIndex()`, `items()`, `studentsCompetenceLevels()`, `surveyScales()`, `teachingQuality()`, `selfEfficacyByClass()`, `selfEfficacySchool()`) und rechnet Anteile mit den `CompetenceShareQueries` und Lösungsquoten mit `SolutionRateQueries`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `slData` | `SlData` | – | ja für datengetriebene Seiten | Daten-Port (`sl/slData.js`), an `MaterialContentResolver` und von dort an `MaterialSubjectContext` durchgereicht; tba3 baut ihn mit `slDataFromStore(dataStore)` |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setSelection(selectorId, value)` | Aufruf | `'subject'` oder `'type'` setzen; rendert den Inhalt neu. Vor dem ersten Aufruf gilt `Gesamt` × `Übersicht` |
| `getExportIdentity()` | Override | `[subject, type]`, jede Kombination ist ein eigenes Exportziel |
| `onThemeChanged()` | Override | Beim Wechsel des KS-Farbschemas den Inhalt neu aufbauen: die Kompetenzstufen-Stapel tragen ihre Bandfarbe inline (`--ks-band-color` aus dem `MaterialContentResolver`) und blieben sonst in der alten Palette |
