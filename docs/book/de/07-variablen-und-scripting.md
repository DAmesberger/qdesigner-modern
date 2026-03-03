# Kapitel 7: Variablen, Formeln und Scripting

QDesigner beinhaltet ein umfassendes Variablensystem und eine Formel-Engine, die dynamische Frageboegen mit berechneten Scores, bedingten Inhalten, Echtzeit-Feedback und benutzerdefinierter Logik ermoeglichen. Dieses Kapitel behandelt das Variablensystem, die vollstaendige Funktionsreferenz der Formel-Engine, Variablen-Piping und den Skript-Editor.

## 7.1 Uebersicht ueber das Variablensystem

Variablen in QDesigner speichern Werte, die im gesamten Fragebogen referenziert werden koennen. Sie dienen mehreren Zwecken:

- **Antwortdaten speichern**: Jede Frage kann ihre Antwort in einer benannten Variable speichern.
- **Scores berechnen**: Formeln koennen mehrere Antworten zu aggregierten Scores zusammenfassen.
- **Ablauf steuern**: Bedingungen in Ablaufsteuerungsregeln und Anzeigebedingungen referenzieren Variablen.
- **Inhalte personalisieren**: Variablen-Piping fuegt berechnete oder gespeicherte Werte in Fragetexte ein.
- **Zustand verfolgen**: Systemvariablen wie Zeitstempel und Zaehler verwalten den Sitzungszustand.

### Variablentypen

QDesigner unterstuetzt neun Variablentypen:

| Typ | Bezeichnung | Beschreibung | Standardwert |
|---|---|---|---|
| `number` | Zahl | Numerische Werte (Ganzzahlen oder Dezimalzahlen) | `0` |
| `string` | Text | Zeichenkettenwerte | `''` |
| `boolean` | Wahr/Falsch | Boolesche Werte | `false` |
| `date` | Datum | Datumswerte | Aktuelles Datum |
| `time` | Uhrzeit | Uhrzeitwerte | Aktuelle Uhrzeit |
| `array` | Liste | Geordnete Sammlungen | `[]` |
| `object` | Objekt | Schluessel-Wert-Zuordnungen | `{}` |
| `reaction_time` | Reaktionszeit | Timing-Werte mit Mikrosekunden-Praezision | `0` |
| `stimulus_onset` | Stimulus-Onset | Zeitstempel der Stimuluspraesentaion | `0` |

### Variablenbereich

Jede Variable hat einen Bereich, der ihre Lebensdauer und Zugaenglichkeit bestimmt:

| Bereich | Beschreibung |
|---|---|
| `global` | Im gesamten Fragebogen zugaenglich. Bleibt ueber Seiten hinweg bestehen. |
| `local` | Nur auf der aktuellen Seite zugaenglich. Wird beim Seitenwechsel zurueckgesetzt. |
| `temporary` | Existiert nur waehrend der Formelauswertung. Wird nicht persistiert. |

### Variableneigenschaften

Jede Variable hat die folgenden Eigenschaften:

```typescript
{
  id: string;           // Eindeutiger Bezeichner (UUID)
  name: string;         // Referenzname (in Formeln verwendet)
  type: VariableType;   // Einer der neun Typen
  scope: 'global' | 'local' | 'temporary';
  defaultValue?: any;   // Anfangswert
  formula?: string;     // Berechnungsformel (falls vorhanden)
  dependencies?: string[]; // Variablen, von denen diese Formel abhaengt
  description?: string; // Menschenlesbare Beschreibung
}
```

## 7.2 Variablen erstellen und verwalten

### Der Variablen-Manager

Oeffnen Sie den Variablen-Manager ueber die linke Seitenleiste (Variable-Icon). Er bietet:

- **Variablenliste**: Alle definierten Variablen mit Typ, Formel und Standardwert.
- **Variable hinzufuegen**: Schaltflaeche zum Erstellen einer neuen Variable ueber ein Modalformular.
- **Bearbeiten/Loeschen**: Inline-Schaltflaechen auf jeder Variablenkarte.
- **Abhaengigkeitsgraph**: Eine visuelle Canvas-Darstellung der Variablenabhaengigkeiten.
- **Verfuegbare Funktionen**: Eine Schnellreferenz gaengiger Formelfunktionen.

### Eine Variable erstellen

