# Kapitel 11: Datenqualitaet

Hochwertige Daten sind das Fundament glaubwuerdiger Forschung. QDesigner Modern bietet drei integrierte Datenqualitaetssysteme -- Aufmerksamkeitspruefungen, Speeder-Erkennung und Flatline-Erkennung -- die Antworten mit geringem Aufwand oder Bot-generierte Antworten in Echtzeit markieren. Dieses Kapitel behandelt Konfiguration, Erkennungsalgorithmen, Qualitaetsberichte und Best Practices fuer die Integritaet von Forschungsdaten.

---

## 11.1 Ueberblick ueber Datenqualitaetsmechanismen

| Mechanismus           | Erkennt                                | Implementierung                   |
|----------------------|----------------------------------------|-----------------------------------|
| Aufmerksamkeitspruefungen | Unaufmerksames oder zufaelliges Antworten | `AttentionCheckValidator`     |
| Speeder-Erkennung     | Durcheilen von Seiten/Fragebogen       | `SpeederDetector`                 |
| Flatline-Erkennung    | Repetitive Antwortmuster               | `FlatlineDetector`                |

Alle drei Systeme arbeiten unabhaengig voneinander und erzeugen Qualitaetsflags, die fuer ein umfassendes Datenscreening kombiniert werden koennen.

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

## 11.9 Zusammenfassung

| Mechanismus           | Was erkannt wird          | Schluesselkonfiguration    | Standard           |
|----------------------|--------------------------|---------------------------|--------------------|
| Aufmerksamkeitspruefung | Unaufmerksame Antworten | `correctAnswer`, `type`   | Schwellenwert = 1  |
| Speeder-Erkennung     | Durcheilen der Umfrage   | `minPageTimeMs`           | 2.000 ms           |
| Flatline-Erkennung    | Repetitive Muster        | `threshold`               | 0,80               |
| Qualitaetsbericht     | Kombinierte Bewertung    | Alle drei Mechanismen     | Pro Teilnehmer     |
| Export-Flags          | Analysebereite Spalten   | In allen Formaten enthalten | Automatisch      |
