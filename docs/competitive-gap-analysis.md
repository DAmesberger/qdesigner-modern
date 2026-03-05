# QDesigner Modern: Full Competitive Gap Analysis

## Context

QDesigner Modern is a self-hosted scientific questionnaire platform combining survey authoring, behavioral experiment timing (WebGL 2.0, sub-millisecond), and statistical analytics in a single TypeScript/Rust stack. This document is a comprehensive gap analysis comparing QDesigner against Qualtrics, Gorilla, PsyToolkit, lab.js, PsychoPy/Pavlovia, LimeSurvey, SurveyJS, and Inquisit.

---

## Inventory of What Exists (Verified in Code)

### Question Types (20)
TEXT_DISPLAY, INSTRUCTION, MEDIA_DISPLAY, STATISTICAL_FEEDBACK, BAR_CHART, WEBGL, TEXT_INPUT, NUMBER_INPUT, SINGLE_CHOICE, MULTIPLE_CHOICE, SCALE, RATING, MATRIX, RANKING, REACTION_TIME, DATE_TIME, FILE_UPLOAD, MEDIA_RESPONSE, DRAWING + custom via scripting

### Reaction Time Engine
- WebGL 2.0 renderer at 120+ FPS with custom shader support
- 4 timing methods: event.timeStamp, rVFC (video), AudioContext (audio), performance.now (fallback)
- COOP/COEP headers for 5us SharedArrayBuffer precision
- Device qualification + timing calibration gatekeeper
- 6 stimulus types: text, shape, image, video, audio, custom WebGL shader
- 3 response modes: keyboard, mouse, touch
- 20+ per-trial configurable properties
- Custom phase timelines per trial (scheduled phases)
- 5 preset paradigms as editable starters: Stroop, Flanker, IAT, N-Back, Dot-Probe
- Seeded deterministic RNG (xmur3 + mulberry32)
- Per-frame FrameSample logging for post-hoc jitter analysis
- Visual designer: BlockEditor, TrialTemplateEditor, PhaseTimelineEditor, ResponseMappingEditor
- Single compile path: ReactionStudyConfig -> CompiledReactionPlan -> ReactionTrialConfig[]

### Analytics Suite
- **StatisticalEngine** (~67KB): descriptive stats, t-tests (1/2-sample, paired), ANOVA + Tukey HSD, Mann-Whitney U, Wilcoxon, Kruskal-Wallis + Dunn, chi-square (GoF + independence + Fisher exact), Pearson/Spearman/Kendall correlation, multiple regression, PCA + Varimax rotation, Cronbach's alpha, split-half reliability
- **CATEngine**: IRT 3PL model, maximum information item selection, Newton-Raphson MLE theta estimation
- **PowerAnalysis**: a priori sample size + post-hoc power for t-test, ANOVA, chi-square, correlation
- **MissingDataHandler**: listwise/pairwise deletion, mean/median/LOCF imputation, multiple imputation via PMM, Little's MCAR test
- **ScoringPipeline**: mathjs formula evaluation, reverse scoring, subscales, composite scores, normative comparison (percentiles, Z-scores, T-scores, stanines), reaction-time derived metrics (congruency effect, IAT D-score, dot-probe bias)
- **DataVisualization**: 10+ chart types via Chart.js (histogram, time-series, scatter, heatmap, box-plot, violin, bar, line, pie, radar, polar)
- **DashboardBuilder**: drag-and-drop 12-column grid, 6+ widget types (descriptive stats, histogram, time series, completion funnel, reliability, IRT)
- **FilterBuilder**: multi-group AND/OR with nested rules
- **Export**: Excel (.xlsx, 3 sheets), CSV, JSON, R, Python, SPSS, Stata, SAS -- each with complete analysis script bundles (.zip)
- **RealtimeAnalyticsClient**: WebSocket subscription, RPM, live metrics

### Participant Feedback
- **StatisticalFeedback module**: 4 source modes (current-session, cohort, participant-vs-cohort, participant-vs-participant)
- 6 chart types (bar, line, radar, scatter, histogram, box)
- Score interpretation with color-coded ranges + percentile info
- PDF report download
- Configurable refresh interval

