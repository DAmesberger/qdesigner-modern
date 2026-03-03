# Kapitel 2: Personas und Arbeitsablaeufe

Dieses Kapitel definiert fuenf repraesentative Nutzer-Personas fuer QDesigner und bildet deren vollstaendige Arbeitsablaeufe durch die Anwendung ab. Jeder Abschnitt umfasst ein detailliertes Profil, einen schrittweisen UX-Flow mit Zuordnung zu den tatsaechlichen Routen der Anwendung sowie eine Analyse identifizierter UX-Luecken.

---

## 2.1 Personauebersicht

| Persona | Rolle | Organisationsrolle | Primaeres Ziel |
|---|---|---|---|
| Prof. Dr. Sarah Weber | Studienleiterin (PI) | Owner | Experimente entwerfen, Labor leiten, Daten analysieren |
| Max Berger | Wissenschaftlicher Mitarbeiter (Doktorand) | Editor | Frageboegen erstellen, Datenerhebung ueberwachen |
| Lisa Hoffmann | Studienteilnehmerin | Keine (anonym) | Fragebogen korrekt ausfuellen |
| Dr. Thomas Mueller | Abteilungsleiter | Admin | Zugang verwalten, Projekte beaufsichtigen, Compliance sicherstellen |
| Anna Schmidt | Studentische Forscherin (M.Sc.) | Owner (Einzelnutzerin) | Thesis-Umfrage: entwerfen, erheben, exportieren |

---

## 2.2 Prof. Dr. Sarah Weber -- Studienleiterin

### Profil

- **Alter**: 42
- **Position**: W2-Professorin fuer Verhaltenspsychologie, Universitaet Heidelberg
- **Technisches Niveau**: Mittel. Nutzt SPSS und R taeglich, komfortabel mit Webanwendungen, bevorzugt klare Oberflaechen gegenueber Kommandozeilen-Werkzeugen.
- **Hintergrund**: Leitet ein Forschungslabor mit 8 Mitgliedern (3 Doktoranden, 2 Postdocs, 3 Masterstudierende). Veroeffentlicht 4--6 Arbeiten pro Jahr. Hat umfangreiche Erfahrung mit LimeSurvey und Qualtrics, findet diese aber unzureichend fuer Reaktionszeitmessungen.
- **Ziele**:
  - Komplexe Within-Subjects-Experimente mit ausbalancierter Bedingungsreihenfolge entwerfen
  - Mikrosekunden-genaue Reaktionszeitmessung erzielen
  - Daten in R- und SPSS-kompatiblen Formaten exportieren
  - Alle Fragebogenprojekte ihres Labors zentral verwalten
  - Datenqualitaet durch Aufmerksamkeitschecks und Timing-Validierung sicherstellen
- **Schmerzpunkte**:
  - Bisherige Werkzeuge koennen keine Sub-Millisekunden-Reaktionszeiten messen
  - Verwaltung wechselnder Teammitglieder ist muehsam
  - Keine integrierten experimentellen Designfunktionen in Standard-Umfragetools
  - Datenexport erfordert manuelle Nachbearbeitung fuer Statistiksoftware

### Vollstaendiger UX-Flow

#### Phase 1: Kontoeinrichtung

1. **Startseite** (`/(public)/+page.svelte` unter `/`)
   - Sarah sieht die Marketingseite mit Hero-Bereich, Feature-Showcase, Leistungskennzahlen, interaktiver Demo, Testimonials und Preisgestaltung.
   - Klickt auf "Get Started" oder den Registrierungs-CTA.

2. **Registrierung** (`/(auth)/signup/+page.svelte` unter `/signup`)
   - Gibt vollstaendigen Namen ein: "Prof. Dr. Sarah Weber"
   - Gibt Universitaets-E-Mail ein: `sarah.weber@uni-heidelberg.de`
   - Erstellt Passwort (Staerkeanzeige zeigt "Very Strong")
   - Domain-Auto-Join-Erkennung wird geprueft (`checkDomainAutoJoin`)
   - Stimmt den Nutzungsbedingungen zu
   - Klickt auf "Create Account"
   - System sendet 6-stelligen Verifizierungscode per E-Mail

3. **E-Mail-Verifizierung** (gleiche Seite, Verifizierungsschritt)
   - Oeffnet Universitaets-E-Mail (oder MailPit im Entwicklungsmodus unter `localhost:18026`)
   - Gibt 6-stelligen Code ein
   - System verifiziert, meldet sie an, leitet zu `/dashboard` weiter

4. **Organisations-Onboarding** (`/(auth)/onboarding/organization/+page.svelte` unter `/onboarding/organization`)
   - Da keine Organisation vorhanden, wird hierhin weitergeleitet
   - Gibt Organisationsnamen ein: "Weber Lab - Verhaltenspsychologie"
   - Klickt auf "Create Organization"
   - Sieht "Was passiert als Naechstes?"-Schritte: Projekt erstellen, Team einladen, Fragebogen bauen
   - Weiterleitung zum Dashboard

#### Phase 2: Teameinrichtung

5. **Dashboard** (`/(app)/dashboard/+page.svelte` unter `/dashboard`)
   - Sieht Willkommensnachricht: "Welcome back, Prof. Dr. Sarah Weber"
   - Statistikkarten: 0 Frageboegen, 0 Antworten, 0 Aktiv, 0% Durchschn. Abschlussrate
   - Leerer Zustand: "No questionnaires yet" mit Handlungsanleitung
   - Navigiert ueber die obere Navigationsleiste zum Admin-Bereich

