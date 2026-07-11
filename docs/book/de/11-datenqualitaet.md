# Kapitel 11: Datenqualitaet

Hochwertige Daten sind das Fundament glaubwuerdiger Forschung. QDesigner Modern bietet drei integrierte Datenqualitaetssysteme fuer Fragebogen-Antworten -- Aufmerksamkeitspruefungen, Speeder-Erkennung und Flatline-Erkennung -- die Antworten mit geringem Aufwand oder Bot-generierte Antworten in Echtzeit markieren. Fuer Reaktionsstudien kommt eine vierte, timing-spezifische Dimension hinzu: die **Timing-Validitaet**, die die Momente, in denen sich die Messbedingungen eines Geraets verschlechtern, aufzeichnet (statt sie zu verbergen). Dieses Kapitel behandelt Konfiguration, Erkennungsalgorithmen, das Timing-Validitaets-Modell, Qualitaetsberichte und Best Practices fuer die Integritaet von Forschungsdaten.

---

## 11.1 Ueberblick ueber Datenqualitaetsmechanismen

| Mechanismus           | Erkennt                                | Gilt fuer         | Implementierung                   |
|----------------------|----------------------------------------|-------------------|-----------------------------------|
| Aufmerksamkeitspruefungen | Unaufmerksames oder zufaelliges Antworten | Fragebogen    | `AttentionCheckValidator`     |
| Speeder-Erkennung     | Durcheilen von Seiten/Fragebogen       | Fragebogen        | `SpeederDetector`                 |
| Flatline-Erkennung    | Repetitive Antwortmuster               | Fragebogen        | `FlatlineDetector`                |
| Timing-Validitaet     | Verschlechterte Reaktionstiming-Bedingungen | Reaktionsstudien | Provenienz pro Trial (ADR 0027) |

Die ersten drei Systeme arbeiten unabhaengig voneinander auf Fragebogen-Antworten und erzeugen Qualitaetsflags, die fuer ein umfassendes Datenscreening kombiniert werden koennen. Die **Timing-Validitaet** ist grundlegend anderer Art: Sie beurteilt nicht den *Aufwand* des Teilnehmers, sondern die *Messbedingungen*, unter denen jeder Reaktions-Trial aufgezeichnet wurde, und standardmaessig **zeichnet sie auf und faehrt fort**, anstatt jemanden zu stoppen (siehe Abschnitt 11.9).

---

## 11.2 Aufmerksamkeitspruefungen

Aufmerksamkeitspruefungen sind eingebettete Fragen mit einer bekannten korrekten Antwort. QDesigner unterstuetzt zwei Typen.

### 11.2.1 Instruierte Antwort-Items

Ein instruiertes Antwort-Item teilt dem Teilnehmer explizit mit, welche Antwort zu waehlen ist:

> "Um zu zeigen, dass Sie aufmerksam lesen, waehlen Sie bitte 'Stimme voll zu' bei dieser Frage."

**Konfiguration:**

```typescript
{
  enabled: true,
  type: 'instructed',
  correctAnswer: 'Stimme voll zu'
}
```

Instruierte Antwort-Items sind die transparenteste Form der Aufmerksamkeitspruefung. Sie sind fuer aufmerksame Teilnehmer leicht zu bestehen, fangen aber diejenigen ab, die die Fragen nicht lesen.

### 11.2.2 Fallfragen (Trap Questions)

Fallfragen betten eine versteckte Pruefung in eine scheinbar regulaere Frage ein:

> "Ich bin in jedem Land der Welt gewesen." (Erwartete Antwort: Stimme nicht zu)

**Konfiguration:**

```typescript
{
  enabled: true,
  type: 'trap',
  correctAnswer: 'Stimme nicht zu'
}
```

Fallfragen sind subtiler als instruierte Antwort-Items und testen, ob Teilnehmer den Frageinhalt verarbeiten, anstatt einfach mechanisch Antworten auszuwaehlen.

### 11.2.3 Antwortabgleich-Logik

Der `AttentionCheckValidator` verwendet einen flexiblen Abgleichalgorithmus:

