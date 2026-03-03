# RBAC-Berechtigungsmatrix

Dieses Dokument bietet eine vollstaendige Referenz fuer das rollenbasierte Zugriffskontrollsystem (RBAC) in QDesigner Modern. Es behandelt jeden API-Endpunkt, die Rollenhierarchie und die Autorisierungspruefungen, die sowohl auf Anwendungs- als auch auf Datenbankebene durchgesetzt werden.

## Rollenhierarchie

### Organisationsrollen

Rollen sind nach Berechtigungsstufe geordnet. Eine hoehere Rolle erbt alle Berechtigungen niedrigerer Rollen.

| Stufe | Rolle    | Beschreibung                                           |
|-------|----------|--------------------------------------------------------|
| 4     | `owner`  | Volle Kontrolle. Kann die Organisation loeschen.       |
| 3     | `admin`  | Mitglieder, Einladungen, Einstellungen verwalten. Kann Organisation nicht loeschen. |
| 2     | `member` | Projekte, Frageboegen erstellen. Daten lesen/schreiben.|
| 1     | `viewer` | Nur-Lese-Zugriff auf Organisationsressourcen.          |

### Projektrollen

| Stufe | Rolle    | Beschreibung                                           |
|-------|----------|--------------------------------------------------------|
| 4     | `owner`  | Volle Kontrolle ueber das Projekt.                     |
| 3     | `admin`  | Projektmitglieder verwalten. Kann Projekt nicht loeschen. |
| 2     | `editor` | Frageboegen bearbeiten, Daten einsehen.                |
| 1     | `viewer` | Nur-Lese-Zugriff auf Projektressourcen.                |

### Rollenvererbung

Organisationsrollen kaskadieren auf Projekte:
- Org `owner`/`admin` haben impliziten Admin-Level-Zugriff auf alle Projekte in der Organisation.
- Org `member`/`viewer` koennen Projekte einsehen, benoetigen aber explizite Projektrollen fuer Schreibzugriff.
- Projektrollen werden zuerst geprueft; bei unzureichenden Rechten wird auf Organisationsrollen zurueckgefallen.

## API-Endpunkt-Berechtigungsmatrix

### Legende

| Symbol | Bedeutung |
|--------|-----------|
| J      | Erlaubt   |
| --     | Verweigert |
| Pub    | Oeffentlich (keine Authentifizierung erforderlich) |
| Opt    | Optionale Authentifizierung (anonyme Teilnehmer bei veroeffentlichten Frageboegen erlaubt) |

---

### Authentifizierungsendpunkte (`/api/auth/*`)

| Endpunkt                          | Methode | Unauth | Jeder Benutzer |
|-----------------------------------|---------|--------|----------------|
| `/api/auth/register`              | POST    | Pub    | Pub            |
| `/api/auth/login`                 | POST    | Pub    | Pub            |
| `/api/auth/refresh`               | POST    | Pub    | Pub            |
| `/api/auth/logout`                | POST    | --     | J              |
| `/api/auth/me`                    | GET     | --     | J              |
| `/api/auth/verify-email`          | POST    | Pub    | Pub            |
| `/api/auth/verify-email/send`     | POST    | Pub    | Pub            |
| `/api/auth/verify-email/verify`   | POST    | Pub    | Pub            |
| `/api/auth/verify-email/resend`   | POST    | Pub    | Pub            |
| `/api/auth/password-reset`        | POST    | Pub    | Pub            |

### Benutzerprofil (`/api/users/*`)

| Endpunkt         | Methode | Unauth | Viewer | Member | Editor | Admin | Owner |
|------------------|---------|--------|--------|--------|--------|-------|-------|
| `/api/users/me`  | GET     | --     | J      | J      | J      | J     | J     |
| `/api/users/me`  | PATCH   | --     | J      | J      | J      | J     | J     |

Benutzer koennen nur ihr eigenes Profil lesen/aktualisieren.

### Organisationen (`/api/organizations/*`)