6. **Admin-Dashboard** (`/(app)/admin/+page.svelte` unter `/admin`)
   - Sieht Organisationsstatistiken (aktuell Platzhalter-Werte)
   - Schnellaktionen: Nutzer verwalten, Einladungen verwalten, Domain-Auto-Join, Alle Frageboegen, Analytik, Systemeinstellungen
   - Klickt auf "Manage Invitations"

7. **Einladungsverwaltung** (`/(app)/admin/invitations/+page.svelte` unter `/admin/invitations`)
   - Klickt auf "Send Invitation"
   - Einladungsformular erscheint: E-Mail, Rolle (Viewer/Member/Admin), persoenliche Nachricht
   - Sendet Einladungen an ihr Team:
     - `max.berger@uni-heidelberg.de` -- Rolle: Member
     - `anna.schmidt@uni-heidelberg.de` -- Rolle: Member
   - Jede Einladung generiert eine eindeutige Token-URL: `/invite/{token}`
   - Kann Einladungslinks kopieren, ausstehende Einladungen widerrufen
   - Sieht Einladungsstatus: Pending, Viewed, Accepted, Declined, Expired, Revoked

8. **Domain-Auto-Join** (`/(app)/admin/domains/+page.svelte` unter `/admin/domains`)
   - Klickt auf "Add Domain"
   - Gibt `uni-heidelberg.de` ein
   - System liefert DNS-TXT-Record oder dateibasierte Verifizierungsanweisungen
   - Nach Verifizierung: konfiguriert Auto-Join (aktivieren/deaktivieren), Subdomain-Einschluss, Standardrolle (Viewer/Member), Willkommensnachricht

#### Phase 3: Projekt- und Experimentdesign

9. **Projektliste** (`/(app)/projects/+page.svelte` unter `/projects`)
   - Leerer Zustand: "No projects" mit "New Project"-Button
   - Klickt auf "New Project"
   - Modal: Name "Implicit Association Study 2026", Code "IAS2026", Beschreibung
   - Projekt erstellt, navigiert zur Projektdetailseite

10. **Projektdetail** (`/(app)/projects/[projectId]/+page.svelte` unter `/projects/{id}`)
    - Breadcrumb: Projects > Implicit Association Study 2026
    - Zeigt Projektname, Code, Beschreibung
    - Buttons: "New Questionnaire" und "Analytics"
    - Leerer Zustand: "No questionnaires" mit CTA
    - Klickt auf "New Questionnaire"
    - Modal: Name "IAT Block 1 - Uebung", Beschreibung
    - Klickt "Create & Edit" -- navigiert zum Designer

11. **Fragebogen-Designer** (`/(app)/projects/[projectId]/designer/[[questionnaireId]]/+page.svelte`)
    - Vollbild-Layout mit:
      - **Header**: Breadcrumb (Projects > IAS2026 > IAT Block 1), editierbarer Titel, Speicherindikator, Design-/Qualitaets-/Teilen-/Vorschau-/Veroeffentlichungs-Buttons
      - **Linke Seitenleiste**: Fragenpalette (Drag-and-Drop), Blockmanager, Flusskontrolle, Variablenmanager
      - **Canvas**: WYSIWYG- oder Strukturansicht (umschaltbar)
      - **Rechte Seitenleiste**: Eigenschaftenpanel fuer ausgewaehlte Frage
    - Tastenkuerzel: Strg+S (Speichern), Strg+P (Vorschau), Strg+K (Befehlspalette), Strg+Z/Strg+Umschalt+Z (Rueckgaengig/Wiederholen), Strg+D (Duplizieren), Entf (Loeschen), Alt+Pfeiltasten (Umordnen)
    - Fragen werden per Drag-and-Drop aus der Palette oder ueber Strg+Umschalt+A hinzugefuegt
    - Variablen und Scripting ueber den Variablenmanager konfigurieren
    - Script-Editor-Overlay fuer komplexe Logik oeffnen
    - Experimentelles Design-Panel (Kolben-Icon): Between-/Within-Subjects-Design konfigurieren
    - Datenqualitaets-Panel (Schild-Icon): Aufmerksamkeitschecks, Timing-Validierung
    - Auto-Save laeuft kontinuierlich; manuelles Speichern mit Strg+S

12. **Vorschau** (Modal-Overlay ueber `PreviewModal.svelte`)
    - Strg+P oder "Preview"-Button
    - Vollstaendige Simulation der Fragebogen-Laufzeitumgebung
    - Escape zum Schliessen

13. **Verteilung / Teilen** (Panel-Overlay ueber `DistributionPanel.svelte`)
    - Zeigt Veroeffentlichungsstatus (Draft/Published)
    - Wenn Entwurf: "Publish Now"-Button
    - Nach Veroeffentlichung: zeigt Ausfuell-URL (`/{shareCode}`), Kopierfunktion, QR-Code, Einbettungscode (`<iframe>`)
    - Zusammenfassung: Fragenzahl, Seitenzahl, Zugriffseinstellungen

#### Phase 4: Datenerhebung und Analyse

14. **Veroeffentlichung** (ueber Header-"Publish"-Button oder Strg+Umschalt+Enter)
    - Validiert den Fragebogen (keine Fehler erforderlich)
    - Speichert, dann veroeffentlicht
    - Fragebogen wird ueber Share-Code zugaenglich

15. **Monitoring** (zurueck zum Dashboard unter `/dashboard`)
    - Fragebogenkarten zeigen: Antwortzahl, Abschlussanzahl, durchschnittliche Bearbeitungszeit, woechentlicher Antworttrend
    - Seitenleiste mit aktueller Aktivitaet zeigt Teilnehmerabschluesse

