# SlDetailOverlayModule

## Zweck
Vollbild-Overlay der SL-Details-View: ein Klick auf eine Vorschaukarte öffnet den vollständigen Kompetenzstufen-Chart eines Fachs, einer Lerngruppe oder der Schule, daneben die passende Infobox („Kasten“). Was eine Karte zeigt, nennt die Karte: Fach (Chart + Kasten), Lerngruppe oder Schule (Selbstwirksamkeitsleiste, wenn es Selbstwirksamkeitszeilen gibt, + Chart + Kasten) und Selbstwirksamkeit allein (Chart + Kasten).

## Design/Idee

Zur schnellen Navigation werden zunächst alle verfügbaren Gruppierungen als Kacheln mit angedeutetem/wassergezeichnetem Graphen abgebildet; die Auswahl einer Darstellung öffnet dann ein Overlay, in dem der gewählte Datenausschnitt in Vollauflösung präsentiert wird. Das Schließen des Overlays führt zurück zur Übersicht und soll ein einfaches Wechseln zwischen Fächern und/oder Lerngruppen ermöglichen. Dabei kann in dieser Ansicht bewusst nur eine Graphik gleichzeitig angezeigt werden.

Ein Overlay statt einer eigenen View: Schließen (✕, Escape, Backdrop) führt ohne Navigation an dieselbe Stelle der Details-View zurück; Scroll- und Moduszustand bleiben. Die Hülle ist ein `ModalDialog` (`@tba3/modules/overlays`) auf `document.body`, das Modul dessen Panel: Top Layer, Backdrop, Fokus und Escape kommen vom nativen `<dialog>`, vom Modul nur die Platzierung des Schließen-Buttons neben der Karte und das Leeren des Panels beim Schließen. Eine Instanz für alle Karten hält den DOM klein; sie hängt außerhalb des Baums ihres Erzeugers, der sie bei seinem Abbau entfernen muss. Weil alle Karten sie teilen, trägt jede Panel-Id den `key` der Karte: die Id ist zugleich das Exportziel, und so lassen sich zwei Karten unabhängig für den Sammelexport ankreuzen. Beim Schließen werden die Charts zerstört, sodass ein geschlossenes Overlay nichts zeichnet und nichts beobachtet. Welche Panels eine Karte hat, welche Optionen sie bekommen und welchen Kasten sie zeigt, entscheidet der Kartenkatalog der Details-View (`slDetailsChartGroups.js`) beim Bau der Karte; das Overlay kennt weder Layouts noch Fach, Lerngruppe oder Schule und platziert nur die Panel-Liste. So haben alle Karten dieselbe Hülle, denselben Kasten und dieselben Exportziele, und die Entscheidung ist ohne DOM testbar. Die Höhe der Selbstwirksamkeitsleiste folgt dem Darstellungsmodus beim Öffnen: das Overlay stempelt ihn als `data-viz-mode`, die Leiste (`overlay-panel--sp`) wird im Boxplot-Modus höher; solange das Modal offen ist, lässt sich der Modus nicht umschalten.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Panels einer Karte | `ChartHostModule` + der Descriptor des Panels | – | Descriptor und Optionen aus der Panel-Liste der Karte (`slDetailsChartGroups.js`) |
| Kasten neben dem Chart | `InfoBoxModule` | [infoBoxModule.md](../../../../packages/modules/src/sl/modules/infoBox/infoBoxModule.md) | `glossaryKey: 'sl.results'`, `onOpenMaterial` schließt danach das Overlay |

## Daten
Keine API-Daten. Die Panels und der Kasten lesen ihre Datensätze selbst; ihre Felder nennen [competenceDetailSectionConfig](../../../../packages/modules/src/sl/modules/charts/competence/detail/competenceDetailSectionConfig.md#daten), [selfEfficacyConfig](../../../../packages/modules/src/sl/modules/charts/selfEfficacy/selfEfficacyConfig.md#daten) und [InfoBoxModule](../../../../packages/modules/src/sl/modules/infoBox/infoBoxModule.md#daten). Ob es eine Selbstwirksamkeitsleiste oder das SW-Layout gibt, entscheidet der Kartenkatalog der Details-View: ohne `properties[sp_mean]` bietet er das SW-Layout nicht an, und eine Lerngruppe ohne Selbstwirksamkeitszeile (`covariates[group]` gleich `name` der Lerngruppenzeile) zeigt nur Chart und Kasten.

Payload: `open(detail)` erhält das Detail der geklickten Karte aus `slDetailsChartGroups.js`, keine Daten: `title` (Dialogname), `key` (`sp`, `subject-<Fach>`, `group-<Lerngruppe>` oder `school`), `panels` (von oben nach unten je `{ suffix, className, config, options }`) und `kasten` (`{ boxKey, placeholderContext }`). Die Chart-Hosts bekommen die Auswahl als Optionen und keinen Payload; sie lesen ihre Datensätze selbst: der mit `competenceDetailSectionConfig` `subjectName`, `groupName`, `showOnlySchoolData`; der mit `selfEfficacyConfig` auf der SW-Karte keine Auswahl (alle Lerngruppenzeilen plus die Schulzeile), über einem Lerngruppen-Chart `groupName` bzw. auf der Schulkarte `showOnlySchoolData: true`. Ob eine Lerngruppe oder die Schule eine Selbstwirksamkeitsleiste bekommt, liest der Katalog aus `SELF_EFFICACY_INDEX` (`findSelfEfficacy`). Der Kasten bekommt als `data` den `boxKey` der Karte (`detailsSubjectSpecific`, `detailsGroupSpecific`, `detailsSchoolSpecific`, `detailsSelfEfficacy`) und als `placeholderContext` Fach und Lerngruppe der Karte (auf der SW-Karte leer): das Fach aus den Daten, nicht den Glossartitel.

## Optionen
Typ `SlDetailOverlayOptions`, ohne Standardwerte:

| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `context` | `AppContext` | – | ja | Kontext der App, an die Chart-Hosts und den Kasten durchgereicht; sein Glossar beschriftet den Dialog |
| `vizMode` | `ReadonlySignal<string>` | – | ja | Das Signal `vizMode` des App-States; geht an die Chart-Hosts, sein Wert beim Öffnen als `data-viz-mode` an das Panel |
| `onOpenMaterial` | `({ subject, type }) => Promise<void>` | – | nein | Öffnet die Materialseite; der Kasten ruft sie für einen Materiallink und schließt danach das Overlay |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `open(detail)` | Aufruf | Dialog nach `detail.title` benannt öffnen, den Darstellungsmodus stempeln, die Panels der Karte und ihren Kasten erzeugen und an die Stelle des vorherigen Inhalts setzen; löst auf, sobald `updateComplete` steht |
| `_teardown()` | Override | Dialog entsorgen, dann Basis |