1. **Exakter Abgleich:** `actual === expected` (alle Typen).
2. **Gross-/Kleinschreibung-unabhaengiger String-Abgleich:** `String(actual).toLowerCase() === String(expected).toLowerCase()`.
3. **Loser Typabgleich:** Numerische Antworten werden vor dem Vergleich in Strings konvertiert (z.B. `5` entspricht `"5"`).
4. **Array-Vergleich:** Bei Mehrfachauswahl-Fragen werden Arrays sortiert und elementweise verglichen (Gross-/Kleinschreibung-unabhaengig).

### 11.2.4 Fehler-Schwellenwert

Der Validator wird mit einem **Fehler-Schwellenwert** initialisiert (Standard: 1). Wenn die Anzahl fehlgeschlagener Aufmerksamkeitspruefungen diesen Schwellenwert erreicht oder ueberschreitet, wird das `hasFailed`-Flag auf `true` gesetzt.

```typescript
const validator = new AttentionCheckValidator(fehlerSchwellenwert);
```

| Schwellenwert | Verhalten                                         |
|--------------|--------------------------------------------------|
| 1            | Markierung nach der ersten fehlgeschlagenen Pruefung (streng) |
| 2            | Ein Fehler erlaubt; Markierung nach zwei Fehlern   |
| 3            | Nachsichtig -- zwei Fehler erlaubt                 |

### 11.2.5 Validierungsergebnisse

Jede validierte Aufmerksamkeitspruefung erzeugt ein `AttentionCheckResult`:

```typescript
interface AttentionCheckResult {
  questionId: string;         // Welche Frage geprueft wurde
  passed: boolean;            // Ob die Antwort korrekt war
  expectedAnswer: unknown;    // Die korrekte Antwort
  actualAnswer: unknown;      // Was der Teilnehmer geantwortet hat
  type: 'instructed' | 'trap';
}
```

Zusammenfassende Eigenschaften:

| Eigenschaft     | Typ      | Beschreibung                              |
|----------------|----------|------------------------------------------|
| `failureCount`  | `number` | Anzahl fehlgeschlagener Pruefungen        |
| `passCount`     | `number` | Anzahl bestandener Pruefungen             |
| `totalChecks`   | `number` | Gesamtzahl ausgewerteter Pruefungen       |
| `hasFailed`     | `boolean`| Ob der Fehler-Schwellenwert erreicht wurde|

---

## 11.3 Speeder-Erkennung

Die Speeder-Erkennung identifiziert Befragte, die Seiten oder den gesamten Fragebogen zu schnell abschliessen, was auf geringe Bemuehung oder automatisierte Antworten hindeutet.

### 11.3.1 Funktionsweise

Der `SpeederDetector` verfolgt Timing auf Seitenebene:

1. Wenn ein Teilnehmer eine Seite betritt, zeichnet `enterPage(pageId)` den Zeitstempel auf.
2. Wenn der Teilnehmer die Seite verlaesst, zeichnet `leavePage()` den Zeitstempel auf und berechnet die Dauer.
3. Seiten, bei denen `duration < minPageTimeMs`, werden markiert.

### 11.3.2 Konfiguration

```typescript
interface SpeederConfig {
  minPageTimeMs: number;   // Mindest-ms pro Seite (Standard: 2000)
  minTotalTimeMs: number;  // Mindest-Gesamtzeit fuer den Fragebogen (Standard: 0 = deaktiviert)
}
```

**Seitenbezogener Schwellenwert (Standard: 2 Sekunden):**

Der Standard geht davon aus, dass das Lesen und Beantworten selbst einer einfachen Seite mindestens 2 Sekunden dauert. Forschende koennen dies je nach Inhalt anpassen:

| Seiteninhalt                     | Empfohlenes Minimum (ms) |
|---------------------------------|--------------------------|
| Einzelne Ja/Nein-Frage           | 1.500                    |
| 5-Item-Likert-Skala              | 5.000                    |
| Langer Textabschnitt             | 10.000                   |
| Reaktionszeit-Block              | Variiert nach Trial-Zahl |

**Gesamtzeit-Schwellenwert:**

Das Setzen von `minTotalTimeMs` aktiviert eine globale Pruefung. Wenn beispielsweise eine 50-Fragen-Umfrage mindestens 5 Minuten dauern soll:

```typescript
{ minTotalTimeMs: 300000 }  // 5 Minuten in ms
```

### 11.3.3 Seitentiming-Daten

Jeder Seitenbesuch erzeugt einen `PageTiming`-Datensatz:

```typescript
interface PageTiming {
  pageId: string;    // Seitenidentifier
  enteredAt: number; // Zeitstempel beim Betreten der Seite
  leftAt: number;    // Zeitstempel beim Verlassen der Seite
  duration: number;  // Auf der Seite verbrachte Zeit (ms)
}
```

### 11.3.4 Erkennungsergebnisse

| Eigenschaft          | Typ           | Beschreibung                               |
|---------------------|---------------|--------------------------------------------|
| `flaggedPages`       | `PageTiming[]`| Seiten unter der Mindestzeit               |
| `totalTime`          | `number`      | Gesamtzeit ueber alle Seiten (ms)          |
| `isTotalTimeFlagged` | `boolean`     | Ob die Gesamtzeit unter dem Minimum liegt  |
| `isFlagged`          | `boolean`     | Ob irgendeine Geschwindigkeitsueberschreitung erkannt wurde |
| `speedRatio`         | `number`      | Tatsaechliche Zeit / erwartetes Minimum (0-1) |

### 11.3.5 Geschwindigkeitsverhaeltnis

Das Geschwindigkeitsverhaeltnis liefert ein kontinuierliches Mass dafuer, wie schnell der Teilnehmer den Fragebogen relativ zum erwarteten Minimum abgeschlossen hat:

$$\text{speedRatio} = \min\left(1, \frac{\text{totalTime}}{\text{expectedMinTotal}}\right)$$

wobei `expectedMinTotal` entweder `minTotalTimeMs` (wenn gesetzt) oder `numPages * minPageTimeMs` ist. Ein Verhaeltnis von 0,5 bedeutet, dass der Teilnehmer in der Haelfte der erwarteten Mindestzeit abgeschlossen hat.

---

## 11.4 Flatline-Erkennung

Die Flatline-Erkennung identifiziert "Straight-Lining" -- Muster, bei denen Befragte wiederholt dieselbe Antwort auswaehlen oder mechanischen Mustern folgen, anstatt sich mit dem Frageinhalt auseinanderzusetzen.

### 11.4.1 Mustertypen

Der `FlatlineDetector` prueft auf drei verschiedene Muster:

#### Alle gleich (All Same)

Alle (oder nahezu alle) Antworten in einem Block sind identisch:

```
Antworten: 3, 3, 3, 3, 3, 3, 3, 3
Muster:    all_same
Anteil:    1.0 (100% Uebereinstimmung)
```

Der Uebereinstimmungsanteil wird berechnet als:

$$\text{matchRatio}_{\text{same}} = \frac{\text{Anzahl}(x_i = x_0)}{n}$$

#### Alternierend (Alternating)

Antworten folgen einem A-B-A-B-Muster:

```
Antworten: 1, 5, 1, 5, 1, 5, 1, 5
Muster:    alternating
Anteil:    1.0 (100% Uebereinstimmung)
```

Der Uebereinstimmungsanteil zaehlt Positionen, die dem erwarteten Wechsel entsprechen:

$$\text{matchRatio}_{\text{alt}} = \frac{\text{Anzahl}(x_i = \text{erwartet}_i)}{n}$$

wobei `erwartet_i = A` fuer gerade Indizes und `erwartet_i = B` fuer ungerade Indizes.

#### Sequentiell (Sequential)

Antworten folgen einem auf- oder absteigenden Muster (jeder Wert unterscheidet sich um genau 1):

```
Antworten: 1, 2, 3, 4, 5, 6, 7
Muster:    sequential
Anteil:    1.0 (100% aufeinanderfolgende Paare unterscheiden sich um 1)
```

Der Uebereinstimmungsanteil zaehlt aufeinanderfolgende Paare:

$$\text{matchRatio}_{\text{seq}} = \frac{\max(\text{aufsteigende Paare}, \text{absteigende Paare})}{n - 1}$$

### 11.4.2 Konfiguration

```typescript
interface FlatlineConfig {
  threshold: number;     // Markierung wenn Anteil >= diesem Wert (Standard: 0.8)
  minResponses: number;  // Mindestantworten vor Pruefung (Standard: 3)
}
```

