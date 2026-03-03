# Anhang C: Glossar

Definitionen der wichtigsten Begriffe, die in diesem Buch und auf der QDesigner Modern Plattform verwendet werden.

---

### A

**Abgebrochene Sitzung** (*Abandoned Session*)
Eine Sitzung, die gestartet, aber nicht innerhalb des zulassigen Zeitfensters abgeschlossen wurde. Das System markiert Sitzungen nach einer konfigurierbaren Zeituberschreitung automatisch als abgebrochen.

**Abgelaufene Sitzung** (*Expired Session*)
Eine Sitzung, deren maximale Bearbeitungszeit uberschritten wurde und die vom System automatisch als ungultig markiert wurde.

**Aggregation** (*Aggregation*)
Der Prozess der Zusammenfassung mehrerer Antwortwerte zu Kennzahlen wie Mittelwerten, Medianen, Perzentilen und Standardabweichungen. Verfugbar uber den Sitzungs-Aggregations-API-Endpunkt.

**Antwort** (*Response*)
Die Eingabe eines Teilnehmers auf eine einzelne Frage innerhalb einer Sitzung. Antworten umfassen den Antwortwert, Zeitdaten und Metadaten wie die Anzahl der vorgenommenen Anderungen.

**API (Application Programming Interface)**
Eine Reihe von HTTP-Endpunkten, die die programmatische Interaktion mit dem QDesigner Modern Backend ermoglichen. Alle Endpunkte verwenden JSON fur Anfrage- und Antwortkorper und erfordern JWT-Bearer-Token-Authentifizierung fur geschutzte Routen.

**Argon2id**
Der von QDesigner Modern verwendete Passwort-Hashing-Algorithmus. Argon2id ist eine speicherintensive Funktion, die starken Schutz gegen Brute-Force-Angriffe bietet und Gewinner des Password Hashing Competition ist.

---

### B

**Bearer-Token** (*Bearer Token*)
Eine Authentifizierungsberechtigung, die im HTTP-Header `Authorization` gesendet wird. QDesigner Modern stellt bei der Anmeldung JWT-Bearer-Token aus, die in allen authentifizierten API-Anfragen enthalten sein mussen.

**Befehlspalette** (*Command Palette*)
Eine durchsuchbare Oberflache (geoffnet mit `Strg+K` / `Cmd+K`), die schnellen Zugriff auf alle Designer-Befehle bietet, einschliesslich Fragen hinzufugen, Ansichten wechseln und Aktionen ausfuhren.

**Block** (*Block*)
Eine logische Gruppierung von Fragen innerhalb einer Seite. Blocke ermoglichen die Randomisierung der Fragenreihenfolge innerhalb einer Seite und erlauben die Anwendung gemeinsamer Einstellungen auf mehrere Fragen.

---

### C

**Carry-Forward**
Eine Technik, bei der Antworten aus einer Frage verwendet werden, um Optionen in einer nachfolgenden Frage zu befullen. Beispielsweise konnten ausgewahlte Elemente aus einer Multiple-Choice-Frage zu den Optionen einer Folgefrage zur Rangordnung werden.

**CORS (Cross-Origin Resource Sharing)**
Ein Sicherheitsmechanismus, der steuert, welche Domains API-Anfragen an das Backend senden durfen. QDesigner Modern konfiguriert CORS, um Anfragen vom Frontend-Entwicklungsserver zuzulassen.

**CSV (Comma-Separated Values)**
Ein tabellarisches Exportformat fur Antwortdaten. Der CSV-Export von QDesigner Modern maskiert Werte, die Kommas, Anfuhrungszeichen und Zeilenumbruche enthalten, ordnungsgemas.

---

### D

**Dashboard**
Die Hauptansicht der Anwendung, die zusammenfassende Statistiken, aktuelle Aktivitaten und Schnellzugriff auf Projekte und Fragebogen anzeigt.

**Designer**
Die visuelle Fragebogen-Editor-Oberflache, die sowohl WYSIWYG- als auch Strukturansichten zum Erstellen von Fragebogen unterstutzt.

**Diff** (*Diff*)
Ein Vergleich zwischen zwei Versionen eines Fragebogens, der zeigt, was hinzugefugt, geandert oder entfernt wurde. Wird im Versionskontrollsystem verwendet, um Anderungen vor dem Zusammenfuhren zu uberprufen.

---

### E

**E-Mail-Verifizierung** (*Email Verification*)
Der Prozess der Bestatigung einer Benutzer-E-Mail-Adresse durch Senden eines 6-stelligen Verifizierungscodes. Nach der Registrierung erforderlich, bevor voller Kontozugriff gewahrt wird.

