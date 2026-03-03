# Chapter 0: Introduction to QDesigner Modern

## What Is QDesigner Modern?

QDesigner Modern is a high-performance questionnaire platform purpose-built for psychological and behavioral research. It combines the structured data collection capabilities of traditional survey tools with the timing precision and rendering performance that experimental researchers require.

At its core, QDesigner Modern provides:

- **Microsecond-accurate reaction time measurement** using the `performance.now()` API, stored as BIGINT values in the database for lossless precision.
- **WebGL 2.0 rendering** capable of sustaining 120+ frames per second, enabling stimulus presentation that meets the temporal demands of cognitive and perceptual experiments.
- **A visual questionnaire designer** with drag-and-drop block composition, WYSIWYG preview, and a built-in scripting engine for computed variables, conditional logic, and flow control.
- **Multi-tenant collaboration** with organizations, projects, role-based access control, and invitation workflows designed for research teams.

QDesigner Modern is a web application. Participants complete questionnaires in their browser with no software installation. Researchers design, distribute, and analyze instruments through the same browser-based interface.

## Who Is This Platform For?

QDesigner Modern is designed for three overlapping audiences:

1. **Academic researchers** who need to collect survey data and behavioral measurements in a single instrument -- psychologists, cognitive scientists, neuroscientists, and social scientists conducting studies that involve both self-report items and timed responses.

2. **Research teams and labs** that need collaborative authoring with fine-grained access control. A principal investigator can own the organization, grant editing rights to graduate students, and provide read-only access to external reviewers -- all within a single workspace.

3. **Methods-oriented researchers** who require programmatic control over questionnaire logic. The built-in scripting engine supports computed variables, conditional branching, randomization, and formula-based scoring without requiring participants to install any software or plugins.

If you currently use Qualtrics, LimeSurvey, SoSci Survey, or PsychoPy for questionnaire-based research, QDesigner Modern offers a unified alternative that handles both traditional survey items and high-precision timed tasks.

## Key Differentiators

### Microsecond Timing Precision

Most web-based survey platforms record response times with millisecond granularity at best, often rounded or delayed by framework overhead. QDesigner Modern captures reaction times using the browser's high-resolution `performance.now()` API and stores them as microsecond integers (BIGINT columns in PostgreSQL). This means:

- No floating-point rounding errors in stored timing data.
- Sufficient precision for reaction time paradigms such as lexical decision tasks, implicit association tests, and go/no-go procedures.
- Timing data that is directly comparable to data collected with dedicated experimental software.

### WebGL 2.0 Rendering at 120+ FPS

QDesigner Modern includes a custom WebGL 2.0 renderer for stimulus display. While standard HTML rendering is limited by the browser's layout and paint cycles (typically 60 FPS), the WebGL pipeline bypasses this constraint:

- Stimulus onset can be synchronized to the display's vertical refresh.
- Frame rates of 120 Hz and above are achievable on compatible displays.
- Visual stimuli -- images, text, geometric shapes -- are rendered through the GPU pipeline with minimal CPU involvement.

This is particularly relevant for experiments that require brief stimulus presentations (e.g., masked priming at 16--33 ms durations) or precise inter-stimulus intervals.

### Integrated Scripting Engine

The variable and scripting system is not an afterthought bolted onto a form builder. It is a first-class subsystem with its own formula language supporting:

- **Mathematical operations**: `+`, `-`, `*`, `/`, `^`, `sqrt()`
- **Conditional logic**: `IF(condition, trueValue, falseValue)`
- **Aggregate functions**: `SUM()`, `AVG()`, `COUNT()`, `MIN()`, `MAX()`
- **String operations**: `CONCAT()`, `LENGTH()`
- **Time functions**: `NOW()`, `TIME_SINCE()`
- **Randomization**: `RANDOM()`, `RANDINT(min, max)`
- **Variable interpolation**: `{{variableName}}` syntax for dynamic text

Variables can reference participant responses, computed scores, or system values. Flow control blocks enable conditional page display, randomized block ordering, and skip logic -- all configured through a visual interface backed by the scripting engine.

### Multi-Tenant Collaboration

Research is rarely a solo activity. QDesigner Modern is built around a multi-tenant model:

- **Organizations** provide data isolation between research groups. Each organization has its own members, projects, and questionnaires.
- **Projects** group related questionnaires within an organization, with their own member lists and role assignments.
- **Role-based access control** at both the organization and project level ensures that only authorized team members can view, edit, publish, or delete instruments.

The role hierarchy (Owner > Admin > Editor > Viewer) is enforced server-side in the Rust backend, not merely in the frontend UI.

### Modern, Performant Architecture

The platform is built on a modern stack chosen for performance, type safety, and developer productivity:

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Svelte 5 + SvelteKit + TypeScript | Compiled reactive framework with minimal runtime overhead |
| Backend | Rust + Axum | Memory-safe systems language with predictable latency |
| Database | PostgreSQL 18 | Mature relational database with JSONB support for flexible questionnaire content |
| Authentication | JWT + Argon2id | Industry-standard token-based auth with memory-hard password hashing |
| Storage | MinIO (S3-compatible) | Self-hosted object storage for media assets |
| Cache | Redis 7 | Optional caching layer for rate limiting and session management |

The frontend uses Svelte 5's runes syntax (`$state`, `$derived`, `$effect`) for fine-grained reactivity without a virtual DOM. The backend uses Rust's type system and Axum's extractor pattern to ensure that authorization checks cannot be accidentally bypassed.

## Platform Capabilities at a Glance

### Questionnaire Design

