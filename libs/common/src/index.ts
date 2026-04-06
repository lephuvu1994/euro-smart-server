// Auth
export * from './auth/auth.module';
export * from './auth/services/auth.service';

// Config
export { default as configs } from './config';

// Constants & Enums
export * from './notification/notification.module';
export * from './notification/services/notification.service';
export * from './enums/app.enum';
export * from './enums/device-job.enum';
export * from './enums/scene.enum';
export * from './constants/entity-domain.constant';

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
export * from './request/guards/jwt.access.guard';
export * from './request/guards/jwt.refresh.guard';
export * from './request/interfaces/request.interface';
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

// Utils
export * from './utils/schedule-next-calculator';

// Services (shared across apps)
export * from './services/scene-trigger-index.service';
