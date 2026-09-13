# Abgleich: Pflichtenheft „QDesigner neu" ↔ Angebot QDesigner Modern

**Datum:** 2. September 2026
**Zweck:** Jede Anforderung des Pflichtenhefts der Universität wird dem Angebot (`docs/angebot-qdesigner-modern-2026-09.md`, Blöcke L1–L15, Optionen O1–O4) und dem tatsächlichen Stand im Code zugeordnet. Interne Arbeitsgrundlage, nicht Teil des Angebots.

**Legende Status:** ✅ im Angebot enthalten und im Code vorhanden · 🔶 im Angebot enthalten, Code teilweise · 🟦 im Angebot enthalten, Code noch offen · ❌ nicht im Angebot (neuer Umfang) · ⛔ bewusst ausgeschlossen · ❓ zu klären

## 1. Ziele (Kap. 1)

| Anforderung | Status | Angebot | Anmerkung |
|---|---|---|---|
| Fragebögen (subjektive Daten) | ✅ | L6, L7 | 14 Fragemodule |
| Leistungsdaten: Reaktionszeit, Entscheidungsverhalten auf Bild/Video | ✅ | L7, L8 | WebGL-Engine, Bild/Audio-Stimuli; Video als Stimulus in Reaktionsblöcken **prüfen** (Medienanzeige ja, frame-genaues Video-Onset nein) |
| Video-Stopp-Paradigma | ❌ | — | kein Stop-Signal-/Video-Stopp-Preset; Go/No-Go vorhanden. Neu: ca. 8 PT (mit Task-Switching) |
| Synchronisierte Sensordaten HR/EKG, EDA, Atmung, EMG, Accelerometer (M2) | ❌ | — | nichts im Code, nicht im Angebot. Siehe §7 |
| Tests zu Testbatterien zusammenführen | ✅ | L6, L7 | Blöcke, Seiten, Serien; Vorlagenbibliothek |
| Unmittelbare Ergebnisdarstellung | ✅ | L7, L10 | Teilnehmer-Report, statistisches Feedback, Normen |
| Individuelle Auswertung wiederholter Messungen | 🔶 | L7, L10 | Selbst-Baseline und RCI im Report vorhanden; personenzentrierte Verlaufsansicht für Testleiter fehlt (siehe 3.4/3.5) |
| Informationen, Interventionen, Trainingsprogramme (M2) | ❌ | — | Text/Video-Anzeigemodule ja; Programmlogik (Kurse, Fortschritt, Zuweisung) nein. Neu: ca. 30 PT |
| Endgeräte: Notebook, Tablet, Smartphone | ✅ | L7, L9 | responsive PWA, Touch. Native Apps ⛔ (Abschnitt 3 des Angebots) |
| Testberichte, Schriftsätze, Serienbriefe | 🔶 | L7 (Report), L11 (Druck) | Teilnehmer-PDF ja; Testleiter-Berichte, Vorlagen, Serienbrief/Batch-PDF nein. Neu: ca. 15 PT |
| EMA: fix, zufällig, eventbezogen, technologiebezogen (M2) | 🔶 | L3 (Serien) | Serien mit `fixed`, `random-interval`, `event`; Erinnerung nur per E-Mail; keine Push-Benachrichtigung, kein sensor-/technologiegetriggerter Prompt. Erweiterung: ca. 15 PT |
| Export SPSS, Excel, … | ✅ | L10 | CSV, JSON, XLSX, SPSS (.sav + Syntax), R, Stata, SAS, Python |
| „KI ready": Testentwicklung, Fehlererkennung | 🟦 | L4, L12 | QDef + MCP sind genau dieser Punkt; im Angebot als „Automatisierungsschnittstelle", im Anschreiben als KI-Anbindung benennen |
| „KI ready": Datenauswertung, Berichte | ❌ | — | nicht enthalten. Option: KI-Assistent für Auswertung/Berichtstexte über MCP, ca. 20 PT |

## 2. Rollen (Kap. 2)

