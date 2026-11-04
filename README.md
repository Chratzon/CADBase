# CADBase

Schnelle 2D-Detailzeichnungen direkt im Browser – für die Baustelle und den Container.
Läuft als PWA am Rechner, Tablet und Handy, auch offline.

## Funktionen

- **Zeichnen:** Linie, Polylinie, Rechteck, Kreis, Bogen – mit Objektfang (Endpunkt, Mitte, Zentrum, Quadrant, Schnittpunkt, Lot, Auf Objekt), Raster, Ortho und Polar 15°
- **Werte tippen:** `500` (Länge in Cursorrichtung), `600x300` (Δx/Δy), `500<30` (Länge unter Winkel), `#100;200` (absolut), Komma als Dezimaltrenner
- **Ändern:** Verschieben, Kopieren, Drehen, Spiegeln, Versatz, Stutzen, Dehnen, Auflösen, Griffe ziehen, Rückgängig/Wiederholen
- **Schraffuren:** per Klick in eine geschlossene Fläche oder per Umriss – Mauerwerk, Stahlbeton, Beton, Dämmung weich/hart, Holz quer/längs, Holzwerkstoff, Gipsplatte, Estrich, Putz, Erdreich, Kies, Stahl, Folie, Farbfüllung
- **Bemaßung:** horizontal, vertikal, ausgerichtet, Kettenmaß; Einheit mm/cm/cm mit hochgestellten mm/m; Schrägstrich, Pfeil oder Punkt
- **Beschriftung:** Text und Hinweislinien mit Schnellbausteinen (GKB 12,5 mm, CW-Profil 75 …)
- **Aufbauten:** Metallständerwand (Horizontalschnitt), Schichtenaufbau mit Vorlagen (Estrich, Trockenestrich, Holzständerwand, Steildach, Vorsatzschale), Kantholz, CW/UW-Profil, Höhenkote, Bruchlinie
- **Layer:** Farbe, Strichstärke, Linientyp, sichtbar, gesperrt, druckbar
- **Blatt & Druck:** A4, A3, A2, A1, A0 hoch/quer, Maßstab frei wählbar, Rahmen mit Heftrand und Schriftfeld; Druck/PDF maßstäblich oder verkleinert auf A4/A3
- **Export:** SVG, DXF (R12, für AutoCAD/BricsCAD & Co.), JSON zum Weiterbearbeiten
- **3D:** Schraffuren werden extrudiert, frei drehbar, als Vektor-Isometrie in die Zeichnung übernehmbar

## Trockenbau-Modul (Test)

Werkzeug **Wand (Trockenbau)** (Taste W): Wände im Zug zeichnen, Ecken werden nach Knauf-Prinzip verschnitten
(durchlaufende Wand endet an der Ständerebene, Außenbeplankung der anstoßenden Wand deckt die Ecke).
Systeme nach Knauf-Detailblättern:

- **W11 Metallständerwände:** W111, W112, W113 (Einfachständerwerk 1-/2-/3-lagig), W115 (Doppelständerwerk entkoppelt), W116 (Installationswand, verlascht)
- **W61 Vorsatzschalen:** W623 (CD 60/27, Direktabhänger), W625/W626 (CW freistehend 1-/2-lagig), W627 (CW-Doppelprofil), W653 (Massivbauplatte)
- **W62 Schachtwände:** W628A (freispannend), W628B (CW), W629 (CW-Doppelprofil), W630 (Riegelwerk), W635 (UW-Doppelprofil + eingestellte Platte)

Massenermittlung (CSV oder Tabelle in der Zeichnung), Wandansicht mit Plattenteilung, 3D. Ein/Aus im Datei-Menü.
Werte vor Bestellung mit dem aktuellen Detailblatt prüfen.

## PDF-Pläne als Unterlage (Aufmaß)

**Datei → PDF-Plan / Bild als Unterlage** (oder Datei ins Zeichenfenster ziehen): Seite wählen, Planmaßstab angeben,
einfügen. Mit **Plan kalibrieren** zwei Punkte eines bekannten Maßes antippen und das echte Maß eingeben – optional
wird der Plan dabei exakt waagerecht/senkrecht ausgerichtet. Danach Wände usw. direkt auf dem Plan nachzeichnen.
Die Unterlage liegt auf dem Layer „Unterlage" (sperrbar, Deckkraft einstellbar), wird mitgedruckt und beim
Speichern als Datei eingebettet. PDF-Darstellung mit [pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0), lokal in `js/vendor/pdfjs`.

## Prinzip

Gezeichnet wird in Naturmaß (mm). Der Maßstab gehört zum Blatt: Schrift-, Maß- und Schraffurgrößen sind in Papier-mm angegeben und passen sich automatisch an.

## Drucken

Im Druckdialog **Ränder: Keine** und **Skalierung 100 % / Tatsächliche Größe** wählen. Für eine PDF als Drucker „Als PDF speichern" nehmen.

## Technik

Reines HTML/CSS/JavaScript (ES-Module), keine Abhängigkeiten, keine Build-Schritte. Daten bleiben im Browser (localStorage) oder werden als Datei gespeichert.
