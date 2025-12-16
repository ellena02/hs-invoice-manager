# Invoice Manager - HubSpot CRM Extension

## Overview

Invoice Manager is a HubSpot CRM extension that adds a custom tab to Company records. The application allows users to archive overdue, unpaid invoices on a per-invoice basis. Each overdue invoice has a "Mark Bad Debt" action button that archives the invoice and marks the company with a bad debt flag.

**App Type**: Public App (OAuth 2.0) - deployable on Render or any hosting platform

## User Preferences

Preferred communication style: Simple, everyday language.

## Invoice Logic

- **Statuses**: draft, open, paid, voided (HubSpot standard)
- **Overdue Calculation**: An invoice is overdue when status is "open" AND due_date < today
- **Bad Debt Action**: Marks the company with a bad_debt flag (does not archive invoices)

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with custom configuration
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom HubSpot Canvas design system tokens
- **Design System**: Follows HubSpot Canvas guidelines for visual consistency

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript compiled with tsx
- **API Structure**: RESTful endpoints under `/api/*` prefix
- **Authentication**: OAuth 2.0 (Public App) with automatic token refresh

### Key Endpoints

#### OAuth Endpoints
- `GET /auth/hubspot` - Initiates OAuth authorization flow
- `GET /auth/hubspot/callback` - Handles OAuth callback and token exchange
- `GET /auth/status` - Check connection status
- `POST /auth/disconnect` - Disconnect/logout from HubSpot

#### API Endpoints
- `GET /api/health` - Health check with connection status
- `GET /api/company/:companyId` - Fetch company data with deals and invoices
- `POST /api/mark-bad-debt` - Updates company bad_debt property

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts`
- **Token Storage**: `hubspot_tokens` table for OAuth tokens per portal
- **Validation**: Zod schemas for request/response validation

### Project Structure
```
├── client/           # React frontend application
│   └── src/
│       ├── components/ui/  # shadcn/ui components
│       ├── pages/          # Route components
│       ├── hooks/          # Custom React hooks
│       └── lib/            # Utilities and query client
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API route definitions (includes OAuth)
│   └── storage.ts    # Token storage interface
├── shared/           # Shared types and schemas
└── migrations/       # Drizzle database migrations
```

### Build System
- Development: tsx for direct TypeScript execution
- Production: esbuild bundles server, Vite bundles client
- Output: `dist/` directory with `index.cjs` and `public/` folder

## Environment Variables

### Required for OAuth (Public App)
- `HUBSPOT_CLIENT_ID` - HubSpot OAuth App Client ID
- `HUBSPOT_CLIENT_SECRET` - HubSpot OAuth App Client Secret
- `HUBSPOT_REDIRECT_URI` - OAuth callback URL (e.g., https://your-app.onrender.com/auth/hubspot/callback)

### Optional (Backwards Compatible)
- `HS_PRIVATE_APP_TOKEN` - Private App token (fallback if OAuth not configured)

### Database
- `DATABASE_URL` - PostgreSQL connection string

### Other
- `SESSION_SECRET` - Session encryption key

## HubSpot App Setup (Public App)

1. Go to HubSpot Developer Portal > Apps > Create App
2. Configure OAuth:
   - Redirect URL: `https://your-domain.com/auth/hubspot/callback`
   - Scopes: `crm.objects.companies.read`, `crm.objects.companies.write`, `crm.objects.deals.read`, `crm.objects.invoices.read`, `crm.objects.invoices.write`
3. Copy Client ID and Client Secret to environment variables

## Deployment on Render

1. Create Web Service on Render
2. Connect your Git repository
3. Set environment variables:
   - `HUBSPOT_CLIENT_ID`
   - `HUBSPOT_CLIENT_SECRET`
   - `HUBSPOT_REDIRECT_URI` (your Render URL + `/auth/hubspot/callback`)
   - `DATABASE_URL` (Render Postgres or external)
   - `SESSION_SECRET`
4. Build Command: `npm run build`
5. Start Command: `npm start`
