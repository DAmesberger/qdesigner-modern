# Kapitel 5: Der Fragebogen-Designer

Der QDesigner-Fragebogen-Designer ist die zentrale Arbeitsumgebung fuer das Erstellen, Konfigurieren und Vorschauen von Frageboegen. Er bietet eine vollstaendige visuelle Bearbeitungsumgebung mit Drag-and-Drop-Komposition, Echtzeit-Vorschau, einem Variablensystem, Ablaufsteuerungslogik und umfassender Konfigurierbarkeit fuer jeden Fragetyp.

Dieses Kapitel behandelt das Layout der Designer-Oberflaeche, die strukturelle Hierarchie von Frageboegen und die wichtigsten Bearbeitungsablaeufe.

## 5.1 Oberflaechenuebersicht

Der Designer folgt einem Drei-Spalten-Layout mit einer kompakten Kopfzeilen-Werkzeugleiste. Jeder Bereich dient einem bestimmten Zweck im Bearbeitungsablauf.

### Kopfzeilen-Werkzeugleiste

Die Kopfzeile erstreckt sich ueber die gesamte Bildschirmbreite und bietet:

- **Breadcrumb-Navigation**: Projekte > [Projektname] > [Fragebogentitel]. Jedes Segment ist ein klickbarer Link.
- **Bearbeitbarer Titel**: Klicken Sie auf den Fragebogennamen, um ihn inline umzubenennen. Enter bestaetigt, Escape bricht ab.
- **Speicheranzeige**: Ein farbcodierter Punkt zeigt den aktuellen Speicherstatus:
  - Gruen = gespeichert
  - Bernstein (pulsierend) = ungespeicherte Aenderungen
  - Blau (drehend) = Speichervorgang laeuft
  - Rot = Speicherfehler
- **Experimentelles Design**: Oeffnet das Panel fuer experimentelle Designkonfiguration (Bedingungen, Ausbalancierung, Zuweisungsstrategie).
- **Datenqualitaet**: Oeffnet die Datenqualitaetseinstellungen (Mindestseitenzeit, Flatline-Erkennung, Aufmerksamkeitspruefungen).
- **Teilen**: Oeffnet das Verteilungspanel fuer Teilnehmerlinks und Zugangskonfiguration.
- **Vorschau** (Strg+P): Schaltet die Live-Vorschau mit Desktop-, Tablet- und Mobil-Ansichten um.
- **Veroeffentlichen** (Strg+Umschalt+Enter): Validiert und veroeffentlicht den Fragebogen. Zeigt einen roten Punkt bei Validierungsfehlern; deaktiviert, wenn keine Fragen vorhanden oder aktive Fehler bestehen.

Auf Mobilgeraeten wird die Breadcrumb durch einen Zurueck-Pfeil ersetzt, und Links-/Rechts-Panel-Schalter erscheinen als Drawer-Schaltflaechen.

### Linke Seitenleiste: Icon-Leiste und Flyout-Panels

Die linke Seitenleiste besteht aus zwei Ebenen:

1. **Icon-Leiste** (auf Desktop immer sichtbar): Ein schmaler vertikaler Streifen mit Icon-Schaltflaechen fuer die fuenf Hauptpanels:
   - **Struktur** (Ebenen-Icon): Oeffnet den Block-Manager -- eine Baumansicht von Seiten, Bloecken und Fragen.
   - **Hinzufuegen** (Plus-Icon): Oeffnet die Fragenpalette zum Hinzufuegen neuer Module.
   - **Vorlagen** (Bibliothek-Icon): Oeffnet die Vorlagenbibliothek mit wiederverwendbaren Fragebogenmustern.
   - **Variablen** (Variable-Icon): Oeffnet den Variablen-Manager zum Erstellen und Verwalten von Variablen und Formeln.
   - **Ablauf** (GitBranch-Icon): Oeffnet die Ablaufsteuerung fuer Skip-Logik, Verzweigungen, Schleifen und Abbruchbedingungen.

   Am unteren Ende der Leiste:
   - **Ansichtsumschaltung**: Zwischen WYSIWYG (visuell) und Strukturansicht wechseln.
   - **Hilfe** (Strg+K): Oeffnet die Befehlspalette.

2. **Flyout-Panel**: Beim Klicken auf ein Leisten-Icon gleitet ein Panel ueber die Leinwand (auf Desktop) mit dem entsprechenden Editor. Klicken auf den Hintergrund oder die X-Schaltflaeche schliesst es.

Auf Mobilgeraeten wird die linke Seitenleiste zu einem Vollbild-Drawer mit Tab-Navigation ueber die fuenf Panels.

