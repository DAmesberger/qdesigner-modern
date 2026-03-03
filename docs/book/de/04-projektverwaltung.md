# Kapitel 4: Projektverwaltung

Projekte sind die Organisationseinheit innerhalb von QDesigner Modern, die zusammengehoerige Frageboegen gruppiert. Jeder Fragebogen gehoert zu einem Projekt, und jedes Projekt gehoert zu einer Organisation. Dieses Kapitel behandelt Projekterstellung, Konfiguration, Mitgliederverwaltung und den Fragebogenlebenszyklus.

## Projekte innerhalb von Organisationen

Die Hierarchie in QDesigner Modern ist:

```
Organisation
  └── Projekt
        └── Fragebogen
              └── Antworten
```

Projekte dienen mehreren Zwecken:

- **Logische Gruppierung**: Eine Forschungsstudie umfasst typischerweise mehrere Frageboegen (Screening, Praemessung, Intervention, Postmessung, Follow-up). Ein Projekt buendelt diese zusammengehoerigen Instrumente.
- **Zugriffssteuerung**: Projektspezifische Rollen ermoeglichen es, verschiedenen Teammitgliedern Zugang zu verschiedenen Studien innerhalb derselben Organisation zu gewaehren.
- **Metadaten-Container**: Jedes Projekt traegt eigene Metadaten wie Code, Beschreibung, Ethikvotum-Nummer, Zeitraum und Teilnehmerlimits -- Informationen, die fuer die gesamte Studie gelten und nicht fuer einzelne Frageboegen.

Eine einzelne Organisation kann viele Projekte enthalten. Jedes Projekt kann viele Frageboegen enthalten.

## Projekt erstellen

### Von der Projektseite

1. Navigieren Sie zur Projektseite vom Dashboard aus (klicken Sie auf "New Questionnaire" auf dem Dashboard oder nutzen Sie die Hauptnavigation).
2. Die Projektseite zeigt alle Projekte an, auf die Sie Zugriff haben, dargestellt als Karten in einem responsiven Raster.
3. Klicken Sie auf die Schaltflaeche "New Project" oben rechts.

### Der Projekterstellungsdialog

Ein Modaldialog oeffnet sich mit drei Feldern:

1. **Project Name** (Pflichtfeld): Der Anzeigename des Projekts. Beispiel: "Laengsschnittstudie Aufmerksamkeit 2026". Dieser erscheint in Projektlisten und in der Breadcrumb-Navigation.

2. **Project Code** (Pflichtfeld): Ein kurzer alphanumerischer Bezeichner fuer das Projekt. Beispiel: "LSA2026". Der Code wird waehrend der Eingabe automatisch in Grossbuchstaben umgewandelt. Er wird als kompakte Referenz in Exporten, URLs und Datendateien verwendet.

3. **Description** (optional): Eine Freitextbeschreibung des Projekts. Beispiel: "Drei-Wellen-Laengsschnittstudie zur Untersuchung anhaltender Aufmerksamkeitsmuster bei Studierenden."

Klicken Sie auf "Create Project", um abzusenden. Das System erstellt das Projekt innerhalb Ihrer aktiven Organisation und leitet Sie zur Projektdetailseite weiter.

> **Hinweis:** Der Projektcode muss innerhalb der Organisation eindeutig sein. Er dient als menschenlesbarer Bezeichner, der einfacher zu referenzieren ist als eine UUID.

### Projekteigenschaften

Bei der Erstellung eines Projekts ueber die API koennen zusaetzliche Eigenschaften gesetzt werden:

| Eigenschaft | Typ | Beschreibung |
|-------------|-----|--------------|
| **name** | String (1-255 Zeichen) | Anzeigename |
| **code** | String (1-50 Zeichen) | Kurzbezeichner, innerhalb der Organisation eindeutig |
| **description** | String (optional) | Detaillierte Beschreibung |
| **is_public** | Boolean | Ob das Projekt oeffentlich zugaenglich ist (Standard: false) |
| **status** | String | Projektstatus: "active", "completed", "archived", "deleted" |
| **max_participants** | Integer (optional) | Maximale Teilnehmerzahl fuer die Studie |
| **irb_number** | String (optional) | Nummer des Ethikvotums |
| **start_date** | Datum (optional) | Studienbeginn |
| **end_date** | Datum (optional) | Studienende |
| **settings** | JSON (optional) | Flexibles Einstellungsobjekt |

Diese Eigenschaften koennen spaeter von Personen mit Bearbeiter- oder hoeheren Berechtigungen im Projekt oder von Organisationsadministratoren aktualisiert werden.

## Die Projektdetailseite

Nach dem Erstellen oder Auswaehlen eines Projekts sehen Sie die Projektdetailseite. Diese besteht aus:

### Breadcrumb-Navigation

Oben zeigt eine Breadcrumb-Leiste: **Projects > [Projektname]**. Ein Klick auf "Projects" fuehrt zurueck zur Projektliste.

### Projektkopfzeile

Die Kopfzeile zeigt:
- Den Projektnamen als grosse Ueberschrift
- Den Projektcode unterhalb des Namens
- Die Projektbeschreibung (sofern vorhanden)
- Zwei Aktionsschaltflaechen:
  - **Analytics**: Fuehrt zur Projektanalytikseite
  - **New Questionnaire**: Oeffnet den Fragebogenerstellungsdialog

### Fragebogenliste

Der Hauptinhaltsbereich listet alle Frageboegen innerhalb des Projekts auf. Jeder Fragebogeneintrag zeigt:

- Ein Dokumentensymbol und den Fragebogennamen
- Die Fragebogenbeschreibung (sofern vorhanden)
- Ein Statusabzeichen, das den aktuellen Zustand anzeigt:
  - **Draft** (gelb): Der Fragebogen wird gestaltet und ist fuer Teilnehmende noch nicht verfuegbar
  - **Published** (gruen): Der Fragebogen ist aktiv und nimmt Antworten entgegen
  - **Archived** (grau): Der Fragebogen wurde zurueckgezogen und nimmt keine Antworten mehr entgegen
- Antwortanzahl: Die Anzahl eingegangener Antworten
- Datum der letzten Aktualisierung
- Aktionsschaltflaechen:
  - **Play** (nur fuer veroeffentlichte Frageboegen): Oeffnet den Fragebogen zum Testen/Vorschau
  - **Edit**: Oeffnet den Fragebogen im Designer
  - **Weitere Optionen**: Zusaetzliche Aktionen (Archivieren, Loeschen, Duplizieren)

Wenn das Projekt noch keine Frageboegen hat, wird eine Leeranzeige dargestellt: "No questionnaires. Get started by creating a new questionnaire." mit einer prominenten Erstellungsschaltflaeche.

## Fragebogen innerhalb eines Projekts erstellen

1. Klicken Sie auf der Projektdetailseite auf "New Questionnaire."
2. Geben Sie im Modaldialog ein:
   - **Questionnaire Name** (Pflichtfeld): Der Anzeigename. Beispiel: "Praemessung Angstbewertung"
   - **Description** (optional): Eine kurze Beschreibung. Beispiel: "Baseline-Angstmessung mit adaptierten GAD-7-Items"
3. Klicken Sie auf "Create & Edit."

Das System erstellt einen neuen Fragebogen mit dem Status "Draft" und oeffnet den Fragebogen-Designer. Der Fragebogen wird mit einer leeren Inhaltsstruktur erstellt, bereit fuer das Hinzufuegen von Seiten, Bloecken und Fragen.

Der Fragebogen wird in der Tabelle `questionnaire_definitions` gespeichert mit:
- Einer Referenz auf das uebergeordnete Projekt
- Der Benutzer-ID der erstellenden Person
- Einer initialen Versionsnummer von 1
- Standardeinstellungen
- Leerem JSONB-Inhalt

