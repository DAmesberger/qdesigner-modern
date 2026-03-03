# Kapitel 15: API-Referenz

Vollstandige Referenz fur die QDesigner Modern REST-API.

---

## Uberblick

Die QDesigner Modern API ist eine RESTful JSON-API, die von einem Rust/Axum-Backend bereitgestellt wird. Alle Endpunkte verwenden JSON-Anfrage- und Antwortkorper, sofern nicht anders angegeben. Die Authentifizierung erfolgt uber Bearer-Tokens im `Authorization`-Header.

**Basis-URL**: `http://localhost:4000/api` (Entwicklung)

### Fehlerformat

Alle Fehler folgen einem einheitlichen Format:

```json
{
  "error": {
    "status": 400,
    "message": "Beschreibung des Fehlers"
  }
}
```

### Fehlercodes

| HTTP-Status | Name | Beschreibung |
|---|---|---|
| 400 | Bad Request | Ungultige Eingabe oder fehlende Pflichtfelder |
| 401 | Unauthorized | Fehlender oder ungultiger Authentifizierungstoken |
| 403 | Forbidden | Authentifiziert, aber unzureichende Berechtigungen |
| 404 | Not Found | Ressource existiert nicht oder wurde geloscht |
| 409 | Conflict | Ressource existiert bereits (z.B. doppelte E-Mail) |
| 422 | Unprocessable Entity | Validierungsfehler bei Eingabefeldern |
| 429 | Too Many Requests | Ratenlimit uberschritten |
| 500 | Internal Server Error | Unerwarteter serverseitiger Fehler |

---

## Gesundheitsprufung

### GET /health

Verfugbarkeitsprufung. Antwortet sofort ohne Abhangigkeitsprufung.

**Auth**: Keine

**Antwort** `200 OK`:
```json
{ "status": "ok" }
```

---

### GET /ready

Bereitschaftsprufung. Pruft Datenbank- und Redis-Konnektivitat.

**Auth**: Keine

**Antwort** `200 OK`:
```json
{
  "status": "ready",
  "checks": {
    "database": true,
    "redis": true
  }
}
```

**Antwort** `503 Service Unavailable`:
```json
{
  "status": "degraded",
  "checks": {
    "database": true,
    "redis": false
  }
}
```

---

## Authentifizierung

### POST /api/auth/register

Ein neues Benutzerkonto erstellen.

**Auth**: Keine

**Anfrage**:
```json
{
  "email": "forscher@example.com",
  "password": "sicheresPasswort123",
  "full_name": "Dr. Anna Muller"
}
```

| Feld | Typ | Erforderlich | Validierung |
|---|---|---|---|
| email | string | Ja | Gultiges E-Mail-Format |
| password | string | Ja | Mindestens 8 Zeichen |
| full_name | string | Nein | Standard: E-Mail-Prafix |

**Antwort** `200 OK`:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "forscher@example.com",
    "full_name": "Dr. Anna Muller",
    "avatar_url": null,
    "roles": ["user"]
  }
}
```

**Fehler**: `409 Conflict` wenn E-Mail bereits registriert, `422` fur Validierungsfehler.

---

### POST /api/auth/login

Authentifizieren und Tokens erhalten.

**Auth**: Keine

**Anfrage**:
```json
{
  "email": "forscher@example.com",
  "password": "sicheresPasswort123"
}
```

**Antwort** `200 OK`: Gleiches Format wie die Registrierungsantwort.

**Fehler**: `401 Unauthorized` bei ungultigen Anmeldedaten.

---

### POST /api/auth/refresh

Einen Refresh-Token gegen ein neues Token-Paar tauschen. Der alte Refresh-Token wird widerrufen (Rotation).

**Auth**: Keine

**Anfrage**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Antwort** `200 OK`: Gleiches Format wie die Login-Antwort.

---

### POST /api/auth/logout

Den aktuellen Access-Token und alle Refresh-Tokens des Benutzers widerrufen.

**Auth**: Erforderlich (Bearer-Token)

**Antwort** `200 OK`:
```json
{ "message": "Logged out" }
```

---

### GET /api/auth/me

Informationen des authentifizierten Benutzers abrufen.

**Auth**: Erforderlich

**Antwort** `200 OK`:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "forscher@example.com",
  "full_name": "Dr. Anna Muller",
  "avatar_url": null,
  "roles": ["owner"]
}
```

