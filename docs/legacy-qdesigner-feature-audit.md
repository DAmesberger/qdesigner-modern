# Legacy QDesigner feature audit

**Audit date:** 2026-08-31
**Legacy repository:** `/home/dev/dev/qdesigner`
**Modern repository:** `/home/dev/dev/qdesigner-modern`

## Executive summary

Legacy QDesigner is not merely a survey form builder. It is an offline-capable questionnaire and experiment runner with CSV/ZIP authoring, arbitrary question/answer pairing, reactive computed variables, timed/fullscreen stimuli, hierarchical randomization, conditional flow, local and hosted collection, project permissions, native SPSS export, and browser-to-device communication.

Its small visible UI hides a much larger capability surface. A template author could combine:

- four stimulus modules (text, image, video, audio) with four response modules (checkbox, textbox, keypress, bar), including either side on its own;
- pages, nested block coordinates, commands, special rows, and global `$...` tokens;
- live variables with response value, timing, correctness, and cohort aggregates;
- formulas that were presented as calculations but actually executed as unrestricted browser JavaScript;
- raw HTML, CSS, WebSockets, and—when packaged as a Chrome App—filesystem/serial bridge calls.

The complete legacy baseline for successor parity is the later `origin/dev` line at version **0.11.0** (`a8701d8`), not only the checked-out `master` at **0.8.9** (`c00b8f8`). The later line is 92 commits ahead and adds page-level timeouts, per-page previous/next locks, explicit incorrect-key filtering, `incorrectavgdelta`, SPSS robustness, and an admin disk monitor. Features found only there are marked **dev** below.

The most important modernization implication is that parity must be defined by *researcher outcome*, not by reproducing unsafe implementation mechanisms. Arbitrary JavaScript, unsanitized HTML/CSS, and ambient browser/device access are legacy powers, but they should become typed formulas, explicit flow rules, constrained hooks, and permissioned integration blocks.

## Method and interpretation

This is a static, source-level audit of both legacy branches, the shipped German manual, the server/API, database schema, browser client, module validators, Chrome App bridge, and serial helper. It does not claim production deployment usage or rely on old screenshots.

Each capability is classified as:

- **Shipped** — reachable code and UI/API support exist.
- **Conditional** — works only in a specific runtime, role, or configuration.
- **Inferred** — enabled by composable or unrestricted scripting, although not named as a first-class UI feature.
- **Dormant/partial** — code or UI exists, but the end-to-end feature is not usable.
- **Dev** — present on `origin/dev` 0.11.0 but not checked-out master 0.8.9.

“Complete” here means all capabilities identifiable in the repository. It does not mean every accidental browser exploit should become a successor requirement.

Evidence paths in this document are relative to `/home/dev/dev/qdesigner` unless prefixed with `origin/dev:`. The latter identifies a Git object on the later branch rather than a checked-out file.

## Product and architecture model

The system has five cooperating parts:

1. An authenticated Nancy/.NET server with a MySQL repository, project authorization, template/fillout APIs, hosted questionnaire routes, administration, and SPSS generation.
2. A Knockout/RequireJS single-page client that stores templates and sessions in localForage/IndexedDB and can continue operating offline.
3. A declarative template package: `template.csv`, optional `style.css`, and `media/*`, transported as ZIP.
4. A dynamic participant runtime that constructs pages and loads question/answer modules named by the template.
5. Optional Chrome packaged-app and native serial-to-WebSocket components for local hardware/data integration.

The core domain is User → Project → Template → Fillout → Variable, with UserProject rights, TemplateProject membership, Online deployment, OneTimePassword, and OnlineResult records. Evidence: `db/create_database.sql:1-140`, `QDesignerApi/Model/Fillout.cs:1-49`, `QDesignerApi/Model/UserProjectDbModel.cs:1-76`.

## Complete legacy capability catalogue

### 1. Application shell, access, and localization

