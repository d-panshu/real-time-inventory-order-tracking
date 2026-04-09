# Real-Time Inventory / Order Tracking System

Production-grade microservices system with event-driven architecture.

## Architecture

```
React Dashboard
      ↓
API Gateway (Port 5000)
      ↓
┌──────────────────────────────┐
│  Auth Service    (Port 5004) │
│  Order Service   (Port 5001) │
│  Inventory Svc   (Port 5003) │
└──────────────────────────────┘
      ↓
Kafka (Event Streaming)
      ↓
WebSocket Service (Port 5002)
      ↓
PostgreSQL + Redis
```

## Quick Start

```bash
# 1. Start all infrastructure + services
docker compose -f infra/docker-compose.yml up --build

# 2. Start frontend (separate terminal)
cd frontend && npm install && npm start
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| API Gateway | 5000 | Central entry point, auth, routing |
| Order Service | 5001 | Order CRUD + status updates |
| WebSocket Service | 5002 | Real-time push to clients |
| Inventory Service | 5003 | Stock management |
| Auth Service | 5004 | JWT auth, RBAC |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Caching + sessions |
| Kafka | 9092 | Event streaming |

## API Endpoints (via Gateway on :5000)

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`

### Orders
- `POST /api/orders`
- `GET /api/orders`
- `GET /api/orders/:id`
- `PATCH /api/orders/:id/status`

### Inventory
- `GET /api/inventory`
- `POST /api/inventory`
- `PATCH /api/inventory/:id`

## Roles
- `buyer` — track orders
- `seller` — update order/inventory status
- `admin` — full access