---

### POST /api/auth/verify-email

E-Mail mittels Token verifizieren (link-basierte Verifizierung).

**Auth**: Keine

**Anfrage**:
```json
{ "token": "abc123def456" }
```

**Antwort** `200 OK`:
```json
{ "message": "Email verified" }
```

---

### POST /api/auth/verify-email/send

Einen 6-stelligen Verifizierungscode an eine E-Mail-Adresse senden. Der Code lauft nach 10 Minuten ab.

**Auth**: Keine

**Anfrage**:
```json
{ "email": "forscher@example.com" }
```

**Antwort** `200 OK`:
```json
{ "success": true, "message": "Verification code sent" }
```

---

### POST /api/auth/verify-email/verify

E-Mail mittels 6-stelligem Code verifizieren.

**Auth**: Keine

**Anfrage**:
```json
{ "email": "forscher@example.com", "code": "123456" }
```

**Antwort** `200 OK`:
```json
{ "success": true, "message": "Email verified successfully" }
```

---

### POST /api/auth/verify-email/resend

Alias fur `/api/auth/verify-email/send`. Gleiches Verhalten.

---

### POST /api/auth/password-reset

Passwort-Zurucksetzung anfordern. Gibt immer Erfolg zuruck, um E-Mail-Enumeration zu verhindern.

**Auth**: Keine

**Anfrage**:
```json
{ "email": "forscher@example.com" }
```

**Antwort** `200 OK`:
```json
{ "message": "If the email exists, a reset link has been sent" }
```

---

## Benutzer

### GET /api/users/me

Das vollstandige Profil des authentifizierten Benutzers abrufen.

**Auth**: Erforderlich

