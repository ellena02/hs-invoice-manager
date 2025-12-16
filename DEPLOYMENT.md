# Deployment Guide - HubSpot Invoice Manager

## Project Structure

```
invoice-manager/
├── client/                    # Frontend React aplikacija
│   └── src/
│       ├── components/ui/     # UI komponente (shadcn)
│       ├── pages/             # Stranice aplikacije
│       ├── hooks/             # React hooks
│       └── lib/               # Utilities
├── server/                    # Backend Express server
│   ├── index.ts               # Entry point servera
│   ├── routes.ts              # API rute + OAuth
│   └── storage.ts             # Token storage
├── shared/                    # Deljeni tipovi
│   └── schema.ts              # Database schema + tipovi
├── migrations/                # Database migracije
├── package.json               # Dependencies
├── vite.config.ts             # Vite konfiguracija
├── drizzle.config.ts          # Drizzle ORM config
└── DEPLOYMENT.md              # Ovaj fajl
```

## HubSpot App Setup

### 1. Kreiranje HubSpot App-a

1. Idi na https://developers.hubspot.com/
2. Uloguj se i idi na "Apps" > "Create app"
3. Izaberi "Public app"
4. Popuni osnovne informacije:
   - App name: Invoice Manager
   - Description: Archive overdue invoices and mark bad debt

### 2. OAuth Konfiguracija (u HubSpot Developer Portal)

1. U app settings, idi na "Auth" tab
2. Dodaj Redirect URL:
   ```
   https://your-app-name.onrender.com/auth/hubspot/callback
   ```
3. Izaberi Scopes:
   - `crm.objects.companies.read`
   - `crm.objects.companies.write`
   - `crm.objects.deals.read`
   - `crm.objects.invoices.read`
   - `crm.objects.invoices.write`
4. Kopiraj **Client ID** i **Client Secret**

### 3. HubSpot Custom Property

Kreiraj custom property na Company objektu:
- Name: `bad_debt`
- Type: Single checkbox
- Group: Company information

## Render Deployment

### 1. Priprema

1. Push kod na GitHub/GitLab
2. Kreiraj nalog na https://render.com

### 2. Kreiranje Web Service-a

1. U Render dashboard, klikni "New +" > "Web Service"
2. Poveži GitHub repo
3. Konfiguriši:
   - **Name**: invoice-manager (ili tvoj izbor)
   - **Region**: Frankfurt (EU) ili Oregon (US)
   - **Branch**: main
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

### 3. Environment Variables (OBAVEZNO)

U Render dashboard, dodaj ove environment varijable:

| Variable | Opis | Primer |
|----------|------|--------|
| `HUBSPOT_CLIENT_ID` | Client ID iz HubSpot app settings | `xxxxxxxx-xxxx-xxxx-xxxx` |
| `HUBSPOT_CLIENT_SECRET` | Client Secret iz HubSpot app settings | `xxxxxxxx-xxxx-xxxx-xxxx` |
| `HUBSPOT_REDIRECT_URI` | Tvoj Render URL + callback path | `https://invoice-manager.onrender.com/auth/hubspot/callback` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | Random string za session encryption | `your-random-secret-string-here` |

### 4. Database (PostgreSQL)

**Opcija A: Render PostgreSQL**
1. U Render, klikni "New +" > "PostgreSQL"
2. Kreiraj bazu
3. Kopiraj "Internal Database URL" u `DATABASE_URL`

**Opcija B: Neon (besplatno)**
1. Idi na https://neon.tech
2. Kreiraj projekat
3. Kopiraj connection string u `DATABASE_URL`

### 5. Deploy

1. Klikni "Create Web Service"
2. Sačekaj da se build završi (5-10 minuta)
3. Tvoja aplikacija je dostupna na: `https://your-app-name.onrender.com`

## Testiranje OAuth Flow-a

1. Otvori: `https://your-app-name.onrender.com/auth/hubspot`
2. Autorizuj aplikaciju u HubSpot-u
3. Bićeš redirectovan nazad sa `?portalId=xxx&connected=true`

## API Endpoints

| Endpoint | Method | Opis |
|----------|--------|------|
| `/auth/hubspot` | GET | Pokreće OAuth flow |
| `/auth/hubspot/callback` | GET | OAuth callback |
| `/auth/status` | GET | Status konekcije |
| `/api/health` | GET | Health check |
| `/api/company/:id` | GET | Dohvata kompaniju sa deals/invoices |
| `/api/mark-bad-debt` | POST | Markira kompaniju kao bad debt |

## Troubleshooting

### "OAuth not configured" error
- Proveri da su `HUBSPOT_CLIENT_ID` i `HUBSPOT_CLIENT_SECRET` postavljeni

### "Invalid redirect URI" error
- Proveri da `HUBSPOT_REDIRECT_URI` tačno odgovara URL-u u HubSpot app settings

### Database connection error
- Proveri `DATABASE_URL` format
- Za Render PostgreSQL, koristi "Internal Database URL"

## Local Development

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your values

# Run migrations
npm run db:push

# Start development server
npm run dev
```

Server će biti dostupan na http://localhost:5000
