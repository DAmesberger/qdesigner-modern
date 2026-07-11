# Kapitel 6: Fragetypen-Referenz

QDesigner bietet 16 Fragetypen, organisiert in zwei Modulkategorien: **Anzeige** (Inhaltsmodule ohne Antworterfassung) und **Fragen** (interaktive Module zur Erfassung von Nutzereingaben). Jeder Typ ist als eigenstaendiges Modul mit Laufzeit- und Designer-Komponenten, einer Metadaten-Definition und einem Antworttyp-Schema implementiert.

Dieses Kapitel dokumentiert jeden Fragetyp mit seinem Zweck, seinen Konfigurationsoptionen, Validierungsregeln, dem Antwortdatenformat und praktischen Anwendungsfaellen.

---

## 6.1 Anzeige-Module

Anzeige-Module praesentieren Informationen. Sie erfassen keine Antworten, koennen aber Variablen, Bedingungen und Timing verwenden.

### Textanzeige

**Typkennung**: `text-display`
**Kategorie**: Anzeige
**Zweck**: Formatierten Text mit Markdown-Rendering und Variableninterpolation anzeigen.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `content` | string | Willkommens-Markdown | Der anzuzeigende Text. Unterstuetzt vollstaendige Markdown-Syntax. |
| `format` | `'text' \| 'markdown' \| 'html'` | `'markdown'` | Rendering-Format. |
| `variables` | boolean | `false` | `{{variableName}}`-Substitution aktivieren. |
| `styling.fontSize` | string | `'1rem'` | Schriftgroesse. |
| `styling.textAlign` | `'left' \| 'center' \| 'right'` | `'left'` | Textausrichtung. |
| `autoAdvance.enabled` | boolean | `false` | Automatisch weiterschalten. |
| `autoAdvance.delay` | number | `5000` | Verzoegerung in Millisekunden. |

**Anwendungsfaelle**: Willkommensbildschirme, Einwilligungserklaerungen, Debriefing-Texte, Aufgabenanweisungen, personalisierte Rueckmeldungen mit `{{Variablen}}`.

---

### Textanweisung

**Typkennung**: `text-instruction`
**Kategorie**: Anzeige
**Zweck**: Anweisungstext mit Variableninterpolation und optionalem automatischen Weiterschalten anzeigen.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `content` | string | Platzhaltertext | Anweisungsinhalt (Markdown). |
| `variables` | boolean | `true` | Variablensubstitution (standardmaessig aktiviert). |
| `navigation.showNext` | boolean | `true` | Weiter-Schaltflaeche anzeigen. |
| `navigation.autoAdvance` | boolean | `false` | Automatisch weiterschalten. |

**Anwendungsfaelle**: Aufgabenanweisungen vor experimentellen Bloecken, informierte Einwilligung, Anleitung waehrend des Fragebogens.

---

### Balkendiagramm

**Typkennung**: `bar-chart`
**Kategorie**: Anzeige
**Zweck**: Daten als vertikale oder horizontale Balken mit optionalen Fehlerbalken visualisieren.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `orientation` | `'vertical' \| 'horizontal'` | `'horizontal'` | Balkenausrichtung. |
| `showErrorBars` | boolean | `false` | Fehlerbalken anzeigen. |
| `errorType` | string | `'standardError'` | Fehlerbalkentyp. |
| `stacked` | boolean | `false` | Gestapelte Balken. |
| `showValues` | boolean | `true` | Werte auf Balken anzeigen. |

**Anwendungsfaelle**: Aggregierte Ergebnisse, Vergleichsdaten, Leistungsmetriken, Kohortenvergleiche.

---

### Statistische Rueckmeldung

