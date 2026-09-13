# QDesigner Modern im Vergleich zum Altsystem

**Datum:** 2. September 2026
**Bezug:** Angebot Entwicklung QDesigner Modern


QDesigner Modern ist erheblich umfangreicher als das bisherige QDesigner. Der Grund ist nicht ein größerer Fragebogen-Editor, sondern eine andere Produktklasse: Das Altsystem war eine lokal installierte Chrome-App mit einem kleinen Server für ein Labor. QDesigner Modern ist eine gehostete, mandantenfähige Forschungsdatenplattform, die dieselben Forschungsergebnisse liefert und zusätzlich die Pflichten trägt, die eine solche Plattform heute hat.

## 1. Größenvergleich nach Funktionsbereich

Handgeschriebener Produktionscode ohne Bibliotheken, Tests und generierte Dateien.

| Funktionsbereich | QDesigner Modern | Altsystem | Was das Altsystem stattdessen hatte |
|---|---:|---:|---|
| Fragetypen und ihre Editoren (12 Module) | 9.400 | 3.300 | 4 Frage- und 4 Antworttypen über CSV-Parameter |
| Ausfüll-Runtime, Flow, Variablen, Ausdrucks-Engine | 11.300 | 2.700 | `eval` auf frei eingegebenes JavaScript |
| Server-Kern: Fragebögen, Sessions, Medien, Vorlagen | 6.600 | 5.000 | .NET-API mit MySQL |
| Anmeldung und Rechte | 1.500 | 800 | Login und fünf feste Rechte |
| Vorlagenbearbeitung (Anteil des Designers) | 5.000 | 2.000 | CSV-Editor |
| **Zwischensumme: gleiche Ergebnisse wie das Altsystem** | **≈ 34.000** | **≈ 14.000** | |
| Visueller Designer, Undo, Autosave, Flow-Graph | 15.000 | 0 | CSV-Datei bearbeiten |
| Reaktionszeit-Engine, WebGL, Timing-Provenienz, Antwortgeräte | 18.200 | 1.000 | Tastendruck-Handler, eine WebGL-Testseite |
| Mandanten, SSO, SCIM, Rollen, Zeilensicherheit, Audit, DSGVO | 16.000 | 0 | ein Labor, eine Installation |
| Analytik, Psychometrie, Exporte, Teilnehmer-Feedback | 17.000 | 2.000 | ein Balkendiagramm, SPSS-Export |
| Offline-Synchronisation, Ledger, Verschlüsselung, Datenqualität | 12.000 | 500 | lokaler Browserspeicher |
| Datenbankmigrationen | 5.700 | 300 | SQL im Programmcode |
| Echtzeit-Kollaboration, Kommentare | 3.000 | 0 | |
| Längsschnitt-Serien, Einladungen, API-Schlüssel | 2.500 | 0 | |
| Hilfe, Mehrsprachigkeit, Theming | 4.500 | 300 | zwei Sprachtabellen |
| Übriges (gemeinsame Typen, UI-Bausteine) | ≈ 10.000 | 5.900 | Bootstrap-Stylesheet |
| **Gesamt** | **≈ 139.000** | **≈ 31.000** | |
| Automatisierte Tests | ≈ 60.000 (44 %) | ≈ 3.700 (11 %) | |

Nur rund ein Viertel des modernen Codes entspricht dem, was das Altsystem konnte, und dieser Teil ist etwa so groß wie das Altsystem selbst. Die übrigen drei Viertel sind Fähigkeiten, die das Altsystem nicht hatte oder die es an Mechanismen delegierte, die es heute nicht mehr gibt: frei ausführbares JavaScript statt einer Regelsprache, Chrome-App-Berechtigungen statt Offline-Synchronisation, ein einzelnes Labor-LAN statt Mandantentrennung.

## 2. Sicherheit und Datenschutz: nicht optional

Das Altsystem verarbeitete Teilnehmerdaten psychologischer Studien, also häufig Gesundheits- und Verhaltensdaten im Sinne von Art. 9 DSGVO, mit dem Sicherheitsniveau einer Laboranwendung von 2015. Eine heute betriebene Plattform muss die Anforderungen aus Art. 25 (Datenschutz durch Technikgestaltung) und Art. 32 (Sicherheit der Verarbeitung) DSGVO nachweisbar erfüllen und die Betroffenenrechte (Art. 15–17) technisch umsetzen können. Ethikkommissionen und Datenschutzbeauftragte der Hochschulen verlangen diesen Nachweis vor Studienbeginn. Diese Anforderungen machen etwa 16.000 Zeilen des Leistungsumfangs aus (L2) und ziehen sich durch alle weiteren Blöcke.

| Anforderung | Altsystem | QDesigner Modern |
|---|---|---|
| Passwörter | PBKDF2-Hash | Argon2, Sperre bei Brute-Force, konstante Antwortzeit, E-Mail-Verifikation |
| Sitzungen | Cookie ohne weitere Schutzmaßnahmen | httpOnly-Refresh-Cookies, kurzlebige Access-Tokens, CSRF-Schutz, Token-Widerruf |
| Zugriffssteuerung | fünf feste Rechte, im Anwendungscode geprüft | zentraler Autorisierungspunkt für jede Operation plus Zeilensicherheit in der Datenbank als unabhängige zweite Schicht; Regressionstests der gesamten Rechtematrix |
| Mandantentrennung | keine (eine Installation je Labor) | Organisationen mit vollständiger Datentrennung, verifizierte Domänen, projektübergreifende Zusammenarbeit nur über Einladung |
| Föderierte Anmeldung | keine | OIDC-SSO mit Bindung an verifizierte Domänen (fail-closed), SCIM-Provisionierung |
| Missbrauchsschutz | keiner | sieben zweckgebundene Rate-Limiter, Duplikaterkennung, Datenqualitätsregeln |
| Ausführbarer Code in Fragebögen | frei eingegebenes JavaScript mit Zugriff auf Browser, Netzwerk und Speicher | keine ausführbare Logik; geprüfte Ausdrucks- und Regelsprache, Content-Security-Policy ohne `unsafe-eval`, Bereinigung aller Autoren-HTML-Inhalte |
| Daten auf dem Endgerät | unverschlüsselter Browserspeicher | AES-GCM-Verschlüsselung ruhender Daten, gerätegebundener Schlüssel, Löschung durch Schlüsselvernichtung, bereinigte Geräteübergabe |
| Nachvollziehbarkeit | keine | Audit-Log aller sicherheitsrelevanten Ereignisse, Versions- und Provenienzfelder in jedem Export |
| Betroffenenrechte | manuell in der Datenbank | Auskunft/Export, Löschung, Aufbewahrungsfristen, Legal Hold, Datenresidenz als Produktfunktionen |
| Verlust- und Integritätsschutz | Datei-Dump | idempotente Synchronisation mit Ledger, Dead-Letter und Abgleich; kein stiller Datenverlust |
| Nachweis | keiner | automatisierte Sicherheits- und Rechtetests im Gate jeder Auslieferung, Sicherheitsreview je Meilenstein |

Der Unterschied im Umfang ist also nicht das Ergebnis eines gewachsenen Editors, sondern der Preis dafür, dieselbe Forschung heute rechtskonform, nachweisbar und für mehrere Institute gleichzeitig betreiben zu können.