### Mitte: Die Leinwand

Die Leinwand ist der Hauptbearbeitungsbereich. Sie rendert die aktuell ausgewaehlte Seite mit ihren Bloecken und Fragen. Zwei Ansichtsmodi stehen zur Verfuegung:

- **WYSIWYG-Modus**: Eine visuelle Darstellung, wie der Fragebogen den Teilnehmern erscheinen wird. Fragen werden als Karten angezeigt, die ausgewaehlt, per Drag-and-Drop umgeordnet und inline bearbeitet werden koennen.
- **Strukturmodus**: Eine kompakte, datenorientierte Ansicht mit Fragetypen, IDs und Konfigurationszusammenfassungen ohne visuelle Darstellung.

Die Leinwand unterstuetzt Zoom (Strg+= / Strg+-) und Zoom-Zuruecksetzung (Strg+0).

### Rechte Seitenleiste: Eigenschaftenpanel

Die rechte Seitenleiste erscheint automatisch, wenn eine Frage, Seite, ein Block oder eine Variable ausgewaehlt wird. Sie enthaelt das **Eigenschaftenpanel** mit drei Tabs:

- **Eigenschaften**: Typspezifische Konfigurationsfelder fuer das ausgewaehlte Element (Fragetext, Optionen, Validierungsregeln, Anzeigeeinstellungen, Carry-Forward-Konfiguration, Aufmerksamkeitspruefungen).
- **Stil**: Visuelle Stilsteuerungen ueber den Stil-Editor (Farben, Typografie, Abstaende, Schatten, benutzerdefiniertes CSS).
- **Skript**: Der Monaco-basierte Skript-Editor zum Schreiben von Event-Hooks und benutzerdefinierter Logik (nur fuer Fragen verfuegbar).

Das rechte Panel kann mit der Pin-Schaltflaeche **angepinnt** werden, sodass es sichtbar bleibt, auch wenn kein Element ausgewaehlt ist.

## 5.2 Seiten, Bloecke und Fragen

QDesigner verwendet eine dreistufige Hierarchie zur Organisation von Fragebogeninhalten:

### Seiten

Eine Seite ist der uebergeordnete Container. Jede Seite repraesentiert einen Bildschirm, den ein Teilnehmer auf einmal sieht. Seiten haben:

- Einen Namen (optional, Standardwerte "Seite 1", "Seite 2" usw.)
- Anzeigebedingungen (Formeln, die die Sichtbarkeit steuern)
- Einstellungen: Titel anzeigen, Fortschrittsbalken anzeigen, Navigation erlauben, automatisches Weiterschalten, Zeitlimit.
- Einen oder mehrere Bloecke.

### Bloecke

Bloecke gruppieren Fragen innerhalb einer Seite. Jede Frage gehoert zu einem Block. Es gibt vier Blocktypen:

| Blocktyp | Beschreibung |
|---|---|
| **Standard** | Fragen erscheinen in der definierten Reihenfolge. |
| **Randomisiert** | Fragen werden zufaellig gemischt. Konfigurieren Sie "Erste N beibehalten" und "Letzte N beibehalten" fuer Anker-Items. |
| **Bedingt** | Der Block wird nur angezeigt, wenn seine Bedingung wahr ist. |
| **Schleife** | Der Block wiederholt sich eine konfigurierbare Anzahl von Iterationen. Unterstuetzt eine Iterationsvariable und eine Ausstiegsbedingung. |

Bloecke koennen einer **experimentellen Bedingung** zugeordnet werden. Nur Teilnehmer, die dieser Bedingung zugewiesen sind, sehen den Block.

### Fragen

Fragen sind die atomaren Elemente eines Fragebogens. Jede Frage hat:

- Einen **Typ** (einer von 16+ registrierten Modultypen)
- Eine **Reihenfolge** innerhalb ihres Blocks
- Eine **Anzeigekonfiguration** (Fragetext, Optionen, Layout usw.)
- Eine **Antwortkonfiguration** (wie die Antwort gespeichert und typisiert wird)
- **Validierungsregeln** (erforderlich, Min/Max, Muster, benutzerdefiniert)
- **Bedingte Logik** (Anzeigen/Aktivieren/Erfordern-Formeln)
- **Timing-Konfiguration** (Min/Max-Zeit, Timer-Anzeige)
- **Aufmerksamkeitspruefungs**-Einstellungen

## 5.3 Fragen hinzufuegen

### Die Fragenpalette