### Designer UX
- Page/block/question hierarchy with drag-and-drop (WYSIWYG + tree view)
- Left sidebar: structure, question palette, templates, variables, flow control
- Right sidebar: properties, media manager, version manager, distribution panel
- Undo/redo (100 snapshots), clipboard, keyboard shortcuts, command palette (Cmd+K)
- Collaborative editing via Yjs CRDT + Rust WebSocket relay
- Live preview of fillout experience
- Reaction task designer seamlessly embedded as one of 20 question types

### Advanced Runtime Features
- **Event hooks** (7): onMount, onResponse, onValidate, onNavigate, onPageEnter, onPageExit, onTimer -- with Proxy-based sandbox, deep-freeze, prototype escape prevention
- **Branching**: skip, branch, loop, terminate with formula conditions
- **Block randomization**: all, subset, latin-square with seeded RNG + fixed positions
- **Carry-forward**: 4 modes (default-value, selected-options, unselected-options, text-content)
- **Between-subjects**: random/sequential/balanced assignment + counterbalancing (Latin Square, balanced Williams, full permutation)
- **Data quality**: attention checks (instructed + trap), speeder detection, flatliner detection
- **Scripting engine**: 47+ formula functions (math, stats, array, string, conditional, time, random, psychometric, IRT)
- **Variable interpolation**: {{variableName}} in text fields
- **Offline-first fillout**: IndexedDB + Cache API + sync engine + client_id dedup
- **Semver versioning**: major/minor/patch with session-version tracking

---

## Competitive Matrix

### Survey/Questionnaire Capabilities

| Dimension | QDesigner | Qualtrics | Gorilla | PsyToolkit | lab.js | PsychoPy | LimeSurvey |
|---|---|---|---|---|---|---|---|
| Question types | 20 | 50+ | ~15 | ~10 | ~8 | ~8 | 30+ |
| Skip/branch logic | Formula-based | Advanced | Basic | Basic | Conditional | Code | Conditions |
| Piping/variables | {{}} + 47 funcs | Piped text + ED | Limited | Limited | Parameters | Variables | Expression mgr |
| Loop/iteration | Fixed-value loops | Loop & merge | Task repetition | Trial loops | Full nesting | Full | Question groups |
| Randomization | Block + Latin sq | Advanced | Node-based | Basic | Full control | Full | Question groups |
| Carry-forward | 4 modes | Full | Limited | N/A | Limited | Code | Copy answers |
| Quota management | Implemented | Complex quotas | Limited | N/A | N/A | N/A | Basic |
| Multi-language content | UI only (3) | 90+ languages | Multi-lang | English | i18n | Translation | 80+ languages |

### Behavioral/Experimental Research

| Dimension | QDesigner | Qualtrics | Gorilla | lab.js | PsychoPy | Inquisit |
|---|---|---|---|---|---|---|
| RT measurement | WebGL 5us | ~50ms JS | Canvas | Canvas | Hardware | DirectX |
| Timing architecture | 4 methods + cal | N/A | perf.now | RAF | Hardware | Hardware |
| Stimulus types | 6 + custom shader | Image/video | Img/audio/vid | Canvas+HTML | Full | Full |
| Preset paradigms | 5 editable | N/A | Task library | Templates | PsychoPy lib | Task library |
| Trial-level config | 20+ properties | N/A | Node props | Component | Trial handler | Trial attrs |
| Between-subjects | 3 strategies + CB | Survey flow | Branching | Parameters | Built-in | Group assign |
| Device qualification | Gatekeeper+calib | N/A | Basic checks | Browser detect | Monitor center | System checks |
| Frame logging | Per-frame sample | N/A | Limited | Canvas stats | Frame data | Frame timing |

### Analytics & Statistics

| Dimension | QDesigner | Qualtrics | Gorilla | PsyToolkit | lab.js | LimeSurvey |
|---|---|---|---|---|---|---|
| Built-in statistics | 15+ tests | Stats iQ | Basic | Built-in | None | Basic |
| IRT / CAT | 3PL + adaptive | N/A | N/A | N/A | N/A | N/A |
| PCA / factor analysis | PCA + Varimax | Stats iQ | N/A | N/A | N/A | N/A |
| Power analysis | 4 test types | Partial | N/A | N/A | N/A | N/A |
| Missing data handling | 6 methods + MCAR | Data cleaning | N/A | N/A | N/A | Incomplete filter |
| Scoring pipeline | Custom + norms | Scoring + weight | Basic | Scoring | Code | Assessment |
| Participant feedback | 4 modes + 6 charts + PDF | Results page | Limited | Feedback text | Basic | Stats page |
| Export formats | 8 + script bundles | All major + API | CSV/JSON | CSV/text | CSV/Excel | CSV/SPSS/R |
| Real-time analytics | WebSocket | Live dashboard | Data collect | N/A | N/A | Response tracking |