| Endpunkt                                         | Methode | Unauth | Viewer | Member | Admin | Owner |
|--------------------------------------------------|---------|--------|--------|--------|-------|-------|
| `/api/organizations`                             | GET     | --     | J      | J      | J     | J     |
| `/api/organizations`                             | POST    | --     | J      | J      | J     | J     |
| `/api/organizations/{id}`                        | GET     | --     | J      | J      | J     | J     |
| `/api/organizations/{id}`                        | PATCH   | --     | --     | --     | J     | J     |
| `/api/organizations/{id}`                        | DELETE  | --     | --     | --     | --    | J     |
| `/api/organizations/{id}/members`                | GET     | --     | J      | J      | J     | J     |
| `/api/organizations/{id}/members`                | POST    | --     | --     | --     | J     | J     |
| `/api/organizations/{id}/members/{user_id}`      | DELETE  | --     | --     | --     | J     | J     |
| `/api/organizations/{id}/invitations`            | GET     | --     | --     | --     | J     | J     |
| `/api/organizations/{id}/invitations`            | POST    | --     | --     | --     | J     | J     |
| `/api/organizations/{id}/invitations/{inv_id}`   | DELETE  | --     | --     | --     | J     | J     |

Hinweise:
- `GET /api/organizations` gibt nur Organisationen zurueck, in denen der Benutzer aktives Mitglied ist.
- `GET /api/organizations/{id}` erfordert aktive Mitgliedschaft in der Organisation.
- Das Erstellen einer Organisation macht den Ersteller zum `owner`.
- Nur `owner` kann die `owner`-Rolle anderen Mitgliedern zuweisen.
- Der letzte Owner einer Organisation kann nicht entfernt werden.
- Rollenwerte werden validiert: muss `owner`, `admin`, `member` oder `viewer` sein.

### Einladungen (`/api/invitations/*`)

| Endpunkt                          | Methode | Unauth | Jeder Benutzer (eigene E-Mail) |
|-----------------------------------|---------|--------|-------------------------------|
| `/api/invitations/pending`        | GET     | --     | J                             |
| `/api/invitations/{id}/accept`    | POST    | --     | J                             |
| `/api/invitations/{id}/decline`   | POST    | --     | J                             |

Hinweise:
- Benutzer koennen nur Einladungen sehen/annehmen/ablehnen, die an ihre eigene E-Mail gesendet wurden.
- Einladungen werden gegen die E-Mail des authentifizierten Benutzers verifiziert.

### Projekte (`/api/projects/*`)

| Endpunkt                                  | Methode | Unauth | Org Viewer | Org Member | Org Admin | Org Owner |
|-------------------------------------------|---------|--------|------------|------------|-----------|-----------|
| `/api/projects`                           | GET     | --     | J          | J          | J         | J         |
| `/api/projects`                           | POST    | --     | --         | J          | J         | J         |
| `/api/projects/{id}`                      | GET     | --     | J          | J          | J         | J         |
| `/api/projects/{id}`                      | PATCH   | --     | --         | --*        | J         | J         |
| `/api/projects/{id}`                      | DELETE  | --     | --         | --         | J         | J         |
| `/api/projects/{id}/members`              | GET     | --     | J          | J          | J         | J         |
| `/api/projects/{id}/members`              | POST    | --     | --         | --*        | J         | J         |
| `/api/projects/{id}/members/{uid}`        | PATCH   | --     | --         | --*        | J         | J         |
| `/api/projects/{id}/members/{uid}`        | DELETE  | --     | --         | --*        | J         | J         |

*Projektrollen gelten ebenfalls: Projekt-`editor`+ kann PATCH ausfuehren, Projekt-`admin`+ kann Mitglieder verwalten, Projekt-`owner` oder Org-`admin`+ kann loeschen.

Hinweise:
- `GET /api/projects` gibt nur Projekte in Organisationen zurueck, in denen der Benutzer aktives Mitglied ist.
- Das Erstellen eines Projekts erfordert die Rolle `member`+ in der Zielorganisation.
- Der Projektersteller wird zum Projekt-`owner`.
- Rollenwerte validiert: muss `owner`, `admin`, `editor` oder `viewer` sein.

### Frageboegen (`/api/projects/{id}/questionnaires/*`)