| ID | Capability | State | Evidence |
|---|---|---:|---|
| LEG-APP-01 | Authenticated tabbed workspace: Templates, Fillouts, Online, Synchronisation, Settings, conditional Admin, and a workflow-only Design tab | Shipped | `QDesignerApi/views/app.html:57-136`; `scripts/qde/app.js:30-45` |
| LEG-APP-02 | Login/logout and seven-day forms-auth session | Shipped | `views/login.html:13-49`; `Modules/LoginModule.cs:29-55` |
| LEG-APP-03 | Redirect unauthenticated users away from `/app` | Shipped | `Modules/AppModule.cs:21-35` |
| LEG-APP-04 | Display application version and build timestamp | Shipped | `views/app.html:69`; `Modules/AppModule.cs:142-150` |
| LEG-APP-05 | Browser-support warning | Shipped | `views/browsertest.html`; `views/login.html:51` |
| LEG-APP-06 | German and English UI translations; German selected by default; language selector hidden/commented | Conditional | `scripts/qde/language.js:27-201`; `scripts/qde/app.js:119`; `views/app.html:75` |
| LEG-APP-07 | HTML5 AppCache offline shell for non-local web use | Shipped/deprecated | `Modules/AppModule.cs:45-79,158-203`; `views/app.html:3` |

### 2. Template library and authoring

| ID | Capability | State | Evidence |
|---|---|---:|---|
| LEG-AUTH-01 | Create a blank local template | Shipped | `views/templates.html:65-79`; `scripts/qde/templates.js` |
| LEG-AUTH-02 | Import templates by file picker or drag-and-drop | Shipped | `views/templates.html:17,65-79`; `scripts/qde/templates.js:44-105` |
| LEG-AUTH-03 | Maintain an offline local template library: edit, delete, upload, export | Shipped | `views/templates.html:31-62` |
| LEG-AUTH-04 | Compare local and server template files by MD5 and expose missing/different state | Shipped | `scripts/qde/templatemanager.js:99-158` |
| LEG-AUTH-05 | Server template library: download, delete, rename, export data, admin lock/read-only | Shipped | `views/templates.html:204-260` |
| LEG-AUTH-06 | Download all templates assigned to a project | Shipped | `views/templates.html:83-130` |
| LEG-AUTH-07 | Assign/remove templates to/from projects | Shipped | `views/templates.html:132-195`; `scripts/qde/projectmanager.js` |
| LEG-AUTH-08 | Launch a local fillout in windowed or fullscreen mode in project context | Shipped | `views/templates.html:163-168` |
| LEG-AUTH-09 | Edit template name and ordered item list; add, edit, remove, and reorder items | Shipped | `views/templateviewer.html:13-64`; `scripts/qde/templateviewer.js` |
| LEG-AUTH-10 | Attach, remove, list, size, and export media assets | Shipped | `views/templateviewer.html:66-132`; `scripts/qde/templateviewer.js:154-194` |
| LEG-AUTH-11 | Attach, remove, edit, and export a global stylesheet | Shipped | `views/templateviewer.html`; `scripts/qde/templateviewer.js:195-238` |
| LEG-AUTH-12 | Item editor for variable name/code, page, block, style, question type/content/parameters, answer type/content/parameters, and commands | Shipped | `views/questionviewer.html:13-169` |
| LEG-AUTH-13 | Schema-driven validation with information/warning/error messages and media existence checks | Shipped | `scripts/qde/validator.js:51-149`; `questions/*.validation.js`; `answers/*.validation.js` |
| LEG-AUTH-14 | Raw/custom parameter editing within each module's declared parameter vocabulary | Shipped | `views/questionviewer.html:64-88,113-140` |
| LEG-AUTH-15 | Raw per-item style string with independent question CSS, answer CSS, and special layout token separated by `|` | Shipped | `scripts/qde/fillout.js:715-807`; shipped manual |

### 3. Template and data interchange

