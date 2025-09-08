# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

This is a NestJS API for JoynOS, an event-based social platform. The architecture follows NestJS module patterns with these core domains:

- **Authentication**: JWT-based auth with phone verification support
- **Events**: Event management with AI-powered recommendations, member management, and voting systems
- **Users**: User profiles with interests, quiz results, and location-based features
- **AI/Matching**: Event recommendations using embeddings and compatibility scoring
- **Ingestion**: External event data ingestion (NYC events) with AI processing
- **Database**: PostgreSQL with Prisma ORM, Redis for queuing

Key architectural patterns:

- Controllers handle HTTP requests with Swagger documentation
- Services contain business logic
- Repositories handle data access
- Guards for authentication and authorization (JwtAuthGuard, MembershipGuard)
- Interceptors for idempotency and other cross-cutting concerns
- CLI module for data ingestion and AI processing tasks

## Development Commands

### Core Development

- `npm run start:dev` - Start in watch mode
- `npm run build` - Build the application
- `npm run lint` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check formatting without fixing

### Testing

- `npm run test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:cov` - Run tests with coverage
- `npm run test:e2e` - Run end-to-end tests

### Database

- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Deploy migrations
- `npm run prisma:push` - Push schema to database
- `npm run prisma:studio` - Open Prisma Studio

### Docker

- `npm run dev:up` - Start development environment with Docker Compose
- `npm run dev:down` - Stop development environment
- `npm run build:dev` - Build development Docker image
- `npm run build:prod` - Build production Docker image

### CLI Tasks

- `npm run cli` - Run CLI commands (see src/cli/runner.ts)
- `npm run ingest:nyc` - Ingest NYC events data
- `npm run events:ai:build-plans` - Generate AI plans for events

## Database Schema

The system uses PostgreSQL with these key entities:

- **User**: Profiles with interests, location, AI embeddings
- **Event**: Events with plans, members, voting, and AI metadata
- **Interest**: Categorization system with user/event associations
- **Quiz**: Personality assessment system
- **Member**: Event membership with status tracking
- **Plan**: Event plans with voting system

## Environment Setup

Development environment uses Docker Compose with:

- PostgreSQL on port 5434
- Redis on port 6379
- Yarn as package manager

## Key Integration Points

- **AI Service**: Google Generative AI for event analysis and recommendations
- **Mapbox**: Location services (lib/mapbox.ts)
- **BullMQ**: Job queuing with Redis
- **Prisma**: Database ORM with custom repositories

## Testing Strategy

- Unit tests with Jest in src/ directory
- E2E tests in test/ directory using Supertest
- Coverage reports generated to coverage/ directory
