# Kapitel 5: Der Fragebogen-Designer

Der QDesigner-Fragebogen-Designer ist die zentrale Arbeitsumgebung fuer das Erstellen, Konfigurieren und Vorschauen von Frageboegen. Er bietet eine vollstaendige visuelle Bearbeitungsumgebung mit Drag-and-Drop-Komposition, Echtzeit-Vorschau, einem Variablensystem, Ablaufsteuerungslogik und umfassender Konfigurierbarkeit fuer jeden Fragetyp.

Dieses Kapitel behandelt das Layout der Designer-Oberflaeche, die strukturelle Hierarchie von Frageboegen und die wichtigsten Bearbeitungsablaeufe.

## 5.1 Oberflaechenuebersicht

Der Designer folgt einem Drei-Spalten-Layout mit einer kompakten Kopfzeilen-Werkzeugleiste. Jeder Bereich dient einem bestimmten Zweck im Bearbeitungsablauf.

### Kopfzeilen-Werkzeugleiste

Die Kopfzeile erstreckt sich ueber die gesamte Bildschirmbreite und bietet:

- **Breadcrumb-Navigation**: `Projects › [Projektname] ›`. Jedes Segment ist ein klickbarer Link zurueck nach oben in der Hierarchie.
- **Bearbeitbarer Titel**: Klicken Sie auf den Fragebogennamen (der auf die Breadcrumb folgt), um ihn inline umzubenennen. Enter bestaetigt, Escape bricht ab.
- **Speicheranzeige**: Ein farbcodierter Punkt zeigt den aktuellen Speicherstatus. Beim Ueberfahren mit der Maus erscheint ein Tooltip, der den genauen Zustand meldet ("Saving…", "Unsaved changes", "Saved 14:32" oder der Fehlertext):
  - Gruen = gespeichert
  - Bernstein (pulsierend) = ungespeicherte Aenderungen
  - Blau (drehend) = Speichervorgang laeuft
  - Rot = Speicherfehler
- **Theme-Umschalter** und **Praesenz-Avatare**: Ein Hell-/Dunkel-Theme-Schalter sowie gestapelte farbige Avatare fuer alle Mitarbeitenden, die denselben Fragebogen gerade bearbeiten.
- **Rueckgaengig-/Wiederholen-Schaltflaechen**: Eine gepaarte Schaltflaechengruppe (siehe Abschnitt 5.9). Jede ist deaktiviert, wenn es nichts rueckgaengig zu machen oder zu wiederholen gibt.
- **Tools-Schaltflaeche**: Ein "Tools"-Ueberlaufmenue, das die modalen Konfigurationspanels buendelt (Study settings, Experimental design, Data quality, Share und weitere -- siehe den Unterabschnitt *Tools-Menue* weiter unten).
- **Versions-Badge**: Zeigt die aktuelle semantische Version und oeffnet die Versionsverwaltung (siehe Abschnitt 5.11).
- **Vorschau-Schaltflaeche**: Schaltet die Live-Vorschau mit Desktop-, Tablet- und Mobil-Ansichten um (Tastenkuerzel: Strg+P).
- **Veroeffentlichen-Schaltflaeche**: Validiert und veroeffentlicht den Fragebogen (Tastenkuerzel: Strg+Umschalt+Enter). Zeigt einen roten Punkt bei Validierungsfehlern; deaktiviert, wenn keine Fragen vorhanden oder aktive Fehler bestehen.

Auf Mobilgeraeten wird die Breadcrumb durch einen Zurueck-Pfeil ersetzt, und Links-/Rechts-Panel-Schalter erscheinen als Drawer-Schaltflaechen; die Rueckgaengig-/Wiederholen-Gruppe, das Tools-Menue und das Versions-Badge sind auf kleinen Bildschirmen ausgeblendet.

### Tools-Menue