| Anforderung | Status | Angebot | Anmerkung |
|---|---|---|---|
| Sportler:in (Teilnehmer) | ✅ | L7 | anonym oder authentifiziert |
| Angewandte Sportpsycholog:in (gibt Tests vor, nutzt Ergebnisse) | ✅ | L2, L6, L10 | Editor/Viewer-Rollen, granulare Rollen |
| Administrator (Nutzer, Rechte) | ✅ | L2 | Admin-Bereich |
| Wissenschaftliche Mitarbeiter (Design, Export, Batterien) | ✅ | L2, L6, L10 | |
| Data-Sharing: Datenbesitz, Datennutzung deklariert | 🔶 | L2, L3 | Organisation/Projekt als Eigentumsgrenze, Einladungen, Audit. Explizite Deklaration je Datensatz (Besitzer, erlaubte Nutzung, Einwilligungsumfang) fehlt. Neu: ca. 8 PT, oder als Einwilligungs-/Metadatenfeld in L3 |

## 3. Funktionale Anforderungen (Kap. 3)

### 3.1 Fragebogenmodul

| Anforderung | Status | Angebot | Anmerkung |
|---|---|---|---|
| Likert, Multiple Choice, Freitext, Schieberegler, Reihung | ✅ | L7 | Skala/Rating (Slider vorhanden), Mehrfachwahl, Text, Ranking |
| Text-, Bild-, Audio-, Videovorgaben | ✅ | L7 | Medienanzeige |
| Randomisierung von Items | ✅ | L7 | randomisierte Blöcke, Optionsrandomisierung |
| Skip & Jump | ✅ | L7 | Flow-Regeln |
| Zeitbegrenzungen (Speedtests) | ✅ | L7 | Seiten-/Fragen-Timer, Gesamtbudget |
| Import von Fragebögen verschiedener Formate | 🔶 | L4 | QDef-Import ja; fremde Formate (QTI, REDCap, LimeSurvey …) nein. ❓ welche Formate gemeint sind |
| Vorlagen exportieren/importieren (PDF, XML o.ä., systemspezifisch) | 🟦 | L4, L11 | QDef (.qdef.json/.qdef) = systemspezifisch; PDF-Ausdruck des leeren Bogens: über L11 Druckpfad abdecken |
| **Import der CSV-Programmdateien aus dem alten QDesigner** | ⛔→O2 | O2 | **Entschieden (2026-09-02):** kein eingebauter Konverter. JavaScript in Alt-Vorlagen ist nicht mechanisch in die Regelsprache übersetzbar. Stattdessen Migrations-Skill über die MCP-Anbindung: Spec #106, Tickets #122–#124. Angebot O2 entsprechend umformuliert (35 PT). |

### 3.2 Kognitive Tests

| Anforderung | Status | Angebot | Anmerkung |
|---|---|---|---|
| Stroop | ✅ | L6, L8 | Preset vorhanden |
| N-Back | ✅ | L6, L8 | Preset vorhanden |
| Go/No-Go | ✅ | L6, L8 | Preset vorhanden |
| Task-Switching | ❌ | — | kein Preset. Neu: ca. 4 PT (in den 8 PT mit Video-Stopp) |
| weitere vorhandene Presets | ✅ | | Flanker, Dot-Probe, IAT, SART, Simon, Posner, PVT, RSVP, Sternberg, Temporal Order, Visual Search (14 gesamt; **Angebot nennt 9, korrigieren**) |
| Stimulusdarstellung, RT ms-genau, Fehlerklassifikation, Abbruchbedingungen | ✅ | L8 | frame-genau, Sub-ms relativ, Korrektheit, Abbruchregeln |
| Selektive/adaptive Verfahren zwischen und innerhalb von Tests | 🔶 | L7 | adaptive Blöcke (CAT/IRT) und Flow auf Vorergebnisse vorhanden; adaptive Schwierigkeit *innerhalb* eines RT-Tests (Staircase, z. B. N-Back-Level) nicht. Neu: ca. 8 PT |
| Exakte Zeitauflösung, Bildschirmsynchronität | ✅ | L8 | Kernkompetenz; Provenienz je Trial |

### 3.3 Sensorintegration

| Anforderung | Status | Angebot | Anmerkung |
|---|---|---|---|
| HR/EKG, EDA, Atmung, EMG, Accelerometer; Hersteller, Protokolle, Samplingraten | ❌ | — | nichts vorhanden |
| Zeitstempel-Synchronisation Sensor ↔ Stimulus | ❌ | — | Stimulus-Zeitbasis vorhanden, Sensor-Seite nicht |
| Datenqualität (Artefakte, Dropouts) | ❌ | — | |
| EMG ≥ 1.000 Hz | ❌ | — | im Browser nur über WebSerial/WebUSB/Web Bluetooth (BLE reicht für 1 kHz EMG nicht) oder lokalen Bridge-Dienst |
| 3D-Brille | ❌ | — | ❓ Zweck unklar (Stereo-Stimulus? VR?) |

