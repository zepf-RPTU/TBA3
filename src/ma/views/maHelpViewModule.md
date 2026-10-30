# MaHelpViewModule

## Zweck
Die Hilfe-Seite des Mathe-3-Dashboards: ein Rücksprung-Link zur zuvor gezeigten View, ein Platzhalter-Hinweis, das durchsuchbare Glossar und statische Karten zu didaktischen Hinweisen, Navigation, Symbolen und typischen Fragen. Die Karten sind View-eigenes Markup, nur das Glossar ist ein Modul; die Texte der Seite kommen aus dem Fragment `ma.help` (`help.glossary.json`).

## Design/Idee

Eine allgemeine Hilfe-Seite, welche links in der Menüzeile der Rückmeldung jederzeit aufgerufen werden kann. Eine Schaltfläche erlaubt dabei, komfortabel zur vorherigen Ansicht zurück zu navigieren. Darüber hinaus bietet die Hilfeseite ein suchbares Glossar mit allen Fachbegriffen, einen FAQ-Bereich sowie Platzhalter für didaktische Hinweise (Förderideen, Materialien, Links). Diese sind im Rahmen des Prototypen nicht ausgearbeitet und richten sich nach den angrenzenden Strukturen des auswertenden Systems.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Glossarsuche | `MaGlossarySearchModule` | [maGlossarySearchModule.md](../modules/maGlossarySearch/maGlossarySearchModule.md) | – |

## Daten
Keine API-Daten. Die Glossarsuche rendert aus dem Glossar des App-Kontexts (Option `context`), die Hilfetexte der Seite ebenfalls; der Rücksprung-Link liest Icon und Label der vorherigen View aus der Option `viewConfig`.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `previousView` | die App bei jedem View-Wechsel | Rücksprung-Link auf diese View zeigen; versteckt ohne vorherige View, bei `help` selbst oder einem unbekannten Key |

## Verdrahtung
Keine Geschwister-Verdrahtung; der Rücksprung-Link navigiert zur vorherigen View.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Glossarsuche erzeugen, Seite rendern, `previousView` beobachten |
