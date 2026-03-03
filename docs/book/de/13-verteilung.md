# Kapitel 13: Verteilung und Teilnehmerverwaltung

Veroffentlichung, Weitergabe und Uberwachung von Fragebogen-Deployments in QDesigner Modern.

---

## 13.1 Der Publikationslebenszyklus

Jeder Fragebogen in QDesigner Modern durchlauft einen klar definierten Lebenszyklus von der Erstellung bis zur Datenerhebung:

```
Entwurf  -->  Veroffentlicht  -->  Datenerhebung  -->  Archiviert
```

Ein Fragebogen beginnt als **Entwurf** (draft), der nur fur Projektmitglieder sichtbar ist. Sobald das Design abgeschlossen ist, kann ein Teammitglied mit Editor-Rechten oder hoher den Fragebogen **veroffentlichen**, wodurch er fur Teilnehmer zuganglich wird. Wahrend der aktiven Datenerhebung konnen Forscher eingehende Antworten in Echtzeit uberwachen. Nach Abschluss der Datenerhebung kann der Fragebogen zur langfristigen Aufbewahrung archiviert werden.

### Entwurfsstatus

Im Entwurfsstatus ist der Fragebogen vollstandig bearbeitbar. Sie konnen Fragen hinzufugen, entfernen und neu anordnen, Ablaufsteuerungsregeln modifizieren und Variablendefinitionen anpassen. Kein Teilnehmer kann auf einen Entwurfs-Fragebogen zugreifen -- der Versuch, ihn uber einen Freigabelink zu offnen, liefert einen "Nicht gefunden"-Fehler.

### Veroffentlichung

Die Veroffentlichung uberfuhrt einen Fragebogen vom Status `draft` in den Status `published`. Diese Aktion erfordert Schreibzugriff auf das Projekt (Editor-, Admin- oder Owner-Rolle auf Projekt- oder Organisationsebene).

Es gibt zwei Wege zur Veroffentlichung:

1. **Designer-Oberflache**: Klicken Sie auf die Schaltflache "Publish" in der Designer-Kopfzeile oder verwenden Sie das Tastaturkurzel `Strg+Umschalt+Eingabe`.
2. **API**: Senden Sie eine `POST`-Anfrage an `/api/projects/{projectId}/questionnaires/{questionnaireId}/publish`.

Bei der Veroffentlichung setzt der Server den `published_at`-Zeitstempel und andert den Status auf `published`. Der Fragebogeninhalt wird zum Zeitpunkt der Veroffentlichung eingefroren -- nachfolgende Bearbeitungen erzeugen eine neue Entwurfsversion, anstatt die veroffentlichte Version zu modifizieren.

### Zugriffskontrolle fur veroffentlichte Fragebogen

Ein veroffentlichter Fragebogen ist fur jeden zuganglich, der den Kurzcode besitzt. Der `create_session`-Endpunkt erlaubt anonymen Zugriff, wenn der Fragebogenstatus `published` ist, sodass Teilnehmer kein Konto benotigen. Befindet sich der Fragebogen noch im Entwurfsstatus, konnen nur authentifizierte Benutzer mit Projektzugriff Sitzungen erstellen.

---

## 13.2 Freigabelinks und Kurzcodes

Jeder Fragebogen erhalt bei der Erstellung einen eindeutigen Bezeichner (UUID v4). QDesigner generiert einen menschenlesbaren **Kurzcode** aus dieser UUID, indem die ersten 8 Zeichen der Hex-Darstellung (ohne Bindestriche) extrahiert und in Grossbuchstaben umgewandelt werden.

Beispiel: Ein Fragebogen mit der UUID `a3f7b2c1-9d4e-4f8a-b6e2-1c3d5f7a9b0e` hatte den Kurzcode `A3F7B2C1`.

### Funktionsweise der Kurzcodes

Das Backend lost Kurzcodes mit folgender Logik auf (aus `questionnaires.rs`):