Siehe §7 für Vorschlag.

### 3.4 Datenmanagement

| Anforderung | Status | Angebot | Anmerkung |
|---|---|---|---|
| Speicherung lokal / Server / Cloud | ✅ | L3, L9 | offline-first + Server; Self-Hosting oder Hosting (Abschnitt 7) |
| Rohdaten vs. verarbeitete Daten | ✅ | L3, L10 | Trials/Events roh, Scores/Aggregate abgeleitet |
| Versionierung | ✅ | L3 | Semver-Snapshots, Session pinnt Version |
| Datenmanagement nach Personen, Wiederholungen, Gruppen | ❌ | — | Sessions sind personenzuordenbar (authentifiziert), aber es gibt keine **Personenakte** (alle Tests einer Person inkl. Wiederholungen), keine **Gruppen/Teams** mit Mitgliedschaftshistorie, keine Sortiervariablen. Neu: ca. 25 PT |
| Metadaten (Testbedingungen, Gerät) | ✅ | L8 | Gerätequalifikation, Provenienz |

### 3.5 Auswertung & Visualisierung

| Anforderung | Status | Angebot | Anmerkung |
|---|---|---|---|
| Kennwerte RT, Fehler | ✅ | L10 | HRV ❌ (Sensor) |
| Zeitreihen, Balken | ✅ | L10 | |
| Heatmaps | 🔶 | L10 | rudimentär; für Testleiter-Analytik ausbauen, ca. 3 PT |
| Normwerte, mehrere Vergleichsgruppen wählbar (Sportart, Alter) | 🔶 | L7, L10 | Normtabellen und Kohortenvergleich vorhanden; Auswahl mehrerer Vergleichsgruppen durch Testleiter nein. Neu: ca. 6 PT |
| Teamspezifische Auswertungen | ❌ | — | hängt an Gruppen (3.4) |
| Sofortrückmeldung, wiederholte Messungen, Parameter vordefiniert oder vom TL gewählt | 🔶 | L7 | Report ja; TL-seitige Parameterwahl zur Laufzeit nein, ca. 4 PT |
| „Auf einen Blick": welche Tests hat Person/Gruppe absolviert | ❌ | — | Teil der Personenakte (3.4) |
| Dynamische Team-Zusammensetzung (Zu-/Abgänge) | ❌ | — | Teil Gruppen mit Historie (3.4) |

### 3.6 Export & Schnittstellen

| Anforderung | Status | Angebot | Anmerkung |
|---|---|---|---|
| CSV, JSON | ✅ | L10 | |
| XML | ❌ | — | trivial, ca. 1 PT |
| PDF | ✅ | L7, L11 | |
| EDF, BIDS | ❌ | — | nur mit Sensordaten sinnvoll; BIDS-Verhaltensdaten-Layout ca. 5 PT, EDF ca. 5 PT |
| REST-API | ✅ | L1, L3 | OpenAPI, API-Schlüssel |
| R, SPSS, Python | ✅ | L10 | |

## 4. Nicht-funktionale Anforderungen (Kap. 4)

