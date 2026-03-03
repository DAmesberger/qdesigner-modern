# Kapitel 10: Reaktionszeitmessung

Die Reaktionszeitmessung (RT) steht im Zentrum der kognitiven und behavioralen Forschung. QDesigner Modern bietet eine speziell entwickelte Reaktionszeit-Engine, die von einem WebGL-2.0-Renderer unterstuetzt wird und Mikrosekunden-genaue Zeitmessung bei 120+ FPS Rendering liefert. Dieses Kapitel behandelt die Architektur, Stimulustypen, das Timing-Modell, unterstuetzte Paradigmen, die Trial-Konfiguration und Best Practices fuer zeitkritische Forschung.

---

## 10.1 Architekturuebersicht

Das Reaktionszeitsystem besteht aus zwei Kernkomponenten:

1. **WebGLRenderer** (`src/lib/renderer/WebGLRenderer.ts`) -- Eine hardwarebeschleunigte Rendering-Engine, die Stimuli zeichnet, Frame-Timing verfolgt und ausgelassene Frames meldet.
2. **ReactionEngine** (`src/lib/runtime/reaction/ReactionEngine.ts`) -- Ein Orchestrator, der Trial-Sequenzen durchfuehrt, Antworten erfasst, Reaktionszeiten berechnet und Frame-genaue Timing-Daten aufzeichnet.

### 10.1.1 WebGL-2.0-Renderer

Der Renderer erstellt einen WebGL-2.0-Kontext mit leistungsoptimierten Einstellungen:

| Einstellung          | Standardwert         | Zweck                                  |
|---------------------|---------------------|----------------------------------------|
| `antialias`         | `false`             | Vermeidung von Per-Sample-Smoothing     |
| `depth`             | `false`             | Kein 3D-Tiefenpuffer erforderlich       |
| `stencil`           | `false`             | Keine Stencil-Operationen noetig        |
| `alpha`             | `true`              | Unterstuetzung transparenter Overlays   |
| `desynchronized`    | `true`              | Umgehung des Compositors fuer niedrigere Latenz |
| `powerPreference`   | `high-performance`  | Dedizierte GPU anfordern                |
| `preserveDrawingBuffer` | `false`        | Buffer-Swap-Optimierung ermoeglichen    |

Das `desynchronized`-Flag ist besonders wichtig: Es weist den Browser an, die Compositor-Pipeline zu umgehen, wodurch die Anzeigelatenz um einen Frame oder mehr auf unterstuetzten Systemen reduziert wird.

**Rendering-Pipeline:**

1. `requestAnimationFrame`-Callback wird ausgeloest.
2. Renderer prueft, ob seit dem letzten praesentierten Frame genug Zeit vergangen ist (basierend auf Ziel-FPS und VSync-Einstellungen).
3. Bei Praesentation: Canvas loeschen, Renderables nach Layer sortiert durchlaufen, `render()`-Funktion jedes Renderables aufrufen.
4. Frame-Callbacks werden mit `FrameSample`-Daten aufgerufen (Zeitstempel, Delta, Presented-Flag, Dropped-Frame-Zaehler).

### 10.1.2 Frame-Statistiken

Der Renderer verfolgt kontinuierlich Leistungsmetriken:

| Metrik           | Typ      | Beschreibung                                    |
|-----------------|----------|------------------------------------------------|
| `fps`           | `number` | Aktuelle Frames pro Sekunde (alle 1s aktualisiert) |
| `frameTime`     | `number` | Durchschnittliche Frame-Zeit in ms (240 Samples) |
| `droppedFrames` | `number` | Gesamtzahl verpasster Frames seit Start          |
| `targetFPS`     | `number` | Konfigurierte Ziel-Framerate                     |
| `totalFrames`   | `number` | Gesamtzahl praesentierter Frames seit Start      |
| `jitter`        | `number` | Standardabweichung der Frame-Zeiten (ms)         |
| `gpuTime`       | `number` | GPU-Ausfuehrungszeit (wenn `EXT_disjoint_timer_query_webgl2` verfuegbar) |

