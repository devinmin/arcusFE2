# Agency Platform Backend

Autonomous Marketing Agency Platform - Backend API

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** Express + TypeScript
- **Database:** PostgreSQL
- **Cache/Queue:** Redis + Bull
- **Testing:** Jest + Supertest

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Set up database:**
   ```bash
   # Create PostgreSQL database
   createdb agency_dev
   
   # Run migrations
   npm run migrate
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

Server runs on http://localhost:3000

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run migrate` - Run database migrations
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Run ESLint

## Project Structure

```
/src
  /models        # TypeScript interfaces
  /services      # Business logic
  /engines       # Core systems (execute, optimize)
  /middleware    # Express middleware
  /routes        # API endpoints
  /workers       # Background jobs
  /database      # DB connection + migrations
  /utils         # Helpers
  server.ts      # Entry point
```

## API Documentation

### Health Check
```
GET /health
```

### Authentication
```
POST /api/auth/signup
POST /api/auth/login
```

### Campaigns
```
POST /api/campaigns
GET /api/campaigns/:id
POST /api/campaigns/:id/launch
GET /api/campaigns/:id/metrics
```

(Full API documentation in `/docs/PRD.md`)

## Development

- Code style: 2-space indentation, semicolons required, single quotes
- Testing: 80%+ coverage target for business logic
- Commits: Conventional commits (feat, fix, docs, etc.)

## License

MIT


