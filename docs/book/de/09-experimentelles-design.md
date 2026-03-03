# Kapitel 9: Experimentelles Design

Rigoroses experimentelles Design bildet das Fundament kausaler Schlussfolgerungen. QDesigner Modern stellt eine umfassende Sammlung von Werkzeugen zur Verfuegung, um Between-Subjects-, Within-Subjects- und gemischte Designs direkt innerhalb Ihres Fragebogens umzusetzen -- ohne externe Randomisierungssoftware. Dieses Kapitel behandelt Zuweisungsstrategien, Counterbalancing-Algorithmen, Blockrandomisierung, faktorielle Designs und reproduzierbare Randomisierung mit Seeds.

---

## 9.1 Between-Subjects-Designs

In einem Between-Subjects-Design (oder Unabhaengige-Gruppen-Design) wird jeder Teilnehmer genau einer experimentellen Bedingung zugewiesen. QDesigner implementiert die Bedingungszuweisung ueber die Klasse `ConditionAssigner`, die drei konfigurierbare Strategien unterstuetzt.

### 9.1.1 Bedingungen definieren

Jede Bedingung wird mit einem **Namen** und einer **Gewichtung** definiert. Die Gewichtung steuert, wie die Zufallsstrategie Teilnehmer zuordnet; bei sequentieller und balancierter Strategie werden Gewichtungen ignoriert.

| Eigenschaft | Typ      | Beschreibung                                    |
|-------------|----------|------------------------------------------------|
| `name`      | `string` | Lesbares Label (z.B. "Kontrolle", "Behandlung A") |
| `weight`    | `number` | Relative Zuweisungsgewichtung (Standard: 1)     |

**Beispiel -- einfaches Zwei-Gruppen-Design:**

```
Bedingungen:
  1. Kontrolle    (Gewichtung: 1)
  2. Behandlung   (Gewichtung: 1)
```

**Beispiel -- ungleiche Zuweisung (2:1):**

```
Bedingungen:
  1. Behandlung   (Gewichtung: 2)
  2. Kontrolle    (Gewichtung: 1)
```

### 9.1.2 Zuweisungsstrategien

QDesigner bietet drei Zuweisungsstrategien, die im Panel "Experimentelles Design" des Designers ausgewaehlt werden koennen.

#### Zufaellige Zuweisung

```
Strategie: random
```

Jeder Teilnehmer wird einer Bedingung auf Basis gewichteter Zufallsstichproben zugewiesen. Bei gleichen Gewichtungen hat jede Bedingung die gleiche Wahrscheinlichkeit. Bei unterschiedlichen Gewichtungen betraegt die Zuweisungswahrscheinlichkeit fuer Bedingung *i*:

$$P(C_i) = \frac{w_i}{\sum_{j=1}^{k} w_j}$$

Der Zufallszahlengenerator wird deterministisch mit `seed + participantNumber` initialisiert, sodass derselbe Teilnehmer bei gegebenem Seed stets dieselbe Zuweisung erhaelt (siehe Abschnitt 9.6).

#### Sequentielle Zuweisung (Round-Robin)

```
Strategie: sequential
```

Teilnehmer werden in Round-Robin-Reihenfolge durch die Bedingungen zugewiesen:

$$\text{conditionIndex} = \text{participantNumber} \bmod k$$

wobei *k* die Anzahl der Bedingungen ist. Dies garantiert exakt gleiche Gruppengroessen, wenn die Gesamtstichprobe ein Vielfaches von *k* ist. Gewichtungen werden ignoriert.

#### Balancierte Zuweisung

```
Strategie: balanced
```

Jeder neue Teilnehmer wird der Bedingung mit den wenigsten bisherigen Teilnehmern zugewiesen. Bei Gleichstand wird zuerst nach hoeherer Gewichtung, dann nach niedrigerem Index entschieden. Diese Strategie erfordert die Uebergabe der aktuellen Gruppenzaehler und erzeugt die gleichmaessigste Verteilung in Echtzeit.

| Strategie    | Gleiche Gruppen | Gewichtungen | Deterministisch | Zaehler noetig |
|-------------|----------------|-------------|----------------|---------------|
| Random       | Ungefaehr       | Ja           | Mit Seed        | Nein           |
| Sequential   | Exakt (mod k)   | Nein         | Ja              | Nein           |
| Balanced     | Optimal         | Nur Tiebreak | Ja              | Ja             |