### 10.1.3 Renderable-System

Stimuli werden ueber ein schichtbasiertes Renderable-System angezeigt. Jedes Renderable hat:

- **id**: Eindeutiger String-Identifier
- **layer**: Numerische Z-Reihenfolge (niedrigere Layer werden zuerst gerendert)
- **render()**: Funktion, die jeden Frame mit dem WebGL-Kontext und einem `RenderContext` aufgerufen wird

Der `RenderContext` stellt bereit:

```typescript
interface RenderContext {
  time: number;          // Aktueller Zeitstempel (performance.now())
  deltaTime: number;     // Zeit seit letztem Frame (ms)
  stimulusTime: number;  // Zeit seit Stimulus-Onset (ms)
  width: number;         // Canvas-Breite in Pixeln
  height: number;        // Canvas-Hoehe in Pixeln
  pixelRatio: number;    // Geraete-Pixelverhaeltnis
}
```

---

## 10.2 Timing-Praezision

### 10.2.1 performance.now()

Alle Zeitstempel im Reaktionszeitsystem von QDesigner verwenden `performance.now()`, das Sub-Millisekunden-Praezision bietet (typischerweise 5 Mikrosekunden Aufloesung in modernen Browsern). Dies ist entscheidend, weil:

- `Date.now()` nur Millisekunden-Praezision bietet.
- `performance.now()` monoton ist (geht nie zurueck).
- Es relativ zum `timeOrigin` der Seite ist, wodurch Uhrendrift vermieden wird.

### 10.2.2 Stimulus-Onset-Erkennung

Der Stimulus-Onset-Zeitpunkt wird nicht aufgezeichnet, wenn der Stimulus *angefordert* wird, sondern wenn der erste Frame, der den Stimulus enthaelt, tatsaechlich *praesentiert* wird. Die Engine verwendet einen zweistufigen Prozess:

1. Wenn die Stimulus-Phase beginnt, wird ein `pendingStimulusOnsetMark`-Flag gesetzt.
2. Beim naechsten Frame-Callback, bei dem `sample.presented === true` ist, wird die Onset-Zeit aus `sample.now` aufgezeichnet.

Dies stellt sicher, dass der Onset-Zeitstempel die tatsaechliche Anzeigezeit widerspiegelt, nicht den Zeitpunkt, zu dem der Stimulus in die Warteschlange gestellt wurde.

### 10.2.3 Reaktionszeitberechnung

Die Reaktionszeit wird berechnet als:

$$RT = t_{\text{Antwort}} - t_{\text{Stimulus-Onset}}$$

wobei beide Zeitstempel von `performance.now()` stammen. Das Ergebnis wird in Millisekunden mit Sub-Millisekunden-Praezision gespeichert.

### 10.2.4 Mikrosekunden-Speicherung

Wenn Reaktionszeitdaten in der Datenbank persistiert werden, speichert QDesigner Timing-Werte als `BIGINT` in Mikrosekunden:

$$\text{reaction\_time\_us} = \lfloor RT \times 1000 \rfloor$$

Dies vermeidet Fliesskomma-Praezisionsverluste bei Speicherung und Abruf und liefert eine konsistente Ganzzahldarstellung, die fuer statistische Analysen geeignet ist.

---

## 10.3 Stimulustypen

Die `ReactionEngine` unterstuetzt sechs Stimulustypen, die jeweils ueber die WebGL-Pipeline gerendert werden.

### 10.3.1 Form-Stimuli

Geometrische Formen, gerendert als WebGL-Primitive:

| Form        | Parameter                         | Hinweise                    |
|------------|----------------------------------|----------------------------|
| `circle`    | `radiusPx`, `color`, `position`  | Gerendert als Triangle Fan |
| `square`    | `widthPx`, `color`, `position`   | Breite = Hoehe             |
| `rectangle` | `widthPx`, `heightPx`, `color`   | Unabhaengige Dimensionen   |
| `triangle`  | `widthPx`, `color`, `position`   | Gleichseitig, Spitze oben  |