**Schwellenwert (Standard: 0,80):**

Ein Schwellenwert von 0,80 bedeutet, dass 80% oder mehr der Antworten einem Muster entsprechen muessen, bevor es markiert wird. Dies verhindert falsch-positive Ergebnisse bei kurzen Bloecken, in denen Wiederholungen natuerlich sind.

**Mindestantworten (Standard: 3):**

Bloecke mit weniger als 3 Antworten werden nicht geprueft, da kurze Bloecke haeufig zufaellig wiederholte Antworten aufweisen.

### 11.4.3 Analysebereich

Die Flatline-Erkennung arbeitet auf **Block-Ebene**. Die Antworten jedes Blocks werden unabhaengig analysiert:

```typescript
detector.analyzeBlock("block-persoenlichkeit", [3, 3, 3, 3, 3, 3, 3]);
detector.analyzeBlock("block-zufriedenheit", [1, 2, 3, 4, 5, 6, 7]);
```

Nur skalare Werte (Zahlen und Strings) werden analysiert. Null, undefined und Objektwerte werden uebersprungen.

### 11.4.4 Erkennungsergebnisse

Jedes erkannte Muster erzeugt ein `FlatlineResult`:

```typescript
interface FlatlineResult {
  blockId: string;       // Welcher Block markiert wurde
  pattern: PatternType;  // 'all_same' | 'alternating' | 'sequential'
  matchRatio: number;    // Anteil uebereinstimmender Antworten (0-1)
  values: unknown[];     // Die analysierten Antwortwerte
}
```

Zusammenfassende Eigenschaften:

| Eigenschaft      | Typ        | Beschreibung                           |
|-----------------|------------|---------------------------------------|
| `isFlagged`      | `boolean`  | Ob ein Block erkannte Muster aufweist |
| `flaggedBlocks`  | `string[]` | Block-IDs mit erkannten Mustern       |

---

## 11.5 Konfiguration der Datenqualitaet im Designer

### 11.5.1 Aufmerksamkeitspruefung konfigurieren

1. Waehlen Sie im Fragebogen-Designer eine Frage als Aufmerksamkeitspruefung aus.
2. Erweitern Sie im Panel **Fragen-Eigenschaften** den Abschnitt **Datenqualitaet**.
3. Aktivieren Sie **Aufmerksamkeitspruefung**.
4. Waehlen Sie den Typ: **Instruierte Antwort** oder **Fallfrage**.
5. Geben Sie die **Korrekte Antwort** ein, die aufmerksame Teilnehmer geben sollten.
6. Setzen Sie in den **Fragebogen-Einstellungen** den **Fehler-Schwellenwert** (wie viele Pruefungen fehlschlagen duerfen, bevor markiert wird).

### 11.5.2 Speeder-Erkennung konfigurieren

1. Oeffnen Sie **Fragebogen-Einstellungen** > **Datenqualitaet**.
2. Aktivieren Sie **Speeder-Erkennung**.
3. Setzen Sie die **Mindest-Seitenzeit** (Standard: 2.000 ms).
4. Optional: Setzen Sie eine **Mindest-Gesamtzeit** fuer den gesamten Fragebogen.

### 11.5.3 Flatline-Erkennung konfigurieren

1. Oeffnen Sie **Fragebogen-Einstellungen** > **Datenqualitaet**.
2. Aktivieren Sie **Flatline-Erkennung**.
3. Setzen Sie den **Musteruebereinstimmungs-Schwellenwert** (Standard: 0,80).
4. Setzen Sie die **Mindestantworten pro Block** fuer die Pruefung (Standard: 3).

---

## 11.6 Qualitaetsberichte und Flags

### 11.6.1 Qualitaetsbericht pro Teilnehmer

Nach Abschluss des Fragebogens generiert QDesigner einen Qualitaetsbericht:

| Abschnitt               | Daten                                           |
|------------------------|-------------------------------------------------|
| Aufmerksamkeitspruefungen | Bestanden/Fehlgeschlagen pro Pruefung, Gesamtstatistik |
| Speeder-Erkennung       | Seitenzeiten, markierte Seiten, Geschwindigkeitsverhaeltnis |
| Flatline-Erkennung      | Musteranalyse pro Block, markierte Bloecke       |
| Gesamtqualitaets-Flag   | Kombiniertes Bestanden/Fehlgeschlagen             |