### 9.1.3 Ein Between-Subjects-Design einrichten

1. Oeffnen Sie das **Experimentelles Design**-Panel in der Designer-Seitenleiste.
2. Klicken Sie auf **Bedingung hinzufuegen** und definieren Sie Ihre Bedingungen (Name und Gewichtung).
3. Waehlen Sie eine **Zuweisungsstrategie** aus dem Dropdown.
4. Optional: Setzen Sie einen **Seed** fuer reproduzierbare Randomisierung.
5. Verwenden Sie die **bedingungsbasierte Sichtbarkeit** bei Bloecken, um unterschiedliche Inhalte pro Bedingung anzuzeigen (siehe Abschnitt 9.5).

---

## 9.2 Within-Subjects-Designs

In einem Within-Subjects-Design (oder Messwiederholungs-Design) durchlaufen alle Teilnehmer saemtliche Bedingungen, wobei die Reihenfolge der Bedingungen ueber Teilnehmer hinweg variiert, um Reihenfolge- und Uebertragungseffekte zu kontrollieren. QDesigner bietet drei Counterbalancing-Strategien.

### 9.2.1 Lateinisches Quadrat

Ein Standard-Lateinisches-Quadrat der Groesse *n* erzeugt *n* eindeutige Reihenfolgen, wobei jede Bedingung genau einmal an jeder Position erscheint. QDesigner generiert das Quadrat mittels zyklischer Rotation:

$$\text{Quadrat}[i][j] = (i + j) \bmod n$$

**Beispiel -- 3 Bedingungen (A, B, C):**

| Teilnehmergruppe | Reihenfolge |
|------------------|-------------|
| 0                | A, B, C     |
| 1                | B, C, A     |
| 2                | C, A, B     |

Jede Bedingung erscheint genau einmal an jeder Position (erste, zweite, dritte). Teilnehmer werden den Zeilen mittels `participantNumber mod n` zugewiesen.

**Einschraenkung:** Ein Standard-Lateinisches-Quadrat garantiert keine First-Order-Balance -- das heisst, nicht jede Bedingung folgt notwendigerweise gleich haeufig auf jede andere Bedingung.

### 9.2.2 Balanciertes Lateinisches Quadrat (Williams-Design)

Fuer First-Order-Balance (jede Bedingung folgt jeder anderen Bedingung genau einmal) verwendet QDesigner den Williams-Design-Algorithmus:

**Fuer gerades *n*:** Erzeugt *n* Zeilen. Zeile *i* wird wie folgt konstruiert:
- Position 0: *i*
- Position *j* (j >= 1):
  - Wenn *j* ungerade: *(i + ceil(j/2)) mod n*
  - Wenn *j* gerade: *(i + n - floor(j/2)) mod n*

**Fuer ungerades *n*:** Der Algorithmus erzeugt *n* Zeilen und haengt dann *n* gespiegelte Zeilen an (jeder Wert wird auf *n - 1 - Wert* abgebildet), was insgesamt *2n* Reihenfolgen ergibt.

**Beispiel -- 4 Bedingungen (gerades n):**

| Teilnehmergruppe | Reihenfolge    |
|------------------|----------------|
| 0                | 0, 1, 3, 2    |
| 1                | 1, 2, 0, 3    |
| 2                | 2, 3, 1, 0    |
| 3                | 3, 0, 2, 1    |

In diesem Design folgt jede Bedingung jeder anderen Bedingung genau einmal ueber alle Zeilen hinweg.

### 9.2.3 Volles Counterbalancing

Volles Counterbalancing generiert alle *n!* Permutationen der Bedingungen. Dies ist nur bei kleinen Bedingungszahlen praktikabel:

| Bedingungen | Permutationen |
|------------|--------------|
| 2           | 2            |
| 3           | 6            |
| 4           | 24           |
| 5           | 120          |
| 6           | 720          |
| 7           | 5.040        |
| 8           | 40.320       |

QDesigner erzwingt eine Sicherheitsgrenze von *n <= 8*, um Speicherprobleme zu vermeiden. Bei 8 Bedingungen benoetigen Sie mindestens 40.320 Teilnehmer, um jede Permutation einmal abzudecken.

