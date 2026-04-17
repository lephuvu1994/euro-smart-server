# 3. Target Implementation Phases

Below is the structured roadmap to implement the Voice-to-Text AI Control functionality correctly across the Sensa-Smart backend.

## 🛠 Target Files to Modify

| Service        | File                                                | Description                                                                                                                                                                     |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **core-api**   | `apps/core-api/src/modules/ai/ai.app.controller.ts` | **NEW**: Controller exposing `/v1/app/ai/chat/stream`. Uses `JwtAccessGuard` with `UserRole.USER`.                                                                              |
| **core-api**   | `apps/core-api/src/modules/ai/ai.module.ts`         | Register the new `AiAppController`.                                                                                                                                             |
| **core-api**   | `apps/core-api/src/modules/ai/ai.service.ts`        | Add logic to `chatStream` to accept `user` context and force-inject `userId` into `mcpClient.callTool`. Modify system prompt to mention "You are assisting this specific user". |
| **mcp-server** | `apps/mcp-server/src/tools/device-control.tools.ts` | Implement `userId` Zod payload + DB `ownerId` filtering in all database queries.                                                                                                |
| **mcp-server** | `apps/mcp-server/src/tools/device.tools.ts`         | Implement `userId` Zod payload + DB `ownerId` filtering for device listing.                                                                                                     |
| **mcp-server** | `apps/mcp-server/src/tools/scene.tools.ts`          | Implement `userId` Zod payload + DB `home.ownerId` filtering for scene listing/execution.                                                                                       |

---

## 📅 Execution Plan (Phases)

### Phase 1: Security Foundation (MCP Server Constraints)

- Go into `mcp-server` tools.
- Bind `userId` properties to `get_device_status`, `set_device_entity_value`, `list_devices`, `list_scenes`, `run_scene`.
- Write rigorous unit tests or manual verification ensuring that providing `userId = "X"` strictly rejects `deviceToken = "Y"` if user X does not own Y.

### Phase 2: App Controller & Routing (Core API)

- Create `AiAppController` in `core-api`.
- Expose the streaming endpoint. Require Bearer Token validation.
- Map Swagger API documentation for the mobile team.

### Phase 3: The Interceptor (Core API Service)

- Update `ai.service.ts` to cleanly accept `userContext: { id: string }`.
- Upgrade the `for` loop executing tools to inject `args['userId'] = userContext.id`.
- Adjust system context prompt:
  > _"You are Sena, the friendly AI assistant living inside the user's phone. Use simple, conversational language suitable for voice playback (Text-to-Speech). Do not use markdown tables or complex formatting. Output plain, spoken language."_

### Phase 4: Integration & Mobile E2E Debug

- Use Postman/Curl to hit `/v1/app/ai/chat/stream` with a Bearer token mimicking the mobile app.
- Ask "Hãy tắt tất cả đèn", verify tools are hit and BullMQ tasks are queued exactly as if the user clicked the button on the UI.
