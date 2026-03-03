# Kapitel 14: Zusammenarbeit

Echtzeit-Kollaboration, Versionskontrolle und Team-Workflows in QDesigner Modern.

---

## 14.1 Uberblick

QDesigner Modern bietet ein umfassendes Kollaborationssystem, das es mehreren Forschern ermoglicht, gleichzeitig am selben Fragebogen zu arbeiten. Das System besteht aus vier miteinander verbundenen Teilsystemen:

1. **Versionskontrolle** -- Branching, Versionierung und Zusammenfuhrung von Fragebogendefinitionen.
2. **Operational Transformation (OT)** -- Konfliktfreie gleichzeitige Bearbeitung in Echtzeit.
3. **Prasenz und Awareness** -- Live-Cursors, Selektionen und Aktivitatsindikatoren.
4. **Kommentare** -- Diskussionsstrange, die an bestimmte Elemente verankert sind.

Alle Kollaborationsfunktionen kommunizieren uber WebSocket-Verbindungen zum Server-Endpunkt `GET /api/ws`, der von HTTP zum WebSocket-Protokoll hochgestuft wird.

---

## 14.2 Versionskontrolle

Das Versionskontrollsystem (`VersionControl.ts`) verwaltet die Anderungshistorie von Fragebogen in einer von Git inspirierten Weise. Jeder Fragebogen kann mehrere Branches haben, die jeweils eine lineare Sequenz von Versionen enthalten.

### Versionen erstellen

Eine Version ist ein Schnappschuss des gesamten Fragebogenzustands zu einem Zeitpunkt. Jede Version zeichnet auf:

- **id**: Ein eindeutiger Bezeichner (z.B. `v3_1709312400000`).
- **questionnaireId**: Der Fragebogen, zu dem diese Version gehort.
- **version**: Die sequenzielle Versionsnummer auf ihrem Branch.
- **content**: Der vollstandig serialisierte Fragebogeninhalt.
- **operations**: Die Liste der Operationen, die diese Version aus der vorherigen erzeugt haben.
- **createdBy**: Der Benutzer, der die Version erstellt hat.
- **message**: Eine optionale menschenlesbare Beschreibung.
- **parentVersion**: Die ID der vorhergehenden Version.
- **branchName**: Zu welchem Branch diese Version gehort.

Versionen werden automatisch beim Speichern von Anderungen erstellt oder manuell, wenn ein Forscher einen benannten Checkpoint erstellen mochte.

### Versionshistorie abrufen

Die Methode `getVersionHistory()` gibt zuruck:

```typescript
{
  versions: Version[];    // Alle Versionen, neueste zuerst
  branches: Branch[];     // Alle aktiven Branches
  currentBranch: string;  // Der aktuell aktive Branch-Name
}
```

Die **VersionHistory**-Komponente in der Designer-Seitenleiste stellt diese Daten als Zeitlinie dar, die fur jede Version Autor, Zeitstempel, Nachricht und eine Zusammenfassung der Anderungen zeigt.

### Fruhere Version wiederherstellen

Um einen Fragebogen in einen fruheren Zustand zuruckzuversetzen, rufen Sie `restoreToVersion(versionId)` auf. Dies deserialisiert den gespeicherten Inhalt und gibt ein vollstandiges `Questionnaire`-Objekt zuruck, das den aktuellen Arbeitszustand ersetzen kann. Der Wiederherstellungsvorgang loscht keine Versionen -- er erstellt eine neue Version mit dem wiederhergestellten Inhalt und bewahrt die vollstandige Historie.

### Versionen loschen

Versionen konnen mit `deleteVersion(versionId)` geloscht werden, aber nur wenn:

1. Keine andere Version sie als Elternversion referenziert.
2. Sie nicht der Head eines aktiven Branches ist.

Dies verhindert die Verwaistung des Versionsgrafen. Fur die Bereinigung entfernt `cleanupVersions(questionnaireId, keepCount)` die altesten Versionen uber die angegebene Aufbewahrungsanzahl hinaus (Standard: 50).

---

## 14.3 Branching

Branches ermoglichen parallele Entwicklungslinien innerhalb eines einzelnen Fragebogens. Der Standard-Branch ist `main`.

