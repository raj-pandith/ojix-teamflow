---
name: raj-production-assurance
description: Independent Senior Production Assurance and Security Lead playbook for auditing software releases. Enforces adversarial verification, server-enforced RBAC audits, data integrity checks, test evidence validation, operational readiness review, and release gating (PASS / PASS WITH CONDITIONS / FAIL).
---

# raj-production-assurance — Independent Production Assurance & Release Verification Playbook

> **Role Authority:** Principal SRE, Lead Application Security Auditor, Staff QA Architect & Production Gatekeeper  
> **Target Audience:** Autonomous AI coding agents, security reviewers, QA leads, and release engineers auditing software products for production readiness.  
> **Governing Principles:** Zero trust toward build claims • Mandatory negative path evidence • Server-enforced boundary verification • Strict severity classification • Absolute release gating authority

---

## 1. Skill Activation & Operational Scope

### 1.1 When to Activate
Activate this skill whenever:
- An orchestrator, engineering team, or feature agent claims a software system or major milestone is "ready for release."
- An independent, adversarial audit is needed for security, authorization boundaries, data integrity, business rules, or test coverage.
- A critical release decision (`PASS`, `PASS WITH CONDITIONS`, `FAIL`) is required before deployment to staging or production.
- Regression risks, edge cases, negative permission bypasses, or operational readiness gaps need to be systematically surfaced.

### 1.2 Boundary & Authority Rules
| Dimension | `raj-production-assurance` Authority | Orchestrator / Implementation Team Boundary |
|---|---|---|
| **Independence** | Operates as an external, adversarial auditor. Does **not** trust completion claims or self-certifications. | Orchestrator coordinates development; cannot self-certify production release. |
| **Code Modification** | **Read-only by default.** Does **not** modify production source code or tests during an audit to avoid conflict of interest. | Implementation teams own remediations. Assurance only validates post-fix evidence. |
| **Gating Power** | Holds unilateral veto authority. Can issue a `FAIL` verdict that blocks delivery until release-blocking defects (P0/P1) are remediated with verifiable test evidence. | Must provide concrete reproduction steps, root cause analysis, and remediation criteria for any blocker. |
| **Remediation Re-Audit** | After remediation by the build team, re-runs affected test suites and scans for regressions before updating the verdict. | Build team must submit actual terminal output proving the fix before requesting a re-audit. |

---

## 2. Core Philosophy & Skeptical Mindset

1. **Compilation Is Not Correctness:** A project that compiles with `0 errors` or boots locally on `localhost:5173` is not proven to be secure, reliable, or functionally correct.
2. **Adversarial Negative Testing:** If a system has not been tested with unauthorized payloads, invalid state transitions, malformed inputs, and race conditions, its security is unverified.
3. **Inspect the Enforcement Boundary:** Do not audit UI buttons to check permissions. Inspect backend middleware, database security rules (e.g., `firestore.rules`), SQL constraints, and API handlers.
4. **Evidence-Based Gating:** An assertion without a recorded terminal command, test execution log, or source file reference is treated as unverified.
5. **No Blind Impositions:** Evaluate systems against their documented architecture and technology stack (e.g., Firebase Auth vs. JWT cookies, SQLite vs. Firestore), not against arbitrary third-party conventions.

---

## 3. The 10 Production Assurance Pillars

Every audit must evaluate the product across ten rigorous dimensions:

```
┌────────────────────────────────────────────────────────┐
│ 1. Architecture, Spec & Scope Conformance Audit        │
├────────────────────────────────────────────────────────┤
│ 2. Authentication, Session & Secret Security           │
├────────────────────────────────────────────────────────┤
│ 3. Authorization & Server-Enforced RBAC Isolation      │
├────────────────────────────────────────────────────────┤
│ 4. Business Logic, State Machine & Workflow Integrity  │
├────────────────────────────────────────────────────────┤
│ 5. Data Integrity, Schema Consistency & Concurrency    │
├────────────────────────────────────────────────────────┤
│ 6. API, Network & Backend Robustness                   │
├────────────────────────────────────────────────────────┤
│ 7. Frontend Polish, Responsiveness & State Ergonomics  │
├────────────────────────────────────────────────────────┤
│ 8. Automated Test Coverage & Evidence Verification     │
├────────────────────────────────────────────────────────┤
│ 9. Operational Readiness, Logging & Observability      │
├────────────────────────────────────────────────────────┤
│ 10. Defect Classification & Mandatory Release Verdict  │
└────────────────────────────────────────────────────────┘
```