### 11.6.2 Gesamtqualitaetsklassifikation

Das Gesamtqualitaets-Flag kombiniert alle drei Mechanismen:

| Klassifikation | Kriterien                                                          |
|---------------|-------------------------------------------------------------------|
| **Bestanden**  | Keine Aufmerksamkeitspruefungs-Fehler UND keine Speeder-Flags UND keine Flatline-Flags |
| **Warnung**    | Ein Mechanismus markiert (grenzwertige Qualitaet)                  |
| **Fehlgeschlagen** | Zwei oder mehr Mechanismen markiert, oder Aufmerksamkeits-Schwellenwert ueberschritten |

### 11.6.3 Qualitaets-Dashboard

Das Analytics-Dashboard zeigt aggregierte Qualitaetsmetriken:

- **Aufmerksamkeitspruefungs-Bestehensrate** ueber alle Teilnehmer
- **Speeder-Rate** (Prozentsatz markierter Teilnehmer)
- **Flatline-Rate** (Prozentsatz der Teilnehmer mit erkannten Mustern)
- **Gesamtdatenqualitaetsrate** (Prozentsatz, der alle Pruefungen besteht)

---

## 11.7 Filterung nach Qualitaet in der Analyse

### 11.7.1 Ausschlussstrategien

| Strategie             | Vorgehen                                    | Anwendungsfall              |
|----------------------|--------------------------------------------|-----------------------------|
| Strikter Ausschluss   | Alle markierten Teilnehmer entfernen        | Konfirmatorische Forschung  |
| Schwellenwertbasiert  | Nur mehrfach markierte entfernen            | Standardforschung           |
| Sensitivitaetsanalyse | Mit und ohne markierte Daten analysieren    | Robustheitspruefung         |
| Gewichtung            | Markierte Antworten heruntergewichten       | Explorative Forschung       |

### 11.7.2 Export mit Qualitaetsflags

Alle Exportformate (CSV, Excel, SPSS, R usw.) enthalten Qualitaetsflag-Spalten:

| Spalte                      | Typ     | Werte                      |
|----------------------------|---------|----------------------------|
| `attention_check_passed`    | boolean | true/false                 |
| `attention_check_count`     | integer | Anzahl der Pruefungen      |
| `attention_check_failures`  | integer | Anzahl der Fehler          |
| `speeder_flagged`           | boolean | true/false                 |
| `speed_ratio`               | float   | 0,0 - 1,0                 |
| `flatline_flagged`          | boolean | true/false                 |
| `flatline_patterns`         | string  | Kommagetrennte Muster      |
| `overall_quality`           | string  | "pass" / "warning" / "fail"|

Bei **Reaktionsstudien** wird die Timing-Validitaet auf *Trial*-Ebene gefuehrt, nicht auf Teilnehmerebene, sodass sie im Export pro Trial ("tidy") erscheint und nicht in diesen Teilnehmerspalten. Jede Trial-Zeile enthaelt `invalid`, `invalid_reason`, `exclude_from_analysis` und `exclude_reason` sowie die Timing-Provenienz-Felder (`cross_origin_isolated`, Timer-Aufloesung, gemessene Bildwiederholrate, verworfene Frames, Jitter). Siehe Kapitel 10, Abschnitt 10.9, fuer den vollstaendigen Spaltensatz pro Trial und Abschnitt 11.9 fuer die Bedeutung der Validitaets-Stempel.

---

## 11.8 Best Practices fuer Forschungsdatenqualitaet

### 11.8.1 Platzierung von Aufmerksamkeitspruefungen

- Platzieren Sie Aufmerksamkeitspruefungen **nach** dem ersten inhaltlichen Block (nicht ganz am Anfang, wenn die Teilnehmer noch engagiert sind).
- Verteilen Sie Pruefungen **gleichmaessig** ueber den Fragebogen (z.B. eine pro Block oder eine alle 10-15 Fragen).
- Verwenden Sie **2-3 Aufmerksamkeitspruefungen** fuer eine typische 50-Fragen-Umfrage.
- Verwenden Sie eine **Mischung** aus instruierten Antwort-Items und Fallfragen, um verschiedene Arten von Unaufmerksamkeit zu erkennen.