## Projektmitglieder und Rollen

Projekte haben eine eigene Mitgliederliste und ein eigenes Rollensystem, das von den Organisationsrollen getrennt (aber mit ihnen verbunden) ist.

### Projektspezifische Rollen

QDesigner Modern definiert vier Projektebene-Rollen:

| Rolle | Beschreibung |
|-------|-------------|
| **Eigentuemer (Owner)** | Volle Kontrolle ueber das Projekt. Kann das Projekt loeschen und alle Mitglieder verwalten. |
| **Administrator (Admin)** | Kann Projekteinstellungen und Mitglieder verwalten. Kann Frageboegen erstellen, bearbeiten und veroeffentlichen. |
| **Bearbeiter (Editor)** | Kann Frageboegen erstellen und bearbeiten. Kann keine Projekteinstellungen oder Mitglieder verwalten. |
| **Betrachter (Viewer)** | Nur-Lese-Zugriff. Kann Frageboegen und Antworten einsehen, aber nichts aendern. |

Die Person, die ein Projekt erstellt, erhaelt automatisch die **Eigentuemer**-Rolle.

### Zusammenspiel von Organisations- und Projektrollen

Organisationsrollen dienen als Fallback fuer Projektberechtigungen:

- **Organisations-Eigentuemer und -Administratoren** haben impliziten Zugriff auf alle Projekte innerhalb der Organisation, unabhaengig von der Projektmitgliedschaft. Ein Organisationsadministrator kann jedes Projekt verwalten, ohne explizit als Projektmitglied hinzugefuegt zu werden.
- **Organisations-Mitglieder** koennen Projekte erstellen, aber nur auf Projekte zugreifen, denen sie explizit als Projektmitglied hinzugefuegt wurden.
- **Organisations-Betrachter** koennen nur auf Projekte zugreifen, denen sie explizit zugewiesen wurden.

Das bedeutet:
1. Ein Organisationsadministrator muss nicht jedem Projekt einzeln hinzugefuegt werden.
2. Ein Organisationsmitglied, das ein Projekt erstellt, wird dessen Eigentuemer, benoetigt aber eine explizite Zuweisung, um auf Projekte anderer Mitglieder zugreifen zu koennen.

### Projektmitglieder hinzufuegen

Personen mit der Rolle Projektadministrator oder -eigentuemer (oder Organisationsadministrator/-eigentuemer) koennen Mitglieder hinzufuegen:

1. Navigieren Sie zur Mitgliederverwaltung des Projekts.
2. Geben Sie die E-Mail-Adresse der hinzuzufuegenden Person ein (sie muss bereits Mitglied der Organisation sein).
3. Waehlen Sie eine Rolle: Eigentuemer, Administrator, Bearbeiter oder Betrachter.
4. Senden Sie das Formular ab.

Die Person wird sofort mit der angegebenen Rolle zum Projekt hinzugefuegt.

### Projektmitglieder-Rollen aendern

Projektadministratoren und -eigentuemer koennen die Rolle eines Mitglieds aktualisieren:

1. Navigieren Sie zur Mitgliederliste.
2. Waehlen Sie das Mitglied aus, dessen Rolle Sie aendern moechten.
3. Waehlen Sie die neue Rolle aus den verfuegbaren Optionen.
4. Bestaetigen Sie die Aenderung.

### Projektmitglieder entfernen

Projektadministratoren und -eigentuemer koennen Mitglieder entfernen:

1. Waehlen Sie das zu entfernende Mitglied aus der Mitgliederliste.
2. Bestaetigen Sie die Entfernung.

**Schutzfunktion**: Das System verhindert das Entfernen des letzten Eigentuemers eines Projekts. Gibt es nur einen Eigentuemer, kann dieser erst entfernt werden, wenn ein anderes Mitglied zum Eigentuemer befoerdert wurde.