Formen werden mit normalisierten Koordinaten (0-1 entspricht Viewport) oder Pixelkoordinaten positioniert, wenn Werte groesser als 1 sind:

```typescript
position: { x: 0.5, y: 0.5 }  // Bildschirmmitte
position: { x: 400, y: 300 }   // Pixelkoordinaten
```

Farben werden als RGBA-Arrays mit Werten in [0, 1] angegeben:

```typescript
color: [1, 0, 0, 1]      // Deckend rot
color: [0, 0.5, 1, 0.8]  // Halbtransparent blau
```

### 10.3.2 Text-Stimuli

Text wird auf eine Off-Screen-Canvas gerendert und dann als WebGL-Textur angezeigt:

| Parameter    | Typ        | Standard | Beschreibung              |
|-------------|-----------|----------|--------------------------|
| `text`       | `string`  | Pflicht  | Der Textinhalt            |
| `fontPx`     | `number`  | 64       | Schriftgroesse in Pixeln   |
| `fontFamily` | `string`  | "Arial"  | CSS-Schriftfamilie        |
| `color`      | `RGBAColor` | Weiss  | Textfarbe                 |
| `position`   | `{x,y}`   | Mitte    | Position auf dem Bildschirm |

Dieser Ansatz gewaehrleistet scharfen Text bei jeder Groesse bei gleichzeitiger Beibehaltung der WebGL-Rendering-Leistung.

### 10.3.3 Bild-Stimuli

Bilder werden asynchron geladen und fuer nachfolgende Trials zwischengespeichert:

| Parameter  | Typ      | Beschreibung                           |
|-----------|----------|----------------------------------------|
| `src`      | `string` | URL oder Pfad zum Bild                 |
| `widthPx`  | `number` | Anzeigebreite (Standard: natuerliche Groesse) |
| `heightPx` | `number` | Anzeigehoehe (Standard: natuerliche Groesse)  |
| `position` | `{x,y}`  | Mittelpunktposition                    |

Der Bild-Cache (`imageCache`) verhindert redundante Netzwerkanfragen, wenn dasselbe Bild in mehreren Trials erscheint.

### 10.3.4 Video-Stimuli

Video-Elemente werden als WebGL-Texturquellen verwendet und jeden Frame aktualisiert:

| Parameter  | Typ       | Standard | Beschreibung              |
|-----------|-----------|---------|--------------------------|
| `src`      | `string`  | Pflicht | URL zur Videodatei        |
| `autoplay` | `boolean` | `true`  | Automatisch abspielen     |
| `muted`    | `boolean` | `true`  | Audio standardmaessig stumm|
| `loop`     | `boolean` | `false` | Endlosschleife            |
| `widthPx`  | `number`  | Video-nativ | Anzeigebreite         |
| `heightPx` | `number`  | Video-nativ | Anzeigehoehe          |

Video-Texturen werden jeden Frame via `texImage2D` auf die GPU hochgeladen, was Echtzeit-Videoanzeige innerhalb des WebGL-Kontexts ermoeglicht.

### 10.3.5 Audio-Stimuli

Audio-Stimuli erzeugen keine visuelle Ausgabe. Der Stimulus-Onset wird zum Zeitpunkt des `audio.play()`-Aufrufs markiert:

| Parameter  | Typ       | Standard | Beschreibung              |
|-----------|-----------|---------|--------------------------|
| `src`      | `string`  | Pflicht | URL zur Audiodatei        |
| `volume`   | `number`  | 1.0     | Lautstaerke (0.0 - 1.0)   |
| `autoplay` | `boolean` | `true`  | Automatisch abspielen     |

Audio-Stimuli werden haeufig in auditorischen RT-Paradigmen verwendet, bei denen Teilnehmer auf Toene, Sprache oder andere Geraeusche reagieren.

### 10.3.6 Benutzerdefinierte Shader-Stimuli

Fuer fortgeschrittene Stimulusanforderungen (z.B. Gabor-Patches, Random-Dot-Kinematogramme, prozedurale Animationen) unterstuetzt QDesigner benutzerdefinierte GLSL-Shader:

| Parameter   | Typ                     | Beschreibung                   |
|------------|-------------------------|--------------------------------|
| `shader`    | `string`                | GLSL-Fragment-Shader-Quellcode |
| `vertices`  | `number[]`              | Vertex-Positionen              |
| `uniforms`  | `Record<string, ...>`   | Uniform-Werte                  |

Die Engine uebergibt automatisch `time` (Sekunden seit Stimulus-Onset) und `resolution` (Viewport-Dimensionen) als Uniforms.

---

## 10.4 Mediathek-Integration

Stimulus-Medien (Bilder, Videos, Audio) koennen in QDesigners MinIO-basierte Mediathek hochgeladen und per URL in Trial-Konfigurationen referenziert werden. Vorteile:

- **Vorabladen:** Medien werden vor Beginn des Trial-Blocks geladen und zwischengespeichert.
- **CDN-faehig:** MinIO-URLs koennen fuer schnelle globale Auslieferung hinter ein CDN geschaltet werden.
- **Versionierung:** Medien-Assets werden mit inhaltsadressierbaren Hashes gespeichert.

Im Designer koennen Sie Medien aus dem **Mediathek**-Panel direkt auf einen Reaktionszeit-Block ziehen, um Stimulus-Referenzen zu erstellen.

---

## 10.5 Paradigmen

Die `ReactionEngine` ist flexibel genug, um alle gaengigen RT-Paradigmen allein durch Konfiguration umzusetzen.

### 10.5.1 Einfache Reaktionszeit

Der Teilnehmer drueckt so schnell wie moeglich eine einzelne Taste, wenn ein Stimulus erscheint.

**Konfiguration:**

```typescript
{
  id: "simple-rt-trial-1",
  responseMode: "keyboard",
  validKeys: ["space"],
  fixation: { enabled: true, type: "cross", durationMs: 500 },
  preStimulusDelayMs: 800,       // Zufaelliger Jitter empfohlen
  stimulus: { kind: "shape", shape: "circle", color: [1, 0, 0, 1] },
  responseTimeoutMs: 1500,
  interTrialIntervalMs: 1000,
  targetFPS: 120
}
```

### 10.5.2 Wahlreaktionszeit

Der Teilnehmer drueckt verschiedene Tasten je nach erscheinendem Stimulus.

**Konfiguration:**

```typescript
{
  id: "choice-rt-trial-1",
  responseMode: "keyboard",
  validKeys: ["f", "j"],
  correctResponse: "f",           // "f" fuer linken Stimulus
  requireCorrect: true,
  fixation: { enabled: true, type: "cross", durationMs: 500 },
  preStimulusDelayMs: 600,
  stimulus: { kind: "shape", shape: "circle", color: [0, 0, 1, 1] },
  responseTimeoutMs: 2000,
  interTrialIntervalMs: 800
}
```

### 10.5.3 Go/No-Go

Der Teilnehmer reagiert auf "Go"-Stimuli, unterlaesst aber Antworten auf "No-Go"-Stimuli.

**Konfiguration (Go-Trial):**

```typescript
{
  id: "go-trial-1",
  responseMode: "keyboard",
  validKeys: ["space"],
  correctResponse: "space",
  requireCorrect: true,
  stimulus: { kind: "shape", shape: "circle", color: [0, 1, 0, 1] },  // Gruen = Go
  responseTimeoutMs: 1500
}
```

**Konfiguration (No-Go-Trial):**

```typescript
{
  id: "nogo-trial-1",
  responseMode: "keyboard",
  validKeys: ["space"],
  requireCorrect: true,
  // Kein correctResponse gesetzt -> korrekte Antwort ist keine Antwort (Timeout)
  stimulus: { kind: "shape", shape: "circle", color: [1, 0, 0, 1] },  // Rot = No-Go
  responseTimeoutMs: 1500
}
```

Bei No-Go-Trials wird Korrektheit so bewertet: `response === null` zeigt eine korrekte Inhibition an.

