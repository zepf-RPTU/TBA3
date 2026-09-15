# MaWelcomeViewModule

## Zweck
Die Startseite des Mathe-3-Dashboards: der gemeinsame Welcome-Splash mit dem MA-Begrüßungstext und den vier Nav-Karten zu Übersicht, Klasse, Aufgaben und Schüler:in, im selben Aussehen wie bei EN. Die Unterklasse liefert nur Inhalt (App-Präfix, Glossarschlüssel, Kartenkatalog); Verhalten, Kinder und Kartendarstellung stellt die Basis.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - [WelcomeSplashViewModule](../../common/views/welcomeSplashViewModule.md)
      - **MaWelcomeViewModule**

## Kinder
Von `WelcomeSplashViewModule` gebaut:

| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Begrüßung | `TextModule` | [textModule.md](../../common/views/textModule.md) | `glossaryKey: 'ma.welcome.greeting'` |
| Nav-Karten | `NavCardModule` | [navCardModule.md](../../common/modules/navCard/navCardModule.md) | `glossaryKey: 'ma.nav-cards'` (dieselben Einträge, die die Sidebar benennt; `description` steht auf der Karte, `tooltip` beim Überfahren); Katalog aus `getDefaultNavCardConfig`: `overview` (Balken-Miniatur `preview-bars`), `class` (`groups`), `item` und `student` (Ring-Miniatur `preview-donut`, beide mit `viewMode: 'chart-only'`), je mit `glossarySubKey: 'nav-<view>'` |

## Daten
Keine API-Daten. Begrüßung und Nav-Karten rendern aus dem Glossar; die Nav-Karten navigieren über `navigate(viewTarget, { viewMode? })` der View.

## Zustand
Keine App-State-Schlüssel beobachtet.

## Verdrahtung
Keine Geschwister-Verdrahtung.

## Optionen
Keine eigenen; der Konstruktor übergibt die Spec `{ appPrefix: 'ma', greetingKey: 'ma.welcome.greeting', navCardsKey: 'ma.nav-cards', buildNavConfig: getDefaultNavCardConfig }`.

## Methoden
Keine eigenen.
