# Kapitel 1: Erste Schritte

Dieses Kapitel fuehrt Sie durch die Erstellung Ihres QDesigner-Modern-Kontos, die Verifizierung Ihrer E-Mail-Adresse und die erste Navigation auf der Plattform. Am Ende werden Sie Ihren ersten Fragebogen erstellt haben.

## Systemanforderungen

QDesigner Modern laeuft vollstaendig im Browser. Es gibt keine Desktopanwendung und keine Plugins zu installieren. Sie benoetigen:

- **Einen modernen Webbrowser**: Chrome 90+, Firefox 90+, Safari 15+ oder Edge 90+. Die Plattform verwendet WebGL 2.0, das von allen aktuellen Browserversionen unterstuetzt wird.
- **Eine stabile Internetverbindung**: Die Fragebogenerstellung und -verwaltung erfordert Serverkommunikation. Teilnehmerseitige Frageboegen unterstuetzen durch Service Worker eine eingeschraenkte Offline-Funktionalitaet, der initiale Ladevorgang erfordert jedoch Konnektivitaet.
- **Eine Bildschirmaufloesung von mindestens 1280x720**: Der Fragebogen-Designer ist fuer Desktop-Bildschirme optimiert. Die Fragebogenteilnahme (teilnehmerseitig) funktioniert auch auf mobilen Geraeten.

Fuer Reaktionszeitexperimente mit dem WebGL-Renderer wird ein Display mit einer Bildwiederholrate von 120 Hz oder hoeher empfohlen, um die Hochfrequenz-Rendering-Pipeline voll auszunutzen. Standard-60-Hz-Displays funktionieren, begrenzen aber die erreichbare zeitliche Praezision.

> **Hinweis:** Fuer die Standard-Fragebogenerstellung und -verteilung ist keine spezielle Hardware erforderlich. WebGL und hochfrequente Displays sind nur relevant, wenn Sie zeitgesteuerte Stimuluspraesentationsparadigmen einsetzen moechten.

## Konto erstellen

### Schritt 1: Zur Registrierungsseite navigieren

Oeffnen Sie Ihren Browser und navigieren Sie zur QDesigner-Modern-Instanz, die Ihnen von Ihrer Institution oder Ihrem Hosting-Anbieter bereitgestellt wird. Sie sehen die Anmeldeseite mit dem QDesigner-Logo, einem E-Mail-Feld, einem Passwortfeld und einer Schaltflaeche "Sign in".

Unterhalb des Anmeldeformulars finden Sie einen Trenner mit der Beschriftung "Or", gefolgt von einer Schaltflaeche "Create new account". Klicken Sie auf diese Schaltflaeche, um den Registrierungsprozess zu starten.

Alternativ koennen Sie direkt zur Route `/signup` navigieren.

### Schritt 2: Angaben ausfuellen

Das Registrierungsformular zeigt drei Pflichtfelder:

1. **Full Name** -- Geben Sie Ihren Namen ein, wie er fuer Mitarbeitende angezeigt werden soll. Dieser erscheint in Organisationsmitgliederlisten und Aktivitaetsfeeds. Beispiel: "Dr. Maria Schmidt".

2. **Email Address** -- Geben Sie eine gueltige E-Mail-Adresse ein. Diese wird fuer die Anmeldung, E-Mail-Verifizierung und Teameinladungen verwendet. Wenn Ihre Institution einen domaenbasierten automatischen Beitritt konfiguriert hat, erscheint ein Informationsbanner, das anzeigt, welcher Organisation Sie automatisch beitreten werden.

3. **Password** -- Erstellen Sie ein Passwort mit mindestens 8 Zeichen. Waehrend der Eingabe erscheint unterhalb des Feldes ein Staerkeindikator mit fuenf farbigen Segmenten:
   - 1 Segment (rot): Schwach
   - 2 Segmente (rot): Maessig
   - 3 Segmente (gelb): Gut
   - 4 Segmente (gruen): Stark
   - 5 Segmente (gruen): Sehr stark

   Die Staerkebewertung beruecksichtigt Passwortlaenge, Verwendung von Klein- und Grossbuchstaben, Ziffern und Sonderzeichen.

