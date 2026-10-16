# Assignment 01 — OJIX TeamFlow: Team Tasks & Project Execution OS

**Owner:** Member 1  
**Audience:** Teams in small or mid-sized businesses (SMBs)  
**Document Status:** Finalized  
**Target Platform:** Web Application (React + Vite + TypeScript, Vanilla CSS design tokens, Firebase Auth & Firestore)

---

## 1. Business Problem & Executive Summary

Teams frequently coordinate cross-functional projects, owners, due dates, milestones, and decisions across disjointed spreadsheets, ad-hoc chat threads, and emails. This fragmentation leads to dropped action items, ambiguous ownership, missed deadlines, and poor executive visibility.

**OJIX TeamFlow** is a compact, high-velocity shared workspace and project execution operating system. It makes work visible, enforces unambiguous accountability, and streamlines follow-through without imposing the operational bloat and overhead of complex enterprise portfolio management suites.

---

## 2. User Roles & Permission Matrix

Access control is strictly enforced at the **data and security rules layer (Firestore Security Rules / API layer)**. Client-side UI element visibility or disabled buttons are purely for UX and **never** considered security boundaries.

### 2.1 Role Definitions

| Role | Description |
|---|---|
| **Workspace Admin** | Complete governance over the workspace, organization settings, team member directory, role assignments, and workspace-wide audit logs. |
| **Project Lead** | Creator and owner of specific projects. Manages project settings, milestones, members assigned to the project, task creation/assignment, and project reporting. |
| **Member** | Active team contributor. Can view projects they are explicitly members of, create and update assigned tasks, post comments/notes, and log activity. |
| **Viewer** | Read-only stakeholder (e.g., client, executive, or external observer). Can view explicitly shared projects, task boards, and reports, but cannot mutate any data. |

### 2.2 Role-Based Access Control (RBAC) Matrix

| Action / Capability | Workspace Admin | Project Lead | Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| Manage workspace settings & invite members | ✅ | ❌ | ❌ | ❌ |
| Create new projects | ✅ | ✅ | ❌ | ❌ |
| Edit project details & archive project | ✅ | ✅ (Owned projects) | ❌ | ❌ |
| Manage project membership & assignments | ✅ | ✅ (Owned projects) | ❌ | ❌ |
| Create tasks within project | ✅ | ✅ | ✅ (Permitted projects) | ❌ |
| Edit task details (title, description, due date) | ✅ | ✅ | ✅ (Permitted projects) | ❌ |
| Reassign task | ✅ | ✅ | ✅ (Permitted projects) | ❌ |
| Transition task status | ✅ | ✅ | ✅ (Assigned or Permitted) | ❌ |
| Add task comments and update notes | ✅ | ✅ | ✅ (Permitted projects) | ❌ |
| Delete tasks | ✅ | ✅ (Owned projects) | ❌ | ❌ |
| View workspace & project dashboards | ✅ | ✅ | ✅ (Permitted projects) | ✅ (Permitted only) |
| View personal "My Tasks" dashboard | ✅ | ✅ | ✅ | ✅ |
| Access activity audit trail | ✅ | ✅ | ✅ (Permitted projects) | ✅ (Permitted only) |

---

## 3. Core Feature Specifications

### 3.1 Authentication & Sandbox Profiles
- **Authentication Mechanism:** Firebase Authentication with secure email and password sign-in.
- **Credential Safety:** Zero hard-coded production credentials; environment configuration isolated to `.env.example` and local `.env`.
- **Seeded Sandbox Personas:** Pre-seeded with realistic, synthetic user accounts across all 4 roles (Admin, Project Lead, Member, Viewer) for instant local testing and acceptance verification.
- **Session Management:** Reactive session state with smooth sign-in, sign-out, session restoration, and unauthorized route guards.

### 3.2 Workspace & Project Registry
- **Registry Attributes:**
  - `id`: Unique identifier (UUID / Firestore doc ID)
  - `name`: Human-readable name (3–80 characters)
  - `objective`: Concise statement of project purpose/deliverables
  - `ownerId`: Reference to Project Lead / Admin user
  - `status`: Project lifecycle state (`Planning`, `Active`, `On Hold`, `Completed`, `Archived`)
  - `startDate` & `dueDate`: ISO-8601 date strings (`YYYY-MM-DD`)
  - `memberIds`: Array of user IDs granted access
  - `createdAt` & `updatedAt`: Server-generated ISO timestamps