Die Fragenpalette (erreichbar ueber das Plus-Icon in der linken Leiste) bietet eine durchsuchbare, kategorisierte Liste aller registrierten Fragemodule. Module sind in zwei Kategorien organisiert:

- **Anzeige**: Textanzeige, Textanweisung, Balkendiagramm, Statistische Rueckmeldung
- **Fragen**: Mehrfachauswahl, Skala, Bewertung, Texteingabe, Zahleneingabe, Matrix, Rangfolge, Datum/Uhrzeit, Datei-Upload, Zeichnung, Reaktionszeit, WebGL

**Zum Hinzufuegen einer Frage:**
1. Stellen Sie sicher, dass eine Seite und ein Block ausgewaehlt sind.
2. **Klicken** Sie auf eine Modulkarte, um sie sofort zum aktuellen Block hinzuzufuegen, oder
3. **Ziehen** Sie eine Modulkarte auf die Leinwand, um sie an einer bestimmten Position zu platzieren.

### Befehlspalette

Druecken Sie **Strg+K**, um die Befehlspalette zu oeffnen. Nuetzliche Schnellbefehle:

| Befehl | Tastenkuerzel |
|---|---|
| Texteingabe-Frage hinzufuegen | T |
| Mehrfachauswahl-Frage hinzufuegen | M |
| Reaktionszeit-Frage hinzufuegen | R |
| Seite hinzufuegen | P |

## 5.4 Das Eigenschaftenpanel

### Eigenschaften-Tab

Der Inhalt variiert je nach Fragetyp, umfasst aber immer:

- **Fragenname**: Ein interner Bezeichner fuer Referenzen in Variablen und Bedingungen.
- **Erforderlich-Schalter**: Ob die Frage beantwortet werden muss.
- **Fragetext**: Der den Teilnehmern angezeigte Text (unterstuetzt Markdown und `{{Variable}}`-Interpolation).
- **Typspezifische Felder**: Optionen fuer Auswahlfragen, Skalenbereich fuer Skalen, Stimulus-Konfiguration fuer Reaktionszeit usw.
- **Validierung**: Mindest-/Hoechstwerte, Muster, benutzerdefinierte Regeln.
- **Bedingte Logik**: Anzeige-, Aktivierungs- und Erfordernisbedingungen als Formelausdruecke.
- **Timing**: Mindestzeit, Hoechstzeit, Timer anzeigen, Warnzeit.
- **Carry-Forward**: Ausgewaehlte Optionen aus einer vorherigen Auswahlfrage uebernehmen.
- **Aufmerksamkeitspruefung**: Korrekte Antwort und Typ (instruiert oder Falle).

### Stil-Tab

Der Stil-Editor bietet visuelle Steuerungen auf drei Ebenen:

- **Global**: Farben (Primaer, Hintergrund, Text, Rahmen), Typografie (Schriftfamilie, Basisgroesse), Effekte (Schatten, Rahmenradius).
- **Seite**: Hintergrundfarbe, Innenabstand, maximale Breite.
- **Frage**: Container-Hintergrund, Innenabstand, Rahmenradius, Schatten, Fragetext-Schriftgroesse, -gewicht, -farbe.

Ein **Benutzerdefiniertes CSS**-Textfeld steht immer fuer beliebige Stile zur Verfuegung.

### Skript-Tab

Der Skript-Tab verwendet eine Monaco-Editor-Instanz (derselbe Editor wie in VS Code) und bietet:

- Syntaxhervorhebung fuer JavaScript/TypeScript
- IntelliSense mit Autovervollstaendigung
- Typdefinitionen fuer die QDesigner-API
- Strg+S zum Speichern, Strg+Leertaste fuer Vorschlaege

Das Skript-Template stellt vier Event-Hooks bereit:

```javascript
export const hooks = {
  onMount: (context) => { /* Frage wurde eingebunden */ },
  onResponse: (response, context) => { /* Nutzer hat geantwortet */ },
  onValidate: (value, context) => { /* true oder Fehlermeldung */ },
  onNavigate: (direction, context) => { /* true zum Erlauben */ }
};
```

## 5.5 Block-Manager

Der Block-Manager (Struktur-Panel) zeigt die vollstaendige Fragebogenhierarchie als klappbaren Baum:

```
Seite 1
  +-- Block: Demografie (Standard) (3 Fragen)
  |   +-- F: Wie alt sind Sie? [Zahleneingabe]
  |   +-- F: Geschlecht [Einfachauswahl]
  |   +-- F: Bildungsniveau [Einfachauswahl]
  +-- Block: Persoenlichkeitsskala (Randomisiert) (5 Fragen)
      +-- F: Ich bin gerne unter Menschen [Skala]
      +-- ...
Seite 2
  +-- Block: Reaktionszeit-Trials (Schleife, 10 Iterationen)
      +-- F: Reaktionsaufgabe [Reaktionszeit]
```