**Endpunkt** (*Endpoint*)
Ein spezifischer URL-Pfad auf dem API-Server, der eine bestimmte Art von Anfrage verarbeitet. Beispielsweise ist `POST /api/auth/login` der Anmelde-Endpunkt.

**Entwurf** (*Draft*)
Der ursprungliche Status eines neu erstellten Fragebogens. Entwurfe konnen frei bearbeitet werden, akzeptieren aber keine Teilnehmerantworten bis zur Veroffentlichung.

**Ereignis (Interaktion)** (*Interaction Event*)
Eine mit Zeitstempel versehene Aufzeichnung einer Teilnehmeraktion wahrend einer Sitzung, wie ein Klick, Tastendruck, Fokuswechsel oder Medieninteraktion. Ereignisse enthalten Zeitdaten mit Mikrosekunden-Prazision.

**Export** (*Export*)
Der Prozess des Herunterladens von Antwortdaten aus einem Fragebogen im CSV- oder JSON-Format zur Analyse in externen Werkzeugen.

---

### F

**Formel** (*Formula*)
Ein Ausdruck, der einen Wert mithilfe mathematischer Operationen, eingebauter Funktionen und Variablenreferenzen berechnet. Formeln betreiben das Variablensystem und die Ablaufsteuerungsbedingungen.

**Formelengine** (*Formula Engine*)
Das Auswertungssystem (`packages/scripting-engine`), das Formelausdrucke analysiert und ausfuhrt. Unterstutzt uber 30 eingebaute Funktionen in den Kategorien Mathematik, Statistik, Array, Logik, Text und Datum/Uhrzeit.

---

### G

**Gesundheitsprufung** (*Health Check*)
API-Endpunkte (`/health` und `/ready`), die den Betriebsstatus des Backend-Dienstes und seiner Abhangigkeiten (Datenbank, Redis) melden.

**Glossar-Variable** (*Glossary Variable*)
Ein Variablentyp, der numerische Codes auf menschenlesbare Bezeichnungen abbildet, nutzlich fur kodierte Antwortschemata.

---

### I

**Einladung** (*Invitation*)
Ein Mechanismus zum Hinzufugen von Mitgliedern zu einer Organisation. Einladungen werden per E-Mail versendet und verfallen nach 7 Tagen. Benutzer konnen Einladungen annehmen oder ablehnen.

---

### J

**JSONB**
Ein binares JSON-Speicherformat von PostgreSQL, das fur Fragebogeninhalte verwendet wird. JSONB ermoglicht effizientes Abfragen und Indizieren der hierarchischen Fragebogenstruktur.

**JWT (JSON Web Token)**
Ein kompaktes, URL-sicheres Token-Format fur die Authentifizierung. QDesigner Modern stellt kurzlebige Zugriffstoken (15 Minuten) und langerlebige Aktualisierungstoken fur die Sitzungskontinuitat aus.

---

### K

**Konflikt (Zusammenfuhrung)** (*Merge Conflict*)
Eine Situation beim Zusammenfuhren von Branches, in der dasselbe Element in beiden Branches unterschiedlich geandert wurde. Konflikte mussen manuell gelost werden, indem entschieden wird, welche Version beibehalten wird.

**Kurtosis** (*Kurtosis*)
Ein statistisches Mass fur die "Schwanzigkeit" einer Wahrscheinlichkeitsverteilung. Verfugbar als eingebaute Formelfunktion (`KURTOSIS`). Positive Werte zeigen schwere Schwanze an (leptokurtisch), negative Werte leichte Schwanze (platykurtisch).

**Kurzcode** (*Short Code*)
Ein 8-stelliger hexadezimaler Bezeichner in Grossbuchstaben, der aus der UUID eines Fragebogens abgeleitet wird. Wird in teilbaren Ausfullung-URLs fur Kurze und Lesbarkeit verwendet.

---

### L

**Lebendigkeitsprufung** (*Liveness Check*)
Der `/health`-Endpunkt, der bestatigt, dass der Backend-Prozess lauft und reagiert, ohne nachgelagerte Abhangigkeiten zu uberprufen.

---

### M

**Medien** (*Media*)
Dateien (Bilder, Audio, Video), die in den S3-kompatiblen Speicher (MinIO) hochgeladen werden, zur Verwendung in Fragebogen. Mediendateien werden uber vorsignierte URLs bereitgestellt, die nach einer Stunde ablaufen.