- **Project Governance:** Create, update, filter by status/lead, archive, and view project summaries.

### 3.3 Task & Milestone Management
- **Task Entity Attributes:**
  - `id`: Unique task identifier
  - `projectId`: Associated project ID
  - `title`: Short task name (3–120 characters)
  - `description`: Rich or markdown-enabled context (up to 2000 characters)
  - `assigneeId`: User ID of assigned member (or `null` for unassigned)
  - `priority`: `Urgent`, `High`, `Medium`, `Low`
  - `status`: `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Blocked`
  - `blockerReason`: Required contextual note when status is set to `Blocked`
  - `dueDate`: ISO date (`YYYY-MM-DD`) with explicit timezone handling
  - `milestoneId`: Optional milestone grouping tag
  - `createdAt`, `updatedAt`, `createdBy`: Audit metadata
- **CRUD & Bulk Operations:** Inline quick-create, full modal editor, status progression, and re-assignment.

### 3.4 Dual Visualization: Kanban Board & Grouped List
- **Interactive Kanban Board:**
  - Visual columns for each lifecycle status (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Blocked`).
  - Drag-and-drop or one-click status transition controls.
  - Column header task counters and visual progress indicators.
  - Priority badges with distinctive design-system color coding.
- **Structured List View:**
  - Tabular view grouped by Status, Assignee, Priority, or Milestone.
  - Sortable headers (Due Date, Priority, Title, Assignee).
- **Universal Multi-Filter & Search:**
  - Real-time client search across task title and description.
  - Instant faceted filters: Status, Assignee, Priority, and Due Date range (e.g., Overdue, Today, This Week).
  - Active filter chips with one-click clear.

### 3.5 Personal & Project Dashboards
- **Personal Dashboard ("My Work / My Tasks"):**
  - Instant personal overview for the authenticated user.
  - Metric tiles: **Overdue Tasks**, **Due Today**, **In Progress**, **Blocked Items**.
  - Quick-action list of high-priority tasks requiring immediate attention.
- **Project Executive Dashboard:**
  - Project health indicators (% completed, velocity, open vs. closed).
  - Overdue warning alerts calculated against the documented timezone rule.
  - Blocker breakdown highlighting blocked tasks with reasons.

### 3.6 Real-Time Activity Timeline & Update Notes
- **Task Notes & Comments:** Threaded update notes on each task allowing team members to communicate progress or reasons for status changes.
- **Audit Activity Trail:** System-logged events recording who changed what and when:
  - Task created / reassigned / due date changed.
  - Status transitions (e.g., `In Progress` ➔ `In Review`).
  - Blocker flagged or cleared.
- **Reactive Live Sync:** Cloud Firestore real-time snapshots (`onSnapshot`) ensuring all open client tabs update automatically without page refreshes.

### 3.7 UI System, Accessibility & State Handling
- **Aesthetic Design System:** Handcrafted Vanilla CSS with CSS custom properties (`tokens.css`), dark mode aesthetic, vibrant status accents, smooth micro-interactions, and responsive layout (mobile, tablet, desktop).
- **Comprehensive State Architecture:**
  - **Loading States:** Non-layout-shifting skeleton screens.
  - **Empty States:** Actionable, friendly guidance for empty projects, zero search results, and clean task lists.
  - **Error States:** Informative toast/banner alerts for validation failures, network issues, and permission denial.
  - **Form Validation Feedback:** Immediate inline validation highlighting missing required fields or invalid date ranges.

---

## 4. Business Rules & Logic

### 4.1 Status State Machine & Allowed Transitions

Tasks must adhere strictly to valid operational transitions. Arbitrary state jumps are rejected by domain validation:

```
                  ┌───────────────┐
                  │    Backlog    │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │     Todo      │◀────────────────┐
                  └───────┬───────┘                 │
                          │                         │
                          ▼                         │
                  ┌───────────────┐                 │
            ┌────▶│  In Progress  │                 │
            │     └───────┬───────┘                 │
            │             │                         │
            │             ▼                         │
            │     ┌───────────────┐                 │
            │     │   In Review   │                 │
            │     └───────┬───────┘                 │
            │             │                         │
            │             ▼                         │
            │     ┌───────────────┐                 │
            │     │     Done      │─────────────────┘ (Reopen)
            │     └───────────────┘
            │             ▲
            │             │ (Unblocked directly to Done or In Progress)
            │             │
            ▼             │
    ┌───────────────┐     │
    │    Blocked    ├─────┘
    └───────────────┘
```

**Transition Rules:**
1. **Backlog ➔ Todo:** Task is groomed and scheduled.
2. **Todo ➔ In Progress:** Work begins. Assignee must not be empty.
3. **In Progress ➔ In Review:** Development complete; ready for review/verification.
4. **In Review ➔ Done:** Accepted by reviewer or Project Lead.
5. **In Review ➔ In Progress:** Changes requested; returned to contributor.
6. **Any Active State (Todo, In Progress, In Review) ➔ Blocked:** Allowed **only** if a non-empty `blockerReason` (minimum 5 characters) is supplied.
7. **Blocked ➔ In Progress / Todo:** Block issue resolved; `blockerReason` is cleared and logged to the activity history.
8. **Done ➔ Todo (Reopen):** Requires a reopen rationale note; cannot transition directly to `Blocked`.
9. **Done ➔ Blocked:** **Disallowed**. A completed task cannot be marked blocked without reopening first.

### 4.2 Data Validation & Integrity Rules
- **Project Due Date:** Must be equal to or later than the project `startDate`.
- **Task Due Date:** Must fall within the parent project's active timeframe (`startDate` to `dueDate`).
- **Required String Trimming:** All titles and descriptions are trimmed. Empty whitespace-only submissions are rejected.
- **Idempotency & Double-Submit Protection:** Mutation buttons disable synchronously upon submission; form submission handlers enforce idempotency keys or request locking to avoid duplicate records.

### 4.3 Timezone & Overdue Determination Rules
- **Standard Timezone Rule:** System defaults to the user's localized browser timezone (with UTC stored canonically in Firestore).
- **Overdue Definition:** A task is flagged as **Overdue** if and only if:
  1. `status != 'Done'`, AND
  2. The calendar day of `dueDate` is strictly earlier than the current calendar day at 23:59:59 in the active user's local timezone.
- **Consistency Guarantee:** Due and Overdue counts displayed on the Personal Dashboard, Project Dashboard, and Kanban badges must calculate using this identical timezone logic.

### 4.4 Data Access & Boundary Isolation
- **Tenant & Project Isolation:** A `Member` or `Viewer` cannot read or query documents belonging to a project they are not explicitly assigned to in `memberIds`.
- **Write Authorization:** Attempted writes from users with role `Viewer` or non-members of that project must fail with an authoritative `permission-denied` error from Firestore Security Rules.

---

## 5. Acceptance Criteria & Test Scenarios

### AC-01: Authentication & Seeded Personas
- **Given** an unauthenticated visitor,
- **When** they navigate to any protected route (Dashboard, Projects, Tasks),
- **Then** they are redirected to `/login` with an informative banner.
- **Given** the login screen,
- **When** the evaluator selects any seeded persona (Admin, Project Lead, Member, Viewer) or inputs valid demo credentials,
- **Then** the user is authenticated and redirected to their role-appropriate landing view.

### AC-02: Project Creation & Member Boundary Isolation (Negative Test Included)
- **Given** an authenticated `Member` or `Viewer`,
- **When** they attempt to create a new project via UI or direct API invocation,
- **Then** the request is rejected with `403 Forbidden` / `permission-denied`.
- **Given** an authenticated `Workspace Admin` or `Project Lead`,
- **When** they submit a valid project with name, objective, start date, and due date,
- **Then** the project is persisted and appears in the registry.
- **Negative Test:** If `Member A` queries project ID `PROJ-SECRET` where `Member A ∉ memberIds`, the database query returns permission denied and zero documents.

### AC-03: Task Creation & Viewer Mutation Guard (Negative Test Included)
- **Given** an authenticated `Viewer`,
- **When** they attempt to create, edit, reassign, or delete a task,
- **Then** the action is blocked by the UI and rejected by security rules if attempted via direct payload.
- **Given** a `Project Lead` or permitted `Member`,
- **When** they create a task with title, priority, assignee, and due date,
- **Then** the task appears instantly on both the Kanban board and the Grouped List view.

### AC-04: Task State Machine & Blocker Reason Enforcement (Negative Test Included)
- **Given** a task in `In Progress`,
- **When** a user attempts to change status to `Blocked` without providing a `blockerReason`,
- **Then** the form prevents submission with an inline validation error: "Blocker reason required".
- **When** a valid blocker reason is supplied,
- **Then** the status updates to `Blocked`, the card displays the blocker flag, and an entry is added to the activity feed.
- **Negative Test:** A direct mutation attempting to transition a task from `Done` directly to `Blocked` is rejected.

### AC-05: Real-Time Sync & Responsive Views
- **Given** two separate browser sessions viewing the same project board,
- **When** Session 1 moves a task from `Todo` to `In Progress`,
- **Then** Session 2 reflects the new column placement within <1 second without manual browser refresh.
- **Given** active filters (e.g., `Priority = Urgent`),
- **When** search term "migration" is entered,
- **Then** the view instantly displays the intersection of urgent tasks matching "migration".

### AC-06: Accurate Dashboard Metrics & Overdue Calculation
- **Given** tasks with due dates in the past (relative to local midnight) that are not `Done`,
- **When** the user views the Personal or Project Dashboard,
- **Then** the Overdue tile count matches the exact number of overdue items visible in the filtered list.

### AC-07: Activity Log & Task Notes Trail
- **Given** any task edit (status change, reassignment, or note added),
- **When** the task detail modal is opened,
- **Then** the Activity Feed shows an accurate chronological timeline of changes with author name, previous value, new value, and timestamp.

### AC-08: Automated End-to-End Acceptance Flow
An automated Playwright test suite must successfully execute this continuous flow from a clean state:
1. Log in as Project Lead.
2. Create a new Project with target dates.
3. Create a Task assigned to Member.
4. Transition Task from `Todo` ➔ `In Progress`.
5. Post an update note explaining current progress.
6. Transition Task to `In Review`.
7. Verify Dashboard metrics and Activity Log reflect every change accurately.

---

## 6. Three Independently Authored Skills Required

The system requires three specialized AI workflow skills developed independently:

1. **TeamFlow Build Orchestrator (`ojix-parallel-product-orchestrator`):**
   - Coordinates parallel workstreams: Product/UX, Architecture/Data, Frontend, Backend/Domain, QA, and Security.
   - Enforces the Definition of Done, contract checkpoints, and adversarial verification before release.
2. **Work Triage Accelerator:**
   - Evaluates active tasks across projects to assist human leads:
     - Automatic due-date & overdue triage.
     - Blocker analysis & dependency bottlenecks.
     - Action-item extraction from raw meeting notes into structured tasks.
   - **Constraint:** Must never invent missing facts or make ungrounded assumptions.
3. **Workspace Production Assurance:**
   - Independent verification engine:
     - Validates project boundary access controls (negative tests).
     - Checks task state-machine integrity and prevents duplicate mutations.
     - Audits database security rules, test coverage, and release readiness blockers.

---

## 7. Out of Scope & Explicit Non-Goals

To keep the application focused, lightweight, and maintainable, the following capabilities are explicitly **OUT OF SCOPE**:

1. **Third-Party Integrations:**
   - No live Slack, Microsoft Teams, Discord, or WhatsApp webhooks or bots.
   - No live external email sending (SendGrid, Mailgun, SMTP). All notifications and alerts are strictly in-app.
   - No Google Calendar or Outlook calendar two-way synchronization.
2. **Enterprise Portfolio & ERP Complexity:**
   - No complex multi-project Gantt chart scheduling or critical path auto-leveling algorithms.
   - No financial billing, client invoicing, payroll, or hourly rate calculations.
   - No timesheet tracking or clock-in/clock-out timecard management.
3. **Public Sharing & Anonymous Collaboration:**
   - No public unauthenticated project URLs or guest editing without a registered workspace account.
   - No multi-tenant cross-organization public sharing links.
4. **Third-Party File Storage / Heavy Media:**
   - No video streaming, document co-authoring suites, or heavy media asset management.
5. **Live Production Infrastructure & Unapproved Deployments:**
   - No live production deployments to paid cloud services without explicit sign-off.
   - All verification is conducted using local development servers, synthetic seed data, and the Firebase Emulator Suite.