Unterhalb des Passwortfeldes muessen Sie das Kontrollkaestchen zur Zustimmung zu den Nutzungsbedingungen und der Datenschutzerklaerung aktivieren, bevor Sie das Formular absenden koennen.

> **Tipp:** Wenn Kolleginnen oder Kollegen Ihre E-Mail-Adresse bereits zu ihrer Organisation hinzugefuegt haben, erscheint ein Banner mit der Anzahl ausstehender Einladungen. Diese koennen nach Abschluss der Registrierung angenommen werden.

### Schritt 3: Registrierung absenden

Klicken Sie auf "Create Account". Das System wird:

1. Ihre Eingaben validieren (E-Mail-Format, Passwortlaenge, Zustimmung zu den Bedingungen).
2. Ihr Konto ueber die Backend-API erstellen.
3. Einen 6-stelligen Verifizierungscode an Ihre E-Mail-Adresse senden.
4. Das Formular zur Verifizierungsansicht wechseln.

Wenn die E-Mail-Adresse bereits registriert ist, erscheint eine Fehlermeldung. Kehren Sie in diesem Fall zur Anmeldeseite zurueck und nutzen Sie bei Bedarf den Link "Forgot password?".

## E-Mail-Verifizierung

Nach dem Absenden des Registrierungsformulars aendert sich die Seite und zeigt einen Eingabebildschirm fuer den Verifizierungscode. Die Ueberschrift lautet "Verify Your Email", und ein Untertitel bestaetigt die E-Mail-Adresse, an die der Code gesendet wurde.

### Schritt 4: Verifizierungscode eingeben

1. Pruefen Sie Ihren E-Mail-Posteingang auf eine Nachricht von QDesigner Modern mit einem 6-stelligen numerischen Code.
2. Geben Sie den Code in das grosse Eingabefeld auf dem Verifizierungsbildschirm ein. Das Feld akzeptiert genau 6 Ziffern und zeigt auf mobilen Geraeten eine numerische Tastatur an.
3. Klicken Sie auf "Verify Email", um den Code zu uebermitteln.

Wenn der Code korrekt ist, werden Sie automatisch angemeldet und zum Dashboard oder zum Organisations-Onboarding weitergeleitet.

### Code erneut senden

Wenn Sie die E-Mail innerhalb weniger Minuten nicht erhalten:

- Pruefen Sie Ihren Spam- oder Junk-Ordner.
- Klicken Sie auf den Link "Resend verification code" unterhalb des Verifizierungsformulars. Nach dem erneuten Senden erscheint ein 60-Sekunden-Countdown, um uebermassige Anfragen zu vermeiden.

> **Hinweis:** Verifizierungscodes laufen nach einer festgelegten Zeitspanne ab. Wenn Ihr Code abgelaufen ist, verwenden Sie die Funktion zum erneuten Senden, um einen neuen zu erhalten.

### Zurueck zur Registrierung

Wenn Sie Ihre E-Mail-Adresse aendern muessen, klicken Sie auf den Link "Back to sign up" am unteren Rand des Verifizierungsformulars. Dies fuehrt Sie zum Registrierungsformular mit Ihren zuvor eingegebenen Daten zurueck.

## Passwortzuruecksetzung

Wenn Sie Ihr Passwort vergessen haben, bietet QDesigner Modern einen sicheren Zuruecksetzungsprozess.

### Schritt 1: Zuruecksetzung anfordern

Klicken Sie auf der Anmeldeseite auf den Link "Forgot password?" unterhalb des Passwortfeldes. Dies oeffnet das Formular zur Anforderung der Passwortzuruecksetzung.

### Schritt 2: E-Mail-Adresse eingeben