### 10.5.4 N-Back

N-Back-Aufgaben erfordern, dass Teilnehmer den aktuellen Stimulus mit dem *n* Trials zuvor praesentierten Stimulus vergleichen. QDesigner unterstuetzt dies durch:

1. Konfiguration einer Sequenz von Text- oder Bild-Stimuli.
2. Dynamisches Setzen von `correctResponse` basierend darauf, ob der aktuelle Stimulus mit dem *n* Schritte zurueckliegenden uebereinstimmt.
3. Verwendung der `validKeys` zur Definition von "Match"- und "Non-Match"-Tasten.

### 10.5.5 Benutzerdefinierte Paradigmen mit geplanten Phasen

Die `ReactionEngine` unterstuetzt beliebige Trial-Strukturen durch **geplante Phasen**:

```typescript
engine.schedulePhase({
  name: "mask",
  durationMs: 200,
  allowResponse: false,
  marksStimulusOnset: false
});

engine.schedulePhase({
  name: "probe",
  durationMs: 0,  // Dauer bis zur Antwort
  allowResponse: true,
  marksStimulusOnset: true
});
```

Dies ermoeglicht Paradigmen wie:
- **Maskiertes Priming:** Fixation -> Prime -> Maske -> Zielreiz
- **Attentional Blink:** RSVP-Stream mit Zielerkennung
- **Visuelle Suche:** Anzeigearray mit Antwortfenster

---

## 10.6 Trial-Konfiguration

Jeder Trial wird ueber ein `ReactionTrialConfig`-Objekt konfiguriert:

| Feld                            | Typ                    | Standard    | Beschreibung                             |
|--------------------------------|-----------------------|-------------|------------------------------------------|
| `id`                            | `string`              | Pflicht     | Eindeutiger Trial-Identifier             |
| `responseMode`                  | `'keyboard' \| 'mouse' \| 'touch'` | `'keyboard'` | Eingabemethode        |
| `validKeys`                     | `string[]`            | `[]` (alle) | Erlaubte Tasten                          |
| `correctResponse`              | `string`              | -           | Erwartete korrekte Antwort               |
| `requireCorrect`               | `boolean`             | `false`     | Korrektheit auswerten                    |
| `fixation`                      | `ReactionFixationConfig` | deaktiviert | Fixationskreuz/-punkt-Einstellungen   |
| `preStimulusDelayMs`           | `number`              | 0           | Verzoegerung nach Fixation, vor Stimulus |
| `stimulus`                      | `ReactionStimulusConfig` | Pflicht  | Stimulus-Definition                      |
| `stimulusDurationMs`           | `number`              | -           | Wie lange Stimulus nach Antwort bleibt   |
| `responseTimeoutMs`            | `number`              | 2000        | Maximales Antwortfenster                 |
| `interTrialIntervalMs`         | `number`              | 0           | Leerer Bildschirm zwischen Trials        |
| `targetFPS`                     | `number`              | 120         | Ziel-Framerate des Renderers             |
| `vsync`                         | `boolean`             | `true`      | Synchronisation mit Display-Refresh      |
| `backgroundColor`              | `RGBAColor`           | Schwarz     | Canvas-Hintergrundfarbe                  |
| `allowResponseDuringPreStimulus` | `boolean`           | `false`     | Fruehe Antworten akzeptieren             |

### 10.6.1 Fixationskonfiguration

| Feld        | Typ                | Standard  | Beschreibung             |
|------------|--------------------|-----------|--------------------------|
| `enabled`   | `boolean`          | `false`   | Fixation anzeigen        |
| `type`      | `'cross' \| 'dot'` | `'cross'` | Fixationstyp             |
| `durationMs`| `number`           | 0         | Anzeigedauer             |
| `color`     | `RGBAColor`        | Weiss     | Fixationsfarbe           |
| `sizePx`    | `number`           | 20        | Groesse in Pixeln         |

