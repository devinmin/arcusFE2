# Testing Guide

## Setup Test Environment

1. **Create test database:**
   ```bash
   createdb agency_test
   ```

2. **Run migrations on test database:**
   ```bash
   DATABASE_URL=postgresql://user:password@localhost:5432/agency_test npm run migrate
   ```

3. **Run tests:**
   ```bash
   npm test
   ```

## Test Structure

```
/src/__tests__/
  - auth.test.ts          # Authentication tests
  - campaigns.test.ts     # Campaign API tests
  - safety.test.ts        # Safety checks tests (to be added)
  - meta-api.test.ts      # Meta API tests (requires mocking)
```

## Test Coverage

Current coverage targets:
- Unit tests: 80%+ for business logic
- Integration tests: All API endpoints
- E2E tests: Critical paths (added in Phase 5)

## Running Specific Tests

```bash
# Run specific test file
npm test -- auth.test.ts

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

## Test Database Cleanup

Tests create temporary users and campaigns. To clean up:

```bash
# Drop and recreate test database
dropdb agency_test
createdb agency_test
npm run migrate
```

## Mocking External Services

For Phase 1, we test API structure without real Meta API calls.
Phase 2 will add comprehensive mocking for:
- Meta Marketing API
- SendGrid
- Midjourney
- Vercel deployment

## CI/CD Integration

Tests run automatically on:
- Pre-commit hooks (linting + quick tests)
- Pull requests (full test suite)
- Before deployment (full suite + E2E)