16. **Analytik** (`/(app)/projects/[projectId]/analytics/+page.svelte` unter `/projects/{id}/analytics`)
    - Breadcrumb: Projects > IAS2026 > Analytics
    - Fragebogen-Auswahl per Dropdown
    - Uebersichtskarten: Gesamtsitzungen, Abschlussrate, Abbrueche, Status
    - Sitzungstabelle: Sitzungs-ID, Teilnehmer, Status, Gestartet, Abgeschlossen
    - Exportbuttons: CSV- und JSON-Download
    - Statistikkarten-Komponente fuer visuelle Datenanzeige

#### Phase 5: Export und Auswertung

17. **Datenexport** (von der Analytik-Seite)
    - Waehlt Fragebogen aus dem Dropdown
    - Klickt auf CSV- oder JSON-Export-Button
    - Laedt Datei herunter: `IAT_Block_1_Uebung_csv_2026-03-02.csv`
    - CSV-Spalten: session_id, participant_id, session_status, started_at, completed_at, question_id, value, reaction_time_us, presented_at, answered_at
    - Import in R/SPSS zur statistischen Auswertung

### Identifizierte UX-Luecken

| Luecke | Schweregrad | Ort | Beschreibung |
|---|---|---|---|
| Fehlende `/forgot-password`-Route | Mittel | Login-Seite Zeile 186 | "Forgot password?"-Link fuehrt zu 404 |
| Fehlende `/settings`-Route | Mittel | AppShell-Nutzermenue Zeile 171-174 | "Your Profile" und "Settings"-Links fuehren zu 404 |
| Fehlende Admin-Unterseiten | Hoch | Admin-Seite Zeilen 103-139 | `/admin/users`, `/admin/questionnaires`, `/admin/analytics`, `/admin/settings` fuehren alle zu 404 |
| Fest kodierte Admin-Statistiken | Niedrig | Admin-Seite Zeilen 14-19 | Statistiken sind fest kodiert statt von der API geladen |
| Login "Create account"-Button | Mittel | Login-Seite Zeile 258-268 | Ruft `handleSignUp` auf (erstellt Konto inline ohne Name/AGB) statt zu `/signup` zu navigieren |
| "View All Activity" ohne Funktion | Niedrig | Dashboard Zeile 389 | Button hat keinen onclick-Handler oder href |

---

## 2.3 Max Berger -- Wissenschaftlicher Mitarbeiter

### Profil

- **Alter**: 28
- **Position**: Doktorand, 3. Jahr, Weber Lab
- **Technisches Niveau**: Hoch. Programmiert in Python und R, komfortabel mit komplexen Oberflaechen, Power-User von Tastenkuerzeln.
- **Hintergrund**: Entwirft und fuehrt Verhaltensexperimente fuer Sarahs Labor durch. Verwaltet die taegliche Datenerhebung. Hat Erfahrung mit PsychoPy, jsPsych und Qualtrics.
- **Ziele**:
  - Frageboegen mit Verzweigungslogik und Variablen-Piping erstellen
  - Frageboegen gruendlich vor dem Einsatz testen
  - Antwortquoten ueberwachen und Datenqualitaetsprobleme frueh erkennen
  - Schnell iterieren basierend auf Pilot-Feedback
- **Schmerzpunkte**:
  - Bisherige Werkzeuge haben umstaendliche Verzweigungslogik-Editoren
  - Keine Echtzeit-Vorschau waehrend der Bearbeitung
  - Schwierig, komplexe Flusskontrolle ohne Veroeffentlichung zu testen
  - Reaktionszeit-Items erfordern separate Werkzeuge (jsPsych), die nicht mit Umfragen integriert sind

### Vollstaendiger UX-Flow

#### Phase 1: Organisation beitreten

1. **Einladungs-E-Mail**
   - Erhaelt E-Mail mit Einladungslink: `https://qdesigner.app/invite/{token}`
   - Klickt auf den Link

2. **Einladungsseite** (`/invite/[token]/+page.svelte` unter `/invite/{token}`)
   - Sieht: "You're Invited!" mit Organisationsname "Weber Lab - Verhaltenspsychologie"
   - Zeigt: Name der einladenden Person (Prof. Dr. Sarah Weber), Rollen-Badge (Member), optionale persoenliche Nachricht
   - Da Max kein Konto hat: sieht Hinweis "Please sign in or create an account"
   - Zwei Buttons: "Sign In" (geht zu `/login?redirect=/invite/{token}`) und "Create Account" (geht zu `/signup?email=max.berger@uni-heidelberg.de`)

3. **Registrierung** (`/signup` mit vorausgefuellter E-Mail)
   - E-Mail aus Einladungslink vorausgefuellt
   - Fuellt Name, Passwort aus, stimmt AGB zu
   - Schliesst E-Mail-Verifizierung ab
   - Zurueck zur Einladungsseite weitergeleitet

4. **Einladung annehmen** (`/invite/{token}` -- jetzt authentifiziert)
   - Sieht "Accept & Join" / "Decline"-Buttons
   - Klickt "Accept & Join"
   - Weiterleitung zum Dashboard
   - Jetzt Mitglied der "Weber Lab"-Organisation

#### Phase 2: Fragebogen-Design

5. **Dashboard** (`/dashboard`)
   - Sieht Frageboegen der Organisation
   - Klickt auf einen Fragebogen oder navigiert zu Projekten

6. **Projekte** (`/projects`)
   - Sieht Projekte mit Zugriffsrechten (z.B. "Implicit Association Study 2026")
   - Klickt auf Projektkarte

