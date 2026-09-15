# SL-Infoboxen: Aufbau und Platzhalter

> Dieses Dokument ist auf Deutsch, weil es eine Anleitung für die Autor:innen der
> deutschsprachigen Boxtexte ist. Der übrige `docs/`-Bestand bleibt englisch.

## Überblick

Eine Infobox ist ein `InfoBoxModule` (`packages/modules/src/sl/modules/infoBox/infoBoxModule.js`, erbt
`ContentModule`), das über einen `boxKey` einen Eintrag aus `public/data/sl/info_boxes.json`
rendert. Die Sätze sind dort auf Deutsch ausgeschrieben und enthalten `{{…}}`-Platzhalter,
die zur Laufzeit gegen die geladenen Daten aufgelöst werden — dieselbe Box liefert damit auf
jedem Datensatz die passenden Zahlen und Namen.

Instanziert wird die Box von der View oder vom `SlDetailOverlayModule`. Der `boxKey` kommt
entweder als feste Option (`src/sl/views/slWelcomeViewModule.js`: `boxKey: 'welcome'`) oder pro
Render aus den Daten, wenn die Box mitwechseln soll (`src/sl/views/slComparisonViewModule.js`
tauscht sie je Auswahl im Chart).

Der Leser akzeptiert genau die Formen, die die Boxen verwenden. Eine Form, die keine Box
braucht, gibt es nicht — wer eine neue braucht, ergänzt sie zusammen mit der Box, die sie
verwendet.

## Aufbau von `info_boxes.json`

Drei Ebenen auf oberster Stufe:

- `meta` — die Locale der Zahlenformatierung.
- `sectionTypes` — die Abschnittsarten (`general`, `praise`, `alarm`), jede mit `label`,
  `icon` (Material-Icon) und `tooltip` (alle drei Pflicht) sowie optional
  `materialLinkSubjectMode`.
- `boxes` — die Boxen selbst, je Schlüssel eine.

Eine Box besteht aus `sections[]`, ein Abschnitt aus `type` und `blocks[]`:

```json
"welcome": {
    "sections": [
        {
            "type": "general",
            "blocks": [
                "Fächerübergreifend liegen im Jahrgang {{shareRange(target=school, levelAlias=ge_3)}} der SuS auf oder oberhalb von Kompetenzstufe {{standardBands(levelAlias=ge_3, skipBlock=true)}}.",
                { "type": "link", "token": "{{Übersicht+Gesamt}}" }
            ]
        }
    ]
}
```

`sections[].type` ist zugleich der Schlüssel des Abschnitts: Label, Icon und Tooltip der
Abschnitts-Schaltfläche kommen aus `sectionTypes`. Ein Abschnitt darf
`materialLinkSubjectMode` überschreiben, wenn er eine andere Fachauswahl braucht als seine
Art vorgibt.

Ein Block ist eines von vier Dingen:

| Form | Bedeutung |
|---|---|
| `"Ein Satz mit {{…}}"` | Textblock |
| `{ "text": "…", "sublist": [ … ] }` | Textblock mit eingerückter Unterliste aus Text- und Repeat-Blöcken |
| `{ "repeat": "classes\|subjects", "filter": {…}, "template": "…" }` | expandiert zu je einer Zeile pro Klasse bzw. Fach |
| `{ "type": "link", "token": "{{Typ+Fach}}" }` | Schaltfläche ins Material |

## Wie Platzhalter aufgelöst werden

Vier Stationen, in dieser Reihenfolge:

1. **Repeat-Interpolation** — `packages/modules/src/sl/modules/infoBox/infoBoxRepeatBlocks.js` expandiert
   Repeat-Blöcke und ersetzt die `[[token]]` der Vorlage durch die Werte der jeweiligen
   Zeile; das Modul reicht nur den Daten-Port und den Platzhalterkontext hinein.
2. **Parsen** — `packages/modules/src/sl/modules/infoBox/infoBoxPlaceholders.js` zerlegt jedes
   `{{name(arg=wert, …)}}` in Namen und Argumentliste. Alle Werte bleiben Strings.
