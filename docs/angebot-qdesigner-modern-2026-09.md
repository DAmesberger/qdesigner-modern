# Angebot: Entwicklung der Forschungsplattform QDesigner Modern

**Datum:** 2. September 2026
**Anbieter:** [Anbieter / Firma]
**Auftraggeber:** [Kunde]
**Gültigkeit:** 30 Tage

## 1. Ausgangslage und Ziel

Der Auftraggeber betreibt das Fragebogen- und Reaktionszeit-System QDesigner für psychologische und verhaltenswissenschaftliche Studien. Das Altsystem (Chrome-App, CSV/ZIP-Vorlagen, freies JavaScript, lokale Speicherung) ist technisch am Ende seines Lebenszyklus.

Gegenstand dieses Angebots ist die Neuentwicklung von **QDesigner Modern**: eine webbasierte, mandantenfähige Plattform, die jede Forschungsleistung des Altsystems in sicherer, moderner Form bereitstellt und sie um kollaboratives Design, präzise Reaktionszeitmessung, offline-fähige Datenerhebung, Analytik und Enterprise-Verwaltung erweitert. Die Übernahme bestehender Fragebögen erfolgt über ein offenes, versioniertes Definitionsformat und eine Automatisierungsschnittstelle; eine Migrations-Sonderlösung wird bewusst nicht gebaut.

Aufwände in Personentagen (PT, 8 Stunden) inklusive Tests, Dokumentation und Abnahme. Die PT-Angaben in Abschnitt 2 sind der **Referenzaufwand** für eine konventionelle, rein personengetragene Entwicklung. Der Preis in Abschnitt 8 leitet sich daraus über zwei ausgewiesene Nachlässe ab: für die KI-gestützte Entwicklungsmethodik (Abschnitt 6) und für das nicht-exklusive Nutzungsrecht (Abschnitt 7).

## 2. Leistungsumfang

### L1 — Plattform und Infrastruktur — 25 PT

- Monorepo mit Frontend (SvelteKit, Svelte 5, TypeScript strict), Backend (Rust/Axum) und geteilten Paketen (Domänenmodell, Formel-Engine, generierte API-Verträge)
- Reproduzierbare Entwicklungsumgebung (Nix), Container-Stack für PostgreSQL, Redis, S3-kompatiblen Objektspeicher und Mail-Testserver
- CI-Pipeline mit Typprüfung, Lint, Unit-, Integrations- und Vertragstests, Clippy-Gate, Build; OpenAPI-Spezifikation mit generiertem TypeScript-Client und Drift-Prüfung
- Datenbankmigrationen mit Startup-Anwendung; getrennte Migrations- und Anwendungsrolle
- Sechs End-to-End-Testlanes (Smoke, Regression, Fullstack, Reaktion, Formular, Visuell)

### L2 — Identität, Mandanten, Berechtigungen, Compliance — 80 PT

- Lokale Anmeldung (Argon2, Sperre bei Brute-Force, konstante Antwortzeit), Registrierung, Passwort-Reset, E-Mail-Verifikation, httpOnly-Refresh-Cookies
- Single Sign-on über OIDC (beliebiger Identity-Provider sowie Zitadel), Bindung föderierter Identitäten an verifizierte Organisationsdomänen, fail-closed
- SCIM-Benutzerprovisionierung
- Organisationen (Mandanten) mit Mitgliedern, Rollen (Admin, Editor, Viewer, Teilnehmer) und benutzerdefinierten, granularen Rollen
- Projekte mit Mitgliedschaft, projektübergreifender Zusammenarbeit über Einladungen, Eigentumsübertragung, Archivierung, Sichtbarkeitsregeln
- Ein zentraler Autorisierungspunkt für jede authentifizierte Operation; Row-Level-Security in der Datenbank als zweite, unabhängige Schutzschicht (getrennte Kontexte für Forschende, anonyme Teilnehmer und Serien-Teilnehmer)
- Sieben zweckgebundene Rate-Limiter (Anmeldung, Verifikation, API-Schlüssel, Session-Anlage je IP und je Fragebogen, Medien)
- API-Schlüssel mit Scopes für Maschinenzugriff
- Audit-Log aller sicherheitsrelevanten Ereignisse
- DSGVO: Datenresidenz, Legal Hold, Datenexport, Löschung, Aufbewahrungsfristen
- Verifizierte Organisationsdomänen mit DNS-Prüfung
- Admin-Bereich: Benutzer, Einladungen, Rollen, API-Schlüssel, Audit, Datenschutz, Domänen, SSO, Einstellungen, Branding; Onboarding neuer Organisationen

