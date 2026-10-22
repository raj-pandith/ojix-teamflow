# Decision Log — OJIX TeamFlow

> Decisions are recorded in chronological order. Each entry includes the date, the decision made, the rationale, and any trade-offs acknowledged.
> **Governing Standards:** [ASSIGNMENT.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/ASSIGNMENT.md) | [AGENTS.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/AGENTS.md) | [architecture.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/docs/engineering/architecture.md)

---

## DEC-001 — Technology Stack Selection

**Date:** 2026-10-16  
**Status:** Finalized  

### Decisions

| Layer | Choice | Rationale |
|---|---|---|
| **Frontend framework** | React + Vite (TypeScript) | Fast dev server, strong component model, TypeScript enforces type safety across the codebase |
| **Styling** | Vanilla CSS + design tokens | Maximum control, no framework lock-in, aligns with assignment aesthetic requirement |
| **Authentication** | Firebase Authentication (email/password) | Sandbox-safe, no hard-coded shared credentials, integrates with Emulator Suite for local dev |
| **Database** | Firebase Cloud Firestore | NoSQL document model fits the workspace/project/task hierarchy; supports real-time listeners |
| **Real-time sync** | Firestore `onSnapshot()` listeners | Automatic cross-client updates without manual refresh or polling |
| **Security** | Firestore Security Rules | Server-enforced RBAC — UI visibility is not authorization |
| **Unit testing** | Vitest | Native Vite integration, fast, compatible with React Testing Library |
| **E2E testing** | Playwright | Covers the mandatory automated acceptance flow from the assignment brief |
| **Local development** | Firebase Emulator Suite | No production credentials required to run or test the application locally |

### Trade-offs Acknowledged
- Firestore Security Rules require careful authoring — complex role logic can be hard to test in isolation. Mitigated by using the Emulator Suite and writing explicit negative-path tests.
- Vanilla CSS requires manual design system discipline; no utility classes. Mitigated by establishing a token file (`tokens.css`) before component work begins.
- Firebase vendor lock-in is accepted for the scope of this assignment (sandbox/demo target).

---

## DEC-002 — Firestore Collection Architecture: Flat Root Collections vs Subcollections

**Date:** 2026-10-16  
**Status:** Finalized  

### Context
In Firestore, task documents can be structured either as nested subcollections (`workspaces/{wId}/projects/{pId}/tasks/{tId}`) or as flat root collections (`tasks/{tId}`) with indexed foreign keys (`workspaceId`, `projectId`, `assigneeId`).

### Decision
Adopt **flat root-level collections** (`users`, `workspaces`, `projects`, `tasks`, `activity_logs`) with denormalized relationship keys (`workspaceId`, `projectId`, `memberIds`).

### Rationale
1. **Cross-Project Querying:** Personal dashboards require querying all tasks assigned to the current user across multiple projects ("My Tasks"). With flat collections, this is a single, clean query: `where('assigneeId', '==', uid).where('status', '!=', 'done')`. Nested subcollections would require Collection Group queries with complex index configurations and more brittle security rule scoping.
2. **Simplified Rule Auditing:** Scoping rules at `/tasks/{taskId}` where permissions look up parent `projects/$(resource.data.projectId)` provides explicit, centralized permission definitions.
3. **Optimized Pagination & Batching:** Flat collections make multi-faceted filtering (priority, status, due date) straightforward to index and query.

### Trade-offs Acknowledged
- Parent lookups in `firestore.rules` (`get(/databases/$(database)/documents/projects/$(projectId))`) incur rule evaluation reads. In Firestore, these are cached across rule invocations for the same document within a single request, mitigating performance impact.

---

## DEC-003 — Security Enforcement Architecture: Rules as Canonical Boundary

**Date:** 2026-10-16  
**Status:** Finalized  

### Context
Many applications rely on client-side routing, hidden buttons, or disabled inputs to restrict unauthorized user actions. The assignment explicitly mandates: *"Enforce project/workspace permissions at the data/API layer. Hiding buttons is not authorization."*

### Decision
Treat **`firestore.rules` as the single authoritative security boundary**. Client-side UI guards (disabling edit buttons for Viewers, hiding project creation forms for Members) are treated purely as ergonomic affordances, never as security controls.

