# Kapitel 3: Organisationsverwaltung

Organisationen sind der uebergeordnete Container in QDesigner Modern. Jedes Projekt, jeder Fragebogen und jeder Datensatz gehoert zu einer Organisation. Dieses Kapitel erlaeutert, wie Organisationen funktionieren, wie Sie Mitglieder und Rollen verwalten und wie das Einladungssystem arbeitet.

## Mandantenfaehige Architektur

QDesigner Modern verwendet eine mandantenfaehige Architektur, bei der jede Organisation ein vollstaendig isolierter Arbeitsbereich ist:

- **Datenisolation**: Die Projekte, Frageboegen, Antworten und Medien einer Organisation sind fuer Mitglieder anderer Organisationen nicht sichtbar. Datenbankabfragen sind auf die aktiven Organisationsmitgliedschaften der Nutzerin bzw. des Nutzers beschraenkt.
- **Unabhaengige Mitgliedschaft**: Ein einzelnes Benutzerkonto kann mehreren Organisationen angehoeren. Beispielsweise koennte eine Forscherin Mitglied der Organisation ihrer Psychologieabteilung und gleichzeitig einer separaten institutionsuebergreifenden Kooperationsorganisation sein.
- **Separate Rollenzuweisungen**: Ihre Rolle in einer Organisation hat keinen Einfluss auf Ihre Rolle in einer anderen. Sie koennten Eigentuemerin in der Organisation Ihres Labors und Betrachterin in der Organisation eines Kooperationspartners sein.

Organisationen werden intern durch eine UUID und extern durch einen menschenlesbaren Slug identifiziert, der vom Organisationsnamen abgeleitet wird. Beispielsweise erhaelt eine Organisation mit dem Namen "Labor fuer Kognitionswissenschaft" den Slug `labor-fuer-kognitionswissenschaft`.

## Organisation erstellen

Organisationen koennen in zwei Kontexten erstellt werden:

### Waehrend des Onboardings

Wenn Sie sich bei QDesigner Modern registrieren und keiner Organisation angehoeren (und keine ausstehenden Einladungen haben), werden Sie automatisch zur Organisations-Onboarding-Seite geleitet. Geben Sie Ihren Organisationsnamen ein und klicken Sie auf "Create Organization." Sie werden Eigentuemerin bzw. Eigentuemer der neuen Organisation.

### Vom Dashboard aus

Authentifizierte Nutzerinnen und Nutzer, die bereits mindestens einer Organisation angehoeren, koennen ueber die Anwendungseinstellungen weitere Organisationen erstellen.

Bei der Erstellung einer Organisation geben Sie an:

| Feld | Pflicht | Beschreibung |
|------|---------|--------------|
| **Name** | Ja | Der Anzeigename (1--255 Zeichen). Beispiel: "Abteilung Verhaltensforschung" |
| **Slug** | Nein | URL-freundlicher Bezeichner. Wird automatisch aus dem Namen generiert, falls nicht angegeben. Muss plattformweit eindeutig sein. |
| **Domain** | Nein | Eine E-Mail-Domaene fuer automatischen Beitritt (z.B. `uni-muenchen.de`). Nutzerinnen und Nutzer, die sich mit dieser Domaene registrieren, koennen der Organisation automatisch beitreten. |
| **Logo-URL** | Nein | URL zu einem Organisationslogo fuer das Branding. |

Die Person, die die Organisation erstellt, wird automatisch als Mitglied mit der Rolle **Eigentuemer** hinzugefuegt.

> **Tipp:** Waehlen Sie Ihren Organisationsnamen sorgfaeltig. Er kann zwar spaeter von Eigentuemern und Administratoren geaendert werden, der Slug (verwendet in URLs) wird jedoch zum Erstellungszeitpunkt generiert.

## Organisationseinstellungen

Eigentuemer und Administratoren koennen folgende Organisationseigenschaften aktualisieren:

- **Name**: Der Anzeigename, der auf der gesamten Plattform angezeigt wird.
- **Domain**: Die E-Mail-Domaene fuer automatische Mitgliederaufnahme. Wenn gesetzt, sehen Nutzerinnen und Nutzer, die sich mit einer E-Mail-Adresse dieser Domaene registrieren, einen Hinweis, dass sie der Organisation automatisch beitreten werden.
- **Logo-URL**: Ein Link zum Logo-Bild der Organisation.
- **Einstellungen**: Ein flexibles JSON-Einstellungsobjekt fuer plattformweite Konfiguration.