Die **Tools**-Schaltflaeche (Schraubenschluessel-Icon) in der Kopfzeile oeffnet ein Ueberlaufmenue mit den sekundaeren, panel-oeffnenden Aktionen, die frueher die Werkzeugleiste ueberfuellten. Die Auswahl eines Eintrags schliesst das Menue und oeffnet den zugehoerigen Dialog:

| Menueeintrag | Oeffnet |
|---|---|
| **Study settings** | Fortschrittsanzeige und Verfassen der Einwilligungserklaerung (siehe Abschnitt 5.12). |
| **Experimental design** | Bedingungen, Ausbalancierung und Zuweisungsstrategie. |
| **Study series** | Einrichtung einer Mehrsitzungs- bzw. Laengsschnittstudie (erst sichtbar, sobald der Fragebogen gespeichert wurde). |
| **Data quality** | Mindestseitenzeit, Flatline-Erkennung und Aufmerksamkeitspruefungs-Einstellungen. |
| **Scale scoring** | Definitionen zur Skalen-/Subskalen-Bewertung, die von der Report-Seite verwendet werden. |
| **Quotas** | Regeln fuer Antwort-Quotas. |
| **Report page** | Der Editor fuer die teilnehmerseitige Ergebnisseite (siehe Abschnitt 5.13). |
| **Share** | Das Verteilungspanel fuer Teilnehmerlinks, QR-Codes und Einbettungscode. |

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

Die rechte Seitenleiste erscheint automatisch, wenn eine Frage, Seite, ein Block oder eine Variable ausgewaehlt wird. Ihr oberster Tab-Umschalter hat drei Tabs:

- **Properties** (je nach Auswahl beschriftet als "Question Properties", "Page Properties" usw.): Das Eigenschaftenpanel, das selbst in die Tabs **Properties**, **Style** und **Script** unterteilt ist (siehe Abschnitt 5.4).
- **Translate** (Sprachen-Icon): Das Content-Translations-Panel zum Uebersetzen teilnehmerseitiger Texte in zusaetzliche Sprachen (siehe Abschnitt 5.14).
- **Comments** (Sprechblasen-Icon): Threaded-Kommentare fuer die kollaborative Ueberpruefung.

Innerhalb des **Properties**-Tabs bietet das Eigenschaftenpanel:

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

Es gibt drei Wege zum Rueckgaengigmachen und Wiederholen:

- **Werkzeugleisten-Schaltflaechen**: Eine gepaarte Rueckgaengig-/Wiederholen-Schaltflaechengruppe sitzt in der Kopfzeile (Icons mit gebogenem Pfeil). Jede Schaltflaeche ist deaktiviert (abgeblendet), wenn es nichts mehr rueckgaengig zu machen oder zu wiederholen gibt. Beim Ueberfahren zeigt der Tooltip das Tastenkuerzel ("Undo (Ctrl+Z)" / "Redo (Ctrl+Shift+Z)"; der Modifikator erscheint auf macOS als ⌘).
- **Tastatur**: Strg+Z (oder ⌘+Z) zum Rueckgaengigmachen, Strg+Umschalt+Z (oder ⌘+Shift+Z) zum Wiederholen.
- **Befehlspalette**: Die Befehle "Undo" und "Redo" (siehe Abschnitt 5.8).

## 5.10 Speichern und Auto-Speichern

Der Designer verfolgt alle Aenderungen ueber ein "Dirty"-Flag. Die Speicheranzeige in der Kopfzeile spiegelt den aktuellen Zustand in Echtzeit wider.

