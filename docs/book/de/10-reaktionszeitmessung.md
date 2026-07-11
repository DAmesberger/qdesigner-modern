# Kapitel 10: Reaktionszeitmessung

Die Reaktionszeitmessung (RT) ist die Faehigkeit, die QDesigner Modern von gewoehnlichen Umfragewerkzeugen abhebt. Eine eigens entwickelte Reaktions-Engine, angetrieben von einem WebGL-2.0-Renderer, liefert **frame-genauen Stimulus-Onset (Stimulusbeginn)** und **relative Sub-Millisekunden-Praezision** bei Differenzwerten. Dieses Kapitel richtet sich an Forschende, die zeitkritische Aufgaben erstellen und durchfuehren. Es behandelt, wie Sie ein Paradigm waehlen, wie Timings pro Trial erzeugt werden, wie Sie Antworten auf Eingaben abbilden (einschliesslich externer Hardware), wie sichergestellt wird, dass Stimulus-Medien vorhanden sind, bevor ein zeitkritischer Block laeuft, was ein Trial aufzeichnet und -- ehrlich -- was die Timing-Zahlen bedeuten und was nicht.

Zwei Aussagen rahmen alles Weitere, und beide sind bewusst gewaehlt:

- **Relative RT ist wissenschaftlich belastbar.** Differenzwerte innerhalb einer Person -- Kongruenzeffekte, Simon-/Posner-Kosten, IAT-*D*, Set-Size-Steigungen -- werden auf einer einzigen Uhr gemessen (`event.timeStamp` gegen einen frame-gezaehlten Onset), mit vollstaendig geseedeter, reproduzierbarer Randomisierung. Die verbleibende konstante Zeitverschiebung pro Trial hebt sich in einer Differenz auf.
- **Absolute RT ist nur bis auf etwa einen Frame belastbar.** Die Anzeigelatenz-Korrektur ist eine *modellierte* Ein-Frame-Schaetzung, keine Photodioden-Messung. Mikrosekunden-*Speicherung* impliziert keine Mikrosekunden-*Absolutgenauigkeit*. Behandeln Sie absolute RT als frame-genau, Differenzen als Sub-Millisekunden-genau.

---

## 10.1 Kernkonzepte

Das Reaktionssystem verwendet ein kleines, praezises Vokabular. Diese Begriffe werden in diesem Handbuch durchgaengig genutzt (siehe auch den Glossar-Anhang).

| Begriff | Bedeutung |
|---|---|
| **Paradigm** | Eine wissenschaftliche Prozedurvorlage fuer eine Reaktionsaufgabe (PVT, Simon, Stroop, ...), die die Trial-Struktur definiert und festlegt, was als korrekte Antwort zaehlt. |
| **Preset** | Eine gespeicherte, benannte Parametrisierung eines Paradigm. Ein Preset definiert nie eine neue Prozedur -- nur Parameterwerte. |
| **Trial** | Ein vollstaendig materialisierter Stimulus->Antwort-Zyklus. Jeder Wert, den ein Trial verwendet -- Timings, Stimulus, korrekte Optionen -- ist eine konkrete Zahl, die zum Erzeugungszeitpunkt fixiert wird. |
| **TimingSpec** | Eine autorenseitig festgelegte Phasendauer, die entweder ein fixer Wert oder eine Verteilung ist (heute uniform min/max), pro Trial vom geseedeten Generator gesampelt. |
| **ResponseSet** | Die benannte, geordnete Liste von ResponseOptions, die ein Trial scharfschaltet; ein Trial akzeptiert genau eine gewinnende Antwort. |
| **ResponseOption** | Eine semantische Antwortalternative, identifiziert durch eine stabile id (`left`, `target-present`, ...), auf die sich Analyse und Export stuetzen -- unabhaengig davon, welche physische Eingabe sie erzeugt hat. |
| **Binding** | Die Anbindung einer physischen Eingabe (einer Tastaturtaste, eines HID-Buttons, einer Beruehrungsregion) an eine ResponseOption, einschliesslich der Frage, ob sie bei press oder release ausloest. |
| **ResponseSource** | Eine Geraetefamilie, die Antworten liefern kann -- Tastatur, Zeiger, Touch, Gamepad oder ein WebHID-Geraet. Mehrere koennen gleichzeitig scharfgeschaltet sein; das erste Ereignis gewinnt. |
| **ValidityPolicy** | Eine studienweite Haltung gegenueber verschlechterten Timing-Bedingungen. Der Standard, `record`, stempelt Provenienz und faehrt fort (siehe Kapitel 11). |
| **Offline-complete** | Der Zustand, in dem jedes Asset, das eine Studie praesentieren kann, im lokalen Speicher vorliegt. Reaktionsstudien mit Medien muessen diesen erreichen, bevor irgendein zeitkritischer Block startet. |

### 10.1.1 Die zwei Rendering-Pfade