| Endpunkt                                                   | Methode | Unauth | Org Viewer | Proj Editor | Org Admin | Proj/Org Owner |
|------------------------------------------------------------|---------|--------|------------|-------------|-----------|----------------|
| `/api/projects/{id}/questionnaires`                        | GET     | --     | J          | J           | J         | J              |
| `/api/projects/{id}/questionnaires`                        | POST    | --     | --         | J           | J         | J              |
| `/api/projects/{id}/questionnaires/{qid}`                  | GET     | --     | J          | J           | J         | J              |
| `/api/projects/{id}/questionnaires/{qid}`                  | PATCH   | --     | --         | J           | J         | J              |
| `/api/projects/{id}/questionnaires/{qid}`                  | DELETE  | --     | --         | J           | J         | J              |
| `/api/projects/{id}/questionnaires/{qid}/publish`          | POST    | --     | --         | J           | J         | J              |
| `/api/projects/{id}/questionnaires/{qid}/export`           | GET     | --     | J          | J           | J         | J              |

Hinweise:
- Lesezugriff erfordert Organisationsmitgliedschaft (ueber `verify_project_access`).
- Schreibzugriff erfordert Projekt-Level `editor`+-Rolle ODER Org-Level `admin`+-Rolle (ueber `verify_project_write_access`).
- Frageboegen sind durch `project_id` in Abfragen begrenzt, was projektuebergreifenden Zugriff verhindert.

### Oeffentlicher Fragebogenzugriff

| Endpunkt                              | Methode | Unauth | Jeder Benutzer |
|---------------------------------------|---------|--------|----------------|
| `/api/questionnaires/by-code/{code}`  | GET     | Pub    | Pub            |

Hinweise:
- Gibt nur veroeffentlichte Frageboegen zurueck.
- Der Code besteht aus den ersten 8 Hex-Zeichen der Fragebogen-UUID.
- Gibt 404 fuer unveroeffentlichte oder geloeschte Frageboegen zurueck.

### Sitzungen (`/api/sessions/*`)

| Endpunkt                              | Methode | Unauth | Teilnehmer (Veroeffentlicht) | Org Member |
|---------------------------------------|---------|--------|------------------------------|------------|
| `/api/sessions`                       | POST    | Opt    | J                            | J          |
| `/api/sessions`                       | GET     | --     | --                           | J          |
| `/api/sessions/aggregate`             | GET     | --     | --                           | J          |
| `/api/sessions/compare`              | GET     | --     | --                           | J          |
| `/api/sessions/dashboard`             | GET     | --     | --                           | J          |
| `/api/sessions/{id}`                  | GET     | --     | --                           | J          |
| `/api/sessions/{id}`                  | PATCH   | Opt    | J                            | J          |
| `/api/sessions/{id}/responses`        | GET     | --     | --                           | J          |
| `/api/sessions/{id}/responses`        | POST    | Opt    | J                            | J          |
| `/api/sessions/{id}/events`           | GET     | --     | --                           | J          |
| `/api/sessions/{id}/events`           | POST    | Opt    | J                            | J          |
| `/api/sessions/{id}/variables`        | GET     | --     | --                           | J          |
| `/api/sessions/{id}/variables`        | POST    | Opt    | J                            | J          |

Hinweise:
- `POST /api/sessions` (erstellen): Veroeffentlichte Frageboegen erlauben anonyme Sitzungserstellung. Unveroeffentlichte erfordern Authentifizierung.
- `GET /api/sessions` erfordert Authentifizierung + `questionnaire_id`-Parameter. Verifiziert Organisationsmitgliedschaft durch die Kette Fragebogen -> Projekt -> Organisation.
- Lese-Endpunkte (`GET` auf Sitzungen, Antworten, Ereignisse, Variablen) erfordern Authentifizierung und Organisationsmitgliedschafts-Verifizierung.
- Schreib-Endpunkte (`PATCH` Sitzung, `POST` Antworten/Ereignisse/Variablen) erlauben anonymen Zugriff nur fuer veroeffentlichte Frageboegen.
- `GET /api/sessions/dashboard` erfordert Organisationsmitgliedschaft fuer die angegebene `organization_id`.
- Aggregat- und Vergleichsendpunkte erfordern Authentifizierung und verifizieren Fragebogenzugriff.

### Medien (`/api/media/*`)