### Implementation Details
- User roles (`workspace_admin`, `project_lead`, `member`, `viewer`) are stored in trusted `users/{uid}` documents.
- Security rules evaluate role by retrieving the authenticated user's trusted document (`get(/databases/.../users/$(request.auth.uid))`).
- Every query enforces project membership (`request.auth.uid in project.memberIds` or user is `workspace_admin`).
- Viewer write attempts reject immediately with `permission-denied`.
- All security guarantees are verified with automated negative tests in `tests/rules/`.

### Trade-offs Acknowledged
- Requires running the Firebase Emulator Suite in CI/local environments for test execution. Mitigated by automated test scripts (`npm run test:rules`).

---

## DEC-004 — Pure Domain Logic Decoupling & State Machine Architecture

**Date:** 2026-10-16  
**Status:** Finalized  

### Context
Task status workflows involve operational constraints (e.g., transitions to `Blocked` require an explanation; `Done` cannot transition directly to `Blocked`). Embedding this logic inside React component event handlers leads to poor testability, code duplication across views (Kanban vs List), and subtle bugs.

### Decision
Extract all transition rules, input schemas, and date calculations into **pure, framework-agnostic TypeScript domain modules** in `src/domain/`:
- `taskStateMachine.ts`: Defines valid transition pairs, guard functions, and required payload fields.
- `validation.ts`: Validates project and task input constraints (string lengths, required fields, date bounds).
- `timezone.ts`: Isolated overdue and timezone calculations.

### Rationale
- Pure domain logic can be tested with 100% test coverage using fast Vitest unit tests without mocking DOM or React components.
- Consistent enforcement across drag-and-drop actions, detail modal updates, and bulk status changes.
- Clear error codes returned for UI feedback (`INVALID_TRANSITION`, `BLOCKER_REASON_REQUIRED`).

### Trade-offs Acknowledged
- Slightly more upfront boilerplate (defining explicit state machines and action creators), but substantially reduces regression risk.

---

## DEC-005 — Timezone Handling & Overdue Determination Standard

**Date:** 2026-10-16  
**Status:** Finalized  

### Context
Due dates and overdue calculations often produce confusing inconsistencies when teams work across timezones, or when UTC timestamps flag an item as overdue hours before the end of the user's business day.

### Decision
1. **Storage Standard:** All dates are stored as ISO-8601 calendar date strings (`YYYY-MM-DD`) without hardcoded time components, and UTC timestamps for creation/update audits.
2. **Overdue Standard:** A task is deemed **Overdue** if and only if:
   - `task.status !== 'done'`, AND
   - The task's `dueDate` is strictly earlier than the current calendar day at `23:59:59` in the active user's local browser timezone.
3. **Uniform Calculation:** Both the Personal Dashboard, Project Dashboard, and Kanban cards compute overdue state through a single helper `isTaskOverdue(dueDate, status, userTimezone)` from `src/domain/timezone.ts`.

### Rationale
- Eliminates "premature overdue" alerts where a task due today is marked overdue at UTC midnight while the team is still working.
- Guarantees 100% metric consistency across all screens and widgets.

### Trade-offs Acknowledged
- Users viewing the app in different timezones near midnight may see a task transition to overdue slightly earlier or later than their remote teammates, which is standard calendar behavior for distributed teams.

---

## DEC-006 — Handcrafted Vanilla CSS Design System with Custom Property Tokens

**Date:** 2026-10-16  
**Status:** Finalized  

### Context
Modern web applications frequently default to utility-first CSS frameworks like TailwindCSS or heavy UI libraries (Material UI, Ant Design). The assignment guidelines emphasize distinctive, premium aesthetics and specifically discourage Tailwind unless explicitly requested.

### Decision
Build a **bespoke Vanilla CSS Design System** powered by CSS custom properties in `src/styles/tokens.css`, strictly adhering to the `frontend-design` skill principles.

