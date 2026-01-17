# Arcus Platform - Frontend Integration Context

**Last Updated:** January 2026
**Backend URL:** https://api.usearcus.ai (Railway)
**Frontend URL:** https://www.usearcus.ai (Vercel)
**Database:** PostgreSQL on Railway

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Environment Variables](#environment-variables)
5. [Key Data Models](#key-data-models)
6. [Frontend Requirements](#frontend-requirements)
7. [CORS Configuration](#cors-configuration)
8. [Error Handling](#error-handling)

---

## Architecture Overview

### Tech Stack
- **Backend:** Node.js + Express + TypeScript
- **Frontend:** React + TypeScript (Vite)
- **Database:** PostgreSQL (Railway)
- **Authentication:** Clerk
- **AI Provider:** OpenRouter (Claude, GPT-4, Gemini)
- **Image Generation:** Segmind API
- **Deployment:** Backend on Railway, Frontend on Vercel

### Key Services
- **Campaign Generation:** AI-powered marketing campaign creation
- **Brand Intelligence:** Automated brand analysis from websites
- **Multi-deliverable Output:** Social posts, emails, blogs, ads, video scripts
- **Real-time Generation:** Streaming campaign generation progress

---

## Authentication

### Clerk Integration

**Provider:** Clerk.com
**Authentication Flow:** JWT tokens via Clerk SDK

#### Frontend Setup
```typescript
// Install Clerk React SDK
npm install @clerk/clerk-react

// Wrap app with ClerkProvider
import { ClerkProvider } from '@clerk/clerk-react';

<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
  <App />
</ClerkProvider>
```

#### Required Environment Variables (Frontend)
```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_your-key-here
VITE_API_URL=https://api.usearcus.ai
```

#### Making Authenticated Requests
```typescript
import { useAuth } from '@clerk/clerk-react';

function useApiCall() {
  const { getToken } = useAuth();

  async function callApi(endpoint: string, options: RequestInit = {}) {
    const token = await getToken();

    return fetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  return { callApi };
}
```

---

## API Endpoints

### Base URL
```
Production: https://api.usearcus.ai
Development: http://localhost:3001
```

### Health Check
```http
GET /health
Response: { "status": "ok", "timestamp": "2026-01-13T..." }
```

---

### Campaign Generation

#### Generate Campaign
```http
POST /api/campaigns/generate
Content-Type: application/json
Authorization: Bearer <clerk-jwt-token>

Request Body:
{
  "website": "https://example.com",
  "industry": "technology",
  "brief": "Launch campaign for new AI product"
}

Response (200 OK):
{
  "success": true,
  "campaignId": "campaign_abc123",
  "outputFolder": "/tmp/campaigns/campaign_abc123",
  "deliverables": {
    "brandContext": {
      "json": "{...brand data...}",
      "extractedImages": ["/campaigns/abc123/brand/extracted_images/logo.png"],
      "colorsAndFonts": "# Brand Intelligence Report..."
    },
    "strategicBrief": "# Strategic Brief\n\n...",
    "socialMedia": "# Social Media Package\n\n...",
    "emailSequence": "# Email Sequence\n\n...",
    "blogArticle": "# Blog Article\n\n...",
    "adCopy": "# Ad Copy Package\n\n...",
    "videoScript": "# Video Script\n\n...",
    "campaignDeck": {
      "url": "# Campaign Presentation Deck...",
      "slideCount": 0
    },
    "video": {
      "url": null,
      "duration": null,
      "thumbnail": null
    },
    "images": {
      "hero": "/campaigns/abc123/images/hero.png",
      "socialPost": "/campaigns/abc123/images/social_1.png",
      "socialStory": "/campaigns/abc123/images/story_1.png",
      "emailBanner": "/campaigns/abc123/images/email_banner.png",
      "adCreative": "/campaigns/abc123/images/ad_creative.png",
      "blogFeatured": "/campaigns/abc123/images/blog_hero.png"
    }
  }
}

Error Response (400):
{
  "success": false,
  "error": "Website and industry are required"
}

Error Response (500):
{
  "success": false,
  "error": "Campaign generation failed"
}
```

**Important Notes:**
- Campaign generation can take 5-15 minutes depending on complexity
- Images are served from `/campaigns/{campaignId}/` static route
- All deliverables are in Markdown format except images

#### Download Campaign Files

**Download All Files (ZIP):**
```http
GET /api/campaigns/:campaignId/download-all
Response: application/zip file
Filename: campaign-{campaignId}.zip
```

**Download Images Only (ZIP):**
```http
GET /api/campaigns/:campaignId/download/images
Response: application/zip file
Filename: campaign-images-{campaignId}.zip
```

**Download Individual Deliverable:**
```http
GET /api/campaigns/:campaignId/download/:fileType

Available fileTypes:
- brand-intelligence
- strategic-brief
- social-media
- email-sequence
- blog-article
- ad-copy
- video-script
- campaign-deck

Response: Markdown file download
```

#### Access Generated Images
```http
GET /campaigns/:campaignId/images/:filename
Response: PNG/JPG image file

Example:
GET /campaigns/abc123/images/hero.png
```

---

### Authentication Endpoints

#### Clerk Webhook (Backend Only)
```http
POST /api/webhooks/clerk
Content-Type: application/json
Svix-Signature: <webhook-signature>

Body: Clerk webhook payload (user.created, user.updated, etc.)
```

**Note:** This endpoint is called by Clerk automatically, not by the frontend.

---

## Environment Variables

### Backend (Railway)
```bash
# Core
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://www.usearcus.ai

# Database
DATABASE_URL=postgresql://postgres:password@postgres.railway.internal:5432/railway

# Security
JWT_SECRET=your-jwt-secret-32-chars-minimum
ENCRYPTION_KEY=your-32-character-encryption-key

# Clerk Authentication
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# AI Services (OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_SITE=https://www.usearcus.ai
OPENROUTER_TITLE=Arcus

# Image Generation
SEGMIND_API_KEY=your-segmind-key

# Optional - Fallback LLM
ANTHROPIC_API_KEY=sk-ant-...
```

### Frontend (Vercel)
```bash
# Clerk
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...

# API
VITE_API_URL=https://api.usearcus.ai

# Optional - Environment indicator
VITE_ENV=production
```

---

## Key Data Models

### Campaign Request
```typescript
interface CampaignRequest {
  website: string;        // URL of client website
  industry: string;       // e.g., "technology", "healthcare", "ecommerce"
  brief?: string;         // Optional campaign description
}
```

### Campaign Response
```typescript
interface CampaignResponse {
  success: boolean;
  campaignId: string;
  outputFolder: string;
  deliverables: {
    brandContext: {
      json: string;                    // Parsed brand data
      extractedImages: string[];       // Array of image URLs
      colorsAndFonts: string;          // Markdown report
    };
    strategicBrief: string;            // Markdown content
    socialMedia: string;               // Markdown content
    emailSequence: string;             // Markdown content
    blogArticle: string;               // Markdown content
    adCopy: string;                    // Markdown content
    videoScript: string;               // Markdown content
    campaignDeck: {
      url: string;                     // Markdown content
      slideCount: number;
    };
    video: {
      url: string | null;
      duration: number | null;
      thumbnail: string | null;
    };
    images: {
      hero: string | null;             // Image URL
      socialPost: string | null;       // Image URL
      socialStory: string | null;      // Image URL
      emailBanner: string | null;      // Image URL
      adCreative: string | null;       // Image URL
      blogFeatured: string | null;     // Image URL
    };
  };
}
```

### Error Response
```typescript
interface ErrorResponse {
  success: false;
  error: string;  // Human-readable error message
}
```

---

## Frontend Requirements

### Required Features

1. **Campaign Generation Form**
   - Input: Website URL (required)
   - Input: Industry dropdown or text (required)
   - Input: Campaign brief (optional, textarea)
   - Submit button → POST to `/api/campaigns/generate`
   - Show loading state (5-15 minute generation time)
   - Consider using a loading spinner with status updates

2. **Campaign Results Display**
   - Parse and render Markdown deliverables
   - Display generated images in galleries
   - Provide download buttons for individual deliverables
   - Provide "Download All" button for ZIP download
   - Show campaign ID for reference

3. **Authentication UI**
   - Sign in / Sign up buttons (Clerk components)
   - Protected routes that require authentication
   - User profile/settings page (optional)

4. **Error Handling**
   - Display user-friendly error messages
   - Handle network timeouts gracefully
   - Show validation errors for form inputs

### Recommended Libraries

```json
{
  "dependencies": {
    "@clerk/clerk-react": "^5.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-router-dom": "^6.x",
    "react-markdown": "^9.x",
    "axios": "^1.x"
  }
}
```

### Example: Campaign Generation Component

```typescript
import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import ReactMarkdown from 'react-markdown';

interface CampaignFormData {
  website: string;
  industry: string;
  brief: string;
}

function CampaignGenerator() {
  const { getToken } = useAuth();
  const [formData, setFormData] = useState<CampaignFormData>({
    website: '',
    industry: '',
    brief: ''
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/campaigns/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Campaign generation failed');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div>Generating campaign... This may take 5-15 minutes.</div>;
  }

  if (result) {
    return (
      <div>
        <h2>Campaign Generated! ID: {result.campaignId}</h2>

        {/* Strategic Brief */}
        <section>
          <h3>Strategic Brief</h3>
          <ReactMarkdown>{result.deliverables.strategicBrief}</ReactMarkdown>
        </section>

        {/* Images */}
        <section>
          <h3>Generated Images</h3>
          {result.deliverables.images.hero && (
            <img src={`${import.meta.env.VITE_API_URL}${result.deliverables.images.hero}`} alt="Hero" />
          )}
        </section>

        {/* Download All */}
        <a
          href={`${import.meta.env.VITE_API_URL}/api/campaigns/${result.campaignId}/download-all`}
          download
        >
          Download All Files
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="url"
        placeholder="Website URL"
        value={formData.website}
        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
        required
      />

      <input
        type="text"
        placeholder="Industry"
        value={formData.industry}
        onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
        required
      />

      <textarea
        placeholder="Campaign brief (optional)"
        value={formData.brief}
        onChange={(e) => setFormData({ ...formData, brief: e.target.value })}
      />

      {error && <div className="error">{error}</div>}

      <button type="submit">Generate Campaign</button>
    </form>
  );
}

export default CampaignGenerator;
```

---

## CORS Configuration

The backend is configured to accept requests from:
```
https://www.usearcus.ai
http://localhost:5173 (development)
```

If you deploy the frontend to a different domain, you must update the `FRONTEND_URL` environment variable on Railway:
```bash
# Single domain
FRONTEND_URL=https://www.usearcus.ai

# Multiple domains (comma-separated)
FRONTEND_URL=https://www.usearcus.ai,https://app.usearcus.ai
```

**Allowed Headers:**
- `Content-Type`
- `Authorization`

**Allowed Methods:**
- `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`

**Credentials:** Enabled (cookies/auth tokens)

---

## Error Handling

### Common Errors

#### 401 Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized"
}
```
**Cause:** Missing or invalid JWT token from Clerk
**Solution:** Ensure user is logged in and token is included in Authorization header

#### 400 Bad Request
```json
{
  "success": false,
  "error": "Website and industry are required"
}
```
**Cause:** Missing required fields in request body
**Solution:** Validate form inputs before submission

#### 404 Not Found
```json
{
  "success": false,
  "error": "Campaign not found"
}
```
**Cause:** Invalid campaign ID or campaign doesn't exist
**Solution:** Verify campaign ID is correct

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Campaign generation failed"
}
```
**Cause:** Backend processing error (AI API failure, database issue, etc.)
**Solution:** Check backend logs on Railway, retry request, or contact support

### Frontend Error Handling Best Practices

```typescript
async function handleApiError(response: Response) {
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Unknown error' }));

    switch (response.status) {
      case 401:
        // Redirect to login
        window.location.href = '/sign-in';
        break;
      case 400:
        // Show validation error
        alert(data.error || 'Invalid request');
        break;
      case 404:
        // Show not found message
        alert('Resource not found');
        break;
      case 500:
        // Show generic error
        alert('Server error. Please try again later.');
        break;
      default:
        alert(data.error || 'An error occurred');
    }

    throw new Error(data.error);
  }

  return response.json();
}
```

---

## Important Notes for bolt.new

### 1. Campaign Generation is Async
- Generation takes **5-15 minutes**
- Frontend should show loading state with progress indicators
- Consider implementing polling or websockets for status updates (future enhancement)

### 2. Markdown Rendering
- All text deliverables (brief, social posts, emails, etc.) are in **Markdown format**
- Use a Markdown renderer like `react-markdown` to display content
- Consider syntax highlighting for code blocks

### 3. Image URLs
- Images are served from the backend at `/campaigns/{campaignId}/images/{filename}`
- Always prepend `VITE_API_URL` to image paths
- Images are PNGs generated by AI

### 4. File Downloads
- ZIP downloads trigger browser download automatically
- Use `<a>` tags with `download` attribute
- Backend sets appropriate `Content-Disposition` headers

### 5. Authentication Required
- All `/api/campaigns/*` endpoints require authentication
- Use Clerk's `useAuth()` hook to get JWT tokens
- Handle 401 errors by redirecting to login

### 6. No Redis Required (Frontend)
- Backend uses Redis for job queues, but this is internal
- Frontend doesn't need to know about Redis
- All communication is via HTTP REST API

### 7. Environment Variables
- Use `VITE_` prefix for Vite environment variables
- Never commit `.env` files to git
- Use Vercel's environment variable UI for production

### 8. TypeScript Types
- Backend is fully TypeScript
- Frontend should use TypeScript for type safety
- Import types from backend if using monorepo (optional)

---

## Quick Start Checklist for bolt.new

- [ ] Install `@clerk/clerk-react` package
- [ ] Set up `ClerkProvider` with publishable key
- [ ] Configure `VITE_API_URL` environment variable
- [ ] Create campaign generation form component
- [ ] Implement authenticated API calls with JWT tokens
- [ ] Add Markdown rendering for deliverables
- [ ] Handle image URLs with full backend URL
- [ ] Implement download buttons for ZIP files
- [ ] Add loading states for long-running operations
- [ ] Implement error handling for API failures
- [ ] Test authentication flow (login/logout)
- [ ] Test campaign generation end-to-end

---

## Support & Resources

**Backend Repository:** github.com/dev-in-arcus/arcusv1
**Backend Deployment:** Railway (auto-deploy from main branch)
**Frontend Deployment:** Vercel (to be configured)
**Database:** PostgreSQL on Railway
**API Documentation:** This file (CONTEXT.md)

**Key Technologies:**
- Clerk Authentication: https://clerk.com/docs
- OpenRouter AI: https://openrouter.ai/docs
- Railway Hosting: https://railway.app/docs
- Vercel Hosting: https://vercel.com/docs

---

**Last Updated:** January 13, 2026
**Backend Version:** 1.0.0
**API Version:** v1