- **Manuelles Speichern**: Strg+S oder der Befehl "Fragebogen speichern".
- **Auto-Speichern (entprellt)**: Etwa 2,5 Sekunden nach Ihrer letzten Bearbeitung speichert der Designer automatisch. Jede neue Bearbeitung setzt den Timer neu an, sodass eine Serie von Bearbeitungen zu einem einzigen Speichervorgang kurz nach dem Aufhoeren fuehrt.
- **Auto-Speichern (periodische Absicherung)**: Ein 30-Sekunden-Intervall spuelt zusaetzlich alle ausstehenden Aenderungen, falls das entprellte Speichern unterbrochen wurde.
- **Spuelen beim Verlassen**: Ausstehende Aenderungen werden auch dann gespuelt, wenn Sie innerhalb der App wegnavigieren sowie wenn Sie den Tab schliessen oder neu laden. Beim Schliessen des Tabs zeigt der Browser zusaetzlich seine native "unsaved changes"-Abfrage an, waehrend der Speichervorgang ausgeloest wird.
- **Veroeffentlichen**: Das Veroeffentlichen speichert zuerst, validiert dann und markiert den Fragebogen als veroeffentlicht. Ein veroeffentlichter Fragebogen erhaelt eine Verteilungs-URL.

**Nur ein einziges Anlegen, jemals.** Das allererste Speichern eines brandneuen Fragebogens ist *single-flighted*: Egal wie viele Ausloeser gleichzeitig feuern (das Entprellen, das 30-Sekunden-Intervall, Strg+S oder das Spuelen beim Tab-Schliessen), es wird nur eine einzige Create-Anfrage an den Server gesendet. Jeder andere Ausloeser wartet, bis diese eine abgeschlossen ist, und speichert dann ein Update, sodass ein Fragebogen niemals versehentlich zweimal angelegt wird.

**Namenskonflikte -- "Rename to save".** Wenn der Server das Anlegen ablehnt, weil im Projekt bereits ein Fragebogen mit demselben Namen existiert, hoert der Designer auf, es erneut zu versuchen (es wuerde ohnehin wieder fehlschlagen), und zeigt einen Toast mit dem Titel **Rename to save** und der Meldung: *A questionnaire named "[name]" already exists in this project. Rename it to save.* Die Speicheranzeige wird ausserdem rot. Benennen Sie den Fragebogen um (ueber den Inline-Titel), und er speichert bei der naechsten Bearbeitung normal. Der bestehende Datensatz wird niemals ueberschrieben -- es koennte ein unverwandter Fragebogen sein, der zufaellig denselben Namen traegt.

Wenn ein anderer Speichervorgang fehlschlaegt, wird die Anzeige rot und ihr Tooltip zeigt die Fehlermeldung an. Der Designer versucht es beim naechsten Speicher-Ausloeser erneut.

Der Fragebogeninhalt wird als JSONB in der `questionnaire_definitions`-Tabelle in PostgreSQL gespeichert, sodass die gesamte Struktur -- Fragen, Variablen, Ablaufsteuerungen, Stile und Einstellungen -- atomar persistiert wird.

## 5.11 Versionsverwaltung

QDesigner verwendet **Semantische Versionierung** (Semver) zur Nachverfolgung von Fragebogenaenderungen. Jeder Fragebogen hat eine Versionsnummer im Format `v{Major}.{Minor}.{Patch}` (z.B. `v1.2.3`).

### Versionsanzeige

Die aktuelle Version wird in der Designer-Kopfzeile neben der Speicheranzeige dargestellt. Ein Klick auf das Versions-Badge oeffnet das Versionsverwaltungs-Panel.

### Versions-Erhoehungen

Die Versionsverwaltung bietet drei Erhoehungsaktionen mit unterschiedlicher Semantik:

| Aenderungstyp | Erhoehung | Beispiel | Verwendung |
|---|---|---|---|
| **Major** | Erhoeht Major, setzt Minor und Patch auf 0 | `v1.2.3` -> `v2.0.0` | Strukturelle Aenderungen, die die Datenvergleichbarkeit beeinflussen |
| **Minor** | Erhoeht Minor, setzt Patch auf 0 | `v1.2.3` -> `v1.3.0` | Inhaltsaenderungen ohne Auswirkung auf die Antwortstruktur |
| **Patch** | Erhoeht Patch | `v1.2.3` -> `v1.2.4` | Kosmetische Korrekturen ohne Datenauswirkung |

#### Erhoehungsregeln

