# MaStudentTopBarModule

## Zweck
Die Kopfleiste der MA-Schüler:innen-View über die volle Modulbreite: oben der Schüler:innen-Selektor, darunter die einzeilige Info-Tabelle (Geschlecht, „Richtig (von N)“, Kompetenzstufe, Merkmale) zur gewählten Person. Eine Auswahl im Selektor rendert die Info-Tabelle neu und meldet die ID nach außen; eine Auswahl von außen (`setStudent`) stellt den Selektor stumm um.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../packages/module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../packages/module-base/src/modules/contentModule.md)
    - **MaStudentTopBarModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (`studentId`: Wert je Eintrag der Personenauswahl und Schlüssel, unter dem die Infotabelle die Person sucht) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `id` fasst die Personenauswahl alle Personen zu einem Eintrag zusammen (sie entdoppelt nach `studentId`), und die Infotabelle bleibt leer.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`) | `properties[firstName]`, `properties[lastName]` | Die Personenauswahl zeigt statt „Nachname, Vorname“ nur den vorhandenen Teil und sortiert danach; ohne beide steht „, “ je Eintrag, in Payload-Reihenfolge |

Payload: `_doRenderContent(data)` erhält `{ studentArray, rawStudentArray, studentId, totalItems? }` (`buildStudentRecords` und `buildRawStudentArray`, `src/ma/utils/maStudentDataAdapter.js`; `totalItems` ist `itemArray.length`, fehlt der Schlüssel, bleibt der Konstruktorwert). `studentArray` füllt die Personenauswahl (`StudentSelectorModule`, liest `studentId`, `lastName`, `firstName`); `studentArray`, `rawStudentArray`, `studentId` und `totalItems` gehen unverändert an `MaStudentInfoTableModule`, dessen Doc die Felder der Zeile nennt.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `totalItems` | `number` | `0` | nein | Startwert für den Nenner „Richtig (von N)“; der Payload überschreibt ihn |
| `sortByName` | `boolean` | `true` | nein | Selektor alphabetisch nach Name statt in Payload-Reihenfolge |
| `onStudentSelected` | `(studentId: string) => void` | – | nein | Auswahl im Selektor (nicht bei `setStudent`) |
| `appState`, `dataStore`, `glossaryData`, `onNavigate` | – | aus `_childOptions()` | nein | Werden per `_childOptions()` an die Info-Tabelle weitergegeben |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setStudent(studentId)` | Aufruf | Person programmatisch wählen: Selektor stumm umstellen, Info-Tabelle neu rendern; kein Callback |
| `onStudentSelected(studentId)` | Callback | Nutzer:in hat im Selektor eine andere Person gewählt |
