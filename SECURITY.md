# Sicherheit

## Geltungsbereich

- **Die Dashboards** (Englisch, Mathematik, Schulleitung) und die Auswahlseite: statische
  Seiten, die nur im Browser laufen. Es gibt keinen Server-Code in diesem
  Repository.
- **Content-Security-Policy und Trusted Types** (`config/csp.mjs`): keine Inline-Skripte,
  keine Inline-Styles, kein `style`-Attribut; HTML-Zeichenketten erreichen das Dokument
  nur über die Richtlinien `tba3` (vom Code verbürgtes Markup) und `default` (bereinigt
  mit DOMPurify). Jeder Weg daran vorbei ist eine Schwachstelle.
- **Datenverarbeitung im Browser**: das Einlesen und Prüfen der API-Antworten
  (fehlerhafte Daten werden abgelehnt), das Bereinigen von Texten aus der API, die Notizen
  und vorgemerkten Abbildungen im Browserspeicher, der PDF- und Bildexport.
- **Das Docker-Image** (`Dockerfile`, `docker/`): nginx mit der Richtlinie als Header und
  den übrigen Sicherheits-Headern.

## Welche Daten den Browser verlassen

Keine. Die Dashboards laden Daten nur vom eigenen Origin (die Demo-Datensätze und `/api/`)
oder, über `?api=`, von `localhost`/`127.0.0.1`; die Richtlinie (`connect-src`) lässt
nichts anderes zu. Sie senden keine Telemetrie und keine Fehlerberichte. Notizen, das
Berichtslayout und die für den Bericht vorgemerkten Abbildungen liegen unverschlüsselt im
Speicher des Browsers auf dem Gerät (`localStorage`, `sessionStorage`, IndexedDB); Exporte entstehen im
Browser und werden heruntergeladen.