### 9.2.4 Wahl der Counterbalancing-Strategie

| Strategie                   | First-Order-Balance | Anzahl Reihenfolgen | Empfohlen fuer                   |
|----------------------------|--------------------|--------------------|----------------------------------|
| Keine                       | Nein               | 1                   | Feste Reihenfolge (Pilotstudien) |
| Lateinisches Quadrat        | Nein               | *n*                 | Positionsbalance, viele Bedingungen |
| Balanciertes Lat. Quadrat   | Ja                 | *n* (gerade) / *2n* (ungerade) | Sequenzbalance, Standard |
| Volles Counterbalancing     | Ja (komplett)      | *n!*                | Kleines *n*, maximale Kontrolle   |

---

## 9.3 Blockrandomisierung

Die Blockrandomisierung steuert die Reihenfolge, in der Bloecke (Fragengruppen) den einzelnen Teilnehmern praesentiert werden. Dies ist zu unterscheiden vom Counterbalancing, das die Reihenfolge der *Bedingungen* steuert; die Blockrandomisierung mischt die Reihenfolge der *Bloecke* innerhalb einer Bedingung.

### 9.3.1 Standard-Blockrandomisierung

Bei Aktivierung werden alle Bloecke im Fragebogen (oder innerhalb einer Bedingung) in eine zufaellige Reihenfolge gebracht, wobei der gesetzte PRNG des Teilnehmers verwendet wird. Dies stellt sicher, dass jeder Teilnehmer dieselben Bloecke in einer anderen Reihenfolge sieht.

### 9.3.2 Ersten / Letzten Block beibehalten

Forschende muessen haeufig bestimmte Bloecke an festen Positionen halten:

- **Ersten beibehalten:** Der erste Block (z.B. Einwilligungserklaerung, Demografie) erscheint stets zuerst; die uebrigen Bloecke werden randomisiert.
- **Letzten beibehalten:** Der letzte Block (z.B. Debriefing, Abschlussfragen) erscheint stets zuletzt; alle anderen Bloecke werden randomisiert.
- **Beide beibehalten:** Erster und letzter Block sind fixiert; nur die dazwischenliegenden Bloecke werden gemischt.

### 9.3.3 Konfiguration

Oeffnen Sie im Designer das Panel **Block-Einstellungen**:

1. Aktivieren Sie **Blockreihenfolge randomisieren**.
2. Waehlen Sie die **Beibehalten**-Option (Erster, Letzter, Beide oder Keine).
3. Die Randomisierung respektiert den Seed des Teilnehmers fuer Reproduzierbarkeit.

---

## 9.4 Bedingungsbasierte Blocksichtbarkeit

In Between-Subjects-Designs soll typischerweise jede Bedingung nur ihre relevanten Bloecke sehen. QDesigners System fuer bedingungsbasierte Sichtbarkeit ermoeglicht es, Sichtbarkeitsregeln an beliebige Bloecke anzuhaengen:

1. Waehlen Sie einen Block im Designer aus.
2. Im Panel **Block-Eigenschaften** finden Sie **Sichtbarkeitsbedingungen**.
3. Waehlen Sie **Diesen Block nur fuer Bedingung anzeigen:** und selektieren Sie eine oder mehrere Bedingungen.

Wenn ein Teilnehmer einer Bedingung zugewiesen wird, werden nur Bloecke angezeigt, deren Sichtbarkeit diese Bedingung einschliesst (oder Bloecke ohne Sichtbarkeitseinschraenkung).

**Beispiel -- 2x2-Faktoriell mit Bloecken:**

```
Block: Einwilligung           (sichtbar: alle Bedingungen)
Block: Demografie              (sichtbar: alle Bedingungen)
Block: Behandlung_A_Hoch       (sichtbar: Bedingung "A-Hoch")
Block: Behandlung_A_Niedrig    (sichtbar: Bedingung "A-Niedrig")
Block: Behandlung_B_Hoch       (sichtbar: Bedingung "B-Hoch")
Block: Behandlung_B_Niedrig    (sichtbar: Bedingung "B-Niedrig")
Block: Abhaengige Variable     (sichtbar: alle Bedingungen)
Block: Debriefing              (sichtbar: alle Bedingungen)
```

---