3. **Dispatch** — `InfoBoxTextResolver` (`packages/modules/src/sl/modules/infoBox/infoBoxTextResolver.js`)
   ordnet dem Namen einen Handler zu, der Ziel, Fach, Domäne und Stufen **einmal**
   normalisiert und das Ergebnis formatiert. Die Verben darunter bekommen fertige
   Zieldeskriptoren und bereinigte Stufenlisten und normalisieren nichts mehr.
4. **Abfrage** — die Datenfrage über `competence-levels.json` beantworten die
   `CompetenceShareQueries` (`packages/modules/src/sl/utils/slCompetenceShares.js`, die
   gewichteten Anteile je Fach×Domäne und je Fach — dieselbe Klasse, die auch die
   Überblick-Kennzahlen und die Materialseiten rechnen) und darüber die Verben in
   `infoBoxShareSelections.js` (die Superlative „stärkste Klasse“, „größte Spannweite“) und
   `infoBoxStateComparison.js` (die Landesschnitt-Vergleiche). Zielauflösung, Zeilenfilter
   und die Verhältnis-Summe sind reine Funktionen in
   `packages/modules/src/sl/utils/slQueryPrimitives.js`.

Vier Verhaltensregeln, die man beim Schreiben der Texte kennen muss:

- **Ein unbekannter oder nicht auflösbarer Platzhalter bleibt sichtbar stehen.** Er wird
  wörtlich als `{{…}}` gerendert, statt still zu verschwinden — Fehler sollen auffallen.
