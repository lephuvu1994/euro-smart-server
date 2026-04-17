# 2. MCP Permission & Tool Boundary Specification

To support multi-tenant end-user AI, the existing Admin-focused MCP tools must become "Context-Aware". If `userId` is passed, the tool switches to End-User mode safely blocking cross-tenant access.

## Target Tool Schema Updates

All Device and Scene tools will receive a new optional Zod parameter:

```typescript
userId: z.string().optional().describe('Inject by AiService. If present, enforces DB ownership rules'),
```

### 1. `list_devices` (Device Tools)

- **Current DB Call**: `prisma.device.findMany({ where: { partnerCode, modelCode } })`
- **Updated DB Call**:
  ```typescript
  prisma.device.findMany({
    where: {
      partnerCode,
      modelCode,
      ...(userId ? { ownerId: userId } : {}), // 🔒 RLS Enforcement
    },
  });
  ```
- **Impact**: End-user asking "Nhà tôi có mấy thiết bị" only sees their own.

### 2. `set_device_entity_value` (Device Control Tools)

- **Current**: Validates UUID token. BullMQ Job logged as `userId: 'admin-ai'`.
- **Updated**:
  ```typescript
  const device = await prisma.device.findFirst({
    where: {
      token: deviceToken,
      ...(userId ? { ownerId: userId } : {}),
    },
  });
  if (!device) return 'Access Denied / Not Found';
  ```
- **BullMQ Payload**: `userId: userId || 'admin-ai'` (Identifies the exact user issuing the voice command!)

### 3. `list_scenes` & `run_scene` (Scene Tools)

- **Current DB Call**: `prisma.scene.findMany({ take: 20 })`
- **Updated DB Call**:
  ```typescript
  prisma.scene.findMany({
    where: {
      ...(userId ? { home: { ownerId: userId } } : {}),
    },
  });
  ```
  _(Note: Scenes are tied to `Home`, so we verify the user owns the `Home` the scene runs in)._

## AiService Function Interception

To ensure Gemini doesn't try to forge a `userId` (or forget to include it), `AiService` forces it dynamically:

```typescript
// Inside AiService.ts -> chatStream() logic
for (const call of functionCalls) {
  const args = call.args as Record<string, any>;
  if (userContext) {
    args['userId'] = userContext.id; // 🔥 Overrides anything Gemini tries to provide!
  }
  const mcpResult = await this.mcpClient!.callTool({ name: call.name, arguments: args });
}
```

This guarantees an impenetrable privilege boundary.
