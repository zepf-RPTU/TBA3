# SL-Infoboxen: Aufbau und Platzhalter

## Überblick

Eine Infobox ist ein `InfoBoxModule` (`packages/modules/src/sl/modules/infoBox/infoBoxModule.js`, erbt
`ContentModule`), das über einen `boxKey` einen Eintrag aus `public/data/sl/info-boxes.json`
rendert. Die Sätze sind dort auf Deutsch ausgeschrieben und enthalten `{{…}}`-Platzhalter,
die zur Laufzeit gegen die geladenen Daten aufgelöst werden — dieselbe Box liefert damit auf
jedem Datensatz die passenden Zahlen und Namen.

Vorlage (`info-boxes.json`) und Zahlen liest die Box selbst aus dem `DocumentStore` der App; hereingereicht werden nur `boxKey` und Platzhalterkontext. Was sie daraus sagt, löst `resolveInfoBox` (`packages/modules/src/sl/modules/infoBox/infoBoxContent.js`) ohne DOM auf; das Modul malt das Ergebnis. Der `boxKey` kommt
im Render-Payload, fest (`{ boxKey: 'matrix' }`) oder je Render neu, wenn die Box mit einer
Auswahl mitwechseln soll.

Der Leser akzeptiert genau die Formen, die die Boxen verwenden. Eine Form, die keine Box
braucht, gibt es nicht — wer eine neue braucht, ergänzt sie zusammen mit der Box, die sie
verwendet.

## Aufbau von `info-boxes.json`

Drei Ebenen auf oberster Stufe:

- `meta` — die Locale der Zahlenformatierung (`locale`), die Beschriftung der Material-Links
  (`materialLinkLabel`, mit `{{type}}` und `{{subject}}`) und die Anführungszeichen, mit denen
  Repeat-Token Namen setzen (`quotedLabel`, mit `{{label}}`). Alle drei sind Pflicht.
- `sectionTypes` — die Abschnittsarten (`general`, `praise`, `alarm`), jede mit `icon`
  (Material-Icon) und `tooltip` (beide Pflicht; der Tooltip ist zugleich der zugängliche
  Name der Schaltfläche) sowie optional `materialLinkSubjectMode`.
- `boxes` — die Boxen selbst, je Schlüssel eine.

Eine Box besteht aus `sections[]`, ein Abschnitt aus `type` und `blocks[]`:

```json
"matrix": {
    "sections": [
        {
            "type": "general",
            "blocks": [
                "Fächerübergreifend liegen im Jahrgang {{shareRange(target=school, levelAlias=ge_medium)}} der SuS auf oder oberhalb von Kompetenzstufe {{standardBands(levelAlias=ge_medium)}}.",
                { "type": "link", "material": "Übersicht", "subject": "Fach" }
            ]
        }
    ]
}
```

`sections[].type` ist zugleich der Schlüssel des Abschnitts: Icon und Tooltip der
Abschnitts-Schaltfläche kommen aus `sectionTypes`. Ein Abschnitt darf
`materialLinkSubjectMode` überschreiben, wenn er eine andere Fachauswahl braucht als seine
Art vorgibt.

Ein Block ist eines von vier Dingen:

| Form | Bedeutung |
|---|---|
| `"Ein Satz mit {{…}}"` | Textblock |
| `{ "text": "…", "sublist": [ … ] }` | Textblock mit eingerückter Unterliste aus Text- und Repeat-Blöcken |
| `{ "repeat": "groups\|subjects\|domains", "template": "…" }` | expandiert zu je einer Zeile pro Lerngruppe, Fach bzw. Domäne |
| `{ "type": "link", "material": "Typ", "subject": "Fach" }` | Schaltfläche ins Material |

## Wie Platzhalter aufgelöst werden

Vier Stationen, in dieser Reihenfolge:

1. **Repeat-Interpolation** — `packages/modules/src/sl/modules/infoBox/infoBoxRepeatBlocks.js` expandiert
   Repeat-Blöcke und ersetzt die `[[token]]` der Vorlage durch die Werte der jeweiligen
   Zeile; `resolveInfoBox` reicht nur den `CompetenceLevelIndex` des Stores und den Platzhalterkontext hinein.
