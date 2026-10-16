# Acceptance Criteria & Verification Matrix — OJIX TeamFlow

> **Project:** OJIX TeamFlow: Team Tasks & Project Execution OS  
> **Status:** Authoritative Acceptance Criteria  
> **Governing Standards:** [ASSIGNMENT.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/ASSIGNMENT.md) | [AGENTS.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/AGENTS.md) | [architecture.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/docs/engineering/architecture.md)

---

## 1. Traceability Matrix

This matrix maps every core requirement from [ASSIGNMENT.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/ASSIGNMENT.md) to automated test suites, manual verification steps, and quality gates.

| Requirement ID | Brief Requirement | Target Test Level | Test Suite / Location | Status |
|---|---|---|---|:---:|
| **AC-01** | Local/sandbox authentication & seeded role personas | Unit / Component / E2E | `tests/unit/auth.test.ts`, `tests/e2e/auth.spec.ts` | Ready |
| **AC-02** | Project registry, metadata, & member isolation | Rules / Integration / E2E | `tests/rules/projects.test.ts`, `tests/e2e/projects.spec.ts` | Ready |
| **AC-03** | Task records, priority, assignee, & viewer mutation guard | Rules / Component / E2E | `tests/rules/tasks.test.ts`, `tests/unit/taskForm.test.tsx` | Ready |
| **AC-04** | Valid status transitions & blocker reason enforcement | Unit / Component | `tests/unit/taskStateMachine.test.ts`, `tests/unit/blockerModal.test.tsx` | Ready |
| **AC-05** | Interactive Kanban board & filtered list views | Component / E2E | `tests/unit/filters.test.ts`, `tests/e2e/board.spec.ts` | Ready |
| **AC-06** | Project & personal dashboards with timezone overdue math | Unit / Component | `tests/unit/timezone.test.ts`, `tests/unit/dashboard.test.tsx` | Ready |
| **AC-07** | Task comments, notes, & chronological activity audit trail | Unit / Component / E2E | `tests/unit/auditService.test.ts`, `tests/e2e/tasks.spec.ts` | Ready |
| **AC-08** | Automated end-to-end continuous acceptance workflow | E2E (Playwright) | `tests/e2e/acceptance-flow.spec.ts` | Ready |

---

## 2. Detailed Acceptance Scenarios (Given-When-Then)

### AC-01: Authentication, Route Guards & Seeded Sandbox Profiles

#### Scenario 1.1: Unauthenticated Navigation Redirect
- **Given** an unauthenticated visitor,
- **When** the visitor navigates directly to a protected URL (e.g., `/dashboard`, `/projects`, `/tasks`),
- **Then** the application redirects the user to `/login` and displays an informative sign-in prompt without leaking project data.

#### Scenario 1.2: One-Click Demo Persona Login
- **Given** the login interface,
- **When** the evaluator selects one of the 4 pre-seeded demo personas:
  - *Alex Morgan* (`admin@ojix.local` - Workspace Admin)
  - *Sarah Chen* (`lead@ojix.local` - Project Lead)
  - *Marcus Vance* (`member@ojix.local` - Member)
  - *Elena Rostova* (`viewer@ojix.local` - Viewer)
- **Then** the application authenticates the persona without external network dependencies and routes them to their dashboard with their active role displayed in the sidebar.

---

### AC-02: Project Creation & Member Boundary Isolation

#### Scenario 2.1: Authorized Project Lead Creation
- **Given** an authenticated user with role `Project Lead` or `Workspace Admin`,
- **When** they fill the project creation form with:
  - Name: `"Q4 Infrastructure Migration"` (3–80 chars)
  - Objective: `"Upgrade database clusters and containerize services"`
  - Start Date: `2026-10-01`
  - Due Date: `2026-12-15`
  - Assigned Members: `["Marcus Vance", "Sarah Chen"]`
- **Then** the project is persisted to Firestore, appears in the project selector, and automatically sets `ownerId` to the creator's UID.

#### Scenario 2.2: Negative Test — Member Project Creation Rejection
- **Given** an authenticated user with role `Member` or `Viewer`,
- **When** they attempt to trigger a project creation API/service call,
- **Then** the request is rejected with a `permission-denied` error from Firestore Security Rules.

#### Scenario 2.3: Negative Test — Unshared Project Access Rejection
- **Given** an authenticated user `Member A`,
- **When** `Member A` attempts to read or subscribe to `projects/confidential-project-id` where `Member A ∉ memberIds`,
- **Then** Firestore Security Rules immediately reject the query with `permission-denied`, returning zero data.

---

### AC-03: Task Management & Viewer Mutation Guards

#### Scenario 3.1: Task Creation by Project Member
- **Given** an authenticated `Member` assigned to Project A,
- **When** they create a task with:
  - Title: `"Implement Redis cache layer"`
  - Priority: `"High"`
  - Status: `"Todo"`
  - Due Date: A valid date within the project timeline
- **Then** the task appears immediately in the `Todo` column of the Kanban board and the Grouped List view.

#### Scenario 3.2: Negative Test — Viewer Mutation Prevention
- **Given** an authenticated user with role `Viewer`,
- **When** the viewer views an authorized project board:
  - Add task buttons and drag-and-drop handles are visually disabled.
- **When** the viewer attempts to execute a direct mutation payload (create, update, reassign, or delete),
- **Then** Firestore Security Rules reject the write with `permission-denied`.

---

### AC-04: Task State Machine & Blocker Reason Enforcement

#### Scenario 4.1: Normal Lifecycle Progression
- **Given** a task in status `Todo`,
- **When** an assigned member drags or moves the task to `In Progress`,
- **Then** the status updates, an activity log entry is appended, and the column counter adjusts.
- **When** the member completes the work and moves it to `In Review`,
- **Then** the task enters the review stage.