## 9.5 Reproduzierbare Randomisierung (Seeds)

Jede Randomisierungsoperation in QDesigner -- Bedingungszuweisung, Blockreihenfolge, Counterbalancing-Zeilenauswahl -- verwendet einen deterministischen Pseudo-Zufallszahlengenerator (PRNG), der mit einem konfigurierbaren Basis-Seed initialisiert wird.

### 9.5.1 Der Mulberry32-Algorithmus

QDesigner verwendet den Mulberry32-Algorithmus, einen schnellen 32-Bit-PRNG, der fuer experimentelle Randomisierung geeignet ist:

```
seed = hash(basisSeed + ":" + teilnehmerNummer)
function naechsteZufallszahl():
    t += 0x6D2B79F5
    r = imul(t XOR (t >>> 15), 1 | t)
    r ^= r + imul(r XOR (r >>> 7), 61 | r)
    return ((r XOR (r >>> 14)) >>> 0) / 4294967296
```

Der Seed wird zunaechst mit einer murmurhash-inspirierten Funktion gehasht, die sowohl den Basis-Seed als auch die Teilnehmernummer einbezieht, sodass verschiedene Teilnehmer unterschiedliche (aber reproduzierbare) Zufallssequenzen erhalten.

### 9.5.2 Warum Seeds wichtig sind

- **Reproduzierbarkeit:** Bei gleichem Seed und gleicher Teilnehmernummer werden stets dieselbe Zuweisung und Reihenfolge erzeugt.
- **Praeregistrierung:** Sie koennen Ihren Seed in einer Praeregistrierung angeben und spaeter nachweisen, dass die Randomisierung uebereinstimmte.
- **Debugging:** Wenn ein Teilnehmer ein Problem meldet, koennen Sie dessen exakte Erfahrung durch Verwendung der Teilnehmernummer und des Studie-Seeds nachvollziehen.

### 9.5.3 Den Seed setzen

1. Geben Sie im Panel **Experimentelles Design** einen numerischen Seed im Feld **Randomisierungs-Seed** ein.
2. Bleibt das Feld leer, wird der Seed standardmaessig auf `Date.now()` beim Studienstart gesetzt.
3. Fuer praeregistrierte Studien sollte stets ein expliziter Seed vor Beginn der Datenerhebung festgelegt werden.

---

## 9.6 Praktische Beispiele

### Beispiel 1: Einfaches Between-Subjects-Design

**Forschungsfrage:** Reduziert eine Achtsamkeitsintervention Pruefungsangst?

**Einrichtung:**
- Bedingungen: Kontrolle (Gewichtung 1), Achtsamkeit (Gewichtung 1)
- Strategie: Balanced
- Seed: 42

**Fragebogenstruktur:**
1. Block: Einwilligung (alle)
2. Block: Prae-Test STAI (alle)
3. Block: Achtsamkeitsuebung (nur Achtsamkeit)
4. Block: Kontroll-Lesetext (nur Kontrolle)
5. Block: Post-Test STAI (alle)
6. Block: Debriefing (alle)

### Beispiel 2: 2x2-Faktorielles Design

**Forschungsfrage:** Wie beeinflussen Framing (positiv vs. negativ) und Quellenglaubwuerdigkeit (hoch vs. niedrig) die Risikowahrnehmung?

**Einrichtung:**
- 4 Bedingungen: Pos-Hoch, Pos-Niedrig, Neg-Hoch, Neg-Niedrig (je Gewichtung 1)
- Strategie: Random
- Seed: 12345

**Fragebogenstruktur:**
1. Block: Einwilligung & Demografie
2. Block: Pos-Hoch-Stimulus (sichtbar: Pos-Hoch)
3. Block: Pos-Niedrig-Stimulus (sichtbar: Pos-Niedrig)
4. Block: Neg-Hoch-Stimulus (sichtbar: Neg-Hoch)
5. Block: Neg-Niedrig-Stimulus (sichtbar: Neg-Niedrig)
6. Block: Risikowahrnehmungsskala (alle)
7. Block: Manipulationschecks (alle)
8. Block: Debriefing

### Beispiel 3: Within-Subjects mit Balanciertem Lateinischem Quadrat

**Forschungsfrage:** Beeinflusst der Schrifttyp (Serif, Sans-Serif, Monospace) das Leseverstaendnis?

