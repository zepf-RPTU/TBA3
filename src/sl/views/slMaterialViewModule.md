# SlMaterialViewModule

## Zweck
Die „Material“-Seite: die Materialseiten der Schule je Fach und Seitentyp (Übersicht, Ergebniszusammenfassung, Datensicht, Leitfragen), gezeigt von einem einzigen `MaterialSelectionModule`. Fach und Typ wählt der Header; die View reicht die Auswahl durch.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **SlMaterialViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Materialauswahl | `MaterialSelectionModule` | [materialSelectionModule.md](../../../packages/modules/src/sl/modules/material/materialSelectionModule.md) | Id `sl-material-module`, `glossaryKey: 'sl.material.material'`, `showModuleTitle: true` |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=school,group` | Materialauswahl über `slData` (Schul- und Klassenzeilen der datengetriebenen Seiten) |
| `competence-levels` | `comparison=state-average` | Materialauswahl über `slData` (Landesschnitt neben dem Schulwert) |
| `competence-levels` | `type=students` | Materialauswahl über `slData` (die Schülerzeilen roh, dazu Unterrichtsqualität und Selbstwirksamkeit) |

Payload: kein App-Payload, und die View liest selbst keinen `DataStore`-Schlüssel: sie baut für das Kind den Port `slData: slDataFromStore(dataStore)` und hydriert es ohne Payload. Danach wendet sie eine schon vorhandene Auswahl aus `appState.getStateValue('materialSubject')` / `'materialType'` einmal an — ein Info-Box-Link schreibt die Schlüssel, bevor er hierher navigiert, also bevor diese View existiert.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `materialSubject` | Fach-Buttons des Headers (`subjectSelect`), Info-Box-Links | `setSelection('subject', value)` |
| `materialType` | Typ-Buttons des Headers (`typeSelect`), Info-Box-Links | `setSelection('type', value)` |

## Verdrahtung
Keine Geschwister-Verdrahtung; es gibt nur ein Kind.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Platzhalter anlegen, `MaterialSelectionModule` hydrieren, vorhandene Auswahl anwenden, dann beide Schlüssel beobachten |