| ID | Capability | State | Evidence |
|---|---|---:|---|
| LEG-FMT-01 | Author questionnaires as tabular CSV | Shipped | `scripts/qde/templateparser.js:10-140` |
| LEG-FMT-02 | CSV fields: `page`, `block`, `name`, `style`, question/answer type, content and parameters | Shipped | `scripts/qde/templateparser.js:30-45,341-365` |
| LEG-FMT-03 | Extensible `!command` columns | Shipped | `scripts/qde/templateparser.js:47-52,313-324` |
| LEG-FMT-04 | Inline computed variable syntax `name=code` | Shipped | `scripts/qde/templateparser.js:54-64` |
| LEG-FMT-05 | Parameter syntax `key:value,key:value` | Shipped | `scripts/qde/templateparser.js:66-85` |
| LEG-FMT-06 | Automatic semicolon/comma detection and explicit `sep=<char>` header | Shipped | `scripts/qde/templateparser.js:120-139` |
| LEG-FMT-07 | ZIP package containing `template.csv`, optional `style.css`, and `media/*` | Shipped | `scripts/qde/templateparser.js:230-282` |
| LEG-FMT-08 | Round-trip template CSV/ZIP export | Shipped | `scripts/qde/templateparser.js:286-430` |
| LEG-FMT-09 | Raw JSON export helper exists in the editor view-model, but no UI binding was found | Dormant/code-only | `scripts/qde/templateviewer.js:39-43,271`; repository-wide binding search |
| LEG-FMT-10 | Browser-storage recovery dump export and fillout-key import | Shipped | `scripts/qde/sync.js:205-263` |
| LEG-FMT-11 | Hosted upload-failure recovery as downloadable `dump.json` | Shipped | `scripts/qde/onlinefillout.ts:292-325`; `views/onlinefilloutview.html:30` |

### 4. Stimulus/question modules

Question and answer are independent halves of an item. The runtime dynamically loads both by their CSV type names, so every meaningful pairing—including stimulus-only and response-only rows—is supported. Evidence: `scripts/qde/fillout.js:178-201,751-789`.

| ID | Capability | State | Evidence |
|---|---|---:|---|
| LEG-Q-01 | Text/HTML stimulus with variable interpolation | Shipped | `questions/text.js:20-62` |
| LEG-Q-02 | Text alignment, font, foreground/background, x/y positioning | Shipped | `questions/text.validation.js:11-38` |
| LEG-Q-03 | Image stimulus from template media | Shipped | `questions/image.js`; `questions/image.validation.js` |
| LEG-Q-04 | Image width/height, x/y, background, exact fullscreen positioning | Shipped | `questions/image.validation.js:18-45`; shipped manual |
| LEG-Q-05 | Video stimulus with controls/autoplay, dimensions, position, background | Shipped | `questions/video.js`; `questions/video.validation.js:20-52` |
| LEG-Q-06 | Stop video when a named variable changes | Shipped | `questions/video.js`; `stoponvariable` validator parameter |
| LEG-Q-07 | Audio stimulus with controls/autoplay | Shipped | `questions/audio.js`; `questions/audio.validation.js` |
| LEG-Q-08 | Stop audio when a named variable changes | Shipped | `questions/audio.js`; `stoponvariable` validator parameter |
| LEG-Q-09 | Fullscreen stimulus display | Shipped | question validators; `scripts/qde/fillout.js:430-467` |
| LEG-Q-10 | Timed stimulus with optional automatic advance | Shipped | question validators; module `show` functions |
| LEG-Q-11 | Sequential fullscreen stimuli on one page via animation-frame callback chain | Shipped | `scripts/qde/fillout.js:430-467` |
| LEG-Q-12 | Independently include/exclude a module in participant and print views | Shipped | `showinquestionnaire`, `showinprint`; `fillout.js:756-783` |

### 5. Response modules

