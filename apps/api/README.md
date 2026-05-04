# Clinch API Server

Web3 escrow platform backend API built with Express.js, TypeScript, and Drizzle ORM.

## Tech Stack

- **Runtime:** Node.js 20, TypeScript (strict mode)
- **Framework:** Express.js
- **Database:** PostgreSQL via Neon
- **ORM:** Drizzle ORM (postgres-js driver)
- **Blockchain:** viem
- **Auth:** SIWE (Sign-In with Ethereum) + JWT
- **Email:** Resend SDK
- **Realtime:** Socket.IO
- **Validation:** Zod

## Project Setup

```bash
# Install dependencies
npm install

# Copy environment file and fill in values
cp .env.example .env

# Generate Drizzle migrations
npm run generate

# Apply migrations
npm run migrate

# Start development server
npm run dev
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
DATABASE_URL=postgresql://user:password@host.neon.tech/clinch?sslmode=require
RPC_URL=https://rpc-testnet.arcana.technology
WS_RPC_URL=wss://rpc-testnet.arcana.technology/ws
CONTRACT_ADDRESS=0x...
ADMIN_WALLET=0x...
JWT_SECRET=your-super-secret-jwt-key
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@clinch.app
FRONTEND_URL=http://localhost:3000
PORT=4000
```

## API Endpoints

### Auth
- `GET /api/auth/nonce?address=0x...` - Get nonce for SIWE
- `POST /api/auth/verify` - Verify SIWE message and get JWT
- `POST /api/auth/logout` - Logout (no-op with JWT)

### Users (protected)
- `GET /api/users/me` - Get current user
- `PATCH /api/users/me` - Update user profile
- `GET /api/users/:address/deals` - Get user's deals

### Deals (public reads, protected writes)
- `GET /api/deals` - List deals (paginated, filterable)
- `GET /api/deals/:onChainId` - Get deal details
- `GET /api/deals/invite/:token` - Resolve invite token
- `POST /api/deals/metadata` - Update deal metadata

### Disputes (protected)
- `GET /api/disputes/pending` - Get pending disputes
- `POST /api/disputes/:onChainId/raise` - Raise a dispute

### Arbitration (protected)
- `GET /api/disputes/arbitration/pending` - Get pending arbitrations
- `POST /api/disputes/arbitration/:onChainId/rule` - Submit ruling

## Available Scripts

```bash
npm run dev      # Start development server with hot reload
npm run build    # Compile TypeScript
npm run start    # Start production server
npm run migrate  # Run database migrations
npm run generate # Generate migration files
```

## Architecture

```
src/
├── config/          # Environment validation and DB setup
├── db/
│   ├── schema/      # Drizzle ORM table definitions
│   └── migrate.ts    # Migration runner
├── modules/
│   ├── auth/        # SIWE + JWT authentication
│   ├── users/        # User management
│   ├── deals/        # Deal CRUD operations
│   ├── disputes/     # Dispute handling
│   └── notifications/ # Email notifications
├── blockchain/
│   ├── contract.ts   # Viem client and ABI
│   ├── listener.ts   # WebSocket event listener
│   └── handlers/     # Event handlers
├── socket/          # Socket.IO gateway
├── middleware/       # Error handling and validation
├── app.ts           # Express app setup
└── server.ts        # HTTP server entry point
```

## Socket.IO Events

Clients can emit:
- `join-deal` with `{ onChainId }` - Join deal room
- `leave-deal` with `{ onChainId }` - Leave deal room

Server emits:
- `deal-updated` - Real-time deal updates

## License

MIT
