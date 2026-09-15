# SlLongitudinalViewModule

## Zweck
Der „Längsschnitt“: mehrjährige Zeitreihen der Kompetenzstufenanteile, der Unterrichtsqualität und der Selbstwirksamkeit als bis zu drei Chart-Karten in einer Zeile. Jede Karte entsteht nur, wenn ihr Datenausschnitt existiert. Der Header wählt die Domäne, die normale oder gestapelte Ansicht und den Diagrammtyp; im Boxplot-Modus zeichnet die Unterrichtsqualitätskarte beide Skalen kombiniert und die Selbstwirksamkeitskarte wird ausgeblendet.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **SlLongitudinalViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Unterrichtsqualität (Parallelkoordinaten oder kombinierter Boxplot) | `ChartHostModule` + `teachingQualityConfig` | [teachingQualityConfig.md](../../../packages/modules/src/sl/modules/charts/longitudinal/teachingQualityConfig.md) | Id `sl-long-teaching-quality`, nur mit `tq_mean` (`hasTeachingQuality`) |
| Selbstwirksamkeit (Parallelkoordinaten, im Boxplot-Modus versteckt) | `ChartHostModule` + `selfEfficacyLongConfig` | [selfEfficacyLongConfig.md](../../../packages/modules/src/sl/modules/charts/longitudinal/selfEfficacyLongConfig.md) | Id `sl-long-self-efficacy`, nur mit `sp_mean` (`hasSelfEfficacy`) |
| Kompetenzstufenanteile (immer sichtbar) | `ChartHostModule` + `slKsDistributionConfig` | [longitudinalKsShareConfig.md](../../../packages/modules/src/sl/modules/charts/longitudinal/longitudinalKsShareConfig.md) | Id `sl-long-ks-distribution`, nur mit `competence-levels`-Zeilen |

Alle Hosts erhalten `showSubtitle: false`, werden mit `mount(chartData)` gebaut (Body-Klasse `.longitudinal-chart-body`). Die Verfügbarkeitsprobe der beiden Umfragekarten ist `detectHistorySurveyScales(history)` (`historyAdapter.js`): eine Karte entsteht, wenn `history` für ihre Skala mindestens ein Jahr mit Werten trägt, also genau dann, wenn sie etwas zeichnen kann. Dieselbe Probe entscheidet über den Diagrammtyp-Umschalter des Headers, damit Karten und Control nie auseinanderlaufen.

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=school,students`, `comparison=year` | alle drei Karten (das Dokument roh als `history`: die Kompetenzstufenanteile aus den `school`-Zeilen, Unterrichtsqualität und Selbstwirksamkeit aus den `student`-Zeilen, deren `tq_mean`/`sp_mean` nur die Demo-Fixture liefert); ob die Unterrichtsqualitäts- und die Selbstwirksamkeitskarte entstehen |
| `competence-levels` | `type=school,group` | alle drei Karten (die Klassenzeilen, in `DOMAIN_RESULTS`: welche Bereiche es gibt und in welcher Stufenfolge); ob die Kompetenzstufenkarte entsteht; Domäne-Select des Headers |
| `competence-levels` | `type=students` | Unterrichtsqualität (die Schüler:innen eines Bereichs, in `DOMAIN_RESULTS`) |

Payload: kein App-Payload. Aus dem `DataStore` der abgeleitete Datensatz `DOMAIN_RESULTS`, roh `LONGITUDINAL_HISTORY` und `COMPETENCE_LEVELS`, diesen nur als Verfügbarkeitsprobe. Alle Karten teilen den Payload `{ domainResults, domainArray, history }` — `domainArray` ist `groupDomainResultsBySubjectDomain(domainResults)`, `history` das ganze Zeitreihen-Dokument, aus dem jede Karte ihren Ausschnitt über `historyAdapter.js` nimmt — und die Option `yMax` (`computeSharedYMax` über alle Zeitreihen und Bereiche); gebaut werden sie mit `mount(chartData)`. Die Domänenauswahl ist `buildDomainOptions(domainResults)`; die View schreibt sie beim Render zusammen mit den aktuellen Werten von `selectedDomainIndex`, `longitudinalViewMode` und `longitudinalChartType` in den App-State, damit das `injectState` der Controls sie beim nächsten Header-Render vorfindet.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `selectedDomainIndex` | Domäne-Select des Headers (`domainSelect`) | Unterrichtsqualität und Kompetenzstufenanteile `setDomainIndex(index)` |
| `longitudinalViewMode` (`normal` / `stacked`) | Header-Umschalter (`viewToggle`) | alle drei Hosts `setStacked(isStacked)` |
| `longitudinalChartType` (`parallel` / `boxplot`) | Header-Umschalter (`chartTypeToggle`, nur mit beiden Skalen angeboten) | View-Layout (`--boxplot-mode`, Selbstwirksamkeitskarte `hide()` / `show()`) plus Unterrichtsqualität `setChartType(chartType)` |

Beim Render schreibt die View selbst `domainOptions` in den App-State (nicht beobachtet); `#getLongitudinalDomainOptions` der App liest sie für den Domäne-Select.

## Verdrahtung
Keine Geschwister-Verdrahtung; die drei Hosts hängen nur am App-State.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Datenausschnitte prüfen, Payload und Domänenoptionen bauen, in den App-State schreiben, eine Karte je Ausschnitt anlegen, Hosts hydrieren, die drei Schlüssel beobachten |
| `show()` | Override | Basis (zeigt alle Kinder), danach im selben Task die Selbstwirksamkeitskarte im Boxplot-Modus wieder verstecken |
