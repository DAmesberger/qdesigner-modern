# Kapitel 12: Analytik und Statistik

QDesigner Modern enthaelt eine umfassende integrierte Statistik-Engine, die es Forschenden ermoeglicht, ihre Daten direkt auf der Plattform zu explorieren, analysieren und exportieren. Dieses Kapitel behandelt das Analytics-Dashboard, deskriptive und inferenzstatistische Verfahren, Effektgroessenmasse, Reliabilitaetsanalysen, Hauptkomponentenanalyse, statistisches Feedback fuer Teilnehmer und Datenexport.

---

## 12.1 Analytics-Dashboard

Das Analytics-Dashboard bietet einen Echtzeit-Ueberblick ueber den Fortschritt der Datenerhebung und die Antwortqualitaet.

### 12.1.1 Dashboard-Metriken

| Metrik                    | Beschreibung                                        |
|--------------------------|-----------------------------------------------------|
| `response_count`          | Gesamtzahl abgeschlossener Antworten                |
| `completion_rate`         | Prozentsatz der gestarteten und abgeschlossenen Sitzungen |
| `average_response_time`   | Mittlere Zeit bis zum Fragebogenabschluss           |
| `median_response_time`    | Median der Abschlusszeit (robust gegenueber Ausreissern) |
| `abandonment_rate`        | Prozentsatz der abgebrochenen Sitzungen             |
| `error_rate`              | Prozentsatz der Sitzungen mit Fehlern               |
| `unique_participants`     | Anzahl unterschiedlicher Teilnehmer                 |
| `time_to_complete`        | Verteilung der Abschlusszeiten                      |
| `performance_metrics`     | Rendering- und Netzwerkleistung                     |

### 12.1.2 Sitzungsueberwachung

Das Dashboard unterstuetzt Echtzeit-Sitzungsueberwachung ueber WebSocket- oder SSE-Verbindungen:

- **Aktive Sitzungen:** Aktuell laufende Sitzungen mit Live-Fortschritt.
- **Sitzungs-Timeline:** Startzeiten, Seitenuebergaenge und Abschlussereignisse.
- **Geografische Verteilung:** Teilnehmerstandorte (basierend auf IP-Geolocation, falls aktiviert).
- **Geraeteverteilung:** Desktop vs. Mobil vs. Tablet.

### 12.1.3 Filter und Zeitraeume

Alle Dashboard-Ansichten unterstuetzen konfigurierbare Zeitraeume:

| Voreinstellung     | Zeitraum              |
|-------------------|-----------------------|
| `today`            | Aktueller Tag          |
| `yesterday`        | Vorheriger Tag         |
| `last_7_days`      | Letzte 7 Tage         |
| `last_30_days`     | Letzte 30 Tage        |
| `last_90_days`     | Letzte 90 Tage        |
| `custom`           | Benutzerdefiniert      |

Filter koennen nach Teilnehmerdemografie, Bedingungszuweisung, Geraetetyp, Abschlussstatus und Datenqualitaetsflags angewendet werden.

---

## 12.2 Deskriptive Statistik

Die `StatisticalEngine` berechnet eine umfassende statistische Zusammenfassung fuer jeden numerischen Datensatz.

### 12.2.1 Masse der zentralen Tendenz

**Mittelwert (arithmetisches Mittel):**

$$\bar{x} = \frac{1}{n} \sum_{i=1}^{n} x_i$$

**Median:** Der mittlere Wert des sortierten Datensatzes. Fuer gerades *n*:

$$\tilde{x} = \frac{x_{(n/2)} + x_{(n/2 + 1)}}{2}$$

**Modus:** Der am haeufigsten vorkommende Wert. QDesigner gibt alle Modalwerte zurueck, wenn die Verteilung multimodal ist.

### 12.2.2 Streuungsmasse

**Varianz (Stichprobe):**

$$s^2 = \frac{1}{n-1} \sum_{i=1}^{n} (x_i - \bar{x})^2$$

QDesigner verwendet die Bessel-Korrektur (Division durch *n - 1*) fuer die unverzerrte Schaetzung der Stichprobenvarianz.

**Standardabweichung:**

$$s = \sqrt{s^2}$$

**Spannweite:**

$$\text{Spannweite} = x_{\max} - x_{\min}$$

### 12.2.3 Quartile und Perzentile

Quartile teilen die sortierten Daten in vier gleiche Teile:

| Quartil | Perzentil | Beschreibung       |
|---------|----------|-------------------|
| Q1      | 25.       | Unteres Quartil    |
| Q2      | 50.       | Median             |
| Q3      | 75.       | Oberes Quartil     |

