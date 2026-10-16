# AGENTS.md — Agent Coordination & Engineering Standards

> **Project:** OJIX TeamFlow: Team Tasks & Project Execution OS  
> **Status:** Authoritative Repository Standard  
> **Governing References:** [ASSIGNMENT.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/ASSIGNMENT.md) | [OJIX_Parallel_Product_Orchestrator_SKILL.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/OJIX_Parallel_Product_Orchestrator_SKILL.md) | [.agents/skills/frontend-design/SKILL.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/.agents/skills/frontend-design/SKILL.md) | [.agents/skills/find-skills/SKILL.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/.agents/skills/find-skills/SKILL.md)

---

## 1. Mission & Agent Role Architecture

Antigravity and specialized subagents operate as an integrated, high-velocity engineering team. Every agent acts with accountability, technical rigor, and zero tolerance for simulated claims. 

### 1.1 Team Roles & Non-Overlapping File Boundaries

To prevent file collision and race conditions during parallel execution, specialists operate within strictly bounded file ownership scopes:

| Specialist Workstream | Focus & Core Responsibilities | Exclusive File Scope |
|---|---|---|
| **Lead Coordinator (Orchestrator)** | Orchestrates execution waves, manages checkpoints, resolves contract conflicts, merges changes, and makes release decisions. | Root configs (`package.json`, `tsconfig.json`, `vite.config.ts`), `docs/engineering/agent-task-board.md` |
| **Product & UX Specialist** | Defines user journeys, information hierarchy, empty/loading/error states, responsive UX, and acceptance checklist. | `docs/engineering/acceptance-criteria.md`, UX specs |
| **Architecture & Data Specialist** | Designs domain models, TypeScript interfaces, Firestore schemas, state machine contracts, and decision records. | `src/types/`, `docs/engineering/architecture.md`, `docs/engineering/decision-log.md` |
| **Frontend Specialist** | Implements UI components, views (Kanban, List, Dashboards), navigation, forms, and Vanilla CSS design tokens. | `src/components/`, `src/features/`, `src/styles/`, `src/hooks/` |
| **Backend & Domain Specialist** | Implements pure domain business logic, state transitions, validation routines, Firestore services, and security rules. | `src/services/`, `src/domain/`, `firestore.rules` |
| **QA Specialist** | Writes and runs automated Vitest unit/integration tests, edge cases, negative security tests, and Playwright E2E suites. | `src/**/*.test.ts*`, `tests/` |
| **Security & Release Specialist** | Audits authorization rules, tenant isolation, dependency safety, environment variables, build verification, and readiness report. | `docs/engineering/security-review.md`, `docs/engineering/production-readiness-report.md`, `docs/engineering/handoff.md` |

---

## 2. Agent Coordination Protocol

Agents follow a phased, wave-based protocol as defined in the orchestrator workflow:

```
┌────────────────────────────────────────────────────────┐
│             Wave 0: Read-Only Discovery                │
│  (Product, Architecture, QA, Security inspect brief)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│              Checkpoint 1: Contract Lock               │
│  (Coordinator locks architecture, types & interfaces)  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│         Wave 1: Parallel Bounded Implementation        │
│   (Frontend, Backend, QA work in strictly non-         │
│             overlapping file directories)              │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│           Checkpoint 2: Integration & Build            │
│   (Coordinator verifies integration & compiles app)    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│         Wave 2: Adversarial Verification               │
│  (QA runs tests; Security audits negative paths;       │
│               Product validates UX flows)              │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             Checkpoint 3: Readiness Gate               │
│  (Go / No-Go decision based strictly on test evidence) │
└────────────────────────────────────────────────────────┘
```

### 2.1 Coordination Rules

1. **Strict File Ownership:** No two agents may edit the same file concurrently. Workstreams strictly respect their allocated directory boundaries.
2. **Contract-First Coding:** Implementation in Wave 1 begins **only** after domain interfaces (`src/types/`), Firestore rules outline, and acceptance criteria are committed.
3. **Evidence-Based Reporting:** Never claim a test passed, a command succeeded, or a security check was verified unless actual terminal command output demonstrates it.
4. **Sequential Fallback:** If subagent delegation is unavailable in the execution environment, the coordinator must execute each specialist phase sequentially while maintaining exact checkpoint integrity.