7. **Projektdetail** (`/projects/{projectId}`)
   - Sieht vorhandene Frageboegen mit Status-Badges (draft/published)
   - Erstellt neuen Fragebogen oder bearbeitet vorhandenen
   - Klickt auf Bearbeiten-Icon (Stift) bei einem Fragebogen

8. **Designer** (`/projects/{projectId}/designer/{questionnaireId}`)
   - Vollstaendige Designer-Oberflaeche (identisch mit Sarahs Ansicht, eingeschraenkt durch Editor-Berechtigungen)
   - Arbeitsablauf:
     a. **Fragenpalette** (Linke Seitenleiste): Fragetypen per Drag-and-Drop auf den Canvas ziehen
     b. **Canvas**: Fragen in WYSIWYG- oder Strukturansicht anordnen und bearbeiten
     c. **Eigenschaftenpanel** (Rechte Seitenleiste): Einstellungen der ausgewaehlten Frage konfigurieren
     d. **Blockmanager**: Fragen in logische Bloecke/Seiten organisieren
     e. **Flusskontrolle**: Skip-Logik und Verzweigungen einrichten
     f. **Variablenmanager**: Berechnete Variablen, Formeln, Piping definieren
     g. **Script-Editor** (Overlay): Fortgeschrittene Skripte fuer komplexe Logik schreiben
   - Nutzt Tastenkuerzel intensiv:
     - Strg+K: Befehlspalette fuer Schnellaktionen
     - Strg+S: Speichern
     - Strg+P: Vorschau
     - Strg+D: Frage duplizieren
     - Alt+Hoch/Runter: Fragen umordnen

9. **Vorschau und Test**
   - Strg+P oeffnet Vorschau-Modal
   - Durchlaufen des gesamten Fragebogen-Flows
   - Testen von Verzweigungslogik, Variablen-Piping, Skip-Bedingungen
   - Escape zum Zurueckkehren zum Editor

10. **Teilen fuer Pilottests**
    - Klickt "Share"-Button im Header
    - Verteilungspanel oeffnet sich
    - Wenn nicht veroeffentlicht: klickt "Publish Now"
    - Kopiert Ausfuell-URL
    - Sendet an Pilotteilnehmer oder oeffnet in neuem Tab zum Selbsttest

#### Phase 3: Monitoring

11. **Analytik** (`/projects/{projectId}/analytics`)
    - Waehlt Fragebogen aus dem Dropdown
    - Ueberwacht Sitzungszahlen, Abschlussraten, abgebrochene Sitzungen
    - Prueft einzelne Sitzungszeilen
    - Exportiert Daten fuer vorlaeufige Auswertung

### Identifizierte UX-Luecken

| Luecke | Schweregrad | Ort | Beschreibung |
|---|---|---|---|
| Keine rollenbasierte UI-Filterung | Mittel | Designer/Admin | Editor-Rolle sieht Admin-Links in der Navigation, hat aber moeglicherweise keine API-Berechtigung |
| Fehlende Einladungs-Weiterleitung nach Registrierung | Mittel | Registrierungsfluss | Nach Registrierung + Verifizierung geht der Nutzer zum `/dashboard` statt zurueck zu `/invite/{token}` |
| Fehlende Projektmitglieder-Verwaltung | Mittel | Projektdetail | Keine Oberflaeche um zu sehen/verwalten, wer Zugriff auf ein bestimmtes Projekt hat |

---

## 2.4 Lisa Hoffmann -- Studienteilnehmerin

### Profil

- **Alter**: 21
- **Position**: Psychologiestudierende im Bachelor
- **Technisches Niveau**: Hoch mit Verbraucher-Apps, niedrig mit Forschungswerkzeugen. Nutzt hauptsaechlich das Smartphone.
- **Hintergrund**: Nimmt an Studien fuer Versuchspersonenstunden und Aufwandsentschaedigung teil. Hat viele Online-Umfragen in Qualtrics und Google Forms ausgefuellt. Erste Teilnahme an einer Reaktionszeitstudie.
- **Ziele**:
  - Den Fragebogen korrekt und effizient ausfuellen
  - Verstehen, was gefragt wird
  - Den Fortschritt durch die Studie sehen
  - Bestaetigung des Abschlusses erhalten (fuer VP-Stunden)
- **Schmerzpunkte**:
  - Umfragen, die auf dem Smartphone nicht funktionieren
  - Unklare Anweisungen bei zeitgesteuerten Aufgaben
  - Keine Angabe, wie lange die Studie dauert
  - Studien, die mittendrin abstuerzen ohne Wiederherstellungsmoeglichkeit

### Vollstaendiger UX-Flow

#### Phase 1: Zugang

1. **Link erhalten**
   - Erhaelt eine URL vom Forscher: `https://qdesigner.app/{SHARECD}` (8-stelliger Code aus der Fragebogen-ID)
   - Koennte auch einen QR-Code scannen (generiert im Verteilungspanel)
   - Oder ein eingebettetes iframe auf einer Kurswebseite finden

2. **Ausfuell-Startseite** (`/(fillout)/[code]/+page.svelte` unter `/{code}`)
   - Seite laedt mit serverseitigem Datenabruf (`+page.server.ts` loest Share-Code zum Fragebogen auf)
   - System prueft auf vorhandene Sitzung (Wiederaufnahme-Unterstuetzung)

3. **Willkommensbildschirm** (`WelcomeScreen.svelte`)
   - Zeigt Fragebogentitel, Projektname
   - Beschreibung und geschaetzte Dauer
   - "Start"-Button
   - Wenn `requireConsent` in den Einstellungen aktiviert: Klick auf Start fuehrt zum Einwilligungsbildschirm
   - Wenn keine Einwilligung erforderlich: erstellt Sitzung und startet Laufzeitumgebung direkt