**Funktionen:**
- Klicken auf eine Seite navigiert dorthin. Klicken auf einen Block waehlt ihn aus. Klicken auf eine Frage waehlt sie im Eigenschaftenpanel aus.
- Ueber einer Seite erscheint die +-Schaltflaeche zum Hinzufuegen von Bloecken.
- Ueber einem Block erscheinen Bearbeiten- und Loeschen-Schaltflaechen.
- Die aktuelle Seite und der aktuelle Block werden automatisch aufgeklappt und hervorgehoben.

## 5.6 Stil-Editor

Der Stil-Editor ist ueber den Stil-Tab des Eigenschaftenpanels erreichbar. Die Details sind in Abschnitt 5.4 beschrieben.

Verfuegbare Schriftfamilien: System UI, Arial, Georgia, Times New Roman, Courier New, Inter, Roboto.

## 5.7 Vorschaumodus

Der Vorschaumodus (umschaltbar ueber Strg+P oder die Vorschau-Schaltflaeche) oeffnet ein Modal mit der `RealtimePreview`-Komponente:

- **Live-Darstellung**: Der Fragebogen wird genau so gerendert, wie die Teilnehmer ihn sehen werden.
- **Automatische Aktualisierung**: Aenderungen im Designer werden nach 300ms Verzoegerung in der Vorschau widergespiegelt.
- **Interaktiver Modus**: Fragen koennen in der Vorschau beantwortet werden.
- **Geraetetypen**: Desktop-, Tablet- und Mobilansichten.
- **Debug-Panel**: Zeigt Variablenwerte, Ablaufzustand und Timing-Informationen in Echtzeit.

## 5.8 Befehlspalette und Tastenkuerzel

Druecken Sie **Strg+K**, um die Befehlspalette zu oeffnen. Sie bietet unscharfe Suche ueber alle verfuegbaren Befehle, gruppiert nach Abschnitten:

### Hinzufuegen
| Befehl | Kuerzel |
|---|---|
| Texteingabe-Frage hinzufuegen | T |
| Mehrfachauswahl-Frage hinzufuegen | M |
| Reaktionszeit-Frage hinzufuegen | R |
| Seite hinzufuegen | P |

### Bearbeiten
| Befehl | Kuerzel |
|---|---|
| Rueckgaengig | Strg+Z |
| Wiederholen | Strg+Umschalt+Z |
| Ausgewaehltes duplizieren | Strg+D |
| Ausgewaehltes loeschen | Entf |

### Ansicht
| Befehl | Kuerzel |
|---|---|
| Vergroessern | Strg+= |
| Verkleinern | Strg+- |
| Zoom zuruecksetzen | Strg+0 |

### Aktionen
| Befehl | Kuerzel |
|---|---|
| Fragebogen speichern | Strg+S |
| Fragebogen veroeffentlichen | Strg+Umschalt+Enter |
| Vorschau umschalten | Strg+P |

## 5.9 Rueckgaengig/Wiederholen

Der Designer verwaltet eine vollstaendige Rueckgaengig-/Wiederholen-Historie. Jede zustandsaendernde Operation wird aufgezeichnet.

- **Rueckgaengig**: Strg+Z
- **Wiederholen**: Strg+Umschalt+Z

## 5.10 Speichern und Auto-Speichern

Der Designer verfolgt alle Aenderungen ueber ein "Dirty"-Flag. Die Speicheranzeige in der Kopfzeile spiegelt den aktuellen Zustand in Echtzeit wider.

- **Manuelles Speichern**: Strg+S oder der Befehl "Fragebogen speichern".
- **Auto-Speichern**: Der Designer speichert automatisch, wenn Aenderungen erkannt werden, nach einer konfigurierbaren Verzoegerungszeit.
- **Veroeffentlichen**: Das Veroeffentlichen speichert zuerst, validiert dann und markiert den Fragebogen als veroeffentlicht. Ein veroeffentlichter Fragebogen erhaelt eine Verteilungs-URL.

Bei einem Speicherfehler wird die Anzeige rot und ein Tooltip zeigt die Fehlermeldung an.

Der Fragebogeninhalt wird als JSONB in der `questionnaire_definitions`-Tabelle in PostgreSQL gespeichert, sodass die gesamte Struktur -- Fragen, Variablen, Ablaufsteuerungen, Stile und Einstellungen -- atomar persistiert wird.