**Typkennung**: `statistical-feedback`
**Kategorie**: Anzeige
**Zweck**: Konfigurierbares Echtzeit-Statistik-Feedback-Panel mit mehreren Datenquellenmodi.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `title` | string | `'Statistical Feedback'` | Panel-Titel. |
| `chartType` | `'bar' \| 'line'` | `'bar'` | Visualisierungstyp. |
| `sourceMode` | string | `'current-session'` | Datenquelle: `current-session`, `cohort`, `participant-vs-cohort`, `participant-vs-participant`. |
| `metric` | string | `'mean'` | Aggregation: `count`, `mean`, `median`, `std_dev`, `p90`, `p95`, `p99`, `z_score`. |
| `showPercentile` | boolean | `true` | Perzentilrang anzeigen. |
| `showSummary` | boolean | `true` | Zusammenfassungsstatistiken anzeigen. |

**Anwendungsfaelle**: Leistung relativ zu anderen zeigen, Reaktionszeitstatistiken, normatives Feedback, Debriefing mit aggregierten Daten.

---

## 6.2 Eingabe-Fragen

### Texteingabe

**Typkennung**: `text-input`
**Antworttyp**: TEXT (string)
**Zweck**: Freitextantworten erfassen, von einzeiligen Antworten bis zu mehrzeiligen Essays.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `prompt` | string | -- | Fragetext (Markdown, Variablen). |
| `placeholder` | string | `'Enter your response...'` | Platzhaltertext. |
| `multiline` | boolean | `false` | Textbereich statt einzeiliger Eingabe. |
| `rows` | number | `3` | Sichtbare Zeilen im Mehrzeilenmodus. |
| `maxLength` | number | `500` | Maximale Zeichenanzahl. |

**Validierung**: `required`, `minLength`, `maxLength`, `pattern`, benutzerdefinierte Regeln.

**Antwortformat**: `{ "value": "string", "length": 42 }`

**Anwendungsfaelle**: Offene Fragen, demografische Felder, Essayantworten, qualitatives Feedback.

---

### Zahleneingabe

**Typkennung**: `number-input`
**Antworttyp**: NUMBER (number)
**Zweck**: Numerische Antworten mit Praezisionssteuerung, Bereichsvalidierung und optionaler Formatierung erfassen.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `prompt` | string | -- | Fragetext. |
| `placeholder` | string | `'Enter a number...'` | Platzhalter. |
| `min` | number | -- | Mindestwert. |
| `max` | number | -- | Hoechstwert. |
| `step` | number | `1` | Schrittweite. |
| `prefix` | string | `''` | Praefix (z.B. "EUR"). |
| `suffix` | string | `''` | Suffix (z.B. "kg"). |
| `showSpinButtons` | boolean | `true` | Erhoehen/Verringern-Schaltflaechen. |

**Anwendungsfaelle**: Alter, Einkommen, physische Messungen, Zaehlungsdaten.

---

## 6.3 Auswahl-Fragen

### Einfachauswahl

**Typkennung**: `multiple-choice` (mit `response.type: 'single'`)
**Antworttyp**: SINGLE_CHOICE (string)
**Zweck**: Eine Liste von Optionen praesentieren, aus der genau eine ausgewaehlt wird.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `options` | ChoiceOption[] | 3 Standardoptionen | Auswahloptionen. |
| `layout` | `'vertical' \| 'horizontal' \| 'grid'` | `'vertical'` | Optionenlayout. |
| `showOther` | boolean | -- | "Sonstiges"-Freitextoption. |
| `randomizeOptions` | boolean | `false` | Optionsreihenfolge mischen. |

**ChoiceOption-Struktur**: `{ id, label, value, code?, image?, hotkey?, exclusive? }`

**Antwortformat**: `{ "selectedId": "opt-2", "selectedLabel": "Stimme zu", "selectedValue": 4 }`

**Anwendungsfaelle**: Demografische Fragen, Likert-Items als Radiobuttons, Forced-Choice-Paradigmen.

---

### Mehrfachauswahl

**Typkennung**: `multiple-choice` (mit `response.type: 'multiple'`)
**Antworttyp**: MULTIPLE_CHOICE (array)

Dasselbe Modul wie Einfachauswahl, erlaubt aber mehrere Selektionen.

**Zusaetzliche Eigenschaften**: `minSelections`, `maxSelections`, `selectAllOption`.

