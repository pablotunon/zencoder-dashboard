# Auto

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

---

## Workflow Steps

### [x] Step: Implementation
<!-- chat-id: 15f30f13-780b-4706-8eb1-6526553b61d1 -->

**Scope: Large** — Phase 7 (Authentication & Authorization) touches 4 services: simulator, analytics-api, nginx, frontend.

**Requirements:**
- Passwords salted+hashed with bcrypt (never stored in plain text)
- Bootstrap data must include user "user" with password "pass"
- JWT-based sessions with Redis deny-list for logout
- Login/logout/me endpoints on analytics-api
- Replace auth stub with real JWT extraction
- Frontend login page, route guards, 401 interceptor, logout button
- Role-based access: admin (full), team_lead (team-scoped), viewer (read-only)

**Key decisions:**
- JWT secret via env var `JWT_SECRET` (default for dev)
- Token expiry: 24h
- bcrypt for password hashing (salt built-in to bcrypt)
- python-jose + bcrypt (native) on analytics-api
- bcryptjs on simulator (npm package, no native deps)
- Login by email+password (not user_id)
- Special well-known user: user_id="user", email="user@acmecorp.com", name="Demo User", password="pass", role="admin"

**Affected files:**

Simulator:
- `simulator/package.json` — add bcryptjs dependency
- `simulator/src/generators/org.ts` — add password_hash generation, add "user" user
- `simulator/src/seed-data.ts` — include password_hash in INSERT

Analytics API:
- `analytics-api/requirements.txt` — add python-jose, passlib, bcrypt
- `analytics-api/app/config.py` — add JWT_SECRET, JWT_EXPIRY settings
- `analytics-api/app/models/auth.py` — add LoginRequest, TokenResponse, UserProfile models
- `analytics-api/app/auth/jwt.py` — JWT create/verify, password verify
- `analytics-api/app/auth/dependencies.py` — replace stub with JWT extraction
- `analytics-api/app/routers/auth.py` — POST /login, POST /logout, GET /me
- `analytics-api/app/main.py` — register auth router
- `analytics-api/app/services/postgres.py` — add get_user_by_email query

Nginx:
- `nginx/nginx.conf` — already proxies /api/* → analytics-api (no change needed, /api/auth/* is under /api/)

Frontend:
- `frontend/src/types/auth.ts` — add login/logout function types
- `frontend/src/api/client.ts` — add login/logout/me API functions, add auth header
- `frontend/src/hooks/useAuth.tsx` — real auth provider with state, token storage, login/logout
- `frontend/src/pages/Login.tsx` — new login page
- `frontend/src/App.tsx` — add /login route, add route guards
- `frontend/src/components/layout/Sidebar.tsx` — add logout button

Docker:
- `docker-compose.yml` — add JWT_SECRET env to analytics-api

**Verification:**
- `docker-compose up --build -d`
- Login as user@acmecorp.com / pass → dashboard loads
- Logout → redirected to login
- Invalid credentials → error message
- Unauthenticated API call → 401
