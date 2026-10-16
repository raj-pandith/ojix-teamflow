# Decision Log — OJIX TeamFlow

> Decisions are recorded in chronological order. Each entry includes the date, the decision made, the rationale, and any trade-offs acknowledged.

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
