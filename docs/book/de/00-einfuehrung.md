# Kapitel 0: Einfuehrung in QDesigner Modern

## Was ist QDesigner Modern?

QDesigner Modern ist eine leistungsstarke Fragebogenplattform, die speziell fuer die psychologische und verhaltenswissenschaftliche Forschung entwickelt wurde. Sie vereint die strukturierten Datenerhebungsfunktionen herkoemmlicher Umfragetools mit der Zeitmessgenauigkeit und Renderingleistung, die experimentelle Forscherinnen und Forscher benoetigen.

Im Kern bietet QDesigner Modern:

- **Mikrosekunden-genaue Reaktionszeitmessung** ueber die `performance.now()`-API des Browsers, gespeichert als BIGINT-Werte in der Datenbank fuer verlustfreie Praezision.
- **WebGL-2.0-Rendering** mit durchgaengig ueber 120 Bildern pro Sekunde, wodurch die temporalen Anforderungen kognitiver und perzeptueller Experimente erfuellt werden.
- **Einen visuellen Fragebogen-Designer** mit Drag-and-Drop-Blockerstellung, WYSIWYG-Vorschau und einer integrierten Skriptsprache fuer berechnete Variablen, bedingte Logik und Ablaufsteuerung.
- **Mandantenfaehige Zusammenarbeit** mit Organisationen, Projekten, rollenbasierter Zugriffskontrolle und Einladungsworkflows, die fuer Forschungsteams konzipiert sind.

QDesigner Modern ist eine Webanwendung. Teilnehmende fuellen Frageboegen im Browser aus, ohne Software installieren zu muessen. Forschende entwerfen, verteilen und analysieren ihre Instrumente ueber dieselbe browserbasierte Oberflaeche.

## Fuer wen ist diese Plattform?

QDesigner Modern richtet sich an drei sich ueberschneidende Zielgruppen:

1. **Wissenschaftlerinnen und Wissenschaftler**, die Befragungsdaten und Verhaltensmessungen in einem einzigen Instrument erheben muessen -- Psychologinnen und Psychologen, Kognitionswissenschaftler, Neurowissenschaftlerinnen und Sozialwissenschaftler, deren Studien sowohl Selbstberichtsitems als auch zeitgesteuerte Antworten umfassen.

2. **Forschungsteams und Labore**, die kollaboratives Erstellen mit feingranularer Zugriffskontrolle benoetigen. Eine Studienleitung kann die Organisation besitzen, Doktorandinnen und Doktoranden Bearbeitungsrechte erteilen und externen Gutachtern Lesezugriff gewaehren -- alles innerhalb eines einzigen Arbeitsbereichs.

3. **Methodenorientierte Forschende**, die programmatische Kontrolle ueber die Fragebogenlogik benoetigen. Die integrierte Skriptsprache unterstuetzt berechnete Variablen, bedingte Verzweigungen, Randomisierung und formelbasierte Auswertung, ohne dass Teilnehmende Software oder Plugins installieren muessen.

Wenn Sie derzeit Qualtrics, LimeSurvey, SoSci Survey oder PsychoPy fuer fragebogenbasierte Forschung verwenden, bietet QDesigner Modern eine einheitliche Alternative, die sowohl traditionelle Umfrageitems als auch hochpraezise Zeitmessaufgaben abdeckt.

## Wesentliche Alleinstellungsmerkmale

### Mikrosekunden-Zeitmessgenauigkeit

Die meisten webbasierten Umfrageplattformen erfassen Antwortzeiten bestenfalls mit Millisekunden-Granularitaet, haeufig gerundet oder durch Framework-Overhead verzoegert. QDesigner Modern erfasst Reaktionszeiten ueber die hochaufloesende `performance.now()`-API des Browsers und speichert sie als Mikrosekunden-Ganzzahlen (BIGINT-Spalten in PostgreSQL). Das bedeutet:

- Keine Gleitkomma-Rundungsfehler in den gespeicherten Zeitdaten.
- Ausreichende Praezision fuer Reaktionszeitparadigmen wie lexikalische Entscheidungsaufgaben, implizite Assoziationstests und Go/No-Go-Verfahren.
- Zeitdaten, die direkt mit Daten vergleichbar sind, die mit dedizierter Experimentalsoftware erhoben wurden.

### WebGL-2.0-Rendering mit ueber 120 FPS

QDesigner Modern enthaelt einen eigenen WebGL-2.0-Renderer fuer die Stimuluspraesentation. Waehrend standardmaessiges HTML-Rendering durch die Layout- und Zeichenzyklen des Browsers begrenzt ist (typischerweise 60 FPS), umgeht die WebGL-Pipeline diese Einschraenkung:

- Die Stimuluspraesentation kann mit dem vertikalen Bildaufbau des Displays synchronisiert werden.
- Bildwiederholraten von 120 Hz und mehr sind auf kompatiblen Bildschirmen erreichbar.
- Visuelle Stimuli -- Bilder, Text, geometrische Formen -- werden ueber die GPU-Pipeline mit minimalem CPU-Aufwand gerendert.

Dies ist besonders relevant fuer Experimente, die kurze Stimuluspraesentationen erfordern (z.B. maskiertes Priming bei 16--33 ms Darbietungsdauer) oder praezise Interstimulusintervalle.

### Integrierte Skriptsprache

Das Variablen- und Skriptsystem ist kein nachtraeglich angehaengtes Zusatzmodul. Es ist ein zentrales Subsystem mit einer eigenen Formelsprache, die Folgendes unterstuetzt:

- **Mathematische Operationen**: `+`, `-`, `*`, `/`, `^`, `sqrt()`
- **Bedingte Logik**: `IF(Bedingung, WahrWert, FalschWert)`
- **Aggregatfunktionen**: `SUM()`, `AVG()`, `COUNT()`, `MIN()`, `MAX()`
- **Zeichenkettenoperationen**: `CONCAT()`, `LENGTH()`
- **Zeitfunktionen**: `NOW()`, `TIME_SINCE()`
- **Randomisierung**: `RANDOM()`, `RANDINT(min, max)`
- **Variableninterpolation**: `{{variablenName}}`-Syntax fuer dynamischen Text

Variablen koennen auf Teilnehmerantworten, berechnete Scores oder Systemwerte verweisen. Ablaufsteuerungsbloecke ermoeglichen bedingte Seitenanzeige, randomisierte Blockreihenfolge und Ueberspringlogik -- alles konfigurierbar ueber eine visuelle Oberflaeche, die von der Skriptsprache unterstuetzt wird.

### Mandantenfaehige Zusammenarbeit

Forschung ist selten eine Einzeltaetigkeit. QDesigner Modern basiert auf einem mandantenfaehigen Modell:

- **Organisationen** gewaehrleisten Datenisolation zwischen Forschungsgruppen. Jede Organisation hat eigene Mitglieder, Projekte und Frageboegen.
- **Projekte** buendeln zusammengehoerige Frageboegen innerhalb einer Organisation mit eigenen Mitgliederlisten und Rollenzuweisungen.
- **Rollenbasierte Zugriffskontrolle** auf Organisations- und Projektebene stellt sicher, dass nur autorisierte Teammitglieder Instrumente anzeigen, bearbeiten, veroeffentlichen oder loeschen koennen.

Die Rollenhierarchie (Eigentuemer > Administrator > Bearbeiter > Betrachter) wird serverseitig im Rust-Backend durchgesetzt, nicht lediglich in der Frontend-Oberflaeche.

### Moderne, performante Architektur

Die Plattform basiert auf einem modernen Technologie-Stack, der auf Leistung, Typsicherheit und Entwicklerproduktivitaet ausgelegt ist:

| Schicht | Technologie | Begruendung |
|---------|------------|-------------|
| Frontend | Svelte 5 + SvelteKit + TypeScript | Kompiliertes reaktives Framework mit minimalem Laufzeit-Overhead |
| Backend | Rust + Axum | Speichersichere Systemsprache mit vorhersagbarer Latenz |
| Datenbank | PostgreSQL 18 | Ausgereifte relationale Datenbank mit JSONB-Unterstuetzung fuer flexible Fragebogeninhalte |
| Authentifizierung | JWT + Argon2id | Branchenstandard Token-basierte Authentifizierung mit speicherhartem Passwort-Hashing |
| Speicher | MinIO (S3-kompatibel) | Selbst gehosteter Objektspeicher fuer Mediendateien |
| Cache | Redis 7 | Optionale Caching-Schicht fuer Ratenbegrenzung und Sitzungsverwaltung |

Das Frontend verwendet die Runes-Syntax von Svelte 5 (`$state`, `$derived`, `$effect`) fuer feinkoernige Reaktivitaet ohne virtuelles DOM. Das Backend nutzt das Typsystem von Rust und das Extraktor-Muster von Axum, um sicherzustellen, dass Autorisierungspruefungen nicht versehentlich umgangen werden koennen.

## Plattformfunktionen im Ueberblick

### Fragebogenerstellung

- Drag-and-Drop-Blockeditor mit Echtzeit-WYSIWYG-Vorschau
- Vielfaeltige Fragetypen: Einfachauswahl, Mehrfachauswahl, Texteingabe, Likert-Skalen, Matrixfragen, Schieberegler, Rangordnung und weitere
- Organisation auf Seiten- und Blockebene
- Bedingte Anzeigelogik und Ueberspringmuster
- Randomisierte Blockreihenfolge zur Ausbalancierung
- Formelbasierte berechnete Variablen und Auswertung
- Monaco-Editor-Integration fuer fortgeschrittenes Scripting