QDesigner berechnet Perzentile mittels linearer Interpolation:

$$P_k = x_{\lfloor i \rfloor} \cdot (1 - f) + x_{\lceil i \rceil} \cdot f$$

wobei $i = \frac{k}{100} \cdot (n - 1)$ und $f = i - \lfloor i \rfloor$.

Standardmaessig berechnete Perzentile: 5., 10., 25., 75., 90., 95.

### 12.2.4 Verteilungsform

**Schiefe (Fisher-Pearson, adjustiert):**

$$g_1 = \frac{n}{(n-1)(n-2)} \sum_{i=1}^{n} \left(\frac{x_i - \bar{x}}{s}\right)^3$$

| Wert        | Interpretation           |
|------------|--------------------------|
| $g_1 < 0$  | Linksschief (langer linker Auslaeufer) |
| $g_1 = 0$  | Symmetrisch               |
| $g_1 > 0$  | Rechtsschief (langer rechter Auslaeufer) |

**Woelbung (Exzess-Kurtosis, Fisher):**

$$g_2 = \frac{n(n+1)}{(n-1)(n-2)(n-3)} \sum_{i=1}^{n} \left(\frac{x_i - \bar{x}}{s}\right)^4 - \frac{3(n-1)^2}{(n-2)(n-3)}$$

| Wert        | Interpretation           |
|------------|--------------------------|
| $g_2 < 0$  | Platykurtisch (leichtere Auslaeufer als Normalverteilung) |
| $g_2 = 0$  | Mesokurtisch (normalverteilungsaehnlich) |
| $g_2 > 0$  | Leptokurtisch (schwerere Auslaeufer als Normalverteilung) |

### 12.2.5 Ausreissererkennung

Ausreisser werden mit der IQR-Methode identifiziert:

$$\text{Untere Grenze} = Q_1 - 1{,}5 \cdot IQR$$
$$\text{Obere Grenze} = Q_3 + 1{,}5 \cdot IQR$$

wobei $IQR = Q_3 - Q_1$. Jeder Wert unterhalb der unteren oder oberhalb der oberen Grenze wird als Ausreisser klassifiziert.

---

## 12.3 Korrelationsanalyse

QDesigner unterstuetzt drei Korrelationsmethoden.

### 12.3.1 Pearson-Produkt-Moment-Korrelation

Misst den linearen Zusammenhang zwischen zwei Variablen:

$$r = \frac{n \sum x_i y_i - \sum x_i \sum y_i}{\sqrt{(n \sum x_i^2 - (\sum x_i)^2)(n \sum y_i^2 - (\sum y_i)^2)}}$$

**Voraussetzungen:** Stetige Variablen, linearer Zusammenhang, bivariate Normalverteilung.

**p-Wert:** Berechnet ueber die *t*-Transformation:

$$t = r \sqrt{\frac{n - 2}{1 - r^2}}, \quad df = n - 2$$

### 12.3.2 Spearman-Rangkorrelation

Misst monotone Zusammenhaenge mittels Raengen:

$$\rho = r_{\text{Pearson}}(\text{Rang}(x), \text{Rang}(y))$$

QDesigner berechnet Spearmans Rho, indem Pearsons Formel auf die rangskalierten Daten angewendet wird, wobei gebundene Raenge den Durchschnittsrang erhalten.

**Voraussetzungen:** Ordinale oder stetige Variablen, monotoner Zusammenhang.

### 12.3.3 Kendalls Tau

Misst ordinale Assoziation basierend auf konkordanten und diskordanten Paaren:

$$\tau = \frac{C - D}{\binom{n}{2}} = \frac{C - D}{\frac{n(n-1)}{2}}$$

wobei *C* = konkordante Paare und *D* = diskordante Paare.

**Voraussetzungen:** Ordinale Variablen, robust gegenueber Ausreissern und Nicht-Normalitaet.

### 12.3.4 Konfidenzintervalle

Alle Korrelationskoeffizienten enthalten 95%-Konfidenzintervalle, berechnet via Fishers z-Transformation:

$$z = \frac{1}{2} \ln\frac{1 + r}{1 - r}, \quad SE = \frac{1}{\sqrt{n - 3}}$$

$$KI_{95\%} = \tanh(z \pm 1{,}96 \cdot SE)$$

---

## 12.4 Parametrische Tests

### 12.4.1 T-Tests

QDesigner implementiert drei Typen von t-Tests.

**Einstichproben-t-Test:**

Prueft, ob der Stichprobenmittelwert von einem hypothetischen Wert abweicht:

$$t = \frac{\bar{x} - \mu_0}{s / \sqrt{n}}, \quad df = n - 1$$