1. Akzeptiere eine 6-12 Zeichen lange alphanumerische Zeichenkette.
2. Konvertiere in Grossbuchstaben.
3. Suche in `questionnaire_definitions`, wo die ersten 8 Hex-Zeichen der UUID (ohne Bindestriche) mit dem Code ubereinstimmen.
4. Gib den Fragebogen nur zuruck, wenn sein Status `published` ist und das ubergeordnete Projekt `active` und nicht soft-geloscht ist.

### Aufbau der Teilnehmer-URL

Die teilnehmerorientierte URL folgt diesem Muster:

```
https://ihre-domain.de/q/{KURZCODE}
```

Beispiel: `https://studie.example.de/q/A3F7B2C1`

Diese URL ladt die Laufzeitumgebung, ruft die Fragebogendefinition uber `GET /api/questionnaires/by-code/{code}` ab und startet den Ausfulprozess.

### QR-Code-Generierung

QDesigner generiert QR-Codes clientseitig aus der Teilnehmer-URL. Forscher konnen den QR-Code als PNG-Bild herunterladen, um ihn in Druckmaterialien, Plakate oder Rekrutierungs-E-Mails einzubinden. Der QR-Code kodiert die vollstandige Teilnehmer-URL, sodass Teilnehmer mit einem mobilen Gerat scannen und sofort mit dem Fragebogen beginnen konnen.

### Einbettungscode (iframe)

Fur die Einbettung von Fragebogen in externe Webseiten generiert QDesigner ein iframe-Snippet:

```html
<iframe
  src="https://ihre-domain.de/q/A3F7B2C1"
  width="100%"
  height="800"
  frameborder="0"
  allow="fullscreen"
  style="border: none; border-radius: 8px;">
</iframe>
```

Forscher konnen Breite, Hohe und Styling vor dem Kopieren des Snippets anpassen.

---

## 13.3 Teilnehmer-Ausfullerlebnis

Wenn ein Teilnehmer eine Fragebogen-URL offnet, wird die Laufzeitumgebung geladen.

### Einwilligungserfassung

Wenn der Fragebogen eine Einwilligungsseite enthaelt (typischerweise die erste Seite), muss der Teilnehmer den Studienbedingungen zustimmen, bevor er fortfahren kann. Wenn der Teilnehmer seine Einwilligung erteilt, persistiert die Laufzeitumgebung die Einwilligungsentscheidung in den Sitzungsmetadaten mit einem ISO-8601-Zeitstempel:

```json
{
  "consent": {
    "given": true,
    "timestamp": "2026-03-03T14:22:31.000Z"
  }
}
```

Dieser Einwilligungsdatensatz wird als Teil des `metadata`-Feldes der Sitzung in der Datenbank gespeichert und stellt einen dauerhaften, nachpruefbaren Nachweis dar, dass der Teilnehmer den Studienbedingungen zu einem bestimmten Zeitpunkt zugestimmt hat. Forschende koennen den Einwilligungsstatus ueber die Sitzungsdetail-API abfragen und in Datenexporten einschliessen.

### Sitzungsinitialisierung

Die Laufzeitumgebung erstellt eine neue Sitzung ueber `POST /api/sessions` mit folgenden Daten:

- **questionnaire_id**: Die UUID des Fragebogens.
- **participant_id**: Ein optionaler Bezeichner. Wenn der Teilnehmer authentifiziert ist, wird seine Benutzer-ID verwendet. Andernfalls kann eine zufaellige Teilnehmer-ID generiert werden, oder das Feld bleibt fuer vollstaendig anonyme Teilnahme leer.
- **browser_info**: Automatisch erfasste Metadaten einschliesslich User Agent, Bildschirmaufloesung und Touch-Faehigkeit.
- **metadata**: Zusaetzlicher Kontext wie Rekrutierungsquelle, Bedingungszuweisung und Einwilligungsdatensaetze.

Der Server prueft, ob der Fragebogen veroeffentlicht ist (oder ob der Benutzer mit Projektzugriff authentifiziert ist), bevor die Sitzung erstellt wird.

### Antwortubermittlung

Wahrend Teilnehmer Fragen beantworten, werden Antworten an `POST /api/sessions/{sessionId}/responses` ubermittelt. Jede Antwort enthalt:

- **question_id**: Welche Frage beantwortet wurde.
- **value**: Die Antwort des Teilnehmers (JSON, unterstutzt jeden Datentyp).
- **reaction_time_us**: Reaktionszeit mit Mikrosekunden-Prazision, gemessen uber `performance.now()`, gespeichert als BIGINT.
- **presented_at**: Wann die Frage dem Teilnehmer erstmals angezeigt wurde.
- **answered_at**: Wann der Teilnehmer seine Antwort abgeschickt hat.

Antworten konnen einzeln oder als Stapel im Format `{ responses: [...] }` ubermittelt werden.

### Interaktionsereignisse

Fur detaillierte Verhaltensanalysen zeichnet die Laufzeitumgebung Interaktionsereignisse uber `POST /api/sessions/{sessionId}/events` auf. Jedes Ereignis enthalt:

- **event_type**: Die Art der Interaktion (z.B. `keydown`, `click`, `focus_change`, `page_navigation`).
- **question_id**: Welche Frage im Fokus war (optional).
- **timestamp_us**: Zeitstempel mit Mikrosekunden-Prazision.
- **metadata**: Zusatzliche ereignisspezifische Daten.

### Sitzungsvariablen

Berechnete Variablen (Scores, Indizes, laufende Summen) werden uber `POST /api/sessions/{sessionId}/variables` als Name-Wert-Paare persistiert, mit Upsert-Semantik (Einfugen oder Aktualisieren bei Konflikt).

### Sitzungslebenszyklus

Sitzungen durchlaufen folgende Zustande:

| Status | Beschreibung |
|---|---|
| `active` | Der Teilnehmer fullt gerade den Fragebogen aus. `not_started`, `in_progress` und `paused` werden alle zu `active` normalisiert. |
| `completed` | Der Teilnehmer hat alle erforderlichen Fragen abgeschlossen. Der `completed_at`-Zeitstempel wird gesetzt. |
| `abandoned` | Die Sitzung wurde gestartet, aber nicht innerhalb des erwarteten Zeitfensters abgeschlossen. |
| `expired` | Die Sitzung hat ihre maximal erlaubte Dauer uberschritten. |

Um den Status einer Sitzung zu aktualisieren, sendet die Laufzeitumgebung `PATCH /api/sessions/{sessionId}` mit dem neuen Status. Bei Setzen auf `completed` zeichnet der Server automatisch den `completed_at`-Zeitstempel auf.

---

## 13.4 Antwort-Monitoring

### Dashboard-Ubersicht

Der Dashboard-Endpunkt `GET /api/sessions/dashboard?organization_id={orgId}` bietet Forschern eine Ubersicht:

- **Fragebogen-Zusammenfassungen**: Fur jeden Fragebogen die Gesamtzahl der Antworten, abgeschlossene Sitzungen und durchschnittliche Bearbeitungszeit in Millisekunden.
- **Letzte Aktivitaten**: Die letzten 20 Sitzungen uber alle Fragebogen, mit Teilnehmer-ID, Fragebogenname, Status und Zeitstempeln.
- **Aggregierte Statistiken**: Gesamtzahl der Fragebogen, Gesamtzahl der Antworten, aktive (veroffentlichte) Fragebogen und durchschnittliche Abschlussrate.

### Sitzungsauflistung und Filterung

Der `GET /api/sessions`-Endpunkt unterstutzt Filterung nach:

- `questionnaire_id`: Sitzungen fur einen bestimmten Fragebogen anzeigen.
- `participant_id`: Nach Teilnehmer filtern.
- `status`: Nach Sitzungsstatus filtern (`active`, `completed`, `abandoned`, `expired`).
- `limit` und `offset`: Paginierung (Standard 50, Maximum 500).

### Sitzungsdetails anzeigen

Fur eine bestimmte Sitzung liefert `GET /api/sessions/{id}` den vollstandigen Sitzungsdatensatz. Forscher konnen dann vertiefen:

- `GET /api/sessions/{id}/responses`: Alle Antworten der Sitzung, optional gefiltert nach `question_id`.
- `GET /api/sessions/{id}/events`: Alle Interaktionsereignisse, geordnet nach Zeitstempel.
- `GET /api/sessions/{id}/variables`: Alle berechneten Variablenwerte der Sitzung.