| Endpunkt            | Methode | Unauth | Org Viewer | Org Member | Org Admin | Org Owner | Hochlader |
|---------------------|---------|--------|------------|------------|-----------|-----------|-----------|
| `/api/media`        | GET     | --     | J          | J          | J         | J         | J         |
| `/api/media`        | POST    | --     | --         | J          | J         | J         | --        |
| `/api/media/{id}`   | GET     | --     | J          | J          | J         | J         | J         |
| `/api/media/{id}`   | DELETE  | --     | --         | --         | J         | J         | J         |

Hinweise:
- Auflisten und Abrufen erfordert Org `viewer`+-Rolle.
- Hochladen erfordert Org `member`+-Rolle.
- Loeschen erfordert Org `admin`+-Rolle ODER Hochlader-Status.
- Medien sind durch `organization_id` an Organisationen gebunden.

### WebSocket (`/api/ws`)

| Endpunkt      | Methode | Unauth | Jeder Benutzer |
|---------------|---------|--------|----------------|
| `/api/ws`     | GET     | --     | J              |

Hinweise:
- JWT-Token wird ueber den `?token=`-Abfrageparameter uebergeben.
- Token wird vor dem WebSocket-Upgrade validiert.
- Benutzer koennen Kanaele abonnieren und Nachrichten veroeffentlichen.
- Kanalbezogene Autorisierung wird ueber die Authentifizierung hinaus nicht erzwungen.

### Gesundheitspruefungen

| Endpunkt     | Methode | Unauth | Jeder Benutzer |
|--------------|---------|--------|----------------|
| `/health`    | GET     | Pub    | Pub            |
| `/ready`     | GET     | Pub    | Pub            |

### Entwicklungshilfen (nur Debug-Modus)

| Endpunkt                         | Methode | Unauth | Jeder Benutzer |
|----------------------------------|---------|--------|----------------|
| `/api/dev/bootstrap-personas`    | POST    | Pub    | Pub            |

Hinweise:
- Nur verfuegbar bei `cfg!(debug_assertions)` oder `DEV_HELPERS_ENABLED=true`.
- In Release-Builds deaktiviert.

## Datenisolierungsarchitektur

### Fremdschluesselkette

```
Organisation
  |-- organization_members (user_id, role, status)
  |-- Projekt (organization_id FK)
        |-- project_members (user_id, role)
        |-- Fragebogen (project_id FK)
              |-- Sitzung (questionnaire_id FK)
                    |-- Antwort (session_id FK)
                    |-- Interaktionsereignis (session_id FK)
                    |-- Sitzungsvariable (session_id FK)
  |-- Medien-Asset (organization_id FK)
```

Alle Fremdschluessel verwenden `ON DELETE CASCADE`, was sicherstellt, dass das Loeschen einer uebergeordneten Entitaet alle untergeordneten Daten entfernt.

### Zugriffspruefungsmuster

Fuer die meisten Endpunkte wird der Zugriff ueber die Besitzkette verifiziert:

1. **Org-Endpunkte**: Direkter `organization_members`-Lookup.
2. **Projekt-Endpunkte**: `JOIN organization_members ON projects.organization_id`.
3. **Fragebogen-Endpunkte**: `JOIN projects -> JOIN organization_members`.
4. **Sitzungs-Lese-Endpunkte**: `JOIN questionnaire_definitions -> JOIN projects -> JOIN organization_members`.
5. **Sitzungs-Schreib-Endpunkte**: Veroeffentlichte Frageboegen erlauben anonymen Zugriff; unveroeffentlichte erfordern die Org-Mitgliedschaftskette.

### Datenbank-Level-Sicherheit (RLS)

Row-Level-Security-Richtlinien sind in `server/db/migrations/010_rls_policies.sql` definiert und spiegeln die Pruefungen auf Anwendungsebene wider:

- Benutzer koennen nur sich selbst oder Mitglieder derselben Organisation sehen.
- Organisationen sind nur fuer aktive Mitglieder sichtbar.
- Projekte sind fuer Org-Mitglieder sichtbar; beschreibbar durch Projekt-Editoren+ oder Org-Admins+.
- Frageboegen folgen den Projektzugriffsregeln.
- Sitzungen/Antworten/Ereignisse/Variablen: lesbar durch Org-Mitglieder; einfuegbar/aktualisierbar durch jeden (fuer Teilnehmer-Endpunkte).
- Medien an Organisationsmitgliedschaft gebunden.