**Antwortformat**: `{ "selectedIds": [...], "selectedLabels": [...], "selectedValues": [...] }`

**Anwendungsfaelle**: "Alles Zutreffende auswaehlen"-Fragen, Symptomchecklisten, Mehrfachinteressen-Umfragen.

---

## 6.4 Skalen-Fragen

### Skala

**Typkennung**: `scale`
**Antworttyp**: LIKERT_SCALE (number)
**Zweck**: Antworten auf einer numerischen Skala mit beschrifteten Endpunkten und mehreren Darstellungsstilen erfassen.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `min` | number | `1` | Skalenminimum. |
| `max` | number | `7` | Skalenmaximum. |
| `step` | number | `1` | Schrittweite. |
| `labels.min` | string | `'Stimme ueberhaupt nicht zu'` | Linkes Label. |
| `labels.max` | string | `'Stimme voll zu'` | Rechtes Label. |
| `style` | `'slider' \| 'buttons' \| 'visual-analog'` | `'buttons'` | Darstellungsstil. |

**Darstellungsstile**:
- **Buttons**: Diskrete nummerierte Schaltflaechen (klassische Likert-Skala).
- **Slider**: Ein kontinuierlicher Schieberegler.
- **Visual Analog**: Eine kontinuierliche Linie (VAS), haeufig in der Schmerzforschung verwendet.

**Anwendungsfaelle**: Likert-Skalen, Visuelle Analogskalen (VAS), Net Promoter Score, ordinale oder intervallskalierte Messungen.

---

### Bewertung

**Typkennung**: `rating`
**Antworttyp**: LIKERT_SCALE (number)
**Zweck**: Ikonische Bewertung mit Sternen, Herzen, Daumen oder Zahlen mit optionaler Halbschritt-Praezision.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `levels` | number | `5` | Anzahl der Bewertungsstufen. |
| `style` | `'stars' \| 'hearts' \| 'thumbs' \| 'numeric'` | `'stars'` | Icon-Stil. |
| `allowHalf` | boolean | `false` | Halbschritte erlauben (z.B. 3,5 Sterne). |

**Anwendungsfaelle**: Zufriedenheitsbewertungen, Inhaltsqualitaet, Nutzererfahrungsbewertung.

---

## 6.5 Erweiterte Fragen

### Matrix

**Typkennung**: `matrix`
**Antworttyp**: MATRIX (object)
**Zweck**: Rasterbasierte Fragen, bei denen Teilnehmer mehrere Items auf denselben Antwortoptionen bewerten.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `rows` | `{id, label}[]` | 2 Items | Zeilendefinitionen (zu bewertende Items). |
| `columns` | `{id, label, value?}[]` | 5-Punkt-Likert | Spaltendefinitionen (Antwortoptionen). |
| `responseType` | `'single' \| 'multiple' \| 'text' \| 'number'` | `'single'` | Zellen-Antworttyp. |

**Standardkonfiguration**: Eine 5-Punkt-Likert-Skala (Stimme ueberhaupt nicht zu bis Stimme voll zu) fuer 2 Items.

**Aggregationen**: row_means, column_means, correlation_matrix.

**Anwendungsfaelle**: Multi-Item-Likert-Batterien, semantische Differentiale, Multi-Attribut-Bewertung.

---

### Rangfolge

**Typkennung**: `ranking`
**Antworttyp**: RANKING (array)
**Zweck**: Drag-and-Drop-Rangfolgeaufgabe zum Ordnen von Items nach Praeferenz oder Wichtigkeit.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `items` | `{id, label}[]` | 4 Items | Zu ordnende Items. |
| `allowPartial` | boolean | `true` | Unvollstaendige Rangfolgen erlauben. |
| `tieBreaking` | boolean | `false` | Gleichstufungen erlauben. |
| `showNumbers` | boolean | `true` | Rangnummern anzeigen. |

**Aggregationen**: average_rank, top_positions, kendall_tau, spearman_rho.