#### Scenario 4.2: Blocker Transition Requires Reason
- **Given** a task in `Todo`, `In Progress`, or `In Review`,
- **When** the user attempts to move the task to `Blocked` without entering a blocker note,
- **Then** the UI opens the `BlockerModal` and disables submission until at least 5 characters of explanation are entered.
- **When** a valid blocker reason is submitted,
- **Then** the task status transitions to `Blocked`, the card receives the amber blocker badge, and the blocker notice is displayed.

#### Scenario 4.3: Negative Test — Illegal Status Transition Rejection
- **Given** a task currently in status `Done`,
- **When** a user attempts to transition the task directly to `Blocked`,
- **Then** domain validation (`taskStateMachine.ts`) rejects the transition with: `"Cannot transition directly from Done to Blocked. Reopen to Todo first."`

---

### AC-05: Real-Time Sync, Kanban Board & Filtered Views

#### Scenario 5.1: Real-Time Cross-Client Synchronization
- **Given** two active browser windows (Client A and Client B) viewing Project A's Kanban board,
- **When** Client A moves task `"Setup telemetry"` from `In Progress` to `In Review`,
- **Then** Client B's board reflects the new column placement within <1000ms without requiring a page refresh.

#### Scenario 5.2: Multi-Faceted Filter & Search Intersection
- **Given** a project with 25 diverse tasks,
- **When** the user selects `Priority = Urgent` AND types `"database"` in the search bar,
- **Then** the view instantly filters to show only urgent tasks whose title or description contains `"database"`.
- **When** the user clicks `"Clear Filters"`,
- **Then** the view restores all project tasks.

---

### AC-06: Accurate Dashboard Metrics & Local Timezone Overdue Logic

#### Scenario 6.1: Overdue Task Calculation Standard
- **Given** a task with status `In Progress` and `dueDate = 2026-10-15`,
- **Given** current local system time is `2026-10-16 09:00:00`,
- **When** the dashboard metrics calculate overdue tasks,
- **Then** the task is counted as **Overdue** because the due date has passed local calendar midnight (23:59:59).

#### Scenario 6.2: Completed Tasks Excluded from Overdue
- **Given** a task with `dueDate = 2026-10-10` and `status = Done`,
- **When** overdue metrics calculate,
- **Then** the task is **NOT** counted as overdue.

#### Scenario 6.3: Metric Consistency
- **Given** the Personal Dashboard and the Project Dashboard,
- **When** a task transitions to `Done`,
- **Then** the Overdue tile and Open Tasks tile decrement synchronously across both dashboards.

---

### AC-07: Task Notes & Chronological Activity Trail

#### Scenario 7.1: Update Notes & Comment Posting
- **Given** an open task detail modal,
- **When** a project member writes an update note: `"Staging cluster deploy verified; awaiting smoke test."` and clicks `"Post Note"`,
- **Then** the note is appended to the timeline with author name, role badge, and ISO timestamp.

#### Scenario 7.2: Immutable Audit Log
- **Given** an activity log entry created in Firestore,
- **When** any user attempts an update or delete mutation on `activity_logs/{logId}`,
- **Then** Firestore Security Rules reject the mutation with `permission-denied` (append-only enforcement).

---

### AC-08: Continuous End-to-End Acceptance Journey (Playwright Automation)

A continuous automated Playwright test suite (`tests/e2e/acceptance-flow.spec.ts`) must execute and pass the full lifecycle sequence in a single run:

```
Step 1: Sign in as Project Lead persona (Sarah Chen)
Step 2: Create a new project ("Alpha Release Sprint") with target dates
Step 3: Create a task ("Implement Auth Guards") assigned to Marcus Vance with High priority
Step 4: Transition the task from "Todo" to "In Progress"
Step 5: Post an update comment ("Branch created; writing unit tests")
Step 6: Transition the task to "In Review"
Step 7: Verify Personal and Project Dashboards reflect updated status counts
Step 8: Sign out and sign in as Member (Marcus Vance) to verify real-time task visibility
```

---

## 3. Negative Path & Security Rules Acceptance Scenarios

| Test Case | Actor | Action | Expected Result |
|---|---|---|---|
| **NEG-01** | Non-Member | Direct query for unshared project | Firestore `permission-denied`; 0 documents returned |
| **NEG-02** | Viewer | Attempt task creation via service call | Firestore `permission-denied`; no document created |
| **NEG-03** | Viewer | Attempt task status transition | Firestore `permission-denied`; status unchanged |
| **NEG-04** | Member | Direct mutation transitioning `Done` ➔ `Blocked` | Domain validation rejects with `INVALID_TRANSITION` |
| **NEG-05** | Member | Direct mutation to `Blocked` without `blockerReason` | Domain validation rejects with `BLOCKER_REASON_REQUIRED` |
| **NEG-06** | Contributor | Rapid double-click on task creation submit button | Second click ignored via button lock; exactly 1 task created |

---

## 4. Verification Gates (Definition of Done Checklist)

Every pull request or release candidate must pass all gates prior to approval:

- [ ] `npm run typecheck` passes with 0 TypeScript compiler errors.
- [ ] `npm run lint` passes with 0 warnings or errors.
- [ ] `npm run test` (Vitest) passes 100% of unit and component tests.
- [ ] `npm run test:rules` (Firestore Emulator SDK) passes all positive and negative security tests.
- [ ] `npm run test:e2e` (Playwright) passes the complete AC-08 continuous flow.
- [ ] `npm run build` succeeds with a clean production bundle.
