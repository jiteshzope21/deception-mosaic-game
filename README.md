# DECEPTION — MOSAIC (ADG TECHNICAL EVENT)

**Tagline: Find the Clues. Complete the Tasks. Trust No One.**

DECEPTION is a high-stakes hybrid live technical event game combining physical QR treasure hunting, team-based physical engineering tasks, and real-time social deception. The web application serves as the digital orchestration and state authority layer while physical tasks and eliminations occur offline in the real world.

---

## 1. Architecture Overview

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, TypeScript, Tailwind CSS v4, Lucide React, React Router v7, TanStack Query v5, Zod v4 |
| **Backend** | Node.js, Express, TypeScript, Mongoose, Socket.IO, JWT, Zod |
| **Database** | MongoDB Atlas (or local MongoDB for development) |
| **QR Scanner** | `@zxing/browser` with manual code fallback |
| **Realtime** | Socket.IO (Authenticated WebSockets with private room isolation) |
| **Security** | Server-authoritative state, HttpOnly cookie & bearer JWTs, Helmet, express-rate-limit |

```
Deception/
├── backend/                # Express / MongoDB / Socket.IO backend
│   ├── src/
│   │   ├── config/         # Database, constants, rate limiting
│   │   ├── controllers/    # Route controllers (auth, game, gm)
│   │   ├── middleware/     # JWT authentication & GM role guards
│   │   ├── models/         # Mongoose models (Game, Question, Config, etc.)
│   │   ├── routes/         # Express routers
│   │   ├── sockets/        # Socket.IO server & authenticated room dispatch
│   │   ├── types/          # Core backend game types & interfaces
│   │   ├── utils/          # JWT tokens, response helpers, win logic
│   │   ├── validators/     # Zod request validators
│   │   ├── app.ts          # Express application factory
│   │   ├── server.ts       # HTTP server + Socket.IO bootstrap
│   │   └── seed.ts         # Initial database seed script
│   ├── tests/unit/         # Vitest unit test suite (81 tests)
│   ├── .env.example        # Backend environment variables template
│   └── package.json
│
├── src/                    # React frontend application
│   ├── app/
│   │   ├── config/         # App constants & branding configuration
│   │   ├── providers/      # AuthContext & React Query providers
│   │   └── router/         # AppRouter with protected route guards
│   ├── components/ui/      # Accessible UI components (modals, cards, badges)
│   ├── features/
│   │   ├── auth/           # GM login page & credentials validation
│   │   ├── gm/             # GM Dashboard, lobby control, live game, history, questions
│   │   └── player/         # Mobile-first player screens (Lobby, R1, Transition, R2, Complete)
│   ├── lib/
│   │   ├── api/            # Authenticated API client
│   │   ├── socket/         # Socket.IO client with auto-reconnection
│   │   ├── utils/          # Formatting & local helpers
│   │   └── validation/     # Shared Zod schemas
│   ├── services/           # Game & Auth service API callers
│   ├── types/              # TypeScript types (enums, game state, history)
│   └── styles/             # Tailwind CSS tokens
│
├── tests/unit/             # Frontend unit test suite
├── .env.example            # Frontend environment variables template
└── package.json
```

---

## 2. Authoritative Game Flow