#### Phase 2: Einwilligung und Laufzeitumgebung

4. **Einwilligungsbildschirm** (`ConsentScreen.svelte`, wenn aktiviert)
   - Zeigt Einwilligungstext (HTML-Inhalt)
   - Optionale Checkboxen (z.B. "Ich stimme der freiwilligen Teilnahme zu")
   - Optionale Unterschriftsanforderung
   - "Accept" erstellt Sitzung und faehrt mit Laufzeitumgebung fort
   - "Decline" navigiert zur Startseite (`/`)

5. **Sitzungserstellung**
   - `QuestionnaireAccessService.createOrResumeSession()` wird aufgerufen
   - Erstellt oder nimmt Sitzung ueber API wieder auf
   - Sitzungs-ID wird fuer Fortschrittsverfolgung gespeichert

6. **Laufzeitumgebung** (WebGL-Canvas + HTML-Overlay)
   - Ladesequenz: "Initializing WebGL..." > "Loading questionnaire..." > "Loading media resources... X%" > "Starting questionnaire..."
   - Vollbild-Canvas mit WebGL-2.0-Rendering bei bis zu 120+ FPS
   - HTML-Overlay fuer Formulareingaben (Textfelder, Radiobuttons, Checkboxen)
   - Tastaturereignisse werden fuer Reaktionszeitmessung erfasst (`performance.now()`)
   - Fortschritt wird periodisch gespeichert (Offline-Synchronisation aktiviert)
   - Unterstuetzt: Standardfragen, zeitgesteuerte Items, Medienstimuli

7. **Abschlussbildschirm** (`CompletionScreen.svelte`)
   - Zeigt benutzerdefinierte Abschlussnachricht (vom Forscher konfigurierbar)
   - Optionale Statistikanzeige
   - "Close"-Button navigiert zu `/`
   - Teilnehmerin kann Screenshot machen oder Abschluss fuer VP-Stunden notieren

#### Phase 3: Fehlerbehandlung

8. **Fehlerzustaende**
   - Wenn Fragebogen nicht laedt: `EmptyState` mit "Unable to load questionnaire" und "Go back"-Button
   - Wenn Medien nicht vorladen: detaillierte Fehlermeldung mit Auflistung fehlgeschlagener Dateien
   - Wenn WebGL nicht unterstuetzt: Fehlerzustand (graceful Degradation noch nicht implementiert)
   - Wenn Sitzung unterbrochen: Wiederaufnahme durch erneuten Besuch derselben URL (Erkennung vorhandener Sitzungen)

### Identifizierte UX-Luecken

| Luecke | Schweregrad | Ort | Beschreibung |
|---|---|---|---|
| Kein Fortschrittsbalken beim Ausfuellen | Hoch | Ausfuell-Laufzeitumgebung | Teilnehmerin hat keine Moeglichkeit zu sehen, wie weit sie durch den Fragebogen ist |
| Keine "Zurueck"-Navigation beim Ausfuellen | Mittel | Ausfuell-Laufzeitumgebung | Kann nicht zu vorherigen Fragen zurueckgehen (moeglicherweise beabsichtigt bei zeitgesteuerten Studien) |
| Einwilligungsablehnung geht zu `/` | Niedrig | ConsentScreen | Navigiert zur Marketingseite, was fuer Teilnehmerinnen verwirrend sein kann; sollte "Vielen Dank, Sie koennen diesen Tab schliessen" anzeigen |
| Keine mobile-responsive Laufzeitumgebung | Mittel | Ausfuell-Canvas | WebGL-Canvas nutzt `window.innerWidth/Height`, aber keine Touch-Gesten-Behandlung dokumentiert |
| Kein Abschlussnachweis | Mittel | CompletionScreen | Kein herunterladbarer Nachweis oder Abschlusscode fuer VP-Stunden-Systeme |
| Keine Sprachauswahl | Niedrig | Ausfuell-Flow | Keine Moeglichkeit fuer Teilnehmende, die Sprache zu waehlen |

---

## 2.5 Dr. Thomas Mueller -- Abteilungsleiter

### Profil

- **Alter**: 55
- **Position**: Leiter der Abteilung Psychologie, beaufsichtigt 4 Forschungslabore
- **Technisches Niveau**: Niedrig bis mittel. Nutzt E-Mail und Standard-Bueroanwendungen. Delegiert technische Aufgaben.
- **Hintergrund**: Verantwortlich fuer die abteilungsweite Forschungsinfrastruktur, Datenschutz und Ethik-Compliance. Muss sicherstellen, dass Forschungsprojekte institutionelle Anforderungen erfuellen.
- **Ziele**:
  - Zentrale Plattform fuer alle Forschungsgruppen der Abteilung bereitstellen
  - Zugang und Berechtigungen fuer verschiedene Labore kontrollieren
  - Forschungsaktivitaeten projektuebergreifend ueberwachen
  - Compliance mit Datenschutzvorschriften (DSGVO) sicherstellen
  - Domain-basiertes Auto-Join fuer Universitaetspersonal einrichten
- **Schmerzpunkte**:
  - Jedes Labor nutzt verschiedene Werkzeuge, was Ueberblick unmoeglich macht
  - Kein zentraler Blick auf alle Forschungsaktivitaeten
  - Verwaltung einzelner Konten ist zeitaufwaendig
  - Datenschutzbedenken wenn Forschende die Einrichtung verlassen

### Vollstaendiger UX-Flow

#### Phase 1: Organisationseinrichtung