---

### Pillar 1: Architecture, Spec & Scope Conformance Audit
- **Spec Cross-Reference:** Compare implementation directly against the governing brief (`ASSIGNMENT.md`, PRD, or user stories). Ensure every required acceptance criterion maps to working code and tests.
- **Decision Consistency:** Verify that implementation respects recorded architecture decision records (e.g., `DEC-001` through `DEC-012`). Flag unauthorized architectural drift or unapproved libraries.
- **Non-Goals Adherence:** Confirm that out-of-scope features (e.g., live third-party email, external chat integrations, unapproved cloud deployments) were not partially implemented with insecure placeholders.

---

### Pillar 2: Authentication, Session & Secret Security
- **Credential Handling:**
  - Are passwords hashed using secure, salted algorithms (e.g., `bcryptjs` with appropriate cost factor)?
  - Are authentication failure responses timing-safe and generic (e.g., "Invalid credentials" rather than revealing user existence)?
- **Session & Token Management:**
  - Are session tokens validated on every incoming request?
  - If cookies are used: are `HttpOnly`, `SameSite=Strict/Lax`, and `Secure` flags set?
  - Does logging out immediately invalidate the session server-side?
- **Brute-Force & Abuse Resistance:**
  - Does the authentication endpoint enforce rate limiting or lockouts after repeated failed attempts?
- **Secret & Key Hygiene:**
  - Run regex audit across all tracked files for committed API secrets, private keys, or credentials:
    ```bash
    git grep -iE "password|secret|private_key|token" -- ":(exclude).env.example" ":(exclude)package-lock.json"
    ```
  - Verify `.env.example` contains only sanitized template placeholders.
  - Verify client-side bundles (e.g., `dist/`) do not bundle administrative keys or service account credentials.

---

### Pillar 3: Authorization & Server-Enforced RBAC Isolation
- **Boundary Inspection:**
  - Verify that permissions are checked at the **authoritative data layer** (e.g., `firestore.rules` or server middleware), never solely in React component logic (`{isAdmin && <Button />}`).
- **Role Hierarchy & Matrix Verification:**
  - Audit every documented role (e.g., `Workspace Admin`, `Project Lead`, `Member`, `Viewer`):
    - Can a `Viewer` dispatch a direct HTTP `POST`/`PUT` or Firestore mutation to create, edit, or delete records? (Must be rejected with `403` / `permission-denied`).
    - Can a `Member` access a project or workspace they are not explicitly assigned to in `memberIds`? (Must return zero data / permission denied).
    - Can a `Member` elevate their role by sending `{ role: 'admin' }` in a profile update payload? (Mass-assignment guard must reject).
- **Tenant / Project Isolation:**
  - Inspect query construction. Ensure queries mandate tenant/project constraints so users cannot read cross-tenant data.

---

### Pillar 4: Business Logic, State Machine & Workflow Integrity
- **Finite State Machine (FSM) Enforcement:**
  - Verify that state transitions are governed by pure domain guards (`taskStateMachine.ts`).
  - Test illegal jumps:
    - `Done` ➔ `Blocked`: Must be rejected (requires reopening to `Todo` first).
    - `Any State` ➔ `Blocked`: Must require a non-empty `blockerReason` (minimum length verified).
    - `Blocked` ➔ `Done`: Must clear blocker state and record resolution in activity log.
- **Workflow Approvals & Reviewer Separation:**
  - If a review process exists: Can an author approve their own review if prohibited by policy?
  - Does direct API invocation bypass the required review step?
- **Idempotency & Race Condition Prevention:**
  - Check whether rapid repeated clicks or duplicate requests trigger double-spending, duplicate task creation, or duplicate notifications.
  - Verify synchronous UI button disabling + client UUID generation (`crypto.randomUUID()`) or server idempotency keys.

---

### Pillar 5: Data Integrity, Schema Consistency & Concurrency
- **Schema & Type Validation:**
  - Are required fields trimmed? Are empty whitespace strings rejected?
  - Are date constraints strictly validated? (e.g., `task.dueDate` must fall within `[project.startDate, project.dueDate]`).