**Anwendungsfaelle**: Praeferenzordnungen, Werteprioritaeten, Feature-Wichtigkeitsranking, Conjoint-Aufgaben.

---

## 6.6 Zeitbasierte Fragen

### Datum/Uhrzeit

**Typkennung**: `date-time`
**Antworttyp**: DATE (date)
**Zweck**: Datum und/oder Uhrzeit mit Kalenderpicker erfassen.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `mode` | `'date' \| 'time' \| 'datetime'` | `'date'` | Eingabemodus. |
| `format` | string | `'YYYY-MM-DD'` | Anzeigeformat. |
| `showCalendar` | boolean | `true` | Kalenderpicker anzeigen. |
| `minDate` / `maxDate` | string | -- | Datumsbereichsgrenzen. |

**Anwendungsfaelle**: Geburtsdatum, Ereignisdaten, Zeitpraeferenzen, Laengsschnitterfassung.

---

### Reaktionszeit

**Typkennung**: `reaction-time`
**Antworttyp**: REACTION_TIME (object)
**Zweck**: Eine zeitkritische Reaktionsaufgabe mit frame-genauem Stimulus-Onset (Stimulusbeginn) und hochaufloesenden Antwort-Zeitstempeln ausfuehren, die pro Trial Reaktionszeit und Genauigkeit aufzeichnet.

#### Paradigms

Eine Reaktionsfrage ist um ein **Paradigm** herum aufgebaut -- eine wissenschaftliche Verfahrensvorlage, die die Trial-Struktur einer Aufgabe festlegt und definiert, was als korrekte Antwort zaehlt. Sie waehlen eines aus dem **Paradigm**-Dropdown im Designer aus; das Eigenschaften-Panel zeigt dann nur die Felder an, die das jeweilige Paradigm benoetigt. QDesigner liefert 16 Paradigms mit:

| Paradigm (Bezeichnung im Designer) | Identifier | Was gemessen wird |
|---|---|---|
| Standard Reaction Time | `standard` | Einfache / Auswahl-RT auf einen einzelnen Stimulus |
| N-Back | `n-back` | Arbeitsgedaechtnis-Aktualisierung |
| Stroop | `stroop` | Farb-Wort-Interferenz |
| Flanker (Eriksen) | `flanker` | Antwortkonflikt durch flankierende Distraktoren |
| Implicit Association Test (IAT) | `iat` | Staerke impliziter Assoziationen (D-Score) |
| Dot-Probe | `dot-probe` | Aufmerksamkeitsbias hin zu gepaarten Cues |
| Go / No-Go | `go-nogo` | Antwortinhibition (Commission-/Omission-Fehler) |
| SART | `sart` | Anhaltende Aufmerksamkeit (Zurueckhalten beim seltenen Target) |
| Simon | `simon` | Raeumliche Reiz-Reaktions-Kompatibilitaet |
| Posner Cueing | `posner` | Raeumliche Aufmerksamkeitsausrichtung (valider vs. invalider Cue) |
| Visual Search | `visual-search` | Sucheffizienz (RT x Set-Size-Steigung) |
| Sternberg Memory Search | `sternberg` | Gedaechtnis-Scanrate |
| PVT (Psychomotor Vigilance) | `pvt` | Vigilanz und Aussetzer bei Ermuedung |
| Temporal-Order Judgment | `temporal-order` | Zeitliche Aufloesung (JND ueber SOAs) |
| RSVP | `rsvp` | Schnelle serielle visuelle Zielerkennung |
| Custom Trial Plan | `custom` | Vollstaendig autordefinierte Bloecke und Trials |

Wenn Sie ein Paradigm auswaehlen und die Schaltflaeche "Reset Selected Paradigm To Starter" druecken, wird eine lauffaehige Starter-Konfiguration geladen, die Sie anschliessend bearbeiten koennen. Die prozeduralen Paradigms materialisieren ihre Trials aus Paradigm-Parametern (Trial-Anzahl, Verhaeltnisse, Timing); **Custom Trial Plan** ist das einzige Paradigm, das Sie Trial fuer Trial im visuellen Blockeditor aufbauen.