2. **Parsen** — `packages/modules/src/sl/modules/infoBox/infoBoxPlaceholders.js` zerlegt den
   Text in Literaltext und `{{name(arg=wert, …)}}`-Aufrufe mit Namen und Argumentliste. Alle
   Werte bleiben Strings; ein Wert darf weder Komma noch Klammer enthalten.
3. **Dispatch** — `InfoBoxTextResolver` (`packages/modules/src/sl/modules/infoBox/infoBoxTextResolver.js`)
   ordnet dem Namen einen Handler zu, der Ziel, Fach und Domäne **einmal** auflöst, den
   Bandalias prüft und das Ergebnis formatiert. Die Verben darunter reichen Ziel und Alias
   an die Abfragen weiter, die beides selbst normalisieren (das Ziel mit `normalizeTarget`,
   den Alias über das Dataset seiner Stufen, das auch einmal je Store warnt, wenn keine
   geladene Skala das Band trägt).
4. **Abfrage** — die Datenfrage über `competence-levels.json` beantworten die
   `CompetenceShareQueries` (`packages/modules/src/sl/utils/slCompetenceShares.js`, die
   gewichteten Anteile je Fach×Domäne und je Fach; eine Instanz je Store, das Dataset
   `COMPETENCE_SHARES`, deren Antworten der Store je Frage merkt) und darüber die Verben in
   `infoBoxShareSelections.js` (die Superlative „stärkste Lerngruppe“, „größte Spannweite“) und
   `infoBoxStateComparison.js` (die Landesschnitt-Vergleiche). Zielauflösung, Zeilenfilter
   und die Verhältnis-Summe sind reine Funktionen in
   `packages/modules/src/sl/utils/slQueryPrimitives.js`.

Drei Verhaltensregeln, die man beim Schreiben der Texte kennen muss:

- **Ein Block ist ganz oder gar nicht.** Löst ein Platzhalter nicht auf — unbekannter Name,
  fehlendes Argument, ein Wert, den die geladenen Daten nicht hergeben —, entfällt der ganze
  Block samt Unterliste. Ein Satz mit Loch („… Kompetenzstufe  wird … erreicht") läse sich
  trotzdem als Aussage über die Schule. Jeder Ausfall außer einem leeren `summary`-Feld
  landet als Warnung in der Konsole.
- **Kein HTML in `info-boxes.json`.** Der Resolver liefert Segmente (Literaltext und
  aufgelöste Werte); der Text wird escaped, Werte werden als
  `<span class="info-box-placeholder-value">` gerendert, danach annotiert der
  `glossaryAnnotator` die Fachbegriffe.
- **Auswahlen sind blocklokal.** `selectShareTarget(id=…)` legt seine Auswahl im
  `#selections` des laufenden Blocks ab; nur spätere Platzhalter **im selben Block**
  erreichen sie über `target=selection:<id>`. Über Blockgrenzen hinweg gibt es keinen Zustand.

## Platzhalter-Referenz

Alle registrierten Platzhalter. `target` ist überall `school` | `group:current` |
`selection:<id>`; `domainId` immer `selection:<id>`. Fach und Domäne werden nie wörtlich
genannt: eine Datei bedient jeden Datensatz, und ein hineingeschriebener Fachname löste nur
dort auf, wo es dieses Fach zufällig gibt. Das Fach ist darum immer das der Box
(`placeholderContext.subjectName`); ein `target=selection:<id>` leiht dem Platzhalter
stattdessen Fach und Domäne der Auswahl.

Welche Domänen eine Abfrage liest, entscheidet der Resolver einmal (`DomainScope` in
`slQueryPrimitives.js`): die Domäne, die die Auswahl festhielt (`null` für ein Fach ohne
Domänen wie Mathematik), sonst `ALL_DOMAINS`, das Fach als Ganzes — eine Auswahl über ein
Fach mit gepoolten Domänen hält keine Domäne fest. `subjectShare` liest unter `ALL_DOMAINS`
alle Domänen des Fachs zusammen; `share`, ein Anteil je Domäne, liest darunter nur ein Fach
ohne Domänen und lässt den Satz bei einem geteilten Fach fallen.

| Platzhalter | Liefert | Argumente |
|---|---|---|
| `share` | Anteil der SuS auf den Stufen des Alias | `target`, `levelAlias`, `domainId` |
| `subjectShare` | derselbe Anteil, über alle Domänen eines Fachs aggregiert | `target`, `levelAlias`, `domainId` |
| `shareRange` | Spannweite dieses Anteils über die Zeilen des Ziels | `target`, `levelAlias` |
| `subjectShareGroupRange` | Spannweite des Fach-Anteils über die Lerngruppen | `target`, `levelAlias`, `domainId` |
| `selectShareTarget` | wählt Lerngruppe/Fach/Domäne per Rangfolge, merkt sie unter `id`, gibt `field` aus | `id`, `scope`, `mode=min\|max`, `field`, `target`, `levelAlias`, ggf. `domainId` |
| `selectSubjectDomain` | wählt die Domäne der laufenden Zeile eines `domains`-Repeat-Blocks (außerhalb eines solchen entfällt der Block) | `id`, `field` |
| `standardBands` | Name der Kompetenzstufe, an der der Alias greift — je geladener Skala | `levelAlias` |
| `listStateComparisonSubjects` | Fächerliste über bzw. unter Landesschnitt | `target`, `levelAlias`, `comparison=gt\|lt`, `aggregation=anyDomain\|subject`, `empty` |
| `listStateComparisonGroups` | Lerngruppenliste über bzw. unter Landesschnitt, in einer Box mit Fach nur für dieses Fach | `target`, `levelAlias`, `comparison=gt\|lt`, `empty` |
| `summary` | ein Feld aus `summaries.<namespace>`, mit `entity` aus `summaries.<namespace>.<entity>` | `namespace`, ggf. `entity`, `field`, `format` |

`field` einer Auswahl ist Pflicht und ist `groupName`, `subjectName`, `domainName` oder
`subjectDomainLabel` (letzteres rendert „Fach (Domäne)" und fällt bei eindomänigen Fächern
auf den Fachnamen zurück). Den Domänennamen, in `domainName` wie in `subjectDomainLabel`,
verlinkt der Resolver mit dem Glossareintrag zu dieser Domäne dieses Fachs
(`resolveDomainEntryKey`), nie über seinen Namen. `format` ist `percent`, `decimal` oder `integer`; ohne Angabe
werden ganze Zahlen als Integer, andere mit Nachkommastellen gerendert. `empty` ist die
Nominalphrase für die leere Liste, im Kasus des Satzes (`empty=keinem Fach`,
`empty=keine Lerngruppe`): nur der Satz kennt ihn.

`share(...)` und `subjectShare(...)` sind bei `target=school` **absichtlich** verschiedene
Zeilenmengen: das eine liest die Zeilen mit der Schul-ID, das andere summiert die
Lerngruppenzeilen. Nicht zusammenlegen.

### `levelAlias`

Die semantische Schicht über den konkreten Stufennamen; sie wird je geladener Skala
aufgelöst (`packages/modules/src/sl/utils/slCompetenceLevels.js`). Ein Platzhalter nimmt
nur einen Alias, keine ausgeschriebene Stufenliste.

Ein Alias ist `<op>_<band>`: `op` ist `e`, `ge` oder `le`, `band` ist `low` (unter
Mindeststandard), `medium` (Regelstandard) oder `high` (Optimalstandard). Welche Stufen ein
Band bilden, sagt der Payload je Stufe (`standardBand:<level id>`); Stufen ohne Band
(Mindeststandard, Regelstandard plus, `k.h.N.`) zählen nach ihrer Lage auf der Skala. Je
geladener Skala gilt:

- `ge_X`: die unterste Stufe mit Band X und alles darüber,
- `le_X`: die oberste Stufe mit Band X und alles darunter,
- `e_X`: die Stufen mit Band X.

Eine Skala ohne Band X trägt nichts bei; hat keine geladene Skala das Band, löst der Alias
zu nichts auf, warnt einmal, und der Block entfällt. Numerische Aliasse gibt es
nicht mehr.

| Alias | Bedeutung | Römische Skala | GER-Skala |
|---|---|---|---|
| `le_low` | höchstens unter Mindeststandard | `I` bzw. `Ia`, `Ib` (mit `k.h.N.`) | `A1` |
| `le_medium` | höchstens Regelstandard | `I…III` (ggf. mit `Ia`/`Ib`) | `A1`, `A2`, `B1` |
| `ge_medium` | Regelstandard oder höher | `III`, `IV`, `V` | `B1`, `B2`, `C1` |
| `e_high` | Optimalstandard | `V` | `C1` |

`le_medium` ist **nicht** `1 − ge_medium`: beide zählen die Regelstandard-Stufen mit. Der Satz
neben einem `le_medium`-Anteil muss deshalb „höchstens auf Kompetenzstufe …" heißen, nie
„unterhalb".

### `selectShareTarget`-Scopes

Jeder Scope rankt auf einem Kompetenzstufen-Anteil — derselben Größe, die der Block danach
ausgibt. Der `levelAlias` beider darf abweichen: die Alarm-Blöcke ranken aufsteigend auf
`ge_medium` und drucken `le_medium`, also dieselbe Schwäche von der anderen Seite gelesen.

| Scope | Rangfolge über |
|---|---|
| `groupMean` | Lerngruppen nach ihrem über die Fächer gemittelten Anteil |
| `groupRange` | die Lerngruppe, deren Fächer am weitesten auseinanderliegen |
| `subjectDomainShare` | Fach-/Domänen-Zeilen nach Anteil |
| `groupInSubject` | Lerngruppen innerhalb des Fachs der Box (optional `domainId`) |
| `subjectGroupRange` | das Fach, dessen Lerngruppen am weitesten auseinanderliegen |
| `subjectDomainGroupRange` | dasselbe, aber je Domäne einzeln |
| `subjectStateDiff` | das Fach mit der größten Abweichung vom Landesschnitt |

`subjectGroupRange` und `subjectDomainGroupRange` ranken immer schulweit und ignorieren ein
übergebenes `target`. Die beiden bleiben getrennt, weil das Poolen der Domänen eines Fachs
deren Lerngruppenspannen mittelt — die größte interne Lücke der Schule verschwände hinter einem
ruhigen Aggregat. `subjectStateDiff` rankt auf dem **Betrag** der Differenz; die Antwort kann
also auch das Fach am weitesten **über** dem Landesschnitt sein.

## Repeat-Blöcke

Ein Repeat-Block erzeugt eine Zeile je Lerngruppe, Fach oder Domäne, ohne dass Beispielzeilen
im JSON stehen müssen:

```json
{
    "repeat": "subjects",
    "template": "Im Fach [[quotedSubjectDisplayName]] liegt dieser Wert bei {{subjectShare(target=group:current, levelAlias=ge_medium)}}."
}
```

- **`repeat`** — `groups`, `subjects` oder `domains`.
- **`template`-Token** — bei `groups` `[[quotedGroupName]]`, bei `subjects`
  `[[subjectShortDisplayName]]` und `[[quotedSubjectDisplayName]]`. Den Fachnamen bzw.
  Lerngruppennamen der Zeile liest ein Platzhalter als `current` aus dem Kontext. `domains`
  hat keine Token: die Domäne der Zeile wählt `selectSubjectDomain(id=…, field=domainName)`,
  das ihren Namen mit ihrem Glossareintrag verlinkt; spätere Platzhalter der Zeile lesen sie
  über `domainId=selection:<id>`.
- **Eingrenzung** — eine Box mit Fach wiederholt `groups` nur über die Lerngruppen, die das
  Fach geschrieben haben; eine Box mit Lerngruppe wiederholt `subjects` nur über deren Fächer.
  `domains` wiederholt über die Domänen des Fachs der Box in Payload-Reihenfolge, so viele es
  sind; ein Fach ohne Domänen (Mathematik, über den ganzen Test gemessen) und eine Box ohne
  Fach ergeben keine Zeile.

```json
{
    "repeat": "domains",
    "template": "Bei {{selectSubjectDomain(id=domain, field=domainName)}} betragen diese Werte {{subjectShare(target=school, levelAlias=ge_medium, domainId=selection:domain)}} und {{subjectShareGroupRange(target=school, levelAlias=ge_medium, domainId=selection:domain)}}."
}
```

Jede expandierte Zeile löst mit eigenem Kontext auf; zwischen den Zeilen gibt es keinen
gemeinsamen Auswahlzustand.

## Material-Links

```json
{ "type": "link", "material": "Übersicht", "subject": "Fach" }
```

Auflösbar sind `material` = `Übersicht` oder `Ergebniszusammenfassung` mit `subject` = `Fach`.
Ein Link auf eine Seite, die das Material nicht hat (`Gesamt`, ein Fach außerhalb des
Datensatzes, ein anderer Typ wie `Leitfragen`), erscheint deaktiviert. Gerendert wird eine Schaltfläche mit der Beschriftung
aus `meta.materialLinkLabel`, also etwa „Übersicht: Deutsch im Material anzeigen".

`Fach` bezieht sich auf ein Fach: das der View
(`placeholderContext.subjectName`), sonst das, das `materialLinkSubjectMode` aus dem
`sectionType` (oder dem Abschnitt) wählt — `best`, `worst` oder `extrema`, gerankt auf
demselben `ge_medium`-Anteil (`getSubjectCompetenceShare`), den die Sätze drucken, schulweit
oder für die Lerngruppe des Kontexts. Ein einzelner Link-Block kann dadurch zu mehreren
Schaltflächen expandieren.

## Kennzahlen aus dem Store: `summaries`

Manche Boxen beschreiben nicht die Rohdaten, sondern das, was gerade im Chart daneben steht.
Die Zahlen rechnet die Box selbst aus dem Store; die View reicht nur die Auswahl herein:

```js
placeholderContext: {
    comparison: selection // { chartType, subjectIndex, category, scopeFilter, group1, group2 }
}
```

Ein Namespace ist die Zusammenfassung selbst, so wie ihr Modul sie baut: `comparison` die
des Gruppenvergleichs (das Dataset `GROUP_COMPARISON_SUMMARY` in `groupComparisonSummary.js`,
je Auswahl gebaut: `group1`/`group2` mit `label`, `n`, `share`, `mean`,
`standardDeviation`, `min`, `max`), `selfEfficacy` das Dataset `sl.selfEfficacySummary`
(`buildSelfEfficacyInfoBoxSummary`: `school`/`bestGroup`/`worstGroup`, dazu
`groupMeanDifference`), das jede Box liest. Ein nicht messbares Feld ist `null` und lässt
den Block entfallen, ohne zu warnen.

```text
{{summary(namespace=selfEfficacy, field=groupMeanDifference, format=decimal)}}
{{summary(namespace=selfEfficacy, entity=bestGroup, field=groupName)}}
```

## Erweitern

### Einen neuen Platzhalter bauen

1. Eintrag in der Handler-Tabelle `#handlers` von `InfoBoxTextResolver` — das ist die
   einzige Stelle, an der ein Name gültig wird.
2. Private `#resolve…Placeholder`-Methode nach dem Muster der Nachbarn schreiben: ein
   Anteil geht über `#readShareArgs(params)`, das Ziel, Fach, Domäne und Stufennamen
   inklusive Vererbung aus einer gespeicherten Auswahl auflöst; die `#format…`-Helfer
   erzeugen die Ausgabe. Bei fehlenden Argumenten `unresolved(reason)` zurückgeben —
   dann entfällt der Block.
3. Braucht der Platzhalter eine neue Datenfrage: ein Anteil gehört in
   `CompetenceShareQueries`, ein Superlativ als Funktion in `infoBoxShareSelections.js`,
   ein Landesschnitt-Vergleich in `infoBoxStateComparison.js`; die Primitiven für Ziel,
   Zeilenfilter und Verhältnis stehen in `slQueryPrimitives.js`, die für Spannweite und
   Rangfolge in `slSelectionRanking.js`. Fach-Aggregate und domänenskopierte Helfer
   nicht zusammenlegen, nur um Zeilen zu sparen — die Namen kodieren verschiedene
   Messbereiche.
4. Test in `packages/modules/test/sl/modules/infoBox/slInfoBoxTextResolver.test.js` (Verben:
   `infoBoxShareSelections.test.js`, `infoBoxStateComparison.test.js`).

### Ein neues `summaries`-Namespace

Die Zusammenfassung als Dataset bauen — im SL-Katalog (`slDatasets.js`), oder neben ihrer
Karte, wenn sie deren Logik liest; hängt sie von einer Auswahl ab, mit `params` —, in
`resolveInfoBox` (`infoBoxContent.js`) unter `summaries.<name>` einhängen, in
`INFO_BOX_DOCUMENTS` nennen und im Text mit `summary` lesen. Die View reicht höchstens die Auswahl herein, nie die Zahlen. Ein
neuer Handler ist dafür nicht nötig.

### Eine neue Box oder Abschnittsart

Box: Eintrag unter `boxes.<key>` in `public/data/sl/info-boxes.json`, `boxKey` dort setzen, wo das
`InfoBoxModule` instanziert wird. Abschnittsart: Eintrag unter `sectionTypes` — Icon und
Tooltip kommen von dort, im Abschnitt genügt dann `type`. Die Box braucht in ihrem
Glossareintrag (`glossaryKey`) einen `messages.empty`-Satz für den Leerzustand.

## Fallstricke

**Es gibt keinen Lösungsquoten-Platzhalter, und es soll keinen geben.** Eine Lösungsquote ist
ein ungewichtetes `Σ frequency / Σ total` über die Aufgaben, die im jeweiligen Heft standen —
und die Lerngruppen, die eine SL-Box vergleicht, sitzen verschiedene Hefte. Eine Schule kann
innerhalb eines Fachs mehrere Hefte mischen, meist über die Schwierigkeiten A/B/C. Das
Poolen ist damit verzerrt, nicht bloß verrauscht. Eine Kompetenzstufen-Verteilung ist dagegen je Heft über die
Äquivalenztabelle angeglichen, bevor sie den Client erreicht. `getSolutionRate` lebt in
`packages/modules/src/sl/utils/slSolutionRates.js` (`SolutionRateQueries`) und darf nicht
in einen Platzhalter zurückwandern. Einzige Ausnahme ist
die Box `comparisonPoints`, deren Zahlen aus `summaries.comparison` stammen: dort hat die
Leserin die Lösungsquote im Chart selbst ausgewählt, und der Text benennt ihre Grenzen.

**Kein Kompetenzstufenname wird ausgeschrieben.** `standardBands(...)` löst je geladener
Skala auf und verbindet mehrere mit „ bzw. " (`III bzw. B1` auf `sl`, `B1` auf einer
GER-Skala `A1 … C1`, `KS 3` auf einer Skala `k.h.N., KS 1 … KS 5`; `formatStandardBands` in `slCompetenceLevels.js`) — genau das erlaubt einer gemeinsamen
`info-boxes.json`, jeden Datensatz zu bedienen. Der Operator bleibt in der Prosa: `ge_X`
nennt die unterste qualifizierende Stufe („oder höher"), `e_X` und `le_X` die oberste
(„höchstens"); ein `e_X` über mehrere Stufen nennt deren Spanne (`Ia–Ib`). Welche Stufe der Regelstandard *ist*, hängt vom angestrebten Abschluss ab und
wird deshalb nirgends benannt.

**Ein Anteil, den die geladene Skala nicht ausdrücken kann, ist `null`, nicht 0 %.** Ein
Block, der in einem Export mit kürzerer Leiter landet (`e_high` gegen eine Skala, die bei B1
endet), entfällt darum ganz.

**Ein Export kann mehrere `state`-Tracks tragen.** Ein Satz über „den Landesschnitt"
vergleicht nur mit dem einzigen `state`-Track des Payloads (`findSoleStateTrack`,
`getSoleStateTarget()`); liefert der Payload keinen oder mehrere, entfällt der Block.

## Dateien

Die Dateien des Moduls und ihre Rollen: [infoBoxModule.md](../src/sl/modules/infoBox/infoBoxModule.md), Design/Idee. Die Inhalte stehen in `public/data/sl/info-boxes.json`.
