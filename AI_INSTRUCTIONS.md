# AI_INSTRUCTIONS — Aurathink Smart Home Server

> **Mục đích:** Mô tả kiến trúc, conventions, và design patterns **THỰC TẾ** đang được sử dụng. AI **PHẢI** tuân theo các quy tắc dưới đây khi code tính năng mới.

---

## 1. Project Overview

| Mục             | Giá trị                                                      |
| --------------- | ------------------------------------------------------------ |
| Architecture    | **NX Monorepo** (3 apps + 3 shared libs)                    |
| Framework       | NestJS 11                                                    |
| Runtime         | Node.js ≥ 22 (Alpine Docker)                                |
| Package Manager | Yarn ≥ 4.9 (Corepack, `.yarnrc.yml`)                        |
| Build System    | **NX 22.5** + Webpack                                       |
| ORM             | Prisma 6 (PostgreSQL + TimescaleDB)                         |
| Queue           | BullMQ (Redis)                                               |
| Cache           | `cache-manager` + `ioredis`                                  |
| Real-time       | MQTT Direct (EMQX WSS, HMAC auth)                            |
| MQTT            | `mqtt` package (kết nối EMQX broker)                         |
| Auth            | Passport JWT (access + refresh tokens), Argon2 hashing       |
| Email           | `@nestjs-modules/mailer` + BullMQ queue                      |
| SMS             | Custom `VietguysService` + `SmsSimService`                   |
| API Docs        | Swagger (`@nestjs/swagger`)                                  |
| Error Tracking  | Sentry                                                       |
| Logger          | `nestjs-pino` (pino + pino-pretty)                           |
| i18n            | `nestjs-i18n`                                                |
| Versioning      | URI-based, default `/v1/`                                    |
| Linting         | ESLint 9 flat config + `@nx/eslint-plugin`                   |
| Formatting      | Prettier (`singleQuote: true`)                               |
| Git Hooks       | Husky + lint-staged + commitlint (conventional commits)      |

---

## 2. Monorepo Structure

```
/
├── apps/                              # Deployable applications
│   ├── core-api/                      # 🌐 REST API chính (port 3001)
│   │   └── src/
│   │       ├── main.ts                # Bootstrap + Swagger setup
│   │       ├── app.module.ts          # Root module
│   │       ├── swagger.ts             # Swagger config
│   │       ├── cli.ts                 # CLI commands (seed:admin)
│   │       ├── controllers/           # Health controllers
│   │       └── modules/               # Business logic modules
│   │           ├── admin/
│   │           ├── device/            # CRUD + control + provisioning
│   │           ├── home/              # Home & Room management
│   │           ├── scene/             # Automation scenes
│   │           └── user/              # User profile
│   ├── iot-gateway/                   # 🔌 MQTT Gateway (port 3003)
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── drivers/               # Protocol drivers
│   │       ├── listeners/             # MQTT inbound message handlers
│   │       ├── interfaces/
│   │       └── registry/
│   └── worker-service/                # ⚙️ Background Workers (port 3004)
│       └── src/
│           ├── main.ts
│           ├── app.module.ts
│           ├── processors/            # BullMQ job processors
│           └── schedulers/            # Cron schedulers
│
├── libs/                              # Shared libraries
│   ├── common/                        # @app/common — Shared infrastructure
│   │   └── src/
│   │       ├── index.ts               # Public API barrel export
│   │       ├── auth/                  # Auth module (controllers, service, DTOs, guards)
│   │       ├── config/                # Config loaders (app, auth, redis, mqtt, sms...)
│   │       ├── constants/             # Global constants (email templates)
│   │       ├── doc/                   # @DocResponse decorator, Swagger helpers
│   │       ├── dtos/                  # Shared DTOs (cross-app)
│   │       ├── enums/                 # App enums (queues, roles, device jobs)
│   │       ├── events/                # Cross-app event publisher (Socket events)
│   │       ├── helper/                # HelperEncryptionService (hash, JWT)
│   │       ├── integration/           # Device drivers (MQTT generic, Zigbee)
│   │       ├── languages/             # i18n translations (vi, en)
│   │       ├── logger/                # Pino logger config
│   │       ├── mcp/                   # MCP module
│   │       ├── message/               # MessageService (i18n translate)
│   │       ├── mqtt/                  # MQTT service (connect EMQX)
│   │       ├── request/               # Guards, Decorators, Middlewares
│   │       ├── response/              # ResponseInterceptor, ExceptionFilter
│   │       ├── sms-sim/               # SMS via SIM module
│   │       ├── templates/             # Email templates (Handlebars)
│   │       └── vietguys/              # SMS via Vietguys API
│   ├── database/                      # @app/database — Prisma wrapper
│   │   └── src/
│   │       ├── database.module.ts
│   │       └── services/              # DatabaseService (extends PrismaClient)
│   └── redis-cache/                   # @app/redis-cache — Redis wrapper
│       └── src/
│           ├── redis.module.ts
│           └── services/              # RedisService (ioredis wrapper)
│
├── prisma/
│   └── schema.prisma                  # Database schema (17+ models)
│
├── docker-compose.prod.yml            # Production (all services)
├── docker-compose.yml                 # Local development
├── docker-compose.vps1.yml            # VPS1 override (Hậu cung)
├── docker-compose.vps2.yml            # VPS2 override (Mặt tiền)
├── Dockerfile                         # Multi-stage build (node:22-alpine)
├── nx.json                            # NX workspace config
├── tsconfig.base.json                 # Root TypeScript config + path aliases
└── package.json                       # Root package.json (scripts, deps)
```