### L3 — Backend Studiendaten — 60 PT

- Fragebögen: Anlegen, Bearbeiten, Publizieren, Archivieren; semantische Versionierung (Major/Minor/Patch) mit unveränderlichen Snapshots und Changelog; Vorlagenbibliothek
- Sessions: clientseitig erzeugte IDs, anonyme und authentifizierte Teilnahme, idempotente Ingestion mit Deduplizierung, Fortsetzen, Duplikaterkennung per Fingerprint, Quoten je Zelle mit atomarer Bedingungszuweisung
- Öffentlicher Fragebogenzugriff per Code, Version je Session gepinnt
- Medienverwaltung im Objektspeicher mit Same-Origin-Streaming-Proxy (Range-Requests, Cache-Header, offline-tauglich)
- Serverberechnete Variablen (Kohortenstatistiken mit Mindest-n) für Feedback und Flow
- Exporte (Antworten, Trials, Aggregate) und Maschinen-Endpunkte
- Längsschnitt-Studienserien mit Einschreibung, Zeitplanung, Erinnerungen und Freigabe
- Kommentare an Fragebogenelementen
- Echtzeit-Kollaborations-Relay (WebSocket, CRDT-Dokumente je Fragebogen, horizontal skalierbar über Redis)
- Client-Fehlerberichte an den Server

### L4 — Fragebogen-Definitionsformat und Austausch (QDef) — 49 PT

- Kanonisches, schema-versioniertes JSON-Format für die vollständige Fragebogendefinition (Fragen, Seiten, Blöcke, Flow, Variablen, Regeln, Scoring, Reports, Übersetzungen, Einstellungen) mit stabilen IDs, deterministischer Serialisierung und Inhalts-Digest
- Export aus dem Designer, klar getrennt vom Antwortdaten-Export
- Import als Entwurf mit Trockenlauf-Validierung, idempotenter Anlage, Revisionsprüfung gegen parallele Bearbeitung und Entwurfs-Ersetzung
- Änderungen über stabile IDs mit semantischem Diff
- Selbständiges `.qdef`-Paket (ZIP) mit inhaltsadressierten Medien, Manifest, Hash-, Typ- und Größenprüfung, Härtung gegen fehlerhafte oder feindliche Archive
- Ablehnung unsicherer Inhalte (Skripte, `javascript:`-URLs, ausführbares HTML) mit stabilen, pfadgenauen Diagnosen
- Serverseitig nutzbarer Modulkatalog, damit Designer, Import und Automatisierung dieselben Regeln anwenden

### L5 — Formel- und Regelsprache (Safe Logic) — 75 PT

- Typisiertes Domänenmodell (Fragebogen, Variable, Seite, Block, Flow-Regel, Bedingung) als geteiltes Paket
- Ausdruckssprache: Parser und AST-Evaluator ohne `eval`, Allowlist-Funktionen, gesperrte Bezeichner, Tiefen- und Zeitlimits; Typ-, Referenz- und Zyklusdiagnostik
- Funktionsbibliotheken: Arithmetik, Arrays, Statistik, Psychometrie, IRT; symmetrischer Eigenwertlöser für PCA und Omega
- Regelsprache: deklarative Ereignis-Bedingung-Aktion-Regeln (Variable setzen, navigieren, abschließen, Antwort akzeptieren/verwerfen, Medien starten/stoppen, typisiertes Signal über berechtigten Adapter)
- Bearbeitung wahlweise als Text mit Autocomplete oder als visuelle Regeln, beide auf demselben Modell
- Ereignisreferenzen (letzte Antwort, letzte Änderung), Variablen-Scopes (flüchtig, Session, persistent, Server)
- Kein ausführbares JavaScript für Autoren; Content-Security-Policy ohne `unsafe-eval`

### L6 — Designer — 90 PT

