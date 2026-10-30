# ContentModule

## Zweck
Basis aller betitelten Karten. Ergänzt `BaseModule` um die gemeinsame Kartenhülle: `.module-container` am Element, optional Titelzeile mit Aktions-Toolbar, Untertitel und Inhaltsbereich (`.content-module-body`). Besitzt die Glossaranbindung (Titel, Untertitel, Body) und die Platzierung der Export-Schaltfläche. Das Element ist die Karte und trägt die Modul-Id; ohne Titelzeile ist es selbst der Inhaltsbereich.

## Design/Idee
Die Hülle ist ein Lit-Template, der Body gehört der Unterklasse: die Hülle rendert mit dem Element, der Inhaltsdurchlauf füllt den Body. Was ein Produkt um eine Karte legt (Export, Glossar-Annotation), importiert die Klasse nicht: sie liest es als `runtime` aus dem Kontext und fällt ohne ihn auf No-op-Standards zurück. Die Export-Steuerung wird einmal je Task in einer Mikrotask nachgeführt (Rendern, Zustands- und Titelwechsel einer Task ergeben eine Aktualisierung mit endgültiger Id und endgültigem Titel) und folgt jedem Signal, das `_getExportType()` oder `getExportIdentity()` liest. Die Toolbar wird in einem Effekt gebaut: jedes Signal, das `_headerActions()` liest, rendert die Hülle neu.