**Zwei-Stichproben-t-Test fuer unabhaengige Stichproben (Welch):**

Prueft, ob sich zwei unabhaengige Gruppenmittelwerte unterscheiden:

$$t = \frac{\bar{x}_1 - \bar{x}_2}{\sqrt{\frac{s_1^2}{n_1} + \frac{s_2^2}{n_2}}}$$

Freiheitsgrade (Welch-Satterthwaite):

$$df = \frac{\left(\frac{s_1^2}{n_1} + \frac{s_2^2}{n_2}\right)^2}{\frac{(s_1^2/n_1)^2}{n_1 - 1} + \frac{(s_2^2/n_2)^2}{n_2 - 1}}$$

**Gepaarter t-Test:**

Prueft, ob die mittlere Differenz zwischen gepaarten Beobachtungen null ist:

$$t = \frac{\bar{d}}{s_d / \sqrt{n}}, \quad df = n - 1$$

wobei $d_i = x_{1i} - x_{2i}$.

Alle t-Tests berichten: Teststatistik, p-Wert, Freiheitsgrade, 95%-Konfidenzintervall, Effektgroesse (Cohens d) und Power.

### 12.4.2 ANOVA (Varianzanalyse)

Die einfaktorielle ANOVA prueft, ob drei oder mehr Gruppenmittelwerte gleich sind:

**Quadratsumme zwischen den Gruppen (QS_B):**

$$QS_B = \sum_{j=1}^{k} n_j (\bar{x}_j - \bar{x})^2$$

**Quadratsumme innerhalb der Gruppen (QS_W):**

$$QS_W = \sum_{j=1}^{k} \sum_{i=1}^{n_j} (x_{ij} - \bar{x}_j)^2$$

**F-Statistik:**

$$F = \frac{QS_B / (k - 1)}{QS_W / (N - k)} = \frac{MQ_B}{MQ_W}$$

wobei *k* = Anzahl der Gruppen, *N* = Gesamtstichprobengroesse.

**Effektgroesse (Eta-Quadrat):**

$$\eta^2 = \frac{QS_B}{QS_B + QS_W}$$

### 12.4.3 Lineare Regression

Einfache lineare Regression modelliert den Zusammenhang zwischen einem Praediktor und einem Kriterium:

$$\hat{y} = \beta_0 + \beta_1 x$$

**Steigung:**

$$\beta_1 = \frac{\sum_{i=1}^{n} (x_i - \bar{x})(y_i - \bar{y})}{\sum_{i=1}^{n} (x_i - \bar{x})^2}$$

**Achsenabschnitt:**

$$\beta_0 = \bar{y} - \beta_1 \bar{x}$$

**Bestimmtheitsmass:**

$$R^2 = 1 - \frac{QS_{res}}{QS_{tot}} = 1 - \frac{\sum(y_i - \hat{y}_i)^2}{\sum(y_i - \bar{y})^2}$$

**Adjustiertes R-Quadrat:**

$$R^2_{adj} = 1 - \frac{(1 - R^2)(n - 1)}{n - 2}$$

QDesigner berichtet: Koeffizienten, Standardfehler, t-Statistiken, p-Werte, Residuen, R-Quadrat, adjustiertes R-Quadrat und den F-Gesamtmodelltest.

---

## 12.5 Nichtparametrische Tests

### 12.5.1 Mann-Whitney-U-Test

Eine rangbasierte Alternative zum t-Test fuer unabhaengige Stichproben:

$$U_1 = R_1 - \frac{n_1(n_1 + 1)}{2}$$

wobei $R_1$ die Rangsumme fuer Gruppe 1 ist.

**Normalapproximation (mit Bindungskorrektur):**

$$z = \frac{U_1 - \frac{n_1 n_2}{2}}{\sqrt{\frac{n_1 n_2}{12}\left(N + 1 - \frac{\sum(t_i^3 - t_i)}{N(N-1)}\right)}}$$

wobei $t_i$ = Groesse der *i*-ten Bindungsgruppe.

**Effektgroesse:** $r = |z| / \sqrt{N}$

**Rang-biseriale Korrelation:** $(U_1 - U_2) / (n_1 \cdot n_2)$

### 12.5.2 Wilcoxon-Vorzeichen-Rang-Test

Eine rangbasierte Alternative zum gepaarten t-Test:

1. Differenzen berechnen: $d_i = \text{nachher}_i - \text{vorher}_i$
2. Nullen entfernen, Absolutdifferenzen rangieren.
3. Positive Raenge ($W^+$) und negative Raenge ($W^-$) summieren.
4. Teststatistik: $W = \min(W^+, W^-)$