### Einen Branch erstellen

```typescript
versionControl.createBranch(
  questionnaireId,   // Welcher Fragebogen
  'experiment-v2',   // Branch-Name
  baseVersionId,     // Ausgangspunkt
  userId,            // Ersteller
  'Test einer alternativen Fragenreihenfolge'  // Optionale Beschreibung
);
```

Ein Branch speichert:

- **baseVersion**: Die Version, bei der der Branch abzweigte.
- **headVersion**: Die neueste Version auf dem Branch (anfanglich identisch mit baseVersion).
- **isDefault**: Ob dies der Standard-Branch ist.
- **isActive**: Ob der Branch noch in Verwendung ist.

### Zwischen Branches wechseln

Das Wechseln von Branches ladt die Head-Version des Ziel-Branches in den Editor. Die VersionHistory-Komponente zeigt ein Branch-Auswahl-Dropdown.

### Branches loschen

Das Loschen eines Branches markiert ihn als `isActive = false`, anstatt ihn aus dem Speicher zu entfernen. Dies bewahrt die Historie und ermoglicht eine Wiederherstellung. Der Standard-Branch kann nicht geloscht werden.

---

## 14.4 Diff-Ansicht

Die Methode `generateDiff(fromVersionId, toVersionId)` berechnet die Unterschiede zwischen zwei beliebigen Versionen:

```typescript
interface VersionDiff {
  fromVersion: string;
  toVersion: string;
  operations: Operation[];
  summary: {
    questionsAdded: number;
    questionsModified: number;
    questionsDeleted: number;
    pagesAdded: number;
    pagesModified: number;
    pagesDeleted: number;
    variablesAdded: number;
    variablesModified: number;
    variablesDeleted: number;
  };
  conflicts?: Conflict[];
}
```

Die Zusammenfassung bietet einen schnellen numerischen Uberblick, wahrend das `operations`-Array die detaillierte Liste der Einfuge-, Losch-, Aktualisierungs-, Verschiebungs- und Neuordnungsoperationen enthalt.

Fur Branch-spezifische Diffs berechnet `generateBranchDiff(questionnaireId, branchName)` den Diff zwischen der Basisversion eines Branches und seinem aktuellen Head.

---

## 14.5 Operational Transformation

Wenn mehrere Benutzer denselben Fragebogen gleichzeitig bearbeiten, konnen ihre Operationen in Konflikt geraten. Die Operational-Transformation-Engine (`OperationalTransform.ts`) lost diese Konflikte automatisch auf.

### Operationstypen

Das OT-System verarbeitet funf Operationstypen:

| Typ | Beschreibung | Wichtige Felder |
|---|---|---|
| `insert` | Ein Element hinzufugen | `position`, `content`, `target` (question/page/variable/option/block) |
| `delete` | Ein Element entfernen | `position`, `length`, `target` |
| `update` | Eine Eigenschaft andern | `property`, `oldValue`, `newValue` |
| `move` | Ein Element verschieben | `fromPath`, `toPath`, `fromPosition`, `toPosition` |
| `reorder` | Elemente neu anordnen | `indices`, `newIndices` |

Jede Operation enthalt einen `path` (ein Array von Strings, das den verschachtelten Ort im Fragebogenbaum identifiziert), eine `userId` und einen `timestamp`.

### Transformationsalgorithmus

Wenn Benutzer A und Benutzer B beide Operationen basierend auf derselben Dokumentversion einreichen, transformiert der Server die eine gegen die andere, sodass beide sequenziell angewendet werden konnen:

1. **Pfadunabhangigkeit**: Wenn zwei Operationen verschiedene Pfade im Fragebogenbaum betreffen, ist keine Transformation notig.
2. **Insert-Insert**: Wenn beide Operationen an derselben Position einfugen, bestimmt die Zeitstempel-Reihenfolge, welche zuerst kommt. Die Position der spateren Einfugung wird um 1 erhoht.
3. **Insert-Delete**: Wenn eine Einfugung in einen geloschten Bereich fallt, wird sie an den Anfang des geloschten Bereichs verschoben. Fallt sie nach dem geloschten Bereich, wird ihre Position verringert.
4. **Delete-Delete**: Uberlappende Loschungen werden zusammengefuhrt. Die fruhere Operation hat Vorrang.
5. **Update-Update**: Wenn zwei Benutzer dieselbe Eigenschaft am selben Pfad aktualisieren, gewinnt der spatere Zeitstempel und der alte Wert der fruheren Operation wird angepasst.
6. **Update-Delete**: Wenn ein Benutzer eine Eigenschaft eines Elements aktualisiert, das ein anderer Benutzer geloscht hat, wird die Aktualisierung ungultig.

### Konflikterkennung

Das System identifiziert drei Arten von Konflikten:

- **concurrent_edit**: Zwei Benutzer haben dieselbe Eigenschaft gleichzeitig geandert. Die Auflosung erfolgt automatisch (neuester Zeitstempel gewinnt).
- **deleted_reference**: Ein Benutzer versuchte, ein Element zu andern, das von einem anderen Benutzer geloscht wurde. Die Auflosung erfolgt automatisch (Loschung hat Vorrang).
- **invalid_path**: Nach der Transformation zeigt der Pfad einer Operation nicht mehr auf eine gultige Stelle. Dies erfordert manuelle Auflosung.

### Inverse Operationen

Jede Operation kann fur die Undo-Unterstutzung invertiert werden:

- Insert wird zu Delete (und umgekehrt).
- Update tauscht `oldValue` und `newValue`.
- Move tauscht `fromPath`/`toPath` und `fromPosition`/`toPosition`.
- Reorder erzeugt eine umgekehrte Indexzuordnung.

---

## 14.6 WebSocket-Kommunikation

Alle Echtzeit-Kollaborationsnachrichten fliessen uber die WebSocket-Verbindung bei `/api/ws`.

### Nachrichtentypen

| Typ | Richtung | Zweck |
|---|---|---|
| `join_session` | Client -> Server | Einer Kollaborationssitzung beitreten |
| `leave_session` | Client -> Server | Die Sitzung verlassen |
| `operation` | Bidirektional | OT-Operationen senden/empfangen |
| `cursor_update` | Client -> Server -> Andere | Cursorposition ubertragen |
| `selection_update` | Client -> Server -> Andere | Selektierte Elemente ubertragen |
| `comment` | Bidirektional | Kommentare erstellen, aktualisieren, loschen oder auflosen |
| `presence_update` | Bidirektional | Aktivitatsstatus aktualisieren |
| `ack` | Server -> Client | Empfangsbestatigung |
| `error` | Server -> Client | Fehlermeldung |
| `heartbeat` | Client -> Server | Keep-alive-Ping |
| `heartbeat_response` | Server -> Client | Keep-alive-Pong |

### Verbindungslebenszyklus

Der `CollaborationClient` verwaltet die WebSocket-Verbindung mit:

- **Automatische Wiederverbindung**: Konfigurierbare Wiederholungsversuche und exponentielles Backoff.
- **Heartbeat-Intervall**: Regelmasige Pings zur Erkennung von Verbindungsverlust (Standard: 30 Sekunden).
- **Operationspufferung**: Operationen werden bei Verbindungsunterbrechungen in eine Warteschlange gestellt und bei Wiederverbindung abgespielt.
- **Verbindungsstatus-Verfolgung**: Die Oberflache zeigt einen der Zustande `connecting`, `connected`, `disconnected`, `reconnecting` oder `error` an.

---

## 14.7 Anderungsverfolgung und Auditprotokoll

Jede Operation wird als `ChangeRecord` aufgezeichnet mit:

- **operation**: Die vollstandigen Operationsdetails.
- **user**: Wer die Anderung vorgenommen hat.
- **version**: Die Versionsnummer zum Zeitpunkt der Anderung.
- **description**: Eine menschenlesbare Zusammenfassung.
- **category**: Klassifizierung als `content`, `structure`, `settings` oder `metadata`.
- **impact**: Schweregrad -- `minor` (z.B. Textbearbeitung), `major` (z.B. Seitenhinzufugung) oder `breaking` (z.B. Loschung erforderlicher Fragen).