### Datenerhebung

- Browserbasierte Fragebogenteilnahme ohne Installation
- Hochpraezise Reaktionszeiterfassung
- WebGL-Stimuluspraesentation fuer zeitgesteuerte Paradigmen
- Fortschrittsspeicherung und Sitzungswiederaufnahme
- Konfigurierbare Abschlussregeln und Validierung

### Teamzusammenarbeit

- Organisations- und Projekthierarchie
- Vierstufiges Rollensystem (Eigentuemer, Administrator, Bearbeiter, Betrachter)
- E-Mail-basierter Einladungsworkflow
- Domaenbasierter automatischer Beitritt fuer institutionelle Konten
- Gleichzeitige Bearbeitung mit konfliktbewusster Persistenz

### Datenverwaltung

- Fragebogenversionierung (Entwurf, veroeffentlicht, archiviert)
- Antwortspeicherung mit Mikrosekunden-Zeitspalten
- JSONB-Inhaltsspeicherung fuer flexible Fragebogenstrukturen
- Weiches Loeschen mit Pruefprotokollen

## Vergleich mit bestehenden Werkzeugen

Forschende fragen haeufig, wie sich QDesigner Modern zu bestehenden Plattformen verhaelt. Der folgende Vergleich hebt die wesentlichen Unterschiede hervor:

### vs. Qualtrics

Qualtrics ist die dominierende kommerzielle Umfrageplattform in der akademischen Forschung. Es besticht durch traditionelles Umfragedesign mit umfangreichen Fragetypbibliotheken, Piping-Logik und Panel-Integration. Allerdings bietet Qualtrics keine Sub-Millisekunden-Zeitmessgenauigkeit, verfuegt nicht ueber GPU-beschleunigte Stimuluspraesentation, und seine Skriptfunktionen (obwohl leistungsfaehig) sind nicht fuer experimentelle Paradigmen mit Reaktionszeitmessung konzipiert. QDesigner Modern schliesst diese Luecke, indem es Qualtrics-Klasse-Umfragefunktionen mit laborgerechter Zeitmessung und Rendering kombiniert.

### vs. LimeSurvey / SoSci Survey

LimeSurvey und SoSci Survey sind beliebte Open-Source- bzw. akademische Umfragetools. Sie bieten solide Umfragefunktionalitaet mit guten Datenexportoptionen. Jedoch bietet keines der beiden WebGL-Rendering, Mikrosekunden-Zeitmessung oder ein modernes reaktives Frontend-Framework. Ihre serverseitigen Architekturen sind fuer traditionelle Formularuebermittlung konzipiert und nicht fuer Echtzeit-Experimentalparadigmen. QDesigner Modern bietet ein moderneres Entwickler- und Benutzererlebnis bei gleichzeitiger Beibehaltung der Self-Hosting-Flexibilitaet, die diese Tools bieten.

### vs. PsychoPy / jsPsych

PsychoPy und jsPsych sind dedizierte Experimentalsoftware-Pakete, die fuer praezise Stimuluspraesentation und Zeitmessung optimiert sind. Sie glaenzen in Laborumgebungen, sind aber primaer fuer Experimentprogrammierung konzipiert und nicht fuer Fragebogendesign. Die Erstellung eines mehrseitigen Fragebogens mit Ueberspringlogik, Scoring und Teamzusammenarbeit in PsychoPy erfordert erhebliche individuelle Entwicklung. QDesigner Modern schliesst diese Luecke, indem es die visuelle Umfagedesign-Erfahrung, die Forschende erwarten, mit den Zeitmessungsfaehigkeiten kombiniert, die Experimentalsoftware bietet.

### vs. Gorilla Experiment Builder

Gorilla ist ein webbasierter Experiment-Builder, der einige Ziele mit QDesigner Modern teilt. Es bietet visuelles Experimentdesign mit Reaktionszeitaufgaben. QDesigner Modern differenziert sich durch seine offene Architektur, Self-Hosting-Faehigkeit, tiefere Fragebogendesign-Funktionen (berechnete Variablen, Formelsprache) und das Rust-Backend, das niedrigere und vorhersagbarere API-Latenz bietet.

## Designphilosophie

Mehrere Prinzipien haben das Design von QDesigner Modern geleitet:

1. **Messintegritaet an erster Stelle**: Jede architektonische Entscheidung priorisiert die Genauigkeit und Zuverlaessigkeit der erhobenen Daten. Zeitmessgenauigkeit wird nicht approximiert -- sie wird auf Hardware-Ebene gemessen und verlustfrei gespeichert.