**Normalapproximation (mit Bindungskorrektur):**

$$z = \frac{W - \frac{n(n+1)}{4}}{\sqrt{\frac{n(n+1)(2n+1)}{24} - \frac{\sum(t_i^3 - t_i)}{48}}}$$

**Effektgroesse:** $r = |z| / \sqrt{n}$

### 12.5.3 Kruskal-Wallis-H-Test

Eine rangbasierte Alternative zur einfaktoriellen ANOVA:

$$H = \frac{12}{N(N+1)} \sum_{j=1}^{k} \frac{R_j^2}{n_j} - 3(N + 1)$$

Mit Bindungskorrektur:

$$H_{korrigiert} = \frac{H}{1 - \frac{\sum(t_i^3 - t_i)}{N^3 - N}}$$

**Effektgroesse (Epsilon-Quadrat):**

$$\epsilon^2 = \frac{H - (k - 1)}{N - 1}$$

**Post-hoc: Dunns Test** mit Bonferroni-Korrektur wird automatisch angewendet, wenn der Omnibus-Test signifikant ist.

---

## 12.6 Chi-Quadrat-Tests

### 12.6.1 Anpassungstest (Goodness of Fit)

Prueft, ob beobachtete Haeufigkeiten erwarteten Haeufigkeiten entsprechen:

$$\chi^2 = \sum_{i=1}^{k} \frac{(O_i - E_i)^2}{E_i}$$

mit $df = k - 1$.

**Standardisierte Residuen:**

$$r_i = \frac{O_i - E_i}{\sqrt{E_i}}$$

Wenn keine erwarteten Haeufigkeiten angegeben werden, nimmt QDesigner eine Gleichverteilung an.

### 12.6.2 Unabhaengigkeitstest

Prueft, ob zwei kategoriale Variablen unabhaengig sind, mittels Kontingenztafel:

$$\chi^2 = \sum_{i=1}^{r} \sum_{j=1}^{c} \frac{(O_{ij} - E_{ij})^2}{E_{ij}}$$

wobei $E_{ij} = \frac{R_i \cdot C_j}{N}$, $df = (r-1)(c-1)$.

**Cramers V:**

$$V = \sqrt{\frac{\chi^2}{N \cdot (\min(r, c) - 1)}}$$

**Phi-Koeffizient** (fuer 2x2-Tafeln):

$$\phi = \sqrt{\frac{\chi^2}{N}}$$

### 12.6.3 Exakter Test nach Fisher

Fuer 2x2-Tafeln mit kleinen erwarteten Haeufigkeiten:

$$p = \frac{\binom{a+b}{a}\binom{c+d}{c}}{\binom{N}{a+c}} = \frac{(a+b)!(c+d)!(a+c)!(b+d)!}{N!a!b!c!d!}$$

QDesigner berechnet den zweiseitigen p-Wert durch Summation der Wahrscheinlichkeiten aller Tafeln mit einer Wahrscheinlichkeit kleiner oder gleich der beobachteten Tafel.

**Odds Ratio:**

$$OR = \frac{ad}{bc}$$

mit 95%-Konfidenzintervall nach der Woolf-Logit-Methode (Haldane-Korrektur fuer Nullzellen).

---

## 12.7 Post-hoc-Tests

### 12.7.1 Tukeys ehrlich signifikante Differenz (HSD)

Fuer paarweise Vergleiche nach signifikanter ANOVA:

$$q = \frac{|\bar{x}_i - \bar{x}_j|}{SE}, \quad SE = \sqrt{\frac{MQ_W}{2} \left(\frac{1}{n_i} + \frac{1}{n_j}\right)}$$

Verglichen mit der studentisierten Bereichsverteilung $q_{\alpha, k, df_W}$.

Jeder Vergleich berichtet: Mittelwertdifferenz, q-Statistik, p-Wert, Konfidenzintervall und Signifikanz.

### 12.7.2 Bonferroni-Korrektur

Adjustiert p-Werte fuer multiple Vergleiche:

$$p_{adjustiert} = \min(1, \; p \cdot m)$$

wobei *m* = Anzahl der Vergleiche.

### 12.7.3 Holm-Bonferroni-Korrektur (Step-Down)

Ein weniger konservatives schrittweises Verfahren:

1. p-Werte in aufsteigender Reihenfolge sortieren.
2. Fuer den *i*-t-kleinsten p-Wert: $p_{adjustiert}^{(i)} = \min\left(1, \; p_{(i)} \cdot (m - i + 1)\right)$
3. Monotonie erzwingen (adjustierte p-Werte koennen nicht abnehmen).