### 11.8.2 Speeder-Schwellenwerte

- **Pilotieren** Sie Ihren Fragebogen mit aufmerksamen Befragten, um realistische Mindestzeiten festzulegen.
- Setzen Sie Seitenminima konservativ -- sie sollten nur eindeutig unmoeglich schnelle Antworten erkennen, nicht schnelle-aber-legitime Befragte.
- Betrachten Sie die **Geschwindigkeitsverhaeltnis**-Verteilung ueber Teilnehmer statt eines binaeren Cutoffs.

### 11.8.3 Flatline-Schwellenwerte

- Ein Schwellenwert von **0,80** (Standard) funktioniert gut fuer Bloecke mit 5+ Items auf einer Likert-Skala.
- Fuer Bloecke mit **binaeren Items** (Ja/Nein) erhoehen Sie den Schwellenwert auf 0,90 oder verwenden Sie nur die alternierenden/sequentiellen Pruefungen.
- Fuer Bloecke mit **wenigen Items** (3-4) erwaegen Sie, `minResponses` zu erhoehen, um falsch-positive Ergebnisse zu vermeiden.

### 11.8.4 Qualitaet berichten

In Forschungspublikationen berichten Sie:

1. **Welche Qualitaetsmechanismen** verwendet wurden und deren Konfiguration.
2. **Wie viele Teilnehmer** von jedem Mechanismus markiert wurden.
3. **Ausschlusskriterien** (welche Flags zum Ausschluss fuehrten).
4. **Sensitivitaetsanalysen**, die zeigen, dass die Ergebnisse robust gegenueber Ein-/Ausschluss von Grenzfaellen sind.

### 11.8.5 Ethische Ueberlegungen

- **Informieren Sie die Teilnehmer** in der Einwilligungserklaerung, dass die Antwortqualitaet ueberwacht wird.
- **Verwenden Sie Qualitaetsflags nicht bestrafend** (z.B. verweigern Sie keine Verguetung allein aufgrund fehlgeschlagener Aufmerksamkeitspruefungen).
- **Bedenken Sie, warum** Teilnehmer Qualitaetspruefungen nicht bestehen koennten -- Umfragemuedigkeit, Barrierefreiheitsprobleme oder Sprachbarrieren koennen Ursachen jenseits von Unaufmerksamkeit sein.

---

## 11.9 Timing-Validitaet fuer Reaktionsstudien

Aufmerksamkeitspruefungen, Speeder-Erkennung und Flatline-Erkennung beurteilen, ob ein *Teilnehmer* sich mit dem Inhalt auseinandergesetzt hat. Reaktionsstudien benoetigen etwas anderes: eine Aufzeichnung darueber, ob sich das *Geraet* in einem Zustand befand, in dem seinen Timing-Messungen vertraut werden kann. Ein in den Hintergrund gerueckter Tab, eine nicht cross-origin-isolierte Seite, ein gedrosselter Timer oder ein verlorener Grafikkontext verschlechtern allesamt das Timing -- und, entscheidend, sie sind **messbar, stempelbar und nachtraeglich ausschliessbar**. Die Haltung der Plattform ihnen gegenueber ist daher, aufzuzeichnen, nicht zu stoppen.

### 11.9.1 Die ValidityPolicy: standardmaessig aufzeichnen

Die **ValidityPolicy** einer Studie steuert die Reaktion auf verschlechtertes Timing (ADR 0027). Zwei Haltungen sind definiert:

- **`record`** (der Standard) -- wenn sich das Timing mitten in der Studie verschlechtert, traegt der betroffene Trial explizite Provenienz, die Analytics stellt dies deutlich heraus, und **der Teilnehmer wird nie gestoppt**.
- **`enforce`** -- die per Opt-in aktivierbare Eskalation fuer maximal timing-kritische Studien: Reaktionsbloecke verweigern ohne Cross-Origin-Isolation die Ausfuehrung, und ein Sichtbarkeitsverlust bricht den laufenden Trial ab (markiert und am Blockende erneut eingereiht innerhalb eines begrenzten Wiederholungslimits).

