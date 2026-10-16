# Agent Task Board — OJIX TeamFlow

> **Project:** OJIX TeamFlow: Team Tasks & Project Execution OS  
> **Status:** All Waves & Checkpoints Completed  
> **Orchestrator Reference:** [OJIX_Parallel_Product_Orchestrator_SKILL.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/OJIX_Parallel_Product_Orchestrator_SKILL.md)  
> **Engineering Standards:** [AGENTS.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/AGENTS.md) | [architecture.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/docs/engineering/architecture.md) | [acceptance-criteria.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/docs/engineering/acceptance-criteria.md) | [decision-log.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/docs/engineering/decision-log.md)

---

## 1. Wave Status & Phased Checkpoints

```
[Wave 0: Discovery] ────► [Checkpoint 1: Contract Lock] ────► [Wave 1: Implementation] ────► [Checkpoint 2: Build] ────► [Wave 2: QA & Security] ────► [Checkpoint 3: GO Gate]
     COMPLETED                      COMPLETED                          COMPLETED                    COMPLETED                    COMPLETED                   VERIFIED (GO)
```

- **Wave 0 (Discovery):** Completed. Product brief, user roles, technical decisions, and architecture reviewed.
- **Checkpoint 1 (Contract Lock):** Completed. `architecture.md`, `acceptance-criteria.md`, and `decision-log.md` committed.
- **Wave 1 (Bounded Implementation):** Completed across all workstreams.
- **Checkpoint 2 (Integration & Build):** Completed. TypeScript strict mode (`tsc --noEmit`) passes with 0 errors; production build compiled in 992ms.
- **Wave 2 (Adversarial Verification):** Completed. 23/23 tests pass across unit, domain, timezone, and security RBAC negative suites.
- **Checkpoint 3 (Readiness Gate):** Verified. Production readiness report and handoff guide published. Release verdict: **GO**.

---

## 2. Master Agent Task Assignments