1. **Registrierung und Onboarding** (identisch mit Sarahs Flow)
   - Erstellt Konto unter `/signup`
   - Erstellt Organisation: "Institut fuer Psychologie - Universitaet Heidelberg"
   - Gelangt zum Dashboard

2. **Domain-Konfiguration** (`/admin/domains`)
   - Fuegt Domain `psychologie.uni-heidelberg.de` hinzu
   - Konfiguriert DNS-Verifizierung
   - Nach Verifizierung: aktiviert Auto-Join, setzt Standardrolle auf "Viewer"
   - Fuegt Willkommensnachricht hinzu: "Willkommen auf der Plattform des Instituts fuer Psychologie. Kontaktieren Sie die IT fuer Unterstuetzung."
   - Ergebnis: Alle Universitaetsmitarbeitenden mit passender E-Mail koennen automatisch beitreten

3. **Team-Einladungen** (`/admin/invitations`)
   - Laedt Laborleiter als Admins ein:
     - `sarah.weber@uni-heidelberg.de` -- Admin-Rolle
     - `frank.becker@uni-heidelberg.de` -- Admin-Rolle
   - Jeder Admin kann dann seine eigenen Labormitglieder verwalten

#### Phase 2: Ueberblick

4. **Dashboard** (`/dashboard`)
   - Sieht aggregierte Statistiken ueber alle Frageboegen
   - Sieht aktuelle Aktivitaeten aller Organisationsmitglieder
   - Ueberwacht Gesamt-Antwortquoten

5. **Projektuebersicht** (`/projects`)
   - Sieht alle Projekte der Abteilung
   - Kann in jedes Projekt klicken, um Frageboegen einzusehen
   - Kann nicht bearbeiten (Viewer-Zugriff auf Inhalte, Admin-Zugriff fuer Nutzer)

6. **Admin-Dashboard** (`/admin`)
   - Sieht organisationsweite Statistiken
   - Schnellaktionen fuer Nutzerverwaltung, Einladungen, Domains
   - Ueberblick ueber aktuelle Aktivitaeten

#### Phase 3: Zugriffsverwaltung

7. **Nutzerverwaltung** (`/admin/users` -- NOCH NICHT IMPLEMENTIERT)
   - Wuerde alle Organisationsmitglieder auflisten
   - Rollen aendern, Konten deaktivieren
   - Letzte Login-Daten einsehen

8. **Einladungsmonitoring** (`/admin/invitations`)
   - Prueft ausstehende Einladungen
   - Widerruft abgelaufene oder unnoetige Einladungen
   - Verfolgt Annahmeraten

### Identifizierte UX-Luecken

| Luecke | Schweregrad | Ort | Beschreibung |
|---|---|---|---|
| Fehlende `/admin/users`-Seite | Hoch | Admin-Schnellaktionen | Nutzerverwaltungsseite existiert nicht; Link gibt 404 zurueck |
| Fehlende `/admin/settings`-Seite | Hoch | Admin-Schnellaktionen | Systemeinstellungsseite existiert nicht; Link gibt 404 zurueck |
| Fehlende `/admin/questionnaires`-Seite | Mittel | Admin-Schnellaktionen | Organisationsweite Fragebogenliste existiert nicht |
| Fehlende `/admin/analytics`-Seite | Mittel | Admin-Schnellaktionen | Organisationsweite Analytik existiert nicht |
| Keine rollenbasierte Sichtbarkeit | Hoch | Navigation + API | Admin-Navigation zeigt gleiche Elemente unabhaengig von der Rolle; keine RBAC-Filterung in der UI |
| Kein Audit-Log | Mittel | Admin-Bereich | Keine Moeglichkeit zu sehen, wer was getan hat (Bearbeitungen, Loeschungen, Zugriffsaenderungen) |
| Keine Datenexport-Governance | Mittel | Analytik | Keine Kontrollen, wer Daten exportieren oder Antworten herunterladen kann |
| Keine Mitgliederliste | Hoch | Organisation | Keine Moeglichkeit, aktuelle Organisationsmitglieder oder deren Rollen einzusehen (ausser ueber Einladungen) |

---

## 2.6 Anna Schmidt -- Studentische Forscherin

### Profil

- **Alter**: 24
- **Position**: Masterstudentin in Psychologie, schreibt Thesis ueber soziale Medien und Wohlbefinden
- **Technisches Niveau**: Mittel. Nutzt Google Forms und grundlegende Statistikwerkzeuge. Keine Programmiererfahrung.
- **Hintergrund**: Muss Umfragedaten fuer ihre Masterarbeit erheben. Hat 150 Zielteilnehmende aus universitaeren Social-Media-Gruppen. Budget: null. Zeit: 3 Monate.
- **Ziele**:
  - Schnell einen professionell aussehenden Fragebogen erstellen
  - Validierte psychologische Skalen einbinden (z.B. PHQ-9, WHO-5)
  - Antworten kostenlos erheben
  - Daten fuer SPSS-Auswertung exportieren
  - Thesis termingerecht abschliessen
- **Schmerzpunkte**:
  - Kostenlose Umfragetools haben Antwortlimits oder Branding
  - Keine Vorlagen fuer standardpsychologische Instrumente
  - Komplexe Tools sind ueberfordernd fuer einfache Umfragen
  - Braucht Anleitung zu Best Practices (Randomisierung, Aufmerksamkeitschecks)

### Vollstaendiger UX-Flow

#### Phase 1: Einstieg

1. **Entdeckung**
   - Findet QDesigner ueber Universitaetsempfehlung oder Websuche
   - Besucht Startseite unter `/`
   - Prueft Features, Leistungskennzahlen, Preisgestaltung
   - Klickt "Get Started"

