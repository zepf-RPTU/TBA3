# MaGroupTableModule

## Zweck
Die MA-Lerngruppenübersichtstabelle: eine Zeile je Schüler:in mit ID-Link, Name, Geschlecht, Merkmalen, „Richtig“ (Zelle „x von N“, N sind die Aufgaben im Testheft der Person, Unbearbeitet eingeschlossen), Verteilungsbalken (richtig | unbearbeitet | falsch) und Kompetenzstufe, dazu die Presets „Stärkste 5“, „Schwächste 5“ und „Knapp an der Stufengrenze“ (Schüler:innen, die ein Punkt mehr oder weniger in eine andere Kompetenzstufe brächte). Das Menü „Aufgabenpool“ in der Werkzeugleiste (nur bei mehr als einem Pool) schaltet die Tabelle in place auf Gesamt oder eine Leitidee um; auf einer Leitidee entfallen die Kompetenzstufen-Spalte und ihr Filter, und das Schwellenwert-Preset steht ausgegraut, weil Kompetenzstufen nur für das ganze Testheft definiert sind. Der Untertitel nennt bei jedem Pool, worauf die Lösungsquoten beruhen: das ganze Testheft oder die Leitidee, mit ihrer Aufgabenzahl. „Ansicht zurücksetzen“ kehrt auch zu Gesamt zurück.

## Design/Idee

Die Tabelle stellt die Ergebnisse der Lerngruppe umfassend und erschöpfend dar. Aus der Sorge, den individuellen Bedürfnissen von Lehrkräften mit keiner Vorauswahl vollständig gerecht werden zu können, entschied sich die Entwicklungsgruppe stattdessen für eine Abbildung aller Daten, welche aber in der weiteren Betrachtung schnell und einfach auf individuelle Interessen zugeschnitten werden kann. Filtern und Sortieren funktioniert wie in gängigen Softwarelösungen, außerdem können Spalten der Tabelle ausgeblendet werden. Es stehen vordefinierte Filter zur Verfügung („Stärkste 5“, „Schwächste 5“, „Knapp an der Stufengrenze“), um neben der freien Exploration Anhaltspunkte bzw. Ideen zur gezielten Suche zu liefern. Der den Ergebnissen zugrundeliegende Aufgabenpool kann auf einzelne Leitideen eingegrenzt werden. Die Tabelle soll der Lehrkraft u.a. helfen, Erwartungen abzugleichen, auffällige SuS zu identifizieren oder erste hypothesengeleitete Gegenüberstellungen (z.B. männliche vs. weibliche SuS) vorzunehmen.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (eine Zeile je Person, ID-Link, Schlüssel der Zählungen), `properties[firstName]`¹, `properties[lastName]`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Zählungen werden über die `id` zugeordnet.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `aggregations` (`type=students`) | `id`, `domain.id`, `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency` (Gesamt: je Person über alle Zeilen summiert; Leitidee: die Zeile der Person mit dieser `domain.id`) | „Richtig“ steht auf 0 ohne N, der Balken zeigt „Keine Daten“, „Stärkste/Schwächste 5“ zeigen fünf beliebige Personen mit 0 |
| `competence-levels` (`type=students`) | `competenceLevels[0].nameShort` (die Stufe der Person) | Kompetenzstufen-Zelle zeigt „–“ |
| `items` | Lerngruppenzeilen (`type=group`) mit `domain.id`, `domain.name`, `items[].iqbId` (die Leitideen-Pools) | Ohne zwei Leitideen mit Aufgaben kein Aufgabenpool-Menü und kein Untertitel; die Tabelle zeigt Gesamt |
| `competence-levels` (`comparison=…`) | `properties[equivalenceTable:<booklet>]` der Zeile mit `type=group`, genau eine Tabelle mit `maxScore` gleich `itemCount` (eine Testgruppe schreibt genau ein Testheft) | „Knapp an der Stufengrenze“ fehlt: das Preset vergleicht `correctCount`, die Zahl gelöster Aufgaben, und das ist nur bei einem Punkt je Aufgabe dieselbe Skala wie die der Schwellen |
| `competence-levels` (`type=students`) | `covariates[gender]` | Zelle „Geschlecht“ leer; die Person fällt aus jeder Auswahl des Geschlechtsfilters außer „Alle“ |
| `competence-levels` (`type=students`) | `covariates[trait]` | Zelle „Merkmale“ zeigt „–“ mit Tooltip `general.messages.no-traits`; der Merkmalsfilter führt die Person unter „Keine“, die Sortierung stellt sie ans Ende |