### 2.2 Shared Tracking Artifacts (`docs/engineering/`)

All agents read from and update these standardized tracking files:
- `docs/engineering/agent-task-board.md` — Live task status, owners, file scopes, and blockers.
- `docs/engineering/architecture.md` — Authoritative data flow, component hierarchy, and boundaries.
- `docs/engineering/decision-log.md` — Chronological architectural decisions and trade-offs (e.g., DEC-001).
- `docs/engineering/acceptance-criteria.md` — Living checklist mapping to `ASSIGNMENT.md` requirements.
- `docs/engineering/security-review.md` — Negative test evidence, rule analysis, and risks.
- `docs/engineering/production-readiness-report.md` — Test runs, build status, and Go/No-Go assessment.
- `docs/engineering/handoff.md` — Developer setup guide, environment config, and operational notes.

---

## 3. Coding Conventions & Architecture Standards

### 3.1 Technology Stack (Per DEC-001)
- **Runtime & Build:** React 18+ with Vite and TypeScript (strict mode enabled).
- **Styling:** Handcrafted Vanilla CSS with CSS custom properties (`src/styles/tokens.css`). **No TailwindCSS**, CSS-in-JS, or external heavy UI kits.
- **Backend & Persistence:** Firebase Authentication & Cloud Firestore (leveraging Firestore Emulator for local development).
- **Testing:** Vitest for unit/integration tests; Playwright for end-to-end acceptance automation.

### 3.2 Directory Structure
```
ojix-teamflow/
├── .agents/                    # Agent skills & customizations
├── docs/
│   └── engineering/            # Architectural & tracking documentation
├── public/                     # Static assets & favicons
├── src/
│   ├── assets/                 # Icons, illustrations, imagery
│   ├── components/             # Reusable design system UI components
│   │   ├── common/             # Buttons, Modals, Inputs, Badges, Skeletons
│   │   ├── layout/             # Navigation, Topbar, Sidebar, PageContainer
│   │   └── tasks/              # TaskCard, TaskDetailModal, BlockerModal
│   ├── domain/                 # Pure domain business logic & state machine
│   │   ├── taskStateMachine.ts # Valid state transitions & guards
│   │   ├── validation.ts       # Input validation schemas & date logic
│   │   └── timezone.ts         # Overdue and timezone calculation helpers
│   ├── features/               # Feature views & screen modules
│   │   ├── auth/               # Login, persona switcher, auth guards
│   │   ├── dashboard/          # Personal & Project metrics view
│   │   ├── projects/           # Project list, creation, settings
│   │   └── tasks/              # Kanban board & Grouped List views
│   ├── hooks/                  # Custom React hooks (useAuth, useTasks, useRealtime)
│   ├── services/               # Firebase / Firestore data access layer
│   │   ├── firebase.ts         # Firebase initialization & emulator config
│   │   ├── authService.ts      # Authentication operations & seed users
│   │   ├── projectService.ts   # Project collection queries & mutations
│   │   └── taskService.ts      # Task mutations, comments, and audit logging
│   ├── styles/                 # Design system styles
│   │   ├── tokens.css          # Color palette, spacing, typography tokens
│   │   ├── reset.css           # Modern CSS reset
│   │   └── global.css          # Base element styles & utility animations
│   ├── types/                  # Authoritative TypeScript definitions
│   │   ├── auth.ts             # User roles & profiles
│   │   ├── project.ts          # Project schema & statuses
│   │   └── task.ts             # Task schema, priorities, activity logs
│   ├── App.tsx                 # Root router & application shell
│   └── main.tsx                # Application entrypoint
├── tests/
│   ├── e2e/                    # Playwright end-to-end tests
│   └── rules/                  # Firestore Security Rules unit tests
├── firestore.rules             # Authoritative Firestore access rules
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### 3.3 TypeScript Standards
- Enable `"strict": true` in `tsconfig.json`.
- **Zero `any`:** Disallow the `any` type; use `unknown` with type narrowing or explicit interfaces.
- **Single Source of Truth:** All entity types must be defined in `src/types/` and imported across frontend and backend/services.
- **Immutability:** Use `readonly` properties where state should not be mutated directly.
- **Discriminated Unions:** Represent asynchronous status states (`'idle' | 'loading' | 'success' | 'error'`) with associated payload or error types.

### 3.4 Distinctive Frontend Design Standards (Per `frontend-design` Skill)

The UI must avoid cliché, AI-generated looks (e.g. warm-cream backgrounds with terracotta accents, or generic cards with uniform border-radii and identical drop shadows). It must be specifically tailored for a **high-velocity Team Project Execution OS**:

1. **Subject-Grounded Aesthetic:**
   - Designed for SMB operational rhythm: clean typography, high information density without clutter, clear hierarchy, and distinct visual cues for urgency.
   - Deep slate/zinc canvas (`#0d1117`, `#161b22`) paired with crisp borders (`#30363d`), distinct elevated surfaces (`#21262d`), and high-contrast text (`#f0f6fc`).
