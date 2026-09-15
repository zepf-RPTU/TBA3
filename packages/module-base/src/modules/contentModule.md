# ContentModule

## Zweck
Basis aller betitelten Karten (Charts, Tabellen, Detailpanels, Navigationskarten). Ergänzt `BaseModule` um die gemeinsame Kartenhülle: `.module-container` am Container, optional Titelzeile mit Aktions-Toolbar, Untertitel und Inhaltsbereich (`.content-module-body`). Besitzt die Glossaranbindung (Titel, Untertitel, Body, `element_texts`) und die Platzierung der Export-Schaltfläche. Unterklassen implementieren `_doRenderContent(data)` und rendern in `contentContainer`. Wird die Titelzeile gerendert, wandert das DOM-`id`-Attribut des Containers auf den inneren Body-Div, damit `document.getElementById(host.id)` in Chart-Renderern den Inhaltsbereich trifft und nicht die Karte.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](baseModule.md)
  - **ContentModule**
    - [ChartHostModule](../../../modules/src/common/charts/host/chartHostModule.md)
    - [EnItemDetailModule](../../../modules/src/en/modules/enItemDetail/enItemDetailModule.md)
    - [EnStudentTablesModule](../../../../src/en/modules/enStudentTables/enStudentTablesModule.md)
    - [InfoBoxModule](../../../modules/src/sl/modules/infoBox/infoBoxModule.md)
    - [MaStudentTablesModule](../../../../src/ma/modules/maStudentTables/maStudentTablesModule.md)
    - [MaStudentTopBarModule](../../../../src/ma/modules/maStudentTopBar/maStudentTopBarModule.md)
    - [MaterialSelectionModule](../../../modules/src/sl/modules/material/materialSelectionModule.md)
    - [NavCardModule](../../../../src/common/modules/navCard/navCardModule.md)
    - [ScatterplotFilterModule](../../../modules/src/en/modules/charts/scatterplot/scatterplotFilterModule.md)
    - [TableModule](../../../modules/src/common/tables/tableModule.md)
    - [TextModule](../../../../src/common/views/textModule.md)

## Daten
Keine API-Daten. `_doRender(data)` reicht den Payload als `data ?? {}` an `_doRenderContent` durch; selbst lädt das Modul nur seinen Glossareintrag (`loadInfoFromGlossary()` in `mount()` und `init()`, sobald `glossaryKey` und `glossaryData` gesetzt sind). Der Titel ist `glossaryTitle`, sonst die Option `title`, sonst `MISSING_GLOSSARY_TITLE`; der Untertitel (nur bei `showSubtitle`) ist der Glossar-`subtitle`, dahinter die Option `subtitle` als dynamisches Markup.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showModuleCard` | `boolean` | `true` | nein | `.module-container` am Container setzen; `false` für Hosts, die nur Wasserzeichen in fremder Karte sind |
| `showModuleTitle` | `boolean` | `false` | nein | Titelzeile (ein `<h2>` unter dem `<h1>` der View) und eigenen Body bauen; ohne sie ist `contentContainer` der Container selbst |
| `title` | `string` | – | nein | Titel für Module ohne Glossareintrag; überschreibt nie einen Glossartitel |
| `subtitle` | `string` | – | nein | Markup, das hinter dem Glossar-Untertitel angehängt wird (annotiert) |
| `showSubtitle` | `boolean` | `false` | nein | Untertitelbereich rendern |
| `collapsible` | `boolean` | `false` | nein | Kopf klickbar mit Chevron; Klicks in `.content-module-header-actions` klappen nicht |
| `startCollapsed` | `boolean` | `false` | nein | Anfangs eingeklappt |
| `glossaryKey` | `string` | – | nein | Dot-Pfad des Glossareintrags, z. B. `en.class.class-table` |
| `glossaryData` | `object` | – | nein | Assemblierter Glossarbaum (vom App-Modul über `_childOptions()`) |
| `glossaryReplacements` | `object` | – | nein | Template-Tokens für Glossartitel und -texte |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `mount(data?)`, `init(data?)` | Aufruf | Wie Basis, zuvor Glossareintrag laden; `mount` baut die Kartenhülle synchron |
| `loadInfoFromGlossary(path?, data?, replacements?)` | Aufruf | Eintrag auflösen und `glossaryTitle`, `glossarySubtitle`, `glossaryBody`, `glossaryElementTexts` füllen |
| `setTitle(text)` | Aufruf | Titeltext ersetzen (nur mit Titelzeile), danach `syncExportControls()` |
| `setSubtitle(html)` | Aufruf | Untertitel setzen oder leeren; legt das Element bei Bedarf nachträglich an |
| `expand()`, `collapse()`, `toggle()` | Aufruf | Klasse `collapsed` am Container schalten (nur mit Titelzeile) |
| `syncExportControls()` | Aufruf | `getExportControlDefinition()` neu auswerten, Button anlegen oder entfernen |
| `destroy()` | Aufruf | Export-Button entfernen, dann Basis |
| `contentContainer`, `subtitleElement`, `headerActionsContainer`, `isExpanded` | Getter | Body, Untertitel, lazy angelegte Toolbar (null ohne Titelzeile), Klappzustand |
| `glossaryTitle`, `glossarySubtitle`, `glossaryBody`, `glossaryElementTexts`, `glossaryKey`, `glossaryData` | Getter, `glossaryKey` auch Setter | Aufgelöste Glossarfelder |
| `_doRenderContent(data)` | Override (abstrakt) | Inhalt in `contentContainer` rendern; `_doRender` nicht überschreiben |
| `getExportControlDefinition()` | Override | `null` (nicht exportierbar); Unterklassen liefern `_buildExportControlDefinition(type)` |
| `getExportIdentity()` | Override | `null`; überschreiben, wenn eine Instanz nacheinander verschiedene Dinge zeigt |
| `_buildExportControlDefinition(type)` | Helfer | `{ id, title, type, container }` aus Export-Identität, sichtbarem Titel und Body |
| `_buildExportTargetId(identity?)` | Helfer | Ziel-ID über den registrierten Bauer; Unterklassen mit eigenem Deskriptor gehen hierüber statt `exportTargetId.js` zu importieren |
