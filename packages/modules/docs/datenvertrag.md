# Datenvertrag

Was `@tba3/modules` aus einem Payload liest, und was ein Host darüber hinaus liefern muss.

Das Paket **normalisiert keine Formen**. Es liest die Serverdokumente so, wie TBA3 sie
bekommt; wo TBA3 umformt, tut das ein Adapter, und die Adapter, die zu den Diagrammen
gehören, liegen mit im Paket (`src/en/utils/`, `src/sl/utils/`). Wer ein anders geformtes
Dokument hat, formt es vor dem Aufruf um — das ist die Naht, und sie liegt bewusst auf der
Seite des Hosts.

## Spezifikation

Die Schnittstelle ist der Entwurf der TBA-III-Auswertungsschnittstelle, `tba3-spec.yml`
(OpenAPI 3.1, Version 1.2; Upstream <https://github.com/indibit-eu/tba3>, Swagger-Oberfläche
<https://apps.indibit.eu/tba3-api/docs>). **Pflicht ist ein Feld nur, wenn es im `required:`-Array seines Schemas
steht**; alles andere ist optional — an einer Wertegruppe also alles außer `name`, dazu
sämtliche Itemparameter und alle Query-Parameter.

| Endpunkt | operationIds | Antwortschema |
|---|---|---|
| `competence-levels` | `getGroupCompetenceLevels`, `getSchoolCompetenceLevels`, `getStateCompetenceLevels` | `competence-levels` |
| `items` | `getGroupItems`, `getSchoolItems`, `getStateItems` | `items` |
| `aggregations` | `getGroupAggregations`, `getSchoolAggregations`, `getStateAggregations` | `aggregations` |

Die Query-Parameter sind freie Strings; ihre Werte sind Konventionen der API. TBA3 sendet:

| Parameter | Werte | Bedeutung |
|---|---|---|
| `type` | `students`, `items`, `school,group`, `school,students` | Welche Wertegruppen die Antwort enthält |
| `comparison` | `school-average`, `state-average`, `year` | Vergleichswertegruppen zusätzlich zu den eigenen Zeilen; `year` liefert die Vorjahre |
| `aggregation` | `result` | Aufschlüsselung nach Richtig / Falsch / Unbearbeitet |
| `domain` | Fachkürzel (`en`, `ma`) | Beschränkt ein Gruppendokument auf das Fach des Dashboards |

## Wie eine Unit-Doc die Spezifikation zitiert

Der Abschnitt **Daten** jeder Unit-Doc sagt, welche Teile der Spezifikation die Unit braucht.

- **Endpunkt** heißt die Art (`competence-levels`, `items`, `aggregations`) plus die
  Query-Parameter, die das Dokument formen — nie die Ebene: ein Modul des Pakets weiß nicht,
  ob es unter `groups/` oder `schools/` läuft. Die konkrete Anfrage mit operationId steht in
  der Doc der App.
- **Feldpfade** gelten für ein Element des Antwort-Arrays: Felder der Wertegruppe ohne
  Präfix (`id`, `domain.id`), Nutzdaten mit ihrem Array (`items[].parameters.competenceLevel`).
  `properties[<key>]`, `covariates[<type>]` und `aggregations[type=<wert>]` meinen den
  Eintrag mit diesem Schlüssel bzw. Typ.
- **Benötigt** sind Felder, ohne die die Unit nicht arbeitet. ¹ markiert darunter die
  Felder, die die Spezifikation optional lässt: dort ist die Unit strenger als die
  Spezifikation, und ein konformer Server kann sie trotzdem brechen.
- **Optional genutzt** sind Felder mit Rückfall; die Spalte „Ohne das Feld“ beschreibt, was
  die Unit dann zeigt.
- Die globalen Lesezugriffe unten wiederholt keine Unit-Doc.

## Globale Lesezugriffe

Diese Felder liest das Paket für jede Unit, bevor oder während sie zeichnet:

- **Kompetenzstufen-Skala** (`registerCompetenceLevelScales`, siehe unten): je Zeile des
  Skalendokuments `competenceLevels[].nameShort`, `.id`, `.name` und `.description` sowie
  `properties[levelColor:<id>]` und `properties[standardRank:<id>]`. `id` ist der Schlüssel,
  unter dem Farbe und Rang geliefert werden; ein Hex-Wert in `description` gilt ebenfalls als
  Farbe, jede andere `description` als Prosa für das Glossar.
- **Aufgabenniveau-Skala** (`registerItemCompetenceScales`): `items[].parameters.competenceLevel`
  mit `nameShort` und `id`, dazu `properties[standardRank:<id>]` der Zeile. Tragen die
  Niveaus keine eindeutigen numerischen `id`s, wird keine Aufgabenniveau-Skala registriert.
- **`type` ist der Diskriminator**, nicht `id` oder `name`: jede Zeile, deren `type` nicht
  `group` ist, ist eine Vergleichszeile (`isComparisonValueGroup`), und `type` bestimmt ihre
  Rolle (`resolveAverageRole`). Ein Land, das seinen Landesschnitt nach Abschlusstrack
  aufteilt, liefert Zeilen mit IDs wie `nw-gy`, `nw-hsa` und Namen wie „Landesschnitt GY“ —
  ein Test auf `id === 'state'` erkennt keine davon und zählt sie als Klassen.
- **Merkmale**: `covariates[trait]` mit `value` und `label` (`traitRegistry.js`).
- **Geschlecht**: `covariates[gender]` mit `male` / `female` / `diverse`, abgebildet von
  `GENDER_MAP` in `@tba3/modules/domain` auf **`m` / `w` / `d`**, deutsch, weil die Werte in
  Spaltenköpfen landen.

## Die Skala kommt aus den Daten

Nichts im Paket kennt eine feste Stufenfolge. Die sechs VERA-8-Länder veröffentlichen vier
verschiedene Mathematik-Vokabulare, und EN benutzt GER-Stufen. Deshalb gilt:

1. `registerCompetenceLevelScales(competenceLevels)` **vor** dem ersten Render aufrufen.
   Ohne das hat die Palette keine Bänder, und jede Stufe zeichnet neutral.
2. `registerItemCompetenceScales(...)` zusätzlich, wenn Aufgabenniveaus ein eigenes
   Vokabular sind — sie werden in einem eigenen Namensraum registriert, damit ein
   Aufgabenniveau nie die Suche einer Schüler:innen-Stufe beantwortet.
3. Farben: `properties['levelColor:<id>']` gewinnt, wenn der Payload sie mitbringt; sonst
   erzeugt die Palette eine Rampe über die vorhandene Bandzahl.

## Was der Host zusätzlich liefert

Diagramme und Tabellen bekommen als Optionen, was einen *Datensatz* beschreibt statt die Fachlichkeit.
In TBA3 baut das `enConfig.js`; ein anderer Host baut sein Gegenstück:

| Option | Von wem gelesen | Form |
|---|---|---|
| `enConfig` | Scatterplot, Stil-Diagramme, EN-Tabellen | `{domainIds, domainLabels, fieldName(domainId, suffix), domainFieldPrefix(domainId), styleCategories, equivalenceTables}` — die genaue gelesene Teilmenge steht als `@typedef` in `scatterPointAdapter.js`, `enStyleAggregation.js` und `enClassTableModule.js` (`EnClassTableConfig`) |
| `styleAverages` | Stil-Diagramme | `{classAverages, comparisonGroups}` aus dem Stilaggregat |
| `comparisonState` | jedes Mittelwert-Diagramm | Der Port aus `@tba3/modules/charts`; ohne ihn sind alle Vergleiche sichtbar und es gibt kein ⌀-Menü |
| `itemStore` | EN-Aufgabentabelle, Aufgaben-Lollipop | Eine Ablage mit `setAll(rows)`: die Tabelle **schreibt** ihre sichtbaren Zeilen hinein, der Lollipop liest sie. Pflicht, sobald beide zusammen laufen |
| `studentStore` | EN-Klassentabelle, Stil-Diagramm | Dasselbe für Schüler:innen-Zeilen; ebenfalls Pflicht |
| `averages` | MA-Lösungsquoten-Lollipop | Die Vergleichsmittelwerte je Aufgabe, statisch übergeben |
| `domainTitles` | Scatterplot | Domänen-Id → Achsenbeschriftung |
| `domainMode` | EN-Tabellen, Stil-Diagramm | Startmodus: `'all'` oder eine Domänen-Id; ohne Angabe `'all'` |
| `vizMode`, `defaultVizMode`, `qualityVizMode` | SL-Tabellen, SL-Selbstwirksamkeit, SL-Kompetenzdetail | Darstellungsmodus aus `VIZ_MODES` (`sl/slVizModes.js`) |
| `subjectName`, `domainId` | SL-Klassenabweichung | Fach und Domäne, deren Klassen verglichen werden |
| `domainLabel`, `className`, `showOnlySchoolData` | SL-Kompetenzdetail | Beschriftung und Umfang des Detailabschnitts |
| `glossaryKey` | jede Karte | Glossarpfad für Titel und Tutorial; die EN-KS-Verteilung hat keinen Standard und braucht ihn |
| `onItemPreview` | EN/MA-Aufgaben- und Schülerdatentabellen | `(task) => void` mit `{number, title, domainLabel, level}` (EN zusätzlich `styles`); ohne Handler kein Vorschau-Button |
| `pool` | MA-Klassentabelle | `{id, type}` mit `type` `'all'` oder `'leitidee'` (`MaClassTablePool`); ohne Pool gilt das ganze Testheft |
| `slData` | SL-Infoboxen, SL-Materialien | Der Port `SlData` aus `sl/slData.js`: die Rohdokumente (`competence-levels`, `items`, `students_competence-levels`, die `info_boxes`-Vorlagen) und die Survey-Aggregate; ohne ihn zeigen die Karten ihre Leerzustände |

Den Datenspeicher des Hosts (in TBA3 der `DataStore`) liest keine Datei des Pakets; was eine
Karte an Daten braucht, kommt als Render-Payload oder als eine der Optionen oben.

## Bekannte Abweichungen von `tba3-spec.yml`

- **`type` ist hier Pflicht.** Die Spezifikation macht `type` optional; TBA3 braucht es an
  jeder Zeile, weil es der Diskriminator ist (oben). Die Konventionen der API
  führen es ebenfalls als Pflicht.
- **`null` in den Fixtures.** Die Spezifikation erlaubt nirgends `null`. Die Fixtures unter
  `public/data/` setzen fehlende optionale Felder trotzdem auf `null`, der Server lässt sie
  weg. Für das Paket sind `null` und „nicht vorhanden“ gleichbedeutend.

## Was zuerst bricht

Die vier Descriptoren, die Serverdokumente unverändert lesen — die beiden
KS-Verteilungen, der einzeilige KS-Balken und die SL-Kompetenzübersicht — sind damit
zugleich die am leichtesten wiederverwendbaren und die empfindlichsten gegenüber einer
abweichenden Form. Wer das Paket erprobt, fängt am besten mit einem davon an: wenn ein
`competence-levels.json` dort sauber zeichnet, stimmt die Grundform.