**Antwort** `200 OK`:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "forscher@example.com",
  "full_name": "Dr. Anna Muller",
  "avatar_url": null,
  "timezone": "Europe/Berlin",
  "locale": "de-DE",
  "email_verified": true,
  "created_at": "2025-01-15T10:30:00Z"
}
```

---

### PATCH /api/users/me

Das Profil des authentifizierten Benutzers aktualisieren.

**Auth**: Erforderlich

**Anfrage** (alle Felder optional):
```json
{
  "full_name": "Prof. Anna Muller",
  "avatar_url": "https://example.com/avatar.jpg",
  "timezone": "Europe/Berlin",
  "locale": "de-DE"
}
```

**Antwort** `200 OK`: Gleiches Format wie GET-Antwort mit aktualisierten Werten.

---

## Organisationen

### GET /api/organizations

Organisationen auflisten, in denen der Benutzer aktives Mitglied ist.

**Auth**: Erforderlich

**Query-Parameter**:

| Parameter | Typ | Standard | Beschreibung |
|---|---|---|---|
| limit | integer | 50 | Max. Ergebnisse (begrenzt auf 100) |
| offset | integer | 0 | Paginierungs-Offset |

**Antwort** `200 OK`: Array von Organisationsobjekten.

---

### POST /api/organizations

Eine neue Organisation erstellen. Der Ersteller wird zum Eigentumer.

**Auth**: Erforderlich

**Anfrage**:
```json
{
  "name": "Forschungslabor",
  "slug": "forschungslabor",
  "domain": "labor.uni-beispiel.de",
  "logo_url": "https://example.com/logo.png"
}
```

| Feld | Typ | Erforderlich | Beschreibung |
|---|---|---|---|
| name | string | Ja | 1-255 Zeichen |
| slug | string | Nein | Automatisch aus Name generiert |
| domain | string | Nein | Organisations-Domain |
| logo_url | string | Nein | Logo-URL |

**Antwort** `201 Created`: Organisationsobjekt.

**Fehler**: `409 Conflict` wenn Slug bereits vergeben.

---

### GET /api/organizations/{id}

Eine einzelne Organisation abrufen. Erfordert aktive Mitgliedschaft.

**Auth**: Erforderlich (Mitglied)

---

### PATCH /api/organizations/{id}

Organisationsdetails aktualisieren.

**Auth**: Erforderlich (Admin oder Eigentumer)

---

### DELETE /api/organizations/{id}

Organisation weich loschen.

**Auth**: Erforderlich (nur Eigentumer)

---

### GET /api/organizations/{id}/members

Alle Mitglieder einer Organisation auflisten.

**Auth**: Erforderlich (Mitglied)

---

### POST /api/organizations/{id}/members

Ein Mitglied per E-Mail zur Organisation hinzufugen.

**Auth**: Erforderlich (Admin oder Eigentumer)

**Anfrage**:
```json
{ "email": "neues-mitglied@example.com", "role": "editor" }
```

Mogliche Rollen: `owner`, `admin`, `editor`, `viewer`

---

### DELETE /api/organizations/{id}/members/{user_id}

Ein Mitglied entfernen. Der letzte Eigentumer kann nicht entfernt werden.

**Auth**: Erforderlich (Admin oder Eigentumer)

---

### GET /api/organizations/{id}/invitations

Ausstehende Einladungen fur eine Organisation auflisten.

**Auth**: Erforderlich (Admin oder Eigentumer)

---

### POST /api/organizations/{id}/invitations

Eine Einladung erstellen. Lauft nach 7 Tagen ab.

**Auth**: Erforderlich (Admin oder Eigentumer)

**Anfrage**:
```json
{ "email": "eingeladen@example.com", "role": "editor" }
```

---

### DELETE /api/organizations/{id}/invitations/{inv_id}

Eine ausstehende Einladung widerrufen.

**Auth**: Erforderlich (Admin oder Eigentumer)

---

## Einladungen

### GET /api/invitations/pending

Alle ausstehenden Einladungen fur die E-Mail des authentifizierten Benutzers auflisten.

**Auth**: Erforderlich

---

### POST /api/invitations/{id}/accept

Eine Einladung annehmen. Der Benutzer wird mit der angegebenen Rolle zur Organisation hinzugefugt.

**Auth**: Erforderlich

---

### POST /api/invitations/{id}/decline

Eine Einladung ablehnen.

**Auth**: Erforderlich

---

## Projekte

### GET /api/projects

Dem Benutzer zugangliche Projekte auflisten.

**Auth**: Erforderlich

**Query-Parameter**:

| Parameter | Typ | Standard | Beschreibung |
|---|---|---|---|
| organization_id | UUID | Keiner | Nach Organisation filtern |
| limit | integer | 50 | Max. Ergebnisse (begrenzt auf 100) |
| offset | integer | 0 | Paginierungs-Offset |

---

### POST /api/projects

Ein neues Projekt erstellen. Ersteller wird Projekteigentumer.

**Auth**: Erforderlich (Organisationsmitglied)

**Anfrage**:
```json
{
  "organization_id": "org-uuid",
  "name": "Reaktionszeit-Studie",
  "code": "RZS-001",
  "description": "Messung kognitiver Belastungseffekte",
  "is_public": false,
  "max_participants": 200,
  "irb_number": "IRB-2025-042",
  "start_date": "2025-03-01",
  "end_date": "2025-06-30"
}
```

| Feld | Typ | Erforderlich | Beschreibung |
|---|---|---|---|
| organization_id | UUID | Ja | Muss Mitglied der Organisation sein |
| name | string | Ja | 1-255 Zeichen |
| code | string | Ja | 1-50 Zeichen, eindeutiger Bezeichner |
| description | string | Nein | Projektbeschreibung |
| is_public | boolean | Nein | Standard: false |
| max_participants | integer | Nein | Teilnehmerobergrenze |
| irb_number | string | Nein | Ethikkommission-Genehmigungsnummer |
| start_date | date | Nein | Format: JJJJ-MM-TT |
| end_date | date | Nein | Format: JJJJ-MM-TT |

---

### GET /api/projects/{id}

Ein einzelnes Projekt abrufen.

**Auth**: Erforderlich (Organisationsmitglied)

---

### PATCH /api/projects/{id}

Projektdetails aktualisieren.

**Auth**: Erforderlich (Projekt-Editor+ oder Org-Admin+)

---

### DELETE /api/projects/{id}

Projekt weich loschen.

**Auth**: Erforderlich (Projekteigentumer oder Org-Admin)

---

### GET /api/projects/{id}/members

Projektmitglieder auflisten.

**Auth**: Erforderlich (Organisationsmitglied)

---

### POST /api/projects/{id}/members

Ein Mitglied zum Projekt hinzufugen.

**Auth**: Erforderlich (Projekt-Admin+ oder Org-Admin+)

---

### PATCH /api/projects/{id}/members/{uid}

Die Rolle eines Projektmitglieds aktualisieren.

**Auth**: Erforderlich (Projekt-Admin+ oder Org-Admin+)

---

### DELETE /api/projects/{id}/members/{uid}

Ein Projektmitglied entfernen. Der letzte Eigentumer kann nicht entfernt werden.

**Auth**: Erforderlich (Projekt-Admin+ oder Org-Admin+)

---

## Fragebogen

### GET /api/questionnaires/by-code/{code}

Einen veroffentlichten Fragebogen uber seinen Kurzcode abrufen. Dies ist der offentlich zugangliche Endpunkt fur Teilnehmer.

**Auth**: Keine

**Pfad-Parameter**:

| Parameter | Typ | Beschreibung |
|---|---|---|
| code | string | 6-12 Zeichen alphanumerischer Kurzcode |

**Fehler**: `404` wenn nicht gefunden, nicht veroffentlicht oder Projekt inaktiv.

---

### GET /api/projects/{id}/questionnaires

Fragebogen in einem Projekt auflisten.

**Auth**: Erforderlich (Organisationsmitglied)

**Query-Parameter**: `status`, `limit`, `offset`

---

### POST /api/projects/{id}/questionnaires

Einen neuen Fragebogen erstellen.

**Auth**: Erforderlich (Projekt-Editor+ oder Org-Admin+)

**Anfrage**:
```json
{
  "name": "Kognitive Belastungsumfrage",
  "description": "Vor-/Nachmessung kognitiver Belastung",
  "content": { "questions": [], "pages": [] },
  "settings": { "showProgressBar": true }
}
```

---

### GET /api/projects/{id}/questionnaires/{qid}

Einen einzelnen Fragebogen abrufen.

**Auth**: Erforderlich (Organisationsmitglied)

---

### PATCH /api/projects/{id}/questionnaires/{qid}

Einen Fragebogen aktualisieren. Setzen von `status` auf `published` lost die Veroffentlichung aus.

**Auth**: Erforderlich (Projekt-Editor+ oder Org-Admin+)

---

### POST /api/projects/{id}/questionnaires/{qid}/publish

Einen Fragebogen veroffentlichen.

**Auth**: Erforderlich (Projekt-Editor+ oder Org-Admin+)

---

### DELETE /api/projects/{id}/questionnaires/{qid}

Einen Fragebogen weich loschen.

**Auth**: Erforderlich (Projekt-Editor+ oder Org-Admin+)

---

### GET /api/projects/{id}/questionnaires/{qid}/export

Antwortdaten eines Fragebogens exportieren.

**Auth**: Erforderlich (Organisationsmitglied)

**Query-Parameter**: `format` (`json` oder `csv`)

---

## Sitzungen

### POST /api/sessions

Eine neue Teilnehmersitzung erstellen. Erlaubt anonymen Zugang fur veroffentlichte Fragebogen.

**Auth**: Optional (erforderlich wenn Fragebogen nicht veroffentlicht)

---

### GET /api/sessions

Sitzungen mit optionalen Filtern auflisten.

**Auth**: Erforderlich

**Query-Parameter**: `questionnaire_id`, `participant_id`, `status`, `limit`, `offset`

---

### GET /api/sessions/aggregate

Aggregierte Statistiken uber Sitzungen berechnen.

**Auth**: Erforderlich

**Query-Parameter**: `questionnaire_id` (erforderlich), `key` (erforderlich), `source`, `participant_id`

---

### GET /api/sessions/compare

Zwei Teilnehmer hinsichtlich einer bestimmten Metrik vergleichen.

**Auth**: Erforderlich

**Query-Parameter**: `questionnaire_id`, `key`, `source`, `left_participant_id`, `right_participant_id`

---

### GET /api/sessions/dashboard

Dashboard-Zusammenfassung fur eine Organisation abrufen.

**Auth**: Erforderlich (Organisationsmitglied)

**Query-Parameter**: `organization_id` (erforderlich)

---

### GET /api/sessions/{id}

Eine einzelne Sitzung abrufen.

**Auth**: Erforderlich

---

### PATCH /api/sessions/{id}

Sitzungsstatus oder Metadaten aktualisieren. Setzen auf `completed` setzt automatisch `completed_at`.

---

### GET /api/sessions/{id}/responses

Antworten einer Sitzung abrufen.

**Auth**: Erforderlich

---

### POST /api/sessions/{id}/responses

Eine oder mehrere Antworten ubermitteln. Sitzung muss aktiv sein.

---

### GET /api/sessions/{id}/events

Interaktionsereignisse einer Sitzung abrufen.

**Auth**: Erforderlich

---

### POST /api/sessions/{id}/events

Interaktionsereignisse ubermitteln.

---

### GET /api/sessions/{id}/variables

Berechnete Variablen einer Sitzung abrufen.

**Auth**: Erforderlich

---

### POST /api/sessions/{id}/variables

Eine Sitzungsvariable erstellen oder aktualisieren (Upsert).

---

## Medien

### GET /api/media

Medien-Assets einer Organisation auflisten.

**Auth**: Erforderlich (Organisations-Viewer+)

**Query-Parameter**: `organization_id` (erforderlich), `limit`, `offset`

---

### POST /api/media

Eine Mediendatei hochladen. Verwendet Multipart-Formulardaten.

**Auth**: Erforderlich (Organisationsmitglied+)

**Felder**: `organization_id` (string), `file` (Datei)

---

### GET /api/media/{id}

Ein Medien-Asset mit einer vorsignierten Download-URL abrufen (gultig fur 1 Stunde).

**Auth**: Erforderlich (Organisations-Viewer+)

---

### DELETE /api/media/{id}

Ein Medien-Asset aus Speicher und Datenbank loschen.

**Auth**: Erforderlich (ursprunglicher Hochlader oder Org-Admin)

---

## WebSocket

### GET /api/ws

HTTP-Verbindung auf WebSocket fur Echtzeit-Kollaboration hochstufen.

**Auth**: Uber Token in Verbindungsparametern

Siehe Kapitel 14 (Zusammenarbeit) fur das vollstandige WebSocket-Nachrichtenprotokoll.

---

## Entwicklungshelfer

Diese Endpunkte sind nur verfugbar, wenn `DEV_HELPERS_ENABLED=true` gesetzt ist oder in Debug-Builds.

### POST /api/dev/bootstrap-personas

Test-Personas fur Entwicklung und Test einrichten.

**Auth**: Keine