1. Klicken Sie auf "Variable hinzufuegen" in der Kopfzeile des Variablen-Managers.
2. Fuellen Sie das Formular aus:
   - **Name**: Ein eindeutiger Bezeichner (z.B. `gesamtScore`, `teilnehmerAlter`, `reaktionszeitMittel`).
   - **Typ**: Aus dem Dropdown auswaehlen.
   - **Standardwert** (optional): Der Anfangswert.
   - **Formel** (optional): Ein Formelausdruck (z.B. `f1Score + f2Score + f3Score`).
   - **Beschreibung** (optional): Erklaerung der Variable.
3. Klicken Sie auf "Variable hinzufuegen".

### Der erweiterte Formel-Editor

Wechseln Sie zum "Erweiterten Editor", um vom einfachen Textbereich zum **FormulaEditor** zu wechseln -- einem Monaco-basierten Editor mit vollstaendiger IntelliSense-Unterstuetzung:

- **Syntaxhervorhebung** fuer Formelausdruecke
- **Vollstaendige Autovervollstaendigung** mit 46 eingebauten Funktionen in 7 Kategorien (Mathematik, Array, Statistik, Logik, Text, Datum/Zeit, Benutzerdefiniert), dargestellt als kategorieweise gruppierte Vervollstaendigungen
- **Signaturhilfe**, die Parametertypen und Beschreibungen waehrend der Eingabe anzeigt und sich in Echtzeit aktualisiert, wenn Sie zwischen Parametern wechseln
- **Tab-Stopp-Snippet-Einfuegung** -- bei Auswahl einer Funktion aus der Autovervollstaendigung wird ein Snippet mit Tab-Stopps fuer jeden Parameter eingefuegt, sodass Sie mit Tab zwischen den Argumenten wechseln koennen
- **Dynamische Variablenvorschlaege**, die sich in Echtzeit aktualisieren, wenn Sie Variablen im Variablen-Manager hinzufuegen, umbenennen oder entfernen -- neu erstellte Variablen erscheinen sofort in der Autovervollstaendigung
- **Echtzeit-Fehlerfeedback** mit Inline-Diagnose
- **Variablentyp-Informationen** in Hover-Tooltips

### Abhaengigkeitsgraph

Klicken Sie auf "Graph anzeigen", um die Variablenabhaengigkeiten als gerichteten Graphen zu visualisieren. Jede Variable wird als kreisfoermiger Knoten dargestellt, Pfeile zeigen Abhaengigkeiten an.

## 7.3 Formelsyntax

Formeln folgen einer tabellenkalkulationsaehnlichen Syntax:

- Fuehrendes `=` ist optional: `= SUM(a, b)` ist aequivalent zu `SUM(a, b)`.
- Variablennamen werden direkt referenziert: `alter * 10 + basisScore`.
- Funktionsnamen sind Grossbuchstaben: `SUM()`, `IF()`, `MEAN()`.
- Arithmetische Operatoren: `+`, `-`, `*`, `/`, `^` (Potenzierung).
- Vergleichsoperatoren: `==`, `!=`, `>`, `<`, `>=`, `<=`.
- Logische Operatoren: `&&` (UND), `||` (ODER), `!` (NICHT).

### Formelauswertung

Die Formel-Engine:
1. Ersetzt Variablenreferenzen durch ihre aktuellen Werte.
2. Wertet Funktionsaufrufe rekursiv von innen nach aussen aus.
3. Wertet den resultierenden Ausdruck aus.
4. Speichert Ergebnisse im Cache fuer wiederholte Auswertungen.

## 7.4 Vollstaendige Funktionsreferenz

Die Formel-Engine von QDesigner bietet 47+ eingebaute Funktionen in sieben Kategorien.

### Mathematische Funktionen

| Funktion | Parameter | Ergebnis | Beschreibung |
|---|---|---|---|
| `ABS(wert)` | number | number | Absolutwert. |
| `ROUND(wert, dezimalen?)` | number, number | number | Auf Dezimalstellen runden (Standard 0). |
| `SQRT(wert)` | number | number | Quadratwurzel. |
| `POW(basis, exponent)` | number, number | number | Potenzierung. |
| `RANDOM()` | -- | number | Zufallszahl zwischen 0 und 1. Unterstuetzt geseedeten PRNG fuer Reproduzierbarkeit. |
| `RANDINT(min, max)` | number, number | number | Zufaellige Ganzzahl im Bereich [min, max]. |

