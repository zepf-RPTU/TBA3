# MaGlossarySearchModule

## Zweck
Die durchsuchbare Glossarliste der MA-Hilfeseite: ein Suchfeld über allen Begriffen des geteilten MA-Vokabulars, darunter je Begriff eine auf- und zuklappbare Karte mit Titel und Erklärtext. Gefiltert wird live beim Tippen über Titel und Fließtext (ohne HTML), Groß-/Kleinschreibung spielt keine Rolle; ohne Treffer erscheint „Keine Einträge gefunden.“.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../packages/module-base/src/modules/baseModule.md)
  - **MaGlossarySearchModule**

## Daten
Keine API-Daten. Die Einträge kommen aus der Option `glossaryData` unter `ma.shared.element_texts` (nur Einträge mit `title` und `body`); `init()` erhält keinen Payload.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `glossaryData` | `object` | – | ja | Der zusammengesetzte MA-Glossarbaum (`maGlossary`); ohne `ma.shared.element_texts` bleibt die Liste leer |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|

Nutzerinteraktionen (Tippen, Klick auf einen Kartenkopf) bleiben modulintern; das Modul löst keine Callbacks aus.