---

## 3. Path Aliases (Import Convention)

Định nghĩa trong `tsconfig.base.json`:

```typescript
// ✅ Preferred (NX convention)
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis-cache';
import { configs, APP_BULLMQ_QUEUES } from '@app/common';

// ✅ Deep import cho sub-modules (khi không export qua barrel)
import { AuthModule } from '@app/common/auth/auth.module';
import { MqttModule } from '@app/common/mqtt/mqtt.module';
import { CustomLoggerModule } from '@app/common/logger/logger.module';

// ✅ Relative import (trong cùng app)
import { UserModule } from './modules/user/user.module';
import { HealthController } from './controllers/health.controller';

// ❌ KHÔNG dùng absolute path cũ
import { DatabaseModule } from 'src/common/database/...';  // SAI
```

| Alias                        | Maps to                     |
| ---------------------------- | --------------------------- |
| `@app/common`                | `libs/common/src/index.ts`  |
| `@app/common/*`              | `libs/common/src/*`         |
| `@app/database`              | `libs/database/src/index.ts`|
| `@app/database/*`            | `libs/database/src/*`       |
| `@app/redis-cache`           | `libs/redis-cache/src/index.ts`|
| `@app/redis-cache/*`         | `libs/redis-cache/src/*`    |
| `@aurathink-server/common`   | `libs/common/src/index.ts`  |
| `@aurathink-server/database` | `libs/database/src/index.ts`|
| `@aurathink-server/redis-cache` | `libs/redis-cache/src/index.ts`|

---

## 4. NX Commands

```bash
# Dev (all services parallel)
yarn dev

# Dev (single service)
yarn dev:core-api
yarn dev:iot-gateway
yarn dev:socket-gateway
yarn dev:worker-service

# Build
yarn build                    # All apps
yarn build:core-api           # Single app

# Lint & Format
yarn lint                     # ESLint all projects
yarn lint:fix                 # Auto-fix
yarn format                   # Prettier

# Database
yarn generate                 # Prisma generate
yarn migrate                  # Prisma migrate dev
yarn studio                   # Prisma Studio
yarn seed:admin               # Seed admin user

# Test
yarn test                     # All tests
```

---

## 5. Apps — Responsibilities

| App | Port | Vai trò | Key Imports |
|-----|------|---------|-------------|
| **core-api** | 3001 | REST API chính: auth, user, device, home, scene, EMQX auth/ACL | Database, Redis, Auth, BullMQ (tất cả queues) |
| **iot-gateway** | 3003 | Nhận MQTT messages từ thiết bị IoT, dispatch BullMQ jobs | Database, Redis, MQTT, BullMQ, IntegrationModule |
| **worker-service** | 3004 | Background jobs: email, device control, cron schedulers | Database, Redis, BullMQ, ScheduleModule, IntegrationModule |

### Cross-app Communication

```
                    ┌─────────────────────┐
                    │     Redis (BullMQ)   │
                    │   Redis (Pub/Sub)    │
                    └─────┬───────┬───────┘
                          │       │
   ┌──────────┐    ┌──────▼──┐  ┌─▼──────────┐    ┌────────────┐
   │ core-api │───▶│ BullMQ  │  │ Redis Sub  │◀───│ iot-gateway│
   │ (REST)   │    │ Queues  │  │            │    │ (MQTT)     │
   └──────────┘    └────┬────┘  └─────┬──────┘    └────────────┘
                        │             │
                   ┌────▼─────┐  ┌────▼──────────┐
                   │ worker   │  │ socket-gateway│
                   │ (Jobs)   │  │ (WebSocket)   │
                   └──────────┘  └───────────────┘
```