| ID | Capability | State | Evidence |
|---|---|---:|---|
| LEG-R-01 | Checkbox/radio choices defined as `label:integer` pairs | Shipped | `answers/checkbox.validation.js:27-83`; `answers/checkbox.js` |
| LEG-R-02 | Single-select or multi-select behavior determined by maximum-answer setting | Shipped | `answers/checkbox.js` |
| LEG-R-03 | Minimum/maximum selections and required-answer validation | Shipped | `answers/checkbox.js`; validator |
| LEG-R-04 | Single-line or multiline textbox | Shipped | `answers/textbox.js:37-77` |
| LEG-R-05 | Required text, JavaScript regular expression, custom error message, rows/columns, inline style | Shipped | `answers/textbox.js:37-77`; validator |
| LEG-R-06 | Keypress capture with key code, timestamp, stimulus-to-response delta, and correctness | Shipped | `answers/keypress.js:50-112` |
| LEG-R-07 | Correct-key allowlist | Shipped | `answers/keypress.validation.js:11-23` |
| LEG-R-08 | Incorrect-key allowlist and ignore unrelated keys | Dev | `origin/dev:.../answers/keypress.validation.js:10-23`; `keypress.js:50,88` |
| LEG-R-09 | Keypress automatic advance | Shipped | `answers/keypress.js`; validator |
| LEG-R-10 | Touchscreen quadrant mapping to arrow keys | Shipped | `answers/keypress.js` |
| LEG-R-11 | Send a hardware/socket trigger on keypress | Shipped | `answers/keypress.js:71-112` |
| LEG-R-12 | Bar feedback control bound to value/min/max/mean/deviation variables or properties | Shipped | `answers/bar.js`; `answers/bar.validation.js` |
| LEG-R-13 | Configure bar dimensions, ticks and colors; visualize participant result against mean ± SD | Shipped | `answers/bar.js`; shipped manual |
| LEG-R-14 | Required answers prevent Next until valid | Shipped | `scripts/qde/fillout.js:574-603` |
| LEG-R-15 | Independent participant/print visibility for response controls | Shipped | answer validators; `fillout.js:780-783` |

### 6. Pages, layout, navigation, and experiment flow

| ID | Capability | State | Evidence |
|---|---|---:|---|
| LEG-FLOW-01 | Group rows into pages by page name; interpolate variables into page names | Shipped | `scripts/qde/fillout.js:629-719` |
| LEG-FLOW-02 | Remove empty pages after conditional visibility | Shipped | `scripts/qde/fillout.js:849-899` |
| LEG-FLOW-03 | Previous/next navigation and page history | Shipped | `scripts/qde/fillout.js:233-429` |
| LEG-FLOW-04 | Resume at saved page/history | Shipped | fillout JSON and `fillout.js` navigation initialization |
| LEG-FLOW-05 | `$goto` jump to a named page | Shipped | `scripts/qde/fillout.js:523-548` |
| LEG-FLOW-06 | `$gosub` jump with return-page stack | Shipped | `scripts/qde/fillout.js:523-548` |
| LEG-FLOW-07 | `$finish` marks the designated normal finish page | Shipped | `scripts/qde/fillout.js:981-1163` |
| LEG-FLOW-08 | `$end` marks end behavior independent of normal finish | Shipped | `scripts/qde/fillout.js:981-1163` |
| LEG-FLOW-09 | `!show` includes/excludes an item for named projects, including negation | Shipped | `scripts/qde/fillout.js:641-655` |
| LEG-FLOW-10 | `sticky` rows repeated at the top of every page | Shipped | `scripts/qde/fillout.js:799-805,892-895` |
| LEG-FLOW-11 | `table` rows align question and answer as table cells | Shipped | `scripts/qde/fillout.js:802-805,900-905` |
| LEG-FLOW-12 | Print mode collapses items into one printable page and honors print visibility | Shipped | `scripts/qde/fillout.js:629-719,849-905` |
| LEG-FLOW-13 | Hierarchical blocks represented as comma-separated coordinates | Shipped | `scripts/qde/fillout.js:1170-1307`; shipped manual |
| LEG-FLOW-14 | Randomize all branches at a hierarchy level or a named branch | Shipped | `scripts/qde/fillout.js:1170-1307` |
| LEG-FLOW-15 | Apply multiple randomization declarations | Shipped | `scripts/qde/fillout.js:981-1163,1170-1307` |
| LEG-FLOW-16 | Persist randomized page structure so resume preserves assignment/order | Shipped | fillout `pageStructure`; `fillout.js` initialization |
| LEG-FLOW-17 | Page-level timeout with auto-advance for ordinary pages | Dev | `origin/dev:.../fillout.ts:454-474`; `doc/timeout.md` |
| LEG-FLOW-18 | Forbid previous or next movement on selected pages (`nomoveprev`, `nomovenext`) | Dev | `origin/dev:.../fillout.ts:629-648,902-919` |
| LEG-FLOW-19 | Force-finish, force-exit, and post-completion Escape keyboard controls | Shipped | `scripts/qde/fillout.js:69-128` |
| LEG-FLOW-20 | Windowed and fullscreen participant modes; high-DPI canvas context | Shipped | `scripts/qde/fillout.js:14-50` |
| LEG-FLOW-21 | Record page start/finish timing | Shipped | fillout runtime/page model |

