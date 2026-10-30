# NavCardModule

## Zweck
Navigationskarten: eine Reihe klickbarer Vorschau-Einträge, die per Callback zu einer View führen. Der Eintrag der aktuellen View ist nicht klickbar (`aria-current="page"`, behält aber seinen Tooltip) und trägt den Hinweis aus dem Glossar (`general.messages.current-view`, „Sie sind hier“). Ein Eintrag heißt wie seine View in der Sidebar (`label` der aufgelösten `viewConfig`); Beschreibung und Tooltip kommen aus demselben Glossareintrag (`navigationGlossaryPath`); ein Eintrag mit `icon` zeigt ein Material-Symbol.

## Design/Idee

Ergänzend zur Menüleiste am Rand der Seite bieten die Navigationskarten der Startseite direkten Zugriff zu den vier Ansichten der Ergebnisdarstellung. Zum einen liefern kurze Texte detaillierte Informationen zu den dargestellten Inhalten einer jeden Ansicht; zum anderen suggeriert die Anordnung im Raster eher als die Liste am Rand eine größere Entscheidungsfreiheit in Bezug auf die Reihenfolge (oder die Auswahl) der Ergebnisbetrachtung. Entsprechende Icons helfen bei der intuitiven Erfassung der Inhalte.

## Daten
Keine API-Daten. Die Einträge kommen aus der Option `items`: `[{ viewTarget, label, glossaryPath, labelIcon?, statePatch?, icon? }]`, gebaut von `viewNavCardItems`. Ein Glossareintrag mit `description` erscheint als Zeile unter der Beschriftung, einer mit `tooltip` als Tooltip. Jede Karte außer der aktuellen ist ein Link `<a href="#<viewTarget>">`: ein Klick mit Strg/⌘/Umschalt/Alt öffnet die Ansicht wie jeder Link in einem neuen Tab. Ein einfacher Klick (auch per Enter) ruft stattdessen `onNavigate(viewTarget, statePatch)`, das den `statePatch` mitschreibt; `statePatch` ist `undefined`, wenn das Item keinen trägt. Der Name für Screenreader ist der Inhalt der Karte, Titel und Beschreibung; die Markierung „Sie sind hier“ der aktuellen Karte steht neben der Überschrift, nicht in ihr.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `context` | `ModuleContext` | – | ja | Kontext der App: das Glossar benennt Navigationsziel und aktuelle View |
| `items` | `Array<object>` | `[]` | ja | Einträge, siehe Daten |
| `previewLabelTag` | Tag-Name | `'h3'` | nein | Element der Eintragsbeschriftung |
| `interactivePreset` | `'card'` \| `'subtle'` | `'card'` | nein | Hover-Preset der Einträge: Karte oder dezent |
| `onNavigate` | `(viewTarget: string, statePatch?: object) => void` | – | ja | Navigationsziel und der App-State, den das Item mit der Navigation schreibt |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `currentView` | Eigenschaft (reaktiv) | Aktive View (Standard `null`); setzen schaltet Karten und Hinweis an Ort und Stelle um |
| `viewNavCardItems(viewConfig, iconSlot)` | Funktion (Export) | Einträge aus der `viewConfig` einer App: eine Karte je View in Schlüsselreihenfolge, ohne die unten angehefteten (`sidebarPinBottom`); `label` und `glossaryPath` (= `navigationGlossaryPath`) der View, ihr Icon in `iconSlot` (`'icon'`: das Visual der Karte, `'labelIcon'`: in der Beschriftung), dazu der `statePatch` ihres `navCard` |