### Array-Funktionen (Basis)

| Funktion | Parameter | Ergebnis | Beschreibung |
|---|---|---|---|
| `SUM(werte...)` | ...number oder array | number | Summe der Werte. |
| `COUNT(werte...)` | ...any oder array | number | Anzahl nicht-leerer Werte. |
| `MIN(werte...)` | ...number oder array | number | Minimaler Wert. |
| `MAX(werte...)` | ...number oder array | number | Maximaler Wert. |

### Logische Funktionen

| Funktion | Parameter | Ergebnis | Beschreibung |
|---|---|---|---|
| `IF(bedingung, wahrWert, falschWert)` | boolean, any, any | any | Bedingter Ausdruck. |
| `AND(werte...)` | ...boolean | boolean | Wahr, wenn alle Werte wahr sind. |
| `OR(werte...)` | ...boolean | boolean | Wahr, wenn ein Wert wahr ist. |
| `NOT(wert)` | boolean | boolean | Logische Negation. |

### Textfunktionen

| Funktion | Parameter | Ergebnis | Beschreibung |
|---|---|---|---|
| `CONCAT(werte...)` | ...any | string | Werte zu einer Zeichenkette verketten. |
| `LENGTH(text)` | string | number | Zeichenkettenlaenge. |
| `UPPER(text)` | string | string | In Grossbuchstaben umwandeln. |
| `LOWER(text)` | string | string | In Kleinbuchstaben umwandeln. |

### Datum/Zeit-Funktionen

| Funktion | Parameter | Ergebnis | Beschreibung |
|---|---|---|---|
| `NOW()` | -- | number | Aktueller Zeitstempel in Millisekunden. |
| `TIME_SINCE(zeitstempel)` | number | number | Vergangene Millisekunden seit dem Zeitstempel. |

### Statistische Funktionen

| Funktion | Parameter | Ergebnis | Beschreibung |
|---|---|---|---|
| `MEAN(werte...)` | ...number oder array | number | Arithmetisches Mittel. |
| `MEDIAN(werte...)` | ...number oder array | number | Medianwert. |
| `MODE(werte...)` | ...any oder array | any | Haeufigster Wert. Gibt Array bei mehreren Modi zurueck. |
| `STDEV(werte...)` | ...number oder array | number | Stichproben-Standardabweichung. |
| `VARIANCE(werte...)` | ...number oder array | number | Stichproben-Varianz. |
| `PERCENTILE(array, p)` | array, number | number | n-tes Perzentil (p: 0-1 oder 0-100). |
| `CORRELATION(x, y)` | array, array | number | Pearson-Korrelationskoeffizient. |
| `ZSCORE(wert, mittel, stdabw)` | number, number, number | number | Standardwert (z-Score). |
| `TTEST(gruppe1, gruppe2, seiten?)` | array, array, number | object | Unabhaengiger t-Test. Gibt {t, df, mean1, mean2, meanDiff, se, effectSize} zurueck. |
| `SKEWNESS(werte...)` | ...number oder array | number | Verteilungsschiefe. |
| `KURTOSIS(werte...)` | ...number oder array | number | Exzess-Kurtosis. |

### Erweiterte Array-Funktionen

| Funktion | Parameter | Ergebnis | Beschreibung |
|---|---|---|---|
| `FILTER(array, bedingung)` | array, string | array | Elemente filtern. Bedingung: `"> 5"`, `"!= banane"`. |
| `MAP(array, transformation)` | array, string | array | Elemente transformieren. Transformation: `"* 2"`, `"+ 10"`. |
| `REDUCE(array, operation, start?)` | array, string, any | any | Reduzieren: `"sum"`, `"product"`, `"min"`, `"max"`, `"concat"`, `"count"`. |
| `SORT(array, reihenfolge?)` | array, string | array | Aufsteigend (Standard) oder `"desc"` sortieren. |
| `UNIQUE(array)` | array | array | Duplikate entfernen. |
| `FLATTEN(array, tiefe?)` | array, number | array | Verschachtelte Arrays abflachen. |
| `GROUP_BY(array, eigenschaft)` | array, string | object | Objekte nach Eigenschaft gruppieren. |
| `PLUCK(array, eigenschaft)` | array, string | array | Eigenschaftswerte aus Objekten extrahieren. |
| `SLICE(array, start, ende?)` | array, number, number | array | Teil eines Arrays extrahieren. |
| `REVERSE(array)` | array | array | Array-Reihenfolge umkehren. |

