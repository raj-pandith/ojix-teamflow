# Production Setup Guide: Google Cloud Firestore & Render Deployment

> **Project:** OJIX TeamFlow — Collaborative Task & Project Execution OS  
> **Backend Architecture:** Node.js Standalone API Server with `firebase-admin` on Render  
> **Frontend Architecture:** React 18 + Vite SPA hosted on Cloudflare Pages / Workers  
> **Authoritative Database:** Google Cloud Firestore (Native Mode, `(default)`, region: `asia-south1`)  
> **Firebase Project ID:** `ojix-teamflow`

---

## 1. System Architecture & Component Separation

OJIX TeamFlow uses a decoupled, defense-in-depth SaaS architecture:

```
┌──────────────────────────────────────────────┐
│  Cloudflare Pages / Workers (Frontend)      │
│  - React 18 / Vite / TypeScript              │
│  - Zero secrets or private keys in bundle    │
│  - Connects to Render via VITE_API_URL       │
└──────────────────────┬───────────────────────┘
                       │ HTTPS (CORS configured)
                       ▼
┌──────────────────────────────────────────────┐
│  Render Web Service (Trusted Backend)        │
│  - Node.js HTTP Server (standaloneServer.ts) │
│  - Role-Based Access Control (RBAC)          │
│  - Official firebase-admin SDK               │
│  - Web Push VAPID Notification Engine        │
│  - In-memory event bus + SSE sync            │
└──────────────────────┬───────────────────────┘
                       │ Google Cloud IAM / Service Account
                       ▼
┌──────────────────────────────────────────────┐
│  Google Cloud Firestore (Native Database)    │
│  - Database: (default) in asia-south1        │
│  - Authoritative persistent store            │
│  - Collections: projects, tasks, users       │
│  - System State: system_state/* (Admin only) │
│  - firestore.rules (Denies client access)    │
└──────────────────────────────────────────────┘
```

### Key Security & Integrity Guarantees
1. **Privileged Backend Access:** Server uses `firebase-admin` to execute validated, transactional persistence operations. Operations bypass security rules as trusted server actions.
2. **Strict Client Isolation:** Direct browser SDK access to internal server storage (`system_state/*`) is strictly denied by `firestore.rules`. Browsers cannot inspect password hashes or global workspace states.
3. **No Silent Fallback in Production:** In production mode (`NODE_ENV=production` or `STRICT_PERSISTENCE=true`), Firestore read and write failures throw explicit errors and return HTTP 500/503. The system never silently falls back to ephemeral local `.server-sync.json`.
4. **Liveness vs. Readiness:** Render monitors liveness at `/health` (HTTP 200 if process is up) and database readiness at `/ready` (HTTP 200 only if Cloud Firestore is connected and responding; HTTP 503 if unreachable).

---

## 2. Generating & Configuring Service Account Credentials

To connect Render to Google Cloud Firestore, generate a dedicated Service Account key from the Firebase Console or Google Cloud Console.