Das Fixationskreuz wird als zwei senkrechte Rechtecke (2px breit) gerendert. Der Punkt wird als ausgefuellter Kreis mit Radius `sizePx / 4` gerendert.

### 10.6.2 Antwortzuordnung

**Tastatur:** Das Array `validKeys` legt fest, welche Tasten akzeptiert werden. Tastenwerte verwenden `event.key.toLowerCase()`. Bei leerem Array wird jede Taste akzeptiert.

**Maus:** Die Klickposition wird auf [0, 1] relativ zur Canvas normalisiert:

```typescript
response.value = {
  x: (clientX - canvasLinks) / canvasBreite,
  y: (clientY - canvasOben) / canvasHoehe
}
```

**Touch:** Der erste Beruehrungspunkt wird identisch zur Mausklick-Normalisierung behandelt.

---

## 10.7 Trial-Sequenz

Ein Trial durchlaeuft die folgenden Phasen:

```
1. Fixation (optional)
   |
2. Prae-Stimulus-Verzoegerung (optional)
   |
3. Stimulus-Anzeige + Antwortfenster
   |  -> Antwort erfasst (oder Timeout)
   |
4. Post-Stimulus-Dauer (optional)
   |
5. Geplante Phasen (optional, beliebig)
   |
6. Inter-Trial-Intervall (optional)
```

### 10.7.1 Phasen-Timeline

Jede Phase wird mit praezisen Start- und Endzeiten im `phaseTimeline`-Array aufgezeichnet:

```typescript
interface ReactionPhaseMark {
  name: string;       // "fixation", "pre-stimulus-delay", "stimulus" usw.
  startTime: number;  // performance.now() bei Phasenbeginn
  endTime: number;    // performance.now() bei Phasenende
}
```

### 10.7.2 ISI- und SOA-Kontrolle

**Inter-Stimulus-Intervall (ISI):** Das Intervall zwischen dem Offset eines Stimulus und dem Onset des naechsten. Gesteuert durch `interTrialIntervalMs`.

**Stimulus-Onset-Asynchronie (SOA):** Die Zeit zwischen dem Onset eines Stimulus und dem Onset des naechsten:

$$SOA = \text{Stimulusdauer} + ISI$$

Fuer praezise SOA-Kontrolle setzen Sie `stimulusDurationMs` und `interTrialIntervalMs` explizit:

```typescript
// 200ms Stimulus, 300ms ISI -> 500ms SOA
{ stimulusDurationMs: 200, interTrialIntervalMs: 300 }
```

---

## 10.8 Uebungs-Trials

Uebungs-Trials verwenden dieselbe `ReactionTrialConfig`-Struktur, werden aber separat in den Daten markiert. Zur Implementierung:

1. Erstellen Sie einen Satz von Uebungs-Trial-Konfigurationen.
2. Fuehren Sie diese vor den Haupt-Trials ueber `engine.runTrial()` aus.
3. Geben Sie Feedback ueber den `hooks.onResponse`-Callback.
4. Verwerfen Sie Uebungsdaten in der Analyse (sie sind mit praefix-markierten IDs versehen).

---

## 10.9 Trial-Ergebnisdaten

Jeder Trial erzeugt ein `ReactionTrialResult` mit umfassenden Timing-Daten:

```typescript
interface ReactionTrialResult {
  trialId: string;                    // Trial-Identifier
  startedAt: number;                  // Trial-Start (performance.now())
  stimulusOnsetTime: number | null;   // Tatsaechliche Anzeigezeit
  response: ReactionResponseCapture | null;
  isCorrect: boolean | null;          // null wenn requireCorrect false
  timeout: boolean;                   // Ob die Antwort zeitlich ueberschritten wurde
  frameLog: FrameSample[];            // Frame-genaue Timing-Daten
  phaseTimeline: ReactionPhaseMark[]; // Phasen-Zeitstempel
  stats: FrameStats;                  // Renderer-Statistiken
}
```

### 10.9.1 Antworterfassung

