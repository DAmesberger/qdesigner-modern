# Anhang B: Formelfunktionsreferenz

Vollstandige Referenz aller Funktionen, die in der QDesigner Modern Formelengine verfugbar sind.

---

## Mathematische Funktionen

### ABS

Gibt den Absolutwert einer Zahl zuruck.

**Syntax**: `ABS(wert)`

| Parameter | Typ | Beschreibung |
|---|---|---|
| wert | number | Zahl, deren Absolutwert berechnet wird |

**Ruckgabe**: number

**Beispiel**: `ABS(-5)` ergibt `5`

---

### ROUND

Rundet eine Zahl auf die angegebene Anzahl von Dezimalstellen.

**Syntax**: `ROUND(wert, dezimalstellen?)`

| Parameter | Typ | Beschreibung |
|---|---|---|
| wert | number | Zu rundende Zahl |
| dezimalstellen | number | Dezimalstellen (Standard: 0) |

**Ruckgabe**: number

**Beispiele**:
- `ROUND(3.7)` ergibt `4`
- `ROUND(3.14159, 2)` ergibt `3.14`

---

### SQRT

Gibt die Quadratwurzel einer Zahl zuruck.

**Syntax**: `SQRT(wert)`

**Ruckgabe**: number

**Beispiel**: `SQRT(16)` ergibt `4`

---

### POW

Gibt die Basis potenziert mit dem Exponenten zuruck.

**Syntax**: `POW(basis, exponent)`

**Ruckgabe**: number

**Beispiel**: `POW(2, 8)` ergibt `256`

---

### RANDOM

Gibt eine Zufallszahl zwischen 0 (einschliesslich) und 1 (ausschliesslich) zuruck. Bei gesetztem Zufallsseed ist das Ergebnis deterministisch fur Reproduzierbarkeit.

**Syntax**: `RANDOM()`

**Ruckgabe**: number

---

### RANDINT

Gibt eine zufallige Ganzzahl zwischen min und max (einschliesslich) zuruck.

**Syntax**: `RANDINT(min, max)`

**Ruckgabe**: number

**Beispiel**: `RANDINT(1, 6)` ergibt z.B. `4`

---

## Array-Funktionen

### SUM

Gibt die Summe aller numerischen Werte zuruck.

**Syntax**: `SUM(werte...)` oder `SUM(array)`

**Ruckgabe**: number

**Beispiele**:
- `SUM(1, 2, 3)` ergibt `6`
- `SUM([10, 20, 30])` ergibt `60`

---

### COUNT

Zahlt nicht-leere Werte (schliesst null, undefined und leere Zeichenketten aus).

**Syntax**: `COUNT(werte...)` oder `COUNT(array)`

**Ruckgabe**: number

**Beispiel**: `COUNT(1, null, 3, "", 5)` ergibt `3`

---

### MIN / MAX

Gibt den Minimal- bzw. Maximalwert zuruck.

**Syntax**: `MIN(werte...)` / `MAX(werte...)`

**Ruckgabe**: number (NaN wenn keine numerischen Werte)

---

### FILTER

Filtert Array-Elemente basierend auf einer Bedingung.

**Syntax**: `FILTER(array, bedingung)`

Unterstutzte Operatoren: `>`, `>=`, `<`, `<=`, `==`, `=`, `!=`

**Beispiele**:
- `FILTER([1, 2, 3, 4, 5], "> 3")` ergibt `[4, 5]`
- `FILTER(["Apfel", "Banane", "Kirsche"], "!= Banane")` ergibt `["Apfel", "Kirsche"]`

---

### MAP

Transformiert jedes Element eines Arrays mittels einer mathematischen Operation.

**Syntax**: `MAP(array, transformation)`

Unterstutzte Operatoren: `+`, `-`, `*`, `/`, `^`

**Beispiele**:
- `MAP([1, 2, 3], "* 2")` ergibt `[2, 4, 6]`
- `MAP([10, 20, 30], "+ 5")` ergibt `[15, 25, 35]`