### Step 1: Generate Service Account Key
1. Open the [Firebase Console](https://console.firebase.google.com/project/ojix-teamflow/settings/serviceaccounts/adminsdk).
2. Select your project: **`ojix-teamflow`**.
3. Navigate to **Project Settings** (⚙️) ➔ **Service accounts** tab.
4. Verify that **Firebase Admin SDK** is selected.
5. Click **Generate new private key** and confirm by clicking **Generate key**.
6. A JSON file will download (e.g., `ojix-teamflow-firebase-adminsdk-xxxxx.json`).

> [!CAUTION]
> **NEVER commit this JSON file to GitHub!**  
> Ensure `.gitignore` ignores `*service-account*.json`, `*credentials*.json`, and `*firebase-key*.json`.

### Step 2: Format Key for Render
Render supports multiline environment variables or minified JSON strings.

**Option A (Minified JSON — Recommended):**
Minify the downloaded JSON file into a single line:
```bash
# On Linux / macOS / WSL:
jq -c . ojix-teamflow-firebase-adminsdk-xxxxx.json

# Or in PowerShell:
(Get-Content .\ojix-teamflow-firebase-adminsdk-xxxxx.json -Raw | ConvertFrom-Json) | ConvertTo-Json -Compress
```

**Option B (Base64 Encoded — Prevents newline issues):**
```bash
# In PowerShell:
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("ojix-teamflow-firebase-adminsdk-xxxxx.json"))
```
The `cloudPersistence` engine automatically detects and decodes either raw JSON or Base64-encoded strings.

---

## 3. Render Web Service Deployment Configuration

### Step 1: Create Web Service on Render
1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** ➔ **Web Service**.
3. Connect your GitHub repository: `raj-pandith/ojix-teamflow`.
4. Choose **Node** runtime.

### Step 2: Build & Start Commands
Configure the service settings:
- **Name:** `ojix-teamflow-backend` (or your preferred name)
- **Region:** `Singapore` (closest to `asia-south1` Mumbai) or `Frankfurt` / `Oregon`
- **Branch:** `main`
- **Build Command:**
  ```bash
  npm install && npm run build:server
  ```
- **Start Command:**
  ```bash
  npm run start:server
  ```
- **Auto-Deploy:** `Yes`

### Step 3: Required Environment Variables on Render
Navigate to the **Environment** tab in your Render Web Service and add the following variables:

| Variable Name | Required? | Example Value | Description |
|---|---|---|---|
| `NODE_ENV` | **Yes** | `production` | Enforces production mode and strict persistence. |
| `PORT` | **Yes** | `10000` | Render assigns this automatically, backend listens on `0.0.0.0:$PORT`. |
| `CLIENT_ORIGIN` | **Yes** | `https://ojix-teamflow.rajpandith1945.workers.dev` | Allowed CORS origin for the Cloudflare frontend (comma-separated if multiple). |
| `FIREBASE_PROJECT_ID` | **Yes** | `ojix-teamflow` | The Firebase project identifier. |
| `FIREBASE_SERVICE_ACCOUNT` | **Yes** | `{"type":"service_account","project_id":"ojix-teamflow",...}` | The minified or Base64-encoded service account JSON. |
| `STRICT_PERSISTENCE` | **Yes** | `true` | Prevents any silent fallback to local filesystem storage. |
| `VAPID_PUBLIC_KEY` | **Yes** | `BKNdlGALj-gJ2hcGKNgGstIbXdKPnfgWBnqIhMxCYSZsIwRdOAvHE0NsVI8O-a_h2tc2j69o-Qt_J6Y4xrL_FDg` | Web Push VAPID public key. |
| `VAPID_PRIVATE_KEY` | **Yes** | `[Your VAPID Private Key]` | Web Push server secret. |
| `VAPID_SUBJECT` | **Yes** | `mailto:admin@ojix.local` | VAPID contact URI. |

---

## 4. Deploying Firestore Security Rules

Before or during production cutover, deploy the authoritative security rules:

```bash
# 1. Login to Firebase CLI
firebase login

# 2. Select the ojix-teamflow project
firebase use ojix-teamflow

# 3. Deploy Firestore rules and indexes
firebase deploy --only firestore:rules,firestore:indexes
```

### Verification of Deployed Rules
Ensure that the deployed `firestore.rules` contains:
```firestore
// Internal Server-Managed System State (Deny all client SDK access)
match /system_state/{document=**} {
  allow read, write: if false;
}
```
This guarantees that clients accessing Firestore directly with web credentials can never read `/system_state/auth_store` (containing password hashes) or overwrite `/system_state/workspace_sync`.

---

## 5. Cloudflare Frontend Configuration

Update your Cloudflare Pages / Workers deployment to route all API calls to the live Render backend:

1. Open Cloudflare Dashboard ➔ Pages / Workers ➔ `ojix-teamflow`.
2. Under **Settings** ➔ **Environment Variables**:
   - Add `VITE_API_URL` = `https://ojix-teamflow.onrender.com` (replace with your actual Render service URL).
   - Add `VITE_VAPID_PUBLIC_KEY` = `BKNdlGALj-gJ2hcGKNgGstIbXdKPnfgWBnqIhMxCYSZsIwRdOAvHE0NsVI8O-a_h2tc2j69o-Qt_J6Y4xrL_FDg`.
3. Trigger a production redeploy so the Vite bundle embeds the live API URL:
   ```bash
   npm run build
   ```

---

## 6. Health & Readiness Verification

Once deployed to Render, verify the endpoints using `curl` or browser:

### 1. Liveness Check
```bash
curl -i https://ojix-teamflow.onrender.com/health
```
**Expected Response:** HTTP 200 OK
```json
{
  "status": "ok",
  "service": "ojix-teamflow-backend",
  "uptimeSeconds": 42,
  "pushReady": true,
  "storageType": "firestore",
  "databaseHealthy": true,
  "activeSseConnections": 0,
  "bootId": "server-boot-...",
  "timestamp": "2026-10-22T..."
}
```

### 2. Readiness Check
```bash
curl -i https://ojix-teamflow.onrender.com/ready
```
**Expected Response (when Firestore is connected):** HTTP 200 OK
```json
{
  "status": "ready",
  "service": "ojix-teamflow-backend",
  "ready": true,
  "database": "firestore",
  "storageType": "firestore",
  "healthy": true,
  "latencyMs": 48,
  "projectId": "ojix-teamflow",
  "mode": "production"
}
```
*(If Firestore credentials are missing or invalid, `/ready` responds with HTTP 503 and `ready: false`.)*

---

## 7. Local Development & Firebase Emulator Suite

To develop or test locally without touching the production cloud database:

### Option A: Local File Persistence (Default in dev)
Running `npm run dev` or `npm run start:server` locally without `FIREBASE_SERVICE_ACCOUNT` automatically runs in safe development mode using `.server-sync.json` and `.server-auth.json`.

### Option B: Local Firebase Emulator Suite
1. Install and start Firebase Emulators:
   ```bash
   firebase emulators:start --only firestore,auth
   ```
2. Configure `.env`:
   ```env
   FIRESTORE_EMULATOR_HOST=localhost:8080
   FIREBASE_PROJECT_ID=ojix-teamflow
   ```
3. The Admin SDK automatically routes all operations to `localhost:8080`.

---

## 8. Role-Based Access Control (RBAC) Reference

Permissions are enforced on both the backend API and Firestore rules:

| Role | Workspace Settings & Users | Create Projects | Create/Edit Tasks | Change Assignments | View Reports | Send DMs |
|---|---|---|---|---|---|---|
| **Workspace Admin** | Full Access | Allowed | Allowed | Allowed | Full Access | Allowed |
| **Project Lead** | View Only | Allowed | Allowed (in project) | Allowed | Permitted Projects | Allowed |
| **Member** | None | Prohibited | Assigned tasks only | Self or unassigned | Permitted Projects | Allowed |
| **Viewer** | None | Prohibited | Prohibited (Read-only) | Prohibited | Permitted Projects | Read-only |

### State Transition & Approval Rules
- **No Direct Done Transition:** Tasks in `in_progress` cannot transition directly to `done`. They must be submitted to `in_review`.
- **Self-Approval Guard:** An assigned Member cannot approve their own task to `done` when a distinct reviewer is assigned.
- **Assignee Guard:** Workspace Admins and Viewers cannot be assigned tasks.

---

## 9. Backup, Migration & Disaster Recovery Strategy

### Automated Firestore Export (GCP Cloud Storage)
Configure weekly automated exports of the Firestore database via Google Cloud CLI:
```bash
gcloud firestore export gs://ojix-teamflow-backups/$(date +%Y-%m-%d) --project=ojix-teamflow
```

### Initial Data Migration
When the backend starts up with an empty Firestore database, it automatically checks for existing `.server-sync.json` and `.server-auth.json` files and performs an idempotent initial seed into Firestore, ensuring zero data loss during cutover.

### Rollback Procedure
If a production issue occurs:
1. Revert Render Web Service to the previous stable Git commit via the Render dashboard.
2. In emergency cases where Cloud Firestore is degraded, setting `STRICT_PERSISTENCE=false` and removing `FIREBASE_SERVICE_ACCOUNT` switches the instance temporarily to in-memory/local mode.
3. To restore Firestore from backup:
   ```bash
   gcloud firestore import gs://ojix-teamflow-backups/YYYY-MM-DD --project=ojix-teamflow
   ```

---

## 10. Common Troubleshooting Scenarios

| Issue | Likely Cause | Remediation |
|---|---|---|
| `/ready` returns HTTP 503 | Missing or invalid `FIREBASE_SERVICE_ACCOUNT` | Verify that the JSON in Render environment contains `project_id`, `client_email`, and `private_key`. Ensure `\n` newlines are preserved. |
| CORS Error in browser | `CLIENT_ORIGIN` mismatch | Set `CLIENT_ORIGIN` on Render to match your exact Cloudflare origin (e.g. `https://ojix-teamflow.rajpandith1945.workers.dev`). |
| 401 on API endpoints | Session expired or token revoked | Log in again via `/api/auth/login` to obtain an active session token. |
| 403 Forbidden on task updates | Role restriction violation | Ensure user is not a Viewer and that self-approval rules are respected. |
