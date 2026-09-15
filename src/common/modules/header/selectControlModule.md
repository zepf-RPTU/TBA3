# SelectControlModule

## Zweck
Einfaches `<select>` mit Label für datengetriebene Auswahllisten im Header, etwa der Datensatz-Wechsler oder die Domänenwahl der SL-Längsschnittansicht. Meldet bei Änderung `{ selectedValue, selectedLabel }`.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../packages/module-base/src/modules/baseModule.md)
  - **SelectControlModule**

## Daten
Keine API-Daten. Die Einträge kommen aus der Option `items` (`{ value, label }`); `update()` ist die Basisimplementierung.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `items` | `Array<{ value, label }>` | `[]` | ja | Die Optionen |
| `defaultValue` | `string` | erster Eintrag | nein | Anfangs gewählt |
| `label` | `string` | `null` | nein | Label vor dem Select, per `for` gebunden – der zugängliche Name des Selects (bei Header-Controls aus dem Glossar-`interface` injiziert) |
| `tooltipText` | `string` | `null` | nein | Delegierter Tooltip auf dem `<select>` (`data-tooltip-text`); der Header setzt ihn aus dem `tooltip` des Glossareintrags |
| `containerClass`, `selectClass` | `string` | `''` | nein | Zusätzliche besitzerlokale Klassen |
| `onSelectionChanged` | `({ selectedValue, selectedLabel }) => void` | – | nein | Callback `selectionChanged` |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `onSelectionChanged({ selectedValue, selectedLabel })` | Callback | Auswahl geändert |
