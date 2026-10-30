# BaseModule

## Zweck
Wurzel aller Bausteine einer View: ein Lit-Element (`ReactiveElement`) ohne Shadow DOM, das seine Optionen, seine Daten und seine Ressourcen hält. Ein eigenes Template (`render()`) rendert lit-html ins Element; ein Modul ohne Template (eine Karte ohne Titelzeile, eine Tabelle) behält seine Kinder für sich.

## Design/Idee
Ein Modul wird einmal konfiguriert (`options`, vor dem ersten Verbinden); was es zeigt, ändert sich nur über reaktive Eigenschaften. Der Lebenszyklus ist der von Lit, um einen Inhaltsdurchlauf erweitert: Verbinden richtet ein und rendert die Hülle sofort, jede Aktualisierung mit geänderten Eigenschaften startet `_renderContent`, und `updateComplete` löst erst auf, wenn dieser Durchlauf, das eigene Setzen (`_contentSettled`) und jedes Modul im Teilbaum fertig sind. Der Modulbaum ist der DOM-Baum: Kinder werden nicht registriert, sondern über `data-tba-module` gefunden, und der Abbau folgt dem Entfernen aus dem Dokument (eine Mikrotask später, damit ein Verschieben kein Abbau ist). Eine Kopie in einer Export-Bühne bleibt inert.

## Daten
Keine API-Daten. Die reaktive Eigenschaft `data` trägt den Payload, den der Elternteil setzt; jede neue Zuweisung startet nach dem Rendern einen Inhaltsdurchlauf (`_renderContent`). Die Form ist Sache der Unterklasse.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `context`, `viewKey` | – | – | nein | Nicht selbst gelesen, aber von `_childOptions()` als Standardbündel an jedes Kind weitergegeben; `context` (`BaseContext`) trägt den `DocumentStore` (`documents`), aus dem eine Karte ihre Dokumente liest, das Glossar (`glossaryData`) und die Host-Dienste (`runtime`), `viewKey` ist der Schlüssel der View, in der das Modul sitzt |