---

### REDUCE

Reduziert ein Array auf einen einzelnen Wert mittels einer benannten Operation.

**Syntax**: `REDUCE(array, operation, startwert?)`

Mogliche Operationen: `"sum"`, `"product"`, `"min"`, `"max"`, `"concat"`, `"count"`

**Beispiele**:
- `REDUCE([1, 2, 3, 4], "sum")` ergibt `10`
- `REDUCE([5, 10, 15], "product")` ergibt `750`
- `REDUCE(["a", "b", "c"], "concat")` ergibt `"abc"`

---

### SORT

Sortiert Array-Elemente in auf- oder absteigender Reihenfolge.

**Syntax**: `SORT(array, reihenfolge?)`

| Parameter | Typ | Beschreibung |
|---|---|---|
| array | array | Zu sortierendes Array |
| reihenfolge | string | `"asc"` (Standard) oder `"desc"` |

**Beispiele**:
- `SORT([3, 1, 4, 1, 5])` ergibt `[1, 1, 3, 4, 5]`
- `SORT(["Banane", "Apfel", "Kirsche"], "desc")` ergibt `["Kirsche", "Banane", "Apfel"]`

---

### UNIQUE

Gibt ein Array ohne Duplikate zuruck.

**Syntax**: `UNIQUE(array)`

**Beispiel**: `UNIQUE([1, 2, 2, 3, 3, 3])` ergibt `[1, 2, 3]`

---

### FLATTEN

Flacht verschachtelte Arrays bis zur angegebenen Tiefe ab.

**Syntax**: `FLATTEN(array, tiefe?)`

**Beispiel**: `FLATTEN([[1, 2], [3, 4]])` ergibt `[1, 2, 3, 4]`

---

### GROUP_BY

Gruppiert ein Array von Objekten nach einem Eigenschaftswert.

**Syntax**: `GROUP_BY(array, eigenschaft)`

---

### PLUCK

Extrahiert einen einzelnen Eigenschaftswert aus jedem Objekt in einem Array.

**Syntax**: `PLUCK(array, eigenschaft)`

**Beispiel**: `PLUCK([{name: "Alice", alter: 25}, {name: "Bob", alter: 30}], "name")` ergibt `["Alice", "Bob"]`

---

### SLICE

Extrahiert einen Teil eines Arrays.

**Syntax**: `SLICE(array, start, ende?)`

**Beispiel**: `SLICE([1, 2, 3, 4, 5], 1, 4)` ergibt `[2, 3, 4]`

---

### REVERSE

Gibt das Array in umgekehrter Reihenfolge zuruck.

**Syntax**: `REVERSE(array)`

**Beispiel**: `REVERSE([1, 2, 3])` ergibt `[3, 2, 1]`

---

## Logische Funktionen

### IF

Wertet eine Bedingung aus und gibt einen von zwei Werten zuruck.

**Syntax**: `IF(bedingung, wahr_wert, falsch_wert)`

**Beispiel**: `IF(score > 80, "Bestanden", "Nicht bestanden")`

---

### AND

Gibt wahr zuruck, wenn alle Argumente wahr sind.

**Syntax**: `AND(werte...)`

**Beispiel**: `AND(true, true, false)` ergibt `false`

---

### OR

Gibt wahr zuruck, wenn mindestens ein Argument wahr ist.

**Syntax**: `OR(werte...)`

**Beispiel**: `OR(false, true, false)` ergibt `true`

---

### NOT

Gibt die logische Negation zuruck.

**Syntax**: `NOT(wert)`

**Beispiel**: `NOT(true)` ergibt `false`

---

## Textfunktionen

### CONCAT

Verkettet alle Argumente zu einer einzelnen Zeichenkette.

**Syntax**: `CONCAT(werte...)`