| Methode      | Kontrolle      | Power     | Konservativitaet |
|-------------|---------------|-----------|-----------------|
| Bonferroni   | FWER (streng)  | Niedrigste| Am konservativsten |
| Holm         | FWER (streng)  | Hoeher    | Weniger konservativ |
| Tukey HSD    | FWER           | Moderat   | Fuer paarweise konzipiert |

---

## 12.8 Effektgroessen

### 12.8.1 Cohens d

Standardisierte Mittelwertdifferenz mit gepoolter Standardabweichung:

$$d = \frac{\bar{x}_1 - \bar{x}_2}{s_p}, \quad s_p = \sqrt{\frac{(n_1 - 1)s_1^2 + (n_2 - 1)s_2^2}{n_1 + n_2 - 2}}$$

| d     | Interpretation       |
|------|---------------------|
| 0,2   | Kleiner Effekt       |
| 0,5   | Mittlerer Effekt     |
| 0,8   | Grosser Effekt       |

### 12.8.2 Hedges' g

Verzerrungskorrigierte Version von Cohens d:

$$g = d \cdot \left(1 - \frac{3}{4(n_1 + n_2 - 2) - 1}\right)$$

Hedges' g korrigiert die leichte Aufwaertsverzerrung in Cohens d, was besonders bei kleinen Stichproben wichtig ist.

### 12.8.3 Glass' Delta

Verwendet nur die Standardabweichung der Kontrollgruppe als Nenner:

$$\Delta = \frac{\bar{x}_T - \bar{x}_K}{s_K}$$

Dies ist angemessen, wenn die Behandlung sowohl die Varianz als auch den Mittelwert beeinflussen soll.

### 12.8.4 Cramers V

Effektgroesse fuer Chi-Quadrat-Tests (siehe Abschnitt 12.6.2):

$$V = \sqrt{\frac{\chi^2}{N(\min(r, c) - 1)}}$$

| V     | Interpretation (df* = 1) |
|------|-----------------------|
| 0,1   | Kleiner Effekt         |
| 0,3   | Mittlerer Effekt       |
| 0,5   | Grosser Effekt         |

### 12.8.5 Eta-Quadrat

Anteil erklaerter Varianz (ANOVA):

$$\eta^2 = \frac{QS_B}{QS_{gesamt}}$$

| Eta-Quadrat | Interpretation |
|------------|----------------|
| 0,01        | Klein          |
| 0,06        | Mittel         |
| 0,14        | Gross          |

### 12.8.6 Omega-Quadrat

Weniger verzerrte Alternative zu Eta-Quadrat:

$$\omega^2 = \frac{QS_B - df_B \cdot MQ_W}{QS_{gesamt} + MQ_W}$$

Omega-Quadrat liefert eine bessere Schaetzung der Populations-Effektgroesse, da es die positive Verzerrung korrigiert, die Eta-Quadrat innewohnt.

---

## 12.9 Reliabilitaetsanalyse

### 12.9.1 Cronbachs Alpha

Misst die interne Konsistenzreliabilitaet einer Skala:

$$\alpha = \frac{k}{k-1} \left(1 - \frac{\sum_{i=1}^{k} s_i^2}{s_{gesamt}^2}\right)$$

wobei *k* = Anzahl der Items, $s_i^2$ = Varianz von Item *i*, $s_{gesamt}^2$ = Varianz der Gesamtscores.

| Alpha     | Interpretation         |
|-----------|----------------------|
| > 0,90    | Exzellente Reliabilitaet |
| 0,80-0,89 | Gute Reliabilitaet     |
| 0,70-0,79 | Akzeptable Reliabilitaet |
| 0,60-0,69 | Fragwuerdig            |
| < 0,60    | Niedrige Reliabilitaet  |

### 12.9.2 Item-Gesamt-Korrelationen

Fuer jedes Item berechnet QDesigner die korrigierte Item-Gesamt-Korrelation (die Pearson-Korrelation zwischen dem Item und der Summe aller *anderen* Items). Items mit niedrigen Item-Gesamt-Korrelationen (< 0,30) gehoeren moeglicherweise nicht zum selben Konstrukt.

### 12.9.3 Alpha bei Item-Entfernung

Fuer jedes Item berechnet QDesigner, wie gross Cronbachs Alpha waere, wenn dieses Item entfernt wuerde. Wenn das Entfernen eines Items Alpha wesentlich erhoeht, sollte eine Entfernung aus der Skala erwogen werden.

### 12.9.4 Mittlere Inter-Item-Korrelation

Die durchschnittliche Pearson-Korrelation zwischen allen Item-Paaren:

$$\bar{r} = \frac{2}{k(k-1)} \sum_{i<j} r_{ij}$$