### Aggregierte Statistiken

Der `GET /api/sessions/aggregate`-Endpunkt berechnet deskriptive Statistiken uber Sitzungen hinweg:

- **source**: Entweder `variable` (fur berechnete Variablenwerte) oder `response` (fur Rohantworten).
- **key**: Der Variablenname oder die Fragen-ID zur Aggregation.
- **questionnaire_id**: Erforderlicher Geltungsbereich.
- **participant_id**: Optionaler Filter.

Die Antwort enthalt eine vollstandige statistische Zusammenfassung: Stichprobengrosse, Mittelwert, Median, Standardabweichung, Minimum, Maximum und Perzentile (p10, p25, p50, p75, p90, p95, p99).

### Teilnehmervergleich

Der `GET /api/sessions/compare`-Endpunkt vergleicht zwei Teilnehmer hinsichtlich einer bestimmten Metrik:

- **left_participant_id** und **right_participant_id**: Die beiden zu vergleichenden Teilnehmer.
- **key**: Variablenname oder Fragen-ID.
- **source**: `variable` oder `response`.

Die Antwort enthalt individuelle Statistiken fur jeden Teilnehmer sowie ein Delta-Objekt mit Mittelwertdifferenz, Mediandifferenz und z-Score.

---

## 13.5 Datenexport

### JSON-Export

Standardmassig liefert `GET /api/projects/{projectId}/questionnaires/{questionnaireId}/export` Antwortdaten im JSON-Format. Jede Zeile enthalt Sitzungs-ID, Teilnehmer-ID, Sitzungsstatus, Zeitstempel, Fragen-ID, Antwortwert und Reaktionszeit.

### CSV-Export

Das Anhangen von `?format=csv` an die Export-URL liefert die Daten als herunterladbare CSV-Datei mit folgenden Spalten:

```
session_id, participant_id, session_status, started_at, completed_at,
question_id, value, reaction_time_us, presented_at, answered_at
```

CSV-Felder, die Kommas, Anfuhrungszeichen oder Zeilenumbruche enthalten, werden gemaess RFC 4180 korrekt maskiert.

---

## 13.6 Zugriffseinstellungen und Sicherheit

### Anonyme vs. Authentifizierte Teilnahme

QDesigner unterstutzt beide Modi:

- **Anonym**: Veroffentlichte Fragebogen akzeptieren die Sitzungserstellung ohne Authentifizierung. Es ist keine Anmeldung erforderlich, und Teilnehmer konnen nur durch optionale Teilnehmer-IDs oder Browser-Metadaten identifiziert werden.
- **Authentifiziert**: Fur Studien, die eine verifizierte Identitat erfordern, konnen Forscher den Zugang auf authentifizierte Benutzer beschranken. Dies wird auf Projektebene uber das `is_public`-Flag gesteuert.

### Ratenbegrenzung

Das Backend unterstutzt Ratenbegrenzung (uber Redis, wenn konfiguriert), um Missbrauch zu verhindern. Ubermassige Anfragen von einer einzelnen Quelle werden mit einer `429 Too Many Requests`-Antwort gedrosselt.

### Datenisolation

Alle Daten sind uber die Multi-Tenant-Architektur auf Organisationen und Projekte begrenzt. Sitzungen gehoren zu Fragebogen, die zu Projekten gehoren, die zu Organisationen gehoren. Zugriffsprufungen werden auf jeder Ebene der Hierarchie durchgesetzt.

---

## Zusammenfassung

Das Verteilungssystem von QDesigner Modern bietet einen vollstandigen Arbeitsablauf von der Veroffentlichung uber die Datenerhebung bis zum Monitoring. Kurzcodes machen Fragebogen einfach teilbar uber Links, QR-Codes oder eingebettete iframes. Das Sitzungsmanagementsystem erfasst Antworten mit Mikrosekunden-Prazision, wahrend das Monitoring-Dashboard und die Endpunkte fur aggregierte Statistiken Forschern Echtzeit-Einblick in den Fortschritt ihrer Datenerhebung geben.