**Beispiel**: `CONCAT("Hallo", " ", "Welt")` ergibt `"Hallo Welt"`

---

### LENGTH

Gibt die Lange einer Zeichenkette zuruck.

**Syntax**: `LENGTH(text)`

**Beispiel**: `LENGTH("Hallo")` ergibt `5`

---

### UPPER

Konvertiert eine Zeichenkette in Grossbuchstaben.

**Syntax**: `UPPER(text)`

**Beispiel**: `UPPER("hallo")` ergibt `"HALLO"`

---

### LOWER

Konvertiert eine Zeichenkette in Kleinbuchstaben.

**Syntax**: `LOWER(text)`

**Beispiel**: `LOWER("HALLO")` ergibt `"hallo"`

---

## Datums-/Zeitfunktionen

### NOW

Gibt den aktuellen Zeitstempel in Millisekunden seit der Unix-Epoche zuruck.

**Syntax**: `NOW()`

**Ruckgabe**: number

---

### TIME_SINCE

Gibt die verstrichene Zeit in Millisekunden seit einem gegebenen Zeitstempel zuruck.

**Syntax**: `TIME_SINCE(zeitstempel)`

**Ruckgabe**: number

**Beispiel**: `TIME_SINCE(startZeit)` ergibt z.B. `5432`

---

## Statistische Funktionen

### MEAN

Berechnet das arithmetische Mittel (Durchschnitt) numerischer Werte.

**Syntax**: `MEAN(werte...)` oder `MEAN(array)`

**Beispiel**: `MEAN(1, 2, 3, 4, 5)` ergibt `3`

---

### MEDIAN

Berechnet den Median (Zentralwert) numerischer Werte.

**Syntax**: `MEDIAN(werte...)` oder `MEDIAN(array)`

**Beispiel**: `MEDIAN(1, 3, 5, 7, 9)` ergibt `5`

---

### MODE

Findet den am haufigsten vorkommenden Wert (Modalwert).

**Syntax**: `MODE(werte...)` oder `MODE(array)`

**Ruckgabe**: Einzelwert bei einem Modus, Array bei mehreren Modi.

**Beispiel**: `MODE(1, 2, 2, 3, 3, 3)` ergibt `3`

---

### STDEV

Berechnet die Stichproben-Standardabweichung.

**Syntax**: `STDEV(werte...)` oder `STDEV(array)`

**Ruckgabe**: number (NaN bei weniger als 2 Werten)

**Beispiel**: `STDEV(1, 2, 3, 4, 5)` ergibt ca. `1.58`

---

### VARIANCE

Berechnet die Stichprobenvarianz.

**Syntax**: `VARIANCE(werte...)` oder `VARIANCE(array)`

**Ruckgabe**: number (NaN bei weniger als 2 Werten)

**Beispiel**: `VARIANCE(1, 2, 3, 4, 5)` ergibt `2.5`

---

### PERCENTILE

Berechnet das n-te Perzentil eines numerischen Arrays.

**Syntax**: `PERCENTILE(werte, perzentil)`

Werte zwischen 0 und 1 werden direkt verwendet. Werte zwischen 1 und 100 werden automatisch durch 100 geteilt.

**Beispiele**:
- `PERCENTILE([1, 2, 3, 4, 5], 0.5)` ergibt `3`
- `PERCENTILE([10, 20, 30, 40], 75)` ergibt `32.5`

---

### CORRELATION

Berechnet den Pearson-Korrelationskoeffizienten zwischen zwei Zahlen-Arrays.

**Syntax**: `CORRELATION(x, y)`

**Ruckgabe**: number zwischen -1 und 1

**Beispiele**:
- `CORRELATION([1, 2, 3], [2, 4, 6])` ergibt `1` (perfekt positiv)
- `CORRELATION([1, 2, 3], [3, 2, 1])` ergibt `-1` (perfekt negativ)

---

### ZSCORE

Berechnet den z-Wert (Standardwert) eines Wertes relativ zu einer Population.