- WYSIWYG-Canvas mit Struktur- und Eigenschaftsleiste, Fragen-Palette, Drag-and-drop, Tastaturbedienung, Undo/Redo, Autosave, Konfliktbehandlung
- Seiten und Blöcke, Anzeigebedingungen, Flow-Editor mit Graphansicht und Validierung
- Variablen-, Scoring- und Übersetzungs-Panels mit Vollständigkeitsanzeige
- Wiederverwendbare Item-Vorlagen
- Echtzeit-Kollaboration mit Präsenzanzeige (CRDT), Kommentare
- Reaction Lab: vierzehn Paradigmen-Presets (Stroop, N-Back, Flanker, Go/No-Go, SART, Simon, Posner, Dot-Probe, IAT, visuelle Suche, Sternberg, PVT, zeitliche Reihenfolge, RSVP), Phasen- und Trial-Editoren, Response-Sets, Timing-Spezifikationen, eigener Trial-Plan
- Report-Seiten-Editor für Teilnehmer-Feedback
- Distribution: öffentlicher Link, QR-Code, Einbettung, Panel-Integrationen (Prolific, MTurk, SONA, CloudResearch, eigene), Abschluss-Redirects und -Codes
- Theme- und Style-Editor, Organisations-Branding
- Vorschau, Testlauf und Vollbild-Laborlauf als getrennte Aktionen mit Datenisolation
- Versionsansicht, Changelog, Versionssprung

### L7 — Ausfüll-Runtime und Fragemodule — 88 PT

- Clientseitige Runtime: Seiten und Blöcke, Anzeigebedingungen, Flow-Regeln (Überspringen, Verzweigen, Schleife, Beenden, Unterablauf mit Rückkehr), Loop-Blöcke über statische oder antwortabhängige Listen, adaptive Blöcke (CAT/IRT), randomisierte Blöcke mit Teilmengen, Latin Square und festen Positionen, stabiler Reihenfolge beim Fortsetzen
- Quoten, Eligibility-Screener, Aufmerksamkeitschecks, Carry-forward
- 14 Fragemodule: Einfachwahl, Mehrfachwahl, Skala, Rating, Text, Zahl, Matrix, Ranking, Datum/Zeit, Datei-Upload, Medienantwort, Zeichnung, Reaktionszeit, Reaktionsexperiment; vier Anzeigemodule: Text, Instruktion, Balkendiagramm, statistisches Feedback; Medienanzeige (Bild, Video, Audio) mit Autoplay, Steuerung, Größe und Position
- Layout-Primitive: vertikal, horizontal, Raster, Zweispalten-Zeile (Frage/Antwort), wiederholte Seitenelemente (Sticky), projektabhängige Sichtbarkeit als explizite Variable
- Validierung, die Absenden und Speichern blockiert (Pflicht, Regex, Min/Max, eigene Regeln)
- Timer: Seiten-Timeout mit Auto-Weiter oder Abbruch, Fragen-Deadline, Gesamtzeitbudget; Vor/Zurück-Sperren je Seite
- Teilnehmerseiten: Willkommen, Einwilligung, Sprache, Fortschritt, Speichern und Fortsetzen, Screen-out, Über-Quote, Abschluss mit Redirect/Code
- Teilnehmer-Report mit PDF, Normtabellen, Selbst-Baseline und Kohortenvergleich; bedingte Feedbacktexte
- Lokalisierung der Oberfläche (Deutsch, Englisch, Spanisch) und Übersetzung der Fragebogeninhalte
- Barrierefreiheit: Fokusführung, ARIA-Rollen, Live-Regionen

### L8 — Reaktionszeit-Engine und Laborbetrieb — 71 PT

- WebGL-2-Renderer als einziger Zeichenpfad für Stimuli; frame-genauer Stimulus-Onset mit gemessener Display-Latenzkorrektur; Audio-Onset mit Ausgabelatenzkorrektur
- Hochauflösende Eingabezeitstempel; Cross-Origin-Isolation (COOP/COEP) für volle Timer-Auflösung; Gerätequalifikation mit Fallbacks
- Trials werden zur Generierungszeit vollständig materialisiert (geseedete Timing-Spezifikationen, reproduzierbar)
- Eingabe über Tastatur, Touch, Maus, WebHID-Antwortboxen und Gamepad; semantische Antwortmodelle mit Korrektheit
- Validitätsrichtlinie je Studie (aufzeichnen oder erzwingen); Timing-Provenienz je Trial (Onset-Methode, Frame-Statistik, Sichtbarkeit, Isolation)
- Trial-Aggregate mit expliziter Offenlegungsschwelle, Ausschluss von Übungstrials, Ungültigkeit antizipatorischer Antworten
- Weitere Paradigmen: Task-Switching (Cue- und Alternating-Runs-Variante, Switch- und Mixing-Kosten) sowie Stop-Signal-/Video-Stopp-Paradigma mit Video als frame-genauem WebGL-Stimulus und SSRT-Berechnung
- Adaptive Steuerung innerhalb eines Tests (Staircase, Level-Regeln, z. B. N-Back-Stufe), deterministisch reproduzierbar aus Seed und Antworten, Entscheidungen je Trial protokolliert
- Medien werden vor dem Lauf offline vollständig geladen und gegen Verdrängung gepinnt; fail-closed
- Laborbetrieb: Operator-Notausstieg mit Audit, Build-/Versionsstempel, Speicherdiagnose und Geräteinventar, Wiederherstellung aus Recovery-Export