> **Tipp:** Wenn ein Teammitglied eine Studie verlaesst, aber in der Organisation verbleibt, entfernen Sie es aus dem Projekt statt aus der Organisation. Dies bewahrt seinen Zugang zu anderen Projekten, an denen es moeglicherweise noch beteiligt ist.

## Projektspezifische Berechtigungsmatrix

| Aktion | Eigentuemer | Administrator | Bearbeiter | Betrachter |
|--------|-------------|---------------|------------|------------|
| Projektdetails anzeigen | Ja | Ja | Ja | Ja |
| Frageboegen anzeigen | Ja | Ja | Ja | Ja |
| Antworten anzeigen | Ja | Ja | Ja | Ja |
| Projekteinstellungen aendern | Ja | Ja | Ja* | Nein |
| Projekt loeschen | Ja | Nein** | Nein | Nein |
| Projektmitglieder hinzufuegen | Ja | Ja | Nein | Nein |
| Projektmitglieder entfernen | Ja | Ja | Nein | Nein |
| Mitgliederrollen aendern | Ja | Ja | Nein | Nein |
| Frageboegen erstellen | Ja | Ja | Ja | Nein |
| Frageboegen bearbeiten | Ja | Ja | Ja | Nein |
| Frageboegen veroeffentlichen | Ja | Ja | Ja | Nein |
| Frageboegen loeschen | Ja | Ja | Nein | Nein |

*Bearbeiter koennen Projekteinstellungen aktualisieren, wenn sie die Bearbeiterrolle auf Projektebene haben.

**Organisationsadministratoren koennen Projekte auch ohne die Projekteigentuemerrolle loeschen.

## Fragebogenlebenszyklus

Frageboegen in QDesigner Modern durchlaufen einen definierten Lebenszyklus mit drei primaeren Zustaenden:

### Entwurf (Draft)

- **Ausgangszustand**: Jeder neue Fragebogen beginnt als Entwurf.
- **Bearbeitbar**: Fragebogeninhalt, Einstellungen und Struktur koennen frei veraendert werden.
- **Nicht fuer Teilnehmende zugaenglich**: Entwurfsfrageboegen koennen nicht von Teilnehmenden ausgefuellt werden.
- **Versioniert**: Jedes Speichern erhoet die Versionsnummer.

### Veroeffentlicht (Published)

- **Uebergang vom Entwurf**: Eine Person mit Bearbeiter- oder hoeheren Berechtigungen kann einen Entwurfsfragebogen veroeffentlichen.
- **Fuer Teilnehmende zugaenglich**: Der Fragebogen wird ueber seine Verteilungs-URL zur Teilnahme verfuegbar.
- **Inhalt gesperrt**: Veroeffentlichte Frageboegen sollten strukturell nicht veraendert werden, um Datenkonsistenz ueber alle Teilnehmenden sicherzustellen. Kleinere Textkorrekturen koennen vorgenommen werden.
- **Zeitgestempelt**: Der `published_at`-Zeitstempel erfasst, wann der Fragebogen aktiviert wurde.

### Archiviert (Archived)

- **Uebergang von veroeffentlicht**: Wenn die Datenerhebung abgeschlossen ist, kann der Fragebogen archiviert werden.
- **Nimmt keine Antworten mehr entgegen**: Archivierte Frageboegen sind fuer neue Teilnehmende geschlossen.
- **Daten bleiben erhalten**: Alle gesammelten Antworten bleiben fuer die Analyse zugaenglich.
- **Umkehrbar**: Ein archivierter Fragebogen kann bei Bedarf in den Entwurfsstatus zurueckversetzt werden (erstellt eine neue Version).

Der Status wird als farbiges Abzeichen in der gesamten Oberflaeche angezeigt:
- Entwurf: gelbes Abzeichen
- Veroeffentlicht: gruenes Abzeichen
- Archiviert: graues Abzeichen