Geben Sie die mit Ihrem Konto verknuepfte E-Mail-Adresse ein und klicken Sie auf "Send Reset Link." Wenn die E-Mail-Adresse registriert ist, sendet das System einen Link zur Passwortzuruecksetzung an diese Adresse. Aus Sicherheitsgruenden wird unabhaengig davon, ob die E-Mail-Adresse im System existiert, dieselbe Bestaetigungsmeldung angezeigt.

### Schritt 3: E-Mail pruefen

Oeffnen Sie die E-Mail zur Passwortzuruecksetzung und klicken Sie auf den Zuruecksetzungslink. Dieser Link enthaelt ein sicheres, zeitlich begrenztes Token und leitet Sie zum Formular fuer die Passwortzuruecksetzung weiter.

### Schritt 4: Neues Passwort festlegen

Geben Sie im Zuruecksetzungsformular Ihr neues Passwort ein (mindestens 8 Zeichen). Der Passwortstaerkeindikator gibt waehrend der Eingabe Echtzeit-Feedback. Klicken Sie auf "Reset Password", um den Vorgang abzuschliessen.

### Sicherheitsmassnahmen

Bei einer Passwortzuruecksetzung werden alle bestehenden Sitzungen des Kontos sofort widerrufen. Dies stellt sicher, dass bei einer Zuruecksetzung aufgrund eines vermuteten Sicherheitsvorfalls alle unautorisierten Sitzungen beendet werden. Nach Abschluss der Zuruecksetzung werden Sie zur Anmeldeseite weitergeleitet, um sich mit Ihrem neuen Passwort anzumelden.

> **Hinweis:** Links zur Passwortzuruecksetzung laufen nach einer festgelegten Zeitspanne ab. Wenn Ihr Link abgelaufen ist, kehren Sie zur Anmeldeseite zurueck und fordern Sie einen neuen an.

## Erste Anmeldung

### Die Anmeldeseite

Die Anmeldeseite zeigt zwei Felder:

1. **Email address** -- Geben Sie die E-Mail-Adresse ein, mit der Sie sich registriert haben.
2. **Password** -- Geben Sie Ihr Passwort ein.

Klicken Sie auf "Sign in", um sich zu authentifizieren. Das System validiert Ihre Anmeldedaten gegenueber dem Rust-Backend, das Argon2id-Passwort-Hashing fuer sichere Authentifizierung verwendet.

Bei erfolgreicher Authentifizierung gibt das Backend ein JWT (JSON Web Token) zurueck, das vom Frontend fuer nachfolgende API-Anfragen gespeichert wird. Das Token umfasst ein Access-Token (kurzlebig) und ein Refresh-Token (laengerlebig), um Ihre Sitzung ohne wiederholte Anmeldungen aufrechtzuerhalten.

### Weiterleitung nach der Anmeldung

Nach der Anmeldung prueft das System, ob Sie einer Organisation angehoeren:

- **Wenn Sie keiner Organisation angehoeren**: Sie werden zur Organisations-Onboarding-Seite unter `/onboarding/organization` weitergeleitet. Dies ist bei Erstanmeldungen erwartetes Verhalten. Siehe den folgenden Abschnitt.
- **Wenn Sie einer oder mehreren Organisationen angehoeren**: Sie werden zum Dashboard unter `/dashboard` weitergeleitet.

## Organisations-Onboarding

Erstmalige Nutzerinnen und Nutzer ohne Organisationsmitgliedschaft sehen die Onboarding-Seite. Die Ueberschrift lautet "Welcome to QDesigner!" mit dem Untertitel "Let's set up your organization to get started."

### Erste Organisation erstellen

1. Geben Sie Ihren Organisationsnamen in das Textfeld ein. Dies ist typischerweise der Name Ihrer Universitaet, Ihres Forschungslabors oder Ihrer Abteilung. Beispiel: "Labor fuer Kognitive Psychologie, Universitaet Muenchen".