### 2.1 Lead Coordinator (Orchestrator)
**Exclusive File Scope:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.env.example`, `docs/engineering/agent-task-board.md`

| Task ID | Description | Target Files | Dependencies | State |
|---|---|---|---|:---:|
| `COORD-01` | Scaffold root project manifest, TypeScript config, Vite builder, and `.env.example` placeholders | `package.json`, `tsconfig.json`, `vite.config.ts`, `.env.example` | Checkpoint 1 | **Completed** |
| `COORD-02` | Setup index.html shell, Google Fonts (*Plus Jakarta Sans*, *JetBrains Mono*), and meta tags | `index.html` | `COORD-01` | **Completed** |
| `COORD-03` | Execute Checkpoint 2: Run `tsc --noEmit` and compile production build bundle | Root configs | Wave 1 completion | **Completed** |
| `COORD-04` | Orchestrate Checkpoint 3: Compile production readiness report and deliver final release verdict | `docs/engineering/production-readiness-report.md` | Wave 2 completion | **Completed** |

---

### 2.2 Architecture & Data Specialist
**Exclusive File Scope:** `src/types/`, `src/domain/`, `docs/engineering/architecture.md`, `docs/engineering/decision-log.md`

| Task ID | Description | Target Files | Dependencies | State |
|---|---|---|---|:---:|
| `ARCH-01` | Define authoritative TypeScript interfaces for Auth, Projects, Tasks, and Audit Logs | `src/types/auth.ts`, `src/types/project.ts`, `src/types/task.ts`, `src/types/audit.ts` | `COORD-01` | **Completed** |
| `ARCH-02` | Implement pure finite state machine for tasks (`isValidTransition`, allowed status transitions, blocker guards) | `src/domain/taskStateMachine.ts` | `ARCH-01` | **Completed** |
| `ARCH-03` | Implement pure validation schemas (title lengths, date range comparisons, string trimming) | `src/domain/validation.ts` | `ARCH-01` | **Completed** |
| `ARCH-04` | Implement date calculation and local calendar midnight overdue logic per DEC-005 | `src/domain/timezone.ts` | `ARCH-01` | **Completed** |

---

### 2.3 Product & UX Specialist
**Exclusive File Scope:** `docs/engineering/acceptance-criteria.md`, UX specifications

| Task ID | Description | Target Files | Dependencies | State |
|---|---|---|---|:---:|
| `PROD-01` | Audit UI view specifications and define empty/loading/error states for all screens | `docs/engineering/acceptance-criteria.md` | Checkpoint 1 | **Completed** |
| `PROD-02` | Validate microcopy against active voice standards ("Create Task", "Resolve Blocker", "Save Changes") | `docs/engineering/acceptance-criteria.md` | `PROD-01` | **Completed** |
| `PROD-03` | Wave 2 verification: Inspect user flows against AC-01 through AC-08 in the integrated application | `docs/engineering/acceptance-criteria.md` | Checkpoint 2 | **Completed** |

---

### 2.4 Frontend Specialist
**Exclusive File Scope:** `src/components/`, `src/features/`, `src/styles/`, `src/hooks/`, `src/App.tsx`, `src/main.tsx`

| Task ID | Description | Target Files | Dependencies | State |
|---|---|---|---|:---:|
| `FRONT-01` | Implement handcrafted Vanilla CSS design system tokens, CSS reset, and utility animations | `src/styles/tokens.css`, `reset.css`, `global.css`, `components.css` | `COORD-01` | **Completed** |
| `FRONT-02` | Implement reusable UI primitives: `Button`, `Modal`, `Input`, `Badge`, `SkeletonRow/Card` | `src/components/common/` | `FRONT-01` | **Completed** |
| `FRONT-03` | Build application shell layout: `Sidebar`, `Topbar`, `PersonaSwitcher`, and navigation | `src/components/layout/` | `FRONT-02` | **Completed** |
| `FRONT-04` | Build Auth & Session hooks, demo persona quick-select switcher, and role guards | `src/hooks/useAuth.tsx`, `src/hooks/useToast.tsx` | `FRONT-03`, `ARCH-01` | **Completed** |
| `FRONT-05` | Build Interactive Kanban Board View with column counters, drag/click transitions, and priority tags | `src/features/tasks/KanbanBoard.tsx` | `FRONT-02`, `ARCH-02` | **Completed** |
| `FRONT-06` | Build Grouped List View with sortable columns, multi-faceted filtering (status, priority, due date), and search | `src/features/tasks/GroupedListView.tsx` | `FRONT-02`, `ARCH-01` | **Completed** |
| `FRONT-07` | Build Dashboards: Personal "My Tasks" view and Project Executive health/overdue view | `src/features/dashboard/` | `FRONT-02`, `ARCH-04` | **Completed** |
| `FRONT-08` | Build Task Modals: `TaskDetailModal`, `TaskCreateModal`, and mandatory `BlockerModal` | `src/components/tasks/` | `FRONT-02`, `ARCH-02` | **Completed** |
| `FRONT-09` | Implement custom React hooks: `useProjects`, `useTasks`, `useToast` | `src/hooks/` | `ARCH-01` | **Completed** |

---

### 2.5 Backend & Domain Specialist
**Exclusive File Scope:** `src/services/`, `firestore.rules`, `firestore.indexes.json`

| Task ID | Description | Target Files | Dependencies | State |
|---|---|---|---|:---:|
| `BACK-01` | Initialize Firebase SDK and configure local Firebase Emulator Suite connection | `src/services/firebase.ts` | `COORD-01` | **Completed** |
| `BACK-02` | Implement Authentication Service with 4 synthetic demo personas (Admin, Lead, Member, Viewer) | `src/services/authService.ts`, `mockData.ts` | `BACK-01`, `ARCH-01` | **Completed** |
| `BACK-03` | Implement Project Registry Service (CRUD, membership assignment, active project queries) | `src/services/projectService.ts` | `BACK-01`, `ARCH-01` | **Completed** |
| `BACK-04` | Implement Task Mutation Service with double-submit idempotency locking (per DEC-007) | `src/services/taskService.ts` | `BACK-01`, `ARCH-02` | **Completed** |
| `BACK-05` | Implement Append-Only Activity Log & Task Update Notes Service | `src/services/auditService.ts` | `BACK-01`, `ARCH-01` | **Completed** |
| `BACK-06` | Implement authoritative Firestore Security Rules enforcing tenant isolation & RBAC | `firestore.rules`, `firestore.indexes.json` | `ARCH-01` | **Completed** |

---

### 2.6 QA Specialist
**Exclusive File Scope:** `tests/`, `vitest.config.ts`, `src/**/*.test.ts*`

| Task ID | Description | Target Files | Dependencies | State |
|---|---|---|---|:---:|
| `QA-01` | Setup Vitest configuration and test environment | `vitest.config.ts`, `tests/setup.ts` | `COORD-01` | **Completed** |
| `QA-02` | Author unit tests for Task State Machine (`isValidTransition`, blocker guards, invalid jumps) | `tests/unit/taskStateMachine.test.ts` | `ARCH-02` | **Completed** |
| `QA-03` | Author unit tests for date validation and timezone overdue calculation math | `tests/unit/timezone.test.ts`, `validation.test.ts` | `ARCH-03`, `ARCH-04` | **Completed** |
| `QA-04` | Author security tests verifying negative paths (NEG-01 to NEG-06) and RBAC boundaries | `tests/unit/security.test.ts` | `BACK-06` | **Completed** |

---

### 2.7 Security & Release Specialist
**Exclusive File Scope:** `docs/engineering/security-review.md`, `docs/engineering/production-readiness-report.md`, `docs/engineering/handoff.md`

| Task ID | Description | Target Files | Dependencies | State |
|---|---|---|---|:---:|
| `SEC-01` | Perform independent threat model & RBAC boundary inspection | `docs/engineering/security-review.md` | `BACK-06` | **Completed** |
| `SEC-02` | Audit dependencies, secrets policy, and verify `.env.example` placeholders | `docs/engineering/security-review.md` | `COORD-01` | **Completed** |
| `SEC-03` | Author Developer Handoff, local setup guide, and Firebase Emulator run instructions | `docs/engineering/handoff.md` | `COORD-01`, `BACK-01` | **Completed** |
| `SEC-04` | Verify automated test execution evidence, build artifacts, and issue Go/No-Go release verdict | `docs/engineering/production-readiness-report.md` | Wave 2 completion | **Completed** |

---

## 3. Strict Boundary Rules

1. **No Shared File Mutations:** Specialists work strictly within their exclusive file directories. No two agents may edit the same file.
2. **Contract-First Constraint:** Implementation of `FRONT` and `BACK` tasks will begin only after domain interfaces (`ARCH-01`) are locked.
3. **Skill Utilization & Missing Skill Discovery:**
   - Every specialist agent must use installed skills applicable to their task (e.g. `frontend-design` for UI/styling).
   - If an agent requires a skill for their specific task (e.g., specialized Playwright patterns, accessibility audits, state machine validation, web performance) and the skill is not currently installed, the agent **must use `find-skills`** ([.agents/skills/find-skills/SKILL.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/.agents/skills/find-skills/SKILL.md)) to search (`npx skills find [query]`), verify quality, and install the appropriate skill.