2. **Intentional Color Palette Tokens:**
   - **Primary Brand / Action:** Tailored Indigo/Violet (`hsl(246, 80%, 60%)`) for primary interactive moments.
   - **Status Accents:**
     - `Done`: Balanced Emerald (`hsl(152, 69%, 41%)`)
     - `In Progress` / `In Review`: Vibrant Sky/Cyan (`hsl(199, 89%, 48%)`)
     - `Blocked`: High-attention Amber/Orange (`hsl(38, 92%, 50%)`)
     - `Overdue` / Danger: Rose (`hsl(350, 89%, 60%)`)
   - Avoid generic, unadjusted saturated primary colors.
3. **Typography & Scale:**
   - Use Google Fonts (e.g. *Plus Jakarta Sans* or *Inter* for crisp interface legibility; *JetBrains Mono* for IDs and timestamps).
   - Strict type scale (12px, 14px body, 16px title, 20px card header, 28px page hero).
   - **Avoid typographic tells:** No tracked-out all-caps eyebrow labels above every card; no arbitrary single-word colored accents in titles; no redundant decorative markers.
4. **Purposeful Micro-Interactions & Restrained Motion:**
   - Motion must answer a user's action: smooth card drag/drop feedback (150ms ease), drawer slide-in for task inspection, button loading spinners, and subtle status badge transitions.
   - Respect `prefers-reduced-motion` media queries.
5. **UI Copywriting & Vocabulary:**
   - Plain, active language: "Create Task", "Move to Review", "Resolve Blocker", "Save Changes" (avoid generic "Submit").
   - Failure and empty states provide actionable direction:
     - Error messages state what happened and how to remediate (never vague or apologetic).
     - Empty states act as invitations to act with a clear primary button (e.g. "No tasks in this milestone. Add your first task to get started.").

---

## 4. Security Expectations & Threat Mitigation

### 4.1 Server-Enforced RBAC
- **Security Rules as Boundary:** Security must be enforced by `firestore.rules`. Never rely on client-side UI logic (hiding buttons or disabling inputs) to protect data.
- **Role Verification:** User roles (`Workspace Admin`, `Project Lead`, `Member`, `Viewer`) are verified via trusted Firestore user documents or custom auth claims, never client-supplied request bodies.

### 4.2 Strict Tenant & Project Isolation
- All project and task queries must verify that the requesting user's UID is present in `project.memberIds` (or that the user is a `Workspace Admin`).
- Negative testing must explicitly prove that a user cannot access or query a project they are not a member of.

### 4.3 Input Validation & Mutation Safety
- Client-side forms must validate input, but domain logic and security rules must re-validate:
  - Strings trimmed and length-bounded (`title`: 3–120 characters).
  - Valid status transitions strictly checked against `taskStateMachine.ts`.
  - Due date must be within project start/due date range.
  - Blocker reason must be non-empty when status is `Blocked`.
- **Double-Submit Prevention:** All submission triggers must disable upon click and execute idempotently.