Optimaler Bereich: 0,15 - 0,50 (zu niedrig deutet darauf hin, dass Items nicht dasselbe Konstrukt messen; zu hoch deutet auf Redundanz hin).

### 12.9.5 Split-Half-Reliabilitaet

QDesigner berechnet die Split-Half-Reliabilitaet, indem Items in zwei Haelften geteilt und die Spearman-Brown-Prophezeiungsformel angewendet wird:

$$\rho_{SB} = \frac{2r_{12}}{1 + r_{12}}$$

wobei $r_{12}$ die Pearson-Korrelation zwischen den beiden Haelften-Scores ist.

---

## 12.10 Hauptkomponentenanalyse (PCA)

Die PCA reduziert die Dimensionalitaet multivariater Daten, indem sie orthogonale Komponenten findet, die maximale Varianz erfassen.

### 12.10.1 Ablauf

1. Alle Variablen zu **z-Scores standardisieren**.
2. Die **Korrelationsmatrix** berechnen.
3. **Eigenwerte und Eigenvektoren** extrahieren.
4. Komponenten nach Eigenwert (absteigend) sortieren.
5. Komponenten mittels **Kaiser-Kriterium** (Eigenwert > 1) oder einer festgelegten Anzahl auswaehlen.

### 12.10.2 Ausgaben

| Ausgabe              | Beschreibung                                         |
|---------------------|------------------------------------------------------|
| Eigenwerte           | Durch jede Komponente erklaerte Varianz              |
| Erklaerte Varianz    | Prozentsatz der Gesamtvarianz pro Komponente         |
| Kumulative Varianz   | Laufende Summe der erklaerten Varianz                |
| Faktorladungen       | Korrelation zwischen Variablen und Komponenten       |
| Kommunalitaeten      | Anteil der erklaerten Varianz jeder Variable         |

### 12.10.3 Kaiser-Kriterium

Standardmaessig behalt QDesigner Komponenten mit Eigenwerten groesser als 1 bei. Dieses Kriterium waehlt Komponenten aus, die mehr Varianz erklaeren als eine einzelne Originalvariable.

### 12.10.4 Screeplot

Das Analytics-Dashboard zeigt einen Screeplot (Eigenwerte vs. Komponentennummer), um den "Ellbogen" zu identifizieren, an dem zusaetzliche Komponenten abnehmende Ertraege liefern.

---

## 12.11 Statistisches Feedback fuer Teilnehmer

QDesigner kann Teilnehmern nach Abschluss des Fragebogens statistisches Echtzeit-Feedback geben. Dies ist nuetzlich fuer:

- **Lernstandserhebungen:** Scores und Perzentilraenge anzeigen.
- **Persoenlichkeitsinventare:** Profilergebnisse darstellen.
- **Gesundheits-Screening-Tools:** Risikokategorie-Feedback geben.

### 12.11.1 Feedback-Typen

| Typ            | Beispiel                                            |
|---------------|-----------------------------------------------------|
| Score-Zusammenfassung | "Ihr Gesamtscore betraegt 42 von 60."        |
| Perzentil      | "Sie haben besser als 75% der Teilnehmer abgeschnitten." |
| Kategorie      | "Ihr Angstniveau liegt im 'moderaten' Bereich." |
| Profildiagramm | Radardiagramm mit Scores ueber Subskalen.           |

### 12.11.2 Konfiguration

Feedback wird ueber das Variablensystem konfiguriert (siehe Kapitel 7). Berechnete Variablen koennen auf Antwortdaten verweisen, Formeln anwenden und Ergebnisse in einem Feedback-Block am Ende des Fragebogens anzeigen.

---

## 12.12 Datenexport

Der `ExportService` unterstuetzt acht Exportformate. Die drei Basisformate (CSV, JSON, Excel) erzeugen eigenstaendige Datendateien. Die fuenf Statistiksoftware-Formate (SPSS, R, Stata, SAS, Python) erzeugen jeweils ein `.zip`-Archiv mit der Datendatei und einem ausfuehrbereiten Analyseskript.

### 12.12.1 CSV

**Datei:** `.csv`

Standard-kommagetrennte Werte mit Kopfzeilen. Konfigurierbares Trennzeichen und Quotierungsoptionen.

```csv
sessionId,questionId,responseValue,reactionTime,isValid
abc-123,q1,4,1523.45,true
abc-123,q2,2,2104.12,true
```

### 12.12.2 Excel (XLSX)

**Datei:** `.xlsx`