Die Fillout-Laufzeitumgebung hat genau einen Zeichenpfad fuer zeitkritische Stimuli und einen fuer alles Uebrige (ADR 0023). Stimuli fuer Reaktions-Paradigmen werden vom **WebGL-Renderer** (`renderer/WebGLRenderer`) gezeichnet, angetrieben von der **ReactionEngine** (`runtime/reaction/ReactionEngine`) -- frame-exakter Onset ist der Grund, warum dieser Pfad existiert. Gewoehnliche Formularfragen, Instruktionen und Feedback werden als DOM-Overlays gerendert. Als Autorin oder Autor waehlen Sie nie zwischen ihnen; das Hinzufuegen einer Reaktionsfrage stellt diese Frage automatisch auf den WebGL-Pfad.

### 10.1.2 Materialisierung zum Erzeugungszeitpunkt

Eine praegende Architekturentscheidung (ADR 0025) besagt, dass **die Engine zur Laufzeit nie etwas sampelt**. Jede randomisierbare Groesse -- gejitterte Phasendauern, Stimulussequenzen, Counterbalancing -- wird von einem geseedeten Generator gezogen, wenn die Trials *materialisiert* werden, bevor der Block laeuft. Die Engine erhaelt nur konkrete Zahlen pro Trial und fuehrt sie aus.

Die Konsequenz fuer Sie als Forschende ist Reproduzierbarkeit und Nachpruefbarkeit:

- **`seed + sessionId` => eine identische Trial-Sequenz.** Ein erneuter Durchlauf einer Sitzung mit demselben Seed rekonstruiert exakt dieselben Timings und Stimuli.
- **Jeder gesampelte Wert ist Datum, kein Laufzeitzufall.** Die materialisierten Dauern werden pro Trial persistiert (`sampledTimings`), sodass eine Analystin die exakte Foreperiod sehen kann, die ein bestimmter Trial verwendet hat.
- **Eine ausschliesslich mit fixen Timings erstellte Studie zieht nichts aus dem RNG** -- sie erzeugt eine byte-identische Sequenz zur Engine vor der TimingSpec. Nur eine Verteilung verbraucht eine Ziehung.

---

## 10.2 Ein Paradigm waehlen

Fuegen Sie im Fragebogen-Designer eine **Reaction Time**-Frage hinzu und oeffnen Sie ihre Eigenschaften. Das erste Steuerelement ist der **Paradigm**-Selektor. Sechzehn eingebaute Paradigmen werden mitgeliefert; fuenfzehn sind prozedurfixe wissenschaftliche Vorlagen, eines (**Custom Trial Plan**) ist ein vollstaendig autorendefinierter Block-Builder.

| Designer-Label | Hinweise |
|---|---|
| Standard Reaction Time | Einfache/Wahl-RT; frei abbildbare Antworten. |
| N-Back | Match / Non-Match gegen *n* Trials zurueck. |
| Stroop | Farb-Wort-Interferenz. |
| Flanker (Eriksen) | Kongruente / inkongruente Flanker. |
| Implicit Association Test (IAT) | Sieben-Block-IAT mit Unterstuetzung fuer *D*-Score. |
| Dot-Probe | Probe fuer Aufmerksamkeitsverzerrung. |
| Go / No-Go | Reagieren vs. unterdruecken. |
| SART | Anhaltende Aufmerksamkeit, Unterdruecken bei der Zielziffer. |
| Simon | Raeumliche Stimulus-Antwort-Kompatibilitaet. |
| Posner Cueing | Valides / invalides raeumliches Cueing. |
| Visual Search | Set-Size-Steigung; Ziel vorhanden / abwesend. |
| Sternberg Memory Search | In-Set-/Out-of-Set-Gedaechtnisdurchsuchung. |
| PVT (Psychomotor Vigilance) | Vigilanz mit zufaelliger Foreperiod; zeichnet false starts auf. |
| Temporal-Order Judgment | Welcher von zwei Stimuli zuerst kam. |
| RSVP | Rapid serial visual presentation mit einem Ziel. |
| Custom Trial Plan | Erstellen Sie Bloecke und Trials selbst im visuellen Editor. |

**Presets vs. Paradigmen.** Ein Paradigm zu waehlen und seine Felder anzupassen (Trial-Anzahl, Kongruenz-Verhaeltnis, Timings, Tasten) *ist* das Erstellen eines Preset -- einer benannten Parametrisierung. Ein Preset veraendert nie die zugrunde liegende Prozedur; es setzt nur Werte.

Unterhalb des Selektors setzt **"Reset Selected Paradigm To Starter"** die Felder des aktuellen Paradigm mit sinnvollen Standardwerten neu auf. Jedes prozedurfixe Paradigm materialisiert seine Trials aus der Top-Level-Konfiguration zur Kompilierzeit; nur das **Custom Trial Plan**-Paradigm speichert einen autorenseitig festgelegten Blockplan (sein **Visual Trial Blocks**-Editor, siehe 10.6).

---

## 10.3 Timing: TimingSpec und Jitter

Jede Phasendauer in einer Reaktionsaufgabe ist eine **TimingSpec** -- entweder ein einzelner fixer Wert in Millisekunden oder eine **uniforme Verteilung**, pro Trial gesampelt. So fuehren Sie den Jitter ein, der Antizipation verhindert (eine zufaellige Foreperiod, ein variables ISI, ein gejittertes Inter-Trial-Intervall).

### 10.3.1 Der Jitter-Schalter

Im Designer ist jedes Timing-Feld ein kompaktes Steuerelement mit einer **Jitter**-Checkbox:

- **Jitter aus** -- eine einzelne Fix-ms-Zahleneingabe. Identisch zu einer einfachen Dauer; verbraucht keine Zufallsziehung.
- **Jitter ein** -- eine **min**-Eingabe, das Wort **to**, eine **max**-Eingabe und eine **ms**-Einheit. Der geseedete Generator zieht fuer jeden Trial einen Wert uniform in `[min, max]` (inklusiv, auf ganze ms gerundet).

Auf diese Weise autorenseitig festgelegte Felder umfassen unter anderem die PVT-/Vigilanz-**Foreperiod / ISI (ms)**, die Sternberg-**Per-Item Study (ms)** und **Retention (ms)**, Posner-**Cue Duration (ms)** und **Cue->Target SOA (ms)**, SART-**Digit Duration (ms)**, RSVP-**Item Duration (ms)** und die paradigmenspezifische **Response Timeout (ms)**. Dieselbe Steuerelementform deckt sie alle ab.

### 10.3.2 Validierung (min <= max)

Timing-Felder werden inline waehrend der Eingabe validiert (sie werden bei einem Fehler rot), sodass fehlerhafte Timings zur Erstellungszeit statt beim Veroeffentlichen auffallen:

- Ein Jitter-Bereich mit einem Minimum ueber seinem Maximum ist ein **Fehler**: *"...: jitter minimum cannot exceed the maximum."*
- Ein Bereich der Breite null (min gleich max) ist eine **Warnung**: *"...: jitter min and max are equal -- no variation."* -- er jittert nichts.
- Ein Bereich, der beide Grenzen numerisch benoetigt, meldet *"...: jitter needs a numeric minimum and maximum."*

### 10.3.3 Reproduzierbare Sampling-Reihenfolge

Wenn ein Trial mehrere Felder jittert, sampelt der Generator sie in einer fixen, dokumentierten Reihenfolge pro Feld (jedes Paradigm nennt seine Reihenfolge -- die PVT etwa zieht *Foreperiod -> Response Timeout*). Dies haelt den geseedeten Strom reproduzierbar: derselbe Seed und dieselbe Session-Id rekonstruieren dieselben Ziehungen pro Feld in derselben Reihenfolge. Das TimingSpec-Objekt ist bewusst so geformt, dass es kuenftige benannte Verteilungen (exponentiell usw.) aufnehmen kann, ohne die Engine zu aendern -- nur die Erzeugungsschicht.

---

## 10.4 Antworten: ResponseSets und Bindings

Ein Trial schaltet ein **ResponseSet** scharf: eine geordnete Liste von **ResponseOptions**, jede identifiziert durch eine stabile semantische **id** (`left`, `go`, `target-present`), auf die sich Ihre Analyse und Ihr Export stuetzen. Jede Option traegt ein oder mehrere **Bindings**, die eine physische Eingabe an sie anbinden. Mehrere **ResponseSources** koennen gleichzeitig scharfgeschaltet sein -- Tastatur, Zeiger, Touch, Gamepad, WebHID -- und das **erste Ereignis gewinnt**; die Provenienz zeichnet auf, welche Quelle und welches Binding ausgeloest hat.

Dieses Modell ersetzt das aeltere `validKeys`-/`correctResponse`-Schema. Bestehende Inhalte, die noch die Legacy-Felder verwenden, werden zur Laufzeit verlustfrei in ein ResponseSet kompiliert, sodass nichts kaputtgeht -- neue Autorenschaft sollte jedoch in Optionen und Bindings denken.

### 10.4.1 Welche Paradigmen frei abbildbar sind

Nur zwei Paradigmen zeigen den vollen **Responses**-Editor: **Standard Reaction Time** und **Custom Trial Plan**. Diese sind autorendefiniert -- Sie legen die Optionen und ihre Eingaben fest.

Jedes andere Paradigm ist **prozedurfix**: seine Antwortstruktur ist Teil der wissenschaftlichen Prozedur, daher werden seine Tasten in den eigenen Feldern dieses Paradigm konfiguriert, und das Preset baut das ResponseSet fuer Sie. Im Responses-Panel zeigen diese Paradigmen einen schreibgeschuetzten Hinweis, der auf den Ort verweist, an dem ihre Antworten leben -- zum Beispiel:

- **Go / No-Go** -- die einzelne Response Key (bei No-Go unterdruecken)
- **Flanker (Eriksen)** -- die zwei Valid Response Keys (links / rechts)
- **IAT** -- die fixen E-/I-Kategorietasten ueber seine sieben Bloecke
- **Simon**, **Posner** -- die Left-/Right-Tasten
- **Visual Search** -- die Present-/Absent-Tasten
- **Sternberg** -- die In-Set-/Out-of-Set-Tasten

### 10.4.2 Ein ResponseSet erstellen (standard / custom)

Fuer ein frei abbildbares Paradigm startet das **Responses**-Panel von Ihren **Valid Response Keys** / Geraeteeinstellungen aus. Klicken Sie auf **"Customize response set"**, um es zu bearbeitbaren Optionen zu erweitern. Fuer jede Option legen Sie fest:

- **Label** (menschenlesbar) und **Option id** (der stabile Analyseschluessel; aus dem Label automatisch vorgeschlagen, muss eindeutig sein -- eine doppelte oder leere id wird markiert).
- **Correct response** -- eine Checkbox, die die als korrekt gewertete(n) Option(en) markiert. Eine markierte Option wird eigenstaendig gewertet, unabhaengig vom Legacy-Umschalter *Require correct response*.
- **Bindings** -- klicken Sie auf **"Add binding"** und waehlen Sie eine Quelle: **Keyboard**, **Mouse**, **Touch**, **Gamepad** oder **HID device**.

Binding-Details nach Quelle:

- **Keyboard** -- press-to-capture der Taste, plus ein Flankenselektor: **on press** (down) oder **on release** (up). Key-up-Erfassung unterstuetzt Halte-/Loslass-Paradigmen.
- **Mouse / Touch** -- entweder *any click/tap* oder *limit to region* mit normalisiertem Mittelpunkt `x`, `y` und `radius` (0-1 Canvas-Raum, viewport-unabhaengig).
- **Gamepad** -- ein Button-Index (0-31).
- **HID device** -- eine Button-Nummer (0-255) und eine press/release-Flanke (siehe 10.5).

Eine einzelne Option kann mehrere Bindings gleichzeitig tragen -- z.B. dieselbe `go`-Option auf einer Tastaturtaste **und** einem HID-Button -- sodass ein Hardware-Teilnehmer und ein Tastatur-Teilnehmer dieselbe semantische Option beantworten und die Analyse eine id sieht, unabhaengig davon, welche ausgeloest hat.

---

## 10.5 Externe Antwort-Hardware (WebHID)

Fuer Labore, die physische **Button-Boxen** verwenden, steht eine externe **ResponseSource** ueber die **WebHID**-API des Browsers zur Verfuegung (ADR 0024). HID-`inputreport`-Ereignisse tragen einen hochaufloesenden Zeitstempel auf derselben Uhr wie Tastaturereignisse, sodass die RT-Arithmetik unveraendert bleibt -- Hardware-Antworten werden exakt wie Tastaturantworten gemessen.

### 10.5.1 Nur Chromium, und ehrlich damit

WebHID existiert nur in Chromium-basierten Browsern (Chrome, Edge). Teilnehmende auf Safari oder Firefox erhalten nur Tastatur/Touch/Zeiger. Die Plattform legt dies offen, statt es zu verbergen:

- Im ResponseSet-Editor erscheint, sobald eine Option einen HID-Button bindet, ein Hinweis: *"HID (button box) responses need Chrome or Edge; participants connect the device on the study's welcome screen. ... Keyboard, mouse or touch bindings on the same option keep working as a fallback."* Geben Sie HID-Optionen stets ein Tastatur-/Touch-Fallback-Binding fuer browseruebergreifende Teilnehmende.
- Die Geraetequalifizierung zeichnet auf, ob WebHID ueberhaupt verfuegbar ist und ob ein Geraet bereits freigegeben wurde, sodass eine Analystin weiss, dass ein Teilnehmer eine Box haette verwenden *koennen*.

### 10.5.2 Ein Geraet verbinden (Teilnehmerseite)

Wenn eine Studie eine HID-Antwort bindet, zeigt der **Willkommensbildschirm** des Teilnehmers eine optionale Schaltflaeche **"Connect response device"** (mit dem Hinweis *"Optional -- connect a hardware button box now, or just use the keyboard/touch."*). Dies ist gesten-gebunden (Browser verlangen fuer die Berechtigungsabfrage eine Nutzergeste). Ein bei einem frueheren Besuch freigegebenes Geraet verbindet sich stillschweigend erneut. Auf einem Nicht-Chromium-Browser wird das Steuerelement durch eine Erklaerung des Tastatur-/Tipp-Fallbacks ersetzt statt durch einen toten Button. Das Verbinden ist nie verpflichtend.

### 10.5.3 Button-Nummern werden empirisch entdeckt

Der HID-Adapter ist **descriptor-frei**: Er liest den HID-Descriptor eines Geraets nicht. Stattdessen erkennt er, welches Report-Bit sich zwischen dem Zustand "alle losgelassen" und einem Druck geaendert hat (ein Bit-Diff), und dieser Bit-Index ist die Nummer des Buttons. Praktisch bedeutet dies, dass Sie die Nummer eines Buttons **durch Druecken entdecken** und das erfasste Binding ablesen -- es gibt keine Herstellerbeschriftungen, auf die man sich verlassen koennte. Dies funktioniert fuer die in psychologischen Laboren gaengigen Bitfeld-Button-Boxen; exotischere Report-Layouts lassen sich moeglicherweise nicht sauber abbilden.

### 10.5.4 Gamepad ist Komfort, nicht Praezision

Eine **Gamepad**-ResponseSource existiert ebenfalls und ist praktisch fuer die Erstellung (die *Press to Bind*-Funktion des Designers laesst Sie einen Button durch Druecken binden). Seien Sie sich jedoch ueber sein Timing im Klaren: Die Gamepad-API ist **gepollt**, nicht ereignisgesteuert. Der Poller sampelt einmal pro Animations-Frame und erkennt die steigende Flanke, sodass Antworten **auf die Frame-Schleife quantisiert sind (~8-16 ms)**. Behalten Sie Gamepad fuer den Komfort dort, wo diese Aufloesung akzeptabel ist; behandeln Sie es **nicht** als praezise RT-Quelle. Fuer Timing in Hardware-Qualitaet verwenden Sie die Tastatur oder eine WebHID-Button-Box.

