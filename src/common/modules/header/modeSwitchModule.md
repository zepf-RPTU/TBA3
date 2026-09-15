# ModeSwitchModule

## Zweck
Segmentierte Schaltflächenreihe, in der genau ein Modus aktiv ist. Der aktive Button ist deaktiviert, ein Klick auf einen anderen wechselt den Modus und meldet `{ mode, previousMode }`. Dient dem Header als `modeSwitch` (Ansichtsmodus, Domäne) und als `buttonGroup`.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../packages/module-base/src/modules/baseModule.md)
  - **ModeSwitchModule**

## Daten
Keine API-Daten. Die Buttons kommen aus der Option `modes`; der aktive Modus kommt aus `defaultMode` und wechselt danach nur noch durch einen Klick auf einen der Buttons.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `modes` | `Array<{ id, label, glossaryKey?, tooltipText? }>` | – | ja (mindestens einer, sonst Fehler) | Die Modi |
| `defaultMode` | `string` | erster Modus | nein | Anfangs aktiv; unbekannte Id wirft |
| `containerClass` | `string` | `'mode-switch'` | nein | Klasse des Wurzelelements |
| `buttonContainerClass` | `string` | `'mode-switch-buttons'` | nein | Klasse der Buttonreihe |
| `buttonClass` | `string` | `'mode-button'` | nein | Klasse je Button |
| `onModeChanged` | `({ mode, previousMode }) => void` | – | nein | Callback `modeChanged` |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `onModeChanged({ mode, previousMode })` | Callback | Nutzer:in hat einen anderen Modus gewählt |
