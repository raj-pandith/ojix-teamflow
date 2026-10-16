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
