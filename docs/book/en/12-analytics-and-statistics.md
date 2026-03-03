# Chapter 12: Analytics and Statistics

QDesigner Modern includes a comprehensive built-in statistical engine that allows researchers to explore, analyze, and export their data without leaving the platform. This chapter covers the analytics dashboard, descriptive and inferential statistics, effect size measures, reliability analysis, principal component analysis, statistical feedback for participants, and data export.

---

## 12.1 Analytics Dashboard

The analytics dashboard provides a real-time overview of data collection progress and response quality.

### 12.1.1 Dashboard Metrics

| Metric                  | Description                                          |
|------------------------|------------------------------------------------------|
| `response_count`        | Total number of completed responses                  |
| `completion_rate`       | Percentage of started sessions that were completed   |
| `average_response_time` | Mean time to complete the questionnaire              |
| `median_response_time`  | Median completion time (robust to outliers)          |
| `abandonment_rate`      | Percentage of sessions that were abandoned           |
| `error_rate`            | Percentage of sessions with errors                   |
| `unique_participants`   | Number of distinct participants                      |
| `time_to_complete`      | Distribution of completion times                     |
| `performance_metrics`   | Rendering and network performance                    |

### 12.1.2 Session Monitoring

The dashboard supports real-time session monitoring through WebSocket or SSE connections:

- **Active sessions:** Currently in-progress sessions with live progress.
- **Session timeline:** Start times, page transitions, and completion events.
- **Geographic distribution:** Participant locations (based on IP geolocation, if enabled).
- **Device breakdown:** Desktop vs. mobile vs. tablet distribution.

### 12.1.3 Filtering and Time Ranges

All dashboard views support configurable time ranges:

| Preset           | Range                |
|-----------------|---------------------|
| `today`          | Current day          |
| `yesterday`      | Previous day         |
| `last_7_days`    | Past 7 days          |
| `last_30_days`   | Past 30 days         |
| `last_90_days`   | Past 90 days         |
| `custom`         | User-defined range   |

Filters can be applied by participant demographics, condition assignment, device type, completion status, and data quality flags.

---

## 12.2 Descriptive Statistics

The `StatisticalEngine` computes a comprehensive statistical summary for any numeric dataset.

### 12.2.1 Measures of Central Tendency

**Mean (arithmetic average):**

$$\bar{x} = \frac{1}{n} \sum_{i=1}^{n} x_i$$

**Median:** The middle value of the sorted dataset. For even *n*:

$$\tilde{x} = \frac{x_{(n/2)} + x_{(n/2 + 1)}}{2}$$

**Mode:** The most frequently occurring value(s). QDesigner returns all modal values when the distribution is multimodal.

### 12.2.2 Measures of Dispersion

**Variance (sample):**

$$s^2 = \frac{1}{n-1} \sum_{i=1}^{n} (x_i - \bar{x})^2$$

QDesigner uses Bessel's correction (dividing by *n - 1*) for unbiased sample variance estimation.

**Standard Deviation:**

$$s = \sqrt{s^2}$$

**Range:**

$$\text{Range} = x_{\max} - x_{\min}$$

### 12.2.3 Quartiles and Percentiles

Quartiles divide the sorted data into four equal parts:

| Quartile | Percentile | Description          |
|----------|-----------|----------------------|
| Q1       | 25th       | Lower quartile       |
| Q2       | 50th       | Median               |
| Q3       | 75th       | Upper quartile       |

QDesigner computes percentiles using linear interpolation:

$$P_k = x_{\lfloor i \rfloor} \cdot (1 - f) + x_{\lceil i \rceil} \cdot f$$

where $i = \frac{k}{100} \cdot (n - 1)$ and $f = i - \lfloor i \rfloor$.

Default percentiles computed: 5th, 10th, 25th, 75th, 90th, 95th.

### 12.2.4 Distribution Shape

**Skewness (Fisher-Pearson, adjusted):**

$$g_1 = \frac{n}{(n-1)(n-2)} \sum_{i=1}^{n} \left(\frac{x_i - \bar{x}}{s}\right)^3$$

