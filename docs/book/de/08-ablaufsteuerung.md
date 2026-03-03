# Kapitel 8: Ablaufsteuerung und Logik

Die Ablaufsteuerung ermoeglicht es Forschenden, adaptive Frageboegen zu erstellen, die ihre Struktur basierend auf den Antworten der Teilnehmer aendern. QDesigner unterstuetzt vier Arten der Ablaufsteuerung (Ueberspringen, Verzweigung, Schleife, Abbruch), Anzeigebedingungen auf Fragenebene und einen visuellen Ablauf-Editor zur Gestaltung komplexer Logik.

## 8.1 Uebersicht

In einem Standard-Fragebogen werden Seiten sequentiell von der ersten bis zur letzten praesentiert. Die Ablaufsteuerung fuegt bedingte Navigation hinzu, die:

- **Ueberspringt** zu einer bestimmten Seite oder Frage, wenn eine Bedingung erfuellt ist.
- **Verzweigt** auf verschiedene Pfade basierend auf Antwortwerten.
- **Schleifen** einen Abschnitt eine festgelegte Anzahl von Malen wiederholt.
- **Abbricht** den Fragebogen vorzeitig, wenn eine Disqualifikationsbedingung erfuellt ist.

Ablaufsteuerungen werden auf Fragebogenebene definiert und im `flow`-Array der Fragebogendatenstruktur gespeichert:

```typescript
{
  id: string;        // Eindeutiger Bezeichner
  type: 'skip' | 'branch' | 'loop' | 'terminate';
  condition: string; // Formelausdruck, der diese Regel ausloest
  target?: string;   // Seiten- oder Fragen-ID (fuer skip/branch)
  iterations?: number; // Anzahl der Wiederholungen (fuer loop)
}
```

## 8.2 Skip-Logik

Die Skip-Logik springt den Befragten zu einer bestimmten Seite oder Frage, wenn eine Bedingung als wahr ausgewertet wird. Alle Fragen zwischen der aktuellen Position und dem Ziel werden uebersprungen.

### Konfiguration

| Feld | Beschreibung |
|---|---|
| Typ | `skip` |
| Bedingung | Formelausdruck (z.B. `alter < 18`) |
| Ziel | Die Seite oder Frage, zu der gesprungen wird |

### Beispiel

Ein demografischer Fragebogen fragt nach dem Beschaeftigungsstatus. Wenn der Befragte "Student" auswaehlt, wird der Abschnitt zur Beschaeftigungshistorie uebersprungen:

- **Bedingung**: `beschaeftigungsStatus === 'student'`
- **Ziel**: Seite "Bildungsdetails"

### Praktische Muster

**Zum Ende des Abschnitts springen**:
```
Bedingung: einwilligungGegeben === false
Ziel: Seite "Danke" (letzte Seite)
```

**Optionalen Abschnitt ueberspringen**:
```
Bedingung: moechteDetailFeedback === false
Ziel: Seite "Zusammenfassung"
```

## 8.3 Verzweigung

Verzweigung bietet bedingte Navigation, bei der verschiedene Befragte unterschiedliche Pfade durch den Fragebogen nehmen.

### Konfiguration

| Feld | Beschreibung |
|---|---|
| Typ | `branch` |
| Bedingung | Formelausdruck |
| Ziel | Die Seite oder Frage, zu der navigiert wird |

### Beispiel: Zwei-Pfad-Verzweigung

Eine Studie untersucht sowohl klinische als auch nicht-klinische Populationen:

- **Verzweigung 1**: Bedingung `gruppenZuweisung === 'klinisch'`, Ziel: Seite "Klinische Masse"
- **Verzweigung 2**: Bedingung `gruppenZuweisung === 'kontrolle'`, Ziel: Seite "Kontrollmasse"

Nach ihren jeweiligen Abschnitten konvergieren beide Gruppen auf der "Debriefing"-Seite.

### Beispiel: Mehrfach-Verzweigung

Ein Persoenlichkeitsfragebogen passt sich basierend auf dem initialen Screening an:

```
Verzweigung A: IF(dominanterTrait === 'extraversion')   -> "Extraversions-Vertiefung"
Verzweigung B: IF(dominanterTrait === 'neurotizismus')   -> "Neurotizismus-Vertiefung"
Verzweigung C: IF(dominanterTrait === 'offenheit')       -> "Offenheits-Vertiefung"
Standard:                                                 -> "Allgemeine Persoenlichkeit"
```

### Mehrfach-Verzweigung implementieren

Da jede Ablaufsteuerungsregel eine einzelne Bedingung und ein Ziel hat, implementieren Sie Mehrfach-Verzweigungslogik mit mehreren Ablaufsteuerungen:

1. Ablauf: type=branch, condition=`dominanterTrait === 'extraversion'`, target=Seite "Extraversions-Vertiefung"
2. Ablauf: type=branch, condition=`dominanterTrait === 'neurotizismus'`, target=Seite "Neurotizismus-Vertiefung"
3. Ablauf: type=branch, condition=`dominanterTrait === 'offenheit'`, target=Seite "Offenheits-Vertiefung"

Die erste passende Bedingung gewinnt.

## 8.4 Schleifen

Schleifen wiederholen einen Abschnitt des Fragebogens eine festgelegte Anzahl von Malen. Dies ist essentiell fuer Within-Subjects-Experimentaldesigns, Uebungsdurchgaenge und iterative Aufgaben.

### Konfiguration

| Feld | Beschreibung |
|---|---|
| Typ | `loop` |
| Bedingung | Formelausdruck, der wahr sein muss, damit die Schleife weiterlaeuft |
| Iterationen | Maximale Anzahl der Wiederholungen |

### Block-Level-Schleifen

Zusaetzlich zu Ablauf-Level-Schleifen koennen einzelne Bloecke als **Schleifen-Bloecke** konfiguriert werden:

| Einstellung | Beschreibung |
|---|---|
| Anzahl der Iterationen | Wie oft wiederholen (kann eine Zahl oder eine Variablenreferenz sein). |
| Iterationsvariable | Ein Variablenname fuer den aktuellen Iterationsindex (z.B. `aktuellerDurchgang`). |
| Ausstiegsbedingung | Eine Formel, die bei Wahrheit die Schleife vorzeitig beendet (z.B. `score > 100`). |

### Beispiel: Uebungs- und Testdurchgaenge

Ein Reaktionszeitexperiment mit 5 Uebungsdurchgaengen und 20 Testdurchgaengen:

1. **Block "Uebung"** (Typ: Schleife, Iterationen: 5, Variable: `uebungsDurchgangNr`)
   - Reaktionszeitfrage
   - Feedback-Anweisung: `"Durchgang {{uebungsDurchgangNr}} von 5: {{IF(letzteKorrekt, 'Richtig!', 'Falsch')}}"`.

2. **Block "Test"** (Typ: Schleife, Iterationen: 20, Variable: `testDurchgangNr`, Ausstiegsbedingung: `aufeinanderfolgendeFehler >= 3`)
   - Reaktionszeitfrage (ohne Feedback)

Die Ausstiegsbedingung stellt sicher, dass der Test vorzeitig endet, wenn der Teilnehmer drei aufeinanderfolgende Fehler macht.

## 8.5 Abbruchbedingungen

Abbruchbedingungen beenden den Fragebogen sofort, wenn ein Disqualifikationskriterium erfuellt ist.

### Konfiguration

| Feld | Beschreibung |
|---|---|
| Typ | `terminate` |
| Bedingung | Formelausdruck, der den Abbruch ausloest |

### Beispiel: Screening-Disqualifikation

```
Bedingung: alter < 18 || einwilligungGegeben === false
Typ: terminate
```

### Beispiel: Datenqualitaets-Abbruch

```
Bedingung: aufmerksamkeitspruefungFehler >= 2
Typ: terminate
```

Befragte, die zwei Aufmerksamkeitspruefungen nicht bestehen, werden zur Aufrechterhaltung der Datenqualitaet abgebrochen.

## 8.6 Anzeigebedingungen

Anzeigebedingungen arbeiten auf der einzelnen Fragenebene und steuern Sichtbarkeit und Interaktivitaet, ohne den Seitenfluss zu aendern. Sie werden in der `conditions`-Eigenschaft jeder Frage definiert.

### Bedingungstypen