### 7. Variables, calculations, and aggregate feedback

| ID | Capability | State | Evidence |
|---|---|---:|---|
| LEG-VAR-01 | One named variable per response/computed item | Shipped | `scripts/qde/filloutvariables.js:338-438` |
| LEG-VAR-02 | Variable properties: `value`, `delta`, `time`, `correct`, numeric/string representations | Shipped | `scripts/qde/filloutvariables.js:12-233`; `Model/VariableValue.cs` |
| LEG-VAR-03 | Persisted aggregate properties: count, average, minimum, maximum, sum, deviation | Shipped | `filloutvariables.js`; shipped manual |
| LEG-VAR-04 | Aggregate completed server and local submissions into local cohort statistics | Shipped | `filloutvariables.js:155-233,447-484`; API aggregate route |
| LEG-VAR-05 | Computed variables reactively recalculate when referenced observables change | Shipped | `filloutvariables.js:395-430` |
| LEG-VAR-06 | `<variable>` and `<variable.property>` reference syntax | Shipped | `filloutvariables.js:404-413` |
| LEG-VAR-07 | Local variables prefixed `_`: not persisted and excluded from aggregates | Shipped | `filloutvariables.js:19,142-176,447-452` |
| LEG-VAR-08 | `__last` tracks last changed non-computed variable; `__lastall` includes computed changes | Shipped | `filloutvariables.js:418-430` |
| LEG-VAR-09 | Built-ins `sum`, `count`, `average`, `correctavgdelta`, `correct`, `incorrect`, `missing` | Shipped | `scripts/qde/variablefunctions.js:4-116` |
| LEG-VAR-10 | Built-in `incorrectavgdelta` | Dev | `origin/dev:.../variablefunctions.js:54-116` |
| LEG-VAR-11 | Formula expressions can use JavaScript arithmetic, comparison, ternary, `Math`, arrays, objects, and callable browser globals | Inferred/unsafe | direct `eval` at `filloutvariables.js:404-416` |
| LEG-VAR-12 | Computed code can mutate other variables | Inferred/unsafe | direct `eval` plus exposed `_variables` context |
| LEG-VAR-13 | Computed code can access localForage, DOM, network, WebSocket, RequireJS, and same-origin APIs | Inferred/unsafe | direct lexical `eval`; imports at `filloutvariables.js:5,344`; browser execution context |
| LEG-VAR-14 | Read-only computed output suitable for scores, derived classifications, adaptive messages, and conditional routing | Inferred/supported outcome | computed variables plus interpolation/flow tokens |

### 8. Autosave, offline collection, sync, and recovery

