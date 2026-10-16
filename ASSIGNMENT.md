# Assignment 01 — OJIX TeamFlow: Team Tasks & Project Execution OS

**Owner:** Member 1. **Audience:** Teams in almost any small or mid-sized business.

## Business problem
Teams often coordinate projects, owners, due dates, and decisions across spreadsheets and chat threads. Build a compact shared workspace that makes work visible and follow-through reliable without trying to become a full enterprise portfolio-management suite.

## Users and roles
- Workspace Admin: manages members and workspace settings.
- Project Lead: creates projects, assigns work, and views project reports.
- Member: views permitted projects and updates assigned work.
- Viewer: read-only access to explicitly shared projects.

Enforce project/workspace permissions at the data/API layer. Hiding buttons is not authorization.

## Mandatory MVP
1. Authentication suitable for a local/sandbox demo; no hard-coded shared production credentials.
2. Workspace and project registry with name, objective, owner, status, start/due dates, and created/updated timestamps.
3. Task records with title, description, assignee, priority, status, due date, and optional project/milestone.
4. Kanban or grouped task view plus a usable list view; include search and filters for status, assignee, priority, and due date.
5. Project and personal dashboards showing open, blocked, overdue, and upcoming work.
6. Task comments or update notes and an activity timeline for key changes.
7. Valid status transitions, required-field validation, and useful empty/loading/error states.
8. Responsive, accessible interface and synthetic seed data.
9. Automated end-to-end acceptance flow: create project, add task, assign it, change its status, add an update, and verify dashboard/activity changes.

## Safety and scope boundaries
- Use synthetic people, projects, and task content only.
- No live Slack/Teams/email integration, public project sharing, external messaging, payroll, or time tracking is required.
- Notifications can be in-app/demo only. Do not claim an external message was sent when only a record was created.
- Use documented timezone assumptions for due-date and overdue behavior.

## Three independently authored skills required
1. **TeamFlow build orchestrator:** coordinates bounded product, UI, backend/domain, test, security, and release workstreams; integrates against agreed contracts.
2. **Work triage accelerator:** e.g., due-date triage, blocked-task analysis, meeting-to-action extraction from supplied notes, or weekly project-summary preparation. Must not invent missing task facts.
3. **Workspace production assurance:** independently checks project access boundaries, task transitions, duplicate mutations, audit/activity records, tests, and release blockers.

These are suggested problem spaces, not content to copy. Create the actual workflows independently.

## Acceptance and negative tests
- A member cannot read or update an unshared project through direct API/data access.
- A viewer cannot mutate a task or project.
- Invalid dates, malformed required fields, and disallowed transitions are rejected.
- Repeated submission does not accidentally create duplicate mutations where idempotency is required.
- Due/overdue counts match a documented timezone assumption.
- Automated core-flow tests, lint/type checks where configured, and a production build are run and reported accurately.
- Setup, environment configuration, known limitations, and recovery instructions are documented.

## Explicit non-goals
No enterprise resource planning, public multi-tenant collaboration links, external notifications, or unapproved production deployment.