Arbeitsmappe mit drei Blaettern:
- **Responses (Antworten):** Aufgeklappte Antwortdaten mit allen Spalten (Sitzungs-ID, Fragen-ID, Antwortwert, Reaktionszeit, Zeitstempel, Validitaet).
- **Sessions (Sitzungen):** Eine Zeile pro Sitzung mit Teilnehmer-ID, Status, Start-/Endzeitstempeln, Bearbeitungszeit und Geraetemetadaten.
- **Summary (Zusammenfassung):** Aggregierte Statistiken einschliesslich Antwortanzahl, Abschlussraten, mittlere/mediane Antwortzeiten und Aufschluesselung pro Frage.

Kopfzeilen werden mit Fettschrift und grauem Hintergrund formatiert. Spaltenbreiten werden automatisch fuer die Lesbarkeit angepasst.

### 12.12.3 JSON

**Datei:** `.json`

Strukturiertes JSON mit Metadaten, Daten-Array und optionalen Statistiken:

```json
{
  "metadata": { "exportDate": "...", "totalSessions": 150 },
  "data": [ ... ],
  "statistics": { ... }
}
```

### 12.12.4 SPSS

**Datei:** `.zip` mit `.csv` + `.sps`

Das SPSS-Paket enthaelt eine CSV-Datendatei und eine SPSS-Syntaxdatei. Die Syntaxdatei enthaelt:
- `GET DATA`-Befehl zum Import der CSV mit korrekten Variablentypen (`F8.2` fuer numerisch, `A255` fuer String).
- `VARIABLE LABELS` fuer lesbare Spaltennamen.
- `DESCRIPTIVES`- und `FREQUENCIES`-Befehle fuer die erste Exploration.
- `EXECUTE`- und `SAVE OUTFILE`-Befehle zum Speichern als `.sav`.

### 12.12.5 R

**Datei:** `.zip` mit `.csv` + `.R`

Das R-Paket enthaelt eine CSV-Datendatei und ein vollstaendiges R-Analyseskript. Das Skript enthaelt:
- Bibliotheksimporte (`dplyr`, `ggplot2`, `psych`, `readr`).
- `read_csv()`-Befehl zum Laden der Datendatei.
- Zusammenfassungs- und deskriptive Statistikbefehle (`summary()`, `describe()`).
- Korrelationsanalyse und grundlegenden Visualisierungscode.
- Speicherbefehle fuer `.RData` und verarbeitete `.csv`.

### 12.12.6 Python

**Datei:** `.zip` mit `.csv` + `.py`

Das Python-Paket enthaelt eine CSV-Datendatei und ein vollstaendiges Analyseskript. Das Skript enthaelt:
- Bibliotheksimporte (`pandas`, `numpy`, `matplotlib`, `seaborn`, `scipy`).
- `pd.read_csv()` zum Laden der Datendatei.
- Deskriptive Statistik und Korrelationsanalyse.
- Visualisierungscode (Histogramme, Streudiagramme, Boxplots).
- Speicherbefehle fuer `.csv` und `.pkl`.

### 12.12.7 Stata

**Datei:** `.zip` mit `.csv` + `.do`

Das Stata-Paket enthaelt eine CSV-Datendatei und eine Do-Datei. Die Do-Datei enthaelt:
- `import delimited`-Befehl zum Laden der CSV.
- Variablenlabels fuer alle Spalten.
- `describe`-, `summarize`- und `tabstat`-Befehle fuer die Exploration.
- `save`-Befehl zur Erstellung eines `.dta`-Datensatzes.

### 12.12.8 SAS

**Datei:** `.zip` mit `.csv` + `.sas`

Das SAS-Paket enthaelt eine CSV-Datendatei und ein SAS-Skript. Das Skript enthaelt:
- `PROC IMPORT` zum Einlesen der CSV-Daten.
- `PROC CONTENTS`-, `PROC MEANS`-, `PROC FREQ`-Befehle fuer die Datenexploration.
- `PROC PRINT` fuer Datenvorschau (erste 20 Beobachtungen).
- Permanente Datensatzerstellung via `LIBNAME` und `DATA`-Schritt.

### 12.12.9 Export-Konfiguration

| Option               | Typ      | Beschreibung                                 |
|---------------------|----------|----------------------------------------------|
| `format`             | string   | Ausgabeformat (csv, xlsx, json, spss, r, python, stata, sas) |
| `includeMetadata`    | boolean  | Sitzungs-/Geraetemetadaten einschliessen      |
| `includeRawData`     | boolean  | Rohe Antwortdaten einschliessen               |
| `includeStatistics`  | boolean  | Berechnete Statistiken einschliessen          |
| `delimiter`          | string   | CSV-Trennzeichen (Standard: `,`)             |
| `compression`        | string   | Optionale Komprimierung (gzip, zip)          |
| `encoding`           | string   | Zeichenkodierung (utf-8, utf-16, latin1)     |

