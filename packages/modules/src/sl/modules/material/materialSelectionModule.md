# MaterialSelectionModule

## Zweck
Zeigt die SL-Materialseiten: pro Kombination aus Fach (die Fächer des Datensatzes, in dessen Reihenfolge) und Seitentyp (Übersicht, Ergebniszusammenfassung) eine HTML-Seite; für jede andere Auswahl „Keine Daten“. Fach und Seitentyp kommen als Optionen, sodass eine Instanz nacheinander jede Kombination anzeigt. Lösungsquote, Anteil ab Regelstandard, Landesvergleich und Vergleich mit dem letzten früheren Jahr, Spannweite und beste Lerngruppe stehen je Domäne; Getestete und Befragung je Fach. Domänen zählen nur, wenn sie eigene Kompetenzstufen haben: ein Fach mit Kompetenzstufen auf Fachebene (Mathematik) ist eine Zeile über das ganze Fach.

## Design/Idee

Das Auswahlmenü, mit dem der (unbestückte) Katalog durchsucht werden kann, sieht exemplarisch vier verschiedene Inhalte vor (Übersicht, Ergebniszusammenfassung, Datensicht, Leitfragen), welche jeweils fachweise oder aber fachübergreifend zugeordnet werden sollen; im Prototyp sind nur Übersicht und Ergebniszusammenfassung je Fach befüllt. Neben Berichtsseiten, die aus den Daten Ergebnisse und Informationen zur Testung selbst abbilden, sollen außerdem Materialien vorkommen, die unmittelbar in die Umsetzung unterrichts- oder schulentwickelnder Maßnahmen überführen (bspw. Leitfragen für Gespräche mit Klassen-/Fachlehrkräften, Tabellenvorlagen für Zeitpläne, konkret ausformulierte Schritt-für-Schritt-Pläne etc.).

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹ (`school` findet die Schulzeile, `state` den Landesschnitt), `id`¹ der Schulzeile, `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` (ohne `total`: `.mean`), `properties[booklet]`¹ (kommagetrennt bei mehreren) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne Schulzeile mit `id` bleiben Lerngruppenliste, Verteilungen, Anteile und Lösungsquoten leer („–“); Zeilen ohne `subject` fallen weg. Die Verteilungssäulen und der Anteil ab Kompetenzstufe rechnen `frequency` durch das `total` der Zeile, eine Zeile ohne `total` (Landesschnitt nur mit Anteilen) ihr `mean`. Nennen die Zeilen einer Domäne zwei oder mehr Testhefte, bleiben ihre Lösungsquoten „–“, ihre Sätze entfallen, und beide Seiten sagen in einer Notiz warum, im geteilten Fach mit den Namen dieser Domänen (`mixedBooklets` je Domäne). Die VERA-Stufe des Badges (`VERA-8`) ist das `V<Stufe>`-Segment der Testheft-ids der Schul- und Lerngruppenzeilen des Fachs; nennen sie keine oder mehrere Stufen, zeigt das Badge nur „VERA“.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain` | Das Fach gilt als Fach ohne Domänen; zwei Zeilen derselben Gruppe eines Fachs ohne `domain` weist der Store ab (`DocumentShapeError`) |
| `competence-levels` | Zeilen mit `type=state` (`comparison=state-average`) | Säule „Land“ zeigt „–“, der Satz zum Anteil ab Regelstandard entfällt |
| `competence-levels` | mehrere `state`-`id`s (nach Track geteilter Landesschnitt) | Die Säule „Land“ und die Abstände zum Landesmittelwert bleiben leer: es gibt keinen einzelnen Landesschnitt |
| `aggregations` (`type=school,group`, `aggregation=result`) | `id` (Schulzeile wie die Schul-`id`, Lerngruppenzeilen wie ihre `id` in `competence-levels`), `subject.name`, `domain.id` (wie in `competence-levels`; ohne Domäne dort zählen alle Zeilen des Fachs zusammen), `aggregations[type=result]` mit `value` und `.frequency` (Richtig gegen die Summe aller drei) | Spalte „Ø Lösungsquote“ zeigt „–“, der Satz zur besten Lerngruppe entfällt |
| `aggregations` (`comparison=state-average`) | Zeilen mit `type=state` und dem `Richtig`-`mean`, je Domäne; für ein Fach ohne Domänen-Kompetenzstufen (Mathematik) die Landeszeile ohne `domain` | Der Satz zur Lösungsquote im Landesvergleich entfällt |
| `competence-levels` (frühere Jahre, `properties[testPeriod]`) | Schulzeilen mit `properties[testPeriod]`, im aktuellen und einem früheren Jahr, mit `.frequency`/`.total` (ohne `total`: `.mean`) | Der Satz zum früheren Jahr entfällt |
| `competence-levels` (`type=students`) | `covariates[group]` (gleich `name` der Lerngruppenzeile), `subject.name`, `domain.id` | Ein Fach mit einer Domäne zählt als Getestete das `total` der Lerngruppenzeile, wie die Lerngruppentabelle; ein nach Domänen geteiltes Fach zählt „0“, die Tabelle Lerngruppenergebnisse bleibt leer, Spannweiten „–“ |
| `competence-levels` (`type=students`) | `covariates[gender]` | Der Anteil weiblich rechnet nur über die Schüler:innen mit Geschlechtsangabe; hat keine eine, zeigt die Zelle nur die Anzahl ohne Anteil |
| `competence-levels` (`type=students`) | `properties[tq_mean]`, `properties[sp_mean]` | Die Spalten „Ø berichtete Unterrichtsqualität“ bzw. „Ø Selbstwirksamkeit“ und ihre Sätze entfallen |

Dokumente (`static documents`): die Datasets `sl.availableMaterialSubjects` (`SL_DATASETS.AVAILABLE_MATERIAL_SUBJECTS`) und `sl.materialSubjectContext` (`MATERIAL_SUBJECT_CONTEXT`, `materialSubjectContext.js`), dessen Eingaben `sl.competenceLevelIndex`, `sl.resultSections`, `sl.surveyRows`, die beiden Survey-Indizes, `sl.longitudinalIndex` und die Anteils- und Lösungsquoten-Abfragen sind (gebaut aus `competence-levels.json`, `aggregations.json`, `prior-years.json` bzw. `students-competence-levels.json`).

Payload: keiner; die Auswahl sind die Optionen `subject`/`type` (als `state.subject`/`state.type`); ein Effekt zeigt bei jedem Wechsel die neue Seite. Eine Seite gibt es für jedes Fach des Datensatzes (`SL_DATASETS.AVAILABLE_MATERIAL_SUBJECTS`: die Fächer der schuleigenen Zeilen, in Payload-Reihenfolge) und jeden Seitentyp in `MATERIAL_PAGES` (Übersicht und Ergebniszusammenfassung); `Gesamt` und die Typen ohne Seite sind in `MATERIAL_TYPE_OPTIONS` `disabled`. Nennt die Auswahl kein Fach des Datensatzes oder einen Typ ohne Seite, zeigt das Modul „Keine Daten“. Die Zahlen liest das Dataset `sl.materialSubjectContext` synchron aus dem Dokumentspeicher und rechnet Anteile mit den `CompetenceShareQueries` und Lösungsquoten mit `SolutionRateQueries`; der Vergleich mit einem früheren Jahr liest den Anteil ab Regelstandard der letzten beiden Jahre mit Ergebnissen je Domäne aus `sl.longitudinalIndex` und nennt das frühere Jahr (`testPeriod`) im Satz („Im Vergleich zu 2023 …“): fehlt der Domäne ein Jahr, ist es nicht das Vorjahr. Ein Satz, dessen Zahl fehlt, entfällt.

Die Schwellen der wertenden Wörter (`MATERIAL_PHRASE_THRESHOLDS`; Anteile in Prozentpunkten, Befragungswerte in Punkten der Skala 1–5, `RATING_DOMAIN`):

| Satz | Zahl | Wort |
|---|---|---|
| Lösungsquote zum Landesmittelwert | Schule − Land, Betrag | < 5 → „etwas“, ab 5 → „deutlich“; bei Gleichstand „auf Höhe von“ ohne Wort |
| Lerngruppen unterscheiden sich im Ergebnis | max − min der Lösungsquoten der Lerngruppen | < 10 → „kaum“ / „eher homogen“, < 20 → „moderat“ / „eher heterogen“, sonst „deutlich“ / „heterogen“ |
| Lerngruppen unterscheiden sich in Unterrichtsqualität bzw. Selbstwirksamkeit | max − min der Mittelwerte der Lerngruppen | < 0,3 → „kaum“, < 0,6 → „moderat“, sonst „deutlich“ |
| Unterrichtsqualität | Mittelwert der Schule | Drittel der Skala: < 2,33 → „schlecht“, < 3,67 → „mittelmäßig“, sonst „gut“ |
| Selbstwirksamkeit | Mittelwert der Schule | dieselben Drittel: „gering“, „moderat“, „hoch“ |
| Vergleich mit dem früheren Jahr | Anteil ab Regelstandard, dieses Jahr − letztes früheres Jahr mit Ergebnissen | innerhalb ± 2 → „gleich“, darüber „besser“, darunter „schlechter“ |

„über“/„unter“ und „mehr“/„weniger“/„gleich viele“ folgen allein dem Vorzeichen der Differenz.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `context` | `ModuleContext` | – | ja | Liest Palette (Stufen und Farben der Verteilungen), Glossar (Domänenlinks über `resolveDomainEntryKey`) und Dokumentspeicher |
| `subject` | `string \| Signal<string>` | – | ja | Das Fach, wie der Payload es nennt; als Signal folgt ihm das Modul |
| `type` | `string \| Signal<string>` | – | ja | Der Seitentyp; als Signal folgt ihm das Modul |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_getExportType()` | Override | `'visual'` |
| `getExportIdentity()` | Override | `[subject, type]`, jede Kombination ist ein eigenes Exportziel |