2. **Keine Installation fuer Teilnehmende**: Teilnehmende sollten niemals Software herunterladen, Plugins installieren oder ihren Browser konfigurieren muessen. Die Plattform laeuft auf Standard-Webtechnologien, die in jedem modernen Browser verfuegbar sind.

3. **Serverseitige Autoritaet**: Das Backend ist die einzige Quelle der Wahrheit fuer Autorisierung, Datenvalidierung und Geschaeftslogik. Das Frontend bietet eine responsive Benutzererfahrung, aber das Rust-Backend setzt unabhaengig jede Einschraenkung durch. Dies verhindert eine Kategorie von Fehlern, bei denen die clientseitige Validierung von den serverseitigen Regeln abweicht.

4. **Progressive Komplexitaet**: Einfache Frageboegen sollten einfach zu erstellen sein. Die Plattform zwingt Forschende nicht, die Skriptsprache zu erlernen, um einen Fragebogen mit fuenf Fragen zu erstellen. Erweiterte Funktionen (Formeln, bedingte Logik, WebGL-Stimuli) stehen bei Bedarf zur Verfuegung, ueberladen aber nicht die Standarderfahrung.

5. **Institutionelle Zusammenarbeit**: Forschungsteams haben komplexe Zugangsanforderungen. Die Organisations-/Projekt-/Rollen-Hierarchie ist so konzipiert, dass sie reale Forschungsgruppenstrukturen abbildet, ohne Umgehungen oder gemeinsam genutzte Konten zu erfordern.

## Aufbau dieses Buches

Dieses Buch ist so aufgebaut, dass es dem natuerlichen Arbeitsablauf bei der Nutzung von QDesigner Modern folgt -- von der Ersteinrichtung bis zum fortgeschrittenen Experimentaldesign:

- **Kapitel 1: Erste Schritte** behandelt die Kontoerstellung, E-Mail-Verifizierung und Ihre erste Anmeldung.
- **Kapitel 2: Der Fragebogen-Designer** fuehrt in den visuellen Editor, die Fragetypen und die Seitenorganisation ein.
- **Kapitel 3: Organisationsverwaltung** erlaeutert die mandantenfaehige Einrichtung, Mitgliederrollen und Einladungsworkflows.
- **Kapitel 4: Projektverwaltung** behandelt Projekterstellung, Konfiguration und den Fragebogenlebenszyklus.
- **Kapitel 5: Fragetypen** bietet eine detaillierte Referenz fuer jeden unterstuetzten Fragetyp.
- **Kapitel 6: Variablen und Scripting** behandelt die Formelsprache, berechnete Variablen und bedingte Logik.
- **Kapitel 7: Ablaufsteuerung und Experimentaldesign** befasst sich mit Randomisierung, Ausbalancierung und zeitgesteuerten Paradigmen.
- **Kapitel 8: Reaktionszeitmessung** erlaeutert Zeitmessgenauigkeit, WebGL-Rendering und Best Practices fuer zeitgesteuerte Aufgaben.
- **Kapitel 9: Verteilung und Datenerhebung** behandelt die Veroeffentlichung von Frageboegen und die Verwaltung von Antworten.
- **Kapitel 10: Zusammenarbeit und Teamverwaltung** stellt Workflows fuer Forschungsteams vor.
- **Kapitel 11: API-Referenz** dokumentiert die REST-API fuer programmatischen Zugriff.
- **Kapitel 12: Datenqualitaet und Statistik** diskutiert Validierung, Ausreissererkennung und analytische Ansaetze.

Jedes Kapitel enthaelt Schritt-fuer-Schritt-Anleitungen, Beschreibungen dessen, was Sie an jedem Punkt der Oberflaeche sehen werden, sowie praktische Tipps, die aus dem Design der Plattform abgeleitet sind.

> **Hinweis:** Diese Dokumentation beschreibt QDesigner Modern in Version 1.0. Die hier beschriebenen Funktionen entsprechen der implementierten Codebasis. Wo Funktionen geplant, aber noch nicht verfuegbar sind, wird dies ausdruecklich vermerkt.

## Hilfe erhalten

Wenn Sie bei der Nutzung von QDesigner Modern auf Probleme stossen:

1. Konsultieren Sie diese Dokumentation fuer Hinweise zu der von Ihnen genutzten Funktion.
2. Beachten Sie die in der Oberflaeche angezeigten Fehlermeldungen -- sie sind so formuliert, dass sie handlungsleitend sind.
3. Wenden Sie sich an Ihre Organisationsadministration, wenn das Problem Zugriffsberechtigungen betrifft.
4. Bei technischen Problemen konsultieren Sie den Issue-Tracker des Projekts auf GitHub.

Das naechste Kapitel fuehrt Sie durch die Erstellung Ihres Kontos und Ihre erste Anmeldung.