### Rationale
1. **Aesthetic Autonomy:** Full freedom to create a distinctive dark-mode visual identity with curated HSL status accents (Indigo, Sky, Emerald, Amber, Rose) without cookie-cutter SaaS aesthetics.
2. **Zero Dependency Overhead:** 0kb added bundle weight, zero compilation overhead, and no build tool plugins needed.
3. **Subject-Matter Alignment:** Designed specifically for high-velocity project execution with high information density, crisp borders, and purposeful micro-interactions.
4. **Accessible Standards:** Explicit contrast ratios, visible focus outlines, and built-in support for `prefers-reduced-motion`.

### Trade-offs Acknowledged
- Requires discipline in CSS selector naming and organization. Mitigated by structured files (`tokens.css`, `reset.css`, `global.css`, and scoped feature stylesheets).

---

## DEC-007 — Idempotent Mutation Strategy & Double-Submit Protection

**Date:** 2026-10-16  
**Status:** Finalized  

### Context
Rapid clicking on submission buttons or network lag can lead to accidental duplicate project or task creation, creating clutter and corrupted audit trails.

### Decision
Implement a **multi-tiered idempotency control**:
1. **UI Layer:** Submit buttons immediately enter a disabled `isSubmitting` state synchronously upon click, showing a spinner.
2. **Client Mutation Layer:** Generate client-side UUIDs (`crypto.randomUUID()`) for new document IDs before dispatching to Firestore (`setDoc(doc(db, 'tasks', newId), payload)` instead of auto-generated `addDoc`).
3. **Service Layer Lock:** In-flight mutation promises are tracked in a mutation registry; duplicate calls with the same key within 2000ms return the existing promise.

### Rationale
- Completely prevents duplicate document creation even under double-click conditions.
- Preserves audit log purity: exactly one activity event per user action.

### Trade-offs Acknowledged
- Requires client-side ID generation, but modern browsers natively support `crypto.randomUUID()`.

---

## DEC-008 — Hybrid Local Persistence Engine

**Date:** 2026-10-16  
**Status:** Finalized  

### Context
Running the Firebase Emulator Suite locally requires a Java JRE. To ensure seamless evaluation across any testing environment without prerequisite setup barriers while preserving real Firestore compatibility, an adaptive persistence strategy is needed.

### Decision
Implement a **hybrid data access layer**:
1. Connect to the Firebase Emulator Suite if it is running locally.
2. If the emulator is unreachable, seamlessly fall back to an in-memory/localStorage reactive store that faithfully mimics Firestore collections (`users`, `projects`, `tasks`, `activity_logs`), query operators, and `onSnapshot` subscriptions.

### Rationale
- Zero-friction demo setup: running `npm run dev` works instantly in any modern browser without requiring Java or external services.
- Evaluators with Firebase CLI installed can still run full emulator-backed testing.

### Trade-offs Acknowledged
- Maintaining a mock storage adapter with identical query semantics requires rigorous domain tests. Mitigated by sharing domain validators and state machine logic between both engines.

---

## DEC-009 — Evaluation Ergonomics: Persistent Topbar Persona Quick-Switcher

**Date:** 2026-10-16  
**Status:** Finalized  

### Context
Testing role-based access control (Admin, Project Lead, Member, Viewer) requires repeatedly switching accounts. Forcing evaluators to manually sign out, navigate to `/login`, and type or select credentials creates unnecessary friction.

### Decision
Provide a **persistent "Persona Switcher" dropdown widget in the Topbar**, allowing 1-click role swapping on the fly, while preserving the full standard `/login` route and route guards.

### Rationale
- Dramatically accelerates verification of role differences (e.g. switching from Lead to Viewer to see mutation controls instantly lock).
- Explicit visual badge always displays the current active role and user profile.

### Trade-offs Acknowledged
- The quick-switcher is an evaluation feature for sandbox environments; it is clearly labeled as a Demo Evaluation Tool.

---

## DEC-010 — Dual Kanban Interaction Model (Native Drag-and-Drop + Click-to-Move Controls)

**Date:** 2026-10-16  
**Status:** Finalized  

### Context
Drag-and-drop offers high visual satisfaction, but can be cumbersome on touch devices, small viewports, or for keyboard-only accessibility.

### Decision
Implement a **dual interaction model**:
1. Native HTML5 drag-and-drop between Kanban columns with visual drop-target indicators and smooth release transitions.
2. An accessible quick-action menu / status transition dropdown on every task card for 1-click status changes without dragging.