### 4.4 Secrets & Sensitive Data Policy
- Strictly zero credentials or API keys in source control.
- `.env.example` contains only template placeholders.
- Only synthetic personas, mock content, and sandbox data are permitted in seed scripts and tests.

---

## 5. Testing Requirements & Verification Gates

Quality assurance is a blocking prerequisite for delivery. Every claim of completion must be verified with concrete test execution.

### 5.1 Required Test Levels

| Test Suite | Framework | Scope & Requirements |
|---|---|---|
| **Unit Tests** | Vitest | State machine transitions, date/timezone overdue math, validation rules, RBAC role checkers. |
| **Component Tests** | Vitest + RTL | Form validation feedback, empty states, loading skeletons, and interactive filter controls. |
| **Security Rules Tests** | Firestore Emulator Test SDK | Negative tests verifying that Viewers cannot mutate, and non-members cannot read unshared projects. |
| **E2E Acceptance Flow** | Playwright | Continuous acceptance flow from AC-08 (Create project ➔ Add task ➔ Assign ➔ Transition ➔ Comment ➔ Verify dashboard). |

### 5.2 Mandatory Negative Test Cases
1. **Unauthorized Project Access:** Member A attempts to query Project B (where Member A is not in `memberIds`). Result: `permission-denied`.
2. **Viewer Mutation Rejection:** Viewer attempts to create or update a task. Result: `permission-denied`.
3. **Invalid State Transition:** Attempting to transition a task from `Done` directly to `Blocked`. Result: Rejected with validation error.
4. **Missing Blocker Reason:** Transitioning to `Blocked` without a reason. Result: Form/domain rejects mutation.
5. **Double Mutation Idempotency:** Rapid double-click on "Create Task" creates only 1 document.

### 5.3 Quality Gates (Must pass prior to completion)
1. `npm run typecheck` (`tsc --noEmit`) passes with 0 errors.
2. `npm run lint` passes with 0 errors.
3. `npm run test` (Vitest) passes with 100% green tests.
4. `npm run test:e2e` (Playwright) passes the full acceptance flow.
5. `npm run build` generates clean production distribution bundle.

---

## 6. Skill Ecosystem & Extension Protocols (Per `find-skills`)

Agents are encouraged and authorized to leverage agent skills to maximize velocity and code quality:

### 6.1 Using Installed Skills
- Specialists must actively check and apply installed skills relevant to their task:
  - **Frontend Specialist:** Must follow [.agents/skills/frontend-design/SKILL.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/.agents/skills/frontend-design/SKILL.md) for distinctive aesthetic direction, typography, design tokens, and restrained micro-interactions.
  - **Lead Coordinator:** Follows [OJIX_Parallel_Product_Orchestrator_SKILL.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/OJIX_Parallel_Product_Orchestrator_SKILL.md) for orchestrating workstreams and gates.

### 6.2 Missing Skill Discovery via `find-skills`
- **Rule:** If an agent encounters a specialized task (e.g., complex Playwright testing, state machine patterns, web performance, accessibility, security audits) and the required skill is **not available or installed**, the agent **must use `find-skills`** ([.agents/skills/find-skills/SKILL.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/.agents/skills/find-skills/SKILL.md)) for their respective task.
- **Workflow:**
  1. Check leaderboard or run search: `npx skills find [query] [--owner <owner>]` (e.g. `npx skills find playwright`, `npx skills find vitest`, `npx skills find accessibility`).
  2. Verify quality before installing: prefer 1K+ installs, official sources (`vercel-labs`, `anthropics`, `microsoft`), and healthy star counts.
  3. Install the skill: `npx skills add <owner/repo@skill> -g -y`.
  4. Follow the installed skill's instructions to execute the task.
  5. If no suitable skill is found, proceed with domain expertise and record the absence in the task board.

---

## 7. Truthfulness & Non-Simulation Protocol

Agents are bound by strict truthfulness:
- **Never fabricate test outputs:** If a test has not been executed, state clearly that it has not been executed.
- **Never claim a live third-party integration:** In-app notifications and mock records must be truthfully documented as local/demo features.
- **Clear Limitations:** Any known defects or incomplete edge cases must be surfaced openly in `docs/engineering/production-readiness-report.md`.
