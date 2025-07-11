# Architectural Refactoring Plan

This document outlines the plan to refactor the `src/lib` directory towards a more domain-driven or "feature-sliced" architecture. This will improve modularity, reduce coupling, and enhance maintainability for this large-scale project.

## Proposed `src/lib` Structure

```
src/lib/
├───core/
│   │   # Foundational, cross-cutting modules that power the application.
│   │   # Stable, low-level, and used by multiple features.
│   │
│   ├───api/             # Client for backend APIs (Supabase helpers, tRPC client)
│   ├───auth/            # Authentication logic, user session management
│   ├───database/        # Supabase client, DB types, schema definitions
│   ├───renderer/        # Core WebGL rendering engine
│   ├───scripting/       # Core scripting and variable engines
│   └───timing/          # Precision timing modules for experiments
│
├───features/
│   │   # Discrete, user-facing parts of the application. Each feature is a vertical slice.
│   │
│   ├───dashboard/
│   │   ├───components/  # Components specific to the user dashboard
│   │   └───services/    # Logic for fetching dashboard data
│   │
│   ├───designer/
│   │   │   # Everything related to the questionnaire design experience.
│   │   ├───components/  # WYSIWYGCanvas, ScriptEditor, StyleEditor, etc.
│   │   ├───services/    # Persistence, versioning
│   │   ├───stores/      # State management for the designer
│   │   └───types/       # Types specific to the designer
│   │
│   ├───organization/
│   │   │   # Features for managing organizations, members, billing, and settings.
│   │   ├───components/
│   │   └───services/
│   │
│   └───runtime/
│       │   # The participant-facing questionnaire execution environment.
│       ├───components/  # ReactionTestComponent, stimulus/response components
│       ├───core/        # Runtime state machine, flow control, navigation
│       ├───services/    # Session management, data submission, offline sync
│       └───types/       # Types for sessions, responses, events
│
└───shared/
    │   # Truly generic code, shared across multiple, unrelated features.
    │   # Should be minimal and well-vetted before adding code here.
    │
    ├───components/      # Generic UI components (Button, Card, Modal, Icon)
    ├───styles/          # Global styles, CSS variables, themes
    ├───types/           # Global, cross-domain types
    └───utils/           # Generic utility functions (e.g., date formatters)

```

## Justification

1.  **Scalability**: New features (e.g., `analytics`, `billing`) can be added as self-contained modules under `features`.
2.  **Maintainability**: Developers can focus on a single feature directory, reducing cognitive load.
3.  **Clear Ownership**: Easier to assign ownership of features to teams.
4.  **Reduced Complexity**: Encourages a clear data flow and discourages feature-to-feature dependencies.
5.  **Reflects the Domain**: The structure mirrors the domains described in the PRDs, making the codebase intuitive.