**Mehrmandantenfahig** (*Multi-Tenant*)
Eine Architektur, in der eine einzelne Anwendungsinstanz mehrere Organisationen bedient, mit strikter Datenisolierung zwischen Mandanten.

**Mikrosekunden-Prazision** (*Microsecond Precision*)
Die Zeitgenauigkeit, die fur Reaktionszeitmessungen verwendet wird. QDesigner Modern speichert Zeitdaten als BIGINT-Werte in Mikrosekunden (Millionstelsekunden) fur forschungstaugliche Genauigkeit.

**Migration** (*Migration*)
Ein SQL-Skript, das das Datenbankschema andert. Migrationen werden automatisch beim Start des Rust-Backends angewendet, um sicherzustellen, dass die Datenbankstruktur mit dem Anwendungscode ubereinstimmt.

**MinIO**
Ein S3-kompatibler Objektspeicherdienst zum Speichern hochgeladener Mediendateien in der Entwicklung. In der Produktion kann jeder S3-kompatible Dienst verwendet werden.

**Mitglied** (*Member*)
Ein Benutzer, der einer Organisation oder einem Projekt angehort. Mitgliedern werden Rollen zugewiesen, die ihre Berechtigungen bestimmen.

**Multiple-Choice**
Ein Fragetyp, der eine Reihe vordefinierter Optionen prasentiert, aus denen Teilnehmer eine oder mehrere Antworten auswahlen.

---

### O

**Operationale Transformation (OT)** (*Operational Transformation*)
Ein Algorithmus, der kollaboratives Echtzeit-Bearbeiten ermoglicht, indem gleichzeitige Operationen transformiert werden, um Konsistenz uber alle verbundenen Clients hinweg aufrechtzuerhalten. QDesigner Modern unterstutzt Einfuge-, Losch-, Aktualisierungs-, Verschiebe- und Umordnungsoperationen.

**Organisation** (*Organization*)
Die oberste Entitat in der Mehrmandanten-Hierarchie. Organisationen enthalten Projekte, die Fragebogen enthalten. Jede Organisation hat eigene Mitglieder und Rollen.

---

### P

**Perzentil** (*Percentile*)
Ein statistisches Mass, das den Wert angibt, unterhalb dessen ein bestimmter Prozentsatz der Beobachtungen liegt. Die Aggregations-API berechnet p10, p25, p50 (Median), p75, p90, p95 und p99.

**Piping** (*Piping*)
Die Technik des Einfugens von Variablenwerten oder fruheren Antworten in Fragetexte mithilfe der doppelten geschweiften Klammern-Syntax: `{{variablenName}}`.

**Projekt** (*Project*)
Ein Behalter innerhalb einer Organisation, der verwandte Fragebogen zusammenfasst. Projekte haben eigene Mitgliederlisten und Berechtigungseinstellungen.

---

### Q

**QR-Code** (*QR Code*)
Ein zweidimensionaler Barcode, der die Ausfullung-URL des Fragebogens kodiert. Wird automatisch fur veroffentlichte Fragebogen generiert, um einfachen mobilen Zugang zu ermoglichen.

**Fragebogen** (*Questionnaire*)
Die primare Inhaltseinheit in QDesigner Modern. Ein Fragebogen besteht aus Seiten, Blocken, Fragen, Variablen und Ablaufsteuerungsregeln, gespeichert als JSONB-Definition.

**Fragebogendefinition** (*Questionnaire Definition*)
Die vollstandige JSON-Struktur, die Inhalt, Einstellungen und Verhalten eines Fragebogens definiert. Gespeichert in der Tabelle `questionnaire_definitions`.

---

### R

**Ratenbegrenzung** (*Rate Limiting*)
Eine Sicherheitsmassnahme, die die Anzahl der API-Anfragen einschrankt, die ein Client innerhalb eines Zeitfensters stellen kann. Mithilfe von Redis implementiert, um Missbrauch zu verhindern.

**RBAC (Role-Based Access Control)**
Ein Berechtigungsmodell, bei dem Zugriffsrechte Rollen (Eigentumer, Administrator, Bearbeiter, Betrachter) zugewiesen werden und nicht einzelnen Benutzern. Benutzer erben Berechtigungen von ihrer zugewiesenen Rolle.

**Reaktionszeit** (*Reaction Time*)
Die gemessene Dauer zwischen Stimulusprasentation und Teilnehmerantwort, gespeichert mit Mikrosekunden-Prazision. Eine Schlusselfunktion von QDesigner Modern fur Verhaltensforschung.

