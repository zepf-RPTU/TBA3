# SlWelcomeViewModule

## Zweck
„Willkommen (alternativ)“: die schulweite Kompetenzstufenverteilung als Chart-Karte, daneben ein Kasten „Entwicklungspotentiale“ mit dem Analysetext aus `info_boxes.json`. Zwei Karten nebeneinander, direkt in der View ohne Wrapper-Modul.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **SlWelcomeViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Kompetenzstufenverteilung | `ChartHostModule` + `competencyChartConfig` | [competencyChartConfig.md](../../../packages/modules/src/sl/modules/charts/competency/overview/competencyChartConfig.md) | `glossaryKey: 'sl.welcome.overview'`, `showModuleTitle: true` |
| Kasten „Entwicklungspotentiale“ | `InfoBoxModule` | [infoBoxModule.md](../../../packages/modules/src/sl/modules/infoBox/infoBoxModule.md) | `boxKey: 'welcome'`, `title: 'Entwicklungspotentiale'`, `slData` (`slDataFromStore(dataStore)`) |

Was ein Kasten aussagen darf (nur Kompetenzstufenanteile, keine Lösungsquote, kein KMK-Standardname): [sl-info-box-placeholders.md](../../../docs/sl-info-box-placeholders.md).

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=school,group` | Kompetenzstufenverteilung (das rohe Dokument); Kasten über `slData` |
| `competence-levels` | `comparison=state-average` | Kompetenzstufenverteilung (die Landesschnittzeilen desselben Dokuments); Kasten über `slData` |

Payload: kein App-Payload. Die View liest roh `COMPETENCE_LEVELS` und hydriert den Chart mit `{ competenceLevels }`. Der Kasten bekommt keinen Payload, sondern `boxKey: 'welcome'` und den Port `slData: slDataFromStore(dataStore)`; seine Vorlage kommt aus `info_boxes.json` (Repo-Datei, nie vom Server). Ohne `competence-levels`-Zeilen warnt die View und baut keines der beiden Kinder.

## Zustand
Keine App-State-Schlüssel beobachtet.

## Verdrahtung
Keine Geschwister-Verdrahtung.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Kartenzeile mit zwei Platzhaltern bauen, Chart-Host und Kasten konstruieren und gemeinsam hydrieren |