2. **Registrierung** (`/signup`)
   - Erstellt Konto mit Universitaets-E-Mail
   - Verifiziert E-Mail mit 6-stelligem Code
   - Meldet sich an

3. **Organisationseinrichtung** (`/onboarding/organization`)
   - Erstnutzerin, keine Organisationen
   - Erstellt: "Anna Schmidt - Thesis-Forschung"
   - Sieht Onboarding-Schritteanleitung
   - Weiterleitung zum Dashboard

4. **Projekt erstellen** (`/projects`)
   - Leere Projektseite mit "New Project"-CTA
   - Erstellt: Name "Soziale Medien & Wohlbefinden Studie", Code "SMWB01"
   - Navigiert zur Projektdetailseite

5. **Fragebogen erstellen** (`/projects/{id}`)
   - Klickt "New Questionnaire"
   - Name: "Soziale Mediennutzung und psychische Gesundheit"
   - Klickt "Create & Edit"

#### Phase 2: Fragebogen aufbauen

6. **Designer** (`/projects/{id}/designer/{qId}`)
   - Nutzt Fragenpalette um Items hinzuzufuegen:
     - Texteingaben fuer Demografien
     - Likert-Skalen fuer validierte Instrumente
     - Multiple-Choice fuer Nutzungsmuster
     - Matrix-Fragen fuer Skalenbatterien
   - Nutzt Blockmanager zur Organisation in Abschnitte:
     - Block 1: Demografien
     - Block 2: Soziale Mediennutzung (SMU-Skala)
     - Block 3: Wohlbefinden (WHO-5)
     - Block 4: Depressions-Screening (PHQ-9)
     - Block 5: Offenes Feedback
   - Nutzt Variablenmanager fuer:
     - Berechnete Scores: `SUM(Q3_1, Q3_2, Q3_3, Q3_4, Q3_5)` fuer WHO-5-Gesamtwert
     - Bedingte Logik: `IF(PHQ9_TOTAL > 10, "hoch", "niedrig")` fuer Schweregrad
   - Eigenschaftenpanel zur Konfiguration jeder Frage:
     - Pflicht/Optional
     - Validierungsregeln
     - Hilfetext

7. **Vorschau und Test**
   - Strg+P fuer Vorschau
   - Durchlaufen des gesamten Fragebogens
   - Pruefen, ob Variablenberechnungen korrekte Werte zeigen
   - Testen der Skip-Logik

8. **Datenqualitaet einrichten**
   - Klickt "Quality"-Button im Header
   - Datenqualitaets-Panel oeffnet sich
   - Konfiguriert Aufmerksamkeitscheck-Items
   - Setzt minimale Bearbeitungszeit-Schwellenwerte

#### Phase 3: Verteilung

9. **Veroeffentlichen und Teilen**
   - Klickt "Publish" im Header (validiert: keine Fehler, hat Fragen)
   - Oeffnet Share-Panel
   - Kopiert Ausfuell-URL
   - Generiert QR-Code fuer gedruckte Flyer
   - Kopiert Einbettungscode fuer Universitaetsportal
   - Teilt Link in studentischen WhatsApp-Gruppen und Kursforen

#### Phase 4: Datenerhebung und Export

10. **Antworten ueberwachen** (`/dashboard`)
    - Prueft taeglich: Antwortzahl, Abschlussrate, Durchschnittszeit
    - Fragebogenkarte zeigt Trends ("+15% diese Woche")

11. **Analytik** (`/projects/{id}/analytics`)
    - Waehlt Fragebogen aus
    - Sieht: Gesamtsitzungen, Abschlussrate, Abbruchrate
    - Prueft Sitzungsdetails

12. **Export** (von der Analytik-Seite)
    - Klickt CSV-Export
    - Laedt Datei mit allen Antwortdaten herunter
    - Importiert in SPSS fuer Thesis-Auswertung
    - Spalten enthalten reaction_time_us fuer zeitgesteuerte Items

### Identifizierte UX-Luecken

| Luecke | Schweregrad | Ort | Beschreibung |
|---|---|---|---|
| Keine Fragebogenvorlagen | Hoch | Designer | Keine Moeglichkeit, von einer Vorlage zu starten (validierte Skalen, gaengige Muster) |
| Kein gefuehrtes Onboarding im Designer | Mittel | Designer | Erstnutzerinnen sehen leeren Canvas ohne Tutorial oder Hinweise |
| Kein Speicher-Feedback | Niedrig | Designer | Auto-Save laeuft, aber keine Toast-/Benachrichtigung bestaetigt den Speichererfolg |
| Keine Fragebogen-Duplizierung | Mittel | Projektdetail | Kann keinen vorhandenen Fragebogen als Ausgangspunkt duplizieren |
| Keine Antwortquoten-/Limiteinstellung | Niedrig | Verteilung | Kann keine maximale Anzahl von Antworten festlegen |
| Einzelnutzerin sieht "Team einladen"-Schritt | Niedrig | Onboarding | Onboarding-Schritte erwaehnen Team-Einladung, unnoetig fuer Solo-Nutzerinnen |

---

## 2.7 Konsolidierte UX-Lueckenanalyse

### Kritische Luecken (blockierend oder stark beeintraechtigend)

1. **Fehlende Admin-Seiten**: `/admin/users`, `/admin/questionnaires`, `/admin/analytics`, `/admin/settings` sind alle verlinkt, existieren aber nicht. Dies betrifft Organisationsadmins (Thomas) am staerksten.