| Anforderung | Status | Angebot | Anmerkung |
|---|---|---|---|
| Performance, Latenz | ✅ | L8, L13 | Zielwert im Pflichtenheft offen („< x ms"); Angebot nennt frame-genau/Sub-ms relativ |
| Skalierbarkeit, Fehlertoleranz | ✅ | L1, L3, L9 | Redis-Relay, idempotenter Sync, Ledger |
| Barrierefreiheit | ✅ | L7 | ARIA, Fokus, Live-Regionen |
| Touch-Optimierung | ✅ | L7, L8 | |
| Mehrsprachigkeit | ✅ | L7 | DE/EN/ES + Inhaltsübersetzung |
| DSGVO | ✅ | L2 | Export, Löschung, Fristen, Legal Hold, Residenz |
| Verschlüsselung AES-256 | ✅ | L9 | AES-256-GCM ruhende Offline-Daten; Transport TLS (Hosting); Server-at-rest = Datenbank-/Volume-Verschlüsselung des Betreibers (Abschnitt 3: Betrieb) |
| Rollenbasierter Zugriff | ✅ | L2 | |
| Pseudonymisierung | 🔶 | L2, L3 | anonyme Sessions, pseudonyme Retention nach Nutzerlöschung; explizites Pseudonym-Schlüsselmanagement (getrennte Identitätstabelle, Re-Identifikation nur mit Recht) nein. Neu: ca. 6 PT, sinnvoll zusammen mit Personenakte |

## 5. Architektur (Kap. 5)

| Anforderung | Status | Anmerkung |
|---|---|---|
| Client/Server, Web, Offline | ✅ | SvelteKit + Rust, PWA offline |
| Desktop/Mobile nativ | ⛔ | responsive Web statt nativer Apps; im Angebot ausgeschlossen |
| Stack „z. B. React / Python, Java" | ✅ | Beispiele, keine Vorgabe; Svelte/Rust begründen (Timing, Sicherheit) |
| Sensor-SDKs | ❌ | siehe §7 |

## 6. Zeit, Validierung, Recht, Abnahme, Risiken (Kap. 6–10)

| Anforderung | Status | Angebot | Anmerkung |
|---|---|---|---|
| Zeitquelle, Drift-Kompensation, Sync Stimulus↔Sensor | 🔶 | L8 | Stimulus-Zeitbasis mit Latenzkorrektur und Provenienz ja; Sensor-Sync ❌ |
| Unit-/Integrationstests | ✅ | L13 | |
| Test-Retest-Reliabilität, Vergleich mit Referenzsystemen | ❌ | — | Validierungsstudie; Angebot schließt physische Latenz-Zertifizierung aus. Option: Begleitung einer Referenzmessung (Photodiode, O1) + Datenaufbereitung, ca. 10 PT |
| MDR | ⛔ | — | explizit ausschließen: Forschungs- und Beratungswerkzeug, kein Medizinprodukt; Formulierung in Abschnitt 3 ergänzen |
| IEC 62304 | ⛔ | — | folgt aus Nicht-MDR |
| ISO 27001 | ❓ | — | betrifft Betreiber/Hosting; bei Anbieter-Hosting Rechenzentrum mit Zertifikat wählen; Software unterstützt (Audit, Rollen, Verschlüsselung) |
| Ethikvorgaben | ✅ | L2, L7 | Einwilligung, Betroffenenrechte, Audit |
| Abnahme: Messgenauigkeit, Stabilität, Doku, Handbuch | ✅ | Abschnitt 9, L14 | |
| Risiken: Sensorinkompatibilität, OS-Latenzen, OS-Updates, Nutzerfehler | 🔶 | L8 | Gerätequalifikation + Provenienz decken OS-Latenz ab; Sensoren offen |

## 7. Vorschlag: Ergänzungen zum Angebot

### 7.1 Korrekturen im bestehenden Angebot (kein Preis-Effekt)

1. Presets: „neun" → „vierzehn", Stroop, N-Back, Flanker, IAT, Dot-Probe namentlich nennen (L6). **Erledigt.**
2. L12/L4 im Anschreiben als „KI-Anbindung" benennen (Pflichtenheft-Begriff „KI ready").
3. Abschnitt 3 (Nicht enthalten): „Kein Medizinprodukt im Sinne der MDR; keine IEC-62304-Prozesse" ergänzen; ISO 27001 als Betreiberpflicht benennen.
4. AES-256 in L9 explizit so schreiben.

### 7.2 Spezifiziert und in Tickets überführt (2026-09-02)

| Spec | Tickets | Inhalt | PT |
|---|---|---|---:|
| #103 Participant and group management | #109–#114 | Personenakte, Gruppen mit datierten Mitgliedschaften, Übersichten, CohortFilter für Vergleichsgruppen, pseudonym-sicherer Export, Identitäts-Vault mit Re-Identifikationsrecht | 40 |
| #104 Task-Switching, Video-Stop, within-test adaptivity | #115–#118 | Task-Switching-Preset, Video als WebGL-Stimulus, Stop-Signal/SSRT, AdaptiveController | 16 |
| #105 Practitioner reports, batch letters, heatmaps, XML | #119–#121 | Berichtsvorlagen mit Bindings und Render-Parametern, Batch-PDF/ZIP, Heatmap, XML-Export | 23 |
| #106 Legacy migration as agent Skill over MCP | #122–#124 | Parser, Skill mit Übersetzungsregeln und Unresolved-Records, Szenarien aus Alt-Ausfüllungen, Migrationsbericht | (O2, 35) |
| #107 / #108 Sensor plugin feasibility (WASM) | research + prototype | Transporte, Plugin-ABI, Zeitsync, 1-kHz-Prototyp, Go/No-Go | (O5, 15) |