| Value       | Interpretation          |
|------------|------------------------|
| $g_1 < 0$  | Left-skewed (long left tail) |
| $g_1 = 0$  | Symmetric               |
| $g_1 > 0$  | Right-skewed (long right tail) |

**Kurtosis (excess, Fisher):**

$$g_2 = \frac{n(n+1)}{(n-1)(n-2)(n-3)} \sum_{i=1}^{n} \left(\frac{x_i - \bar{x}}{s}\right)^4 - \frac{3(n-1)^2}{(n-2)(n-3)}$$

| Value       | Interpretation          |
|------------|------------------------|
| $g_2 < 0$  | Platykurtic (lighter tails than normal) |
| $g_2 = 0$  | Mesokurtic (normal-like) |
| $g_2 > 0$  | Leptokurtic (heavier tails than normal) |

### 12.2.5 Outlier Detection

Outliers are identified using the IQR method:

$$\text{Lower bound} = Q_1 - 1.5 \cdot IQR$$
$$\text{Upper bound} = Q_3 + 1.5 \cdot IQR$$

where $IQR = Q_3 - Q_1$. Any value below the lower bound or above the upper bound is classified as an outlier.

---

## 12.3 Correlation Analysis

QDesigner supports three correlation methods.

### 12.3.1 Pearson Product-Moment Correlation

Measures the linear relationship between two variables:

$$r = \frac{n \sum x_i y_i - \sum x_i \sum y_i}{\sqrt{(n \sum x_i^2 - (\sum x_i)^2)(n \sum y_i^2 - (\sum y_i)^2)}}$$

**Assumptions:** Continuous variables, linear relationship, bivariate normality.

**p-value:** Computed using the *t*-transformation:

$$t = r \sqrt{\frac{n - 2}{1 - r^2}}, \quad df = n - 2$$

### 12.3.2 Spearman Rank Correlation

Measures monotonic relationships using ranks:

$$\rho = r_{\text{Pearson}}(\text{rank}(x), \text{rank}(y))$$

QDesigner computes Spearman's rho by applying Pearson's formula to the ranked data, with tied ranks receiving the average rank.

**Assumptions:** Ordinal or continuous variables, monotonic relationship.

### 12.3.3 Kendall's Tau

Measures ordinal association based on concordant and discordant pairs:

$$\tau = \frac{C - D}{\binom{n}{2}} = \frac{C - D}{\frac{n(n-1)}{2}}$$

where *C* = concordant pairs and *D* = discordant pairs.

**Assumptions:** Ordinal variables, robust to outliers and non-normality.

### 12.3.4 Confidence Intervals

All correlation coefficients include 95% confidence intervals computed via Fisher's z-transformation:

$$z = \frac{1}{2} \ln\frac{1 + r}{1 - r}, \quad SE = \frac{1}{\sqrt{n - 3}}$$

$$CI_{95\%} = \tanh(z \pm 1.96 \cdot SE)$$

---

## 12.4 Parametric Tests

### 12.4.1 T-Tests

QDesigner implements three types of t-tests.

**One-Sample T-Test:**

Tests whether the sample mean differs from a hypothesized value:

$$t = \frac{\bar{x} - \mu_0}{s / \sqrt{n}}, \quad df = n - 1$$