**Syntax**: `ZSCORE(wert, mittelwert, standardabweichung)`

**Ruckgabe**: number (NaN wenn Standardabweichung 0 ist)

**Beispiel**: `ZSCORE(85, 80, 10)` ergibt `0.5`

---

### TTEST

Fuhrt einen unabhangigen Stichproben-t-Test zwischen zwei Gruppen durch.

**Syntax**: `TTEST(gruppe1, gruppe2, seiten?)`

| Parameter | Typ | Beschreibung |
|---|---|---|
| gruppe1 | array | Erste Gruppe von Zahlen |
| gruppe2 | array | Zweite Gruppe von Zahlen |
| seiten | number | Anzahl der Seiten: 1 oder 2 (Standard: 2) |

**Ruckgabe**: Objekt mit `t`, `df`, `mean1`, `mean2`, `meanDiff`, `se`, `effectSize` (Cohens d)

**Beispiel**: `TTEST([80, 85, 90], [75, 78, 82])`

---

### SKEWNESS

Berechnet die Schiefe einer Verteilung. Zeigt Asymmetrie an.

**Syntax**: `SKEWNESS(werte...)` oder `SKEWNESS(array)`

**Ruckgabe**: number (NaN bei weniger als 3 Werten)

- Positive Schiefe: rechter Schwanz ist langer.
- Negative Schiefe: linker Schwanz ist langer.
- Null: symmetrische Verteilung.

---

### KURTOSIS

Berechnet die Exzess-Kurtosis (Wolbung) einer Verteilung. Zeigt die "Schwanzigkeit" relativ zur Normalverteilung an.

**Syntax**: `KURTOSIS(werte...)` oder `KURTOSIS(array)`

**Ruckgabe**: number (NaN bei weniger als 4 Werten)

- Positiv (leptokurtisch): schwerere Schwanze als normal.
- Negativ (platykurtisch): leichtere Schwanze als normal.
- Null (mesokurtisch): ahnlich der Normalverteilung.

---

## Operatoren

Zusatzlich zu Funktionen unterstutzen Formeln Standard-Rechenoperatoren:

| Operator | Beschreibung | Beispiel |
|---|---|---|
| `+` | Addition | `a + b` |
| `-` | Subtraktion | `a - b` |
| `*` | Multiplikation | `a * b` |
| `/` | Division | `a / b` |
| `^` | Potenzierung | `a ^ 2` |
| `>` | Grosser als | `score > 80` |
| `>=` | Grosser oder gleich | `score >= 80` |
| `<` | Kleiner als | `score < 50` |
| `<=` | Kleiner oder gleich | `score <= 50` |
| `==` | Gleich | `status == "fertig"` |
| `!=` | Ungleich | `status != "ausstehend"` |

---

## Variablenreferenzen

Formeln konnen andere Variablen namentlich referenzieren. Die Formelengine lost Variablenreferenzen zum Auswertungszeitpunkt auf.

**Syntax**: Verwenden Sie den Variablennamen direkt in der Formel.

**Beispiel**: Wenn eine Variable `gesamtpunktzahl` den Wert `85` hat, ergibt die Formel `gesamtpunktzahl / 100` den Wert `0.85`.

### Variableninterpolation

In Textkontexten konnen Variablen mit doppelten geschweiften Klammern interpoliert werden:

```
Ihre Punktzahl betragt {{gesamtpunktzahl}} von 100.
```

---

## Hinweise zur Formelsyntax

- Formeln konnen optional mit `=` beginnen (das fuhrende Gleichheitszeichen wird entfernt).
- Funktionsnamen sind Gross-/Kleinschreibung-unempfindlich (`SUM`, `sum` und `Sum` funktionieren alle).
- Ergebnisse werden zwischengespeichert, bis sich der Formelkontext andert.
- Die Auswertungsperformance wird uber `executionTime` im Ergebnis verfolgt.