### L9 — Offline-Betrieb und Synchronisation — 35 PT

- Vollständig clientseitige Ausfüllstrecke mit Service Worker (App-Shell, Bundles, Medien-Cache)
- IndexedDB-Schema mit versionsgepinnter Definition, Sessions, Antworten, Ereignissen, Variablen, Trials, Binärdaten, Schlüsseln und Sync-Ledger
- Antworten mit Client-IDs; serverseitige Deduplizierung; Binärantworten offline-first mit verzögertem Upload und Pinning bis zur Bestätigung
- Upload-Sync mit exponentiellem Backoff, Chunking, Bestätigungen, Mehrfach-Tab-Koordination; append-only Ledger mit Dead-Letter und Abgleich gegen den Server (kein stiller Verlust)
- Verschlüsselung ruhender Daten (AES-256-GCM, gerätegebundener Schlüssel, Löschen durch Schlüsselvernichtung)
- Geräteübergabe auf geteilten Geräten: finaler Sync, Warnung bei Restdaten, Bereinigung
- Recovery-Export nicht synchronisierter Daten

### L10 — Analytik und Datenexport — 60 PT

- Dashboards: Projekt, Organisation, Fragebogen, Session-Detail, Echtzeit, Vergleich, Zeitreihe, Heatmaps (Item × Person, Zeit × Variable)
- Statistik-Engine: deskriptiv, inferenziell, Korrelationen je Teilnehmer, ehrliche Abschlussquoten
- Psychometrie: Cronbachs Alpha, McDonalds Omega, Hauptkomponentenanalyse, Itemanalyse, Skalen-Scoring, CAT-Engine
- Exporte: CSV, JSON, XML (mit veröffentlichtem Schema), XLSX, SPSS (nativ `.sav` und Syntax), R, Stata, SAS, Python; Trial-Exporte; Versions- und Provenienzfelder; Schutz gegen Formel-Injection
- Kompatibilitätsprofil: Multi-Select-Spalten, Wertelabels, Unicode, fehlende Werte, Zeiteinheiten
- Datenqualität: Fingerprint, Cookie, IP, Honeypot, Antwortgeschwindigkeit, Flatline, Länderregeln

### L11 — Zugang, Antwort-Administration und Testleiter-Berichte — 35 PT

- Zugangssteuerung je Fragebogen: öffentlich, Anmeldepflicht, Passwortschutz, serverseitig erzwungen
- Einmal-Zugangscodes in Chargen mit CSV-Export, Widerruf, Einmalverwendung und Nutzungsledger
- Antworten filtern, einsehen, fortsetzen, einzeln und in Mehrfachauswahl löschen (mit Audit)
- Ausgefüllten Bogen auf Basis der gepinnten Version anzeigen und als PDF drucken; Druck-Sichtbarkeit je Element
- Testleiter-Berichte: Berichtsvorlagen je Fragebogen oder Projekt mit Feldbindungen (Person, Gruppe, Session, Scores, Servervariablen) und Parametern, die der Testleiter beim Erzeugen wählt (Kennwerte, Vergleichsgruppe, Zeitraum)
- Serienerstellung: Berichte für eine Personenauswahl oder ein Team in einem Schritt als Einzel-PDFs, Sammel-PDF und ZIP; Identitätsfelder nur mit Re-Identifikationsrecht

### L12 — Deterministisches Testen und Automatisierungsschnittstelle (MCP) — 43 PT

