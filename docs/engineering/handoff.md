# Developer & Evaluator Handoff Guide — OJIX TeamFlow

> **Project:** OJIX TeamFlow: Team Tasks & Project Execution OS  
> **Status:** Operational & Deployment Guide  
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
   Open the browser at `http://localhost:5173`. The application will start immediately with the pre-seeded synthetic dataset loaded, and Vite's dev server middleware will proxy all API requests seamlessly.

3. **Run Typecheck & Automated Test Suite:**
   ```bash
   npm run typecheck    # Verifies strict TypeScript (0 errors)
   npm run test         # Runs full Vitest suite (26 files, 340 tests passed)
   npm run build        # Compiles clean production frontend bundle
   npm run build:server # Compiles standalone Node.js production server bundle
   ```

---

## 2. Production Backend Architecture & Standalone Server

OJIX TeamFlow includes a standalone Node.js backend server ready for deployment to any free cloud container or serverless host (e.g., Render, Railway, Fly.io, or self-hosted VPS).

### 2.1 Backend Entry Point & Unified Router
- **Entry point:** [server/standaloneServer.ts](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/server/standaloneServer.ts)
- **Consolidated Router:** [server/apiRouter.ts](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/server/apiRouter.ts)
- **Storage & Cloud Engine:** [server/cloudPersistence.ts](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/server/cloudPersistence.ts)
- **Compiled Output:** `dist-server/standaloneServer.js` (compiled via Vite SSR)

### 2.2 Build & Run Commands

| Step | Command | Description |
|---|---|---|
| **Build Frontend** | `npm run build` | Compiles client SPA to `dist/` (served by Cloudflare Workers/Pages) |
| **Build Server** | `npm run build:server` | Compiles standalone server to `dist-server/standaloneServer.js` (~68 kB in ~240ms) |
| **Start Server** | `npm run start:server` | Starts production server using `node dist-server/standaloneServer.js` |
| **Health Check** | `curl http://localhost:3001/health` | Verifies server status, push readiness, and storage engine |

---

## 3. Environment Variables Specification

All environment variables are strictly separated between client and server to prevent secret leakage.

### Server Environment Variables (Private — Never Exposed in Client Bundle)
| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | Listening port for standalone Node.js server | `3001` |
| `CLIENT_ORIGIN` | Allowed CORS origins (comma-separated for multi-origin) | `https://ojix-teamflow.rajpandith1945.workers.dev,http://localhost:5173` |
| `VAPID_PRIVATE_KEY` | Server-only ECDSA private key for Web Push signing | `<generated-vapid-private-key>` |
| `VAPID_PUBLIC_KEY` | VAPID public key matching the private key | `<generated-vapid-public-key>` |
| `VAPID_SUBJECT` | VAPID contact subject URL/email | `mailto:admin@ojix.local` |
| `FIREBASE_PROJECT_ID` | Google Cloud Firestore project ID (free Spark plan) | `your-firebase-project-id` |
| `FIREBASE_API_KEY` | Google Cloud Firestore web API key | `AIzaSy...` |
| `FIREBASE_AUTH_DOMAIN` | Firebase Auth domain (optional) | `your-project.firebaseapp.com` |

### Client Environment Variables (Public — Built into Frontend Bundle)
| Variable | Description | Default / Example |
|---|---|---|
| `VITE_API_URL` | Base URL of deployed backend server | `https://api.ojix.dev` (Empty in local development for relative same-origin calls) |
| `VITE_VAPID_PUBLIC_KEY` | Public VAPID key for browser PushManager subscription | `<same-public-key-as-server>` |

> [!IMPORTANT]
> `VAPID_PRIVATE_KEY` is **strictly kept on the backend server**. It is never prefixed with `VITE_` and is never included in the client bundle.

---

## 4. Persistent Cloud Data Solution (₹0 Free Tier)

To ensure collaborative state is not lost when containers restart or scale down, the backend integrates with **Google Cloud Firestore (Spark Free Tier)** via [server/cloudPersistence.ts](file:///c:/Users/rajpa/OneDrive/Desktop/ojix-teamflow/server/cloudPersistence.ts):
- **Genuine Free Tier:** Spark plan includes 1 GB storage, 50,000 document reads, and 20,000 document writes per day with **zero credit card required**.
- **Shared Documents:**
  - `system_state/workspace_sync`: Centralizes projects, tasks, direct messages, audit logs, and notifications.
  - `system_state/auth_store`: Persists user accounts, password hashes (bcrypt), and invitation tokens.
- **Graceful Fallback:** If `FIREBASE_PROJECT_ID` is not configured, the system automatically falls back to local disk storage (`.server-sync.json` and `.server-auth.json`), ensuring zero-config local development remains instant and functional.

---

## 5. Security & Error Handling Guarantees

1. **No HTML as JSON:** `src/services/apiConfig.ts` (`safeFetchJson`) and all service modules check `content-type` before attempting JSON deserialization, preventing `SyntaxError: Unexpected token '<'` or `Unexpected end of JSON input`.
2. **Never Insecure Fallback in Production:** In production or whenever `VITE_API_URL` is set, the client never falls back to insecure demo password guessing. Real authentication errors are surfaced with actionable messages.
3. **Restricted CORS:** Only requests originating from the configured `CLIENT_ORIGIN` (or allowed origin list) receive permissive CORS response headers and credentials support.
4. **Server-Enforced RBAC:** All mutations and administrative queries (e.g. `/api/auth/admin/users`) are authenticated and verified against the caller's server-stored session role.