Die Optionen werden einmal gesetzt (`options`), bevor das Element zum ersten Mal verbunden wird; danach wirft der Setter. `static defaultOptions` füllt beim Setzen nur Schlüssel, die der Aufrufer `undefined` lässt. Typisierung: `BaseOptions` ist der Typ dieser Optionen; eine Unterklasse, die eigene Schlüssel liest, deklariert `XOptions` als Erweiterung des Elterntyps und gibt ihn als Typparameter an (`@augments {ContentModule<XOptions>}`). Was sich über die Lebensdauer ändert, ist eine reaktive Eigenschaft (`static properties`), nie eine Option. Öffentliche Klassenfelder überdecken Lits Accessoren: Zustand liegt in `#privaten` Feldern.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `static create(id, options)` | Aufruf | Ein konfiguriertes, noch nicht verbundenes Modul dieser Klasse |
| `connectedCallback()` | final | Beim ersten Verbinden einrichten (`_setup()`) und sofort rendern; ohne Id schlägt das Einrichten fehl. Wirft das Einrichten oder das erste Rendern, weist `updateComplete` den Fehler ab. Eine Kopie in einer Export-Bühne (`[data-capture-stage]`) bleibt inert |
| `disconnectedCallback()` | final | Abbau in der nächsten Mikrotask, sofern das Element bis dahin nicht wieder verbunden ist (ein Verschieben). Ein abgebautes Modul verbindet sich nie wieder |
| `_setup()` | Override (Hook) | Optionen lesen, Zustand und Effekte anlegen; einmal, vor dem ersten Rendern |
| `_teardown()` | Override (Hook) | Abbauen, was `_setup()` und die Durchläufe außerhalb der Ressourcen gebaut haben (Tabulator, Renderer, Overlay); einmal; Overrides rufen `super._teardown()` |
| `render()` | Override (Hook) | Das eigene Markup, bei jeder Aktualisierung ins Element gerendert; Standard `nothing`: dann hält das Element keinen Lit-Part, den ein `replaceChildren()` abreißen würde |
| `update(changed)` | final | Lits `LitElement.update`, ohne Part für ein Modul ohne Template |
| `updated(changed)` | final | Startet den Inhaltsdurchlauf beim ersten Rendern, bei geänderten Eigenschaften und nach `refreshContent()`; ein `requestUpdate()` ohne Namen frischt nur die Hülle auf |
| `refreshContent()` | Aufruf | Den Inhaltsdurchlauf ohne Eigenschaftsänderung erneut starten (Auswahl, Umschalter im Modul selbst); liefert `updateComplete` |
| `_renderContent(changed)` | Override (Hook) | Die Inhaltsarbeit nach dem Rendern: laden, bauen, zeichnen; `updateComplete` wartet auf den neuesten Durchlauf |
| `_contentSettled()` | Override (Hook) | Löst auf, sobald der eigene Inhalt stillsteht (eine Tabelle nach Aufbau und Nachzeichnen); Standard: sofort |
| `_adoptContentPass(pass)` | Helfer | Macht `pass` zum Inhaltsdurchlauf des Moduls, wie `updated()` den eigenen: für Inhaltsarbeit, die ein Modul außerhalb einer Aktualisierung startet (ein Neuaufbau auf eigene Signale). `updateComplete` und `contentComplete` warten darauf, ein abgelöster Durchlauf weist sie nicht mehr ab, und gelingt er, ist das Modul `initialized`. Sein Fehler erreicht nur, wer auf das Modul wartet, nie als unbehandelte Ablehnung |
| `getUpdateComplete()` | Override | Lits Versprechen, erweitert um den ganzen Teilbaum: der letzte Inhaltsdurchlauf und `_contentSettled()` jedes Moduls darin, erneut, bis kein Modul hinzukam oder wegfiel und keines einen neuen Durchlauf begann oder eine Aktualisierung anstehen hat. Ein werfender Durchlauf weist es ab, solange kein neuerer ihn abgelöst hat |
| `contentComplete` | Getter | Wie `getUpdateComplete()`, aber ohne `_contentSettled()`: löst auf, sobald der letzte Inhaltsdurchlauf jedes Moduls im Teilbaum gelaufen ist (gebaut, noch nicht zur Ruhe gekommen); ein werfender Durchlauf weist es ab, solange kein neuerer ihn abgelöst hat |
| `_whenTemplateRendered()` | Helfer | Löst auf, sobald das anstehende Rendern der eigenen Vorlage steht, ohne Inhalt: für einen Inhaltsdurchlauf, der die Kopfzeile geändert hat und das Ergebnis misst (auf `updateComplete` würde er sich selbst warten) |
| `whenSettled()` | Aufruf | `updateComplete` mit Ausfallsicherung (3 s), ohne Ablehnung: ein Modul, das nie zur Ruhe kommt oder scheitert, lässt kein Warten hängen |
| `shouldUpdate()` | final | Kein Rendern mehr nach fehlgeschlagenem `_setup()` oder nach dem Abbau; Lit aktualisiert auch getrennte Elemente |
| `show()`, `hide()` | Aufruf | Das `hidden`-Attribut schalten und `refreshVisibility()`; ein Kind, das sein Besitzer versteckt hat, bleibt beim `show()` eines Vorfahren versteckt |
| `refreshVisibility()` | Aufruf | Neu lesen, ob der Teilbaum auf dem Bildschirm ist (`visible`), und `_onShow`/`_onHide` an jedem Modul feuern, dessen Antwort sich änderte, die Nachfahren zuerst; alle Module werden gelesen, bevor der erste Hook zeichnet. Ein Modul, das seit dem letzten Aufruf entstand, hat noch keine Antwort und hört den Hook für seine aktuelle. Ein werfender Hook wird mit der Modul-Id gemeldet (`console.error`) und hält weder die übrigen Hooks noch den Aufrufer auf |
| `_onShow()`, `_onHide()` | Override (Hooks) | Teilbaum wurde sichtbar bzw. unsichtbar; einmal pro Wechsel, nach den Kindern. Standard: nichts |
| `visible` | Getter | Verbunden und gelayoutet (`checkVisibility()` auf `_visibilityTarget`) |
| `_visibilityTarget` | Getter (geschützt) | Das Element, dessen Layout `visible` entscheidet; eine Karte antwortet mit ihrem Body |
| `childModules`, `descendants()` | Aufruf | Die nächsten bzw. alle Module im DOM unter diesem, in Dokumentreihenfolge, ohne inerte Kopien |
| `prepareExportCapture()` | Aufruf (final) | Vor einer Bildaufnahme: den Teilbaum synchron aufnahmefähig machen und die Rücknahme liefern; gewartet wird danach an der Wurzel (`whenSettled()`). Erst die eigenen Schritte (`_captureSteps()`), dann die Kinder; die Rücknahme läuft in umgekehrter Reihenfolge. Wirft ein Schritt, nimmt der Aufruf zurück, was bis dahin lief, und wirft weiter. Nicht überschreiben |
| `_captureSteps()` | Override (Hook) | Die eigenen Schritte vor einer Aufnahme, in Reihenfolge, jeder liefert seine Rücknahme; eine Unterklasse setzt ihre vor oder hinter die der Oberklasse. Standard: keine |
| `prepareExportClone(cloneOf)` | Aufruf (final) | Im frischen Klon nachtragen, was ein `cloneNode` nicht trägt: erst die Kinder, dann `_prepareOwnClone(cloneOf)`. Nicht überschreiben |
| `_prepareOwnClone(cloneOf)` | Override (Hook) | Was ein Klon von diesem Modul nicht trägt, im Klon ersetzen. Standard: nichts |
| `getExportDataText(format)` | Aufruf (final) | Tabellarischer Inhalt als `csv`/`json`, ein Block `{title, text}` je Tabelle (der Titel benennt sie, sobald eine Datei mehrere hält): erst `_ownExportData(format)`, dann die Blöcke der Kinder. Nicht überschreiben |
| `_ownExportData(format)` | Override (Hook) | Die Tabellen, die dieses Modul selbst hält, serialisiert. Standard: keine |
| `effect(fn)` | Aufruf | `@preact/signals-core`-Effekt bis zum Abbau: läuft sofort und bei jeder Änderung eines gelesenen Signals erneut; liefert das vorzeitige Ende. Nebenwirkungen in `untracked()` |
| `onChange(read, run)` | Aufruf | Nur Änderungen: `run(wert)`, wenn sich das Ergebnis von `read` ändert (Arrays elementweise verglichen), `run` ungetrackt; bis zum Abbau |
| `addController(controller)` | Aufruf | Lits `ReactiveController`: `hostConnected` beim Verbinden, `hostDisconnected` beim Trennen |
| `_childOptions(extras)` | Helfer | Optionsbündel für neue Kinder (`ChildContext<this>`) |
| `options`, `data`, `initialized`, `destroyed`, `resources` | Getter | Konfiguration, Payload, Zustand und Ressourcen; Beobachtungen der Größe gehen über das Singleton `resizeService` |