- Test-Plan-Format: Szenarien mit Schritten und Erwartungen; Modell-Tests mit virtueller Zeit und geseedetem Zufall; Fixtures für Offline, Fortsetzen, Servervariablen, Geräte; Browser-Tests mit Screenshots und Traces; Berichte an Definitions-Digest gebunden
- MCP-Server (zustandslos, authentifiziert, OAuth-Scopes zusätzlich zur Plattform-Berechtigung): Definition lesen, anlegen, ersetzen, editieren, testen; geschützte Schemas und Kataloge; Rate-, Größen- und Zeitlimits; Audit jeder Mutation; kein Publish über die Schnittstelle
- Nachweis am realen Fragebogen des Auftraggebers

### L13 — Qualitätssicherung und Sicherheit — 60 PT

- Automatisierte Tests auf allen Ebenen (Frontend, Domänenpakete, Server-Integration mit selbst-provisionierender Datenbank, HTTP-Roundtrips, Autorisierungsmatrix, RLS-Durchsetzung, E2E)
- Sicherheitsreviews je Meilenstein (Authentifizierung, Sandbox, XSS, CSRF, Rate-Limits, Quoten, Mandantentrennung), Behebung der Befunde
- Live-QA im Browser für jeden Meilenstein, Golden-Path-Protokolle
- Performance-Prüfung der Ausfüllstrecke (kritischer Pfad ohne schwere Bibliotheken)

### L14 — Architektur, Dokumentation, Entscheidungsworkshops — 36 PT

- Architekturentscheidungen als ADR, Domänenglossar, Runtime-, Timing- und Theme-Dokumentation
- Benutzerhandbuch Deutsch und Englisch
- Moderierte Workshops mit dem Auftraggeber zu Datenexport, Zugangsverwaltung, Hardware, Offline-Betrieb und Rechte-Abbildung mit dokumentiertem Ergebnis

### L15 — Projektsteuerung — 30 PT

- Planung, Priorisierung, Meilenstein-Reviews, Abnahmeprotokolle, Statusberichte

### L16 — Personen- und Gruppenmanagement — 40 PT

- Pseudonyme Personenakte (Teilnehmer:in) getrennt vom Login-Konto, mit typisierten Sortiervariablen (Alter, Geschlecht, Sportart, eigene) nach organisationsweitem Schema
- Identitätsdaten in einem getrennten Tresor mit eigenem Re-Identifikationsrecht; jede Aufdeckung wird protokolliert
- Gruppen und Teams mit datierten Mitgliedschaften; Zusammensetzung zu jedem Stichtag reproduzierbar (Zu- und Abgänge)
- Personenübersicht: alle absolvierten Tests als Matrix Test × Wiederholung mit Zeitstrahl und gepinnter Version
- Gruppenübersicht: Mitglieder zum Stichtag, Abdeckungsmatrix Person × Test, Lücken, Mitgliedschaftshistorie
- Vergleichsgruppen-Auswahl (eine oder mehrere Gruppen, Attributfilter, Zeitraum) für Normen, serverberechnete Variablen und Analytik; teamspezifische Auswertungen; Mindest-n je Kohorte
- Exporte nach Person oder Gruppe zum Stichtag mit pseudonym-sicheren Spalten

### Summe Leistungsumfang

| Nr. | Leistung | PT |
|---|---|---:|
| L1 | Plattform und Infrastruktur | 25 |
| L2 | Identität, Mandanten, Berechtigungen, Compliance | 80 |
| L3 | Backend Studiendaten | 60 |
| L4 | Definitionsformat und Austausch (QDef) | 49 |
| L5 | Formel- und Regelsprache (Safe Logic) | 75 |
| L6 | Designer | 90 |
| L7 | Ausfüll-Runtime und Fragemodule | 88 |
| L8 | Reaktionszeit-Engine und Laborbetrieb | 71 |
| L9 | Offline-Betrieb und Synchronisation | 35 |
| L10 | Analytik und Datenexport | 60 |
| L11 | Zugang, Antwort-Administration und Testleiter-Berichte | 35 |
| L12 | Deterministisches Testen und MCP | 43 |
| L13 | Qualitätssicherung und Sicherheit | 60 |
| L14 | Architektur, Dokumentation, Workshops | 36 |
| L15 | Projektsteuerung | 30 |
| L16 | Personen- und Gruppenmanagement | 40 |
| | **Summe** | **877** |