```
LOBBY
  │  (5 or 6 players join by team code & pre-registered name)
  ▼
ROUND_1_ACTIVE (4 minutes server-authoritative timer)
  │  (10 physical QRs: dynamic puzzle vs. decoy mapping, 2 lives/player, MCQ questions)
  ▼
ROUND_1_COMPLETE (Puzzle solved, team eliminated by 0 lives, or 4-min timer expired)
  │  (GM triggers transition)
  ▼
TRANSITION (1 minute countdown)
  │  (Server assigns 1 Imposter & physical task zones; ROLES KEPT STRICTLY SECRET)
  ▼
ROUND_2_ACTIVE (Continuous 7-minute master timer begins)
  │  (Roles & physical task zones revealed privately; Imposter gets up to 2 offline kills)
  │
  ├───────────────► BODY_REPORT (20s report window upon offline kill)
  │                     │
  │                     ▼
  │                 MOVE_TO_VOTING (15s physical movement countdown)
  │                     │
  │                     ▼
  │                 VOTING (15s voting window; targets secret until close)
  │                     │
  │                     ▼ (Tie rules: NO_ELIMINATION / REVOTE / RANDOM_PICK)
  │                     │
  ◄─────────────────────┘ (Returns to Round 2 with untouched continuous master timer)
  │
  ▼
GAME_COMPLETE (Final results revealed; game becomes archived and read-only)
```

### Win Conditions
* **Crewmates Win**: Imposter is correctly identified and voted out during emergency voting.
* **Imposter Wins**:
  1. Imposter achieves 2 valid kills and survives the resulting voting sequence, OR
  2. Round 2 master timer (7 minutes) expires without the Imposter being caught.

---

## 3. Local Development Setup

### Prerequisites
* **Node.js**: v20 or v22 LTS
* **MongoDB**: Local MongoDB instance or free MongoDB Atlas cluster

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/jiteshzope21/deception-mosaic-game.git
cd deception-mosaic-game

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### 2. Environment Configuration
```bash
# Frontend environment
cp .env.example .env.local

# Backend environment
cp backend/.env.example backend/.env
```

Configure `backend/.env`:
```env
MONGODB_URI=mongodb://localhost:27017/deception
MONGODB_DB_NAME=deception
JWT_SECRET=use_a_long_cryptographically_secure_random_string_here_min_64_chars
JWT_GM_EXPIRY=8h
JWT_PLAYER_EXPIRY=4h
PORT=3001
NODE_ENV=development
CORS_ALLOWED_ORIGINS=http://localhost:5173
GM_EMAIL=organizer@adg.org
GM_PASSWORD=ChangeMe_ADG2026!
GM_DISPLAY_NAME=Game Master
```

Configure `.env.local` (frontend):
```env
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
```

### 3. Database Seed
Run the seed script once to set up the 10 permanent physical QR codes (`QR-01` to `QR-10`), default physical task zones, game configuration, decoy messages, initial question bank (`Q-001` to `Q-010`), and the GM account:
```bash
cd backend
npx tsx src/seed.ts
cd ..
```

### 4. Running the Development Servers
Open two terminal windows:

**Terminal 1 (Backend):**
```bash
cd backend
npm run dev
```
Backend runs at `http://localhost:3001` (Health check: `http://localhost:3001/api/health`).

**Terminal 2 (Frontend):**
```bash
npm run dev
```
Frontend runs at `http://localhost:5173`.

---

## 4. Verification & Testing

Run all automated test suites to ensure 100% compliance:

```bash
# Run root test suite (109 tests)
npm test

# Run backend unit tests (81 tests)
cd backend && npm test && cd ..

# Check backend types and linting
cd backend && npm run typecheck && npm run lint && cd ..

# Build frontend production bundle
npm run build

# Run frontend linting
npm run lint
```

---

## 5. Game Master (GM) Event Operations Guide

1. **Sign In**: Navigate to `/gm/login` using the seeded GM credentials.
2. **Question Bank**: Open **Question Bank** in dashboard to preview or add questions (`Q-011` through `Q-050`).
3. **Create Game**:
   - Enter Team Name (e.g., "Alpha").
   - Select Team Size (**5** or **6** players).
   - Enter unique player names (e.g., "Alice", "Bob", "Charlie", "Dave", "Eve").
   - Click **Create Lobby**. Note the 6-character Game Code (e.g., `DEC-1234`).
4. **Player Join**:
   - Players navigate to root `/` on their mobile phones.
   - Enter Game Code and select their pre-registered name.
   - GM dashboard updates in real time showing who has joined.