Das Backend validiert, dass die anfragende Person mindestens die Administratorrolle hat, bevor Aenderungen angewendet werden.

> **Hinweis:** Nur Eigentuemer koennen eine Organisation loeschen. Das Loeschen ist ein weiches Loeschen -- der Organisationsdatensatz wird mit einem `deleted_at`-Zeitstempel markiert, die Daten bleiben jedoch in der Datenbank fuer Wiederherstellungszwecke erhalten.

## Mitgliederverwaltung

### Mitglieder anzeigen

Alle Organisationsmitglieder koennen die Mitgliederliste einsehen. Navigieren Sie zur Mitgliederverwaltung Ihrer Organisation, um eine Tabelle zu sehen mit:

| Spalte | Beschreibung |
|--------|-------------|
| **Name** | Der vollstaendige Name des Mitglieds (sofern hinterlegt) |
| **E-Mail** | Die E-Mail-Adresse des Mitglieds |
| **Rolle** | Eigentuemer, Administrator, Mitglied oder Betrachter |
| **Status** | Aktiv oder Inaktiv |
| **Beitritt** | Das Datum, an dem das Mitglied der Organisation beigetreten ist |

Mitglieder sind nach Beitrittsdatum sortiert, wobei die fruehesten Mitglieder (typischerweise die Gruender) zuerst aufgefuehrt werden.

### Mitglieder hinzufuegen

Administratoren und Eigentuemer koennen neue Mitglieder zur Organisation hinzufuegen. Es gibt zwei Methoden:

#### Direktes Hinzufuegen

Wenn die Person, die Sie hinzufuegen moechten, bereits ein QDesigner-Modern-Konto hat, koennen Sie sie direkt hinzufuegen:

1. Navigieren Sie zur Mitgliederverwaltung.
2. Geben Sie die E-Mail-Adresse der Person ein.
3. Waehlen Sie eine Rolle (Administrator, Mitglied oder Betrachter -- die Eigentuemerrolle kann ueber diese Oberflaeche nicht direkt zugewiesen werden).
4. Senden Sie das Formular ab.

Das System sucht den Benutzer anhand der E-Mail-Adresse. Wird er gefunden, wird er sofort mit der angegebenen Rolle zur Organisation hinzugefuegt. Wenn die E-Mail-Adresse nicht auf der Plattform registriert ist, wird ein Fehler zurueckgegeben.

#### Einladung (empfohlen)

Fuer Personen, die moeglicherweise noch kein Konto haben, verwenden Sie das Einladungssystem (weiter unten im Detail beschrieben). Dieses sendet eine E-Mail-Einladung, die die empfangende Person nach der Registrierung annehmen kann.

### Rolle eines Mitglieds aendern

Administratoren und Eigentuemer koennen die Rolle eines Mitglieds aendern, indem sie den Mitgliedschaftsdatensatz aktualisieren. Die verfuegbaren Organisationsrollen sind:

- **Eigentuemer**
- **Administrator**
- **Mitglied**
- **Betrachter**

Rollenaenderungen werden sofort wirksam. Das Backend stellt sicher, dass Rollenmodifikationen mindestens Administratorrechte erfordern.

### Mitglieder entfernen

Administratoren und Eigentuemer koennen Mitglieder aus der Organisation entfernen:

1. Navigieren Sie zur Mitgliederverwaltung.
2. Waehlen Sie das zu entfernende Mitglied aus.
3. Bestaetigen Sie die Entfernung.

Die Zuordnung des Mitglieds zur Organisation wird geloescht. Es verliert den Zugriff auf alle Projekte und Frageboegen innerhalb der Organisation.

**Wichtige Schutzfunktion**: Das System verhindert das Entfernen des letzten Eigentuemers einer Organisation. Gibt es nur einen Eigentuemer, kann dieser nicht entfernt werden, bis ein anderes Mitglied zum Eigentuemer befoerdert wurde. Dies verhindert verwaiste Organisationen.

> **Hinweis:** Das Entfernen eines Mitglieds loescht nicht dessen Benutzerkonto. Es kann weiterhin auf andere Organisationen zugreifen, denen es angehoert, und kann spaeter erneut zur Organisation hinzugefuegt werden.

## Rollenhierarchie

QDesigner Modern setzt auf Organisationsebene eine vierstufige Rollenhierarchie durch. Hoehere Rollen erben alle Berechtigungen niedrigerer Rollen.

### Eigentuemer

Die Eigentuemerrolle ist die hoechste Berechtigungsstufe. Eigentuemer koennen:

- Alle Aktionen ausfuehren, die Administratoren, Mitgliedern und Betrachtern zur Verfuegung stehen
- Die Organisation loeschen (weiches Loeschen)
- Die Eigentuemerschaft uebertragen (indem ein anderes Mitglied zum Eigentuemer befoerdert wird)
- Abrechnungs- und Abonnementeinstellungen verwalten (sofern zutreffend)

Jede Organisation muss mindestens einen Eigentuemer haben. Die Person, die die Organisation erstellt, erhaelt automatisch diese Rolle.

### Administrator

Administratoren verwalten den laufenden Betrieb der Organisation:

- Organisationseinstellungen aktualisieren (Name, Domaene, Logo)
- Mitglieder hinzufuegen und entfernen
- Mitgliederrollen aendern (bis zur Administratorebene)
- Einladungen erstellen und verwalten (senden, anzeigen, widerrufen)
- Projekte innerhalb der Organisation erstellen
- Vollzugriff auf alle Projekte und Frageboegen

### Mitglied

Mitglieder sind aktive Teilnehmende, die zur Forschung beitragen koennen:

- Organisationsdetails und Mitgliederliste einsehen
- Projekte innerhalb der Organisation erstellen
- Auf zugewiesene Projekte zugreifen
- Frageboegen in zugewiesenen Projekten erstellen und bearbeiten

### Betrachter

Betrachter haben Nur-Lese-Zugriff:

- Organisationsdetails und Mitgliederliste einsehen
- Zugewiesene Projekte und Frageboegen einsehen
- Koennen keine Ressourcen erstellen, bearbeiten oder loeschen

## Berechtigungsmatrix

Die folgende Tabelle fasst zusammen, welche Aktionen jede Organisationsrolle ausfuehren kann:

| Aktion | Eigentuemer | Administrator | Mitglied | Betrachter |
|--------|-------------|---------------|----------|------------|
| Organisationsdetails anzeigen | Ja | Ja | Ja | Ja |
| Mitgliederliste anzeigen | Ja | Ja | Ja | Ja |
| Organisationseinstellungen aendern | Ja | Ja | Nein | Nein |
| Organisation loeschen | Ja | Nein | Nein | Nein |
| Mitglieder hinzufuegen | Ja | Ja | Nein | Nein |
| Mitglieder entfernen | Ja | Ja | Nein | Nein |
| Mitgliederrollen aendern | Ja | Ja | Nein | Nein |
| Einladungen senden | Ja | Ja | Nein | Nein |
| Einladungen widerrufen | Ja | Ja | Nein | Nein |
| Einladungen anzeigen | Ja | Ja | Nein | Nein |
| Projekte erstellen | Ja | Ja | Ja | Nein |
| Auf alle Projekte zugreifen | Ja | Ja | Nein | Nein |
| Auf zugewiesene Projekte zugreifen | Ja | Ja | Ja | Ja |

> **Hinweis:** Diese Berechtigungen werden serverseitig im Rust-Backend durchgesetzt. Die Frontend-Oberflaeche blendet Steuerelemente aus, fuer die der Nutzerin bzw. dem Nutzer die Berechtigung fehlt, aber das Backend validiert jede Anfrage unabhaengig. Das bedeutet: Selbst wenn ein UI-Element faelschlicherweise angezeigt wuerde, wuerde der Server unautorisierte Operationen ablehnen.

## Das Einladungssystem

Der Einladungsworkflow ermoeglicht es Administratoren und Eigentuemern, Personen zur Organisation einzuladen, auch wenn die eingeladene Person noch kein QDesigner-Modern-Konto hat.

### Einladung senden

1. Navigieren Sie zur Einladungsverwaltung Ihrer Organisation.
2. Geben Sie die E-Mail-Adresse der einzuladenden Person ein.
3. Waehlen Sie die Rolle, die die Person bei Beitritt erhalten soll (Administrator, Mitglied oder Betrachter).
4. Senden Sie die Einladung ab.

Das System erstellt einen Einladungsdatensatz mit folgenden Eigenschaften:

| Eigenschaft | Wert |
|-------------|------|
| **E-Mail** | Die E-Mail-Adresse der eingeladenen Person |
| **Rolle** | Die zugewiesene Rolle |
| **Eingeladen von** | Die UUID der einladenden Person |
| **Erstellt am** | Zeitstempel der Einladungserstellung |
| **Lauft ab am** | 7 Tage nach Erstellung |
| **Status** | Ausstehend |