**Einrichtung:**
- Counterbalancing: Balanciertes Lateinisches Quadrat
- 3 Bedingungen -> 6 Reihenfolgen (ungerades n)
- Seed: 9999

**Fragebogenstruktur:**
1. Block: Einwilligung & Uebung
2. Block: Text A (Serif) -- Position durch Counterbalancing bestimmt
3. Block: Text B (Sans-Serif) -- Position durch Counterbalancing bestimmt
4. Block: Text C (Monospace) -- Position durch Counterbalancing bestimmt
5. Block: Praeferenzbewertung (alle, stets zuletzt)

Jeder Teilnehmer sieht alle drei Texte, jedoch in unterschiedlicher Reihenfolge. Mit 6 Reihenfolgen und einem balancierten Lateinischen Quadrat folgt jeder Text genau einmal auf jeden anderen.

### Beispiel 4: Gemischtes Design

**Forschungsfrage:** Interagiert der Trainingstyp (between: Verteiltes vs. Massiertes Lernen) mit der Testschwierigkeit (within: Leicht, Mittel, Schwer)?

**Einrichtung:**
- Between-Subjects: 2 Bedingungen (Verteilt, Massiert), Balanced-Strategie
- Within-Subjects: 3 Schwierigkeitsstufen, Balanciertes Lateinisches Quadrat
- Seed: 7777

**Fragebogenstruktur:**
1. Block: Einwilligung & Demografie (alle)
2. Block: Verteiltes Training (sichtbar: nur Verteilt)
3. Block: Massiertes Training (sichtbar: nur Massiert)
4. Block: Leichter Test (alle, counterbalancierte Position)
5. Block: Mittlerer Test (alle, counterbalancierte Position)
6. Block: Schwerer Test (alle, counterbalancierte Position)
7. Block: Debriefing (alle)

Der Between-Subjects-Faktor (Trainingstyp) nutzt die Bedingungszuweisung. Der Within-Subjects-Faktor (Schwierigkeit) nutzt die counterbalancierte Blockreihenfolge. Gemeinsam implementieren sie ein vollstaendiges gemischtes Design.

---

## 9.7 Design-Validierung

QDesigner enthaelt eine integrierte Validierung fuer experimentelle Designs:

- **Mindestens eine Bedingung:** Es muss mindestens eine Bedingung definiert sein.
- **Counterbalancing-Grenzen:** Volles Counterbalancing warnt bei *n > 6* (720 Permutationen) und verweigert *n > 8*.
- **Gewichtungsvalidierung:** Null- oder negative Gewichtungen loesen Warnungen aus.
- **Sichtbarkeitsabdeckung:** Der Designer warnt, wenn eine Bedingung keine sichtbaren Bloecke hat (leere Erfahrung).
- **Stichprobengroessenempfehlung:** Fuer Designs mit balanciertem Lateinischem Quadrat empfiehlt der Designer Stichprobengroessen, die Vielfache der Anzahl der Reihenfolgen sind.

---

## 9.8 Zusammenfassung

| Funktion                      | Implementierung                        | Schluesselparameter     |
|------------------------------|----------------------------------------|----------------------|
| Between-Subjects              | `ConditionAssigner`-Klasse              | `strategy`, `seed`     |
| Zufallszuweisung              | Gewichtete PRNG-Stichprobe             | Bedingungs-`weight`    |
| Sequentielle Zuweisung        | Round-Robin mod *k*                    | `participantNumber`    |
| Balancierte Zuweisung         | Min-Count mit Tiebreaking              | `groupCounts`          |
| Lateinisches Quadrat          | Zyklische Rotation                     | *n* Reihenfolgen       |
| Balanciertes Lat. Quadrat     | Williams-Design-Algorithmus            | *n* oder *2n* Reihf.   |
| Volles Counterbalancing       | Alle *n!* Permutationen                | Max *n* = 8            |
| Blockrandomisierung           | Geseedeter Shuffle mit Fixieroptionen  | Erster/Letzter/Beide   |
| Bedingungssichtbarkeit        | Block-Level-Bedingungsfilter           | Bedingungsnamen        |
| Reproduzierbare Randomisierung| Mulberry32-PRNG mit Basis-Seed + TN-ID | `seed`-Feld            |