| ID | Capability | State | Evidence |
|---|---|---:|---|
| LEG-OFF-01 | Save each response and fillout metadata locally in browser storage | Shipped | `filloutvariables.js:142-176,235-333` |
| LEG-OFF-02 | Continue incomplete local sessions | Shipped | `views/fillouts.html`; `scripts/qde/fillouts.js` |
| LEG-OFF-03 | `$noautosave` disables per-response persistence to reduce inter-trial latency | Shipped | `scripts/qde/fillout.js:981-1163`; manual |
| LEG-OFF-04 | `$autosaveonend` defers persistence until the end, especially for fullscreen experiments | Shipped | `scripts/qde/fillout.js:981-1163`; manual |
| LEG-OFF-05 | Synchronisation dashboard with completed/incomplete/total counts per template | Shipped | `views/sync.html`; `scripts/qde/sync.js:14-42` |
| LEG-OFF-06 | Upload only completed local fillouts to server | Shipped | `scripts/qde/sync.js:86-168` |
| LEG-OFF-07 | Delete successfully uploaded local copy | Shipped | `scripts/qde/sync.js:106-168` |
| LEG-OFF-08 | Download and merge server aggregates | Shipped | `scripts/qde/sync.js:170-193` |
| LEG-OFF-09 | Cache project/template rights for offline use | Shipped | `scripts/qde/projectmanager.js:70-180` |
| LEG-OFF-10 | Inspect/clear local storage from sync/debug controls | Shipped | `views/sync.html`; `scripts/qde/sync.js` |
| LEG-OFF-11 | Export complete local-storage dump and re-import fillout keys | Shipped | `scripts/qde/sync.js:205-263` |

### 9. Fillout administration, hosted collection, and access links

| ID | Capability | State | Evidence |
|---|---|---:|---|
| LEG-COL-01 | Filter fillouts by project/template and local/server source | Shipped | `views/fillouts.html:17-56`; `scripts/qde/fillouts.js` |
| LEG-COL-02 | Show complete/incomplete status and owner/project/template metadata | Shipped | `views/fillouts.html` |
| LEG-COL-03 | View, print, continue, and delete a fillout | Shipped | `views/fillouts.html:56-98` |
| LEG-COL-04 | Select multiple fillouts and bulk delete | Shipped | `views/fillouts.html`; `scripts/qde/fillouts.js` |
| LEG-COL-05 | Create hosted deployment for a project/template/target user | Shipped | `views/online.html`; `scripts/qde/online.js:47-105` |
| LEG-COL-06 | Public bearer link or private link requiring a one-time token | Shipped | `Modules/OnlineFilloutModule.cs:35-88` |
| LEG-COL-07 | Generate up to 100 one-time respondent codes at once | Shipped | `scripts/qde/online.js`; `Modules/ApiModule.cs:395-470` |
| LEG-COL-08 | List each code's used state, completion time and resulting fillout UID; delete codes | Shipped | `views/online.html`; `scripts/qde/online.js` |
| LEG-COL-09 | Prevent reuse of consumed one-time code | Shipped | `Modules/OnlineFilloutModule.cs:62-88,119-144` |
| LEG-COL-10 | Hosted participant downloads definition/assets, runs locally, uploads JSON, and retries/exports on failure | Shipped | `scripts/qde/onlinefillout.ts:61-325` |
| LEG-COL-11 | View a hosted result through `OnlineResultModule` | Dormant/partial | module throws `NotImplementedException`; missing matching client script |

### 10. Projects, users, permissions, and administration

| ID | Capability | State | Evidence |
|---|---|---:|---|
| LEG-ADM-01 | Project-scoped rights: Admin, Create, Download, Edit, Fillout | Shipped | `Model/ProjectRightsModel.cs`; `Model/UserProjectDbModel.cs:8-76` |
| LEG-ADM-02 | Template download based on ownership/project membership | Shipped | `Modules/ApiModule.cs:114-164` |
| LEG-ADM-03 | Template update based on owner or project admin/edit and read-only state | Shipped | `Modules/ApiModule.cs:165-248` |
| LEG-ADM-04 | Fillout upload based on project Fillout right | Shipped | `Modules/ApiModule.cs:249-271` |
| LEG-ADM-05 | Non-admin fillout visibility restricted to own data or project Admin/Download | Shipped | `Repository/MySqlAdoNetRepository.cs:577-714` |
| LEG-ADM-06 | List active/inactive users; create/edit user; set password | Shipped | `views/admin.html:8-206`; `Modules/AdminApiModule.cs` |
| LEG-ADM-07 | Assign project membership and rights to users | Shipped | `views/admin.html`; `scripts/qde/admin.js` |
| LEG-ADM-08 | List active/inactive projects; create/edit; manage project users | Shipped | `views/admin.html:207-325` |
| LEG-ADM-09 | New user automatically receives a same-name project with full rights | Shipped | `Modules/AdminApiModule.cs:78-95` |
| LEG-ADM-10 | Display disk partitions, free percentage, free and total space | Dev | `origin/dev:.../views/admin.html:326-357`; `Services/DiskSpaceService.cs` |