```typescript
interface ReactionResponseCapture {
  source: 'keyboard' | 'mouse' | 'touch';
  value: string | { x: number; y: number };
  timestamp: number;         // performance.now() des Antwortereignisses
  reactionTimeMs: number;    // timestamp - stimulusOnsetTime
}
```

### 10.9.2 Frame-Log

Das Frame-Log zeichnet jeden Animations-Frame waehrend des Trials auf:

```typescript
interface FrameSample {
  index: number;          // Frame-Zaehler
  now: number;            // performance.now()-Zeitstempel
  delta: number;          // Zeit seit vorherigem Frame (ms)
  presented: boolean;     // Ob ein Frame tatsaechlich gezeichnet wurde
  droppedSinceLast: number; // Seit letzter Praesentation verpasste Frames
}
```

Diese Daten ermoeglichen Post-hoc-Analysen der Anzeigetiming-Qualitaet (siehe Abschnitt 10.11).

---

## 10.10 Hooks

Die `ReactionEngine` bietet Lifecycle-Hooks fuer Echtzeit-Monitoring:

| Hook            | Signatur                                      | Anwendungsfall                  |
|----------------|----------------------------------------------|---------------------------------|
| `onFrame`       | `(sample: FrameSample, stats: FrameStats) => void` | Echtzeit-FPS-Anzeige      |
| `onPhaseChange` | `(phase: string, startedAt: number) => void`  | Phasenfortschrittsanzeige       |
| `onResponse`    | `(response: ReactionResponseCapture) => void` | Sofortiges Feedback             |

---

## 10.11 Best Practices fuer zeitkritische Forschung

### 10.11.1 Display-Ueberlegungen

1. **Verwenden Sie den Vollbildmodus**, um Browser-Chrome und Compositor-Interferenzen zu eliminieren.
2. **Hohe Bildwiederholrate anfordern:** Setzen Sie `targetFPS: 120` oder hoeher. Auf 60-Hz-Displays wird dies graceful degradiert.
3. **Aktivieren Sie VSync** (`vsync: true`), um mit dem Display-Refresh-Zyklus zu synchronisieren.
4. **Verwenden Sie `desynchronized: true`** (Standard), um den Compositor zu umgehen.
5. **Minimieren Sie andere Browser-Aktivitaeten** waehrend der Testung.

### 10.11.2 Timing-Validierung

1. **Pruefen Sie das `frameLog`** auf ausgelassene Frames. Wenn `droppedSinceLast > 0` beim Stimulus-Onset-Frame, kann die Onset-Zeit ungenau sein.
2. **Pruefen Sie `stats.jitter`**: Fuer zeitkritische Forschung sollte der Jitter unter 2ms liegen.
3. **Untersuchen Sie die `phaseTimeline`**, um zu verifizieren, dass Phasendauern der Konfiguration entsprechen.
4. **Verwenden Sie `stimulusOnsetTime`** (nicht `startedAt`) fuer die RT-Berechnung -- die Engine tut dies automatisch.

### 10.11.3 Stimulus-Vorbereitung und automatisches Vorladen

QDesigner bietet automatisches Medien-Vorladen ueber den **ResourceManager**, um Frame-genaues Timing ohne Netzwerk-Jitter bei der ersten Stimuluspraesentaion zu garantieren.

**Funktionsweise des automatischen Vorladens:**

1. **ResourceManager-Integration**: Der `ResourceManager` durchsucht alle Trial-Konfigurationen nach Medien-URLs (Bilder, Videos, Audio) und beginnt mit dem parallelen Herunterladen, bevor der Fragebogen startet.
2. **seedFromResourceManager()**: Die `ReactionEngine` ruft waehrend der Initialisierung `seedFromResourceManager()` auf und verbindet die zwischengespeicherten Assets des ResourceManagers mit dem internen Medien-Cache der Engine. Dadurch sind alle Medien bereits dekodiert und GPU-bereit, bevor der erste Trial beginnt.
3. **warmUpStimuli() pro Block**: Vor dem Start jedes Reaktionszeit-Blocks ruft die Engine `warmUpStimuli()` auf, das alle Stimuli fuer den kommenden Block vorab cached. Dies umfasst das Hochladen von Texturen auf die GPU, das Dekodieren von Audio-Puffern und das Vorrendern von Text-Canvases.
4. **Automatischer preload()-Aufruf**: Die Laufzeitumgebung ruft automatisch `preload()` vor dem Fragebogenstart auf und stellt sicher, dass alle in der Fragebogendefinition referenzierten Medien-Assets abgerufen und zwischengespeichert werden. Forschende muessen das Vorladen nicht manuell ausloesen.