### Statusuebergaenge

```
Entwurf ──→ Veroeffentlicht ──→ Archiviert
  ↑                                 │
  └─────────────────────────────────┘
```

- Entwurf zu Veroeffentlicht: erfordert mindestens Bearbeiterberechtigungen
- Veroeffentlicht zu Archiviert: erfordert mindestens Bearbeiterberechtigungen
- Archiviert zu Entwurf: erfordert mindestens Bearbeiterberechtigungen (erstellt eine neue Version)

## Projektanalytik

Jedes Projekt hat eine Analytikseite, die ueber die Schaltflaeche "Analytics" auf der Projektdetailseite erreichbar ist. Die Analytikseite bietet einen Ueberblick ueber den Fortschritt der Datenerhebung ueber alle Frageboegen im Projekt.

Zentrale Metriken umfassen:
- Gesamtzahl der gesammelten Antworten ueber alle Frageboegen
- Abschlussraten pro Fragebogen
- Antworttrends ueber die Zeit
- Durchschnittliche Bearbeitungszeit
- Teilnehmerdemografie (sofern erhoben)

Die Analytikseite ist fuer alle Projektmitglieder zugaenglich (einschliesslich Betrachter), da sie aggregierte Daten zeigt, ohne individuelle Antworten offenzulegen.

> **Hinweis:** Die Analytikfunktion bietet zusammenfassende Statistiken. Fuer detaillierte Datenanalysen exportieren Sie Ihre Antwortdaten und verwenden Sie dedizierte Statistiksoftware.

## Best Practices fuer die Projektverwaltung

1. **Ein Projekt pro Studie**: Erstellen Sie fuer jede Forschungsstudie ein separates Projekt. Dies haelt Frageboegen, Mitglieder und Metadaten organisiert und verhindert eine Vermischung zwischen Studien.

2. **Verwenden Sie aussagekraeftige Projektcodes**: Der Code erscheint in Exporten und URLs. Waehlen Sie Codes, die Ihr Team auch Monate spaeter noch erkennt. "LSA2026" ist besser als "P001".

3. **Tragen Sie Ethikvotum-Nummern und Zeitraeume ein**: Diese Metadatenfelder schaffen eine klare Dokumentation der Studiengenehmigung und des Zeitplans, die fuer Compliance und Berichterstattung wertvoll ist.

4. **Weisen Sie die minimal notwendige Rolle zu**: Geben Sie Mitarbeitenden die niedrigste Rolle, die ihnen die Ausfuehrung ihrer Aufgaben erlaubt. Ko-Studienleitende, die Frageboegen aendern muessen, sollten Bearbeiter sein. Statistische Beraterinnen und Berater, die nur Daten einsehen muessen, sollten Betrachter sein.

5. **Archivieren statt loeschen**: Wenn eine Studie abgeschlossen ist, archivieren Sie deren Frageboegen, anstatt sie zu loeschen. Dies bewahrt die Daten und das Instrument fuer zukuenftige Referenz und signalisiert gleichzeitig, dass die Studie nicht mehr aktiv ist.

6. **Nutzen Sie das Beschreibungsfeld**: Eine kurze Beschreibung des Studienzwecks und der Methodik hilft Teammitgliedern (insbesondere spaeter Hinzukommenden), den Kontext zu verstehen, ohne die Frageboegen selbst lesen zu muessen.

7. **Aktualisieren Sie die Projektmitgliedschaft bei Teamveraenderungen**: Wenn Doktorandinnen und Doktoranden ihren Abschluss machen oder Postdoktorierende wechseln, aktualisieren Sie die Projektmitgliedschaft, um das aktuelle Team abzubilden. Dies gewaehrleistet Datensicherheit, ohne den Zugang anderer Studien auf Organisationsebene zu beeintraechtigen.