5. **Start Game**: When all players have joined, click **Start Game**.
6. **Round 1 (4 Minutes)**:
   - Players physically hunt and scan `QR-01` through `QR-10`.
   - GM monitors live timer, solved puzzle pieces, individual lives, and event logs.
   - Emergency End / Restart controls available if needed.
7. **Transition (1 Minute)**:
   - GM initiates Transition when Round 1 finishes.
   - Server securely assigns 1 Imposter and task zones without revealing them to players.
8. **Round 2 (7 Minutes)**:
   - Roles and physical task zones are revealed privately to players.
   - Imposter eliminates players offline and records the kill in the app.
   - Players report bodies to trigger emergency voting.
9. **Game Complete & History**:
   - Final results, winner, Imposter identity, and kill statistics are revealed.
   - All completed games are archived in the **History** tab (read-only).

---

## 6. Production Deployment Guide (Free / Low-Cost Tier)

The application is architected so frontend and backend can be deployed independently.

### 1. Database: MongoDB Atlas (Free M0 Cluster)
1. Create a free M0 cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a database user with read/write access.
3. In Network Access, add `0.0.0.0/0` (or the IP ranges of your backend host).
4. Copy the connection string: `mongodb+srv://<user>:<password>@cluster0.xxx.mongodb.net/deception?retryWrites=true&w=majority`.

### 2. Backend Hosting: Render, Railway, or Fly.io
* **Hosting Service**: Free / Starter Web Service (e.g., [Render.com](https://render.com) or [Railway.app](https://railway.app)).
* **Root Directory**: `backend`
* **Build Command**: `npm install && npm run build`
* **Start Command**: `npm start`
* **Environment Variables**:
  * `NODE_ENV=production`
  * `PORT=10000` (or assigned by provider)
  * `MONGODB_URI=<your MongoDB Atlas URI>`
  * `MONGODB_DB_NAME=deception`
  * `JWT_SECRET=<strong 64+ char secret>`
  * `CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app`
  * `GM_EMAIL=admin@your-event.org`
  * `GM_PASSWORD=<strong admin password>`
  * `GM_DISPLAY_NAME=Head Game Master`
* **One-Time DB Seed**: Use the provider's web shell/console to run:
  ```bash
  npx tsx src/seed.ts
  ```

### 3. Frontend Hosting: Vercel or Cloudflare Pages
* **Hosting Service**: [Vercel](https://vercel.com) or [Cloudflare Pages](https://pages.cloudflare.com)
* **Framework Preset**: Vite
* **Build Command**: `npm run build`
* **Output Directory**: `dist`
* **Environment Variables**:
  * `VITE_API_URL=https://your-backend.onrender.com/api`
  * `VITE_SOCKET_URL=https://your-backend.onrender.com`

### 4. Production Security & Network Considerations
* **HTTPS/WSS**: Both frontend and backend must use HTTPS/WSS in production to enable camera access for `@zxing/browser` QR scanning.
* **CORS & WebSockets**: Ensure `CORS_ALLOWED_ORIGINS` on the backend matches the production frontend domain.
* **Socket.IO Sticky Sessions**: If deploying across multiple backend instances, enable sticky sessions or use Redis adapter. For a single physical event instance, a single Node.js backend container handles the traffic smoothly.

---

## 7. Security & Compliance Summary

* **Zero Volunteer Web Footprint**: All physical station tasks and verifications remain strictly offline.
* **Role Privacy**: Imposter identity and roles are never sent to unauthorized players before game completion.
* **Answer Secrecy**: Correct MCQ answers are checked strictly on the backend and never leaked to the browser.
* **Voting Privacy**: Individual voting selections remain concealed; only vote totals (`X / Y submitted`) are broadcast until voting ends.
* **Server-Authoritative Clock**: Clients compute remaining time from server timestamps; timers never reset improperly during Round 2.
* **Read-Only Archival**: Completed games cannot be modified through any API endpoint.
