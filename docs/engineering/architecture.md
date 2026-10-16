# Architecture & System Design — OJIX TeamFlow

> **Project:** OJIX TeamFlow: Team Tasks & Project Execution OS  
> **Status:** Authoritative Architectural Standard  
> **Governing Standards:** [ASSIGNMENT.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/ASSIGNMENT.md) | [AGENTS.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/AGENTS.md) | [decision-log.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/docs/engineering/decision-log.md)

---

## 1. System Overview & Architecture Topology

OJIX TeamFlow is structured as a reactive, high-performance Single Page Application (SPA) backed by Firebase serverless infrastructure. The architecture prioritizes client responsiveness, real-time synchronization, zero credential leaks, and server-enforced role-based access control.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Client Browser (SPA)                          │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                 React 18 + Vite View Layer                     │   │
│   │   (Kanban Board, Grouped List, Dashboards, Task Modals)        │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────────────────────┴────────────────────────────────┐   │
│   │           Custom React Hooks & Realtime Subscriptions          │   │
│   │             (useAuth, useProjects, useTasks, useRealtime)      │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────────────────────┴────────────────────────────────┐   │
│   │       Domain Business Logic & Finite State Machine             │   │
│   │    (taskStateMachine.ts, validation.ts, timezone.ts)           │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────────────────────┴────────────────────────────────┐   │
│   │                 Data Access Layer (Services)                   │   │
│   │       (authService.ts, projectService.ts, taskService.ts)      │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │ HTTPS / WebSocket (onSnapshot)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Firebase Serverless Backend                       │
│                                                                        │
│   ┌───────────────────────────┐      ┌─────────────────────────────┐   │
│   │   Firebase Authentication │      │   Cloud Firestore Engine    │   │
│   │   (Email / Password, UIDs)│      │  (Documents & Collections)  │   │
│   └───────────────────────────┘      └──────────────┬──────────────┘   │
│                                                     │                  │
│                                      ┌──────────────┴──────────────┐   │
│                                      │   Firestore Security Rules  │   │
│                                      │ (Authoritative Server RBAC) │   │
│                                      └─────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Application Structure & Directory Layout

The codebase follows a modular, feature-oriented structure with strict separation of pure business logic, UI components, data services, and shared types.