**Refresh-Token** (*Refresh Token*)
Ein langlebiges Token, das zum Erhalten neuer Zugriffstoken ohne erneute Authentifizierung verwendet wird. Refresh-Token werden bei jeder Verwendung aus Sicherheitsgrunden rotiert.

**Rolle** (*Role*)
Ein benannter Satz von Berechtigungen, der Organisations- oder Projektmitgliedern zugewiesen wird. Organisationsrollen: Eigentumer, Administrator, Bearbeiter, Betrachter. Projektrollen: Eigentumer, Administrator, Bearbeiter.

**Ruckgangig/Wiederherstellen** (*Undo/Redo*)
Die Moglichkeit, Bearbeitungsaktionen im Designer ruckgangig zu machen oder erneut anzuwenden. Implementiert uber einen Operationsverlaufsstapel. Tastenkurzel: `Strg+Z` (Ruckgangig) und `Strg+Umschalt+Z` (Wiederherstellen).

**Runes** (*Runes*)
Das Reaktivitatssystem von Svelte 5 unter Verwendung von `$state`, `$derived` und `$effect` fur feingranulare Zustandsverwaltung. Wird im gesamten QDesigner Modern Frontend verwendet.

---

### S

**Schiefe** (*Skewness*)
Ein statistisches Mass fur die Asymmetrie einer Wahrscheinlichkeitsverteilung. Verfugbar als eingebaute Formelfunktion (`SKEWNESS`). Positive Werte zeigen eine rechtsschiefe Verteilung an, negative Werte eine linksschiefe.

**Seite** (*Page*)
Eine strukturelle Einheit in einem Fragebogen, die verwandte Fragen zusammenfasst. Seiten werden wahrend der Teilnehmerausfullung einzeln angezeigt, mit Navigation zwischen den Seiten.

**Sitzung** (*Session*)
Eine einzelne Instanz eines Teilnehmers, der einen Fragebogen ausfullt. Sitzungen verfolgen den Fortschritt, speichern Antworten und zeichnen Interaktionsereignisse auf. Jede Sitzung hat eine eindeutige ID und einen Lebenszyklusstatus.

**Slug** (*Slug*)
Ein URL-freundlicher Bezeichner, der automatisch aus dem Namen einer Organisation generiert wird. Wird in URLs und API-Pfaden verwendet.

**Soft-Delete** (*Soft Delete*)
Ein Loschungsmuster, bei dem Datensatze mit einem `deleted_at`-Zeitstempel markiert werden, anstatt physisch aus der Datenbank entfernt zu werden. Ermoglicht potenzielle Wiederherstellung und wahrt die referentielle Integritat.

**Sprunglogik** (*Skip Logic*)
Ein Ablaufsteuerungsmechanismus, der Fragen oder Seiten basierend auf vorherigen Antworten oder Variablenwerten bedingt uberspringt.

**SSR (Server-Side Rendering)**
Das Rendern von Seiten auf dem Server, bevor sie an den Browser gesendet werden. QDesigner Modern verwendet SSR nur fur offentliche Seiten; der Designer und die Ausfullung-Oberflachen erfordern clientseitiges Rendering fur volle Interaktivitat.

**Stimulus** (*Stimulus*)
Der Inhalt, der einem Teilnehmer prasentiert wird, bevor seine Reaktionszeit gemessen wird. Kann Text, Bilder, Audio oder Video umfassen.

**Strukturansicht** (*Structure View*)
Ein Designer-Ansichtsmodus, der die hierarchische Organisation von Seiten, Blocken und Fragen in einer baumartigen Oberflache zeigt, im Gegensatz zur visuellen WYSIWYG-Ansicht.

---

### T

**t-Test** (*t-Test*)
Ein statistischer Test zum Vergleich von Mittelwerten zwischen zwei Gruppen. Verfugbar als eingebaute Formelfunktion (`TTEST`), die t-Statistik, Freiheitsgrade, Mittelwertdifferenz, Standardfehler und Cohens d Effektstarke liefert.

**Teilnehmer** (*Participant*)
Eine Person, die einen Fragebogen ausfullt. Teilnehmer konnen anonym oder identifiziert sein, abhangig von den Zugangseinstellungen des Fragebogens.

**Texteingabe** (*Text Input*)
Ein Fragetyp, der Teilnehmern erlaubt, Freitextantworten einzugeben. Unterstutzt einzeilige und mehrzeilige Varianten.

**Token-Rotation** (*Token Rotation*)
Die Sicherheitspraxis, bei jeder Verwendung des aktuellen Refresh-Tokens ein neues auszustellen. Verhindert Token-Wiederverwendung und begrenzt die Auswirkungen eines Token-Diebstahls.

