# HeaderModule

## Zweck
Der gemeinsame View-Kopf aller drei Dashboards: links der Titel mit optionalem Icon, mittig die Steuerelemente, rechts die Schaltflächen für Notizen und Rundgang, darunter über die volle Breite der Untertitel. Die Steuerelemente werden deklarativ aus `controls` erzeugt (`modeSwitch`, `select`, `buttonGroup`) und melden jede Änderung gebündelt über `onControlChanged(controlId, data)` an den `HeaderOrchestrator`, der sie an das `onChange` des deklarierenden Controls weitergibt: der Datensatz-Selektor navigiert per `ctx.navigate(datasetId)`, die übrigen Controls schreiben in den App-State.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../packages/module-base/src/modules/baseModule.md)
  - **HeaderModule**

## Daten
Keine API-Daten. `_doRender(data = {})` mischt `data` über die Optionen und baut den Kopf samt Steuerelementen neu; der `HeaderOrchestrator` ruft `render(...)` bei jedem View-Wechsel mit der aufgelösten View-Konfiguration.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `headerText` | `string` | `'Ansicht'` | nein | Titel (h1 — die eine Seitenüberschrift) |
| `iconName` | `string` | – | nein | Material-Symbol vor dem Titel |
| `subtitle` | `string` | `''` | nein | Untertitelzeile; leer rendert keine zweite Zeile |
| `controls` | `Array<{ type, id, options }>` | `[]` | nein | Steuerelemente; `options.hidden` überspringt eines |
| `showInfoButton` | `boolean` | `false` | nein | Rundgang-Button sichtbar |
| `showNotesButton` | `boolean` | `false` | nein | Notizen-Button sichtbar |
| `onControlChanged` | `(controlId, data) => void` | – | nein | Callback `controlChanged` |
| `onInfoToggled` | `({ active }) => void` | – | nein | Callback `infoToggled` |
| `onNotesToggled` | `({ active }) => void` | – | nein | Callback `notesToggled` |

Je Steuerelement-Typ werden die `options` an das Kind durchgereicht: `modeSwitch` (`modes`, `defaultMode`, `containerClass`), `select` (`items`, `defaultValue`, `label`, `tooltipText`, `containerClass`, `selectClass`), `buttonGroup` (`items` als `{ value, label, glossaryKey?, glossarySubKey?, tooltipText? }`, `defaultValue`, ein `ModeSwitchModule` mit `button-group-row`).

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setInfoActive(active)` | Aufruf | Gedrückt-Zustand des Rundgang-Buttons ohne Callback setzen (Tour per Esc beendet) |
| `setNotesActive(active)` | Aufruf | Gedrückt-Zustand des Notizen-Buttons ohne Callback setzen (Drawer extern geschlossen) |
| `destroy()` | Aufruf | Steuerelemente abbauen, dann Basis |
| `onControlChanged(controlId, data)` | Callback | Ein Steuerelement hat sich geändert; `data` ist das Ereignisobjekt des Kindes (`{ mode, previousMode }`, `{ selectedValue, selectedLabel }`) |
| `onInfoToggled({ active })` | Callback | Rundgang-Button geklickt |
| `onNotesToggled({ active })` | Callback | Notizen-Button geklickt |