## 3. Nicht im Leistungsumfang enthalten

- **Hosting und Betrieb:** Bereitstellung der Produktionsumgebung, Domain, TLS, Backups, Monitoring, Skalierung; die Auslieferung der Ausfüllstrecke mit COOP/COEP-Headern am Host ist Voraussetzung und wird dokumentiert, nicht betrieben
- **Migration bestehender Fragebögen und Daten** des Altsystems (siehe Option O2); keine Migrations-CLI, kein Migrations-Assistent, kein eingebauter CSV/ZIP-Konverter
- **Kompatibilität mit freiem JavaScript** oder direktem Browser-, Netzwerk-, Speicher- und Socket-Zugriff aus Fragebögen
- **Nachbildung der Chrome-App-, AppCache- und Serial-Bridge-Mechanismen** des Altsystems
- **Hardware-Trigger-Ausgabe** an EEG, Eye-Tracker oder Photodioden (siehe Option O1) sowie **Sensorintegration** (HR/EKG, EDA, EMG, Beschleunigung); Machbarkeit siehe Option O5
- **SAML-Föderation und SCIM-Gruppenverwaltung** (siehe Option O4)
- **Publizieren über die MCP-Schnittstelle** in der ersten Version
- **Zertifizierung physischer Hardware-Latenzen**; deterministische Tests prüfen Softwareverhalten
- **Infrastruktur-Monitoring** (Festplattenkapazität, Serverauslastung) als Produktfunktion
- **Native Mobile-Apps**; die Plattform ist eine responsive Web-Anwendung mit PWA-Offlinefähigkeit
- **Inhaltliche Erstellung und Übersetzung** von Fragebögen, Normtabellen oder Studienmaterial
- **Lizenzen und Drittkosten** (Identity-Provider, Objektspeicher, E-Mail-Versand, Panel-Anbieter)
- **Schulung, Support und Wartung** nach Abnahme (auf Wunsch gesondertes Angebot)
- **Rechtliche Beratung** zu Datenschutz und Ethik

## 4. Optionale Pakete

| Nr. | Option | Inhalt | PT |
|---|---|---|---:|
| O1 | Hardware-Trigger-Ausgabe | Berechtigter Ausgabe-Adapter (WebSerial/WebHID) mit Timing-Provenienz, Ausfallverhalten und Audit; Photodioden-Validierung | 15 |
| O2 | Migration der Alt-Fragebögen | Entwicklung eines Migrations-Skills, der Alt-Vorlagen (CSV/ZIP) über die KI-Anbindung in das Definitionsformat überführt, JavaScript-Logik in die Regelsprache übersetzt und Unübersetzbares ausweist; deterministische Testszenarien aus Alt-Ausfüllungen; Migrationsbericht je Vorlage. Skill 12 PT plus 0,5–1,5 PT je Vorlage, angesetzt für 20 | 35 |
| O3 | Designer- und Medien-Komfort | Flow-Ausführung in der Vorschau, Formel-Editor für Flow-Bedingungen, benutzerdefinierte Presets, Ein-Klick-Testlauf für Reaktionsblöcke, wiederaufnehmbare Uploads ohne Größenlimit, Medien-Transkodierung, Design-Time-Validierung je Modul | 37 |
| O4 | Enterprise-Erweiterung | SAML-Föderation, SCIM-Gruppen | 14 |
| O5 | Machbarkeitsstudie Sensor-Plugin-System | Untersuchung eines modularen Plugin-Systems für physiologische Sensoren (HR/EKG, EDA, Atmung, EMG ≥ 1 kHz, Beschleunigung) als sandboxed WebAssembly-Module: Browser-Transporte vs. lokaler Bridge-Dienst, Plugin-Schnittstelle, Zeitsynchronisation mit dem Stimulus-Takt, Prototyp mit einem Gerät, Go/No-Go-Empfehlung für die Umsetzung | 15 |
| | **Summe Optionen** | | **116** |

## 5. Vorgehen und Meilensteine

Iterative Entwicklung in sechs Phasen mit zwei Entwicklern und KI-gestützter Umsetzung (Abschnitt 6). Konventionell entspräche der Referenzaufwand etwa 13 Monaten mit drei Entwicklern. Jede Phase endet mit Live-Abnahme im Browser und Sicherheitsreview.