| Aenderung | Empfohlene Erhoehung |
|---|---|
| Fragen hinzufuegen, entfernen oder umordnen | Major |
| Antwort-Schluessel umbenennen | Major |
| Fragetexte oder Beschriftungen aendern | Minor |
| Antwortoptionen zu einer Auswahlfrage hinzufuegen | Minor |
| Seitenreihenfolge aendern | Minor |
| Tippfehler beheben, Styling anpassen, Beschreibungen aktualisieren | Patch |

Eine **Major-Versions-Erhoehung** wird mit einer Warnung hervorgehoben, da sie signalisiert, dass unter der neuen Major-Version erhobene Antwortdaten nicht direkt mit Daten aus frueheren Major-Versionen vergleichbar sind.

### Versionshistorie

Die Versionsverwaltung zeigt eine chronologische Liste aller veroeffentlichten Versionen mit Versionsnummer, Veroeffentlichungszeitstempel und Veroeffentlicher. Jede Veroeffentlichung erstellt einen Snapshot in der `questionnaire_versions`-Tabelle, der den exakten Inhalt zu diesem Zeitpunkt bewahrt.

### Versionsverfolgung in Sitzungen

Wenn ein Teilnehmer eine Ausfuell-Sitzung startet, zeichnet die Sitzung die aktuelle `version_major`, `version_minor` und `version_patch` des Fragebogens auf. Dies ermoeglicht Forschern:

- Antwortdaten nach Version zu filtern
- Ergebnisse ueber Versionen hinweg zu vergleichen
- Zu identifizieren, welche Version ein Teilnehmer ausgefuellt hat
- Sicherzustellen, dass nur Sitzungen innerhalb derselben Major-Version in aggregierten Statistiken verglichen werden

### Veroeffentlichung und Versionen

Das Veroeffentlichen eines Fragebogens:

1. Erstellt einen Versions-Snapshot (friert Inhalt, Variablen, Ablaufsteuerungen ein)
2. Zeichnet die aktuelle Semver im Snapshot auf
3. Setzt den Fragebogenstatus auf `published`
4. Macht ihn ueber die Kurzcode-URL zugaenglich

Das Erhoehen einer Version fuehrt **nicht** automatisch zur Veroeffentlichung. Forscher koennen die Version erhoehen, weiterarbeiten und veroeffentlichen, wenn sie bereit sind.

## 5.12 Study Settings

Oeffnen Sie **Tools > Study settings**, um zwei teilnehmerseitige Verhaltensweisen zu konfigurieren. Aenderungen werden lokal gehalten und erst angewendet, wenn Sie auf **Save** klicken (Cancel verwirft sie), sodass das Panel die Rueckgaengig-Historie waehrend des Tippens nie durcheinanderbringt.

### Presentation

- **Show progress indicator**: Wenn aktiviert, sehen die Teilnehmer einen Fortschrittsbalken, waehrend sie die Studie durcharbeiten. (Standardmaessig eingeschaltet.) Der Hilfetext lautet: *Display a completion progress bar to participants while they fill out the study.*

### Informed consent

- **Require consent before starting**: Wenn aktiviert, muessen die Teilnehmer einen Einwilligungsbildschirm akzeptieren, bevor die Studie beginnt. Das Ausschalten verwirft den von Ihnen verfassten Einwilligungsinhalt nicht -- er wird aufbewahrt, damit Sie die Einwilligung spaeter wieder einschalten koennen.

Wenn "Require consent before starting" eingeschaltet ist, erscheint ein Einwilligungs-Editor mit diesen Feldern:

- **Heading**: Ein optionaler Titel fuer den Einwilligungsbildschirm. Bleibt er leer, faellt er auf die eingebaute lokalisierte Ueberschrift "Informed Consent" (auf Deutsch "Einwilligungserklaerung") zurueck. (Nur Basissprache; noch nicht pro Locale uebersetzt -- uebersetzen Sie den Textkoerper ueber das Translations-Panel.)
- **Consent text**: Der Hauptteil der Einwilligung, verfasst in **Markdown** (Fett, Ueberschriften und Listen werden unterstuetzt). Wird den Teilnehmern als bereinigtes HTML gerendert. Uebersetzen Sie ihn pro Sprache im Translations-Panel (der Slot "Consent text").
- **Acknowledgement checkboxes**: Eine optionale Liste von Aussagen, die Teilnehmer ankreuzen muessen (oder koennen). Verwenden Sie **Add checkbox**, um eine Zeile anzuhaengen; jede Zeile hat ein Beschriftungsfeld, einen **Required**-Schalter und eine Entfernen-Schaltflaeche. Ohne Checkboxen koennen Teilnehmer mit einem einzigen Klick zustimmen.
- **Require electronic signature**: Wenn aktiviert, muessen die Teilnehmer ihren Namen eingeben, um die Einwilligung zu erfassen. Hilfetext: *Participants must type their name to record consent.*

**Wie es den Teilnehmern gerendert wird.** Auf dem Einwilligungsbildschirm erscheint die Ueberschrift oben, der Markdown-Textkoerper darunter, dann alle Acknowledgement-Checkboxen (erforderliche sind mit einem roten Sternchen markiert) und -- falls aktiviert -- ein Signatur-Textfeld. Teilnehmer fahren mit der primaeren Zustimmen-Schaltflaeche fort und koennen ablehnen (was vor dem Verlassen eine Bestaetigung verlangt). Die Zustimmen-Schaltflaeche signalisiert einen unvollstaendigen Zustand, ist aber nicht hart deaktiviert, sodass Screenreader-Nutzern mitgeteilt wird, *warum* sie noch nicht fortfahren koennen (eine erforderliche Checkbox nicht angekreuzt oder eine leere erforderliche Signatur), statt vor einem stumm deaktivierten Bedienelement zu stehen.

## 5.13 Die Report-Seite

Oeffnen Sie **Tools > Report page**, um eine optionale teilnehmerseitige Ergebnisseite zu erstellen, die nach Abschluss vollstaendig offline aus der eigenen abgeschlossenen Sitzung des Teilnehmers gerendert wird. Widgets binden an Variablen oder Skalenwerte; Kohortenvergleichs-Widgets binden eine objekttypisierte Server Variable.

Steuerelemente auf Seitenebene:

- **Show report page after completion**: Hauptschalter fuer das gesamte Feature.
- **Enable PDF download**: Erlaubt Teilnehmern, ihren Report als PDF herunterzuladen.
- **Title** (z.B. "Your results") plus numerische Layout-Eingaben -- **Row h** (Zeilenhoehe in px), **Gap** (px) und **Refresh h** (das Fenster zum Ueberspringen des Server-Variable-Abrufs, in Stunden).

### Widgets

Klicken Sie auf **Add Widget** (oder, im Leerzustand, auf **Add your first widget**), um ein Report-Element hinzuzufuegen. Jedes Widget hat einen Typ-Selektor -- **Score tile**, **Bar chart**, **Box vs cohort**, **Reaction vs cohort**, **Radar profile**, **Distribution + marker**, **Gauge / arc**, **Interpretive text**, **Results table** oder **Completion metadata** -- gefolgt von seinen Feldern fuer Binding, Vergleich und Interpretationsnotiz.

### Visuelles Layout: Layout vs Preview

Sobald mindestens ein Widget existiert, erscheint oberhalb der Widget-Liste ein Umschalter mit zwei Schaltflaechen:

- **Layout** (Raster-Icon): Ein schematischer **12-Spalten-Rastereditor**. Jedes Widget ist ein ziehbares, groessenveraenderbares Kaestchen:
  - **Ziehen** Sie den Kaestchenkoerper, um es zu verschieben.
  - **Groesse aendern** ueber die Kantengriffe (rechte Kante / untere Kante) oder den Eckgriff unten rechts; Kaestchen sind oben links verankert, sie wachsen also nach rechts und nach unten.
  - **Tastatur**: Bei fokussiertem Kaestchen verschieben die Pfeiltasten seine Position um eine Zelle; **Umschalt + Pfeiltasten** aendern seine Groesse. Verschiebungen und Groessenaenderungen werden fuer Screenreader-Nutzer angesagt ("Moved to column X, row Y" / "Resized to W by H").

  Jede Widget-Karte unterhalb des Rasters stellt weiterhin numerische **X / Y / W / H**-Felder fuer die praezise Platzierung bereit; das visuelle Raster und die numerischen Felder bearbeiten dieselben ganzzahligen Koordinaten und bleiben mit der aktuellen Auswahl im Gleichschritt.