Eine E-Mail-Benachrichtigung wird (in Produktivumgebungen) an die eingeladene Person gesendet.

### Ausstehende Einladungen anzeigen

Administratoren und Eigentuemer koennen alle ausstehenden Einladungen fuer ihre Organisation einsehen. Die Einladungsliste zeigt:

- E-Mail-Adresse der eingeladenen Person
- Zugewiesene Rolle
- Wer die Einladung gesendet hat
- Erstellungsdatum
- Ablaufdatum

Es werden nur Einladungen angezeigt, die ausstehend sind (noch nicht angenommen, abgelehnt oder widerrufen) und nicht abgelaufen.

### Einladung annehmen

Eingeladene Personen erhalten ihre ausstehenden Einladungen in folgenden Kontexten:

1. **Waehrend der Registrierung**: Wenn sich die eingeladene Person mit der E-Mail-Adresse registriert, an die die Einladung gesendet wurde, zeigt die Registrierungsseite ein Banner mit der Anzahl ausstehender Einladungen.

2. **Waehrend des Onboardings**: Wenn sich die eingeladene Person registriert und keine bestehende Organisation hat, zeigt die Onboarding-Seite Einladungskarten, die direkt angenommen werden koennen.

3. **Ueber die API fuer ausstehende Einladungen**: Authentifizierte Nutzerinnen und Nutzer koennen ihre ausstehenden Einladungen ueber den Endpunkt `/api/invitations/pending` abfragen.

Um eine Einladung anzunehmen:

1. Klicken Sie auf "Accept & Join" auf der Einladungskarte.
2. Der Einladungsstatus wechselt zu "angenommen" mit einem `accepted_at`-Zeitstempel.
3. Die Person wird mit der in der Einladung festgelegten Rolle als Mitglied zur Organisation hinzugefuegt.
4. War die Person zuvor Mitglied (und wurde entfernt), wird die Mitgliedschaft mit der neuen Rolle reaktiviert.

### Einladung ablehnen

Wenn die eingeladene Person der Organisation nicht beitreten moechte:

1. Die eingeladene Person ruft den Ablehnungs-Endpunkt fuer die spezifische Einladung auf.
2. Der Einladungsstatus wechselt zu "abgelehnt" mit einem `declined_at`-Zeitstempel.
3. Es wird keine Organisationsmitgliedschaft erstellt.

Die Administratoren der einladenden Organisation koennen sehen, dass die Einladung abgelehnt wurde.

### Einladung widerrufen

Administratoren und Eigentuemer koennen eine ausstehende Einladung widerrufen, bevor sie angenommen oder abgelehnt wird:

1. Navigieren Sie zur Einladungsliste.
2. Waehlen Sie die zu widerrufende Einladung.
3. Bestaetigen Sie den Widerruf.

Der Einladungsstatus wechselt zu "widerrufen." Die eingeladene Person kann die Einladung nicht mehr annehmen.

> **Hinweis:** Der Widerruf funktioniert nur bei ausstehenden Einladungen. Wurde eine Einladung bereits angenommen oder abgelehnt, kann sie nicht mehr widerrufen werden.

### Ablauf von Einladungen

Einladungen laufen 7 Tage nach Erstellung ab. Abgelaufene Einladungen koennen nicht angenommen werden. Benoetigt die eingeladene Person nach Ablauf Zugang, muss eine neue Einladung gesendet werden.

Das System filtert abgelaufene Einladungen automatisch bei der Anzeige ausstehender Einladungen heraus, sodass weder die Organisation noch die eingeladene Person veraltete Eintraege sehen.

## Domaenbasierter automatischer Beitritt

Organisationen koennen eine Domaene fuer die automatische Mitgliederaufnahme konfigurieren:

1. Ein Eigentuemer oder Administrator legt die Domaene der Organisation fest (z.B. `uni-muenchen.de`).
2. Wenn sich eine neue Person mit einer E-Mail-Adresse dieser Domaene registriert (z.B. `forscherin@uni-muenchen.de`), zeigt das Registrierungsformular ein Banner: "You'll automatically join [Organisationsname]. Your organization has pre-approved all @uni-muenchen.de addresses."
3. Nach Abschluss der Registrierung und E-Mail-Verifizierung wird die Person automatisch zur Organisation hinzugefuegt.

Diese Funktion vereinfacht das Onboarding fuer grosse Institutionen, bei denen das manuelle Einladen jeder einzelnen Person unpraktikabel waere.

