// Auth
export * from './auth/auth.module';

// Config
export { default as configs } from './config';

// Constants & Enums
export * from './enums/app.enum';
export * from './enums/device-job.enum';
export * from './enums/scene.enum';

// DTOs (shared across apps)
export * from './dtos/user.response.dto';
export * from './dtos/home.response.dto';

// Doc
export * from './doc/decorators/doc.response.decorator';

// Events (cross-app communication)
export * from './events/socket-event.publisher';

// Helper
export * from './helper/helper.module';

// Logger
export * from './logger/logger.module';

// Message
export * from './message/message.module';

// MQTT
export * from './mqtt/mqtt.module';

// Request & Response
export * from './request/request.module';
export * from './response/response.module';

// SMS & Vietguys
export * from './sms-sim/sms-sim.module';
export * from './vietguys/vietguys.module';

// MCP
export * from './mcp/mcp.module';

// Integration
export * from './integration/registry/integration.manager';
export * from './integration/drivers/mqtt-generic.driver';
export * from './integration/drivers/zigbee.generic.driver';
export * from './integration/interfaces/device-driver.interface';
export * from './integration/integration.module';