Dokumente: `static documents` nennt die Datasets `ma.studentRecords`, `ma.traitLabels` (die Beschriftung der Merkmal-Chips, wo das Glossar einen Code nicht kennt), `ma.studentRecordsByDomain`, `ma.groupCompetenceLevelThresholds` und `ma.itemPools` (die Einträge des Pool-Menüs, Gesamt zuerst; der Name einer Leitidee im Untertitel), alle aus `MA_DATASETS`. `_readStudentRecords()` liest für den Pool Gesamt `ma.studentRecords`, auf einem Leitideen-Pool den Eintrag des Pools aus `ma.studentRecordsByDomain` (die Zeilen von `students-aggregations.json` mit der `domain.id` der Leitidee). Weil Gesamt und Leitideen dieselben Aggregationszeilen lesen, addieren sich die Leitideen zu Gesamt, auch mit Aufgaben ohne IQB-ID. Das Filtermenü ordnet die Kompetenzstufen nach der Skala, die `competence-levels.json` beim Laden registriert. `_getPresets` liest `ma.groupCompetenceLevelThresholds`, `null` ohne passende Tabelle der Lerngruppenzeile; `null` schaltet das Preset „Knapp an der Stufengrenze“ ab.

Einen Payload liest die Tabelle nicht.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `onCompetenceLevelFilterChanged` | `(levels: string[]) => void` | – | nein | Die Stufen des Kompetenzstufen-Filters nach jeder ihrer Änderungen (Menü, Balken, Reset, Pool-Wechsel); leer ohne Filter |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `toggleCompetenceLevelFilter(level)` | Aufruf | Stufe in den Kompetenzstufen-Filter aufnehmen oder, wenn er sie schon hält, herausnehmen; eine Leitidee hat die Spalte nicht, dort ändert sich nichts |
| `_readStudentRecords()` | Override | Schüler:innen-Datensätze des aktiven Pools aus dem Store (siehe Daten) |
| `_tableHeaderActions()` | Override | Das Menü „Aufgabenpool“ (eine Radio-Zeile je Pool) vor Spalten- und Filtermenü. Den gewählten Pool hält ein Signal, das Menü und Reset schreiben; ein Wechsel liest die Zeilen neu, aufgeschoben, solange die Tabelle verdeckt ist oder baut, und schnelle Wechsel enden auf dem jüngsten Pool. Er stellt Spalten, Zeilen und Presets in place auf den Pool um; Filter bleiben, der KS-Filter fällt mit seiner Spalte; ein aktives Rang-Preset bleibt und rankt über den neuen Pool; „Knapp an der Stufengrenze“ bleibt auf einer Leitidee ausgegraut stehen, ein aktives endet |
| `_onTableReset()` | Override | Reset wählt wieder Gesamt, falls eine Leitidee gewählt ist |
| `_reloadRows()` | Override | Setzt vor jedem Laden der Zeilen (erster Aufbau, jeder Pool-Wechsel) den Untertitel des gezeigten Pools: `pool-hint-all` auf Gesamt, `pool-hint` bzw. `pool-hint-single-item` auf einer Leitidee; ohne Leitideen-Aufteilung keinen. Die Aufgabenzahl ist das größte N der Zeilen (aus den Ergebnissen, auch Aufgaben ohne IQB-ID) |
| `getExportIdentity()` | Override | Die id der Leitidee, `null` auf Gesamt; jeder Pool ist ein eigenes Exportziel |
