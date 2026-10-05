# MOSAIC — ADG Technical Event

**Game Theme: DECEPTION**  
**Tagline: Find the Clues. Complete the Tasks. Trust No One.**

---

## Architecture Overview

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, TypeScript, Tailwind CSS v4, React Router v7, TanStack Query v5, Zod v4 |
| **Backend** | Node.js, Express, TypeScript, MongoDB, Mongoose, Socket.IO, JWT, Zod |
| **Database** | MongoDB (local or Atlas) |
| **Realtime** | Socket.IO (WebSockets) |
| **Auth** | Server-issued JWTs — HttpOnly cookies + Authorization header |

```
Deception/
├── backend/                # Express/MongoDB backend
│   ├── src/
│   │   ├── config/         # Database, app config, constants
│   │   ├── controllers/    # Route handlers
│   │   ├── middleware/     # JWT auth middleware
│   │   ├── models/         # Mongoose schemas
│   │   ├── routes/         # Express routers
│   │   ├── sockets/        # Socket.IO server
│   │   ├── types/          # Shared TypeScript types
│   │   ├── utils/          # JWT, logger, response utils
│   │   ├── validators/     # Zod validation schemas
│   │   ├── app.ts          # Express app factory
│   │   ├── server.ts       # HTTP server + Socket.IO bootstrap
│   │   └── seed.ts         # DB seed script (run once)
│   ├── tests/unit/         # Vitest unit tests
│   ├── .env.example        # Required environment variables
│   └── package.json
│
├── src/                    # React frontend
│   ├── app/
│   │   ├── config/         # App constants (game defaults, etc.)
│   │   ├── providers/      # AuthContext (JWT session state)
│   │   └── router/         # AppRouter with protected routes
│   ├── components/ui/      # Shared UI components
│   ├── features/
│   │   ├── auth/           # GM login page + form hooks
│   │   ├── gm/             # GM dashboard (Phase 1 scaffold)
│   │   └── player/         # Landing, Join, PlayerLobby pages
│   ├── lib/
│   │   ├── api/            # apiClient.ts — fetch wrapper with JWT
│   │   ├── socket/         # socketClient.ts — Socket.IO client
│   │   ├── utils/          # helpers.ts, errors.ts
│   │   └── validation/     # Zod schemas (shared with backend)
│   ├── services/           # authService.ts
│   ├── types/              # TypeScript types (enums, app, database)
│   └── styles/             # Tailwind CSS design tokens
│
├── tests/unit/             # Frontend Vitest unit tests
├── .env.example            # Frontend env vars (VITE_API_URL, VITE_SOCKET_URL)
└── package.json
```

---

## Quick Start

### 1. Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [MongoDB](https://www.mongodb.com/try/download/community) running locally, or a MongoDB Atlas connection string

### 2. Clone & Install

```bash
# Install frontend dependencies (from project root)
npm install

# Install backend dependencies
cd backend && npm install
```

### 3. Configure Environment

```bash
# Frontend (project root)
cp .env.example .env.local

# Backend
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set at minimum:
- `MONGODB_URI` — your MongoDB connection string
- `JWT_SECRET` — a long random string (64+ chars)
- `GM_EMAIL` / `GM_PASSWORD` — credentials for the Game Master account

### 4. Seed the Database

> Run **once** before first game. Seeds QR codes, tasks, game config, and the GM account.

```bash
cd backend
npx tsx src/seed.ts
```

### 5. Start Development Servers

In two separate terminals:

```bash
# Terminal 1 — Backend (Express + Socket.IO on :3001)
cd backend && npm run dev

# Terminal 2 — Frontend (Vite on :5173)
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001/api
- **Health Check**: http://localhost:3001/api/health

### 6. GM Login

Navigate to `http://localhost:5173/gm/login` and sign in with the GM credentials you set in `.env`.

---

## Development Commands

### Frontend

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run lint` | Run oxlint |
| `npx vitest run` | Run all unit tests |

### Backend

| Command | Description |
|---|---|
| `npm run dev` | Start backend with hot reload |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Run unit tests |
| `npx tsx src/seed.ts` | Seed database |

---

## Security Model

| Concern | Approach |
|---|---|
| **Authentication** | Server-issued JWTs. Never trust client-provided IDs. |
| **GM Auth** | Email + bcrypt password verified server-side |
| **Player Auth** | Claim pre-registered slot via Game Code + Name |
| **Token storage** | HttpOnly cookies + `localStorage` fallback |
| **Imposter identity** | Emitted **only** to that player's private Socket.IO room |
| **Answer validation** | Backend only — `correctAnswer` never sent to browser |
| **Rate limiting** | express-rate-limit on all endpoints |
| **Security headers** | helmet.js |

---

## Phase Progress

| Phase | Status | Contents |
|---|---|---|
| **Phase 1** | ✅ Complete | Foundation: MongoDB, Express, Socket.IO, JWT auth, Mongoose models, Zod validation, Vite+React frontend, AuthContext, routing |
| **Phase 2** | 🔜 Next | Game lobby creation, QR scan, Round 1 gameplay, puzzle |
| **Phase 3** | 🔜 Planned | Round 2, kill/report, voting |
| **Phase 4** | 🔜 Planned | Results, GM history, polish |
