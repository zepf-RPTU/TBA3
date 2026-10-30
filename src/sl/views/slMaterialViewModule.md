# SlMaterialViewModule

## Zweck
Die „Materialien“-Seite: die Materialseiten der Schule je Fach und Seitentyp, gezeigt von einem `MaterialSelectionModule`; Fach und Typ wählt der Header, die View reicht die Auswahl durch. Das Fach „Gesamt“ und die Typen Datensicht und Leitfragen haben noch keine Seite und stehen ausgegraut.

## Design/Idee

Aus Sicht der entwickelnden Schulleitung ist die unmittelbare Verfügbarkeit von passendem Material essentiell für die Weiterarbeit im Sinne der datengestützten Qualitätsentwicklung. Die Entwicklung eines solchen Materials war nicht Gegenstand des Projekts; die Anbindung bestehender Ressourcen konnte innerhalb der Laufzeit nicht abgeschlossen werden. Um zukünftig jedoch eine niedrigschwellige Nachnutzung zu begünstigen, sieht die prototypische Rückmeldung die Einbindung von Material zumindest via Platzhalter vor. Dieses Material soll als systematisch anhand der Anwendungskontexte geordneter Katalog vorliegen. Außerdem sollen in den Info-Kästen der vorherigen Ansichten bereits passende Materialien aus dem Katalog verlinkt sein.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Materialauswahl | `MaterialSelectionModule` | [materialSelectionModule.md](../../../packages/modules/src/sl/modules/material/materialSelectionModule.md) | `glossaryKey: 'sl.material.material'`, `showModuleTitle: true` |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=school,group` | Materialauswahl (Schul- und Lerngruppenzeilen der datengetriebenen Seiten) |
| `competence-levels` | `comparison=state-average` | Materialauswahl (Landesschnitt neben dem Schulwert) |
| `competence-levels` | `type=students` | Materialauswahl (die Schülerzeilen roh, dazu Unterrichtsqualität und Selbstwirksamkeit) |

Payload: keiner. Die View liest den Store nicht; das Kind liest seine Dokumente selbst. Ein Info-Box-Link schreibt `materialSubject` / `materialType`, bevor er hierher navigiert, also bevor diese View existiert.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `materialSubject` | Fach-Buttons des Headers (`subjectSelect`), Info-Box-Links | Als Option `subject` an das Modul, das ihm selbst folgt |
| `materialType` | Typ-Buttons des Headers (`typeSelect`), Info-Box-Links | Als Option `type` an das Modul, das ihm selbst folgt |

## Verdrahtung
Keine Geschwister-Verdrahtung; es gibt nur ein Kind.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | `MaterialSelectionModule` mit beiden Signalen erzeugen und in die View setzen |
