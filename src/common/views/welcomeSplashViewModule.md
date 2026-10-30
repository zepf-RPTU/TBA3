# WelcomeSplashViewModule

## Zweck
Eine Startseite: eine Begrüßungskarte über dem Splash-Hintergrund, darunter die Navigationskarten zu den Views der App. Unten rechts sitzt eine Notiz-Ecke: „Platzhalter" markiert den Hintergrund als vorläufig, darunter steht die Namensnennung, die dessen Freepik-Lizenz verlangt.

## Design/Idee

Bevor den Lehrkräften die eigentlichen Ergebnisse präsentiert werden, legten die entwickelnden Lehrkräfte Wert auf eine freundliche und ansprechende Begrüßung. Uneinigkeit herrschte in Bezug auf die Ansprache (Sie/du), die höflichere Ansprache hat sich durchgesetzt. Die Hintergrundgrafik ist ein richtungsweisender Platzhalter, hier soll zielgruppengerecht eine ansprechende Oberfläche geschaffen werden. Während die folgenden Ansichten auch über das seitliche Menü erreicht werden können, bietet die Startseite zusätzlich entsprechende Navigationskarten, um die Entscheidungsfreiheit bei der Betrachtung der Ergebnisse zu betonen.

Ein Platzhalter für den Begrüßungstext. Der Text soll respektvoll und freundlich begrüßen und insbesondere bei der erstmaligen Betrachtung der Rückmeldung eine Orientierung bieten. Außerdem weist er auf erste seitenübergreifende Funktionen wie die virtuelle Tour, die Export-Funktionen oder die Notizen hin. Erfahrene Lehrkräfte, die bereits mit der Umgebung vertraut sind, können den Text getrost ignorieren.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Begrüßung | `GreetingModule` (modulprivat in dieser Datei: ein ContentModule, das `title` und `body` seines Glossareintrags rendert) | – | `glossaryKey: '<appId>.welcome.greeting'`, `showModuleTitle: true` |
| Nav-Karten | `NavCardModule` | [navCardModule.md](../modules/navCard/navCardModule.md) | `items`: `viewNavCardItems(viewConfig, 'icon')` ohne die eigene View (`viewKey`), je ergänzt um den `navCard` ihres View-Eintrags; `onNavigate` (siehe Verdrahtung), ohne Titelzeile und ohne Modulkarte (`showModuleCard: false`), `glossaryKey: '<appId>.nav-cards'` (Tour-Text) |

Die Notiz-Ecke ist kein Kindmodul, sondern zwei Spans im View-Markup. Der Chooser (`index.html`) wiederholt sie als statisches Markup, weil er kein Glossar-Barrel lädt — die Lizenz verlangt die Nennung auf jeder Seite, die das Bild zeigt.

## Daten
Keine API-Daten. Beide Kinder bekommen keinen Payload; ihr Inhalt kommt vollständig aus dem Glossar (`context.glossaryData` über `_childOptions()`).

## Zustand
Keine App-State-Schlüssel beobachtet.

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Nav-Karten `onNavigate(viewTarget, statePatch?)` (`statePatch` eines Items geht als `{ statePatch }` an `navigate`) | View `navigate(viewTarget, options)` → `onNavigate` der App (`showView`) |

## Optionen
Keine eigenen Optionen.
## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Gerüst rendern, beide Kinder erzeugen und einsetzen |