## 7.5 Benutzerdefinierte Funktionen

Forschende koennen eigene Funktionen mit dem `CustomFunctionManager` definieren. Benutzerdefinierte Funktionen werden in JavaScript geschrieben und mit dem Fragebogen gespeichert.

**Definitionsstruktur**:
```javascript
{
  name: 'SCORE_SCALE',
  description: 'Rohwert in standardisierte Skala umrechnen',
  parameters: ['rohwert', 'min', 'max', 'neuMin', 'neuMax'],
  body: `
    const verhaeltnis = (rohwert - min) / (max - min);
    return neuMin + verhaeltnis * (neuMax - neuMin);
  `
}
```

**Eingebaute Beispielfunktionen**:

| Funktion | Beschreibung |
|---|---|
| `SCORE_SCALE(roh, min, max, neuMin, neuMax)` | Lineare Umskalierung. |
| `CATEGORY_SCORE(items, gewichte)` | Gewichteter Mittelwert der Items. |
| `AGE_GROUP(alter)` | Alter in Gruppen kategorisieren (Minderjaehrig, Junger Erwachsener, usw.). |
| `LIKERT_TO_NUMERIC(antwort)` | Text-Likert-Antworten in Zahlen umwandeln. |
| `RESPONSE_TIME_CATEGORY(ms)` | RT als Zu schnell / Schnell / Normal / Langsam / Sehr langsam kategorisieren. |

## 7.6 Variablen-Piping

Variablen-Piping ermoeglicht es, aktuelle Variablenwerte in beliebige Textfelder (Fragetexte, Anweisungen, Feedback) einzubetten. Die Syntax lautet:

```
{{variablenName}}
```

**Beispiele**:

- `"Hallo {{teilnehmerName}}, willkommen zur Studie."` -- Fuegt den Teilnehmernamen ein.
- `"Ihr Score betraegt {{gesamtScore}} von {{maxScore}}."` -- Zeigt berechnete Scores an.
- `"Ihre durchschnittliche Reaktionszeit betrug {{ROUND(mittelRT, 0)}} ms."` -- Inline-Formel.

Variablen-Piping funktioniert in:
- Fragetexten und Anweisungen
- Textanzeige- und Textanweisungs-Inhalten
- Statistik-Feedback-Titeln und -Untertiteln
- Auswahloptionenbeschriftungen
- Allen Textfeldern, bei denen `variables: true` in der Anzeigekonfiguration gesetzt ist

## 7.7 Der Skript-Editor

Der Skript-Editor bietet pro Frage programmierbare Logik in JavaScript. Er ist ueber den "Skript"-Tab im Eigenschaftenpanel zugaenglich (nur fuer Frageelemente verfuegbar).

### Editor-Funktionen

- **Monaco Editor**: Vollstaendige VS-Code-Bearbeitungserfahrung mit Syntaxhervorhebung, Klammernabgleich und Fehlerdiagnose.
- **Typdefinitionen**: IntelliSense fuer die QDesigner-API.
- **Dunkles Theme**: VS Dark-Farbschema.
- **Formatieren und Zuruecksetzen**: Werkzeugleisten-Schaltflaechen.
- **Tastenkuerzel**: Strg+S (speichern), Strg+Leertaste (Vorschlaege).

### Event-Hooks

Skripte exportieren ein `hooks`-Objekt mit vier Lebenszyklus-Hooks:

#### `onMount(context)`

Wird aufgerufen, wenn die Frage zum ersten Mal gerendert wird. Verwendung fuer Initialisierung, Fokus setzen, externe Daten laden, Anfangsvariablenwerte setzen.

```javascript
onMount: (context) => {
  context.focusFirstInput();
  context.variables.set('startZeit', Date.now());
}
```

#### `onResponse(response, context)`

Wird aufgerufen, wenn der Nutzer eine Antwort gibt oder aendert. Verwendung fuer Bewertung, Variablenaktualisierung, Seiteneffekte.