- Drag-and-drop block-based editor with real-time WYSIWYG preview
- Multiple question types: single choice, multiple choice, text input, Likert scales, matrix questions, sliders, ranking, and more
- Page-level and block-level organization
- Conditional display logic and skip patterns
- Randomized block ordering for counterbalancing
- Formula-based computed variables and scoring
- Monaco Editor integration for advanced scripting

### Data Collection

- Browser-based questionnaire completion with no installation required
- High-precision reaction time capture
- WebGL stimulus presentation for timed paradigms
- Progress saving and session resumption
- Configurable completion rules and validation

### Team Collaboration

- Organization and project hierarchy
- Four-tier role system (Owner, Admin, Editor, Viewer)
- Email-based invitation workflow
- Domain-based auto-join for institutional accounts
- Concurrent editing with conflict-aware persistence

### Data Management

- Questionnaire versioning (draft, published, archived lifecycle)
- Response storage with microsecond timing columns
- JSONB content storage for flexible questionnaire structures
- Soft deletion with audit trails

## Comparison with Existing Tools

Researchers frequently ask how QDesigner Modern relates to existing platforms. The following comparison highlights the key differences:

### vs. Qualtrics

Qualtrics is the dominant commercial survey platform in academic research. It excels at traditional survey design with extensive question type libraries, piping logic, and panel integration. However, Qualtrics does not provide sub-millisecond timing precision, lacks GPU-accelerated stimulus presentation, and its scripting capabilities (while powerful) are not designed for experimental paradigms involving reaction time measurement. QDesigner Modern fills this gap by combining Qualtrics-class survey features with laboratory-grade timing and rendering.

### vs. LimeSurvey / SoSci Survey

LimeSurvey and SoSci Survey are popular open-source and academic survey tools, respectively. They provide solid survey functionality with good data export options. However, neither offers WebGL rendering, microsecond timing, or a modern reactive frontend framework. Their server-side architectures are designed for traditional form submission rather than real-time experimental paradigms. QDesigner Modern provides a more modern developer and user experience while maintaining the self-hosting flexibility that these tools offer.

### vs. PsychoPy / jsPsych

PsychoPy and jsPsych are dedicated experimental software packages optimized for precise stimulus presentation and timing. They excel in laboratory settings but are primarily designed for experiment programming rather than questionnaire design. Creating a multi-page questionnaire with skip logic, scoring, and team collaboration in PsychoPy requires significant custom development. QDesigner Modern bridges the gap by providing the visual survey design experience researchers expect alongside the timing capabilities that experimental software delivers.

### vs. Gorilla Experiment Builder

Gorilla is a web-based experiment builder that shares some of QDesigner Modern's goals. It provides visual experiment design with reaction time tasks. QDesigner Modern differentiates itself through its open architecture, self-hosting capability, deeper questionnaire design features (computed variables, formula engine), and the Rust backend that provides lower and more predictable API latency.

## Design Philosophy

Several principles guided the design of QDesigner Modern:

1. **Measurement integrity first**: Every architectural decision prioritizes the accuracy and reliability of collected data. Timing precision is not approximated -- it is measured at the hardware level and stored without loss.

2. **Zero-install for participants**: Participants should never need to download software, install plugins, or configure their browser. The platform runs on standard web technologies available in every modern browser.

3. **Server-side authority**: The backend is the single source of truth for authorization, data validation, and business logic. The frontend provides a responsive user experience, but the Rust backend independently enforces every constraint. This prevents a category of bugs where client-side validation diverges from server-side rules.

4. **Progressive complexity**: Simple questionnaires should be simple to create. The platform does not force researchers to learn the scripting engine to build a five-question survey. Advanced features (formulas, conditional logic, WebGL stimuli) are available when needed but do not clutter the default experience.

5. **Institutional-grade collaboration**: Research teams have complex access requirements. The organization/project/role hierarchy is designed to model real-world research group structures without requiring workarounds or shared accounts.

## How This Book Is Organized

This book is structured to follow the natural workflow of using QDesigner Modern, from initial setup through advanced experimental design:

- **Chapter 1: Getting Started** covers account creation, email verification, and your first login.
- **Chapter 2: The Questionnaire Designer** introduces the visual editor, question types, and page organization.
- **Chapter 3: Organization Management** explains multi-tenant setup, member roles, and invitation workflows.
- **Chapter 4: Project Management** covers project creation, configuration, and questionnaire lifecycle.
- **Chapter 5: Question Types** provides a detailed reference for every supported question type.
- **Chapter 6: Variables and Scripting** covers the formula engine, computed variables, and conditional logic.
- **Chapter 7: Flow Control and Experimental Design** addresses randomization, counterbalancing, and timed paradigms.
- **Chapter 8: Reaction Time Measurement** explains timing precision, WebGL rendering, and best practices for timed tasks.
- **Chapter 9: Distribution and Data Collection** covers publishing questionnaires and managing responses.
- **Chapter 10: Collaboration and Team Management** provides workflows for research teams.
- **Chapter 11: API Reference** documents the REST API for programmatic access.
- **Chapter 12: Data Quality and Statistics** discusses validation, outlier detection, and analytical approaches.

Each chapter includes step-by-step instructions, descriptions of what you will see at each point in the interface, and practical tips drawn from the platform's design.

> **Note:** This documentation reflects QDesigner Modern as of version 1.0. Features described here correspond to the implemented codebase. Where features are planned but not yet available, this is noted explicitly.

## Getting Help

If you encounter issues while using QDesigner Modern:

1. Check this documentation for guidance on the feature you are using.
2. Review the error messages displayed in the interface -- they are designed to be actionable.
3. Contact your organization administrator if the issue involves access permissions.
4. For technical issues, consult the project's issue tracker on GitHub.

The next chapter walks you through creating your account and signing in for the first time.