| Phase | Inhalt | Leistungen | Ende |
|---|---|---|---|
| P1 Fundament | Infrastruktur, Identität und Mandanten, Backend Studiendaten, Domänenmodell und Ausdruckssprache | L1, L2, L3, L5 (Teil) | Monat 1,5 |
| P2 Autorenwerkzeug | Designer, Ausfüll-Runtime, Fragemodule, Teilnehmerseiten | L6, L7 | Monat 3 |
| P3 Messung und Offline | Reaktionszeit-Engine, Laborbetrieb, Offline-Betrieb und Sync | L8, L9 | Monat 4 |
| P4 Auswertung, Personen und Zugang | Analytik, Exporte, Personen- und Gruppenmanagement, Zugang, Berichte | L10, L11, L16 | Monat 5 |
| P5 Austausch und Automatisierung | Definitionsformat, Regelsprache vollständig, deterministisches Testen, MCP | L4, L5 (Rest), L12 | Monat 6 |
| P6 Abnahme | Gesamtabnahme, Handbuch, Übergabe | L13, L14 durchgehend | Monat 6,5 |

## 6. Entwicklungsmethodik und Effizienznachlass

Der Anbieter entwickelt KI-gestützt: agentische Entwicklungswerkzeuge übernehmen unter menschlicher Architektur-, Review- und Abnahmeverantwortung große Teile von Implementierung, Testerstellung, Code-Review, Dokumentation und Regressionsprüfung. Für den Auftraggeber bedeutet das:

- **Transparenter Referenzaufwand.** Der Leistungsumfang wird weiterhin in konventionellen Personentagen ausgewiesen, damit Umfang und Wert jeder Leistung nachvollziehbar bleiben und mit anderen Angeboten vergleichbar sind.
- **Effizienznachlass.** Die Produktivitätssteigerung wird als pauschaler Nachlass von **[60] %** auf den Referenzwert weitergegeben. Er ist im Preis (Abschnitt 8) gesondert ausgewiesen.
- **Kürzere Laufzeit.** Etwa sechseinhalb statt vierzehn Monate bei kleinerem Team (Abschnitt 5).
- **Unveränderte Qualitätsmaßstäbe.** Jede Änderung durchläuft dieselben Gates wie in konventioneller Entwicklung: Typprüfung, automatisierte Tests auf allen Ebenen, Sicherheitsreview, Live-QA im Browser, menschliche Freigabe vor Merge. Abnahmekriterien (Abschnitt 9) und Gewährleistung gelten uneingeschränkt.
- **Datenschutz.** KI-Werkzeuge verarbeiten Quellcode und Spezifikationen des Projekts; Teilnehmerdaten, Fragebogeninhalte und Zugangsdaten des Auftraggebers werden ihnen nicht übergeben. Die eingesetzten Werkzeuge und Anbieter werden auf Wunsch benannt.

## 7. Nutzungsrechte und Lizenznachlass

Der Anbieter entwickelt QDesigner Modern als eigenes Produkt und behält alle Urheber-, Eigentums- und Verwertungsrechte am Quellcode, an der Architektur und an der Dokumentation. Der Auftraggeber erhält:

- ein **einfaches, nicht-ausschließliches, zeitlich unbegrenztes und unwiderrufliches Nutzungsrecht** an der Software für eigene Forschungs- und Lehrzwecke, einschließlich aller Organisationen und Projekte des Auftraggebers;
- die Wahl zwischen **Betrieb auf eigener Infrastruktur** (Self-Hosting, Lieferung als Container-Images mit Betriebsdokumentation) und **Hosting durch den Anbieter** (gesondertes Betriebsangebot);
- **Quellcode-Einsicht** zur Prüfung und für Sicherheitsaudits sowie ein **Escrow-Recht**: Stellt der Anbieter Pflege und Weiterentwicklung dauerhaft ein, erhält der Auftraggeber den Quellcode zur eigenen Weiterentwicklung für interne Zwecke;
- alle **Rechte an eigenen Inhalten und Daten**: Fragebögen, Medien, Teilnehmerdaten, Normtabellen, Übersetzungen und Auswertungen bleiben ausschließlich beim Auftraggeber; sie werden vom Anbieter nicht für andere Kunden verwendet und nicht in das Produkt übernommen;
- **Vertraulichkeit** der Studieninhalte und Betriebsdaten.