### 12.12.10 Exportierte Datenstruktur

Jede Antwortzeile enthaelt:

| Spalte            | Beschreibung                             |
|------------------|------------------------------------------|
| `sessionId`       | Eindeutiger Sitzungsidentifier           |
| `questionnaireId` | Fragebogen-Identifier                    |
| `startTime`       | Sitzungsbeginn (ISO 8601)               |
| `endTime`         | Sitzungsende (ISO 8601) oder null        |
| `completionTime`  | Gesamtzeit (ms)                          |
| `participantId`   | Teilnehmer-Identifier                   |
| `responseIndex`   | Antwortreihenfolge innerhalb der Sitzung |
| `questionId`      | Fragen-Identifier                        |
| `responseValue`   | Der tatsaechliche Antwortwert            |
| `responseTime`    | Antwortzeit (ms)                         |
| `reactionTime`    | Stimulus-Onset-bis-Antwort-Zeit (ms)     |
| `timeOnQuestion`  | Gesamte auf die Frage verbrachte Zeit (ms)|
| `stimulusOnset`   | Stimulus-Onset-Zeitstempel (ms)          |
| `isValid`         | Ob die Antwort die Validierung bestanden hat |

---

## 12.13 Zusammenfassung

| Funktion                    | Implementierung                         | Schluesseldetails                |
|----------------------------|----------------------------------------|----------------------------------|
| Dashboard                   | Echtzeit-WebSocket/SSE-Monitoring       | 10+ konfigurierbare Metriken     |
| Deskriptive Statistik       | `calculateDescriptiveStats()`           | Mittelwert, Median, Modus, SD, Quartile, Schiefe, Kurtosis |
| Pearson-Korrelation         | `calculateCorrelation('pearson')`       | Mit Fisher-z-KI                  |
| Spearman-Korrelation        | `calculateCorrelation('spearman')`      | Rangbasiert                      |
| Kendalls Tau                | `calculateCorrelation('kendall')`       | Konkordant/diskordante Paare     |
| Einstichproben-t-Test       | `performTTest(data, null, mu0, 'one-sample')` | Mit Cohens d, Power        |
| Unabhaengiger t-Test        | `performTTest(d1, d2, 0, 'two-sample-independent')` | Welch-Korrektur     |
| Gepaarter t-Test            | `performTTest(d1, d2, 0, 'two-sample-paired')` | Differenzscores         |
| Einfaktorielle ANOVA        | `performANOVA(groups)`                  | F-Test, Eta-Quadrat              |
| Lineare Regression          | `performLinearRegression(x, y)`         | R-Quadrat, F-Test, Residuen      |
| Mann-Whitney-U              | `mannWhitneyU(g1, g2)`                 | Rang-biseriales r                |
| Wilcoxon-Vorzeichen-Rang    | `wilcoxonSignedRank(vorher, nachher)`   | Vorzeichen-Rang W, Effekt r      |
| Kruskal-Wallis-H            | `kruskalWallis(groups)`                 | Dunns Post-hoc                   |
| Chi-Quadrat-Anpassungstest  | `chiSquareGoodnessOfFit(observed)`       | Standardisierte Residuen        |
| Chi-Quadrat-Unabhaengigkeit | `chiSquareIndependence(table)`           | Cramers V, Phi                  |
| Exakter Test nach Fisher    | `fisherExactTest(table)`                 | Odds Ratio, 95%-KI             |
| Tukey HSD                   | `tukeyHSD(groups)`                       | Paarweise KIs                   |
| Bonferroni                  | `bonferroniCorrection(pValues)`          | FWER-Kontrolle                  |
| Holm-Bonferroni             | `holmBonferroni(pValues)`               | Step-Down-FWER-Kontrolle         |
| Cohens d                    | In t-Test-Ergebnissen integriert         | Gepoolte SD                     |
| Hedges' g                   | `hedgesG(g1, g2)`                       | Verzerrungskorrigiert            |
| Glass' Delta                | `glassDelta(behandlung, kontrolle)`      | Kontrollgruppen-SD              |
| Omega-Quadrat               | `omegaSquared(anovaResult)`              | Weniger verzerrt als Eta-Quadrat |
| Cronbachs Alpha             | `calculateCronbachAlpha(items)`          | Item-Analyse, Split-Half         |
| PCA                         | `performPCA(data, components)`           | Eigenwerte, Ladungen             |
| Export                      | `exportData(data, config)`               | 8 Formate (CSV, XLSX, JSON, SPSS, R, Python, Stata, SAS) |