Ins Angebot übernommen (2026-09-02): L16 „Personen- und Gruppenmanagement" 40 PT, L8 +16, L10 +8, L11 +15 → Referenzaufwand 877 PT; O2 Migrations-Skill 35 PT, O5 Sensor-Machbarkeit 15 PT.

### 7.3 Als Optionen (Pflichtenheft M2 oder unklar)

| Option | Inhalt | PT |
|---|---:|---:|
| O5 Machbarkeitsstudie Sensor-Plugin-System | im Angebot: modulares Plugin-System als sandboxed WASM-Module; Research #107, Prototyp #108 | 15 |
| O6 Sensorintegration Stufe 2 | Adapter-Architektur, 2–3 Geräte, ≥1 kHz EMG über Bridge, Stimulus-Sync, Artefakt-/Dropout-Qualität, HRV-Kennwerte, EDF/BIDS-Export | 75 |
| O7 Interventionen und Trainingsprogramme | Programmmodell (Module, Sitzungen, Fortschritt), Zuweisung, Kurzinfo/Video-Inhalte, Erinnerungen | 30 |
| O8 EMA-Erweiterung | Web-Push-Benachrichtigungen, technologie-/ereignisgetriggerte Prompts, mobile Prompt-Ansicht, Compliance-Statistik | 15 |
| O9 KI-Auswertungsassistent | Auswertung und Berichtstext-Entwürfe über MCP mit Freigabe durch Testleiter | 20 |
| O10 Validierungsbegleitung | Referenzmessung Timing (mit O1), Test-Retest-Auswertung, Bericht | 10 |

### 7.4 Offene Fragen an die Universität

1. Welche „verschiedenen Formate" beim Fragebogen-Import (3.1)?
2. Legacy-CSV: Migration als Dienstleistung (O2) oder Funktion im Produkt?
3. Sensorliste: Hersteller und Modelle (Polar, Movesense, Shimmer, BITalino, Biopac …), vorhandene SDKs, Betriebssystem der Messgeräte.
4. 3D-Brille: Zweck (stereoskopische Stimuli, VR, Blickmessung)?
5. Latenz-Zielwert („< x ms") konkretisieren.
6. Native Apps zwingend oder reicht PWA (Offline, Homescreen, Touch)?
7. Hosting durch Anbieter (ISO-27001-Rechenzentrum) oder Uni-Betrieb?
8. Bestätigung: kein Medizinprodukt (Verwendungszweck Forschung/Beratung).

## 8. Parity remainder specified (2026-09-06)

The legacy-parity items inside L7, L8, L10 and L11 (≈ 66 PT) that were only covered by wayfinder decision tickets now have specs and tickets; the decision tickets #61, #67, #70, #72 are closed with pointers.

| Spec | Tickets | Offer block | Content |
|---|---|---|---|
| #125 Native .sav + export compatibility profile | #130, #131 | L10 | shared ExportProfile driving CSV/XLSX/.sav, codebook, Rust .sav emitter verified by an independent reader |
| #126 Access policies + one-time code batches | #132, #133 | L11 | server-enforced public/password/login/code, hashed single-use codes, atomic redemption, ledger, revocation |
| #127 Session administration | #134–#136 | L11 | soft-delete with grace and audit, resume links, completed-form print on pinned version, element visibility |
| #128 Flow, layout, variables | #137–#140 | L7 | call/return sub-flows, page templates, two-column, context variables and scopes, event references, compatibility functions |
| #129 Operator mode, diagnostics, recovery, run modes | #141–#144 | L8 | PIN-protected operator panel, build stamp and diagnostics, recovery import, Preview/Test run/Lab run |

Every block of the offer now traces to a spec: L4/L5/L12 → #75; L7/L8/L10/L11 parity → #125–#129; L8/L10/L11 extensions → #104/#105; L16 → #103; O2 → #106; O5 → #107/#108. Still open decisions: #63 (QDef v1 boundary), #66 (hardware), #73 (tranches), #74 (workspace/permission mapping).