### 11. Analysis and export

| ID | Capability | State | Evidence |
|---|---|---:|---|
| LEG-DATA-01 | Export selected/filter-matched fillouts from Templates or Fillouts UI | Shipped | `views/templates.html:236`; `views/fillouts.html:30` |
| LEG-DATA-02 | Generate and download a native SPSS `.sav` file | Shipped | `Modules/SpssModule.cs:30-125` |
| LEG-DATA-03 | Include identifiers such as UID, project, owner and variable data | Shipped | `Services/SpssService.cs`; SPSS data models |
| LEG-DATA-04 | Export value plus optional Delta and Time columns | Shipped | SPSS UI/options and `SpssModule.cs` |
| LEG-DATA-05 | Split multi-select into columns or keep combined | Shipped | SPSS UI/options |
| LEG-DATA-06 | Customize multi-select true/false labels and values | Shipped | `views/fillouts.html:100-170`; `views/templates.html:296+` |
| LEG-DATA-07 | Numeric, string, single-select, and multi-select SPSS types/value labels | Shipped | `Model/VariableValue.cs`; `SPSSExport.cs` |
| LEG-DATA-08 | Robust long/non-ASCII strings, ignored columns, sanitized derived labels, contextual errors/logging | Dev | `origin/dev:.../SPSSExport.cs`; `Services/SpssService.cs` |

### 12. Hardware, sockets, packaging, and operations

| ID | Capability | State | Evidence |
|---|---|---:|---|
| LEG-INT-01 | `$socket` opens a raw `ws://host:port` connection | Shipped | `scripts/qde/fillout.js:981-1090` |
| LEG-INT-02 | `$sendsocket` subscribes to a variable/property and sends changes, with terminator escapes | Shipped | `scripts/qde/fillout.js:1020-1130` |
| LEG-INT-03 | `$receivesocket` writes received data into a variable/property | Shipped | `scripts/qde/fillout.js:1020-1130` |
| LEG-INT-04 | Native serial-to-WebSocket CLI with configurable port, baud, parity, data and stop bits; default WS port 9000 | Conditional | `QDesignerSerial/Program.cs:13-80`; `Server.cs` |
| LEG-INT-05 | Chrome packaged app with network, unlimited storage, filesystem write, serial and TCP-server permissions | Conditional/deprecated | `QDesignerApi/chrome/manifest.json:1-30` |
| LEG-INT-06 | Chrome RPC URL proxy, persistent filesystem-backed storage, directory chooser, serial open/send/receive/close, local server | Conditional | `chrome/chromeApp.js:24-210,430+`; `scripts/chromeRPC.js` |
| LEG-INT-07 | Build and sign CRX2 package | Conditional/deprecated | `ChromeAppPacker/Packer.cs:17-82` |
| LEG-INT-08 | Console and rolling-file Serilog logging | Shipped | `Services/LoggingService.cs:17-49` |
| LEG-INT-09 | Build/bundle/package/upload deployment script | Operational | `deploy.bat` |
| LEG-INT-10 | Dockerized database bootstrap and Apache/RHEL configuration | Dev/operational | `origin/dev:docker/db/*`; `origin/dev:config/rhel/*` |

## The real scripting capability surface

### Supported declarative language

The intended authoring language consists of:

- module type names and validated `key:value` parameters;
- `!show` project filtering;
- page-local `$goto` and `$gosub`;
- global `$finish`, `$end`, `$randomize`, `$noautosave`, `$autosaveonend`, `$socket`, `$sendsocket`, and `$receivesocket` tokens;
- formulas with `<variable>` and `<variable.property>` references plus aggregate/correctness functions;
- module hooks such as `show`, `stop`, `answered`, `showInQuestionnaire`, and `showInPrint` for code-level extensions.

