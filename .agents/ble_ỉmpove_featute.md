Implement Multi-Device BLE Fallback Control (Connect-on-Demand)
This plan details the end-to-end implementation for allowing the app to control devices via BLE when the primary network (MQTT/Wi-Fi) is unavailable. The solution leverages a connect-on-demand startegy from the app to handle multiple devices, MAC address matching for device identification, and tracking of BLE events for timeline history.

User Review Required
IMPORTANT

Please review the App BLE queueing mechanism carefully. We are using a BleCommandQueue to serialize connection attempts, ensuring only one device connects at a time due to BL602 limitations.

Security Note: Does the app already securely store the BLE encryption key (APP_AES_SECRET_KEY) for these encrypted writes?

Proposed Changes

1. Chip Firmware (C)
   [MODIFY] app*ble.c (file:///Users/hamai/Documents/smarthome/smarthome-ai-thinker-chip/Ai-WB2_Series-main/applications/smarthome/switch_door/switch_door/connectivity/app_ble.c)
   Change app_ble_start: Alter the BLE advertisement name based on provisioned state. If provisioned (has Wi-Fi MAC or token identifier), broadcast "BKT*" + MAC (last 6 bytes/12 chars). Unprovisioned remains "BKTech_1001".
   Modify door_write_handler: Ensure the AES decrypted payload can properly map "cmd": "OPEN" (and others) to app_door_controller_core_execute_cmd_string(cmd, "ble").
   Advertising Strategy: Ensure the chip automatically resumes advertising after being disconnected by the app so it's ready for the next command.
   [MODIFY] app_door_controller_core.c (file:///Users/hamai/Documents/smarthome/smarthome-ai-thinker-chip/Ai-WB2_Series-main/applications/smarthome/switch_door/switch_door/core/app_door_controller_core.c)
   Pass "ble" as the source string down the chain so notify_status_change emits source: "ble" in its MQTT payload. (The core signature app_door_controller_core_execute_cmd_string(const char* cmd, const char* source) already supports this, just ensure the flow propagates it correctly).
2. App (React Native)
   [NEW] src/lib/ble-control.ts
   Create BleSessionManager and BleCommandQueue.
   BleCommandQueue: Serializes BLE connects/writes/disconnects. Ensures only one BLE connection at a time.
   BleSessionManager: Caches { session, nonce } mapping to macAddress to speed up reconnections by skipping handshake if possible. (Note: Initial implementation might just do full handshake every time for simplicity if caching fails due to chip reboot/session reset).
   [NEW] src/hooks/use-ble-nearby.ts
   Implement a hook for scanning background BLE devices when the user is on the Home, Room Detail, or Device Detail screens.
   Match logic: Extract the suffix from "BKT\_{SUFFIX}" and compare it against device.identifier.replace(/:/g, '').
   Keep a real-time list of availableBleDevices: Map<deviceId, string /_ peripheral.id _/>.
   [MODIFY] src/features/devices/components/hooks/use-device-control.ts (file:///Users/hamai/Documents/smarthome/eec-app-smarthome/src/features/devices/components/hooks/use-device-control.ts)
   Consume useBleNearby().
   Check if availableBleDevices.has(device.id).
   If YES: Instead of calling deviceService.setEntityValue(...), push the command to bleCommandQueue.enqueue(device.id, { cmd: 'OPEN' }).
   If NO: Fallback to the existing deviceService.setEntityValue (MQTT).
3. Server (NestJS)
   [MODIFY] worker-service (or iot-gateway) (MQTT Handler)
   The server currently parses incoming { "state": 1, ... } payloads.
   It needs to ingest the source field. If source === 'ble', ensure it creates an EntityStateHistory record with source: EDeviceTimelineSource.App (or a specific BLE source if defined in the enum, but 'App' or 'ble' works). This ensures the timeline displays "Action via Bluetooth".
   Open Questions
   MAC Case Format: device.identifier from the API usually comes in AA:BB:CC:DD:EE:FF. The BLE name will omit colons "BKT_AABBCCDDEEFF". I will implement the regex/replace matching on the app side to handle this. Is this acceptable?
   BLE Name Limitation: The BLE local name needs to fit in the advertising packet. "BKT_AABBCCDDEEFF" is 16 characters. This is well within the 29-byte safe limit.
   Verification Plan
   Automated Tests
   Server side unit tests checking that incoming MQTT strings with "source": "ble" correctly parse and save the source to the timeline DB.
   Manual Verification
   App Side: Navigate to device details, turn off Wi-Fi on the chip. Tap toggle button "OPEN". Observe the app queuing the command over BLE, connecting, sending data, and reverting to advertising.
   Timeline: Check the device timeline to verify the entry shows it was triggered via "ble".
