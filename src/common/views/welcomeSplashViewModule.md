# WelcomeSplashViewModule

## Zweck
Die Startseite, die EN und MA teilen: eine Begrüßungskarte über dem Splash-Hintergrund, darunter die Navigationskarten zu den Views der App. Was sich je App unterscheidet, ist Inhalt, nicht Verhalten – Glossarschlüssel und Nav-Karten-Katalog –, deshalb ist jedes `<app>WelcomeViewModule` eine Unterklasse, die nur diese `spec` liefert. Die Willkommensseite der SL ist eine Chart-View und bleibt eigenständig. Unten rechts sitzt eine Notiz-Ecke: „Platzhalter" markiert den Hintergrund als vorläufig, darunter steht die Namensnennung, die dessen Freepik-Lizenz verlangt.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../modules/baseViewModule.md)
    - **WelcomeSplashViewModule**
      - [EnWelcomeViewModule](../../en/views/enWelcomeViewModule.md)
      - [MaWelcomeViewModule](../../ma/views/maWelcomeViewModule.md)

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Begrüßung | `TextModule` | [textModule.md](textModule.md) | `glossaryKey: spec.greetingKey`; Body bekommt vor dem Render die Klasse `welcome-greeting-body` |
| Nav-Karten | `NavCardModule` | [navCardModule.md](../modules/navCard/navCardModule.md) | Katalog aus `spec.buildNavConfig(navigate)` (`items`, `onNavigate`), `showModuleTitle: false` (die Karten rendern direkt ins `.welcome-cards`-Raster), `currentView: 'welcome'`, `glossaryKey: spec.navCardsKey` |

Das Aussehen der Karten (Visual links, Titel und Beschreibung daneben) ist für EN und MA dasselbe und liegt in `welcomeSplashViewModule.css`; die Hülle der Seite in `src/styles/welcome-splash.css`, die auch der Chooser lädt.

Container-Ids sind `${spec.appPrefix}-welcome-greeting` und `${spec.appPrefix}-welcome-nav-cards`; die View-Klasse ist `${spec.appPrefix}-welcome-view welcome-splash view-base`.

Die Notiz-Ecke ist kein Kindmodul, sondern zwei Spans im View-Markup neben `.welcome-container`. Der Chooser (`index.html`) wiederholt sie als statisches Markup, weil er kein Glossar-Barrel lädt — die Lizenz verlangt die Nennung auf jeder Seite, die das Bild zeigt.

## Daten
Keine API-Daten. Beide Kinder werden mit leerem Payload gemountet und hydriert; ihr Inhalt kommt vollständig aus dem Glossar (`glossaryData` über `_childOptions()`).

## Zustand
Keine App-State-Schlüssel beobachtet.

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Nav-Karten `onNavigate(viewTarget, viewMode?)` (aus `spec.buildNavConfig`; MA reicht `viewMode` als `{ viewMode }` an `navigate` weiter) | View `navigate(viewTarget, options)` → `onNavigate` der App (`showView`) |

## Optionen
Keine eigenen Optionen. Das App-Spezifische kommt als viertes Konstruktorargument `spec` (`WelcomeSplashSpec`):

| Feld | Typ | Pflicht | Bedeutung |
|---|---|---|---|
| `appPrefix` | `string` | ja | `'en'` / `'ma'`; Präfix der View-Klasse und der Kind-Ids |
| `greetingKey` | `string` | ja | Glossarpfad des Begrüßungstexts, z. B. `en.welcome.greeting` |
| `navCardsKey` | `string` | ja | Glossarpfad des Nav-Karten-Moduls, z. B. `en.nav-cards` — die Einträge, die auch die Sidebar benennen |
| `buildNavConfig` | `(navigate) => object` | ja | Nav-Karten-Katalog der App, gebunden an das `navigate` dieser View |
## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | DOM bauen, beide Kinder konstruieren, die Begrüßung vorab mounten (für die Body-Klasse), dann beide über `_hydrateChildren` hydrieren, das auch die Nav-Karten mountet |
