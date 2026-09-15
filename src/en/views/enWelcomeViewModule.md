# EnWelcomeViewModule

## Zweck
Die Startseite des Englisch-Dashboards: Begrüßungstext und die vier Navigationskarten zu Übersicht, Klasse, Aufgaben und Schüler:in. Die Unterklasse liefert nur App-Präfix, Glossarschlüssel und den Nav-Karten-Katalog aus `enConstants.js`; Aufbau und Kinder stammen aus `WelcomeSplashViewModule`.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - [WelcomeSplashViewModule](../../common/views/welcomeSplashViewModule.md)
      - **EnWelcomeViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Begrüßung | `TextModule` (von der Basis gebaut) | [textModule.md](../../common/views/textModule.md) | `glossaryKey: 'en.welcome.greeting'` |
| Nav-Karten | `NavCardModule` (von der Basis gebaut) | [navCardModule.md](../../common/modules/navCard/navCardModule.md) | `glossaryKey: 'en.nav-cards'` (dieselben Einträge, die die Sidebar benennt); `items`: `overview` (`bar_chart`), `class` (`groups`), `item` (`list_alt`), `student` (`person`), je mit `glossarySubKey: 'nav-<view>'` |

## Daten
Keine API-Daten. Begrüßung und Nav-Karten rendern aus dem Glossar; die Basis mountet beide mit leerem Payload.

## Zustand
Keine App-State-Schlüssel beobachtet.

## Verdrahtung
Keine eigene; die Basis verbindet `onNavigate` der Nav-Karten mit `navigate()`.

## Optionen
Keine eigenen; die `spec` ist fest `{ appPrefix: 'en', greetingKey: 'en.welcome.greeting', navCardsKey: 'en.nav-cards', buildNavConfig: getDefaultNavCardConfig }`.

## Methoden
Keine eigenen; nur der Konstruktor ist überschrieben.
