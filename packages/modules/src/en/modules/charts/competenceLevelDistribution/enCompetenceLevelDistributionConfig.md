# ChartHostModule + enCompetenceLevelDistributionConfig

## Zweck
Die Verteilung der GER-Stufen einer Domäne als gestapelte Balken: eine Säule für die Lerngruppe, daneben je eine für jede gelieferte Vergleichsgruppe (Schule, Land, …), sichtbar nach den ⌀-Schaltern. Eine Instanz zeigt eine Domäne (`domainId`), die Prozentachse auf der Seite `yAxisSide`.

## Design/Idee

Die klassische Darstellung der Kompetenzstufenverteilung (bzw. GER-Stufenverteilung) als stacked bar chart („Kompetenzbänder“) war eine der ersten Darstellungsformen der entwickelnden Lehrkräfte; sie hat sich aus Sicht der Lehrkräfte bewährt. Die Darstellung der Verteilungen von Schule und Land waren innerhalb der Entwicklungsgruppe umstritten und können daher optional ein- oder ausgeblendet werden.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `comparison=school-average,state-average` | `type`¹ (`group` ist die Lerngruppe, jede andere Zeile eine Vergleichsgruppe), `id`¹ (Schlüssel jedes Balkens, bei Vergleichszeilen auch des ⌀-Schalters), `name` (Achsenbeschriftung, je Zeile eindeutig), `domain.id`¹ (die Karte filtert je Domäne), `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.mean` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `domain.id` erhält die Karte keine Zeilen und bleibt leer. Die Lerngruppe ist immer sichtbar, Achsenbeschriftung mit dem Glossarbegriff „Lerngruppenschnitt“. Eine Vergleichszeile trägt den Begriff ihres `type` (`school` „Schulschnitt“, `state` „Landesschnitt“); für jeden anderen Typ hat das Glossar keinen Begriff, die Beschriftung ist dann nur der `name`. Mit `total` sind Anteile `frequency / total`, nicht `mean`, das der Server auf vier Stellen rundet; eine Zeile mit `total` 0 steht in jeder Stufe auf 0 %. Der Tooltip zeigt je Segment die `frequency` der eigenen Zeile, auch bei Vergleichszeilen. Zwei Zeilen mit gleichem `name` brechen das Zeichnen ab (die Balken sind nach Namen angeordnet).

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`comparison=…`) | Vergleichszeilen | Nur die Lerngruppensäule, kein ⌀-Menü |
| `competence-levels` | `competenceLevels[].descriptiveStatistics.total`, `.frequency` | Anteil aus `mean`; Tooltip und Datentabelle ohne Anzahl |

Dokumente: Der Descriptor nennt in `documents` `competence-levels.json`. `createRenderer(host)` filtert `competence-levels.json` auf die Option `domainId` und reicht diese Zeilen unverändert an `parseCompetenceLevels` (`competenceLevelAdapter.js`). Die Stufenfolge kommt aus der Zeile mit den meisten Stufen; ohne Stufen in irgendeiner Zeile bleibt die Karte leer. Gezeichnet wird mit dem gemeinsamen `CompetenceLevelDistributionChart` (`common/charts/competenceLevelDistribution/`), der `yAxisSide` als `valueSide` erhält; den Glossarbegriff jeder Achsenbeschriftung bestimmt dort der `type` der Zeile (`averageRoleGlossaryKey`).

Datentabelle: die Tabelle ist die `dataTable()` des `CompetenceLevelDistributionChart`: eine Zeile je gezeichnetem Balken, also nur die eingeblendeten Vergleichsgruppen, mit `Gruppe`, `Anzahl Schüler:innen` (`total`) und je Stufe Anteil und Anzahl (`15,4 % (4)`; im Export zwei Felder `<Stufe> Anteil (%)` und `<Stufe> Anzahl Schüler:innen`). Eine Zeile ohne `total` (ein Landesschnitt nur mit Anteilen) zeigt und exportiert nur die Anteile.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `domainId` | `string` | – | ja | Welche Domäne die Karte zeigt: eine Id aus `EN_DATASETS.CONFIG.domainIds`; ohne sie wirft der Render |
| `yAxisSide` | `'left' \| 'right'` | – | ja | Seite der Prozentachse |
| `glossaryReplacements` | `{ Domäne }` | – | nein | Der Domänenname der Daten für `{{Domäne}}` in Titel und Tutorial, als Textlauf mit dem Glossareintrag der Domänen-Id (`resolveDomainEntryKey`); ohne ihn bleibt der Name im Titel leer |
| `showModuleTitle` | `boolean` | `true` | nein | Descriptor-Default |

## Methoden
Keine eigenen.