- **Preview** (Augen-Icon): Eine **Live-Vorschau**, gerendert mit dem *echten* Teilnehmer-Ergebnisrenderer gegen repraesentative Beispielwerte, sodass Sie die Seite im Wesentlichen so sehen, wie die Teilnehmer sie sehen werden. Eine Fussnote erinnert Sie: *Preview uses representative sample values — participants see their own results.*

Wie bei den anderen Tools-Panels werden Aenderungen mit **Save** angewendet und mit Cancel verworfen.

## 5.14 Content Translations

Der Designer kann teilnehmerseitige Inhalte in zusaetzlichen Sprachen praesentieren. Oeffnen Sie den Tab **Translate** (Globus-Icon) in der rechten Seitenleiste, um das **Content-Translations**-Panel zu erreichen. Dieses uebersetzt den *Inhalt* der Studie (Fragetexte, Optionen, Seitentitel sowie die Willkommens-/Einwilligungs-/Abschluss-Chrome) -- es ist getrennt von der Sprache der Anwendungsoberflaeche.

### Sprachen verwalten

- Die Basissprache (der Text, den Sie direkt verfassen) wird als Chip mit der Markierung `· base` angezeigt.
- Fuegen Sie eine Sprache mit dem Feld **Language code** (z.B. `de`) und einem optionalen **Label** (z.B. `Deutsch`) hinzu, dann **Add language**. Gaengige Codes werden waehrend der Eingabe vorgeschlagen.
- Jede hinzugefuegte Sprache erscheint als Chip, den Sie anklicken koennen, um ihn fuer die Bearbeitung aktiv zu machen, mit einem kleinen **×** zum Entfernen. Das Entfernen einer Sprache verlangt eine Bestaetigung (und warnt, wie viele uebersetzte Strings verloren gehen).

### Vollstaendigkeitsbalken

Unterhalb der Sprach-Chips zeigt eine Liste zur **Vollstaendigkeit pro Locale** eine Zeile pro hinzugefuegter Sprache: einen Fortschrittsbalken plus eine `done/total`-Zaehlung. Wenn noch Strings fehlen, wird die Zaehlung mit "· N left" annotiert; wenn es noch nichts Uebersetzbares gibt, steht dort "nothing to translate". Jeder aktive Sprach-Chip zeigt seinen Prozentsatz zusaetzlich inline an. So sehen Sie auf einen Blick, welche Uebersetzungen vor der Veroeffentlichung fertig sind.

### Was Sie uebersetzen

Fuer die aktive Sprache bietet das Panel:

- **Question**-Fragetext und -Optionen -- waehlen Sie eine Frage in der Leinwand aus, um sie zu uebersetzen; der Basistext wird als Referenz/Platzhalter angezeigt.
- **Page titles** -- ein Feld pro Seite.
- **Welcome / consent / completion**-Chrome -- die Slots **Welcome message**, **Consent text** und **Completion message**.

## 5.15 Media Library

Die **Media Library** verwaltet Bilder, Video und Audio fuer die Organisation. Sie oeffnet sich als Auswahldialog, wenn Sie Medien an eine Frage anhaengen, und dieselbe Oberflaeche dient zugleich als Aufraeumwerkzeug.