> **Bewusst zurueckgestellt.** TTL-/Trigger-*Ausgabe* fuer EEG-/Eye-Tracker-Synchronisation sowie Photodioden-/Loopback-Hardware zur Timing-Validierung sind absichtlich nicht in v1 enthalten (ADR 0024). Der Browser kann noch nicht eingrenzen, wann eine Ausgangsspannung umschlaegt; ein Photodioden-Fast-Follow wuerde das Anzeigelatenz-Modell von *modelliert* auf *gemessen* aufwerten.

---

## 10.6 Der Custom Trial Plan (visueller Block-Editor)

Das **Custom Trial Plan**-Paradigm schaltet den **Visual Trial Blocks**-Editor ein -- vollstaendig programmierbare Reaktionsaufgaben ohne JSON. Sie erstellen **Bloecke** (jeder mit einer id, einem Namen, einem **Kind** aus Practice / Test / Custom, **Block Repetitions** und **Randomize Trial Order**) und innerhalb jedes Blocks **Trials** (Stimulus, Valid Keys, Correct Response, Fixation, Response Timeout, Inter-Trial-Intervall und Wiederholung pro Trial).

Ein Block kann an ein Genauigkeitskriterium gekoppelt werden: **"Gate on accuracy criterion (practice)"** wiederholt einen Practice-Block, bis der Teilnehmer eine **Min accuracy (%)** erreicht oder ein **Max attempts**-Budget aufgebraucht ist. So implementieren Sie kriterienbasierte Uebung.

Da Trials zum Erzeugungszeitpunkt materialisiert werden, wird der von Ihnen erstellte Custom Plan genauso in konkrete Werte pro Trial umgewandelt wie ein eingebautes Paradigm -- Jitter, Counterbalancing und Randomisierung loesen sich allesamt in fixe Zahlen auf, bevor der Block laeuft.

---

## 10.7 Stimuli

Ein Reaktionsstimulus ist eine von fuenf erstellbaren Arten, gewaehlt mit dem **Stimulus Type**-Steuerelement: **Text**, **Shape**, **Image**, **Video** oder **Audio**.

| Art | Was Sie festlegen | Timing-Hinweise |
|---|---|---|
| **Text** | Der anzuzeigende Text; Schriftgroesse/-familie; Farbe; Position. | Zu einer Textur gerendert; Onset ist der erste praesentierte Frame. |
| **Shape** | Kreis / Quadrat (und Rechteck / Dreieck in Trial Plans); Farbe; Groesse; Position. | Einzelner GPU-Draw; kein Asset-Laden. Niedrigste-Latenz-Wahl. |
| **Image** | Ein Asset aus der Mediathek (bevorzugt) oder eine Remote-URL. | Am Block-Gate zu einer Textur dekodiert (siehe 10.8). |
| **Video** | Ein Medien-Asset/URL; autoplay/muted/loop. | Vollstaendig vor dem Block geladen; Onset ueber die Frame-Callback-Uhr korrigiert. |
| **Audio** | Ein Medien-Asset/URL; Lautstaerke. | Keine visuelle Ausgabe; Onset beim Abspielen markiert, um Ausgabe-/DAC-Latenz korrigiert. |

Die Fixation wird separat konfiguriert (**Fixation Type** cross/dot, **Fixation Duration**).

> **Ein Hinweis zu "Custom-Shader"-Stimuli.** Fruehere Dokumentation beschrieb einen erstklassigen GLSL-Custom-Shader-Stimulustyp. Dieser Pfad wurde **verworfen** und ist keine funktionale Stimulusart: Ein Trial, dessen Stimulus ein roher Shader ist, wird per Design invalidiert (Audit-Befund W-17). Erstellen Sie prozedurale visuelle Effekte stattdessen als Shapes/Images/Video. Das Stimulus-Dropdown bietet genau die fuenf oben genannten Arten.

Der visuelle Stimulus-Onset wird nicht aufgezeichnet, wenn der Stimulus *angefordert* wird, sondern wenn der **erste Frame, der ihn enthaelt, tatsaechlich praesentiert wird** (die Engine schaltet einen Onset-Detektor scharf und stempelt den korrigierten Onset auf den naechsten praesentierten Frame). Frame-genaue Offsets sind fuer Kurzexpositions-/Masking-/RSVP-Dauern verfuegbar, indem praesentierte Frames gezaehlt werden statt einen Timer zu verwenden.

---

## 10.8 Medien: Offline-Complete und Fail-Closed

Medienbehaftete Reaktionsstudien erhalten eine zweischichtige Garantie (ADR 0026), sodass **kein Teilnehmer je einen zeitkritischen Block mit fehlenden Stimuli laeuft** und keine Netzwerk-I/O oder Dekodierung je auf dem zeitkritischen Pfad geschieht.

### 10.8.1 Schicht 1 -- Bytes beim Laden gecacht (automatisch)

