# TextModule

## Zweck
Betitelter Textblock ohne eigene Logik: Titel aus dem Glossar-`title`, Inhalt aus dem Glossar-`body`. Dient als Begrüßung auf der EN- und MA-Willkommensseite.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [ContentModule](../../../packages/module-base/src/modules/contentModule.md)
    - **TextModule**

## Daten
Keine API-Daten. `_doRenderContent` ignoriert den Payload und schreibt `glossaryBody` in `contentContainer`; ohne `body` bleibt der Inhalt leer.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showModuleTitle` | `boolean` | `true` | nein | Abweichend von der Basis standardmäßig an |
| `glossaryKey`, `glossaryData` | wie Basis | – | ja | Ohne Eintrag zeigt die Karte `MISSING_GLOSSARY_TITLE` und keinen Text |

## Methoden
Wie Basis.