- **`skipBlock=true` entfernt den ganzen umgebenden Block**, nicht nur den Wert. Ohne das
  Argument entsteht ein Satz mit Loch („… Kompetenzstufe  wird … erreicht").
- **Kein HTML in `info_boxes.json`.** Der fertige Text läuft durch `escapeHtml`; aufgelöste
  Werte werden intern markiert und als `<span class="info-box-placeholder-value">` gerendert,
  danach annotiert der `glossaryAnnotator` die Fachbegriffe.
- **Auswahlen sind blocklokal.** `selectShareTarget(id=…)` legt seine Auswahl im
  `resolutionState` des laufenden Blocks ab; nur spätere Platzhalter **im selben Block**
  erreichen sie über `target=selection:<id>`. Über Blockgrenzen hinweg gibt es keinen Zustand.

## Platzhalter-Referenz

Alle registrierten Platzhalter. `target` ist überall `school` | `class:current` |
`selection:<id>`; `subjectName` ist immer `current`; `domainId` immer `selection:<id>`.
Fach und Domäne werden nie wörtlich genannt: eine Datei bedient jeden Datensatz, und ein
hineingeschriebener Fachname löste nur dort auf, wo es dieses Fach zufällig gibt. Ein
`target=selection:<id>` leiht dem Platzhalter Fach und Domäne der Auswahl, wenn er sie
nicht selbst nennt.

| Platzhalter | Liefert | Argumente |
|---|---|---|
| `share` | Anteil der SuS auf den Stufen des Alias | `target`, `levelAlias`, `subjectName`, `domainId` |
| `subjectShare` | derselbe Anteil, über alle Domänen eines Fachs aggregiert | `target` (Vorgabe `school`), `levelAlias`, `subjectName` (Vorgabe `current`), `domainId` |
| `shareRange` | Spannweite dieses Anteils über die Zeilen des Ziels | `target`, `levelAlias` |
| `subjectShareClassRange` | Spannweite des Fach-Anteils über die Klassen | `target`, `levelAlias`, `subjectName`, `domainId` |
| `selectShareTarget` | wählt Klasse/Fach/Domäne per Rangfolge, merkt sie unter `id`, gibt `field` aus | `id`, `scope`, `mode=min\|max`, `field`, `target`, `levelAlias`, ggf. `subjectName`, `domainId` |
| `selectSubjectDomain` | wählt die 1. oder 2. Domäne eines Fachs in natürlicher Reihenfolge | `id`, `subjectName`, `order=1\|2`, `field`, `multiDomainOnly`, `skipBlock` |
| `standardBands` | Name der Kompetenzstufe, an der der Alias greift — je geladener Skala | `levelAlias`, `skipBlock` |
| `listStateComparisonSubjects` | Fächerliste über bzw. unter Landesschnitt | `target`, `levelAlias`, `comparison=gt\|lt`, `aggregation=anyDomain\|subject` |
| `listStateComparisonClasses` | Klassenliste über bzw. unter Landesschnitt | `target`, `levelAlias`, `comparison=gt\|lt`, `subjectName` |
| `summaryContext` | ein Feld aus `summaries.<ns>.context` | `namespace`, `field`, `format`, `skipBlock` |
| `summaryEntity` | ein Feld aus `summaries.<ns>.entities.<entity>` | `namespace`, `entity`, `field`, `format`, `skipBlock` |

`field` einer Auswahl ist `className`, `subjectName`, `domainName` oder
`subjectDomainLabel` (letzteres rendert „Fach (Domäne)" und fällt bei eindomänigen Fächern
auf den Fachnamen zurück). `format` ist `percent`, `decimal` oder `integer`; ohne Angabe
werden ganze Zahlen als Integer, andere mit Nachkommastellen gerendert.

`share(...)` und `subjectShare(...)` sind bei `target=school` **absichtlich** verschiedene
Zeilenmengen: das eine liest die Zeilen mit der Schul-ID, das andere summiert die
Klassenzeilen. Nicht zusammenlegen.

### `levelAlias`

Die semantische Schicht über den konkreten Stufennamen; sie wird je geladener Skala
aufgelöst (`packages/modules/src/sl/utils/slCompetenceLevels.js`). Ein Platzhalter nimmt
nur einen Alias, keine ausgeschriebene Stufenliste.

| Alias | Bedeutung | Römische Skala | GER-Skala |
|---|---|---|---|
| `e_1` | nur die unterste Stufe | `I` bzw. `Ia`, `Ib` | `A1` |
| `le_3` | alle Stufen ≤ 3 | `I…III` (ggf. mit `Ia`/`Ib`) | `A1`, `A2`, `B1` |
| `ge_3` | alle Stufen ≥ 3 | `III`, `IV`, `V` | `B1`, `B2`, `C1` |
| `e_5` | nur die oberste Stufe | `V` | `C1` |

`le_3` ist **nicht** `1 − ge_3` (das wäre `le_2`). Der Satz neben einem `le_3`-Anteil muss
deshalb „höchstens auf Kompetenzstufe …" heißen, nie „unterhalb".

### `selectShareTarget`-Scopes

Jeder Scope rankt auf einem Kompetenzstufen-Anteil — derselben Größe, die der Block danach
ausgibt. Der `levelAlias` beider darf abweichen: die Alarm-Blöcke ranken aufsteigend auf
`ge_3` und drucken `le_3`, also dieselbe Schwäche von der anderen Seite gelesen.

| Scope | Rangfolge über |
|---|---|
| `classMean` | Klassen nach ihrem über die Fächer gemittelten Anteil |
| `classRange` | die Klasse, deren Fächer am weitesten auseinanderliegen |
| `subjectDomainShare` | Fach-/Domänen-Zeilen nach Anteil |
| `classInSubject` | Klassen innerhalb eines Fachs (braucht `subjectName`, optional `domainId`) |
| `subjectClassRange` | das Fach, dessen Klassen am weitesten auseinanderliegen |
| `subjectDomainClassRange` | dasselbe, aber je Domäne einzeln |
| `subjectStateDiff` | das Fach mit der größten Abweichung vom Landesschnitt |

`subjectClassRange` und `subjectDomainClassRange` ranken immer schulweit und ignorieren ein
übergebenes `target`. Die beiden bleiben getrennt, weil das Poolen der Domänen eines Fachs
deren Klassenspannen mittelt — die größte interne Lücke der Schule verschwände hinter einem
ruhigen Aggregat. `subjectStateDiff` rankt auf dem **Betrag** der Differenz; die Antwort kann
also auch das Fach am weitesten **über** dem Landesschnitt sein.

## Repeat-Blöcke

Ein Repeat-Block erzeugt eine Zeile je Klasse oder Fach, ohne dass Beispielzeilen im JSON
stehen müssen:

```json
{
    "repeat": "subjects",
    "filter": { "className": "current" },
    "template": "Im Fach [[quotedSubjectDisplayName]] liegt dieser Wert bei {{subjectShare(target=class:current, levelAlias=ge_3, subjectName=current)}}."
}
```

- **`repeat`** — `classes` oder `subjects`.
- **`template`-Token** — bei `classes` `[[quotedClassName]]`, bei `subjects`
  `[[subjectShortDisplayName]]` und `[[quotedSubjectDisplayName]]`. Den Fachnamen bzw.
  Klassennamen der Zeile liest ein Platzhalter als `current` aus dem Kontext.
- **`filter`** — bei `classes` ein `subjectName` (nur Klassen, die das Fach geschrieben
  haben), bei `subjects` ein `className` (nur Fächer, die die Klasse geschrieben hat);
  jeweils ein Literal oder `current`.

Jede expandierte Zeile löst mit eigenem Kontext auf; zwischen den Zeilen gibt es keinen
gemeinsamen Auswahlzustand.

## Material-Links

```json
{ "type": "link", "token": "{{Übersicht+Fach}}" }
```

Gültige Token: `{{Übersicht+Fach}}`, `{{Übersicht+Gesamt}}`,
`{{Ergebniszusammenfassung+Fach}}`, `{{Ergebniszusammenfassung+Gesamt}}`,
`{{Leitfragen+Gesamt}}`. Gerendert wird eine Schaltfläche mit der Beschriftung
`<Typ>: <Fach> im Material anzeigen`, also etwa „Übersicht: Deutsch im Material anzeigen".

`+Gesamt` heißt fachübergreifend, `+Fach` bezieht sich auf ein Fach: das der View
(`placeholderContext.subjectName`), sonst das, das `materialLinkSubjectMode` aus dem
`sectionType` (oder dem Abschnitt) wählt — `best`, `worst` oder `extrema`, gerankt auf
demselben `ge_3`-Anteil (`getSubjectCompetenceShare`), den die Sätze drucken, schulweit
oder für die Klasse des Kontexts. Ein einzelner Link-Block kann dadurch zu mehreren
Schaltflächen expandieren.

## Live-Werte aus der View: `summaries`

Manche Boxen beschreiben nicht die Rohdaten, sondern das, was gerade im Chart daneben steht.
Dafür reicht die View einen Auszug herein:

```js
placeholderContext: {
    summaries: {
        comparison: buildComparisonInfoBoxSummaryNamespace(this.#latestComparisonSummary)
    }
}
```

Ein Namespace hat genau zwei Fächer: `context` (Felder, die für die ganze Box gelten) und
`entities` (benannte Einheiten mit je eigenen Feldern). Aufgebaut werden sie in
`packages/modules/src/sl/modules/infoBox/infoBoxSummaryNamespaces.js`, die die Rohwerte auf das reduzieren, was ein
Template lesen darf, und Unmessbares zu `null` normalisieren statt zu `NaN`. Aktuell
existieren `comparison` und `selfEfficacy`.

```text
{{summaryContext(namespace=comparison, field=shareLabel, skipBlock=true)}}
{{summaryEntity(namespace=selfEfficacy, entity=bestClass, field=className, skipBlock=true)}}
```

## Erweitern

### Einen neuen Platzhalter bauen

1. Fall im `switch` von `InfoBoxTextResolver.#resolvePlaceholder` eintragen — das ist die
   einzige Stelle, an der ein Name gültig wird.
2. Private `#resolve…Placeholder`-Methode nach dem Muster der Nachbarn schreiben:
   `#resolveMetricPlaceholderContext()` liefert Ziel, Fach, Domäne und Stufennamen inklusive
   Vererbung aus einer gespeicherten Auswahl; `parseBooleanParam()` liest `skipBlock`; die
   `#format…`-Helfer erzeugen die Ausgabe. Bei fehlenden Argumenten `#warn()` rufen und
   `null` zurückgeben — dann bleibt der Platzhalter sichtbar stehen.
3. Braucht der Platzhalter eine neue Datenfrage: ein Anteil gehört in
   `CompetenceShareQueries`, ein Superlativ als Funktion in `infoBoxShareSelections.js`,
   ein Landesschnitt-Vergleich in `infoBoxStateComparison.js`; die Primitiven für Ziel,
   Zeilenfilter und Verhältnis stehen in `slQueryPrimitives.js`, die für Spannweite und
   Rangfolge in `infoBoxSelectionRanking.js`. Fach-Aggregate und domänenskopierte Helfer
   nicht zusammenlegen, nur um Zeilen zu sparen — die Namen kodieren verschiedene
   Messbereiche.
4. Test in `tests/unit/sl/modules/infoBox/slInfoBoxTextResolver.test.js` (Verben:
   `infoBoxShareSelections.test.js`, `infoBoxStateComparison.test.js`).

### Ein neues `summaries`-Namespace

Aufbaufunktion in `packages/modules/src/sl/modules/infoBox/infoBoxSummaryNamespaces.js` ergänzen, in der View über
`placeholderContext.summaries.<name>` hereinreichen, im Text mit `summaryContext` bzw.
`summaryEntity` lesen. Ein neuer Handler ist dafür nicht nötig.

### Eine neue Box oder Abschnittsart

Box: Eintrag unter `boxes.<key>` in `public/data/sl/info_boxes.json`, `boxKey` dort setzen, wo das
`InfoBoxModule` instanziert wird. Abschnittsart: Eintrag unter `sectionTypes` — Label, Icon
und Tooltip kommen von dort, im Abschnitt genügt dann `type`.

## Fallstricke

**Es gibt keinen Lösungsquoten-Platzhalter, und es soll keinen geben.** Eine Lösungsquote ist
ein ungewichtetes `Σ frequency / Σ total` über die Aufgaben, die im jeweiligen Heft standen —
und die Klassen, die eine SL-Box vergleicht, sitzen verschiedene Hefte. Eine Schule kann
innerhalb eines Fachs mehrere Hefte mischen, meist über die Schwierigkeiten A/B/C. Das
Poolen ist damit verzerrt, nicht bloß verrauscht. Eine Kompetenzstufen-Verteilung ist dagegen je Heft über die
Äquivalenztabelle angeglichen, bevor sie den Client erreicht. `getSolutionRate` und
`getSubjectSolutionRate` leben in `packages/modules/src/sl/utils/slSolutionRates.js`
(`SolutionRateQueries`) für die Überblick-Metrik und die Materialseiten — sie dürfen nicht in
einen Platzhalter zurückwandern. Einzige Ausnahme ist
die Box `comparisonPoints`, deren Zahlen aus `summaries.comparison` stammen: dort hat die
Leserin die Lösungsquote im Chart selbst ausgewählt, und der Text benennt ihre Grenzen.

**Kein Kompetenzstufenname wird ausgeschrieben.** `standardBands(...)` löst je geladener
Skala auf und verbindet mehrere mit „ bzw. " (`III bzw. B1` auf `sl`, `B1` auf einer
GER-Skala `A1 … C1`, `KS 3` auf der NRW-Skala `k.h.N., KS 1 … KS 5`; `formatStandardBands` in `slCompetenceLevels.js`, dieselbe Phrase wie in
den Überblick-Kennzahlen und den Materialseiten) — genau das erlaubt einer gemeinsamen
`info_boxes.json`, jeden Datensatz zu bedienen. Der Operator bleibt in der Prosa: `ge_N`
nennt die unterste qualifizierende Stufe („oder höher"), `e_N` und `le_N` die oberste
(„höchstens"). Welche Stufe der Regelstandard *ist*, hängt vom angestrebten Abschluss ab und
wird deshalb nirgends benannt.

**Ein Anteil, den die geladene Skala nicht ausdrücken kann, ist `null`, nicht 0 %.** Jeder
Block, der in einem Export mit kürzerer Leiter landen kann (`e_5` gegen eine Skala, die bei
B1 endet), braucht darum `skipBlock=true`.

**Ein Export kann mehrere `state`-Zeilen je Fach und Domäne tragen** — NRW liefert eine je
Abschlusstrack. `filterStateRows` gibt alle zurück, der Anteil summiert sie zu einem
gepoolten Landesschnitt. Das ist in `tests/unit/sl/modules/infoBox/infoBoxStateComparison.test.js`
festgehalten, nicht gutgeheißen: ob zwei Tracks zu einem „Landesschnitt" gehören, ist eine
offene Frage an die Datenverantwortlichen.

## Dateien

| Datei | Rolle |
|---|---|
| `packages/modules/src/sl/modules/infoBox/infoBoxModule.js` | Box-Auswahl, Platzhalterkontext, Abschnittszustand, Render-Pipeline |
| `packages/modules/src/sl/modules/infoBox/infoBoxRepeatBlocks.js` | Repeat-Expansion: Klassen-/Fach-Iterationen, `current`, `[[token]]`-Ersetzung |
| `packages/modules/src/sl/modules/infoBox/infoBoxDefinitions.js` | liest die Box-Definition: Blockarten, aktiver Abschnitt, Abschnittslabel und -icon |
| `packages/modules/src/sl/modules/infoBox/infoBoxSectionDom.js` | das DOM eines Abschnitts: Buttons, Blocklisten, Link-Gruppen, Leerzustand |
| `packages/modules/src/sl/modules/infoBox/infoBoxTextResolver.js` | Handler-Dispatch, Auswahlzustand, Vererbung von Ziel/Fach/Domäne, Formatierung, `skipBlock` |
| `packages/modules/src/sl/utils/slCompetenceShares.js` | `CompetenceShareQueries`: gewichtete Anteile je Fach×Domäne und Fach-Aggregate; Zeilen, Auswahlen und Kandidatenklassen eines Ziels |
| `packages/modules/src/sl/modules/infoBox/infoBoxShareSelections.js` | die Superlative: stärkste/schwächste Klasse, größte Spannweite, n-te Domäne |
| `packages/modules/src/sl/modules/infoBox/infoBoxStateComparison.js` | Landesschnitt-Vergleich: Fächer und Klassen über/unter dem Landesschnitt, größte Abweichung |
| `packages/modules/src/sl/modules/infoBox/infoBoxSelectionRanking.js` | die fachfremden Primitiven für Spannweite und Rangfolge |
| `packages/modules/src/sl/utils/slQueryPrimitives.js` | Zielauflösung, Zeilenfilter, Verhältnis-Summe, Stufennamen-Bereinigung |
| `packages/modules/src/sl/utils/slSolutionRates.js` | Lösungsquoten für Überblick und Material — nie für eine Box |
| `packages/modules/src/sl/modules/infoBox/infoBoxPlaceholders.js` | der generische `{{name(args)}}`-Parser |
| `packages/modules/src/sl/modules/infoBox/infoBoxLinks.js` | Material-Link-Token, Fachauswahl-Modi, Beschriftungen |
| `packages/modules/src/sl/modules/infoBox/infoBoxSummaryNamespaces.js` | die `summaries`-Namespaces `comparison` und `selfEfficacy` |
| `packages/modules/src/sl/utils/slCompetenceLevels.js` | `levelAlias`-Auflösung und Kompetenzstufen-Bänder |
| `packages/modules/src/sl/utils/slSubjectConfig.js` | Fach- und Material-Aliasse, Kurznamen |
| `public/data/sl/info_boxes.json` | die Inhalte |