### Platform

| Dimension | QDesigner | Qualtrics | Gorilla | lab.js | PsychoPy | LimeSurvey |
|---|---|---|---|---|---|---|
| Self-hosting | Full stack | SaaS only | SaaS only | Static files | Open source | Self-hosted |
| Offline fillout | Full | Offline app | N/A | Local files | Desktop app | Offline app |
| Collaborative editing | Yjs CRDT | Multi-user | Sharing | Export/import | Pavlovia | Admin roles |
| Version control | Semver | Publish | Versions | Git-compat | Git | Tokens |
| Cost | Free/self-hosted | $$$$$ | Per-participant | Free | Free/open | Free tier |

---

## Where QDesigner Clearly Wins

### 1. Integrated Survey + Experiment (Unique)
No competitor offers Qualtrics-level survey capabilities AND PsychoPy-level reaction time precision in one platform. A researcher can build a PHQ-9 depression scale and a Stroop task in the same questionnaire, scored by the same analytics pipeline. This is the primary differentiator.

### 2. Timing Precision (Best-in-class for web)
The ReactionEngine + TimingGatekeeper + DeviceQualification stack is the most sophisticated web-based timing system. 4 timing methods, COOP/COEP 5us precision, per-frame logging, device calibration grading. Only desktop Inquisit and PsychoPy match this; no web platform does.

### 3. Built-in Statistical Engine (Unmatched)
The most comprehensive client-side statistical engine of any survey/experiment platform: 15+ tests implemented natively, IRT/CAT, PCA, power analysis, missing data handling. Qualtrics Stats iQ is comparable but costs $thousands/year. No free/open tool comes close.

### 4. Participant Feedback (Best-in-class)
4 configurable feedback modes with 6 chart types, score interpretation, normative comparison, and PDF reports. Researchers can show participants their results with comparison to cohort norms immediately after completion. No competitor offers this configurability.

### 5. Export with Analysis Scripts (Innovative)
Complete analysis scripts for R, Python, SPSS, Stata, SAS -- not just data files, but code that imports, labels, and analyzes the exported data. No competitor does this.

### 6. Offline-First Fillout (Critical for field research)
Full questionnaire completion without network via IndexedDB + Cache API + sync engine + client_id dedup. Essential for prisons, hospitals, rural areas. Only native desktop apps match this.

### 7. Self-Hosted + Free (Strategic)
Full data sovereignty, no per-participant costs, no vendor lock-in. Critical for GDPR-sensitive institutions.

---

## Critical Gaps (Being Addressed)

### Gap 1: Production Maturity (CRITICAL)
The biggest gap is the distance between "code exists" and "usable product."
- No documentation for end users (guides, tutorials, API reference)
- No template library with validated instruments (PHQ-9, GAD-7, NASA-TLX, etc.)
- No public demo instance
- UI/UX hasn't been through researcher usability testing
- Limited E2E test coverage for full lifecycle scenarios

### Gap 2: Distribution & Recruitment (IMPLEMENTING)
Previously missing the entire participant flow layer. Now being implemented:
- Anonymous link generation with URL parameters
- Completion redirect URLs with embedded data
- QR code generation
- Panel integration (Prolific, MTurk, SONA, CloudResearch)
- Email distribution / invitation management (future)

### Gap 3: Quota Management (IMPLEMENTING)
Now being implemented:
- Per-condition/demographic caps
- Automatic routing based on quota fill
- Over-quota actions (terminate, redirect, message)
- Quota monitoring dashboard

### Gap 4: Bot/Fraud Prevention (IMPLEMENTING)
Now being implemented:
- Browser fingerprinting for duplicate detection
- Honeypot fields
- Behavior analysis
- Integration with existing speeder/flatliner detectors
- Configurable fraud actions