## Daten
Keine API-Daten. Was eine Unterklasse liest, nennt sie in `static documents` (Dokument-Dateinamen oder Dataset-Schlüssel, Standard `[]`); der Getter `documents` gibt sie zurück, und ein Kartentyp, der sie je Instanz kennt, überschreibt ihn. Ist die Liste nicht leer, ruft der Inhaltsdurchlauf vor jedem `_renderBody` `ensure(this.documents)` auf dem Dokumentspeicher des Kontexts (`context.documents`) auf; fehlt der Kontext, wirft er; wird die Karte abgebaut, während sie wartet, rendert sie nichts mehr. `_renderBody(data)` erhält den Payload (`data ?? {}`); selbst lädt das Modul nur seinen Glossareintrag (in `_setup()`, sobald `glossaryKey` und `context.glossaryData` gesetzt sind; fehlt dem Eintrag ein Feld, bleibt es `null`).

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enableModuleExport` | `boolean` | `true` | nein | `false` nimmt einer Karte den Export-Button, den sie sonst hat, sobald sie einen Titel trägt und `_getExportType()` einen Typ liefert |
| `showModuleCard` | `boolean` | `true` | nein | `.module-container` am Element setzen; `false` für ein Modul ohne eigene Kartenhülle |
| `showModuleTitle` | `boolean` | `false` | nein | Titelzeile (ein `<h2>` unter dem `<h1>` der View) und eigenen Body rendern; ohne sie ist `contentContainer` das Element selbst |
| `title` | `string` | – | nein | Titel für Module ohne Glossareintrag; überschreibt nie einen Glossartitel |
| `subtitle` | `string` | – | nein | Markup, das hinter dem Glossar-Untertitel angehängt wird (annotiert) |
| `showSubtitle` | `boolean` | `false` | nein | Glossar-Untertitel und Option `subtitle` im Untertitelbereich zeigen; der Titel bleibt dann unannotiert (bis auf die Läufe mit Schlüssel aus `glossaryReplacements`) |
| `collapsible` | `boolean` | `false` | nein | Kopf klickbar mit Chevron; Klicks auf ein eigenes Bedienelement im Kopf (Toolbar, Glossarbegriff oder anderes fokussierbares Element im Titel) klappen nicht. Für die Tastatur ist der Chevron ein `<button>` mit `aria-expanded` |
| `context` | `BaseContext` | – | ja, sobald `documents` nicht leer ist | Kontext der App (`BaseContext`): Dokumentspeicher, Glossarbaum und Host-Dienste (`runtime`, sonst die No-op-Standards) |
| `glossaryKey` | `string` | – | nein | Dot-Pfad des Glossareintrags, z. B. `en.group.group-table` |
| `bodyClassName` | `string` | – | nein | Eigene Klasse des Inhaltsbereichs, für das Stylesheet des Besitzers (die Slot-Klassen sind der Hülle vorbehalten); nur mit `showModuleTitle`, ohne Titel ist das Element selbst der Inhalt |
| `viewKey` | `string` | – | nein | Die View, in der die Karte sitzt; das Export-Ziel nennt sie als `view` für Dateinamen und Bericht |
| `glossaryReplacements` | `GlossaryReplacements` | – | nein | Template-Tokens für Glossartitel und -texte. Ein Wert ist Text oder eine Folge von Textläufen `[{text, glossaryKey?}]`; der Titeltext (`cardTitle`, Export) liest die Läufe als Text, im sichtbaren Titel, Untertitel und Body steht jeder Lauf mit Schlüssel als Begriff seines Eintrags, statt dass der Name frei annotiert würde. Alle Werte werden in Markup escaped eingesetzt |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_setup()` | Override | Glossareintrag laden und die Kartenklassen ans Element setzen |
| `render()` | final | Die Hülle: ohne Titelzeile nichts, sonst Kopf (Chevron, `h2` mit Titel, Toolbar), Untertitel und Body; leere Toolbar und leerer Untertitel bleiben über `:empty` verborgen. Die Toolbar zeigt `_headerActions()`, dann die Export-Steuerung; den Body füllt die Unterklasse |
| `_renderContent()` | Override-Punkt | Dokumente ensuren, `_renderBody(data ?? {})`, dann `syncExportControls()`; eine Unterklasse, die vor dem Durchlauf warten muss, überschreibt es und ruft es danach auf |
| `_renderBody(data)` | Override (abstrakt) | Inhalt in `contentContainer` rendern |
| `setTitle(text)` | Aufruf | Titeltext ersetzen (nur mit Titelzeile) und die Hülle neu rendern (`requestUpdate()`, kein Inhaltsdurchlauf), danach `syncExportControls()` |
| `setSubtitle(content)` | Aufruf | Untertitel setzen oder leeren: ein lit-html-Template oder verbürgtes Markup (String), gerendert mit der Hülle (`requestUpdate()`); ohne Titelzeile wirkungslos |
| `expand()`, `collapse()`, `toggle()` | Aufruf | Klasse `collapsed` am Element schalten (nur mit Titelzeile), dann `refreshVisibility()`: eingeklappt gelten Modul und Teilbaum als unsichtbar (`_onHide`), aufgeklappt wieder als sichtbar (`_onShow`) |
| `getExportIdentity()` | Override | Was das Modul gerade zeigt, für die Export-Id; `null`, wenn eine Instanz immer dasselbe zeigt. Liest es Zustandssignale (`createState`), folgt die Export-Steuerung jeder Änderung von selbst. Immer aus Daten, nie aus Anzeigetext; Darstellungsvarianten (Modus, Hervorhebung, Vergleich, Filter) sind keine Identität, erneutes Markieren ersetzt die Aufnahme |
| `syncExportControls()` | Aufruf | Die Export-Steuerung an die aktuelle Export-Definition angleichen: Button anlegen, nachführen oder entfernen; einmal je Task, in einer Microtask. Ein Modul, das nicht rendert (noch nie verbunden, abgebaut, oder sein `_setup()` scheiterte), bekommt keine. Die Steuerung und die Verfolgung der Toolbar-Signale gehen mit den Ressourcen, auch wenn das `_teardown()` einer Unterklasse wirft |
| `_whenLaidOut(options?)` | Helfer | Warten, bis die Box des Inhaltsbereichs steht (`waitForStableElementBox`), vor einem Aufbau, der sie misst; ohne Layout synchron `null` |
| `contentContainer`, `subtitleElement`, `titleElement` | Getter | Body, Untertitel, Titelelement (null ohne Titelzeile) |
| `_headerActions()` | Override | Die Aktionen der Toolbar als lit-Werte (`headerActionButton`, `headerActionDropdown`, …), vor dem Export-Button gerendert; Standard `nothing`. Bei jedem Rendern der Hülle gelesen: liest sie Signale, rendert jede Änderung die Hülle neu; anderer Zustand fordert das mit `requestUpdate()` an |
| `cardTitle` | Getter | Der sichtbare Titel: `setTitle()`-Text, sonst Glossartitel, sonst Option `title`, sonst der Marker `[Missing glossary entry: <glossaryKey>]` |
| `glossaryEntry`, `glossaryBody`, `glossaryKey` | Getter | Aufgelöster Eintrag und seine Felder; `glossaryKey` ist die Option |
| `static documents` | Override (Feld) | Dokumente und Datasets, die die Karte liest; vor jedem Inhaltsdurchlauf ensured |
| `documents` | Getter, Override | Was der Inhaltsdurchlauf ensured; Standard `static documents` |
| `_captureSteps()` | Override | Hinter den Schritten der Basis: eine zugeklappte Karte für die Aufnahme aufklappen (die Aufnahme wartet danach auf `whenSettled()`) und beim Rücknehmen wieder zuklappen; scheitert die Vorbereitung des Teilbaums, klappt `prepareExportCapture()` sie sofort wieder zu |
| `_getExportType()` | Override | `null` (nicht exportierbar); exportierbare Unterklassen liefern `'table'` (Daten als CSV/JSON, dazu PDF), `'visual'` (Bild als PDF/PNG/JPG) oder `'chart'` (beides) und ihre Vorbedingung |
| `_visibilityTarget` | Override | Der Body: ein Einklappen versteckt ihn, nicht den Kopf |