2. Klicken Sie auf "Create Organization." Das System generiert aus dem Namen einen URL-freundlichen Slug (z.B. "labor-fuer-kognitive-psychologie-universitaet-muenchen") und fuegt Sie als Organisationseigentuemerin bzw. -eigentuemer hinzu.

3. Sie werden zum Dashboard weitergeleitet.

Unterhalb des Formulars zeigt ein Informationsbereich mit dem Titel "What happens next?" drei Schritte:

1. **Erstes Projekt erstellen** -- Projekte helfen Ihnen, Ihre Frageboegen und Forschungsvorhaben zu organisieren.
2. **Teammitglieder einladen** -- Arbeiten Sie mit Ihrem Team zusammen, indem Sie Mitglieder in Ihre Organisation einladen.
3. **Ersten Fragebogen erstellen** -- Nutzen Sie den visuellen Designer, um Forschungsinstrumente zu erstellen.

### Stattdessen eine Einladung annehmen

Wenn Kolleginnen oder Kollegen Sie bereits vor Ihrer Registrierung eingeladen haben, zeigt die Onboarding-Seite moeglicherweise ausstehende Einladungen anstelle des (oder zusaetzlich zum) Organisationserstellungsformulars. Jede Einladungskarte zeigt:

- Den Organisationsnamen
- Wer Sie eingeladen hat
- Die Ihnen zugewiesene Rolle (z.B. Bearbeiter, Betrachter)
- Eine Schaltflaeche "Accept & Join"

Das Annehmen einer Einladung fuegt Sie dieser Organisation hinzu und leitet Sie zum Dashboard weiter. Sie koennen auch "Create New Organization Instead" waehlen, um einen eigenen Arbeitsbereich einzurichten.

## Das Dashboard

Nach Abschluss des Onboardings gelangen Sie zum Dashboard. Dies ist Ihr Startbildschirm innerhalb von QDesigner Modern.

### Begruessung

Oben erscheint eine personalisierte Begruessung mit Ihrem Namen (oder dem Benutzernamenteil Ihrer E-Mail-Adresse, falls kein vollstaendiger Name hinterlegt ist) neben einer wechselnden Motivationsnachricht wie "Ready to design something amazing?" oder "Let's gather some insights today."

### Statistikkarten

Unterhalb der Begruessung werden vier Statistikkarten in einer horizontalen Reihe angezeigt:

| Karte | Beschreibung | Symbolfarbe |
|-------|-------------|-------------|
| **Total Questionnaires** | Anzahl der Frageboegen ueber alle Projekte | Indigo |
| **Total Responses** | Summe aller erhaltenen Antworten | Lila |
| **Active** | Anzahl der derzeit veroeffentlichten Frageboegen | Smaragd |
| **Avg. Completion** | Durchschnittliche Abschlussrate ueber alle Frageboegen | Bernstein |

> **Hinweis:** Diese Statistiken fuellen sich, wenn Sie Frageboegen erstellen und Antworten sammeln. Bei einem neuen Konto sind alle Werte null.

### Ihre Frageboegen

Der Hauptinhaltsbereich listet Ihre Frageboegen aus allen Projekten auf. Jede Fragebogenkarte zeigt:

- Fragebogenname und Beschreibung
- Ein Statusabzeichen (Entwurf, Veroeffentlicht oder Archiviert)
- Drei Metriken: Antworten, Abgeschlossen und durchschnittliche Bearbeitungszeit
- Den Zeitstempel der letzten Aktualisierung
- Woechentlichen Antworttrend (sofern Antworten eingegangen sind)

Ein Klick auf eine Fragebogenkarte fuehrt zum Fragebogen-Designer.

Wenn Sie noch keine Frageboegen haben, erscheint eine Leeranzeige: "No questionnaires yet. Get started by creating a new questionnaire to gather insights." Die Schaltflaeche "New Questionnaire" in der Kopfzeile fuehrt zur Projektseite, wo Sie zunaechst ein Projekt auswaehlen oder erstellen koennen.

### Letzte Aktivitaet