> **Tipp:** Der domaenbasierte automatische Beitritt ist besonders nuetzlich fuer Universitaetsabteilungen und Forschungsinstitute, deren Mitglieder alle eine institutionelle E-Mail-Domaene teilen. Er reduziert den Verwaltungsaufwand fuer die individuelle Einladung jedes Teammitglieds.

## Administrationsseiten

Eigentuemer und Administratoren haben Zugang zu dedizierten Administrationsseiten fuer die Verwaltung der Organisation.

### Admin-Einstellungsseite

Die Admin-Einstellungsseite bietet eine zentrale Oberflaeche zur Konfiguration organisationsweiter Eigenschaften. Sie ist ueber das Organisationsnavigationsmenue zugaenglich und ermoeglicht Eigentuemern und Administratoren:

- Organisationsname, Domaene und Logo aktualisieren
- Plattformweite Einstellungen konfigurieren (gespeichert als flexibles JSON-Objekt)
- Organisations-Slug und Erstellungsdatum einsehen
- Die Organisation loeschen (nur Eigentuemer, weiches Loeschen)

Aenderungen werden serverseitig validiert: Das Backend bestaetigt, dass die anfragende Person mindestens die Administratorrolle innehat, bevor Aenderungen angewendet werden.

### Benutzerverwaltungsseite

Die Benutzerverwaltungsseite bietet eine vollstaendige Uebersicht aller Organisationsmitglieder und ihrer Rollen. Von dieser Seite aus koennen Administratoren und Eigentuemer:

- Alle Mitglieder in einer sortierbaren, filterbaren Tabelle einsehen (Name, E-Mail, Rolle, Status, Beitrittsdatum)
- Neue Mitglieder per E-Mail-Adresse mit Rollenauswahl hinzufuegen
- Rollen bestehender Mitglieder aendern (bis zur Administratorebene fuer Administratoren, jede Ebene fuer Eigentuemer)
- Mitglieder aus der Organisation entfernen (mit der Schutzfunktion, dass der letzte Eigentuemer nicht entfernt werden kann)
- Ausstehende Einladungen anzeigen und verwalten
- Neue Einladungen mit Rollenzuweisungen senden

Die Seite setzt dieselben Berechtigungsregeln durch, die in den Abschnitten Rollenhierarchie und Berechtigungsmatrix oben beschrieben sind: Nur Administratoren und Eigentuemer koennen die Mitgliedschaft modifizieren, und alle Aktionen werden serverseitig validiert.

## Best Practices fuer die Organisationsverwaltung

1. **Beginnen Sie mit einer klaren Namenskonvention**: Verwenden Sie einen Namen, der Ihre Forschungsgruppe innerhalb der Plattform eindeutig identifiziert. Vermeiden Sie generische Namen wie "Forschungslabor", die mit anderen Gruppen in Konflikt geraten koennten.

2. **Weisen Sie Rollen bewusst zu**: Nicht jede Person muss Administrator sein. Gewaehren Sie die minimale Rolle, die fuer die jeweiligen Aufgaben erforderlich ist. Forschende, die nur Frageboegen erstellen muessen, sollten Mitglieder sein. Externe Gutachtende sollten Betrachter sein.

3. **Verwenden Sie Einladungen statt direktem Hinzufuegen**: Einladungen erzeugen eine nachvollziehbare Spur und geben der eingeladenen Person die Wahl, anzunehmen oder abzulehnen. Das direkte Hinzufuegen ist unmittelbar, verzichtet aber auf diesen Zustimmungsschritt.

4. **Ueberpruefen Sie die Mitgliedschaft regelmaessig**: Wenn Teammitglieder das Labor verlassen oder ihren Abschluss machen, entfernen Sie deren Zugang, um die Datensicherheit zu gewaehrleisten.

5. **Konfigurieren Sie den domaenbasierten automatischen Beitritt fuer Institutionen**: Wenn Ihre gesamte Abteilung die Plattform nutzt, entfaellt durch den automatischen Beitritt die Notwendigkeit, jede Person manuell einzuladen.

6. **Halten Sie mindestens zwei Eigentuemer vor**: Ein einzelner Eigentuemer stellt einen Single Point of Failure dar. Wenn diese Person das Team verlaesst oder den Zugang verliert, kann niemand Aktionen auf Eigentuemereben durchfuehren. Befoerdern Sie eine vertrauenswuerdige Kollegin oder einen vertrauenswuerdigen Kollegen zum Mit-Eigentuemer als Absicherung.