| Bedingung | Eigenschaft | Wirkung |
|---|---|---|
| **Anzeigen** | `conditions.show` | Frage ist nur sichtbar, wenn die Formel wahr ergibt. |
| **Aktivieren** | `conditions.enable` | Frage ist sichtbar, aber deaktiviert, wenn falsch. |
| **Erfordern** | `conditions.require` | Frage wird erforderlich, wenn die Formel wahr ergibt. |

### Beispiel: Bedingte Nachfrage

Ein Fragebogen zur Krankengeschichte:

- F1: "Haben Sie chronische Erkrankungen?" (Ja/Nein)
- F2: "Bitte listen Sie Ihre Erkrankungen auf." (Texteingabe)
  - Anzeigebedingung: `hatChronischeErkrankungen === 'ja'`

F2 erscheint nur, wenn der Befragte F1 mit "Ja" beantwortet.

### Beispiel: Dynamische Pflichtangabe

- F1: "Rauchen Sie?" (Ja/Nein)
- F2: "Wie viele Zigaretten pro Tag?" (Zahleneingabe)
  - Anzeigebedingung: `istRaucher === 'ja'`
  - Pflichtbedingung: `istRaucher === 'ja'`

### Beispiel: Progressive Offenlegung

```
F1: "Bildungsniveau" (Einfachauswahl: Hauptschule, Bachelor, Master, Promotion)
F2: "Abschlussjahr" - Anzeige: bildungsNiveau !== 'Hauptschule'
F3: "Universitaetsname" - Anzeige: bildungsNiveau !== 'Hauptschule'
F4: "Forschungsgebiet" - Anzeige: bildungsNiveau === 'Promotion'
F5: "Dissertationstitel" - Anzeige: bildungsNiveau === 'Promotion'
```

### Seitenebenen-Bedingungen

Seiten unterstuetzen ebenfalls Anzeigebedingungen:

```typescript
{
  id: 'seite-3',
  name: 'Erweiterte Optionen',
  conditions: [
    { formula: 'zeigeErweiterteOptionen === true', target: 'show' }
  ]
}
```

Die gesamte Seite (mit allen Bloecken und Fragen) wird basierend auf der Bedingung angezeigt oder verborgen.

## 8.7 Der visuelle Ablauf-Editor

Der visuelle Ablauf-Editor bietet eine Knotengraph-Visualisierung der Ablaufstruktur des Fragebogens. Er basiert auf der Svelte-Flow-Bibliothek und rendert:

### Knotentypen

| Knoten | Farbe | Beschreibung |
|---|---|---|
| **Start** | -- | Einstiegspunkt des Fragebogens. |
| **Seite** | Blau | Repraesentiert eine Fragebogenseite. |
| **Block** | Blau | Repraesentiert einen Block innerhalb einer Seite. |
| **Frage** | Blau | Repraesentiert eine einzelne Frage. |
| **Verzweigung** | Orange | Ein bedingter Verzweigungspunkt. |
| **Schleife** | Orange | Eine Schleifensteuerung. |
| **Abbruch** | Orange | Ein Abbruchpunkt. |
| **Variable** | Gruen | Eine in Ablaufbedingungen referenzierte Variable. |
| **Ende** | -- | Ausgangspunkt des Fragebogens. |

### Kantentypen

- **Sequentielle Kanten** (durchgezogene Linien): Standard-Seite-zu-Seite- oder Block-zu-Block-Verbindungen.
- **Bedingte Kanten** (animierte gestrichelte Linien): Durch Ablaufsteuerungsregeln erstellte Verbindungen, beschriftet mit ihrer Bedingung.

### Funktionen

- **Schwenken und Zoomen**: Im Graphen mit Mausziehen und Scrollen navigieren.
- **Minikarte**: Ein kleiner Ueberblick in der Ecke zur Orientierung.
- **Steuerungen**: Vergroessern, Verkleinern, Ansicht anpassen und Sperren.
- **Auto-Layout**: Ordnet Knoten automatisch fuer bessere Lesbarkeit an.
- **Export**: Ablaufdiagramm als Bild fuer Dokumentation speichern.
- **Interaktive Verbindungen**: Neue Kanten zwischen Knoten zeichnen, um Ablaufsteuerungsregeln zu erstellen.
- **Legende**: Farbcodierte Legende der Knotenkategorien.