Diese vierstufige Pipeline stellt sicher, dass bei der Stimuluspraesentaion keine Netzwerkanfragen, Bilddekodierungen oder Textur-Uploads auf dem kritischen Pfad stattfinden. Das Ergebnis ist Frame-genaues Stimulus-Onset-Timing ohne Jitter durch Asset-Laden.

**Weitere Best Practices:**

1. **Verwenden Sie Form-Stimuli**, wenn moeglich -- sie werden in einem einzigen GPU-Draw-Call ohne Ladelatenz gerendert.
2. **Rendern Sie Text vor**, wenn derselbe Text in mehreren Trials erscheint (die Text-Canvas wird jedes Mal neu generiert).
3. **Vorladeabschluss verifizieren**: Der ResourceManager sendet Fortschrittsereignisse, die die Laufzeitumgebung zur Anzeige eines Ladeindikators verwendet. Trials beginnen erst, wenn alle Assets als bereit gemeldet werden.

### 10.11.4 Umgebungsempfehlungen

1. **Hardware:** Dedizierte GPU, 120Hz+ Display, kabelgebundene Tastatur.
2. **Browser:** Chromium-basierte Browser bieten das konsistenteste Timing.
3. **Betriebssystem:** Deaktivieren Sie Display-Skalierung, Energieverwaltung und Benachrichtigungen.
4. **Netzwerk:** Laden Sie alle Medien-Assets vor der Sitzung vor.

### 10.11.5 Datenqualitaetspruefungen

1. **Schliessen Sie Trials mit `response.reactionTimeMs < 100` aus** (antizipatorische Antworten).
2. **Schliessen Sie Trials mit `timeout === true` aus** oder analysieren Sie diese separat.
3. **Berichten Sie die Frame-Drop-Rate** aus `stats.droppedFrames / stats.totalFrames`.
4. **Berichten Sie den Median der RT** statt des Mittelwerts, da RT-Verteilungen typischerweise rechtsschief sind.

---

## 10.12 Zusammenfassung

| Funktion                      | Implementierung                         | Kernwert                 |
|------------------------------|----------------------------------------|--------------------------|
| Renderer                      | WebGL 2.0 mit `desynchronized`-Flag    | Sub-Frame-Latenz          |
| Framerate                     | Konfigurierbares Ziel, VSync-Support   | 120+ FPS                  |
| Timing-API                    | `performance.now()`                    | ~5 Mikrosekunden Aufloesung |
| Stimulus-Onset                | Frame-genaue Erkennung                 | Erster-praesentierter-Frame |
| RT-Berechnung                 | `response.timestamp - stimulusOnset`   | Sub-ms Praezision          |
| Speicherpraezision            | BIGINT Mikrosekunden                   | Verlustfreie Ganzzahlspeicherung |
| Stimulustypen                 | Form, Text, Bild, Video, Audio, Custom Shader | 6 Typen           |
| Antwortmodi                   | Tastatur, Maus, Touch                  | 3 Modi                    |
| Paradigmen                    | Einfache RT, Wahl-RT, Go/No-Go, N-Back, benutzerdefiniert | Unbegrenzt |
| Trial-Daten                   | Frame-Log, Phasen-Timeline, Statistiken | Vollstaendiger Audit Trail |
| Medien-Caching                | In-Memory-Bild/Video/Audio-Cache       | Null Nachladelatenz        |
| Automatisches Vorladen        | ResourceManager + seedFromResourceManager() + warmUpStimuli() | Frame-genauer erster Stimulus |