Die rechte Seitenleiste zeigt aktuelle Teilnehmeraktivitaeten: wer geantwortet hat, welcher Fragebogen, wann und die Antwortzeit. Dies bietet einen Echtzeitueberblick ueber den Fortschritt der Datenerhebung.

## Schnellstart: Ihr erster Fragebogen in 5 Minuten

Folgen Sie diesen Schritten, um Ihren ersten Fragebogen zu erstellen und in der Vorschau anzuzeigen:

### 1. Projekt erstellen (1 Minute)

Klicken Sie auf dem Dashboard auf "New Questionnaire" in der Kopfzeile. Dies fuehrt Sie zur Projektseite.

1. Klicken Sie auf die Schaltflaeche "New Project" oben rechts.
2. Geben Sie im Modaldialog ein:
   - **Project Name**: z.B. "Pilotstudie 2026"
   - **Project Code**: z.B. "PS2026" (automatisch in Grossbuchstaben, dient als Kurzbezeichner)
   - **Description** (optional): z.B. "Initiale Pilotstudie fuer die Aufmerksamkeitsstudie"
3. Klicken Sie auf "Create Project."

Sie werden zur Projektdetailseite weitergeleitet.

### 2. Fragebogen erstellen (1 Minute)

Auf der Projektdetailseite:

1. Klicken Sie auf "New Questionnaire."
2. Geben Sie im Modal ein:
   - **Questionnaire Name**: z.B. "Aufmerksamkeits- und Gedaechtnis-Screening"
   - **Description** (optional): z.B. "Kurzes Screening-Instrument zur Teilnehmereignung"
3. Klicken Sie auf "Create & Edit."

Der Fragebogen-Designer oeffnet sich.

### 3. Fragen hinzufuegen (2 Minuten)

Im Designer sehen Sie:
- Eine linke Seitenleiste mit der **Fragenpalette** mit verfuegbaren Fragetypen
- Eine zentrale Leinwand mit der Fragebogenstruktur
- Eine rechte Seitenleiste mit **Eigenschaften** fuer das ausgewaehlte Element

Um Ihre erste Frage hinzuzufuegen:

1. Ziehen Sie eine "Single Choice"-Frage aus der Palette auf die Leinwand.
2. Klicken Sie auf die Frage, um sie auszuwaehlen.
3. Bearbeiten Sie im Eigenschaftenbereich auf der rechten Seite den Fragetext: "Wie wuerden Sie Ihre aktuelle Aufmerksamkeit einschaetzen?"
4. Fuegen Sie Antwortoptionen hinzu: "Sehr schlecht", "Schlecht", "Durchschnittlich", "Gut", "Ausgezeichnet."

Wiederholen Sie den Vorgang, um weitere Fragen hinzuzufuegen. Probieren Sie eine "Text Input"-Frage fuer offene Antworten oder eine "Likert Scale" fuer Zustimmungsbewertungen.

### 4. Vorschau und Speichern (1 Minute)

Der Fragebogen wird waehrend der Arbeit automatisch gespeichert. Um die Teilnehmeransicht zu pruefen:

1. Nutzen Sie die WYSIWYG-Canvas-Ansicht, um ein Echtzeit-Rendering Ihres Fragebogens zu sehen.
2. Pruefen Sie, ob Fragen korrekt dargestellt werden, Optionen in der richtigen Reihenfolge stehen und eventuelle bedingte Logik wie erwartet funktioniert.

Ihr erster Fragebogen ist fertig. Die folgenden Kapitel behandeln Fragetypen, Variablen und erweiterte Funktionen im Detail.

> **Tipp:** Sie muessen nicht alles konfigurieren, bevor Sie testen. Beginnen Sie einfach, nutzen Sie die Vorschau haeufig und fuegen Sie Komplexitaet schrittweise hinzu. Das Versionierungssystem stellt sicher, dass Sie jederzeit zu einem frueheren Stand zurueckkehren koennen.