- **core-api → worker-service**: BullMQ queues (`email_queue`, `device_controll`, `device_status`)
- **iot-gateway → worker-service**: BullMQ queues (device status, control)
- **iot-gateway ↔ EMQX**: MQTT protocol (subscribe/publish device topics)
- **EMQX → App (WSS)**: Direct MQTT over WebSocket (HMAC auth)

---

## 6. Libs — Shared Code

### `@app/common` — Infrastructure Layer

**KHÔNG chứa business logic.** Chứa:
- Auth (controllers, services, guards, DTOs)
- Config loaders (app, auth, redis, mqtt, sms, doc, mcp)
- Enums & Constants
- Shared DTOs (cross-app response DTOs)
- Events (SocketEventPublisher)
- Helper (encryption, JWT token generation)
- Integration (device drivers: MQTT generic, Zigbee)
- i18n (languages: vi, en)
- Logger (pino)
- MQTT service
- Request infrastructure (guards, decorators, middlewares)
- Response infrastructure (interceptor, exception filter)
- SMS modules (SIM, Vietguys)
- Email templates (Handlebars)

### `@app/database` — Prisma ORM Wrapper

- `DatabaseModule` — NestJS module (Global)
- `DatabaseService` — extends `PrismaClient`, injectable

### `@app/redis-cache` — Redis Wrapper

- `RedisModule` — NestJS module
- `RedisService` — ioredis wrapper, injectable

---

## 7. Coding Conventions

### 7.1 Naming

| Loại       | Convention                         | Ví dụ                                    |
| ---------- | ---------------------------------- | ---------------------------------------- |
| File       | `kebab-case`                       | `device.service.ts`, `auth.login.dto.ts` |
| Class      | `PascalCase`                       | `DeviceService`, `UserCreateDto`         |
| Interface  | `I` prefix + `PascalCase`          | `IAuthService`, `IDeviceDriver`          |
| Enum       | `PascalCase` hoặc `UPPER_SNAKE`    | `APP_BULLMQ_QUEUES`, `DEVICE_JOBS`      |
| DTO        | `PascalCase` + suffix `Dto`        | `UserLoginDto`, `AuthResponseDto`        |
| Controller | `PascalCase` + suffix `Controller` | `AuthPublicController`                   |
| Service    | `PascalCase` + suffix `Service`    | `AuthService`, `DatabaseService`         |
| Module     | `PascalCase` + suffix `Module`     | `AuthModule`, `DeviceModule`             |

### 7.2 Module Pattern (Business Modules)

Mỗi module trong `apps/*/src/modules/` tuân theo:

```
modules/{name}/
├── {name}.module.ts           # Module definition
├── controllers/
│   └── {name}.controller.ts   # REST endpoints
├── services/
│   └── {name}.service.ts      # Business logic
├── dto/
│   ├── {action}-{name}.dto.ts # Request DTOs
│   └── {name}.response.dto.ts # Response DTOs
└── interfaces/                # (Optional)
```

### 7.3 Controller Pattern

```typescript
@ApiTags('public.auth')
@Controller({ version: '1', path: '/auth' })
export class AuthPublicController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @PublicRoute()
  @DocResponse({
    serialization: AuthResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'auth.login.success',
  })
  public login(@Body() payload: UserLoginDto): Promise<AuthResponseDto> {
    return this.authService.login(payload);
  }
}
```

**Key decorators:**
- `@PublicRoute()` — bypass JWT guard
- `@DocResponse({ serialization, httpStatus, messageKey })` — Swagger + response metadata
- `@AuthUser()` — inject authenticated user
- `@Roles(UserRole.ADMIN)` — role-based access

### 7.4 DTO Pattern

**Request DTO** (class-validator):
```typescript
export class UserCreateDto {
  @ApiProperty({ description: 'Email hoặc SĐT', example: 'user@email.com' })
  @IsString()
  @IsNotEmpty({ message: 'Email hoặc SĐT không được để trống' })
  public identifier: string; // ← dùng 'identifier' (không phải 'email')
}
```

**Response DTO** (`@Expose` whitelist):
```typescript
export class UserResponseDto {
  @Expose() id: string;
  @Expose() email: string | null;
  @Exclude() password?: string; // KHÔNG BAO GIỜ return
}
```

> Response luôn qua `plainToInstance(DTO, data, { excludeExtraneousValues: true })`.

### 7.5 API Response Format

```json
// Success
{ "statusCode": 200, "message": "auth.login.success", "timestamp": "...", "data": { ... } }

// Error
{ "statusCode": 400, "message": "Translated error message", "timestamp": "..." }
```