---

### U

**UUID (Universally Unique Identifier)**
Ein 128-Bit-Bezeichner, der als Primarschlussel fur die meisten Datenbankdatensatze verwendet wird. Gewahrleistet globale Eindeutigkeit ohne zentrale ID-Generierung.

---

### V

**Variable** (*Variable*)
Ein benannter Wert innerhalb eines Fragebogens, der aus Formeln berechnet, aus Antworten abgeleitet oder durch Skripte gesetzt werden kann. Variablen betreiben Ablaufsteuerung, Bewertung, Piping und Datenanalyse.

**Variableninterpolation** (*Variable Interpolation*)
Der Prozess des Ersetzens von `{{variablenName}}`-Platzhaltern in Text durch den aktuellen Wert der referenzierten Variable zum Anzeigezeitpunkt.

**Veroffentlichen** (*Publish*)
Die Aktion, einen Fragebogen fur Teilnehmerantworten verfugbar zu machen. Das Veroffentlichen andert den Status von "Entwurf" zu "Veroffentlicht" und generiert einen teilbaren Kurzcode.

**Version** (*Version*)
Ein gespeicherter Schnappschuss des Fragebogeninhalts zu einem bestimmten Zeitpunkt. Versionen werden wahrend der Zusammenarbeit automatisch erstellt und konnen manuell fur Meilensteinverfolgung gespeichert werden.

**Versionskontrolle** (*Version Control*)
Das System zur Verfolgung von Anderungen am Fragebogeninhalt im Zeitverlauf, einschliesslich Branching-, Diff- und Merge-Fahigkeiten ahnlich wie Git.

**Vorschau** (*Preview*)
Ein Modus im Designer, der zeigt, wie der Fragebogen fur Teilnehmer erscheinen wird, ohne tatsachliche Sitzungen zu erstellen oder Antworten aufzuzeichnen.

**Vorsignierte URL** (*Presigned URL*)
Eine zeitlich begrenzte URL, die temporaren Zugriff auf eine private Datei im S3-Speicher gewahrt. QDesigner Modern generiert vorsignierte URLs mit einer Gultigkeit von einer Stunde beim Bereitstellen von Mediendateien.

---

### W

**WebGL 2.0**
Eine Browser-API fur hardwarebeschleunigtes Grafik-Rendering. QDesigner Modern verwendet WebGL 2.0 fur seinen Hochleistungs-Display-Renderer, der 120+ FPS fur flussige visuelle Darstellung erreicht.

**WebSocket**
Ein persistentes, bidirektionales Kommunikationsprotokoll fur Echtzeit-Zusammenarbeitsfunktionen. Der QDesigner Modern WebSocket-Endpunkt befindet sich unter `/api/ws`.

**WYSIWYG (What You See Is What You Get)**
Ein Designer-Ansichtsmodus, der den Fragebogen genau so zeigt, wie Teilnehmer ihn sehen werden, und visuelle Bearbeitung von Layout und Formatierung ermoglicht.

---

### Z

**Z-Score** (*Z-Wert*)
Ein standardisierter Wert, der angibt, wie viele Standardabweichungen ein Wert vom Mittelwert entfernt ist. Verfugbar als eingebaute Formelfunktion (`ZSCORE`) und verwendet in Teilnehmervergleichsberichten.

**Zoom** (*Zoom*)
Die Moglichkeit, die Designer-Canvas-Ansicht zu skalieren. Gesteuert uber Tastenkurzel (`Strg+=` zum Hineinzoomen, `Strg+-` zum Herauszoomen, `Strg+0` zum Zurucksetzen) oder die Befehlspalette.

**Zugriffskontrolle** (*Access Control*)
Das Berechtigungssystem, das bestimmt, welche Benutzer Ressourcen anzeigen, bearbeiten oder verwalten konnen. QDesigner Modern implementiert rollenbasierte Zugriffskontrolle (RBAC) auf Organisations- und Projektebene.

**Zusammenarbeit** (*Collaboration*)
Die Echtzeit-Mehrbenutzer-Bearbeitungsfahigkeit, die es mehreren Teammitgliedern ermoglicht, gleichzeitig am selben Fragebogen zu arbeiten, unter Verwendung von Operationaler Transformation (OT) zur Konfliktlosung.

**Zusammenfuhrung** (*Merge*)
Der Prozess der Kombination von Anderungen aus einem Branch in einen anderen im Versionskontrollsystem. Zusammenfuhrungen konnen automatisch (ohne Konflikte) sein oder manuelle Konfliktlosung erfordern.
