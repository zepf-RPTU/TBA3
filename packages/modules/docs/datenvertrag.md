# Datenvertrag

Was `@tba3/modules` aus einem Payload liest, und was ein Host darüber hinaus liefern muss.

Das Paket **normalisiert keine Formen**. Es liest die Serverdokumente so, wie TBA3 sie
bekommt; wo TBA3 umformt, tut das ein Adapter, und die Adapter, die zu den Diagrammen
gehören, liegen mit im Paket (`src/en/utils/`, `src/sl/utils/`).

## Spezifikation

Die Schnittstelle ist der Entwurf der TBA-III-Auswertungsschnittstelle, `tba3-spec.yml`
(OpenAPI 3.1, Version 1.2; Referenzkopie [`tba3-spec.yml`](./tba3-spec.yml), Upstream <https://github.com/indibit-eu/tba3>, Swagger-Oberfläche
<https://apps.indibit.eu/tba3-api/docs>). **Pflicht ist ein Feld nur, wenn es im `required:`-Array seines Schemas
steht**; alles andere ist optional — an einer Wertegruppe also alles außer `name`, dazu
sämtliche Itemparameter und alle Query-Parameter.

Das Paket benennt, was die Spezifikation benennt, mit deren Wort (`competenceLevel`, `item`,
`exercise`, `valueGroup`); die Regel und die Dokumentnamen stehen in
[`docs/standards-reference.md`](../../../docs/standards-reference.md) unter „API Vocabulary“.

| Endpunkt | operationIds | Antwortschema |
|---|---|---|
| `competence-levels` | `getGroupCompetenceLevels`, `getSchoolCompetenceLevels`, `getStateCompetenceLevels` | `competence-levels` |
| `items` | `getGroupItems`, `getSchoolItems`, `getStateItems` | `items` |
| `aggregations` | `getGroupAggregations`, `getSchoolAggregations`, `getStateAggregations` | `aggregations` |

Die Query-Parameter sind freie Strings; ihre Werte sind Konventionen der API. TBA3 sendet:

| Parameter | Werte | Bedeutung |
|---|---|---|
| `type` | `group,students`, `group,students,items`, `students,items`, `school,group,students` | Welche Wertegruppen die Antwort enthält |
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

Alle diese Tabellen zusammen, nach Endpunkt gruppiert und mit Link zu jeder Unit, stehen
generiert in [`docs/endpoint-fields.md`](../../../docs/endpoint-fields.md).

## Globale Lesezugriffe

Diese Felder liest das Paket für jede Unit, bevor oder während sie zeichnet:

- **Kompetenzstufen-Skala** (`registerCompetenceLevelScales`, siehe unten): je Zeile des
  Skalendokuments `competenceLevels[].nameShort`, `.id` und `.description` sowie
  `properties[levelColor:<id>]`, `properties[standardBand:<id>]` und
  `properties[itemLevelSpan:<id>]`. `id` ist der Schlüssel, unter dem Farbe, Standardband
  und Spanne geliefert werden; `description` ist Prosa für das Glossar.
  - `standardBand:<id>` ist `low`, `medium` oder `high`: unter Mindeststandard,
    Regelstandard, Optimalstandard. Stufen dazwischen und `k.h.N.` tragen keinen Schlüssel
    und zählen nach ihrer Lage auf der Skala; mehrere Stufen können ein Band teilen.
  - `itemLevelSpan:<id>` ist `"a"` oder `"a-b"`: die Aufgabenniveau-Plätze (die `id`s der
    Aufgabenniveau-Skala, ab 1), die die Stufe abdeckt. Der Server schließt Lücken, sodass
    jeder Platz genau einer Stufe gehört; `k.h.N.` deckt keinen ab. Eine Schülerzeile trägt
    die Spannen ihres eigenen Testhefts. Fehlerhafte Werte gelten als nicht geliefert.
- **Aufgabenniveau-Skala** (`registerItemCompetenceScales`): `items[].parameters.competenceLevel`
  mit `nameShort` und `id`, beide Pflicht an jedem Item; die `id` ist der Platz, auf den sich
  `itemLevelSpan` bezieht. Die Zeilen tragen keine `properties`. Tragen die Niveaus keine
  eindeutigen numerischen `id`s, wird keine Aufgabenniveau-Skala registriert.
- **`type` ist der Diskriminator**, nicht `id` oder `name`: jede Zeile, deren `type` nicht
  `group` ist, ist eine Vergleichszeile (`isComparisonValueGroup`), und `type` bestimmt ihre
  Rolle (`resolveAverageRole`). Ein Land, das seinen Landesschnitt nach Abschlusstrack
  aufteilt, liefert Zeilen mit IDs wie `xx-gy`, `xx-hs` und Namen wie „Landesschnitt GY“ —
  ein Test auf `id === 'state'` erkennt keine davon und zählt sie als Lerngruppen. SL liest
  Schul-, Schüler- und Lerngruppenzeilen als eigene Daten und jede andere Zeile als Vergleichswert
  (`isExternalPopulation`), auch einen Typ, den das Paket nicht kennt; jede Vergleichs-`id` ist ein
  eigener Balken, eine eigene Spalte und ein eigener Schalter (`comparison:<id>`). Ein Name
  gehört zu genau einer Vergleichs-`id`: tragen zwei Vergleichs-`id`s denselben `name`, wird
  das Dokument beim Eintreffen abgelehnt (`DocumentShapeError`).
- **Eine Wertegruppe je Schlüssel**: Ein Kompetenzstufen-Dokument (`competence-levels.json`,
  `students-competence-levels.json`, `prior-years.json`) trägt je `type`, `id`, Fach,
  Domäne und `properties[testPeriod]` höchstens eine Wertegruppe; eine Schüler-`id` gilt je
  Lerngruppe (`covariates[group]`), weil sie sich über Lerngruppen wiederholt. Die Leser nehmen je
  Schlüssel eine Zeile an (die Schule eines Fachs, ein Vergleichsbalken, ein Jahr im Verlauf);
  ein Duplikat lehnt das Dokument beim Eintreffen ab (`DocumentShapeError`).
- **Befragungswerte auf der Skala 1–5**: `properties[tq_mean]` und `properties[sp_mean]` sind
  Mittelwerte von Antworten auf 1–5 (`RATING_DOMAIN`). Eine Zahl außerhalb dieser
  Skala lehnt das Dokument beim Eintreffen ab (`DocumentShapeError`), statt in Anzahl und
  Boxplot zu zählen und in den Antwortbändern nicht; ein Wert, der keine Zahl ist (`k. A.`),
  gilt als keine Angabe.
- **Kein Mitteln über Vergleichswerte hinweg**: Mehrere Vergleichs-`id`s werden nie zu einer
  Zahl zusammengelegt. Ein Vergleichswert, der nur Anteile (`mean`) und keine Zählungen
  (`frequency`, `total`) trägt, gilt für seine eigene Zeile; über mehrere Domänen wird er nicht
  gemittelt, weil nichts sagt, wie die Domänen zu gewichten sind — die Fachzahl bleibt dann leer,
  außer der Vergleichswert bringt eine eigene Zeile ohne `domain` für das ganze Fach mit (der
  Mathematik-Landesschnitt der API: der Mittelwert über alle Aufgaben des Fachs). Die Fachzahl
  der Schule ist nach Antworten gewichtet, der Landesschnitt ein Aufgabenmittel; dieselbe
  Abweichung nimmt schon der Vergleich je Domäne hin.
  Texte, die „den Landesschnitt“ nennen (Infoboxen, Materialien), vergleichen nur, wenn genau
  eine `state`-`id` geliefert wird.
- **Testhefte** (`properties[booklet]` der Kompetenzstufen-Zeilen des aktuellen Jahres): eine
  Zeile über mehrere Testhefte trägt deren Kennungen kommagetrennt (`26-V8-DE-TH-1,26-V8-DE-TH-2`).
  Eine Lösungsquote vergleicht SL nur, wenn ihre Zeilen über Schule, Lerngruppen und
  Vergleichswerte genau ein Testheft nennen (`slBooklets.js`): die einer Domäne für die
  Lösungsquote der Domäne, die des ganzen Fachs für eine Lösungsquote über das Fach (oder ein
  Fach ohne Domänen). Ein Testheft deckt nicht immer alle Domänen ab (Deutsch in NW: Lesen mit
  Rechtschreibung in einem, mit Sprachgebrauch in einem anderen), und die Kennungen stehen an
  der Zeile jeder Domäne. Nennen sie zwei oder mehr, bleibt diese Lösungsquote leer, und die
  Ansichten sagen warum. Kompetenzstufen sind je
  Testheft äquivalenzskaliert und bleiben vergleichbar. Der Gruppenvergleich prüft enger: dort
  zählen nur die Testhefte der Lerngruppen hinter dem gewählten Paar (`POINTS_MIXED_BOOKLETS`).
- **Eine Skala je Fach×Domäne**: die Stufenfolge einer Kombination ist die registrierte Skala,
  auf die ihre Zeilen auflösen, nicht die längste Zeile (`buildLevelDefinitions`). Lösen die
  Zeilen einer Kombination auf zwei Skalen auf, fällt sie mit einer Warnung weg und ihre
  Ansichten zeigen „Keine Daten“.
- **Merkmale**: `covariates[trait]` mit `value` und `label` (`studentIdentity.js`).
- **Geschlecht**: `covariates[gender]` mit `male` / `female` / `diverse`. Die Datensätze
  behalten den API-Wert; angezeigt, gefiltert und exportiert wird er über `GENDER_LABELS`
  (`genderLabel`) als **Männlich / Weiblich / Divers**.

## Die Skala kommt aus den Daten

Nichts im Paket kennt eine feste Stufenfolge: die Länder benennen ihre Stufen
verschieden, und EN benutzt GER-Stufen. Deshalb gilt:

1. Die Skalen werden registriert, sobald ihr Dokument im `DocumentStore` landet: der Store
   reicht jedes gelandete Dokument an seinen `onLand`-Hook. Den setzt der Kontext selbst,
   wenn `createModuleContext` (`@tba3/modules/context`) seinen Store baut, über der frischen
   Palette dieses Kontexts; der Hook ruft `registerCompetenceLevelScales` für
   `competence-levels.json` und `registerItemCompetenceScales` für `items.json`, wo eine App
   eines hat.
2. Aufgabenniveaus werden in einem eigenen Namensraum registriert, damit ein Aufgabenniveau
   nie die Suche einer Schüler:innen-Stufe beantwortet.
3. Farben: `properties['levelColor:<id>']` gewinnt, wenn der Payload sie mitbringt; sonst
   nimmt jede Stufe die Farbe ihres Abstands zur `medium`-Stufe ihrer Skala aus der
   Standardrampe.

## Was der Host liefert

**Die Daten** holt jede Karte selbst, aus dem `DocumentStore` (`@tba3/modules/documents`)
ihres Kontexts (`context.documents`). Der Host baut den Kontext einmal je Datensatz:
`createModuleContext({glossaryData, namespace, store: {requests, loadRequest}})` baut Glossar
und Palette und darüber den Store, mit den Anfragen seines Fachs
(`GROUP_REQUESTS.en`, `GROUP_REQUESTS.ma`, `SCHOOL_REQUESTS`) und einem Loader — für die
Auswertungsschnittstelle `apiRequestLoader({baseUrl, scope})`. Den
Datensatzkatalog des Fachs (`EN_DATASETS`, `MA_DATASETS`, `SL_DATASETS` aus
`@tba3/modules/{en,ma,sl}-domain`) meldet niemand an: jeder Schlüssel trägt Eingaben und
Builder selbst, und der Store baut ihn beim ersten Lesen. Jede Karte
nennt, was sie liest (`static documents` an der Kartenklasse, `documents` am Diagramm-Descriptor;
Dokumentnamen wie `competence-levels.json` oder Datensatzschlüssel wie
`EN_DATASETS.STUDENT_RECORDS`), und ihr Host lädt es vor jedem Render nach: eine allein
eingebaute Karte sendet genau die Anfragen hinter ihren Dokumenten, mehrere Karten teilen
sich jede Anfrage. SL braucht zusätzlich `info-boxes.json`, das keine Anfrage der
Schnittstelle beantwortet: der Host hängt dafür eine eigene Anfrage an (`site`-Pfad statt
`template`) und beantwortet sie mit seinem Loader. Ohne Kontext wirft die Karte beim
Render.

**Optionen** tragen, was keine Daten sind: Auswahl, Rückrufe, Darstellung.

| Option | Von wem gelesen | Form |
|---|---|---|
| `context` | jede Karte | Der Kontext aus `createModuleContext`; sein `documents` ist der `DocumentStore` des Datensatzes |
| `comparisonState` | jedes Mittelwert-Diagramm | Der Port aus `@tba3/modules/charts`; ohne ihn sind alle Vergleiche sichtbar und es gibt kein ⌀-Menü |
| `domainId` | EN-KS-Verteilung | Die Domänen-Id aus `EN_DATASETS.CONFIG.domainIds`, deren Zeilen die Karte zeigt; ohne sie wirft der Render |
| `domainMode` | EN-Tabellen, EN-Aufgaben-Lollipop, Stil-Diagramme | Domänen-Modus, als Signal oder fester Wert: `'all'` oder eine Domänen-Id; ohne Angabe `'all'` |
| `vizMode` | SL-Tabellen, SL-Selbstwirksamkeit, SL-Kompetenzdetail | Darstellungsmodus aus `VIZ_MODES` (`sl/slVizModes.js`) |
| `subjectName`, `domainId` | SL-Lerngruppenabweichung | Fach und Domäne, deren Lerngruppen verglichen werden |
| `subjectName`, `groupName`, `showOnlySchoolData` | SL-Kompetenzdetail, SL-Selbstwirksamkeit | Welcher Ausschnitt: ein Fach, eine Lerngruppe, nur die Schule; ohne Angabe die ganze Schule (Selbstwirksamkeit: jede Lerngruppe und die Schule) |
| `glossaryKey` | jede Karte | Glossarpfad für Titel und Tutorial; die EN-KS-Verteilung hat keinen Standard und braucht ihn |

Der Render-Payload trägt nur Identität und Auswahl — `{studentId}`, `{boxKey,
placeholderContext}` (darin `comparison`: die Auswahl des Gruppenvergleichs, nie dessen
Zahlen), `{selectedStudents, selectedRing}`, `{metricId}` —, nie Daten. Was mehrere
Karten gleich lesen müssen (die y-Achse der SL-Lerngruppenabweichung, die Kennzahlen des
Vergleichskastens), ist ein Dataset mit Parametern, das der Store einmal je Auswahl baut
(`getDataset(KEY, ...auswahl)`), und jede Karte liest es selbst.

## Validierung an der Grenze

1. Ein Dashboard sendet seine **Anfragen** (eine je Endpunkt, siehe unten). Jede Antwort ist
   ein Array von Wertegruppen, für die SL-Infoboxen ein Objekt.
2. Der `DocumentStore` teilt jede Antwort nach dem `type` der Zeile in **Dokumente**:
   `student`-Zeilen in das `students-…`-Dokument, `item`-Zeilen in `items-…`, Zeilen eines
   anderen `properties[testPeriod]` als des aktuellen Jahres in `prior-years.json` (nur SL), alles
   andere (Lerngruppe, Schule, jede Vergleichszeile) in das Dokument der Anfrage.
3. **Jedes Dokument wird gegen sein Schema geprüft**, bevor etwas davon gespeichert wird.
   Eine Anfrage, deren Dokumente alle passen, wird gespeichert, tief eingefroren und an die
   Skalenregistrierung gereicht; scheitert eines, bleibt nichts davon lesbar.
4. Ein Fehler lässt das Laden scheitern, in Entwicklung wie in Produktion: ein
   `DocumentShapeError` mit Anfrage, Dokument, Zeile und Feldpfad, das Dashboard zeigt „Die
   gelieferten Daten haben nicht die erwartete Form.“, und die Konsole nennt die Stelle:

   ```text
   Document 'competence-levels.json' (answer to '{scope}/competence-levels?…') is malformed:
   value group 0 (group '8b') competenceLevels.2.nameShort: Invalid type: Expected string but received null
   ```

   Höchstens fünf Befunde werden aufgelistet, dann „(+N more)“.
   Ein unbekannter Dokumentname scheitert ebenso.

Die Schemas sind TBA3s Verbrauchervertrag, nicht die Spezifikation:

- Jedes Feld, das TBA3 liest, wird **geprüft, wo es vorkommt**.
- **Pflicht** ist ein Feld nur, wenn die Spezifikation es verlangt, wenn TBA3 es abweichend
  verlangt (`type`, siehe unten) oder wenn die Zeilen jeder App es tragen.
- Ein fehlendes optionales Feld wird weggelassen; `null` ist kein gültiger Wert.
- Unbekannte Felder sind erlaubt und bleiben erhalten.
- Eine Pflicht-Zeichenkette (eine `id`, ein `type`, ein Name, ein `nameShort`) wird beim
  Landen getrimmt und darf danach nicht leer sein.
- Ein Dokument kann Schlüsselkonventionen verlangen, die jede seiner Zeilen trägt:
  `properties[booklet]` in `competence-levels.json`, `properties[firstName]`,
  `properties[lastName]` und `covariates[group]` in beiden `students-…`-Dokumenten; der Wert
  darf nicht leer sein.
- **Nicht** im Schema: Schlüsselkonventionen, die nur manche Zeilen tragen
  (`properties[testPeriod]`, `covariates[gender]`, …), und Regeln, die Zeilen miteinander
  vergleichen (EN: genau zwei Domänen). Die zeilenübergreifenden Regeln stehen unten je
  Dashboard; welche Unit welches Schlüsselfeld liest und was sie ohne es zeigt, steht in
  [`docs/endpoint-fields.md`](../../../docs/endpoint-fields.md).

### Dokumente und ihre Schemas

Jedes Dokument ist einmal deklariert, in `DOCUMENTS` (`src/common/data/documentSchemas.js`,
dort auch `validateDocuments` und `DocumentShapeError`): der Teil der Antwortzeilen, der es
bildet, und sein Schema. Die Feldformen stehen in den Schemas selbst und werden hier nicht
wiederholt.

| Dokument | Schema |
|---|---|
| `competence-levels.json`, `students-competence-levels.json`, `prior-years.json` | [`schemas/competenceLevels.js`](../src/common/data/schemas/competenceLevels.js) |
| `items.json` | [`schemas/items.js`](../src/common/data/schemas/items.js) |
| `aggregations.json`, `students-aggregations.json`, `items-aggregations.json` | [`schemas/aggregations.js`](../src/common/data/schemas/aggregations.js) |
| `info-boxes.json` (SL, eine Datei der Site) | [`schemas/infoBoxes.js`](../src/common/data/schemas/infoBoxes.js) |

Jedes Array-Dokument ist eine Liste von Wertegruppen
([`schemas/valueGroup.js`](../src/common/data/schemas/valueGroup.js)).

### Anfragen je Dashboard

**EN (Englisch 8)**: eine Lerngruppe, `{scope}` = `groups/<id>`.

| Anfrage | Dokumente |
|---|---|
| `{scope}/competence-levels?type=group,students&domain=en&comparison=school-average,state-average` | `competence-levels.json` (Lerngruppe und Vergleiche), `students-competence-levels.json` |
| `{scope}/items?domain=en&comparison=school-average,state-average` | `items.json` |
| `{scope}/aggregations?type=group,students,items&domain=en&comparison=school-average,state-average` | `aggregations.json`, `students-aggregations.json`, `items-aggregations.json` |

Die Regel, die keiner einzelnen Unit gehört: `domain.id` an jeder Zeile von
`competence-levels` und **genau zwei Domänen** (Hören, Lesen); sonst startet das Dashboard
nicht (`enConfig.js`).

**MA (Mathematik 3)**: eine Lerngruppe; dieselben Anfragen mit `domain=ma`, nur die Aggregationen anders.

| Anfrage | Dokumente |
|---|---|
| `{scope}/competence-levels?…&domain=ma&…` (wie EN) | `competence-levels.json`, `students-competence-levels.json` |
| `{scope}/items?domain=ma&…` (wie EN) | `items.json` |
| `{scope}/aggregations?type=students,items&domain=ma&aggregation=result` | `students-aggregations.json`, `items-aggregations.json` |

Anders als in EN darf `domain` an den Zeilen von `competence-levels` fehlen.

**SL (Schulleitung)**: eine Schule, `{scope}` = `schools/<id>`, kein Fachfilter.

| Anfrage | Dokumente |
|---|---|
| `{scope}/competence-levels?type=school,group,students&comparison=state-average,year` | `competence-levels.json` (aktuelles Jahr), `students-competence-levels.json`, `prior-years.json` (frühere Jahre) |
| `{scope}/aggregations?type=school,group,students&aggregation=result&comparison=state-average` | `aggregations.json`, `students-aggregations.json` |
| `data/sl/info-boxes.json` (Datei der Site) | `info-boxes.json` |

Die API stempelt in einer Antwort mit `comparison=year` jede Zeile mit `properties[testPeriod]`
und liefert das aktuelle Jahr zuerst, die Vorjahre danach. Der Stempel der ersten Zeile nennt
deshalb das aktuelle Jahr; jede Zeile mit einem anderen Stempel geht nach `prior-years.json`,
eine Zeile ohne Stempel zählt zum aktuellen Jahr. Kein Dashboard-Code erzeugt Laufzeitdaten
oder deutet, wie die API zu ihnen kam: jedes gelieferte Jahr wird gleich dargestellt, und
`properties[simulated]` wird nicht gelesen.

## Bekannte Abweichungen von `tba3-spec.yml`

- **`type` ist Pflicht.** Die Spezifikation lässt es optional; für TBA3 ist es der
  Diskriminator.
- **`id` und `name` sind Pflicht** an jeder Wertegruppe; die Spezifikation verlangt nur `name`.
- **`items[].iqbId` und `.exercise` sind Pflicht**, wie in der Spezifikation; `exercise.name`
  darf nicht leer sein.
- **`properties[booklet]` ist Pflicht an jeder Zeile von `competence-levels.json`** (das
  aktuelle Jahr, ohne Schülerzeilen): es entscheidet, ob Lösungsquoten vergleichbar sind.
- **Schülerzeilen tragen `properties[firstName]`, `properties[lastName]` und
  `covariates[group]`** (der `name` ihrer Lerngruppenzeile), in `students-competence-levels.json`
  wie in `students-aggregations.json`; Schülerzeilen früherer Jahre (`prior-years.json`) nicht.
  `covariates[gender]` bleibt optional.
- **`items[].position`, `items[].parameters` und darin `competenceLevel` mit `id` und
  `nameShort` sind Pflicht**, an jedem Item jeder Zeile, Vergleichszeilen eingeschlossen; die
  Spezifikation lässt alle optional (am Niveau nur `nameShort` nicht). `position` ordnet die
  Teilaufgaben einer Aufgabe, das Niveau färbt und filtert das Item.
- **`domain.id` und `domain.name` sind Pflicht, wo eine Wertegruppe `domain` trägt** (in
  `items.json` auch `domain` selbst); die Spezifikation verlangt nur `name`, die Leser ordnen
  Domänen nach `id`.
- **`domain.id` darf nirgends `all` heißen.** Die Dashboards nennen alle Domänen zusammen so
  (in MA der Ring und das Aufgabenpool „Gesamt“, in EN der Domänen-Modus); ein Dokument mit
  dieser Id wird abgewiesen.
- **`descriptiveStatistics`**: Die Spezifikation verlangt `total`, `mean`, `frequency` und
  `standardDeviation`; TBA3 verlangt nur `mean`, weil eine Vergleichspopulation Anteile ohne
  Kopfzahlen liefern kann.
