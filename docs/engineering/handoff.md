# Developer & Evaluator Handoff Guide — OJIX TeamFlow

> **Project:** OJIX TeamFlow: Team Tasks & Project Execution OS  
> **Status:** Operational Guide  
> **Governing References:** [ASSIGNMENT.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/ASSIGNMENT.md) | [AGENTS.md](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/AGENTS.md)

---

## 1. Quick Start (Zero Prerequisites beyond Node.js)

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Run Local Development Server:**
   ```bash
   npm run dev
   ```
   Open the browser at `http://localhost:5173`. The application will start immediately with the pre-seeded synthetic dataset loaded.

3. **Run Typecheck & Automated Test Suite:**
   ```bash
   npm run typecheck    # Verifies strict TypeScript (0 errors)
   npm run test         # Runs Vitest unit, domain, and security test suites
   npm run build        # Compiles clean production bundle
   ```

---

## 2. Evaluation Walkthrough & Core Journeys

### A. Persona Quick-Switching (DEC-009)
Use the **"Role Persona"** dropdown in the topbar header to switch roles instantly without logging in and out:
- **Sarah Chen (Project Lead):** Create tasks, edit projects, and manage workloads.
- **Marcus Vance (Member):** Drag tasks across the Kanban board, add update notes, and inspect personal tasks. Notice Marcus cannot access `Confidential Executive Acquisition` project.
- **Elena Rostova (Viewer):** Notice the `+ Create Task` button disappears and drag-and-drop handles are disabled. Any attempted mutation is blocked.
- **Alex Morgan (Workspace Admin):** Unrestricted access across all workspace projects and governance settings.

### B. Kanban Board & Blocker Enforcement (AC-04 & DEC-010)
1. Drag a task from `To Do` to `In Progress` (or use the `Move ▾` quick dropdown on the card).
2. Move a task to `Blocked`. Notice the application immediately opens the `BlockerModal` and requires at least 5 characters of explanation.
3. Click any task to inspect the **Activity & Comments Timeline** and post update notes.

### C. Personal & Project Dashboards (AC-06)
1. Click **"My Work & Tasks"** in the sidebar. Note the **Overdue Tasks** tile (colored in high-attention rose) calculated against your local calendar midnight.
2. Click **"Project Dashboard"** to see project health meters, completion %, and active blockers.

### D. Work Triage AI Drawer (DEC-012)
1. Click the **"⚡ Work Triage AI"** button in the topbar.
2. View **Overdue Triage**, **Blocker Bottlenecks**, or switch to **"Notes ➔ Tasks"**.
3. Click **"Paste Sample Postmortem"** and click **"⚡ Extract Action Items"**. Click **"+ Add to Project"** to see extracted tasks added to the board.

### E. Live Security Assurance Panel (DEC-012)
1. Click **"🛡️ Assurance & RBAC"** in the sidebar.
2. Click **"🛡️ Run Live Assurance Checks"** to observe real-time browser execution of negative authorization tests NEG-01 through NEG-05.

### F. Resetting Seed State (DEC-011)
At any point, click **"↻ Reset Seed"** in the topbar to wipe modifications and restore the pristine seed dataset.