```javascript
onResponse: (response, context) => {
  if (response.value === 'korrekt') {
    context.variables.increment('score', 10);
  }
}
```

#### `onValidate(value, context)`

Wird aufgerufen, bevor die Antwort akzeptiert wird. Gibt `true` fuer gueltig oder eine Fehlermeldung als String zurueck.

```javascript
onValidate: (value, context) => {
  if (value.length < 10) {
    return 'Bitte geben Sie mindestens 10 Zeichen ein';
  }
  return true;
}
```

#### `onNavigate(direction, context)`

Wird aufgerufen, wenn der Nutzer vor- oder zuruecknavigieren moechte. Gibt `true` zum Erlauben oder `false` zum Verhindern zurueck.

### Kontext-API

| Eigenschaft/Methode | Beschreibung |
|---|---|
| `context.questionId` | ID der aktuellen Frage. |
| `context.questionType` | Fragetypkennung. |
| `context.variables.get(name)` | Variablenwert abrufen. |
| `context.variables.set(name, wert)` | Variablenwert setzen. |
| `context.variables.increment(name, um?)` | Numerische Variable erhoehen. |
| `context.variables.decrement(name, um?)` | Numerische Variable verringern. |
| `context.hasResponse` | Ob der Nutzer geantwortet hat. |
| `context.response` | Der aktuelle Antwortwert. |
| `context.focusFirstInput()` | Erstes Eingabefeld fokussieren. |
| `context.showError(nachricht)` | Fehlermeldung anzeigen. |
| `context.showSuccess(nachricht)` | Erfolgsmeldung anzeigen. |

## 7.8 Praktische Beispiele

### Beispiel 1: Fragebogenbewertung

Variablen erstellen, um einen Summenscore aus fuenf Likert-Items zu berechnen:

1. Fuenf Skala-Fragen (f1 bis f5) erstellen, die jeweils in Variablen `f1`, `f2`, `f3`, `f4`, `f5` speichern.
2. Variable `gesamtScore` mit Formel: `SUM(f1, f2, f3, f4, f5)`.
3. Variable `mittelScore` mit Formel: `MEAN(f1, f2, f3, f4, f5)`.
4. Auf einer Feedback-Seite anzeigen: `"Ihr Durchschnittsscore betraegt {{ROUND(mittelScore, 1)}} auf einer 7-Punkt-Skala."`.

### Beispiel 2: Umkodierung

Einige Items muessen vor der Aggregation umkodiert werden:

```
umkodiertF3 = (maxSkala + 1) - f3
bereinigterGesamt = f1 + f2 + umkodiertF3 + f4 + f5
```

### Beispiel 3: Bedingtes Feedback

IF verwenden, um unterschiedliches Feedback basierend auf der Leistung zu geben:

```
feedbackNachricht = IF(mittelScore > 5, "Ueberdurchschnittlich", IF(mittelScore > 3, "Durchschnittlich", "Unterdurchschnittlich"))
```

Dann pipen: `"Ihre Leistung: {{feedbackNachricht}}"`.

### Beispiel 4: Reaktionszeitanalyse

Nach einem Reaktionszeitblock Zusammenfassungsstatistiken berechnen:

```
mittelRT = MEAN(alleReaktionszeiten)
medianRT = MEDIAN(alleReaktionszeiten)
sdRT = STDEV(alleReaktionszeiten)
genauigkeitProzent = ROUND(SUM(MAP(alleKorrekt, "* 1")) / COUNT(alleKorrekt) * 100, 1)
```

### Beispiel 5: Altersbasierte Verzweigung

Eine Variable erstellen und in der Ablaufsteuerung verwenden:

1. Variable `istErwachsen` mit Formel: `teilnehmerAlter >= 18`.
2. Ablaufsteuerung: Verzweigung mit Bedingung `istErwachsen === false`, Ziel: "Seite Einwilligung Minderjaehriger".

### Beispiel 6: Echtzeit-Statistisches Feedback

Einen Statistischen-Feedback-Anzeigeblock konfigurieren:
- Quellenmodus: `participant-vs-cohort`
- Metrik: `z_score`
- Datenquellenvariable: `gesamtScore`
- Perzentil anzeigen: aktiviert

Dies zeigt an, wo der Score des aktuellen Teilnehmers relativ zu allen bisherigen Befragten liegt.