Bereits das *Laden* des Fragebogens cacht **alle** seine Assets lokal, einschliesslich der ueber `mediaId` referenzierten Reaktionsstimuli (abgerufen ueber den Same-Origin-Medien-Proxy). Jeder Teilnehmer, der die Studie geoeffnet hat, ist bereits **Offline-complete**. Auf dem Willkommensbildschirm existiert zusaetzlich eine explizite **"Offline verfuegbar machen"**-Funktion zur Vorab-Bereitstellung im Feld (ein optionales sekundaeres Steuerelement, das den Fortschritt "N von M" und einen Ready-/Partial-/Error-Zustand meldet) -- das Erreichen von Offline-complete geschieht jedoch automatisch beim Laden, nie durch Teilnehmerwahl.

### 10.8.2 Schicht 2 -- Dekodier-Gate pro Block (sichtbar)

Unmittelbar vor dem ersten Trial eines Blocks wird jedes von diesem Block referenzierte Asset aus dem lokalen Cache geladen und **vollstaendig dekodiert** -- Image->textur-bereite Bitmap, Audio->WebAudio-Puffer, Video->vollstaendig geladenes Blob mit dekodiertem erstem Frame. Dies laeuft hinter einem sichtbaren Zustand **"Preparing stimuli... N of M"** (Reize werden vorbereitet ... N von M) auf dem Reaktions-Canvas. Sobald das Gate frei ist, laeuft der Block mit null Asset-Arbeit auf dem kritischen Pfad.

### 10.8.3 Fail-Closed

Wenn eine der beiden Schichten nicht abschliessen kann -- ein fehlendes Asset, ein Dekodier-Fehler oder ein Speicher-Quota-Problem -- **weigert sich der Block zu starten** und zeigt einen ehrlichen, wiederholbaren Bildschirm:

> Some stimuli for this task couldn't be prepared.
> Check your connection, then press any key to try again.

(*Einige Reize fuer diese Aufgabe konnten nicht vorbereitet werden. Pruefen Sie Ihre Verbindung und druecken Sie dann eine beliebige Taste, um es erneut zu versuchen.*)

Das Gate wiederholt sich, bis jedes Asset bereit ist (oder der Trial abgebrochen wird). Es laeuft nie einen zeitkritischen Block mit unvollstaendigen Stimuli -- *"timing cannot be altered by missing data."* Als zusaetzliche Absicherung wird ein Trial, dessen visueller Stimulus nie den Renderer erreicht, mit `invalidated: 'no-stimulus'` gestempelt, statt stillschweigend gegen einen leeren Bildschirm gemessen zu werden. Eine per Design akzeptierte Konsequenz: Eine Studie, deren Medien das Speicher-Quota eines Geraets ueberschreiten, ist auf diesem Geraet nicht lauffaehig -- Reaktions-Assets werden gegen Cache-Verdraengung *gepinnt* statt stillschweigend verworfen.

---

## 10.9 Was ein Trial aufzeichnet

Reaktionsdaten sind **pro Trial**, nicht pro Block. Jeder abgeschlossene Trial wird lokal geschrieben (verschluesselt im Ruhezustand) und als eigener Datensatz synchronisiert; der Server speichert ihn in einer `trials`-Tabelle, die mit der versionsgepinnten Sitzung verknuepft ist, mit der Reaktionszeit in **Mikrosekunden** (`rt_us`, gefloort `ms x 1000`). Die Speicherung pro Trial ist die Quelle der Wahrheit -- ein Absturz mitten in einem Block verliert keine abgeschlossenen Trials, und der Export stuetzt sich auf die Zeilen pro Trial statt auf einen Blockdurchschnitt.

### 10.9.1 Die tidy-Zeile pro Trial

Jeder Trial flacht zu einer Zeile im kanonischen Long-Format-("tidy")-Export ab, mit einer stabilen Spaltenreihenfolge. Die Spalten umfassen:

| Spalte | Bedeutung |
|---|---|
| `trial_number`, `trial_id`, `block_id`, `condition` | Trial-Identitaet und Design-Zelle. |
| `is_practice`, `counterbalance_cell` | Practice-Flag; zugewiesene Counterbalance-Zelle. |
| `stimulus_kind` | shape / text / image / video / audio. |
| `response_key`, `expected_response`, `is_target` | Die Antwort und was erwartet wurde. |
| `reaction_time_ms` | Berichtete RT, bei 0 abgeschnitten. |
| `raw_rt_ms` | *Vorzeichenbehaftete* rohe RT (`response - onset`); kann bei einem Same-Frame-/Pre-Onset-Ereignis negativ sein. |
| `is_correct`, `timeout` | Genauigkeitsurteil; ob das Fenster verstrichen ist. |
| `anticipatory`, `false_start_count` | Pre-Onset-(false-start-)Flag und -Zaehler. |
| `onset_method`, `response_method` | Welche Uhr Onset / Antwort gestempelt hat (siehe unten). |
| `response_device` | keyboard / mouse / touch / gamepad / hid. |
| `display_latency_ms`, `output_latency_ms` | Modellierte visuelle Anzeigelatenz; in den Onset eingerechnete Audio-Ausgabelatenz. |
| `offset_method`, `actual_duration_frames` | Wie der Stimulus-Offset geplant wurde; gemessene Frame-Exposition. |
| `hold_duration_ms` | Tasten-Haltedauer (down->up), fuer Halte-/Loslass-Paradigmen. |
| `stimulus_onset_time`, `stimulus_offset_time` | Hochaufloesende On-/Off-Zeitstempel. |
| `fps`, `dropped_frames`, `jitter` | Frame-Gesundheit waehrend des Trials. |
| `invalid`, `invalid_reason` | Ob der Trial invalidiert wurde und warum. |
| `exclude_from_analysis`, `exclude_reason` | Analysebereites Ausschluss-Flag (siehe Kapitel 11). |

