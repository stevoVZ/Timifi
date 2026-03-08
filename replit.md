# Recruitment Portal

Labour hire agency management portal for contractors, timesheets, invoicing, and payroll.

## Architecture

- **Frontend**: React + TypeScript with Vite, Tailwind CSS, shadcn/ui components, wouter routing
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Fonts**: DM Sans + DM Mono

## Key Features

- **Dashboard**: KPI overview with active contractors, timesheets due, outstanding invoices, next pay run
- **Contractors**: List, search, filter by status, add new, detail view with timesheet history
- **Timesheets**: Create, view by status tabs (pending/approved/drafts/rejected), approve/reject workflow
- **Payroll**: Current pay run overview, pay run history with gross/PAYG/super/net breakdown
- **Invoices**: Create, track by status (outstanding/paid/draft), send/mark paid workflow

## File Structure

```
client/src/
  App.tsx                     - Main app with sidebar layout and routing
  components/
    app-sidebar.tsx           - Navigation sidebar
    top-bar.tsx               - Page header component
    status-badge.tsx          - Reusable status badge
  pages/
    dashboard.tsx             - Dashboard with KPIs and quick links
    contractors.tsx           - Contractor list with search/filter
    contractor-detail.tsx     - Individual contractor view
    timesheets.tsx            - Timesheet management with tabs
    payroll.tsx               - Pay run overview
    invoices.tsx              - Invoice management

server/
  index.ts                    - Express server setup with seed
  routes.ts                   - API routes for all entities
  storage.ts                  - Database storage layer with Drizzle
  db.ts                       - Database connection
  seed.ts                     - Seed data for development

shared/
  schema.ts                   - Drizzle schema with all tables and types
```

## Database Tables

- `contractors` - Contractor profiles with clearance, rates, employment details
- `timesheets` - Monthly timesheet records with hours and status workflow
- `invoices` - Invoice records with GST calculations and status tracking
- `pay_runs` - Payroll run records with PAYG/super breakdowns

## Design System

- Uses DM Sans for body text, DM Mono for numerical values
- shadcn/ui components with custom elevation system (hover-elevate)
- Responsive layout with sidebar navigation
