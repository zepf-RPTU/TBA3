# MaHelpViewModule

## Zweck
Die Hilfe-Seite des Mathe-3-Dashboards: ein Rücksprung-Link zur zuvor gezeigten View, ein Platzhalter-Hinweis, das durchsuchbare Glossar und statische Karten zu didaktischen Hinweisen, Navigation, Symbolen und typischen Fragen. Die Karten sind View-eigenes Markup, nur das Glossar ist ein Modul; die Texte der Seite kommen aus dem Fragment `ma.help` (`help.glossary.json`), außer dem `aria-label` des Hinweises (`general.buttons.element_texts.region-hint.label`) und dem View-Namen im Rücksprung-Link (`viewConfig[…].label`, aus `ma.nav-cards` aufgelöst); die Symbole setzt die View selbst ein.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **MaHelpViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Glossarsuche | `MaGlossarySearchModule` | [maGlossarySearchModule.md](../modules/maGlossarySearch/maGlossarySearchModule.md) | nur `glossaryData`; bei jedem Render zerstört und neu gebaut |

## Daten
Keine API-Daten. Die Glossarsuche rendert aus der Option `glossaryData`; der Rücksprung-Link liest Icon und Label der vorherigen View aus der Option `viewConfig` (von `getViewModuleOptions`, Labels aus dem Glossar aufgelöst).

## Zustand
Keine App-State-Schlüssel beobachtet.

## Verdrahtung
Keine Geschwister-Verdrahtung; der Rücksprung-Button ruft `onNavigate(previousViewType)`.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setPreviousView(previousViewType)` | Aufruf (von `MaAppModule.afterShowView`) | Rücksprung-Karte füllen und zeigen; versteckt, wenn keine vorherige View, `help` selbst oder ein unbekannter Key |
| `_renderView()` | Override | DOM bauen, Glossarsuche konstruieren und initialisieren |