### 10.9.2 Gesampelte Timings vs. gemessene Provenienz

Zwei verschiedene Blobs begleiten jeden Trial und sollten nicht verwechselt werden:

- **`sampledTimings`** -- der *materialisierte* Phasenplan (ADR 0025): die konkreten Dauern, die der geseedete Generator fuer diesen Trial gezogen hat (Fixation, Foreperiod, Stimulus, Antwortfenster, Inter-Trial). Dies ist, was den Durchlauf *angetrieben* hat, und ist vollstaendig aus dem Seed reproduzierbar.
- **`provenance`** -- die *gemessene* Timing-Umgebung: die Onset-/Antwort-Methoden, modellierte `displayLatencyMs` / eingerechnete `outputLatencyMs`, vorzeichenbehaftete `rawRtMs`, false-start-Flags, Frame-Statistiken (fps, verworfene Frames, jitter), `crossOriginIsolated`, die gemessene `timerResolutionMs`, die `measuredRefreshRateHz` und jeder `invalidated`-Stempel. Dies ist, was auf dem Geraet *tatsaechlich geschehen* ist.

### 10.9.3 Timing-Methoden

Die Uhr, die jeden Onset/jede Antwort gestempelt hat, wird als eine der folgenden aufgezeichnet: `event.timeStamp` (Tastatur-/Zeiger-/HID-Eingabe), `rvfc` (Video ueber `requestVideoFrameCallback`), `audioContext` (Audio-Onset ueber die Audio-Uhr), `raf` (visueller Onset ueber den Animations-Frame-Zaehler), `gamepad.timestamp` oder `performance.now` (Fallback). Das Aufzeichnen der Methode erlaubt es einer Analystin, exakt nachzupruefen, wie jeder Zeitstempel gewonnen wurde.

### 10.9.4 PVT-Antizipation wird aufgezeichnet, nicht verworfen

In der **PVT** ist ein Druck waehrend der zufaelligen Foreperiod (vor dem Ziel) ein *false start* -- ein primaeres PVT-Mass. Das Preset schaltet Antworten waehrend der Foreperiod scharf, sodass ein verfruehter Druck als antizipatorische Antwort **erfasst** wird (gezaehlt in `false_start_count`, geflaggt `anticipatory`, ueber den false-start-Hook herausgefuehrt) statt stillschweigend verworfen zu werden (Audit-Befund W-4). Der Druck loest den Trial nie auf -- der Teilnehmer reagiert weiterhin auf das tatsaechliche Ziel -- aber die Antizipation ist nun in den Daten, sodass Lapse- und Antizipations-Metriken vollstaendig sind.

---

## 10.10 Timing-Praezision -- Was die Zahlen bedeuten

Dieser Abschnitt ist bewusst konservativ. Berichten Sie Timing so, wie die Plattform es tatsaechlich misst.

### 10.10.1 Die Uhr und Cross-Origin-Isolation

Alle Zeitstempel verwenden `performance.now()` -- monoton, relativ zum Zeitursprung der Seite. Ihre Aufloesung haengt jedoch von der **Cross-Origin-Isolation** (COOP/COEP) ab. Wenn die Seite cross-origin-isoliert **ist**, betraegt das effektive Quant ~5 µs; wenn sie es **nicht** ist, klammern Browser es Richtung ~100 µs. Die Engine misst das effektive Quant pro Trial und zeichnet es auf (`timerResolutionMs`), zusammen mit dem `crossOriginIsolated`-Flag. Die volle Timer-Aufloesung erfordert daher, dass die Studie mit den Isolations-Headern ausgeliefert wird; ohne sie verschlechtert sich die Sub-ms-Aussage stillschweigend -- genau darum wird das Flag auf jeden Trial gestempelt (siehe Kapitel 11).

### 10.10.2 Onset-Korrektur ist modelliert, nicht gemessen

Der visuelle Onset ist der erste *praesentierte* Frame plus eine **Anzeigelatenz-Korrektur** -- diese Korrektur ist jedoch ein uniformes Ein-Frame-Modell (das mittlere Frame-Intervall), keine Photodioden- oder GPU-Fence-Messung. Der Audio-Onset rechnet die vom Audiosystem gemeldete Ausgabe-/DAC-Latenz ein. Beide Korrekturen sind ehrliche Schaetzungen derselben Groessenordnung in jedem Trial, sodass sie sich **in einem Differenzwert aufheben** -- weshalb relative RT ueberlebt, waehrend absolute RT nicht mehr als Frame-Genauigkeit beansprucht.

### 10.10.3 Speicherpraezision != Absolutgenauigkeit