### Rationale
- Maximum ergonomics for mouse, trackpad, touch, and keyboard users.
- No heavy external drag-and-drop library required, keeping bundle size minimal.

### Trade-offs Acknowledged
- Requires dual event wiring, but shares the same underlying domain state machine transition function (`taskStateMachine.ts`).

---

## DEC-011 — Rich Synthetic Seed Dataset & Reset Facility

**Date:** 2026-10-16  
**Status:** Finalized  

### Context
Evaluators testing dashboards, overdue metrics, and blocker workflows should not have to manually enter dozens of tasks to see a populated system.

### Decision
1. Automatically populate the application with a realistic synthetic dataset on first load:
   - 4 users across the 4 roles.
   - 2 active projects (one collaborative, one confidential for boundary testing).
   - Tasks in all 6 lifecycle statuses (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Blocked` with reasons).
   - High, Medium, Low, and Urgent tasks, including items deliberately past due for overdue metric verification.
   - Initial activity log entries.
2. Provide a **"Reset Demo Data"** action in the workspace settings/topbar to restore pristine seed state at any time.

### Rationale
- Immediate visual impact upon launch.
- Predictable states for manual and automated acceptance tests.

---

## DEC-012 — In-App Integration for Triage and Assurance Skills

**Date:** 2026-10-16  
**Status:** Finalized  

### Context
`ASSIGNMENT.md` specifies three required skills: Orchestrator, Work Triage Accelerator, and Workspace Production Assurance. In addition to being documented as skills and test suites, making these capabilities accessible in the UI enhances transparency and demo value.

### Decision
1. **Work Triage Drawer:** Add an in-app slide-over panel that allows users to run:
   - Due-date & Overdue triage.
   - Blocker bottleneck analysis.
   - Meeting notes to action items extraction (with sample text provided).
2. **Security & Assurance Panel:** Add a live diagnostic panel in the Admin view that runs live RBAC checks and displays pass/fail indicators directly in the browser, complementing the automated terminal test suites.

### Rationale
- Proves domain logic execution live in front of evaluators.
- Fully grounds the required skills in the functional product experience.

---

## DEC-013 — Secure CRM Project Ingestion & Selective Import Architecture

**Date:** 2026-10-22  
**Status:** Finalized  

### Context
TeamFlow needed an automated, secure integration allowing Workspace Admins to review and selectively import won customer deals from OJIX ClientFlow CRM (`/api/projects?stage=WON`). The CRM API key (`ojix-teamflow-clientflow-2026`) must not be exposed in client-side bundles or network calls, non-admins must be strictly forbidden from accessing the gateway, duplicate projects must never be imported twice, and date validation rules must be upheld.

### Decision
1. **Server-Side Gateway (`GET /api/crm/projects`, `POST /api/crm/import`):**
   - The private CRM API key is maintained strictly server-side in `CLIENTFLOW_CRM_API_KEY`.
   - The backend validates that caller has role `workspace_admin` and active status.
   - The gateway dynamically checks each project against `sharedSyncData.projects` using `externalId` and `dealId` to annotate `isAlreadyImported`.
   - Projects with invalid date ranges (`dueDate < startDate`) are detected, marked with validation errors, and prohibited from creating invalid project records.
2. **Selective Review Modal (`CrmProjectImportModal.tsx`):**
   - Renders a project review dialog displaying name, objective, client contact, formatted deal value, stage, and readiness badges.
   - Initial state starts with 0 selections.
   - Includes tri-state "Select All Projects" checkbox that selects all eligible projects and unchecks cleanly.
   - Dynamically updates action button: `Accept Projects (N)`.
   - Already imported projects and projects with invalid date ranges display distinct badges and have checkboxes disabled.
3. **Automatic Import & Real-Time Sync:**
   - Converts CRM schema into TeamFlow `Project` instances, generating internal `proj-...` IDs, assigning `ws-ojix-main`, and preserving integration metadata in `crmMetadata`.
   - Atomically updates storage, emits SSE broadcast events (`sync`, `project_created`), updates client `storageEngine`, and displays actionable import reporting on partial failures.