This surface supports legitimate research outcomes such as scoring, response-dependent messages, random assignment/order, speeded trials, correct/incorrect reaction-time summaries, participant-vs-cohort feedback, and device triggers.

### Incidental unrestricted powers

Computed code is assembled as source and evaluated with direct `eval` in `filloutvariables.js:404-416`. Placeholder rewriting only replaces `<...>` references; it does not constrain the remaining JavaScript. As a result, a template can potentially:

- read or mutate other variables through `_variables`;
- call ambient `window`, `document`, `fetch`, `WebSocket`, RequireJS, jQuery, or same-origin APIs;
- access the imported `localforage` object and manipulate persisted data;
- inject arbitrary HTML through text content and arbitrary CSS through template/item styles;
- reach the global Chrome RPC bridge in packaged-app mode, including local storage and serial features.

These are **capabilities to migrate as explicit use cases, not APIs to preserve**. A modern successor should inventory actual client templates for uses, translate them into safe primitives, and reject or quarantine unmatched arbitrary behavior.

### Suggested safe replacement vocabulary

| Legacy power | Successor primitive |
|---|---|
| Formula-like JavaScript | Parsed expression AST with typed values, allowlisted pure functions, complexity/time limits |
| Mutation inside formulas | Explicit assignment/action nodes with declared outputs |
| `$goto` / `$gosub` / `$finish` | Visual flow graph: branch, jump/call-return if truly required, terminate/complete |
| Hierarchical `$randomize` | Block randomization UI with preview, seed policy, fixed positions, and persisted assignment |
| `!show` | Visibility rule builder over project/condition/response/variable metadata |
| Raw socket code | Permissioned integration block with protocol schema, endpoint allowlist, reconnect/error UI, and audit trail |
| Keypress socket trigger | Dedicated hardware response/trigger mapping |
| Arbitrary HTML/CSS | Sanitized rich text, media/layout controls, design tokens, and narrowly scoped advanced CSS |
| Direct storage manipulation | Offline engine APIs plus explicit recovery export/import tools |
| Browser/Chrome RPC access | Trusted, signed integration adapters with user/device consent |

## Known non-features and incomplete paths

- The hidden Design tab is the template editor's transient state, not a separate permanent product area.
- `DesignModule` references a missing `views/design.html` and appears stale.
- The Settings serial-port UI is commented out on master; serial support exists through other components but not as a dependable main-app configuration flow.
- `OnlineResultModule` throws `NotImplementedException`, its expected client bundle is missing, and its view is effectively empty. Do not count hosted result viewing as legacy parity.
- Master has per-stimulus/fullscreen timeouts; ordinary page-level timeout and previous/next locks are specifically 0.11.0 dev additions.
- Chrome App, CRX2, AppCache, and old deployment assets are implementation mechanisms now obsolete. Preserve their outcomes—offline operation, local device support, recoverability—not their packaging.

## Agent migration discovery still required before production cutover

This repository audit identifies what *could* be done. Because unrestricted scripts make actual client usage undecidable from platform code alone, a migration agent must scan every client template/data store for:

1. every computed expression and referenced global/function;
2. every `$...` token, `!command`, parameter key, style special, and unknown module type;
3. raw HTML, CSS selectors, media codecs and file sizes;
4. socket endpoints, message framing, serial configurations, and hardware triggers;
5. project permissions, online links/codes, template hashes, incomplete local sessions, and SPSS export conventions;
6. expected randomization seeds/orders and timing tolerances.

The agent should translate each questionnaire into the canonical QDef format and executable scenarios specified in [Questionnaire definition exchange and MCP requirements](./questionnaire-definition-mcp-requirements.md). That inventory and its passing scenario suite—not a migration CLI/GUI or generic JavaScript compatibility mode—becomes the acceptance evidence for “all old capabilities in a safe modern form.”