```
ojix-teamflow/
├── docs/
│   └── engineering/                     # Architecture, decisions, acceptance criteria
├── public/                              # Static public assets
├── src/
│   ├── assets/                          # Custom SVGs, icons, illustrations
│   ├── components/                      # Reusable Design System UI primitives
│   │   ├── common/                      # Buttons, Modals, Inputs, Badges, Skeletons, Toasts
│   │   ├── layout/                      # Navigation, Sidebar, Topbar, PageContainer
│   │   └── tasks/                       # TaskCard, TaskDetailModal, BlockerModal, TaskForm
│   ├── domain/                          # Pure business logic (framework agnostic)
│   │   ├── taskStateMachine.ts          # State transition matrix, guards & validator
│   │   ├── validation.ts                # Schema validation for projects & tasks
│   │   └── timezone.ts                  # Date calculations & local midnight overdue logic
│   ├── features/                        # Feature views & screen modules
│   │   ├── auth/                        # Login, Persona Switcher, Route Guards
│   │   ├── dashboard/                   # Personal "My Tasks" & Project Executive Dashboard
│   │   ├── projects/                    # Project Registry, Project Settings, Member Management
│   │   └── tasks/                       # Kanban Board & Grouped List Views with Filters
│   ├── hooks/                           # Custom React hooks (realtime listeners, auth)
│   │   ├── useAuth.ts                   # Current user, role checking, persona switching
│   │   ├── useProjects.ts               # Project queries & active project selection
│   │   ├── useTasks.ts                  # Task mutations & filtered task subscriptions
│   │   └── useRealtime.ts               # Generic Firestore onSnapshot listener hook
│   ├── services/                        # Firestore data access layer
│   │   ├── firebase.ts                  # Firebase app init & Emulator configuration
│   │   ├── authService.ts               # Auth operations, signin/out, seed personas
│   │   ├── projectService.ts            # Project CRUD & membership mutations
│   │   ├── taskService.ts               # Task CRUD, status updates, idempotency locks
│   │   └── auditService.ts              # Activity log creation & queries
│   ├── styles/                          # Handcrafted Vanilla CSS Design System
│   │   ├── tokens.css                   # Custom property design tokens (colors, fonts, radii)
│   │   ├── reset.css                    # Modern CSS element reset
│   │   └── global.css                   # Typography, base styles, micro-animations
│   ├── types/                           # Single source of truth TypeScript interfaces
│   │   ├── auth.ts                      # UserProfile, UserRole, SessionState
│   │   ├── project.ts                   # Project, ProjectStatus, ProjectMember
│   │   ├── task.ts                      # Task, TaskPriority, TaskStatus, BlockerInfo
│   │   └── audit.ts                     # ActivityLogEntry, AuditAction
│   ├── App.tsx                          # App shell, routing, global toast provider
│   └── main.tsx                         # Entry point
├── tests/
│   ├── unit/                            # Vitest domain & component tests
│   ├── rules/                           # Firestore Security Rules emulator tests
│   └── e2e/                             # Playwright automated acceptance flow (AC-08)
├── firestore.rules                      # Authoritative Firestore access rules
├── firestore.indexes.json               # Composite index definitions
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 3. Firestore Data Model & Schema Specifications

Per architectural decision **DEC-002**, the database is designed with flat root-level collections linked by indexed foreign keys. This supports high-performance querying for personal dashboards ("all tasks assigned to me across permitted projects") while preserving clean security rules.

### 3.1 Collection Hierarchy

```
firestore/
├── users/             # User profiles & authoritative roles
├── workspaces/        # Workspace metadata & global settings
├── projects/          # Project registry & member allocations
├── tasks/             # All project tasks, priorities, & statuses
└── activity_logs/     # Immutable chronological audit entries
```

### 3.2 Collection Schemas & Field Definitions

#### `users/{userId}`
Stores user identity, synthetic demo personas, and assigned workspace roles.
```typescript
interface UserProfile {
  readonly uid: string;                     // Matches Firebase Auth UID
  readonly email: string;                   // Synthetic work email
  readonly displayName: string;             // Full name
  readonly role: UserRole;                  // 'workspace_admin' | 'project_lead' | 'member' | 'viewer'
  readonly avatarUrl?: string;              // Synthetic avatar or initials placeholder
  readonly createdAt: string;               // ISO-8601 UTC timestamp
  readonly updatedAt: string;               // ISO-8601 UTC timestamp
}
```

#### `workspaces/{workspaceId}`
Defines the top-level organization workspace container.
```typescript
interface Workspace {
  readonly id: string;                      // Workspace identifier (e.g., 'ws-ojix-main')
  readonly name: string;                    // Organization name (e.g., 'OJIX Technologies')
  readonly ownerId: string;                 // UID of the workspace owner
  readonly memberIds: readonly string[];    // Array of all member UIDs in workspace
  readonly createdAt: string;               // ISO-8601 UTC timestamp
  readonly updatedAt: string;               // ISO-8601 UTC timestamp
}
```

#### `projects/{projectId}`
Defines projects, ownership, scope, and member access lists.
```typescript
interface Project {
  readonly id: string;                      // Project identifier
  readonly workspaceId: string;             // Parent workspace ID
  readonly name: string;                    // Project title (3-80 characters)
  readonly objective: string;               // Concise goal/deliverables description
  readonly ownerId: string;                 // UID of Project Lead or Admin
  readonly status: ProjectStatus;           // 'planning' | 'active' | 'on_hold' | 'completed' | 'archived'
  readonly startDate: string;               // ISO date: 'YYYY-MM-DD'
  readonly dueDate: string;                 // ISO date: 'YYYY-MM-DD' (dueDate >= startDate)
  readonly memberIds: readonly string[];    // UIDs of users permitted to view/participate
  readonly createdAt: string;               // ISO-8601 UTC timestamp
  readonly updatedAt: string;               // ISO-8601 UTC timestamp
}
```

#### `tasks/{taskId}`
The primary execution unit containing full lifecycle and blocker details.
```typescript
interface Task {
  readonly id: string;                      // Task identifier
  readonly workspaceId: string;             // Denormalized for tenant isolation
  readonly projectId: string;               // Associated project
  readonly title: string;                   // 3-120 characters, trimmed
  readonly description: string;             // Context & acceptance details (up to 2000 chars)
  readonly assigneeId: string | null;       // UID of assigned member or null
  readonly priority: TaskPriority;          // 'urgent' | 'high' | 'medium' | 'low'
  readonly status: TaskStatus;              // 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'blocked'
  readonly blockerReason?: string;          // Mandatory if status === 'blocked' (>= 5 chars)
  readonly dueDate: string;                 // ISO date: 'YYYY-MM-DD'
  readonly milestoneId?: string;            // Optional milestone/epic tag
  readonly createdBy: string;               // UID of author
  readonly createdAt: string;               // ISO-8601 UTC timestamp
  readonly updatedAt: string;               // ISO-8601 UTC timestamp
}
```

#### `activity_logs/{logId}`
Append-only audit trail capturing key mutations and task comment notes.
```typescript
interface ActivityLogEntry {
  readonly id: string;                      // Unique log identifier
  readonly workspaceId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly userId: string;                  // UID of actor
  readonly userDisplayName: string;         // Cached display name for fast feed rendering
  readonly action: AuditAction;             // 'created' | 'status_changed' | 'reassigned' | 'comment_added' | 'blocked' | 'unblocked'
  readonly fieldChanged?: string;           // e.g., 'status', 'assigneeId', 'dueDate'
  readonly oldValue?: string | null;
  readonly newValue?: string | null;
  readonly commentText?: string;            // Context note or discussion comment
  readonly createdAt: string;               // ISO-8601 UTC timestamp
}
```

### 3.3 Composite Firestore Indexes

Configured in `firestore.indexes.json` to ensure low-latency query performance:
1. `tasks`: `projectId` ASC, `status` ASC, `dueDate` ASC
2. `tasks`: `assigneeId` ASC, `status` ASC, `dueDate` ASC (for "My Tasks" query)
3. `activity_logs`: `taskId` ASC, `createdAt` DESC (for task detail timeline)
4. `projects`: `workspaceId` ASC, `status` ASC, `dueDate` ASC

---

## 4. Workspace & Project Isolation Architecture

Multi-tenant security requires absolute isolation between projects and workspaces.

### 4.1 Boundary Enforcement Model
- **Workspace Boundary:** Every document contains a `workspaceId`. Queries are strictly scoped to the user's active workspace.
- **Project Boundary:** Projects maintain an explicit `memberIds` string array.
  - A user can only read a project document if:
    1. Their UID is present in `project.memberIds`, OR
    2. Their profile role is `workspace_admin`.
  - Tasks inherit project isolation: a user can only read tasks where `get(/databases/$(database)/documents/projects/$(resource.data.projectId)).data.memberIds` contains `request.auth.uid` (or user is `workspace_admin`).
- **Negative Proof Requirement:** Direct queries attempting to fetch `projects/secret-proj` by non-members must trigger immediate Firestore `permission-denied` errors.

---

## 5. Roles & Permissions Enforcement Architecture

Per DEC-003, authorization is strictly verified in `firestore.rules`. UI controls only provide guidance.

### 5.1 Firestore Rules Helper Logic

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    function isWorkspaceAdmin() {
      return isAuthenticated() && getUserData().role == 'workspace_admin';
    }

    function isProjectLead() {
      return isAuthenticated() && getUserData().role == 'project_lead';
    }

    function isViewer() {
      return isAuthenticated() && getUserData().role == 'viewer';
    }

    function isProjectMember(projectId) {
      let project = get(/databases/$(database)/documents/projects/$(projectId)).data;
      return isAuthenticated() && (
        isWorkspaceAdmin() || 
        request.auth.uid in project.memberIds
      );
    }

    function isProjectOwner(projectId) {
      let project = get(/databases/$(database)/documents/projects/$(projectId)).data;
      return isAuthenticated() && (
        isWorkspaceAdmin() || 
        request.auth.uid == project.ownerId
      );
    }

    // Collection: Users
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isWorkspaceAdmin() || request.auth.uid == userId;
    }

    // Collection: Projects
    match /projects/{projectId} {
      allow read: if isProjectMember(projectId);
      allow create: if isWorkspaceAdmin() || isProjectLead();
      allow update: if isWorkspaceAdmin() || isProjectOwner(projectId);
      allow delete: if isWorkspaceAdmin();
    }

    // Collection: Tasks
    match /tasks/{taskId} {
      allow read: if isProjectMember(resource.data.projectId);
      allow create: if isProjectMember(request.resource.data.projectId) && !isViewer();
      allow update: if isProjectMember(resource.data.projectId) && !isViewer();
      allow delete: if isWorkspaceAdmin() || isProjectOwner(resource.data.projectId);
    }

    // Collection: Activity Logs
    match /activity_logs/{logId} {
      allow read: if isProjectMember(resource.data.projectId);
      allow create: if isProjectMember(request.resource.data.projectId) && !isViewer();
      allow update, delete: if false; // Append-only immutable log
    }
  }
}
```