RT wird als ganzzahlige Anzahl von **Mikrosekunden** (`rt_us`) gespeichert, um Fliesskommaverlust zu vermeiden und Statistikpaketen eine saubere Ganzzahlspalte zu geben. Ganzzahl-Mikrosekunden-*Speicherung* ist keine Aussage ueber Mikrosekunden-*Absolutgenauigkeit*. Die belastbare Lesart lautet: **frame-genauer absoluter Onset; relative Sub-Millisekunden-Praezision bei Differenzwerten.**

### 10.10.4 Frame-Gesundheit

Jeder Trial zeichnet `fps` auf, ein reales Jitter-Mass (Standardabweichung der Frame-Zeiten) und einen Zaehler verworfener Frames auf Basis der **gemessenen** Bildwiederholrate (die Engine zaehlt Drops gegen die gemessene Bildwiederholrate, nicht gegen eine nominelle Ziel-FPS, sodass Drop-Zaehler auf einem 60-Hz-Display ehrlich sind). Verwenden Sie Jitter- und Drop-Zaehler, um Trials auszusortieren, deren Anzeige-Timing schlecht war.

---

## 10.11 Best Practices fuer zeitkritische Studien

### 10.11.1 Display und Umgebung

1. Liefern Sie die Studie **cross-origin-isoliert** aus (COOP/COEP), damit der Timer nicht geklammert wird -- verifizieren Sie `crossOriginIsolated` in der aufgezeichneten Provenienz.
2. Bevorzugen Sie ein **Display mit hoher Bildwiederholrate** und setzen Sie die Ziel-FPS des Paradigm passend zum Geraet.
3. Verwenden Sie **Vollbild**, deaktivieren Sie OS-Benachrichtigungen und Energieverwaltung und bevorzugen Sie eine **kabelgebundene** Tastatur oder eine WebHID-Box.
4. Chromium-basierte Browser liefern das konsistenteste Timing (und sind fuer WebHID erforderlich).

### 10.11.2 Design

1. Verwenden Sie **Shape**- oder **Text**-Stimuli, wo die Wissenschaft es zulaesst -- sie tragen null Asset-Ladelatenz.
2. **Jittern** Sie Foreperiods/ISIs (uniform min/max), um Antizipation zu verhindern; halten Sie die Bereiche wissenschaftlich begruendet.
3. Geben Sie jeder **HID**-Option ein Tastatur-/Touch-Fallback-Binding, damit Nicht-Chromium-Teilnehmende weiterhin antworten koennen.
4. Setzen Sie einen **Seed** und zeichnen Sie die `sessionId` auf, damit die Trials einer Sitzung exakt rekonstruiert werden koennen.

### 10.11.3 Analyse-Hygiene

1. Schliessen Sie **antizipatorische** und **invalide** Trials aus -- der Export flaggt sie bereits in `exclude_from_analysis` (siehe 10.9 und Kapitel 11).
2. Sortieren Sie nach **Frame-Gesundheit** (`dropped_frames`, `jitter`) und nach dem **`invalidated`**-Provenienz-Stempel.
3. Berichten Sie **relative** Effekte (Differenzwerte) und beschreiben Sie absolute RT als frame-genau, nicht als mikrosekunden-genau.
4. Bevorzugen Sie den **Median** der RT -- RT-Verteilungen sind rechtsschief.

---

## 10.12 Zusammenfassung

| Funktion | Wie es funktioniert | Worauf man sich verlassen kann |
|---|---|---|
| Paradigmen | 16 eingebaut (15 prozedurfix + Custom Trial Plan) | Presets = gespeicherte Parametrisierungen |
| Timings | TimingSpec: fix oder uniform(min,max), **zum Erzeugungszeitpunkt gesampelt** | Reproduzierbar aus `seed + sessionId` |
| Antworten | ResponseSet semantischer Option-ids, Multi-Source-Bindings, first-wins | Analyse stuetzt sich auf die stabile `optionId` |
| Freie Abbildung | Nur **Standard** und **Custom Trial Plan** | Andere sind prozedurfix |
| Hardware | WebHID-Button-Boxen (nur Chromium, descriptor-freier Bit-Diff) | Dieselbe Uhr wie Tastatur; geben Sie ein Fallback |
| Gamepad | Einmal pro Frame gepollt (~8-16 ms) | Komfort, **nicht** Praezision |
| Medien | Schicht 1 Auto-Cache beim Laden + Schicht 2 Dekodier-Gate, **fail-closed** | Kein zeitkritischer Block laeuft je mit fehlenden Stimuli |
| Daten pro Trial | Tidy-Zeile + `sampledTimings` + gemessene `provenance`, `rt_us` | Pro Trial ist die Quelle der Wahrheit |
| Timing-Praezision | Frame-genauer Onset (modellierte Korrektur), relative Sub-ms | COOP/COEP fuer volle Timer-Aufloesung erforderlich |
| Validitaet | Verschlechtertes Timing gestempelt (`invalidated`, Isolation, Timer-Aufl.) | Standardmaessig aufgezeichnet -- siehe Kapitel 11 |

Wie invalidierte und ausgeschlossene Trials in aggregierte Statistiken einfliessen, beschreiben **Kapitel 11 (Datenqualitaet)** fuer das Validitaetsmodell und **Kapitel 12 (Analytik und Statistik)** fuer ihre Auswirkung auf berichtete Aggregate.