Dies ist das bewusste Spiegelbild des Medienvertrags aus Kapitel 10: **Fehlende Daten schlagen fail-closed fehl; verschlechtertes Timing zeichnet auf und faehrt fort.** Das Fehlen von Medien veraendert, was der Teilnehmer tatsaechlich erlebt hat, und laesst sich nachtraeglich nicht korrigieren, sodass ein Block mit fehlenden Stimuli den Start verweigert. Timing-Verschlechterung hingegen ist messbar und nachtraeglich ausschliessbar, und ein standardmaessiger Hard-Stop wuerde Studien wegen routinemaessiger betrieblicher Stoerungen unbrauchbar machen und Teilnehmer fuer einen Deployment-Fehler bestrafen -- deshalb ist `record`, nicht `enforce`, der Standard.

**Eine Richtlinie waehlen.** Die Richtlinie ist ein Auswahlfeld unter **Fragebogen-Einstellungen → Timing-Validitaet** ("Wenn sich praezises Timing verschlechtert"): *Aufzeichnen und fortfahren (empfohlen)* oder *Erzwingen -- bei verschlechtertem Timing verweigern oder abbrechen*. Fehlt die Einstellung, ist eine Studie `record`. Belassen Sie sie fuer gewoehnliche Studien auf `record`; greifen Sie nur dann zu `enforce`, wenn eine vertrauenswuerdige Latenzmessung der eigentliche Zweck der Studie ist und ein verschlechterter Trial wertlos waere. Die Geraetequalifizierung warnt den Teilnehmer unabhaengig von der Richtlinie weiterhin sanft (eine gelbe/rote Bewertung), wenn die Isolation fehlt oder der Jitter hoch ist.

**Unter `enforce` greifen zwei Schutzmechanismen.** Erstens ein *Pre-Session-Gate*: Kann der Browser oder Server keine Cross-Origin-Isolation bereitstellen -- die Bedingung, die die Timer-Aufloesung begrenzt --, verweigert eine timing-kritische Studie den Start und zeigt einen eigenen Bildschirm "Praezises Timing erforderlich". Dies geschieht **bevor eine Sitzung existiert**, sodass ein Teilnehmer auf einem nicht unterstuetzbaren Setup abgewiesen statt als verschlechterter Abschluss aufgezeichnet wird; eine `record`-Studie startet auf demselben Setup normal. Zweitens eine *Sichtbarkeitswache mitten im Trial*: Wechselt der Teilnehmer waehrend eines Trials den Tab oder verliert den Fokus, wird dieser Trial abgebrochen (gestempelt mit `invalidated: 'visibility'`), die Aufgabe pausiert auf einer "Zurueck zur Studie"-Einblendung, bis er zurueckkehrt, und der abgebrochene Trial wird ans Blockende neu eingereiht. Das Neueinreihen ist auf **drei pro Block** begrenzt; ein Trial, der jenseits dieses Limits erneut abbricht, wird als invalidiert-und-verloren aufgezeichnet, statt endlos wiederholt zu werden. Die Trial-Provenienz zeichnet die abgebrochenen Versuche, die Wiederholungen und die Requeue-Zaehlungen pro Block auf, sodass Analysten genau sehen, was geschehen ist. Unter `record` wird nichts davon ausgeloest -- dieselben Ereignisse werden gestempelt und der Teilnehmer faehrt fort.

### 11.9.2 Was der record-Modus stempelt

Unter `record` traegt jeder Reaktions-Trial gemessene Provenienz (persistiert zusammen mit den Trial-Daten -- siehe Kapitel 10, Abschnitt 10.9). Die Timing-Validitaets-Felder sind:

| Provenienz-Feld | Bedeutung |
|---|---|
| `crossOriginIsolated` | Ob die Seite waehrend des Trials cross-origin-isoliert war. Bei `false` wird `performance.now()` begrenzt (in Richtung ~100 µs statt ~5 µs) und die Sub-Millisekunden-Aussage verschlechtert sich unbemerkt -- daher wird das Flag bei jedem Trial aufgezeichnet. |
| `timerResolutionMs` | Das gemessene effektive `performance.now()`-Quantum -- das kleinste positive Delta zwischen zwei Messwerten in einer engen Schleife (~0,005 ms bei Isolation; sonst begrenzt in Richtung ~0,1 ms). |
| `measuredRefreshRateHz` | Die aus der beobachteten Kadenz des Renderers gemessene Bildwiederholrate des Displays, verwendet fuer ehrliches Zaehlen verworfener Frames -- keine nominelle Ziel-FPS. |
| `invalidated` | Gesetzt, wenn dem Timing des Trials nicht vertraut werden kann; bei einem sauberen Trial nicht vorhanden. |
| `visibilityLossCount`, `visibilityLossPhases` | Wie oft und in welcher Phase der Tab waehrend des Trials den Fokus verloren hat. |

### 11.9.3 Was die `invalidated`-Werte bedeuten

Der `invalidated`-Stempel nimmt einen von zwei Gruenden an, jeder mit einer eigenen analytischen Bedeutung:

- **`visibility`** -- der Tab wurde in den Hintergrund gerueckt oder verlor waehrend des Trials den Fokus. Hintergrund-Tabs drosseln Timer und stoppen Animation Frames, sodass sich eine Phase aufblaehen kann, ein Stimulus ungesehen "angezeigt" werden kann und der Onset gegen ein veraltetes Frame gestempelt werden kann. Der Trial wird dennoch abgeschlossen und zeichnet seine RT auf, aber diese RT kann unzuverlaessig sein.
- **`no-stimulus`** -- ein visueller Stimulus erreichte den Renderer nie, sodass der Onset nie gegen echte Pixel scharfgeschaltet wurde. Jede RT hier wuerde gegen einen leeren Bildschirm gemessen; der Trial wird als ungueltig markiert statt getimt (dies ist die doppelt abgesicherte Rueckfallebene hinter dem fail-closed Mediengate aus Abschnitt 10.8).

Fuer die Analyse wird ein `invalidated`-Trial (und jeder antizipatorische Fehlstart) in der Spalte `exclude_from_analysis` des tidy-Exports mit einem maschinenlesbaren `exclude_reason` markiert, sodass eine nachgelagerte Reanalyse ihn **nachvollziehbar statt stillschweigend** verwerfen kann. Das Analytics-Dashboard stellt die Anzahl der wegen Sichtbarkeit ungueltig gewordenen Trials deutlich heraus, anstatt sie in die Aggregate einzurechnen. Siehe **Kapitel 12 (Analytics und Statistik)** dazu, wie ausgeschlossene Trials aus berichteten Mittelwerten, Medianen und Effektstaerken herausgehalten werden.

### 11.9.4 Ausliefern fuer volle Timer-Aufloesung

Da `crossOriginIsolated` das Timer-Quantum steuert, sollte eine timing-kritische Studie mit den Cross-Origin-Isolation-Headern (COOP/COEP) ausgeliefert werden. Verifizieren Sie dies, indem Sie pruefen, dass `crossOriginIsolated` in der aufgezeichneten Provenienz realer Sitzungen `true` ist. Ohne Isolation wird das Timing weiterhin aufgezeichnet und ist fuer relative Vergleiche nutzbar, aber die effektive Aufloesung wird begrenzt und jeder Trial wird entsprechend markiert.

---

## 11.10 Zusammenfassung

| Mechanismus           | Was erkannt wird          | Schluesselkonfiguration    | Standard           |
|----------------------|--------------------------|---------------------------|--------------------|
| Aufmerksamkeitspruefung | Unaufmerksame Antworten | `correctAnswer`, `type`   | Schwellenwert = 1  |
| Speeder-Erkennung     | Durcheilen der Umfrage   | `minPageTimeMs`           | 2.000 ms           |
| Flatline-Erkennung    | Repetitive Muster        | `threshold`               | 0,80               |
| Timing-Validitaet     | Verschlechtertes Reaktionstiming | ValidityPolicy    | `record` (stempeln & fortfahren) |
| Qualitaetsbericht     | Kombinierte Bewertung    | Alle Mechanismen          | Pro Teilnehmer     |
| Export-Flags          | Analysebereite Spalten   | In allen Formaten enthalten | Automatisch      |
