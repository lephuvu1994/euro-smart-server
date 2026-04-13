# Task: Scene Execution Scaling (100k+ Devices)

## Component 1: Database Schema

- [x] Thêm `compiledActions Json?` + `compiledAt DateTime?` vào model Scene
- [x] Thêm `configVersion Int @default(1)` vào model Device
- [x] Tạo model `DeviceGroup` + `DeviceGroupMember`
- [x] Chạy `prisma migrate dev --name scene_compiled_and_groups`

## Component 2: Cron Bulk Enqueue

- [x] Refactor `scene-schedule-cron.service.ts`: bỏ `for await`, thay bằng batch collect
- [x] Implement Redis pipeline cho cooldown check (`MGET` + batch `SET NX`)
- [x] Dùng `deviceControlQueue.addBulk()` cho tất cả matched scenes

## Component 3: Scene Compilation (Hybrid Compiled + Version)

- [x] Thêm `compileSceneActions()` method trong `scene.service.ts`
- [x] Gọi compile khi `createScene()` và `updateScene()` có actions
- [x] Bump `device.configVersion` khi entity commandKey/commandSuffix thay đổi

## Component 4: Scene Executor Refactor (`device-control.processor.ts`)

- [x] 4a. `handleRunScene`: sử dụng `compiledActions` + version check (lazy re-compile)
- [x] 4b. Zero-delay inline execution (bắn MQTT trực tiếp, không tạo sub-job)
- [x] 4c. Delayed sub-jobs embed compiled metadata (handler không query DB)
- [x] 4d. MQTT Group optimization (detect groups → 1 message thay N messages)
- [x] 4e. Dynamic Lock TTL (`max(10, maxDelay/1000 + 15)`)
- [x] 4f. Batch socket emit (`SCENE_EXECUTED` thay vì N × `COMMAND_SENT`)

## Component 5: MQTT Driver Fix

- [x] Fix `setValueBulk`: group entities theo `commandSuffix` trước khi publish
- [x] Thêm `publishToGroup(groupCode, payload)` method

## Component 6: Device Group Management (`core-api`)

- [x] Create `DeviceGroupService` for group CRUD and member management
- [x] Create `DeviceGroupController` endpoints
- [x] Integrate MQTT commands (`join_group`/`leave_group`) on adding/removing members

## Component 7: Firmware Integration (Ai-WB2)

- [x] Add group defines (`MAX_GROUPS`, MQTT topics)
- [x] Implement persistent storage for group codes via EasyFlash JSON
- [x] Implement `app_mqtt_subscribe_group` and auto re-subscribe on boot
- [x] Intercept `device/{token}/config` payload to parse `join_group` commands

## Verification

- [ ] Chạy unit tests: `npx nx test worker-service && npx nx test core-api`
- [ ] Test scene với delay 0s, 5s, 1h
- [ ] Test compiled scene invalidation (đổi commandKey → verify re-compile)
- [ ] Test MQTT Group: 3 devices cùng group, 1 lệnh → cả 3 phản hồi
