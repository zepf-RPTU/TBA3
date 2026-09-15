# BaseModule

## Zweck
Wurzel aller Bausteine einer View: hält Id, Container, Optionen und Daten, verwaltet den Lebenszyklus (mount, hydrate, init, render, update, destroy), registriert Kind-Module für kaskadierendes Aufräumen, bietet Callbacks und Ressourcen-Tracking. Direkt erben die View-Basis `BaseViewModule`, Steuerelemente und Mischformen; Karten mit Titel erben von `ContentModule`, Tabellen von `TableModule`, Charts laufen über `ChartHostModule` mit einem Config-Descriptor.

## Design/Idee

TODO

## Klassenhierarchie
- **BaseModule**
  - [BaseViewModule](../../../../src/common/modules/baseViewModule.md)
  - [ContentModule](contentModule.md)
  - [HeaderModule](../../../../src/common/modules/header/headerModule.md)
  - [MaGlossarySearchModule](../../../../src/ma/modules/maGlossarySearch/maGlossarySearchModule.md)
  - [ModeSwitchModule](../../../../src/common/modules/header/modeSwitchModule.md)
  - [SelectControlModule](../../../../src/common/modules/header/selectControlModule.md)
  - [SlDetailOverlayModule](../../../../src/sl/modules/slDetailOverlay/slDetailOverlayModule.md)
  - [StudentSelectorModule](../../../../src/common/modules/header/studentSelectorModule.md)

## Daten
Keine API-Daten. `mount(data)`, `hydrate(data)`, `init(data)` und `update(data)` legen den Payload unverändert ab, `getData()` liefert ihn zurück; die Form ist Sache der Unterklasse. `update(data)` legt in der Basis nur ab und gibt nichts an Kinder weiter; Unterklassen überschreiben es, um aus dem neuen Payload neu zu zeichnen.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `resizeService` | `ResizeService` | Singleton | nein | Resize-Dienst, wird in `destroy()` per Scope `id` geleert |
| `appState`, `onNavigate`, `dataStore`, `glossaryData` | – | – | nein | Nicht selbst gelesen, aber von `_childOptions()` als Standardbündel an jedes Kind weitergegeben |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `mount(data?)` | Aufruf | Synchrone Phase: Daten ablegen, Container prüfen, `element` auf den Container setzen; idempotent |
| `hydrate(data?)` | Aufruf | Asynchrone Phase: `_doRender(getData())`, setzt `initialized` |
| `init(data?)` | Aufruf | `mount` + `hydrate`; bei bereits initialisiertem Modul Weiterleitung an `update` |
| `render(data?)` | Aufruf | Container prüfen, dann `_doRender(data)`; Unterklassen überschreiben `_doRender`, nie `render` |
| `update(data?)` | Aufruf | Daten ablegen; Unterklassen überschreiben für den Neuaufbau |
| `destroy()` | Aufruf | Ressourcen, Resize-Observer, Kinder abbauen; eigenes Element entfernen, geliehenen Container nur leeren; idempotent |
| `setOptions(o)`, `setDefaults(d)`, `getOption(key, fallback?)` | Aufruf | Optionen mischen, Defaults nur für fehlende Schlüssel setzen, lesen |
| `setData(d)`, `getData()` | Aufruf | Payload ablegen und lesen |
| `registerCallback(name, fn)`, `triggerCallback(name, ...args)` | Aufruf | Benannte Callbacks; jeder Handler läuft isoliert, ein Fehler stoppt die anderen nicht |
| `registerChildModule(child)`, `unregisterChildModule(child)` | Aufruf | Kind für Cleanup anmelden bzw. abmelden |
| `destroyAndUnregister(child, container?)`, `destroyAndUnregisterAll(collection, container?)` | Aufruf | Kinder abbauen; `destroyAndUnregister` liefert immer `null` zum Zurücksetzen der Referenz |
| `validateContainer({ assignId? })` | Aufruf | Container sicherstellen, optional eine Id vergeben |
| `onThemeChanged()` | Aufruf | KS-Farbthema gewechselt; Standard reicht rekursiv an alle Kinder weiter |
| `show()`, `hide()` | Aufruf | `display` des Elements schalten, Kinder folgen |
| `waitForLayout()`, `whenSettled()`, `whenSubtreeSettled(timeoutMs?)` | Aufruf | Layout abwarten; Settle-Versprechen für die Skeleton-Freigabe der View (Fail-safe 3 s) |
| `id`, `container`, `element`, `options`, `visible`, `initialized`, `mounted`, `destroyed`, `resources`, `resizeService`, `childModules` | Getter | Zustand und Dienste |
| `_doRender(data)` | Override (abstrakt) | Muss die Unterklasse liefern |
| `_childOptions(extras)` | Helfer | Optionsbündel für neue Kinder |