- **Ansichtsumschalter**: Wechsel zwischen **Grid view** und **List view**.
- **Suche** (`Search media…`) und ein **Typfilter** (All Types / Images / Videos / Audio).
- **Upload**: Blendet eine Drag-and-Drop-Ablagezone mit einer Schaltflaeche **Choose Files** ein (max. 50 MB pro Datei; Bilder, Video und Audio).
- **Bildabmessungen**: Bei Bildern, deren Abmessungen der Server extrahiert hat, wird die Pixelgroesse z.B. als `1920 × 1080` angezeigt -- im Hover-Overlay in der Grid-Ansicht und in der Metadatenzeile in der List-Ansicht (neben Dateigroesse, Typ und Datum).

### Manage-Modus

Klicken Sie auf **Manage** in der Kopfzeile der Bibliothek, um in den Aufraeummodus zu wechseln (die Schaltflaeche wechselt zu **Done**). Im Manage-Modus waehlt das Antippen einer Karte sie nicht mehr aus; stattdessen zeigt jedes Asset eine rote **Delete**-Schaltflaeche (Papierkorb).

Das Loeschen verlangt eine Bestaetigung mit dem Dialogtitel **Delete media?** und dieser Warnung:

> Permanently delete "[filename] ([width] × [height])"? Any questionnaire that references this asset will lose it — this cannot be undone.

Dies ist ein **Hard Delete** -- es gibt keinen "in use"-Schutz, sodass das Entfernen eines Assets, auf das ein veroeffentlichter Fragebogen noch zeigt, diese Referenz beschaedigt. Bei Erfolg bestaetigt ein "Media deleted"-Toast die Entfernung.

## 5.16 Frageboegen und Projekte verwalten

Ausserhalb des Designers werden Frageboegen und Projekte ueber ihre **Karten** (auf der Projektliste und den Projektdetailseiten) und Kopfzeilen mittels eines Kebab-Menues **More options** (⋮) verwaltet. Die verfuegbaren Aktionen haengen von Ihrer Rolle ab; das Loeschen ist auf Projekt-Owner / Organisations-Admins beschraenkt.

### Fragebogen-Aktionen

Das "More options"-Menue des Fragebogens bietet:

- **Rename**: Oeffnet einen Dialog "Rename questionnaire" mit einem Feld **Questionnaire name**; klicken Sie auf **Save**.
- **Duplicate**: Erstellt eine vollstaendige Kopie namens "Copy of [name]" als frischen **Entwurf** (mit eigenem neuen Ausfuellcode, Version auf den Standardwert zum Erstellungszeitpunkt zurueckgesetzt). Ein "Questionnaire duplicated"-Toast bestaetigt es.
- **Archive** / **Restore**: Das Archivieren blendet den Fragebogen aus aktiven Listen aus; Restore versetzt ihn in den bearbeitbaren **Entwurfs**-Zustand zurueck (das erneute Veroeffentlichen ist ein separater, expliziter Schritt).
- **Delete** (getippte Bestaetigung): Oeffnet einen Dialog "Delete questionnaire", der erklaert, dass dies *[name] entfernt und dessen Ausfuelllink offline nimmt. Bereits erhobene Antworten bleiben in der Datenbank erhalten, sind aber hier nicht mehr zugaenglich.* Sie muessen den exakten Namen des Fragebogens in das Feld **Type "[name]" to confirm** eingeben, bevor die Schaltflaeche **Delete questionnaire** aktiv wird.

### Projekt-Aktionen

Das "More options"-Menue des Projekts bietet **Rename**, **Archive** / **Restore** und **Delete**. Das Loeschen eines Projekts ist die zerstoererischste Aktion: Der Dialog "Delete project" warnt, dass dies *[name] zusammen mit seinen Frageboegen und allen erhobenen Antworten entfernt. Sie werden nicht mehr darauf zugreifen koennen.* Wie bei Frageboegen muessen Sie den exakten Namen des Projekts in das Feld **Type "[name]" to confirm** eingeben, um die Schaltflaeche **Delete project** zu aktivieren.

Jede Aktion meldet ihr Ergebnis mit einem Toast (z.B. "Project renamed", "Project archived", "Project restored", "Project deleted").
