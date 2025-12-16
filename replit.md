# Invoice Manager - HubSpot CRM Extension

## Overview

Invoice Manager is a private HubSpot CRM extension that adds a custom tab to Company records. The application allows users to mark companies as "bad debt" via a toggle switch and displays associated deals and invoices in tabular format. The backend communicates with HubSpot's API using a Private App Access Token to update company properties.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with custom configuration
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom HubSpot Canvas design system tokens
- **Design System**: Follows HubSpot Canvas guidelines for visual consistency within the CRM ecosystem

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript compiled with tsx
- **API Structure**: RESTful endpoints under `/api/*` prefix
- **Key Endpoints**:
  - `GET /api/health` - Health check with HubSpot connection status
  - `POST /api/mark-bad-debt` - Updates company bad_debt property in HubSpot

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts`
- **Validation**: Zod schemas for request/response validation
- **Current Storage**: In-memory storage implementation (MemStorage class) with interface for future database integration

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
│   ├── routes.ts     # API route definitions
│   └── storage.ts    # Data storage interface
├── shared/           # Shared types and schemas
└── migrations/       # Drizzle database migrations
```

### Build System
- Development: tsx for direct TypeScript execution
- Production: esbuild bundles server, Vite bundles client
- Output: `dist/` directory with `index.cjs` and `public/` folder

## External Dependencies

### HubSpot Integration
- **Package**: `@hubspot/api-client` for CRM API communication
- **Authentication**: Private App Access Token via `HS_PRIVATE_APP_TOKEN` environment variable
- **Scope Required**: `crm.objects.companies.write`
- **Usage**: Updates company properties (specifically `bad_debt` checkbox field)

### Database
- **ORM**: Drizzle ORM configured for PostgreSQL
- **Connection**: `DATABASE_URL` environment variable
- **Session Store**: connect-pg-simple for session management (available but not currently active)

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `HS_PRIVATE_APP_TOKEN` - HubSpot Private App token for API access