```typescript
// Ném lỗi — message key sẽ được auto-translate bởi ExceptionFilter
throw new HttpException('user.error.userExists', HttpStatus.CONFLICT);
```

---

## 8. Database (Prisma)

### Schema domains (17+ models):

| Domain | Models |
|--------|--------|
| User & Auth | `User`, `Session` |
| Catalog & Partner | `Partner`, `DeviceModel`, `LicenseQuota`, `HardwareRegistry` |
| Device | `Device`, `DeviceFeature`, `DeviceFeatureState`, `DeviceParam`, `DeviceShare` |
| Home & Room | `Home`, `Floor`, `HomeMember`, `Room` |
| Misc | `Service`, `Scene`, `Location`, `Calendar`, `CalendarEvent`, `SystemConfig` |
| Provision | `ProvisionToken` |

### Convention:
```typescript
// Inject DatabaseService
constructor(private readonly db: DatabaseService) {}

// Query
const devices = await this.db.device.findMany({
  where: { ownerId: userId },
  include: { features: true },
  orderBy: { createdAt: 'desc' },
});
```

- Table names: `@@map("t_table_name")`
- Column names: `@map("snake_case")`
- IDs: UUID (`@db.Uuid`)

---

## 9. BullMQ Queues

| Queue | Producers | Consumer |
|-------|-----------|----------|
| `email_queue` | core-api | worker-service (`EmailProcessorWorker`) |
| `device_controll` | core-api, iot-gateway | worker-service (`DeviceControlProcessor`) |
| `device_status` | iot-gateway | worker-service |

```typescript
await this.emailQueue.add(EmailTemplate.WELCOME, payload, {
  removeOnComplete: true,
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
});
```

---

## 10. TypeScript Config

```json
// tsconfig.base.json (root)
{
  "compilerOptions": {
    "module": "esnext",
    "target": "es2015",
    "emitDecoratorMetadata": true,    // Bắt buộc cho NestJS DI
    "experimentalDecorators": true,   // Bắt buộc cho NestJS decorators
    "esModuleInterop": true,
    "baseUrl": ".",
    "paths": { "@app/common": [...], "@app/database": [...], "@app/redis-cache": [...] }
  }
}
```

Each app extends `tsconfig.base.json` with its own `tsconfig.app.json`.

---

## 11. ESLint & Formatting

- **ESLint**: Flat config (`eslint.config.mjs`) with `@nx/eslint-plugin`
- **Rule**: `@nx/enforce-module-boundaries` — enforces lib dependency constraints
- **Prettier**: `singleQuote: true` (default everything else)
- **Git hooks**: Husky + lint-staged + commitlint (conventional commits: `feat:`, `fix:`, `chore:`)

---

## 12. Docker & Deployment

### Build
```dockerfile
# Multi-stage: node:22-alpine
# Stage 1 (builder): yarn install → prisma generate → yarn build (all apps)
# Stage 2 (production): Copy node_modules + prisma + dist → tini entrypoint
```

### Output structure
```
dist/
├── apps/
│   ├── core-api/main.js
│   ├── iot-gateway/main.js
│   ├── socket-gateway/main.js
│   └── worker-service/main.js
```

### Docker Compose (GĐ1 — Single Node)
```bash
docker compose -f docker-compose.prod.yml up -d
```

Infrastructure: PostgreSQL (TimescaleDB), Redis, EMQX, Nginx. App services override `CMD` per service.

---

## 13. Khi Tạo Feature Mới — Checklist

1. Xác định feature thuộc app nào (`core-api` / `iot-gateway` / `socket-gateway` / `worker-service`)
2. Nếu là shared code → đặt trong `libs/common/src/` và export qua `index.ts`
3. Tạo module trong `apps/{app}/src/modules/{feature}/`
4. Tạo DTO (request + response) với class-validator + Swagger decorators
5. Implement service (inject `DatabaseService`, `RedisService`, etc.)
6. Tạo controller với `@DocResponse`, `@ApiOperation`, `@PublicRoute` (nếu cần)
7. Register module trong app's `AppModule`
8. Thêm i18n keys trong `libs/common/src/languages/`
9. Chạy `yarn lint` để kiểm tra
10. Nếu cần background job: tạo processor trong `worker-service`, thêm BullMQ queue

### Quy tắc quan trọng:

- **`libs/` = infrastructure**, KHÔNG chứa business logic
- **`apps/*/modules/` = domain logic**, mỗi module tự chứa controller → service → dto
- Import shared code qua `@app/common`, `@app/database`, `@app/redis-cache`
- KHÔNG import trực tiếp giữa các apps (dùng BullMQ / Redis Pub-Sub)
