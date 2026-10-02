# ANACITY Move-in / Move-out Agentic Workflow

A runnable SDE-3 assignment prototype with:
- React + Vite + Tailwind CSS frontend
- Node.js + Express backend
- Gemini AI with function/tool calling and persisted conversation context
- PostgreSQL request, community-rule, and message storage
- Local document upload storage for demo
- JWT role-based authentication (resident/admin)
- Jest + Supertest tests

## Requirements
- Node.js 20+
- PostgreSQL 14+
- Gemini API key (optional; the app has a deterministic fallback assistant)

## 1. Configure the backend
```bash
cd server
cp .env.example .env
```
Edit `.env` and set `DATABASE_URL`, `JWT_SECRET`, and optionally `GEMINI_API_KEY`.

Create a PostgreSQL database, e.g. `anacity_agentic`.

## 2. Install and initialize
From the project root:
```bash
npm install
npm run install:all
npm run db:init
npm run db:seed
```

## 3. Run
```bash
npm run dev
```
Frontend: http://localhost:5173  
Backend: http://localhost:4000/api/health

Demo credentials (created by seed):
- Admin: `admin@anacity.demo` / `Admin123!`
- Resident: `resident@anacity.demo` / `Resident123!`

Change these credentials and `JWT_SECRET` before any shared deployment.

## Gemini
Set `GEMINI_API_KEY` in `server/.env`. The agent uses Gemini function calling to call bounded backend tools. Without a key, it uses a deterministic assistant response so the workflow remains demonstrable.

## Deploy
- Frontend: deploy `client` to Vercel; set `VITE_API_URL` to the deployed backend URL plus `/api`.
- Backend: deploy `server` to Render or another Node host; set environment variables and persistent disk for `server/uploads` if using local file storage. Local disk is ephemeral on many hosts, so use object storage in production.
- Configure CORS with `CLIENT_ORIGIN`.
- Run `npm run db:init` and `npm run db:seed` against the hosted PostgreSQL database once.

## Main workflow
1. Resident logs in and starts a move-in/move-out request.
2. Agent collects context and checks required fields against community configuration.
3. Resident submits the request; request is persisted with a tracking ID.
4. Admin sees the queue, reviews AI summary and policy checks, and approves, rejects, or requests information.
5. Resident sees status updates and can respond to clarification.

## Safety and prototype boundaries
- The model is advisory. It cannot approve/reject requests.
- Status changes are performed through authenticated backend endpoints with role checks.
- Required-field checks and status transitions are deterministic backend logic, not model decisions.
- Uploads are demo-only local storage; add virus scanning, signed URLs, retention policy, and access audit before production.
- Add rate limiting, refresh-token/session strategy, stronger validation, observability, secrets management, and integration with actual society systems before production.