2. **Fehlende `/forgot-password`-Route**: Verlinkt von der Login-Seite (`/(auth)/login/+page.svelte` Zeile 186), gibt aber 404 zurueck. Nutzer, die ihr Passwort vergessen, haben keinen Wiederherstellungspfad.

3. **Fehlende `/settings`-Route**: Verlinkt vom AppShell-Nutzer-Dropdown (`AppShell.svelte` Zeilen 171-174), existiert aber nicht. Nutzer koennen ihr Profil nicht verwalten.

4. **Login-Seite "Create account"-Verhalten**: Der "Create new account"-Button auf der Login-Seite ruft `handleSignUp` auf, das versucht, ein Konto nur mit E-Mail und Passwort zu erstellen (ohne Name, ohne AGB-Zustimmung, ohne Verifizierungsflow). Er sollte stattdessen zu `/signup` navigieren.

### Mittlere Luecken (beeintraechtigt, aber nutzbar)

5. **Keine rollenbasierte Navigationsfilterung**: Alle Nutzer sehen die gleichen Navigationselemente (Dashboard, Projects, Admin, Test) unabhaengig von ihrer Rolle. Editoren und Viewer sollten "Admin" nicht sehen. Teilnehmende sollten die App-Navigation gar nicht sehen.

6. **"View All Activity"-Button ohne Funktion**: Die Dashboard-Aktivitaetsseitenleiste hat einen "View All Activity"-Link-Button ohne href oder onclick-Handler.

7. **Einladungs-Weiterleitung nach Registrierung**: Wenn ein Nutzer sich nach Klick auf einen Einladungslink registriert, wird er zum `/dashboard` statt zurueck zu `/invite/{token}` weitergeleitet, um die Annahme abzuschliessen.

8. **Keine Mitgliederliste in der Organisation**: Es gibt keine Seite, um aktuelle Organisationsmitglieder, deren Rollen oder deren Entfernung zu verwalten. Nur Einladungen sind verwaltbar.

9. **`/fillout`-Nav-Element ist irrefuehrend**: Der "Test"-Link in der Navigation fuehrt zu `/(app)/fillout/+page.svelte`, einer Testseite, nicht zur Teilnehmer-Ausfuell-Erfahrung. Dies kann Nutzer verwirren.

10. **Keine Fragebogenvorlagen**: Neue Nutzer koennen nicht von vorgefertigten Vorlagen fuer gaengige Instrumente starten (Likert-Skalen, PHQ-9, WHO-5 usw.).

### Geringe Luecken (Feinschliff)

11. **Fest kodierte Admin-Statistiken**: Admin-Dashboard-Statistiken sind fest kodiert statt von der API geladen.

12. **Kein Fortschrittsbalken beim Ausfuellen**: Teilnehmende haben keinen Fortschrittsbalken waehrend der Fragebogenbearbeitung.

13. **Kein Abschlussnachweis**: Teilnehmende erhalten keinen herunterladbaren Abschlussbeleg.

14. **Einwilligungsablehnung-UX**: Das Ablehnen der Einwilligung navigiert zu `/` (der Marketingseite), was fuer Teilnehmende desorientierend ist.

---

## 2.8 Routenuebersicht

Die folgende Tabelle ordnet alle Anwendungsrouten den Personas zu, die sie nutzen.

| Route | Zweck | Sarah | Max | Lisa | Thomas | Anna |
|---|---|---|---|---|---|---|
| `/` | Startseite/Marketing | Einstieg | -- | -- | Einstieg | Einstieg |
| `/signup` | Kontoerstellung | Ja | Ja | -- | Ja | Ja |
| `/login` | Authentifizierung | Ja | Ja | -- | Ja | Ja |
| `/onboarding/organization` | Erste Org-Einrichtung | Ja | -- | -- | Ja | Ja |
| `/invite/{token}` | Einladung annehmen | -- | Ja | -- | -- | -- |
| `/dashboard` | Uebersicht und Statistik | Ja | Ja | -- | Ja | Ja |
| `/projects` | Projektliste | Ja | Ja | -- | Ja | Ja |
| `/projects/{id}` | Projektdetail | Ja | Ja | -- | Ja | Ja |
| `/projects/{id}/designer/{qId}` | Fragebogen-Builder | Ja | Ja | -- | -- | Ja |
| `/projects/{id}/analytics` | Antwortanalytik | Ja | Ja | -- | Ja | Ja |
| `/admin` | Organisationsadmin | Ja | -- | -- | Ja | -- |
| `/admin/invitations` | Einladungen verwalten | Ja | -- | -- | Ja | -- |
| `/admin/domains` | Domain-Auto-Join | Ja | -- | -- | Ja | -- |
| `/{code}` | Teilnehmer-Ausfuellung | -- | -- | Ja | -- | -- |

### Routen, die nicht existieren (404)

| Route | Verlinkt von | Erwarteter Inhalt |
|---|---|---|
| `/forgot-password` | Login-Seite | Passwort-Zuruecksetzungsflow |
| `/settings` | AppShell-Nutzermenue | Nutzerprofil und -einstellungen |
| `/admin/users` | Admin-Schnellaktionen | Organisationsmitglieder-Verwaltung |
| `/admin/questionnaires` | Admin-Schnellaktionen | Organisationsweite Fragebogenliste |
| `/admin/analytics` | Admin-Schnellaktionen | Organisationsweite Analytik |
| `/admin/settings` | Admin-Schnellaktionen | System-/Organisationseinstellungen |
| `/terms` | Login, Signup | Nutzungsbedingungen |
| `/privacy` | Login, Signup | Datenschutzerklaerung |