### Den visuellen Ablauf-Editor oeffnen

1. Oeffnen Sie das Ablaufsteuerungs-Panel (GitBranch-Icon in der linken Leiste).
2. Klicken Sie auf die Karten-Icon-Schaltflaeche in der Kopfzeile der Ablaufsteuerung.
3. Der Editor oeffnet sich in einem Vollbild-Modal.

## 8.8 Validierung

Der Ablaufsteuerungs-Manager validiert alle Ablaufsteuerungsregeln und zeigt Warnungen an:

| Validierung | Meldung |
|---|---|
| Fehlende Bedingung | "Fehlende Bedingung." |
| Skip/Branch ohne Ziel | "Skip/Branch-Ablaeufe erfordern ein Ziel." |
| Schleife ohne Iterationen | "Schleifen-Ablaeufe benoetigen mindestens 1 Iteration." |

Warnungen erscheinen als rote Badges auf den Ablaufsteuerungskarten. Ungueltige Ablaeufe werden weiterhin gespeichert, aber zur Laufzeit nicht ausgefuehrt.

## 8.9 Der Ablaufsteuerungs-Manager

Der Ablaufsteuerungs-Manager (erreichbar ueber das Ablauf-Panel in der linken Seitenleiste) bietet eine listenbasierte Oberflaeche zur Verwaltung von Ablaufsteuerungen.

### Eine Ablaufsteuerung hinzufuegen

1. Klicken Sie auf "Ablauf hinzufuegen" in der Panel-Kopfzeile.
2. Waehlen Sie im Modal den Ablauftyp:
   - **Ueberspringen**: Zu einer anderen Frage/Seite springen
   - **Verzweigung**: Bedingte Navigation
   - **Schleife**: Abschnitt wiederholen
   - **Abbruch**: Fragebogen beenden
3. Geben Sie die **Bedingung** ein (ein Formelausdruck mit Variablennamen und JavaScript-Operatoren).
4. Fuer Ueberspringen/Verzweigung: Waehlen Sie das **Ziel** aus dem Dropdown verfuegbarer Seiten und Fragen.
5. Fuer Schleife: Geben Sie die **maximalen Iterationen** ein.
6. Klicken Sie auf "Ablauf hinzufuegen".

### Bearbeiten und Loeschen

- Klicken Sie auf das Stift-Icon einer Ablaufkarte zum Bearbeiten.
- Klicken Sie auf das Papierkorb-Icon zum Loeschen.
- Der Ablauftyp kann nach der Erstellung nicht geaendert werden; loeschen und neu erstellen, um den Typ zu aendern.

## 8.10 Komplexe Logikbeispiele

### Beispiel 1: Screening mit mehreren Kriterien

Eine klinische Studie erfordert, dass Teilnehmer mehrere Eignungskriterien erfuellen:

```
Ablauf 1: type=terminate, condition=alter < 18 || alter > 65
Ablauf 2: type=terminate, condition=hatNeurologischeStoerung === true
Ablauf 3: type=terminate, condition=sehschaerfe < 20/40
Ablauf 4: type=branch, condition=medikamenteneinnahme === true, target=Seite "Medikamentendetails"
```

### Beispiel 2: Adaptiver Fragebogen mit Verzweigung

Eine Persoenlichkeitsbewertung passt ihre Tiefe basierend auf Erstantworten an:

```
Seite 1: Kurzes Persoenlichkeitsinventar (10 Items)
  -> Variablen: extraversionScore, neurotizismusScore, offenheitsScore

Ablauf: branch, condition=extraversionScore > 35, target=Seite "Extraversion Detailliert"
Ablauf: branch, condition=neurotizismusScore > 35, target=Seite "Neurotizismus Detailliert"
Ablauf: branch, condition=offenheitsScore > 35, target=Seite "Offenheit Detailliert"

Seite "Zusammenfassung": Ergebnisse und Feedback
```

### Beispiel 3: Experimentaldesign mit Schleifen und Bedingungen

Ein kognitionspsychologisches Experiment mit Uebung, Testbloecken und Between-Subjects-Bedingungen:

```
Seite "Anweisungen"
  Textanweisung: Aufgabenbeschreibung

Seite "Uebung"
  Block "Uebungsdurchgaenge" (Schleife, 5 Iterationen, Variable: durchgangNr)
    Reaktionszeitfrage mit Feedback
  Textanzeige: "Uebung abgeschlossen. Bereit fuer den Test?"

Seite "Testblock A" (Anzeigebedingung: experimentelleBedingung === 'A')
  Block "Stimulussatz A" (Schleife, 40 Iterationen, Variable: testDurchgang)
    Reaktionszeitfrage (ohne Feedback)

Seite "Testblock B" (Anzeigebedingung: experimentelleBedingung === 'B')
  Block "Stimulussatz B" (Schleife, 40 Iterationen, Variable: testDurchgang)
    Reaktionszeitfrage (ohne Feedback)

Seite "Feedback"
  Statistische Rueckmeldung: Teilnehmer vs. Kohortenvergleich
  Balkendiagramm: Genauigkeit nach Block

Ablauf: terminate, condition=aufeinanderfolgendeTimeouts >= 5
```

### Beispiel 4: Umfrage mit Piping und dynamischem Routing

Eine Kundenzufriedenheitsumfrage, die sich basierend auf Antworten anpasst:

```
F1: "Wie bewerten Sie unseren Service?" (Skala 1-10)
  -> Variable: serviceBewertung

F2: "Was koennten wir verbessern?" (Texteingabe)
  Anzeigebedingung: serviceBewertung <= 6

F3: "Was hat Ihnen am besten gefallen?" (Texteingabe)
  Anzeigebedingung: serviceBewertung >= 7

Ablauf: branch, condition=wuerdeEmpfehlen === 'ja' AND serviceBewertung >= 8
  Ziel: Seite "Empfehlungsprogramm"

Seite "Empfehlungsprogramm":
  Textanzeige: "Vielen Dank fuer Ihre Bewertung von {{serviceBewertung}}!"

Seite "Danke":
  Textanzeige: "Umfrage abgeschlossen. Vielen Dank, {{teilnehmerName}}!"
```

## 8.11 Empfohlene Vorgehensweisen

### Bedingungen einfach halten

- Verwenden Sie klare Variablennamen, die sich natuerlich lesen: `istErwachsen`, `hatEingewilligt`, `screeningBestanden`.
- Bevorzugen Sie einfache Vergleiche gegenueber komplexer verschachtelter Logik.
- Testen Sie Bedingungen mit dem Debug-Panel des Vorschaumodus.

### Zirkulaere Logik vermeiden

- Erstellen Sie niemals eine Verzweigung, die zu einer Seite zurueckfuehrt, die dieselbe Verzweigung ausloest.
- Verwenden Sie den visuellen Ablauf-Editor, um sicherzustellen, dass keine Endlosschleifen existieren.
- Der Abhaengigkeitsgraph im Variablen-Manager hilft, zirkulaere Variablenabhaengigkeiten zu identifizieren.

### Den Ablauf zuerst planen

- Skizzieren Sie den Fragebogenablauf auf Papier oder im visuellen Ablauf-Editor, bevor Sie einzelne Fragen erstellen.
- Identifizieren Sie alle Entscheidungspunkte und ihre Bedingungen im Voraus.
- Dokumentieren Sie die Ablauflogik in Variablenbeschreibungen.

### Gruendlich testen

- Verwenden Sie den Vorschaumodus mit dem Debug-Panel, um die Ablaufausfuehrung zu verfolgen.
- Testen Sie jeden Verzweigungspfad mit verschiedenen Antwortkombinationen.
- Ueberpruefen Sie, dass Abbruchbedingungen korrekt funktionieren.
- Stellen Sie sicher, dass die Skip-Logik nicht versehentlich erforderliche Fragen umgeht.

### Anzeigebedingungen fuer einfache Faelle verwenden

- Verwenden Sie zum Anzeigen/Verbergen einzelner Fragen innerhalb einer Seite bevorzugt Anzeigebedingungen statt Ablaufsteuerung.
- Reservieren Sie Skip/Branch fuer die Navigation zwischen Seiten oder Abschnitten.
- Anzeigebedingungen werden pro Frage ausgewertet; Ablaufsteuerungen werden pro Seitenuebergang ausgewertet.
