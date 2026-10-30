# EnGroupTableModule

## Zweck
Die Lerngruppentabelle des EN-Dashboards: eine Zeile je Schüler:in mit ID, Name, Geschlecht, Merkmalen, je Domäne einer Spaltengruppe aus Verteilungsleiste (richtig | unbearbeitet | falsch) und GER-Stufe, dazu im Domänen-Modus die Prozentwerte der Stil-Kategorien. Der Kopf einer Spaltengruppe ist der Domänenname der Daten und verlinkt den Glossareintrag seiner Domänen-Id (`resolveDomainEntryKey`). Der Domänen-Schalter blendet Spalten um, ohne die Tabelle neu zu bauen. Die Tabelle meldet ihre ausgewählten, sonst sichtbaren Zeilen als ID-Liste (`onDataSync`), und ihr Kopf trägt den Such-Button, der den Streudiagramm-Dialog öffnet.

## Design/Idee

Die Tabelle stellt die Ergebnisse der Lerngruppe umfassend und erschöpfend dar. Aus der Sorge, den individuellen Bedürfnissen von Lehrkräften mit keiner Vorauswahl vollständig gerecht werden zu können, entschied sich die Entwicklungsgruppe stattdessen für eine Abbildung aller Daten, welche aber in der weiteren Betrachtung schnell und einfach auf individuelle Interessen zugeschnitten werden kann. Filtern und Sortieren funktioniert wie in gängigen Softwarelösungen, außerdem können Spalten der Tabelle ausgeblendet werden. Es stehen vordefinierte Filter zur Verfügung („Stärkste 5“, „Schwächste 5“), um neben der freien Exploration Anhaltspunkte bzw. Ideen zur gezielten Suche zu liefern. Die Tabelle soll der Lehrkraft u.a. helfen, Erwartungen abzugleichen, auffällige SuS zu identifizieren oder erste hypothesengeleitete Gegenüberstellungen (z.B. männliche vs. weibliche SuS) vorzunehmen.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` oder `aggregations` | `type=students` | `id`¹ (wird `studentId`: Tabellenindex, ID-Link, Streudiagramm-Filter, Sync), `domain.id`¹, `domain.name`; die Zeilen sind die Vereinigung beider Dokumente über `id`, `properties[firstName]`¹, `properties[lastName]`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Domänen (`domain.id`, `domain.name`) kommen aus beiden Personendokumenten und aus `competence-levels.json`; den Namen je Id liefert die erste Zeile, die ihn trägt (`competence-levels` `type=students` zuerst). Zu `domain.id` siehe die Zwei-Domänen-Regel in [datenvertrag.md](../../../../docs/datenvertrag.md#anfragen-je-dashboard).

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`) | `domain.id`, `competenceLevels[0].nameShort` | Die GER-Spalte der Domäne zeigt „–“ |
| `aggregations` (`type=students`) | `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, `.total` (nach `value` gelesen, in beliebiger Reihenfolge) | Leere Verteilungsleiste. Fehlt nur einer der drei Einträge, bleibt nur sein Segment leer; die anderen Anteile beziehen sich weiter auf `total`, ohne `total` bleibt die Leiste leer |
| `competence-levels`, `aggregations` (`type=students`) | `covariates[gender]` (gelesen aus dem Dokument, das die Person anlegt, `competence-levels` zuerst) | Spalte „Geschlecht“ leer |
| `competence-levels`, `aggregations` (`type=students`) | `covariates[trait]` (ebenso) | Zelle „Merkmale“ zeigt „–“ mit Tooltip `general.messages.no-traits`; der Merkmalsfilter führt die Person unter „Keine“ |
| `aggregations` (`type=students`) | `aggregations[type=result]` mit `value` `Richtig` (`descriptiveStatistics.frequency`) | Die beiden Presets (stärkste und schwächste fünf) lassen die Person aus |
| `aggregations` (`type=students`) | `aggregations[type=style]` (Kategorien aus allen Zeilen in der Reihenfolge ihres ersten Auftretens, Werte je Person) | Keine Stilspalten im Domänen-Modus; fehlt nur der Wert einer Person, zeigt ihre Zelle „–“ |

Dokumente: `static documents` nennt die Datasets `en.studentRecords` (`EN_DATASETS.STUDENT_RECORDS`), `en.traitLabels` (`EN_DATASETS.TRAIT_LABELS`: die Beschriftung der Merkmal-Chips, wo das Glossar einen Code nicht kennt) und `en.config` (`EN_DATASETS.CONFIG`). Payload: keiner; `_readStudentRecords()` liest die Datensätze aus `en.studentRecords` und formt daraus die Zeilen (Identität, Summen für die Presets und die `d0*`/`d1*`-Felder aus `buildEnDomainFields`); der Sync zum Stil-Chart trägt nur `studentId`-Listen. Die Stil-Spalten lesen den Anteil der gewählten Domäne; ein Moduswechsel schreibt keine Zeile um. Je Domäne gibt es einen GER-Filter (`d0Ger`, `d1Ger`), nach der Skala geordnet, der auch steht, solange der Modus die Spalte verbirgt. Aus `en.config` liest die Tabelle `domainIds`, `domainLabels` und `styleCategories`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `domainMode` | `string \| Signal<string>` | `'all'` | nein | Domänen-Modus: ein Modus-Signal, dem die Tabelle über ihren `DomainModeController` folgt, oder ein fester Wert; gebaut wird für den Anfangswert |
| `onDataSync` | `(data) => void` | – | nein | `{ ids }`: die ausgewählten Zeilen in Auswahlreihenfolge, sonst die sichtbaren in Anzeigereihenfolge |
| `onOpenScatterSearch` | `() => void` | – | nein | Klick auf den Such-Button im Kopf |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `static selectableRows` | Override | `true`: mehrere Zeilen wählbar, die Auswahl geht an `onDataSync` |
| `_readStudentRecords()` | Override | Die Zeilen aus den Datensätzen in `en.studentRecords` |
| `applyExternalStudentFilter(studentIds)` | Aufruf | Persistenter Filter auf `studentId`; überlebt Presets und Neuaufbau, `null` oder leere Menge löscht; der Reset-Button löscht ihn mit |
| `_onDisplayedRowsChanged({ rows, selected })` | Override | Ruft `onDataSync`; ein Domänenwechsel leert die Auswahl, sortiert nach der gewählten Spalte neu (die Stilspalten zeigen die neue Domäne) und rankt die Presets neu, alles kommt als eine Meldung an |
| `externalStudentIds` | Getter | Die Personen, die der Streudiagramm-Filter zeigt (leer: kein Filter) |
| `getExportIdentity()` | Override | Der Domänen-Modus |
