# EnStudentInfoTableModule

## Zweck
Die einzeilige EN-Kopf-Tabelle einer Schüler:in: Geschlecht, Merkmale, je Domäne eine Spaltengruppe aus Verteilungsleiste (richtig | unbearbeitet | falsch) und GER-Stufe, im Domänen-Modus zusätzlich die Prozentwerte der Stil-Kategorien dieser Domäne. Der Kopf einer Spaltengruppe ist der Domänenname der Daten und verlinkt den Glossareintrag seiner Domänen-Id (`resolveDomainEntryKey`). Der Domänen-Schalter blendet Spalten um.

## Design/Idee

Ein einzeiliger Ausschnitt aus der Lerngruppentabelle, welcher ausschließlich die Merkmale der/des ausgewählten Schüler:in zeigt.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` oder `aggregations` | `type=students` | `id`¹ (findet die gezeigte Person), `domain.id`¹, `domain.name` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Domänen (`domain.id`, `domain.name`) kommen aus beiden Personendokumenten und aus `competence-levels.json`; den Namen je Id liefert die erste Zeile, die ihn trägt (`competence-levels` `type=students` zuerst). Zu `domain.id` siehe die Zwei-Domänen-Regel in [datenvertrag.md](../../../../docs/datenvertrag.md#anfragen-je-dashboard).

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`) | `domain.id`, `competenceLevels[0].nameShort` | Die GER-Spalte der Domäne zeigt „–“ |
| `aggregations` (`type=students`) | `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, `.total` (nach `value` gelesen, in beliebiger Reihenfolge) | Leere Verteilungsleiste. Fehlt nur einer der drei Einträge, bleibt nur sein Segment leer; die anderen Anteile beziehen sich weiter auf `total`, ohne `total` bleibt die Leiste leer |
| `competence-levels`, `aggregations` (`type=students`) | `covariates[gender]` (gelesen aus dem Dokument, das die Person anlegt, `competence-levels` zuerst) | Spalte „Geschlecht“ bleibt leer |
| `competence-levels`, `aggregations` (`type=students`) | `covariates[trait]` (ebenso) | Zelle „Merkmale“ zeigt „–“ mit Tooltip `general.messages.no-traits` |
| `aggregations` (`type=students`) | `aggregations[type=style]` (Kategorien aus allen Zeilen in der Reihenfolge ihres ersten Auftretens, Werte der Person) | Keine Stilspalten im Domänen-Modus; fehlt nur der Wert der Person, zeigt die Zelle „–“ |

Dokumente: `static documents` nennt die Datasets `en.studentRecords` (`EN_DATASETS.STUDENT_RECORDS`), `en.traitLabels` (`EN_DATASETS.TRAIT_LABELS`, die Payload-Beschriftung der Merkmale, die das Glossar nicht kennt) und `en.config` (`EN_DATASETS.CONFIG`). `_readStudentRecords()` liest `en.studentRecords` und ergänzt jede Zeile um die `d0*`/`d1*`-Felder aus `buildEnDomainFields`, die Basis sucht darin die Person, ohne Treffer leert sich die Tabelle. Aus `en.config` liest sie `domainIds`, `domainLabels` und `styleCategories`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `domainMode` | `string \| Signal<string>` | `'all'` | nein | Domänen-Modus: ein Modus-Signal, dem die Tabelle über ihren `DomainModeController` folgt, oder ein fester Wert; gebaut wird für den Anfangswert |
| `glossaryKey` | `string` | – | ja | Titel und Tutorial |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_readStudentRecords()` | Override | Die Datensätze aus `en.studentRecords` mit ihren Domänenfeldern |