> Fruehere Versionen von QDesigner nannten diese "task types" (Aufgabentypen). Sie werden jetzt als Paradigms angelegt. (Die zugrunde liegenden `task.type`-Identifier in der Tabelle oben sind unveraendert.)

#### Presets

Ein **Preset** ist eine gespeicherte, benannte *Parametrisierung* eines Paradigms -- niemals ein neues Verfahren. Im Reaktionseditor koennen Sie wiederverwendbare **Timing Presets** (ein benannter Satz von Phasendauern) sowie Tasten-/Antwort-Presets anwenden, sodass ein hausinternes Standard-Timing-Profil oder eine Antwortzuordnung auf Trials uebernommen werden kann, ohne es erneut eintippen zu muessen. Das Anwenden eines Presets fuellt nur Parameterwerte aus; es aendert niemals, welches Paradigm laeuft.

#### Response data

Jeder Trial erfasst eine Reaktionszeit, die gegebene Antwort, ob sie korrekt war, und einen Timing-Provenienz-Datensatz. Ein repraesentativer Datensatz pro Trial:

```json
{
  "reactionTime": 342,
  "correct": true,
  "stimulus": "circle",
  "response": "j",
  "timestamp": 1710461234567
}
```

**Aggregationen**: mean_rt, median_rt, min_rt, max_rt, accuracy, outliers.

**Capabilities**: Scripting, Conditionals, Analytics, Timing, Variables.

**Timing-Praezision**: Der Stimulus-Onset (Stimulusbeginn) ist frame-genau mit gemessener Display-Latenz-Korrektur, und Antworten tragen hochaufloesende `event.timeStamp`-Werte -- was eine relative Sub-Millisekunden-Praezision bei Differenzwerten ergibt, keine absolute Mikrosekunden-Genauigkeit. Die volle Timer-Aufloesung erfordert Cross-Origin-Isolation (COOP/COEP). Siehe **Kapitel 10: Reaktionszeitmessung** fuer das Timing-Modell, die paradigmenspezifischen Konfigurationsfelder, Stimulusarten, Counterbalancing und Scoring.

**Anwendungsfaelle**: Die 16 Paradigms oben decken einfache/Auswahl-Reaktionszeit, Aufgaben zur Antwortinhibition und anhaltenden Aufmerksamkeit, Konfliktparadigmen (Stroop, Flanker, Simon), Aufmerksamkeitsausrichtungs- und Bias-Proben (Posner, Dot-Probe), Gedaechtnissuch- und Arbeitsgedaechtnisaufgaben (Sternberg, N-Back), Psychophysik (Temporal-Order, RSVP, Visual Search), den IAT sowie vollstaendig benutzerdefinierte Trial-Plaene ab.

---

## 6.7 Datei- und Medien-Fragen

### Datei-Upload

**Typkennung**: `file-upload`
**Antworttyp**: FILE_UPLOAD (object)
**Zweck**: Datei-Uploads mit Drag-and-Drop, Typvalidierung und konfigurierbarem Speicher erfassen.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `accept` | string[] | `[]` | Akzeptierte MIME-Typen (leer = alle). |
| `maxSize` | number | `10485760` | Maximale Dateigroesse in Bytes (10 MB). |
| `maxFiles` | number | `1` | Maximale Dateianzahl. |
| `dragDrop` | boolean | `true` | Drag-and-Drop-Upload aktivieren. |
| `storage` | `'base64' \| 'url' \| 'reference'` | `'reference'` | Speichermethode. |

**Anwendungsfaelle**: Fotografien, Dokumenteinreichungen, Audioaufnahmen, teilnehmergenerierte Inhalte.

---

### Zeichnung/Skizze