Die **ActivityTimeline**-Komponente rendert diese Datensatze in der Seitenleiste, gruppiert nach Datum. Die Zeitlinie zeigt Operationen, Kommentare, Versionserstellungen, Zusammenfuhrungen sowie Beitritte und Austritte von Benutzern. Sie unterstutzt Filterung nach Kategorie und Benutzer und ladt altere Eintrage bei Bedarf nach.

---

## 14.8 Merge Requests und Konfliktauflosung

### Einen Merge Request erstellen

Wenn die Arbeit an einem Branch abgeschlossen ist, erstellt ein Forscher einen Merge Request:

```typescript
versionControl.createMergeRequest(
  questionnaireId,
  'experiment-v2',           // Quell-Branch
  'main',                    // Ziel-Branch
  'Alternative Anordnung hinzufugen', // Titel
  userId,
  'Neue Fragenreihenfolge mit Pilotteilnehmern getestet'
);
```

Der Merge Request enthalt:

- **diff**: Den vollstandigen VersionDiff zwischen den Branches.
- **conflicts**: Alle erkannten Konflikte zwischen den divergierenden Operationshistorien.
- **status**: Einer von `open`, `merged`, `closed` oder `draft`.
- **reviewers**: Optionale Liste von Benutzer-IDs, die die Anderungen prufen sollen.

### Einen Merge ausfuhren

Die Methode `mergeBranch()` fuhrt die eigentliche Zusammenfuhrung durch:

1. Konflikte zwischen den Operationshistorien des Quell- und Ziel-Branches erkennen.
2. Falls Konflikte bestehen, den `resolveConflicts`-Callback aufrufen, um Auflosungsoperationen zu erhalten.
3. Die Operationen des Quell-Branches (plus etwaige Auflosungsoperationen) auf den Head-Inhalt des Ziel-Branches anwenden.
4. Eine neue Version auf dem Ziel-Branch mit einer Merge-Nachricht erstellen.

### Konfliktauflosungsstrategien

Die `CollaborationConfig` unterstutzt drei Strategien:

- **automatic**: Alle Konflikte werden durch Zeitstempel-Vorrang aufgelost. Dies ist der Standard und funktioniert gut fur die meisten Bearbeitungsszenarien.
- **manual**: Alle Konflikte erfordern explizite Benutzerauflosung. Die Oberflache prasentiert einen Seite-an-Seite-Vergleich.
- **hybrid**: Automatische Auflosung fur `concurrent_edit`- und `deleted_reference`-Konflikte; manuelle Auflosung fur `invalid_path`-Konflikte.

---

## 14.9 Kommentarsystem

### Strangstruktur

Kommentare sind in Strange (Threads) organisiert. Jeder Strang ist an einer bestimmten Position im Fragebogen verankert:

```typescript
interface CommentPosition {
  type: 'question' | 'page' | 'variable' | 'general';
  targetId: string;         // ID des verankerten Elements
  property?: string;        // Bestimmte Eigenschaft (z.B. 'prompt')
  coordinates?: { x, y };   // Visuelle Position fur Pin-Platzierung
  textRange?: { start, end }; // Fur Texthervorhebung
}
```

### Kommentarfunktionen

Jeder Kommentar unterstutzt:

- **Erwahnungen**: Andere Benutzer mit `@Benutzername` markieren. Das `mentions`-Array speichert die referenzierten Benutzer-IDs.
- **Reaktionen**: Emoji-Reaktionen mit Zahlung, welche Benutzer reagiert haben.
- **Anhange**: Dateianhange mit Dateiname, MIME-Typ, Grosse und URL.
- **Auflosung**: Strange konnen von jedem Teilnehmer als aufgelost markiert werden. Die Felder `resolvedBy` und `resolvedAt` zeichnen auf, wer sie aufgelost hat und wann.

### Echtzeit-Synchronisation

Kommentare werden uber WebSocket-Nachrichten vom Typ `comment` mit den Aktionen `create`, `update`, `delete` oder `resolve` synchronisiert. Alle Teilnehmer der Kollaborationssitzung sehen Kommentaranderungen sofort.