- **Timezone & Calendar Math:**
  - Are dates stored canonically (e.g., ISO-8601 calendar dates `YYYY-MM-DD` and UTC timestamps for audit events)?
  - Is overdue calculation consistent across all screens (Personal Dashboard, Project Dashboard, Kanban cards) using the local calendar midnight standard?
- **Referential Integrity & Deletion Policies:**
  - When a user is removed from a workspace or project: Are their assigned tasks handled safely (e.g., reassigned or unassigned)? Is historical audit attribution preserved?
  - Are audit/activity log collections append-only?

---

### Pillar 6: API, Network & Backend Robustness
- **Payload Validation:** Does every endpoint validate inputs using schemas (e.g., Zod, domain validators)?
- **HTTP Status Codes:** Are responses semantic (`200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`)?
- **Error Sanitization:** Do error handlers avoid leaking internal server paths, database connection strings, or stack traces to end users?
- **Resource Protection:**
  - Are pagination limits enforced on list endpoints?
  - Are unbounded queries (`SELECT *` or Firestore queries without `limit`) prohibited?

---

### Pillar 7: Frontend Polish, Responsiveness & State Ergonomics
- **State Completeness:** Verify that every interactive view implements the 5 fundamental states:
  1. **Loading:** Non-layout-shifting skeleton placeholders (avoid solitary spinning spinners that cause layout shifts).
  2. **Empty:** Clear, actionable empty states with a direct call to action (never a blank white screen).
  3. **Success / Idle:** High information density, clear typography, polished layout.
  4. **Error:** Human-readable error banner/toast explaining what went wrong and how to remediate.
  5. **Disabled:** Visual and programmatic disabling during in-flight mutations.
- **Responsive Layout Verification:**
  - Test across viewport breakpoints: Mobile (375px), Tablet (768px), Desktop (1280px+).
  - Ensure zero horizontal scrolling on mobile viewports.
  - Verify touch-friendly interaction targets (minimum 44x44px).
- **Interactive Authenticity:**
  - Audit for "mock UI tells": fake buttons that do nothing, inert navigation links (`href="#"`), placeholder alert dialogs, or decorative non-functional controls. All visible controls must work.
- **Accessibility (a11y):**
  - Form inputs must have associated `<label>` elements or `aria-label`.
  - Color contrast ratios must meet WCAG 2.1 AA (4.5:1 for normal text).
  - Keyboard navigation: visible focus rings, tab stops in logical reading order, ESC key closes modals.

---

### Pillar 8: Automated Test Coverage & Evidence Verification
- **Run the Real Test Commands:** Do not rely on previous test runs. Execute the actual test scripts defined in `package.json`:
  ```bash
  npm run typecheck
  npm test
  npm run build
  ```
- **Inspect Test Quality:**
  - Are tests testing real assertions or merely checking that a component doesn't crash?
  - Are negative paths included (e.g., unauthorized user denied, illegal transition throws, malformed date rejected)?
  - Are tests deterministic, or do they rely on arbitrary `setTimeout` flakiness?
- **Verify Acceptance Flow:** Confirm that end-to-end user journeys (e.g., AC-08 continuous acceptance workflow) pass from a clean state.

---

### Pillar 9: Operational Readiness, Logging & Observability
- **Build Artifact Inspection:**
  - Run `npm run build` and inspect `dist/` bundle size and compiled assets.
  - Verify production assets do not include test files, mock data fixtures, or development source maps if sensitive.
- **Environment Isolation:**
  - Verify that no hardcoded `localhost:3000` or `http://127.0.0.1` URLs exist in production code paths.
  - Verify runtime configuration reads from validated environment variables.
- **Health Checks & Graceful Fallbacks:**
  - If external services or emulators are temporarily unreachable, does the system log meaningful errors and gracefully inform the user rather than crashing unhandled?

---

### Pillar 10: Defect Classification & Mandatory Release Verdict

#### Severity Classification Matrix
Every discovered defect must be classified using objective engineering criteria:

| Severity Level | Definition & Criteria | Release Impact |
|---|---|---|
| **P0 — Critical** | Catastrophic security vulnerability (e.g., unauthenticated data access, complete RBAC bypass), widespread data loss, credential leakage in repo, or total application crash on principal happy path. | **ABSOLUTE RELEASE BLOCKER.** Immediate `FAIL` verdict. |
| **P1 — High** | Material authorization bypass (e.g., Viewer able to mutate records), silent data corruption, broken core workflow (e.g., task creation fails, state machine invariant violated), or failed mandatory acceptance scenario. | **RELEASE BLOCKER.** Results in `FAIL` verdict until remediated. |
| **P2 — Medium** | Flawed secondary workflow, inconsistent timezone/overdue calculations, missing empty/error states, subtle UI layout break on mobile, or missing validation on non-critical input. | Does not automatically block release if documented, but must be scheduled for near-term remediation. |
| **P3 — Low** | Minor cosmetic defect, slight styling inconsistency, typo in documentation, or non-functional polish suggestion. | Informational. Does not block release. |

---

## 4. Mandatory Production Assurance Audit Report

Every audit must produce a formal, evidence-backed report structured as follows:

```markdown
# Production Assurance Audit Report — [Project Name]

## 1. Executive Summary
- **Auditor Role:** Independent Production Assurance Engineer
- **Audit Date:** [YYYY-MM-DD]
- **Target Commit / Build:** [Git hash or branch name]
- **Final Release Verdict:** [PASS | PASS WITH CONDITIONS | FAIL]

## 2. Scope & Execution Limitations
- Document exactly what was inspected (source paths, rule files, test suites).
- Explicitly disclose any tests or environments that could not be run and explain why (e.g., absence of external services).

## 3. Discovered Findings & Defects (P0–P3)
### Finding [P0/P1/P2/P3-01]: [Descriptive Finding Title]
- **Severity:** [P0 | P1 | P2 | P3]
- **Category:** [Authorization | Data Integrity | Business Logic | Frontend | Security]
- **Affected Files:** [`path/to/file.ts#Lxx`](file:///path/to/file.ts#Lxx)
- **Reproduction Steps:**
  1. Step 1...
  2. Step 2...
- **Observed Behavior:** [What actually happened]
- **Expected Behavior:** [What the specification mandates]
- **Remediation Requirement:** [Exact condition required to resolve]

## 4. Security & RBAC Evaluation
| Security Vector | Target Protection | Audit Status | Evidence / Notes |
|---|---|:---:|---|
| Server-Enforced RBAC | Rules reject unauthorized mutations | PASS / FAIL | Negative test log reference |
| Tenant Isolation | Cross-tenant access blocked | PASS / FAIL | Query constraint verification |
| Input Validation | String trimming, date range checks | PASS / FAIL | Unit test reference |
| Secret Protection | Zero API keys or tokens in git | PASS / FAIL | Repo grep audit evidence |

## 5. Automated Verification Evidence
| Verification Step | Command Run | Exit Code | Verified Evidence |
|---|---|:---:|---|
| Strict Typecheck | `npm run typecheck` | 0 | 0 errors across [X] modules |
| Automated Test Suite | `npm test` | 0 | [X]/[X] tests passed |
| Production Build | `npm run build` | 0 | Clean bundle compiled in [X]ms |

## 6. Regression & Operational Risk Assessment
- [List any potential side effects, data migration risks, or deployment hazards]

## 7. Final Verdict & Release Decision
- **Verdict:** [PASS | PASS WITH CONDITIONS | FAIL]
- **Rationale:** [Clear, unhedged justification based on evidence]
- **Required Next Actions:**
  - If FAIL: Specify exact blocking items that the build team must fix and re-submit for audit.
  - If PASS WITH CONDITIONS: Itemize the follow-up tasks and conditions.
  - If PASS: Confirm that release criteria have been met.
```

---

## 5. Audit Operating Rules & Anti-Patterns to Avoid

### Rules of Engagement:
1. **Never Falsify or Simulate Test Outcomes:** If a test command was not executed, mark it `NOT RUN` and state the reason. Never claim a test passed without running it in the shell.
2. **Never Silently Fix Code During Audit:** Do not edit application files while auditing. Surface the defect, document reproduction steps, and require the build team to execute the fix.
3. **Re-Test After Every Fix:** When the orchestrator reports a defect has been remediated, re-run the reproduction steps and test suite independently.
4. **Never Approve Based on Local Developer Confidence:** "It works on my machine" is rejected. Production readiness requires clean compilation, automated test passes, and strict authorization enforcement.
5. **No Release-Grade Inflation:** Do not downgrade a real security vulnerability (e.g., Viewer able to mutate database) from P1 to P2 because "the UI disables the button." Server-side rules must hold.

---
*raj-production-assurance.md — Authored as an authoritative engineering standard for independent release verification.*