**Typkennung**: `drawing`
**Antworttyp**: DRAWING (object)
**Zweck**: Canvas-basierte Zeichen- und Skizzenaufgabe mit mehreren Werkzeugen, Farben und optionaler Strichanalyse.

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `canvas.width` | number | `600` | Canvas-Breite in Pixeln. |
| `canvas.height` | number | `400` | Canvas-Hoehe in Pixeln. |
| `tools` | string[] | `['pen', 'eraser']` | Verfuegbare Werkzeuge: `pen`, `eraser`, `line`, `shape`. |
| `colors` | string[] | 6 Standardfarben | Verfuegbare Farben. |
| `analysis.extractFeatures` | boolean | `false` | Zeichnungsmerkmale automatisch extrahieren. |
| `analysis.trackTiming` | boolean | `false` | Strich-Timing aufzeichnen. |

**Anwendungsfaelle**: Uhrenzeichnungstests (kognitive Bewertung), Freizeichenaufgaben, Unterschriftenerfassung, raeumliche Faehigkeitstests, Kinderforschung.

---

## 6.8 Spezialisierte Fragen

### WebGL-Stimulus

**Typkennung**: `webgl`
**Antworttyp**: REACTION_TIME (object)
**Zweck**: GPU-gerenderte visuelle Stimuli mit 120+ FPS unter Verwendung von WebGL 2.0, mit frame-genauem Onset und relativer Sub-Millisekunden-Timing-Praezision (siehe Kapitel 10).

**Konfiguration**:

| Eigenschaft | Typ | Standard | Beschreibung |
|---|---|---|---|
| `stimulus.content.type` | string | `'circle'` | Formtyp. |
| `stimulus.content.properties.radius` | number | `50` | Formradius. |
| `stimulus.fixation.duration` | number | `500` | Fixationsdauer (ms). |
| `response.validKeys` | string[] | `['f','j']` | Gueltige Tasten. |
| `timing.stimulusDuration` | number | `0` | Dauer (0 = bis zur Antwort). |
| `rendering.targetFPS` | number | `120` | Ziel-Bildrate. |
| `rendering.vsync` | boolean | `true` | Vertikale Synchronisation. |

**Anwendungsfaelle**: Psychophysische Experimente, visuelle Suchaufgaben, Bewegungswahrnehmungsstudien, Aenderungserkennung, Maskierungsparadigmen.

---

### Medienantwort

**Typkennung**: `media-response`
**Antworttyp**: FILE_UPLOAD (object)
**Zweck**: Medienantworten (Audio, Video, Bild) von Teilnehmern erfassen.

**Anwendungsfaelle**: Audio-Tagebucheintraege, Videoantworten auf Prompts, Fotodokumentation, Sprachaufnahmen fuer Sprachanalyse.

---

## 6.9 Empfohlene Vorgehensweisen

### Auswahl des richtigen Fragetyps

| Forschungsbedarf | Empfohlener Typ |
|---|---|
| Einstellungen/Meinungen messen | Skala (Likert-Buttons) |
| Kategorische Klassifikation | Einfachauswahl |
| Mehrfach zutreffende Kategorien | Mehrfachauswahl |
| Freitextantworten | Texteingabe |
| Numerische Messungen | Zahleneingabe |
| Mehrere Items, gleiche Skala | Matrix |
| Praeferenzordnung | Rangfolge |
| Kognitive Leistung | Reaktionszeit |
| Visuelle Wahrnehmungsforschung | WebGL-Stimulus |
| Datum/zeitliche Daten | Datum/Uhrzeit |
| Qualitative Artefakte | Zeichnung oder Datei-Upload |
| Echtzeit-Feedback | Statistische Rueckmeldung |
| Anweisungen/Einwilligung | Textanzeige oder Anweisung |

### Validierungsrichtlinien

- Markieren Sie kritische Items immer als **erforderlich**.
- Verwenden Sie **minLength** bei Texteingaben, um trivial kurze Antworten zu verhindern.
- Verwenden Sie **min/max** bei Zahleneingaben, um Dateneingabefehler abzufangen.
- Aktivieren Sie **Aufmerksamkeitspruefungen** bei mindestens einem Item pro Block.
- Verwenden Sie **Timing**-Einschraenkungen, um verdaechtig schnelle Antworten (Speeder) zu markieren.
