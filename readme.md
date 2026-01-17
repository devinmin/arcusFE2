# Arcus

**AI-Powered Virtual Marketing Agency**

Arcus is an autonomous marketing platform that operates like a full-service agency. Users talk to **Arc**, an AI assistant that handles brand discovery, campaign strategy, and content creation through a team of 50+ specialized AI agents.

---

## The Pitch

Instead of hiring an agency or building an in-house team, businesses get:
- A conversational AI that learns their brand in minutes
- Instant content generation (ads, social, video, email, landing pages)
- Built-in approval workflows and quality control
- Multi-channel publishing (Meta, TikTok, LinkedIn, etc.)
- Performance tracking and optimization

---

## How It Works

```
User talks to Arc (voice/text)
        ↓
Arc extracts brand DNA + campaign brief
        ↓
Agent hierarchy creates content
(CCO → Creative Directors → Associates)
        ↓
Quality gates review output
        ↓
User approves → Auto-publish
```

---

## What's Live & Working

| Feature | Status |
|---------|--------|
| Voice onboarding with Arc | Working |
| Brand DNA extraction | Working |
| Campaign creation & management | Working |
| Image generation (multiple providers) | Working |
| Video generation & editing | Working |
| Copy generation (social, ads, long-form) | Working |
| Avatar videos with voice synthesis | Working |
| Approval workflows | Working |
| Multi-tenancy (org isolation) | Working |
| Auth (JWT, Google, Meta OAuth) | Working |
| Stripe billing | Working |
| Real-time WebSocket updates | Working |

---

## What's Built But Needs Frontend

These have backend APIs + database ready, just need UI:

| Module | What It Does |
|--------|--------------|
| ABM Engine | B2B account scoring, intent signals |
| Influencer Platform | Discovery, campaigns, payments |
| Loyalty Engine | Points, tiers, rewards programs |
| Review Management | Reputation monitoring, response generation |
| HCP Marketing | Healthcare professional outreach |
| Patient Journey | DTC healthcare content |
| Veeva Integration | Pharma compliance (MLR) |
| Trade Marketing | CPG retail execution |
| Print & OOH | Billboard, transit, print specs |
| Food Content | Recipes, meal plans, nutrition |
| Analyst Relations | Gartner/Forrester tracking |
| Partner Marketing | Channel partner campaigns |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, TypeScript, Vite, Tailwind, Zustand |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Redis |
| AI | OpenRouter (Claude, GPT-4, Gemini), ElevenLabs, AssemblyAI |
| Payments | Stripe |

---

## Running Locally

```bash
# Prerequisites: Node 18+, PostgreSQL, Redis

# Backend
cd backend
cp .env.example .env   # Add your API keys
npm install
npm run migrate
npm run dev            # → localhost:3000

# Frontend (separate terminal)
cd src
npm install
npm run dev            # → localhost:5173
```

**Required env vars** (backend/.env):
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
JWT_SECRET=<secret>
ENCRYPTION_KEY=<32-bytes>
OPENROUTER_API_KEY=<key>
```

---

## Project Structure

```
Arcus-Zo/
├── backend/
│   ├── src/
│   │   ├── agents/      # AI agent hierarchy (50+ agents)
│   │   ├── routes/      # API endpoints (100+)
│   │   ├── services/    # Business logic (110+ services)
│   │   ├── database/    # Migrations (130+)
│   │   └── workers/     # Background jobs
│   └── .env
│
├── src/                 # React frontend
│   ├── components/
│   ├── pages/
│   └── stores/
│
└── docs/                # Architecture docs
```

---

## Numbers

- **130+** database migrations
- **110+** backend services
- **100+** API routes
- **50+** AI agents across 12 departments
- **0** TypeScript errors

---

## Questions?

The code is fully typed. Most services have comments explaining what they do. Ping me if anything's unclear.