RLS-Kontext wird ueber `set_config('app.user_id', ...)` mit parametrisierten Abfragen gesetzt (kein SQL-Injection-Risiko).

## Sicherheitsaudit-Ergebnisse (Behoben)

Die folgenden Probleme wurden identifiziert und behoben:

### Kritisch (Behoben)
1. **`GET /api/sessions`**: War voellig unauthentifiziert. Erfordert jetzt Authentifizierung + `questionnaire_id` mit Org-Mitgliedschafts-Verifizierung.
2. **`GET /api/sessions/aggregate`**: War unauthentifiziert. Erfordert jetzt Authentifizierung + Fragebogenzugriffs-Verifizierung.
3. **`GET /api/sessions/compare`**: War unauthentifiziert. Erfordert jetzt Authentifizierung + Fragebogenzugriffs-Verifizierung.
4. **`PATCH /api/sessions/{id}`**: War unauthentifiziert. Erfordert jetzt Pruefung auf veroeffentlichten Fragebogen oder Org-Mitgliedschaft.
5. **`POST /api/sessions/{id}/responses`**: War unauthentifiziert. Verifiziert jetzt Teilnehmer- oder Org-Mitglieder-Zugriff.
6. **`POST /api/sessions/{id}/events`**: War unauthentifiziert. Verifiziert jetzt Teilnehmer- oder Org-Mitglieder-Zugriff.
7. **`POST /api/sessions/{id}/variables`**: War unauthentifiziert. Verifiziert jetzt Teilnehmer- oder Org-Mitglieder-Zugriff.

### Hoch (Behoben)
8. **`GET /api/sessions/{id}`**: Hatte Authentifizierung, aber keine Besitzpruefung. Verifiziert jetzt Fragebogenzugriff ueber die Org-Kette.
9. **`GET /api/sessions/{id}/responses`**: Hatte Authentifizierung, aber keine Besitzpruefung. Verifiziert jetzt Fragebogenzugriff.
10. **`GET /api/sessions/{id}/events`**: Hatte Authentifizierung, aber keine Besitzpruefung. Verifiziert jetzt Fragebogenzugriff.
11. **`GET /api/sessions/{id}/variables`**: Hatte Authentifizierung, aber keine Besitzpruefung. Verifiziert jetzt Fragebogenzugriff.

### Mittel (Behoben)
12. **RLS-Kontext SQL-Injection**: `set_rls_context`-Middleware verwendete `format!`-Stringinterpolation fuer SQL. Verwendet jetzt parametrisierte `$1`-Bindings.
13. **Rollen-String-Validierung**: Org-Mitglieder-, Einladungs- und Projektmitglieder-Rollenfelder validieren jetzt gegen erlaubte Enum-Werte statt beliebige Strings zu akzeptieren.
14. **Owner-Rollen-Eskalation**: Nur Org-Owner koennen die `owner`-Rolle zuweisen, um Privilegien-Eskalation durch Admins zu verhindern.

### Akzeptable Design-Entscheidungen
- **WebSocket-Kanal-Autorisierung**: Derzeit kann jeder authentifizierte Benutzer in jedem Kanal veroeffentlichen. Dies ist fuer die aktuelle Echtzeit-Kollaborationsfunktionalitaet akzeptabel (alle Aenderungen erfolgen ueber REST-APIs mit korrekter Authentifizierung). Zukuenftige Verbesserung: Kanal-Level Org/Projekt-Autorisierung hinzufuegen.
- **Sitzungserstellung fuer veroeffentlichte Frageboegen**: Erlaubt absichtlich anonymen Zugriff. Dies ist der zentrale Teilnehmerablauf fuer oeffentliche Frageboegen.
- **E-Mail-Verifizierungsendpunkte**: Absichtlich oeffentlich, um den Onboarding-Ablauf zu unterstuetzen, bevor ein Benutzer eine Sitzung hat.