**Two-Sample Independent T-Test (Welch's):**

Tests whether two independent group means differ:

$$t = \frac{\bar{x}_1 - \bar{x}_2}{\sqrt{\frac{s_1^2}{n_1} + \frac{s_2^2}{n_2}}}$$

Degrees of freedom (Welch-Satterthwaite):

$$df = \frac{\left(\frac{s_1^2}{n_1} + \frac{s_2^2}{n_2}\right)^2}{\frac{(s_1^2/n_1)^2}{n_1 - 1} + \frac{(s_2^2/n_2)^2}{n_2 - 1}}$$

**Paired T-Test:**

Tests whether the mean difference between paired observations is zero:

$$t = \frac{\bar{d}}{s_d / \sqrt{n}}, \quad df = n - 1$$

where $d_i = x_{1i} - x_{2i}$.

All t-tests report: test statistic, p-value, degrees of freedom, 95% confidence interval, effect size (Cohen's d), and power.

### 12.4.2 ANOVA (Analysis of Variance)

One-way ANOVA tests whether three or more group means are equal:

**Sum of Squares Between (SSB):**

$$SS_B = \sum_{j=1}^{k} n_j (\bar{x}_j - \bar{x})^2$$

**Sum of Squares Within (SSW):**

$$SS_W = \sum_{j=1}^{k} \sum_{i=1}^{n_j} (x_{ij} - \bar{x}_j)^2$$

**F-Statistic:**

$$F = \frac{SS_B / (k - 1)}{SS_W / (N - k)} = \frac{MS_B}{MS_W}$$

where *k* = number of groups, *N* = total sample size.

**Effect size (eta-squared):**

$$\eta^2 = \frac{SS_B}{SS_B + SS_W}$$

### 12.4.3 Linear Regression

Simple linear regression models the relationship between a predictor and an outcome:

$$\hat{y} = \beta_0 + \beta_1 x$$

**Slope:**

$$\beta_1 = \frac{\sum_{i=1}^{n} (x_i - \bar{x})(y_i - \bar{y})}{\sum_{i=1}^{n} (x_i - \bar{x})^2}$$

**Intercept:**

$$\beta_0 = \bar{y} - \beta_1 \bar{x}$$

**R-squared:**

$$R^2 = 1 - \frac{SS_{res}}{SS_{tot}} = 1 - \frac{\sum(y_i - \hat{y}_i)^2}{\sum(y_i - \bar{y})^2}$$

**Adjusted R-squared:**

$$R^2_{adj} = 1 - \frac{(1 - R^2)(n - 1)}{n - 2}$$

QDesigner reports: coefficients, standard errors, t-statistics, p-values, residuals, R-squared, adjusted R-squared, and overall model F-test.

---

## 12.5 Non-Parametric Tests

### 12.5.1 Mann-Whitney U Test

A rank-based alternative to the independent samples t-test:

$$U_1 = R_1 - \frac{n_1(n_1 + 1)}{2}$$

where $R_1$ is the sum of ranks for group 1.

**Normal approximation (with tie correction):**

$$z = \frac{U_1 - \frac{n_1 n_2}{2}}{\sqrt{\frac{n_1 n_2}{12}\left(N + 1 - \frac{\sum(t_i^3 - t_i)}{N(N-1)}\right)}}$$

where $t_i$ = size of the *i*-th tie group.

**Effect size:** $r = |z| / \sqrt{N}$

**Rank-biserial correlation:** $(U_1 - U_2) / (n_1 \cdot n_2)$

### 12.5.2 Wilcoxon Signed-Rank Test

A rank-based alternative to the paired t-test:

1. Compute differences: $d_i = \text{after}_i - \text{before}_i$
2. Remove zeros, rank absolute differences.
3. Sum positive ranks ($W^+$) and negative ranks ($W^-$).
4. Test statistic: $W = \min(W^+, W^-)$

**Normal approximation (with tie correction):**

$$z = \frac{W - \frac{n(n+1)}{4}}{\sqrt{\frac{n(n+1)(2n+1)}{24} - \frac{\sum(t_i^3 - t_i)}{48}}}$$

**Effect size:** $r = |z| / \sqrt{n}$

### 12.5.3 Kruskal-Wallis H Test

A rank-based alternative to one-way ANOVA:

$$H = \frac{12}{N(N+1)} \sum_{j=1}^{k} \frac{R_j^2}{n_j} - 3(N + 1)$$

With tie correction:

$$H_{corrected} = \frac{H}{1 - \frac{\sum(t_i^3 - t_i)}{N^3 - N}}$$

**Effect size (epsilon-squared):**

$$\epsilon^2 = \frac{H - (k - 1)}{N - 1}$$

**Post-hoc: Dunn's test** with Bonferroni correction is automatically applied when the omnibus test is significant.

---

## 12.6 Chi-Square Tests

### 12.6.1 Goodness of Fit

Tests whether observed frequencies match expected frequencies:

$$\chi^2 = \sum_{i=1}^{k} \frac{(O_i - E_i)^2}{E_i}$$

with $df = k - 1$.

**Standardized residuals:**

$$r_i = \frac{O_i - E_i}{\sqrt{E_i}}$$

If expected frequencies are not provided, QDesigner assumes a uniform distribution.

### 12.6.2 Test of Independence

Tests whether two categorical variables are independent using a contingency table:

$$\chi^2 = \sum_{i=1}^{r} \sum_{j=1}^{c} \frac{(O_{ij} - E_{ij})^2}{E_{ij}}$$

where $E_{ij} = \frac{R_i \cdot C_j}{N}$, $df = (r-1)(c-1)$.

**Cramer's V:**

$$V = \sqrt{\frac{\chi^2}{N \cdot (\min(r, c) - 1)}}$$

**Phi coefficient** (for 2x2 tables):

$$\phi = \sqrt{\frac{\chi^2}{N}}$$

### 12.6.3 Fisher's Exact Test

For 2x2 tables with small expected frequencies:

$$p = \frac{\binom{a+b}{a}\binom{c+d}{c}}{\binom{N}{a+c}} = \frac{(a+b)!(c+d)!(a+c)!(b+d)!}{N!a!b!c!d!}$$

QDesigner computes the two-tailed p-value by summing probabilities of all tables with probability less than or equal to the observed table.

**Odds ratio:**

$$OR = \frac{ad}{bc}$$

with 95% confidence interval using the Woolf logit method (Haldane correction for zero cells).

---

## 12.7 Post-Hoc Tests

### 12.7.1 Tukey's Honestly Significant Difference (HSD)

For pairwise comparisons after a significant ANOVA:

$$q = \frac{|\bar{x}_i - \bar{x}_j|}{SE}, \quad SE = \sqrt{\frac{MS_W}{2} \left(\frac{1}{n_i} + \frac{1}{n_j}\right)}$$

Compared against the studentized range distribution $q_{\alpha, k, df_W}$.

Each comparison reports: mean difference, q-statistic, p-value, confidence interval, and significance.

### 12.7.2 Bonferroni Correction

Adjusts p-values for multiple comparisons:

$$p_{adjusted} = \min(1, \; p \cdot m)$$

where *m* = number of comparisons.

### 12.7.3 Holm-Bonferroni (Step-Down) Correction

A less conservative step-down procedure:

1. Sort p-values in ascending order.
2. For the *i*-th smallest p-value: $p_{adjusted}^{(i)} = \min\left(1, \; p_{(i)} \cdot (m - i + 1)\right)$
3. Enforce monotonicity (adjusted p-values cannot decrease).

| Method      | Control       | Power    | Conservatism |
|------------|---------------|----------|--------------|
| Bonferroni  | FWER (strong) | Lowest   | Most conservative |
| Holm        | FWER (strong) | Higher   | Less conservative |
| Tukey HSD   | FWER          | Moderate | Designed for pairwise |

---

## 12.8 Effect Sizes

### 12.8.1 Cohen's d

Standardized mean difference using pooled standard deviation:

$$d = \frac{\bar{x}_1 - \bar{x}_2}{s_p}, \quad s_p = \sqrt{\frac{(n_1 - 1)s_1^2 + (n_2 - 1)s_2^2}{n_1 + n_2 - 2}}$$

| d     | Interpretation     |
|------|--------------------|
| 0.2   | Small effect       |
| 0.5   | Medium effect      |
| 0.8   | Large effect       |

### 12.8.2 Hedges' g

Bias-corrected version of Cohen's d:

$$g = d \cdot \left(1 - \frac{3}{4(n_1 + n_2 - 2) - 1}\right)$$

Hedges' g corrects for the slight upward bias in Cohen's d, especially important for small samples.

### 12.8.3 Glass's Delta

Uses only the control group standard deviation as the denominator:

$$\Delta = \frac{\bar{x}_T - \bar{x}_C}{s_C}$$

This is appropriate when the treatment is expected to affect the variance as well as the mean.

### 12.8.4 Cramer's V

Effect size for chi-square tests (see Section 12.6.2):

$$V = \sqrt{\frac{\chi^2}{N(\min(r, c) - 1)}}$$

| V     | Interpretation (df* = 1) |
|------|-----------------------|
| 0.1   | Small effect          |
| 0.3   | Medium effect         |
| 0.5   | Large effect          |

### 12.8.5 Eta-Squared

Proportion of variance explained (ANOVA):

$$\eta^2 = \frac{SS_B}{SS_{total}}$$

| eta-squared | Interpretation |
|-----------|----------------|
| 0.01       | Small          |
| 0.06       | Medium         |
| 0.14       | Large          |

### 12.8.6 Omega-Squared

Less biased alternative to eta-squared:

$$\omega^2 = \frac{SS_B - df_B \cdot MS_W}{SS_{total} + MS_W}$$

Omega-squared provides a better estimate of the population effect size because it corrects for the positive bias inherent in eta-squared.

---

## 12.9 Reliability Analysis

### 12.9.1 Cronbach's Alpha

Measures internal consistency reliability of a scale:

$$\alpha = \frac{k}{k-1} \left(1 - \frac{\sum_{i=1}^{k} s_i^2}{s_{total}^2}\right)$$

where *k* = number of items, $s_i^2$ = variance of item *i*, $s_{total}^2$ = variance of total scores.

| Alpha    | Interpretation         |
|----------|----------------------|
| > 0.90   | Excellent reliability  |
| 0.80-0.89| Good reliability       |
| 0.70-0.79| Acceptable reliability |
| 0.60-0.69| Questionable           |
| < 0.60   | Poor reliability       |

### 12.9.2 Item-Total Correlations

For each item, QDesigner computes the corrected item-total correlation (the Pearson correlation between the item and the sum of all *other* items). Items with low item-total correlations (< 0.30) may not belong to the same construct.

### 12.9.3 Alpha If Item Deleted

For each item, QDesigner computes what Cronbach's alpha would be if that item were removed. If removing an item substantially increases alpha, consider removing it from the scale.

### 12.9.4 Mean Inter-Item Correlation

The average Pearson correlation between all pairs of items:

$$\bar{r} = \frac{2}{k(k-1)} \sum_{i<j} r_{ij}$$

Optimal range: 0.15 - 0.50 (too low suggests items don't measure the same construct; too high suggests redundancy).

### 12.9.5 Split-Half Reliability

QDesigner computes split-half reliability by dividing items into two halves and applying the Spearman-Brown prophecy formula:

$$\rho_{SB} = \frac{2r_{12}}{1 + r_{12}}$$

where $r_{12}$ is the Pearson correlation between the two half-scores.

---

## 12.10 Principal Component Analysis (PCA)

PCA reduces the dimensionality of multivariate data by finding orthogonal components that capture maximum variance.

### 12.10.1 Process

1. **Standardize** all variables to z-scores.
2. Compute the **correlation matrix**.
3. Extract **eigenvalues and eigenvectors**.
4. Sort components by eigenvalue (descending).
5. Select components using the **Kaiser criterion** (eigenvalue > 1) or a specified number.

### 12.10.2 Outputs

| Output              | Description                                          |
|--------------------|------------------------------------------------------|
| Eigenvalues         | Variance explained by each component                 |
| Explained variance  | Percentage of total variance per component           |
| Cumulative variance | Running total of explained variance                  |
| Factor loadings     | Correlation between variables and components         |
| Communalities       | Proportion of each variable's variance explained     |

### 12.10.3 Kaiser Criterion

By default, QDesigner retains components with eigenvalues greater than 1. This criterion selects components that explain more variance than a single original variable.

### 12.10.4 Scree Plot

The analytics dashboard displays a scree plot (eigenvalues vs. component number) to help identify the "elbow" where adding more components yields diminishing returns.

---

## 12.11 Statistical Feedback for Participants

QDesigner can provide real-time statistical feedback to participants after they complete the questionnaire. This is useful for:

- **Educational assessments:** Show scores and percentile ranks.
- **Personality inventories:** Display profile results.
- **Health screening tools:** Provide risk category feedback.

### 12.11.1 Feedback Types

| Type          | Example                                         |
|--------------|------------------------------------------------|
| Score summary | "Your total score is 42 out of 60."            |
| Percentile    | "You scored higher than 75% of participants."  |
| Category      | "Your anxiety level is in the 'moderate' range."|
| Profile chart | Radar chart showing scores across subscales.    |

### 12.11.2 Configuration

Feedback is configured using the variable system (see Chapter 7). Computed variables can reference response data, apply formulas, and display results in a feedback block at the end of the questionnaire.

---

## 12.12 Data Export

The `ExportService` supports eight export formats. The three basic formats (CSV, JSON, Excel) produce standalone data files. The five statistical software formats (SPSS, R, Stata, SAS, Python) each produce a `.zip` archive containing the data file plus a ready-to-run analysis script.

### 12.12.1 CSV

**File:** `.csv`

Standard comma-separated values with headers. Configurable delimiter and quoting options.

```csv
sessionId,questionId,responseValue,reactionTime,isValid
abc-123,q1,4,1523.45,true
abc-123,q2,2,2104.12,true
```

### 12.12.2 Excel (XLSX)

**File:** `.xlsx`

Multi-sheet workbook with three sheets:
- **Responses:** Flattened response data with all columns (session ID, question ID, response value, reaction time, timestamps, validity).
- **Sessions:** One row per session with participant ID, status, start/end timestamps, completion time, and device metadata.
- **Summary:** Aggregate statistics including response counts, completion rates, mean/median response times, and per-question breakdowns.

Headers are styled with bold font and gray background. Columns are auto-sized for readability.

### 12.12.3 JSON

**File:** `.json`

Structured JSON with metadata, data array, and optional statistics:

```json
{
  "metadata": { "exportDate": "...", "totalSessions": 150 },
  "data": [ ... ],
  "statistics": { ... }
}
```

### 12.12.4 SPSS

**File:** `.zip` containing `.csv` + `.sps`

The SPSS bundle includes a CSV data file and an SPSS syntax file. The syntax file contains:
- `GET DATA` command to import the CSV with correct variable types (`F8.2` for numeric, `A255` for string).
- `VARIABLE LABELS` for human-readable column names.
- `DESCRIPTIVES` and `FREQUENCIES` commands for initial exploration.
- `EXECUTE` and `SAVE OUTFILE` commands to save as `.sav`.

### 12.12.5 R

**File:** `.zip` containing `.csv` + `.R`

The R bundle includes a CSV data file and a complete R analysis script. The script contains:
- Library imports (`dplyr`, `ggplot2`, `psych`, `readr`).
- `read_csv()` command to load the data file.
- Summary and descriptive statistics commands (`summary()`, `describe()`).
- Correlation analysis and basic visualization code.
- Save commands for `.RData` and processed `.csv`.

### 12.12.6 Python

**File:** `.zip` containing `.csv` + `.py`

The Python bundle includes a CSV data file and a complete analysis script. The script contains:
- Library imports (`pandas`, `numpy`, `matplotlib`, `seaborn`, `scipy`).
- `pd.read_csv()` to load the data file.
- Descriptive statistics and correlation analysis.
- Visualization code (histograms, scatter plots, box plots).
- Save commands for `.csv` and `.pkl`.

### 12.12.7 Stata

**File:** `.zip` containing `.csv` + `.do`

The Stata bundle includes a CSV data file and a do-file. The do-file contains:
- `import delimited` command to load the CSV.
- Variable labels for all columns.
- `describe`, `summarize`, and `tabstat` commands for exploration.
- `save` command to create a `.dta` dataset.

### 12.12.8 SAS

**File:** `.zip` containing `.csv` + `.sas`

The SAS bundle includes a CSV data file and a SAS script. The script contains:
- `PROC IMPORT` to read the CSV data.
- `PROC CONTENTS`, `PROC MEANS`, `PROC FREQ` commands for data exploration.
- `PROC PRINT` for data preview (first 20 observations).
- Permanent dataset creation via `LIBNAME` and `DATA` step.

### 12.12.9 Export Configuration

| Option              | Type     | Description                                  |
|--------------------|----------|----------------------------------------------|
| `format`            | string   | Output format (csv, xlsx, json, spss, r, python, stata, sas) |
| `includeMetadata`   | boolean  | Include session/device metadata              |
| `includeRawData`    | boolean  | Include raw response data                    |
| `includeStatistics` | boolean  | Include computed statistics                  |
| `delimiter`         | string   | CSV delimiter character (default: `,`)       |
| `compression`       | string   | Optional compression (gzip, zip)             |
| `encoding`          | string   | Character encoding (utf-8, utf-16, latin1)   |

### 12.12.10 Exported Data Structure

Each response row contains:

| Column           | Description                              |
|-----------------|------------------------------------------|
| `sessionId`      | Unique session identifier                |
| `questionnaireId`| Questionnaire identifier                 |
| `startTime`      | Session start (ISO 8601)                 |
| `endTime`        | Session end (ISO 8601) or null           |
| `completionTime` | Total time (ms)                          |
| `participantId`  | Participant identifier                   |
| `responseIndex`  | Response order within session            |
| `questionId`     | Question identifier                      |
| `responseValue`  | The actual response                      |
| `responseTime`   | Time to respond (ms)                     |
| `reactionTime`   | Stimulus-onset-to-response time (ms)     |
| `timeOnQuestion` | Total time spent on question (ms)        |
| `stimulusOnset`  | Stimulus onset timestamp (ms)            |
| `isValid`        | Whether the response passed validation   |

---

## 12.13 Summary

| Feature                   | Implementation                          | Key Details                    |
|--------------------------|----------------------------------------|-------------------------------|
| Dashboard                 | Real-time WebSocket/SSE monitoring      | 10+ configurable metrics       |
| Descriptive stats         | `calculateDescriptiveStats()`           | Mean, median, mode, SD, quartiles, skewness, kurtosis |
| Pearson correlation        | `calculateCorrelation('pearson')`       | With Fisher z CI               |
| Spearman correlation       | `calculateCorrelation('spearman')`      | Rank-based                     |
| Kendall tau                | `calculateCorrelation('kendall')`       | Concordant/discordant pairs    |
| One-sample t-test          | `performTTest(data, null, mu0, 'one-sample')` | With Cohen's d, power   |
| Independent t-test         | `performTTest(d1, d2, 0, 'two-sample-independent')` | Welch's correction |
| Paired t-test              | `performTTest(d1, d2, 0, 'two-sample-paired')` | Difference scores     |
| One-way ANOVA              | `performANOVA(groups)`                  | F-test, eta-squared            |
| Linear regression          | `performLinearRegression(x, y)`         | R-squared, F-test, residuals   |
| Mann-Whitney U             | `mannWhitneyU(g1, g2)`                 | Rank-biserial r                |
| Wilcoxon signed-rank       | `wilcoxonSignedRank(before, after)`     | Signed-rank W, effect r        |
| Kruskal-Wallis H           | `kruskalWallis(groups)`                 | Dunn's post-hoc                |
| Chi-square GoF             | `chiSquareGoodnessOfFit(observed)`       | Standardized residuals         |
| Chi-square independence    | `chiSquareIndependence(table)`           | Cramer's V, phi               |
| Fisher exact               | `fisherExactTest(table)`                 | Odds ratio, 95% CI            |
| Tukey HSD                  | `tukeyHSD(groups)`                       | Pairwise CIs                  |
| Bonferroni                 | `bonferroniCorrection(pValues)`          | FWER control                  |
| Holm-Bonferroni            | `holmBonferroni(pValues)`               | Step-down FWER control         |
| Cohen's d                  | Built into t-test results                | Pooled SD                     |
| Hedges' g                  | `hedgesG(g1, g2)`                       | Bias-corrected                 |
| Glass's delta              | `glassDelta(treatment, control)`         | Control SD                    |
| Omega-squared              | `omegaSquared(anovaResult)`              | Less biased than eta-squared   |
| Cronbach's alpha           | `calculateCronbachAlpha(items)`          | Item analysis, split-half      |
| PCA                        | `performPCA(data, components)`           | Eigenvalues, loadings          |
| Export                     | `exportData(data, config)`               | 8 formats (CSV, XLSX, JSON, SPSS, R, Python, Stata, SAS) |