Der Anbieter ist berechtigt, die Software Dritten anzubieten, für Dritte zu hosten und weiterzuentwickeln. Fachliche Anforderungen des Auftraggebers fließen in das Produkt ein; der Auftraggeber profitiert im Gegenzug von allen Weiterentwicklungen, die im Rahmen eines Wartungsvertrags bereitgestellt werden.

Weil der Auftraggeber kein exklusives Eigentum erwirbt und der Anbieter die Investition weiter verwerten kann, wird ein **Lizenznachlass von [30] %** auf den Referenzwert nach Effizienznachlass gewährt. Eine **exklusive Rechteübertragung** (Übergang des Quellcodes in das Eigentum des Auftraggebers, Verzicht des Anbieters auf Drittverwertung) ist alternativ zum Referenzwert nach Effizienznachlass, ohne Lizenznachlass, möglich.

## 8. Preis

Der Preis leitet sich aus dem Referenzaufwand über die beiden ausgewiesenen Nachlässe ab.

| Position | Berechnung | Betrag netto |
|---|---|---:|
| Referenzaufwand Leistungsumfang L1–L16 | 877 PT × Tagessatz [____ €] | [____ €] |
| Effizienznachlass KI-gestützte Entwicklung (Abschnitt 6) | − [60] % | − [____ €] |
| Zwischensumme | | [____ €] |
| Lizenznachlass nicht-exklusives Nutzungsrecht (Abschnitt 7) | − [30] % der Zwischensumme | − [____ €] |
| **Angebotspreis Leistungsumfang** | entspricht [28] % des Referenzwerts | **[____ €]** |
| Optionen O1–O5 (auf Abruf) | 116 PT × Tagessatz, dieselben Nachlässe | [____ €] |

Alle Beträge netto zzgl. gesetzlicher USt. Beispiel bei 1.000 € Tagessatz: Referenzwert 877.000 €, nach Effizienznachlass 350.800 €, Angebotspreis 245.560 €.

## 9. Abnahmekriterien

- Alle in Abschnitt 2 genannten Funktionen sind in der Oberfläche oder über die dokumentierte Schnittstelle erreichbar und durch automatisierte Tests abgedeckt.
- Jeder Fragebogen lässt sich in das Definitionsformat exportieren und ohne semantische Abweichung als Entwurf importieren (identischer Digest).
- Ein Standard-MCP-Client kann Fragebögen anlegen, prüfen und deterministisch testen, ohne Berechtigungs-, Revisions-, Versions- oder Audit-Regeln zu umgehen.
- Kein Element eines importierten Fragebogens wird stillschweigend ignoriert; unbekannte Inhalte werden mit Pfad und Hinweis gemeldet.
- Randomisierung, Timing, Scoring, Navigation und Persistenz bestehen die vereinbarten Fixture-Tests.
- Für Autoren ist kein ausführbares JavaScript erreichbar; die Content-Security-Policy enthält kein `unsafe-eval`.
- Offline-Unterbrechung und Wiederherstellung sowie Hardwareausfall bestehen die End-to-End-Szenarien.
- Reaktionszeitmessung liefert frame-genauen Onset mit Sub-Millisekunden-Relativpräzision unter Cross-Origin-Isolation und dokumentiert Abweichungen in der Provenienz.

## 10. Annahmen und Konditionen

- Schätzungen je Leistungsblock; Abweichungen über 15 % je Block werden vor Umsetzung gemeldet und abgestimmt. Nachträge werden zum Referenzaufwand mit denselben Nachlässen berechnet.
- Der Auftraggeber benennt einen fachlichen Ansprechpartner, nimmt an den Workshops (L14) teil und stellt reale Fragebögen für den Nachweis (L12) und Option O2 bereit.
- Entscheidungen aus den Workshops können den Umfang von L7, L8, L10 und L11 verändern; Änderungen werden als Nachtrag angeboten.
- Nutzungsrechte gemäß Abschnitt 7; die Lizenz wird mit vollständiger Zahlung des Angebotspreises wirksam.
- Abrechnung als Festpreis je Phase nach Abnahme oder monatlich nach Aufwand mit Deckel je Leistungsblock, nach Vereinbarung.
- Gewährleistung 12 Monate ab Gesamtabnahme; Wartung und Weiterentwicklung auf Wunsch als gesonderter Vertrag.
- Angebot gültig 30 Tage.

[Ort, Datum] — [Unterschrift]