Die **CommentThread**-Komponente rendert eine Konversationsansicht mit Autoren-Avataren, Zeitstempeln und der Moglichkeit zu antworten, zu reagieren oder aufzulosen.

---

## 14.10 Prasenzsystem

Das Prasenzsystem bietet Awareness uber die Aktivitaten anderer Benutzer im Editor.

### Prasenzinformationen

Jeder aktive Benutzer sendet:

- **cursor**: Uber welchem Element sie schweben, mit Koordinaten.
- **selection**: Welche Elemente aktuell ausgewahlt sind (unterstutzt Mehrfachauswahl).
- **activeElement**: Was sie bearbeiten (Frage, Seite, Variable oder das Eigenschaftenpanel).
- **viewport**: Ihre Scrollposition und Zoomstufe.
- **status**: `active`, `idle` (keine Interaktion fur einen konfigurierbaren Zeitraum) oder `away`.

### Visuelle Indikatoren

Die **PresenceIndicator**-Komponente zeigt:

- Avatar-Stapel in der Kopfzeile mit allen Online-Mitarbeitern.
- Farbige Cursor-Indikatoren auf der Leinwand, die zeigen, wohin jeder Benutzer zeigt.
- Selektions-Hervorhebungen in der zugewiesenen Farbe jedes Benutzers.
- Status-Abzeichen (grun fur aktiv, gelb fur inaktiv, grau fur abwesend).

### Benutzerfarben

Jedem Kollaborationsbenutzer wird beim Sitzungsbeitritt eine eindeutige Farbe zugewiesen. Diese Farben werden einheitlich fur Cursors, Selektionen und Kommentar-Indikatoren verwendet, um eine klare visuelle Zuordnung zu gewahrleisten.

---

## 14.11 Best Practices fur Team-Kollaboration

### Branch-Strategie

Fur Forschungsteams empfehlen wir:

1. Verwenden Sie `main` als stabilen, veroffentlichten Branch.
2. Erstellen Sie Feature-Branches fur experimentelle Modifikationen (z.B. `alt-reihenfolge`, `ueberarbeitete-skalen`).
3. Testen Sie Feature-Branches mit Pilotteilnehmern vor der Zusammenfuhrung.
4. Verwenden Sie aussagekraftige Branch-Namen und Versionsnachrichten.

### Kommunikation

- Verwenden Sie Kommentare fur asynchrone Diskussionen uber bestimmte Fragen oder Designentscheidungen.
- Erwahnen Sie relevante Teammitglieder mit `@`, um sicherzustellen, dass sie den Kommentar sehen.
- Losen Sie Kommentarstrange auf, sobald die Diskussion abgeschlossen ist.

### Versionsdisziplin

- Erstellen Sie benannte Versionen bei bedeutsamen Meilensteinen (z.B. "Nach Ethikkommission-Review", "Vor-Pilot", "Final fur Datenerhebung").
- Halten Sie die Versionshistorie sauber, indem Sie `cleanupVersions()` verwenden, um ubermassige automatische Speicherungen zu entfernen.
- Exportieren Sie Versionskontrolldaten regelmasig als Sicherungskopie.

### Konfliktvermeidung

- Koordinieren Sie Bearbeitungssitzungen, um Uberschneidungen bei denselben Elementen zu minimieren.
- Verwenden Sie die Prasenzindikatoren, um zu sehen, was andere bearbeiten, bevor Sie Anderungen im selben Bereich vornehmen.
- Bevorzugen Sie die `hybrid`-Konfliktauflosungsstrategie fur aktive Kollaborationssitzungen.

---

## Zusammenfassung

Das Kollaborationssystem von QDesigner Modern ermoglicht Forschungsteams die gemeinsame Arbeit am Fragebogendesign mit vollstandiger Versionskontrolle, gleichzeitiger Echtzeit-Bearbeitung uber Operational Transformation, verankerten Kommentarstrangen und Live-Prasenzindikatoren. Der Branching- und Merge-Workflow unterstutzt sowohl explorative Designvariationen als auch diszipliniertes Release-Management, wahrend das Auditprotokoll vollstandige Nachverfolgbarkeit jeder Anderung bietet.