---

## 6. UI Design System & Component Hierarchy

Per the governing `frontend-design` standard, the interface avoids generic AI SaaS templates (no warm-cream/terracotta cliches, no generic grey drop-shadow kits). It embodies a focused, high-velocity **Project Execution OS**.

### 6.1 Design Tokens (`src/styles/tokens.css`)

```css
:root {
  /* Canvas & Elevation Layers (Deep Zinc / Slate) */
  --bg-canvas: #090d16;
  --bg-surface: #111726;
  --bg-surface-elevated: #1a2236;
  --bg-surface-hover: #222c44;
  --border-subtle: #242f49;
  --border-prominent: #344265;

  /* Typography Scale */
  --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.375rem;   /* 22px */
  --text-2xl: 1.75rem;   /* 28px */

  /* Text Contrast Hierarchy */
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  /* Curated Status Accents (Tailored HSL) */
  --accent-primary: hsl(246, 80%, 62%);
  --accent-primary-hover: hsl(246, 85%, 68%);
  --status-done: hsl(152, 69%, 41%);
  --status-inprogress: hsl(199, 89%, 48%);
  --status-review: hsl(265, 83%, 62%);
  --status-blocked: hsl(38, 92%, 50%);
  --status-overdue: hsl(350, 89%, 60%);

  /* Spatial Grid & Shape */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 6.2 Component Hierarchy & Data Flow

```
<App>
  ├── <AuthProvider> (Session state, Persona switcher)
  └── <ToastProvider> (Non-blocking status messages)
        └── <AppLayout>
              ├── <Sidebar> (Workspace branding, Projects list, My Tasks link, Persona indicator)
              ├── <Topbar> (Global search, Persona switcher, Notifications, Action triggers)
              └── <MainContentArea>
                    ├── <PersonalDashboardView> (My overdue, My in-progress, Blocker notices)
                    ├── <ProjectDashboardView> (Project health, Burndown progress, Milestones)
                    ├── <KanbanBoardView> (Columns per status, drag/click transition controls)
                    └── <GroupedListView> (Sortable table, multi-faceted filtering, batch actions)
```

### 6.3 State Architecture & UX Feedback States
- **Loading:** Non-shifting skeleton screen primitives (`SkeletonCard`, `SkeletonRow`).
- **Empty States:** Actionable invitations with direct primary buttons (e.g., "No tasks in this milestone. Create your first task.").
- **Error Banners & Toasts:** Explicit problem description with remediation action (no generic "Something went wrong").
- **Double-Submit Prevention:** Form buttons switch to a disabled spinner state synchronously on submit.

---

## 7. State Management & Real-Time Sync Strategy

1. **Unidirectional Flow:**
   `UI Action` ➔ `Domain Validation (taskStateMachine.ts)` ➔ `Service Mutation (taskService.ts)` ➔ `Firestore Rules Verification` ➔ `Firestore Write`.
2. **Real-Time Cross-Client Sync:**
   - Active project tasks and comments subscribe via Firestore `onSnapshot`.
   - Modifying a task column in one client pushes changes to all connected clients within <1000ms without page reloads.
3. **Optimistic Updates & Error Rollback:**
   - Client views render updates optimistically while logging mutation state.
   - In case of a server rule rejection, the snapshot listener automatically synchronizes state back to the authoritative database value and triggers an error toast.