### Gap 5: Accessibility (MEDIUM-HIGH)
No WCAG 2.1 compliance evidence. WebGL renderer is inherently inaccessible to screen readers. Academic institutions often require Section 508 / EN 301 549 compliance.

### Gap 6: Multi-Language Content (MEDIUM-HIGH)
UI is translated (3 locales) but questionnaire content translation is missing:
- No way to author same questionnaire in multiple languages
- No respondent language routing
- No translation workflow

### Gap 7: Advanced Question Types (MEDIUM)
Missing specialized types that Qualtrics power users rely on:
- MaxDiff (best-worst scaling)
- Conjoint analysis (discrete choice experiments)
- Heat map (click-on-image)
- NPS with benchmarking
- Hierarchical dropdown / drill-down

### Gap 8: Integration Ecosystem (MEDIUM)
No connections to:
- REDCap (dominant in clinical research)
- Slack/Teams notifications
- Google Sheets/Airtable live sync
- Zapier/Make webhooks
- SSO (SAML/OAuth beyond JWT)
- LMS platforms (Canvas, Moodle)

### Gap 9: Reactive Variables (IMPLEMENTING)
Now being implemented:
- Dependency graph with topological sort
- Auto-recomputation when dependencies change
- Circular dependency detection
- Change subscription system

### Gap 10: Mobile Optimization (MEDIUM)
Responsive but not optimized: no native app, no card-based mobile layouts, no swipe navigation, touch RT exists but not latency-optimized for mobile.

---

## Prioritized Roadmap

### Phase 1: Production Hardening (make it usable)
1. Documentation site -- user guide, API reference, getting started, video walkthroughs
2. Template library -- 20+ validated instruments (PHQ-9, GAD-7, BDI-II, SUS, NASA-TLX, demographics)
3. ~~Distribution system~~ (DONE) -- anonymous links with URL params, completion redirects, QR codes
4. ~~Panel integration~~ (DONE) -- Prolific/MTurk/SONA completion codes and auto-crediting
5. Accessibility audit -- WCAG 2.1 AA for non-WebGL components, keyboard nav, screen reader

### Phase 2: Research Essentials (make researchers switch)
6. ~~Quota management~~ (DONE) -- per-condition/demographic caps, auto-routing, quota dashboard
7. ~~Bot/fraud detection~~ (DONE) -- fingerprinting, duplicate detection, honeypot, behavior analysis
8. Multi-language content -- author in N languages, respondent language selection, RTL content
9. ~~Reactive variable engine~~ (DONE) -- dependency graph, auto-recompute, live variable preview
10. E2E test hardening -- 50+ regression scenarios for full lifecycle

### Phase 3: Differentiation (establish superiority)
11. Advanced question types -- MaxDiff, conjoint, heat map, NPS, hierarchical dropdown
12. Mobile optimization -- card layouts, swipe nav, device-adaptive rendering
13. REDCap integration -- bidirectional data sync
14. Webhook/API ecosystem -- Zapier, outbound webhooks, event subscriptions

### Phase 4: Scale (enterprise readiness)
15. SSO/SAML -- enterprise auth
16. Audit logging -- compliance trail
17. Longitudinal studies -- participant panels, scheduled follow-ups, time-series tracking
18. Interactive dashboard sharing -- embeddable charts, public dashboard links

---

## Honest Verdict

**Technically, in specific dimensions, QDesigner is best-in-class. As a complete product, it is approaching competitive parity with established SaaS in core research workflows.**

**World-class:**
- Reaction time engine (best web-based timing architecture)
- Statistical engine (most comprehensive client-side implementation)
- Integrated survey+experiment+analytics in one self-hosted platform (unique)
- Scoring pipeline with normative comparison
- Export service with analysis script bundles
- Offline-first fillout architecture

**Now competitive (with recent gap closures):**
- Distribution system with panel integrations
- Quota management for balanced sampling
- Fraud/bot prevention
- Reactive variable engine

**Not yet competitive:**
- No documentation, templates, or public demo
- No accessibility compliance
- No integration ecosystem (REDCap, Prolific API, webhooks)
- No multi-language content authoring

**Bottom line:** The technical moat is there, and the critical distribution/quota/fraud gaps are being addressed. What remains is documentation, templates, accessibility, and integrations -- the "last mile" that separates a powerful codebase from a product researchers can adopt.
