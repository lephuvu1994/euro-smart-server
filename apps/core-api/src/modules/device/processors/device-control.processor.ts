// src/modules/device/processors/device-control.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS, IntegrationManager, SceneTriggerType } from '@app/common';
import { RedisService } from '@app/redis-cache';
import { DatabaseService } from '@app/database';
import { SceneService } from '../../scene/scene.service';

@Processor(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
export class DeviceControlProcessor extends WorkerHost {
    private readonly logger = new Logger(DeviceControlProcessor.name);

    constructor(
        private readonly integrationManager: IntegrationManager,
        private readonly databaseService: DatabaseService,
        private readonly redisService: RedisService,
        private readonly sceneService: SceneService,
        // TODO: Replace with event-based notification (e.g. Redis pub/sub) for cross-service WebSocket
        // private readonly socketGateway: SocketGateway,
        @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
        private readonly deviceQueue: Queue
    ) {
        super();
    }

    async process(job: Job): Promise<any> {
        switch (job.name) {
            case DEVICE_JOBS.CONTROL_CMD:
                return await this.handleControlCommand(job);

            case DEVICE_JOBS.CONTROL_DEVICE_VALUE_CMD:
                return await this.handleControlDeviceValueCommand(job);

            case DEVICE_JOBS.RUN_SCENE:
                return await this.handleRunScene(job);

            case DEVICE_JOBS.SCENE_DEVICE_ACTIONS:
                return await this.handleSceneDeviceActions(job);

            case DEVICE_JOBS.CHECK_DEVICE_STATE_TRIGGERS:
                return await this.handleCheckDeviceStateTriggers(job);

            default:
                this.logger.warn(`Unknown job name: ${job.name}`);
                return;
        }
    }

    /**
     * Logic xử lý điều khiển thiết bị
     */
    private async handleControlCommand(job: Job): Promise<any> {
        const { token, featureCode, value } = job.data;

        this.logger.log(
            `🚀 Executing control command: ${JSON.stringify(job.data)}`
        );
        this.logger.log(
            `🚀 Executing control command: ${token} -> ${featureCode}:${value}`
        );

        // 1. Truy vấn DB lấy thông tin Driver & Protocol
        const device = await this.databaseService.device.findUnique({
            where: { token },
            include: {
                partner: true,
                deviceModel: true,
                features: true,
            },
        });

        if (!device) {
            this.logger.error(`Device ${token} not found`);
            return;
        }

        const feature = device.features.find(f => f.code === featureCode);
        if (!feature) {
            this.logger.error(
                `Feature ${featureCode} not found on device ${device.token}`
            );
            return;
        }

        try {
            // 2. Lấy Driver (MQTT, Zigbee...) từ Registry
            const driver = this.integrationManager.getDriver(device.protocol);

            // 3. Thực thi qua Driver
            await driver.setValue(device, feature, value);

            // TODO: Notify user via WebSocket (cross-service event)
            // this.socketGateway.server
            //     .to(`device_${device.token}`)
            //     .emit('COMMAND_SENT', {
            //         deviceId: device.id,
            //         featureCode,
            //         value,
            //         timestamp: new Date(),
            //         status: 'sent',
            //     });

            this.logger.log(
                `✅ [${driver.name}] Command dispatched for ${device.token}`
            );
            return { success: true };
        } catch (error) {
            this.logger.error(`❌ Failed to control device: ${error.message}`);

            // TODO: Notify user via WebSocket (cross-service event)
            // this.socketGateway.server
            //     .to(`device_${device.token}`)
            //     .emit('COMMAND_ERROR', {
            //         deviceId: device.id,
            //         error: error.message,
            //     });

            throw error; // Ném lỗi để BullMQ thực hiện retry (theo config attempts)
        }
    }

    /**
     * Logic xử lý điều khiển thiết bị
     * Lấy tất cả các feature của thiết bị và gửi lệnh điều khiển từng feature
     * Mỗi feature gửi lệnh điều khiển từng feature
     * Có thể gộp nhiều feature thành 1 lệnh điều khiển
     */
    private async handleControlDeviceValueCommand(job: Job): Promise<any> {
        const { token, featureMQTTPayloads } = job.data;

        this.logger.log(
            `🚀 Executing control device value command: ${JSON.stringify(job.data)}`
        );

        // 1. Truy vấn DB lấy thông tin Driver & Protocol
        const device = await this.databaseService.device.findUnique({
            where: { token },
            include: {
                partner: true,
                deviceModel: true,
                features: true,
            },
        });

        if (!device) {
            this.logger.error(`Device ${token} not found`);
            return;
        }

        try {
            // 2. Lấy Driver (MQTT, Zigbee...) từ Registry
            const driver = this.integrationManager.getDriver(device.protocol);

            const features = device.features.filter(f =>
                featureMQTTPayloads.some(fmqtt => fmqtt.featureCode === f.code)
            );
            const newFeatures = features.map(f => {
                const value = featureMQTTPayloads.find(
                    fmqtt => fmqtt.featureCode === f.code
                )?.value;
                if (!value) {
                    return null;
                }
                if (value && !isNaN(Number(value))) {
                    return {
                        ...f,
                        lastValue: Number(value),
                    };
                }
                return {
                    ...f,
                    lastValueString: value,
                };
            });

            // 3. Thực thi qua Driver
            await driver.setValueBulk(device, newFeatures);

            // TODO: Notify user via WebSocket (cross-service event)
            // this.socketGateway.server
            //     .to(`device_${device.token}`)
            //     .emit('COMMAND_SENT', {
            //         deviceId: device.id,
            //         values: featureMQTTPayloads.map(f => {
            //             return { code: f.featureCode, value: f.value };
            //         }),
            //         timestamp: new Date(),
            //         status: 'sent',
            //     });

            this.logger.log(
                `✅ [${driver.name}] Command dispatched for ${device.token}`
            );
            return { success: true };
        } catch (error) {
            this.logger.error(`❌ Failed to control device: ${error.message}`);

            // TODO: Notify user via WebSocket (cross-service event)
            // this.socketGateway.server
            //     .to(`device_${device.token}`)
            //     .emit('COMMAND_ERROR', {
            //         deviceId: device.id,
            //         error: error.message,
            //     });

            throw error; // Ném lỗi để BullMQ thực hiện retry (theo config attempts)
        }
    }

    /**
     * RUN_SCENE: Chỉ load scene, gộp action theo deviceToken, đẩy 1 job/thiết bị (SCENE_DEVICE_ACTIONS).
     * Không thực thi tại đây → tránh block worker, scale với 200k+ thiết bị (job con chạy song song).
     */
    private async handleRunScene(job: Job): Promise<any> {
        const { sceneId } = job.data as { sceneId: string };
        this.logger.log(`🎬 Scene ${sceneId}: grouping actions by device...`);

        const scene = await this.databaseService.scene.findUnique({
            where: { id: sceneId },
        });

        if (!scene) {
            this.logger.error(`Scene ${sceneId} not found`);
            return { success: false, error: 'Scene not found' };
        }

        if (!scene.active) {
            this.logger.warn(`Scene ${sceneId} is inactive, skip`);
            return { success: false, error: 'Scene is inactive' };
        }

        const actions =
            (scene.actions as {
                deviceToken: string;
                featureCode: string;
                value: any;
            }[]) || [];
        const byDevice = new Map<
            string,
            { featureCode: string; value: any }[]
        >();
        for (const a of actions) {
            const list = byDevice.get(a.deviceToken) ?? [];
            list.push({ featureCode: a.featureCode, value: a.value });
            byDevice.set(a.deviceToken, list);
        }

        const deviceCount = byDevice.size;
        for (const [deviceToken, deviceActions] of byDevice) {
            await this.deviceQueue.add(
                DEVICE_JOBS.SCENE_DEVICE_ACTIONS,
                { deviceToken, actions: deviceActions },
                { priority: 2, attempts: 2, removeOnComplete: true }
            );
        }

        this.logger.log(
            `✅ Scene ${scene.name}: queued ${deviceCount} device job(s) for ${actions.length} action(s)`
        );
        return {
            success: true,
            sceneId,
            deviceCount,
            actionCount: actions.length,
        };
    }

    /**
     * Thực thi gộp toàn bộ action của 1 thiết bị (1 lần setValueBulk) → 1 MQTT/lệnh per device.
     */
    private async handleSceneDeviceActions(job: Job): Promise<any> {
        const { deviceToken, actions } = job.data as {
            deviceToken: string;
            actions: { featureCode: string; value: any }[];
        };

        const device = await this.databaseService.device.findUnique({
            where: { token: deviceToken },
            include: { partner: true, deviceModel: true, features: true },
        });

        if (!device) {
            this.logger.error(`Scene device ${deviceToken} not found`);
            return { success: false, deviceToken, error: 'Device not found' };
        }

        const features = device.features.filter(f =>
            actions.some(a => a.featureCode === f.code)
        );
        const newFeatures = features
            .map(f => {
                const act = actions.find(a => a.featureCode === f.code);
                if (!act) return null;
                const value = act.value;
                if (
                    value !== undefined &&
                    value !== null &&
                    !isNaN(Number(value))
                ) {
                    return { ...f, lastValue: Number(value) };
                }
                return { ...f, lastValueString: value };
            })
            .filter(Boolean) as any[];

        if (newFeatures.length === 0) {
            this.logger.warn(`Scene device ${deviceToken}: no valid actions`);
            return { success: true, deviceToken, skipped: true };
        }

        try {
            const driver = this.integrationManager.getDriver(device.protocol);
            await driver.setValueBulk(device, newFeatures);
            // TODO: Notify user via WebSocket (cross-service event)
            // this.socketGateway.server
            //     .to(`device_${device.token}`)
            //     .emit('COMMAND_SENT', {
            //         deviceId: device.id,
            //         values: newFeatures.map(f => ({
            //             code: f.code,
            //             value: f.lastValue ?? f.lastValueString,
            //         })),
            //         timestamp: new Date(),
            //         status: 'sent',
            //     });
            this.logger.log(
                `✅ Scene device ${deviceToken}: ${newFeatures.length} feature(s)`
            );
            return {
                success: true,
                deviceToken,
                featureCount: newFeatures.length,
            };
        } catch (err: any) {
            this.logger.error(
                `❌ Scene device ${deviceToken}: ${err?.message}`
            );
            // TODO: Notify user via WebSocket (cross-service event)
            // this.socketGateway.server
            //     .to(`device_${device.token}`)
            //     .emit('COMMAND_ERROR', {
            //         deviceId: device.id,
            //         error: err?.message,
            //     });
            throw err;
        }
    }

    /**
     * Đánh giá scene có trigger DEVICE_STATE khi thiết bị báo state thay đổi.
     * Tìm scene có điều kiện chứa deviceToken này, đọc giá trị hiện tại từ Redis, so sánh and/or → chạy scene nếu thỏa.
     */
    private async handleCheckDeviceStateTriggers(job: Job): Promise<any> {
        const { deviceToken } = job.data as {
            deviceToken: string;
            updates: { featureCode: string; value: any }[];
        };

        const scenes = await this.databaseService.scene.findMany({
            where: { active: true },
            select: { id: true, name: true, triggers: true },
        });

        for (const scene of scenes) {
            const triggers = (scene.triggers as any[]) ?? [];
            for (const trigger of triggers) {
                if (
                    trigger?.type !== SceneTriggerType.DEVICE_STATE ||
                    !trigger.deviceStateConfig?.conditions?.length
                )
                    continue;
                const hasThisDevice = trigger.deviceStateConfig.conditions.some(
                    (c: any) => c.deviceToken === deviceToken
                );
                if (!hasThisDevice) continue;

                const logic = trigger.deviceStateConfig.conditionLogic as
                    | 'and'
                    | 'or';
                const conditions = trigger.deviceStateConfig
                    .conditions as Array<{
                    deviceToken: string;
                    featureCode: string;
                    value?: any;
                    operator?: string;
                }>;

                let match = false;
                if (logic === 'and') {
                    match = await this.evaluateConditionsAll(conditions);
                } else {
                    match = await this.evaluateConditionsAny(conditions);
                }
                if (match) {
                    await this.sceneService.runSceneByTrigger(scene.id);
                    this.logger.log(
                        `[DEVICE_STATE] Fired scene "${scene.name}" (${scene.id})`
                    );
                }
            }
        }
        return { ok: true };
    }

    private async evaluateConditionsAll(
        conditions: Array<{
            deviceToken: string;
            featureCode: string;
            value?: any;
            operator?: string;
        }>
    ): Promise<boolean> {
        for (const c of conditions) {
            const ok = await this.evaluateOneCondition(c);
            if (!ok) return false;
        }
        return true;
    }

    private async evaluateConditionsAny(
        conditions: Array<{
            deviceToken: string;
            featureCode: string;
            value?: any;
            operator?: string;
        }>
    ): Promise<boolean> {
        for (const c of conditions) {
            const ok = await this.evaluateOneCondition(c);
            if (ok) return true;
        }
        return false;
    }

    private async evaluateOneCondition(condition: {
        deviceToken: string;
        featureCode: string;
        value?: any;
        operator?: string;
    }): Promise<boolean> {
        const device = await this.databaseService.device.findUnique({
            where: { token: condition.deviceToken },
            select: { id: true },
        });
        if (!device) return false;

        const raw = await this.redisService.get(
            `device:${device.id}:feature:${condition.featureCode}`
        );
        let current: any = raw;
        if (raw !== null) {
            try {
                current = JSON.parse(raw);
            } catch {
                const n = Number(raw);
                current = Number.isNaN(n) ? raw : n;
            }
        }

        const op = condition.operator ?? 'eq';
        const expected = condition.value;

        switch (op) {
            case 'eq':
                return this.valuesEqual(current, expected);
            case 'ne':
                return !this.valuesEqual(current, expected);
            case 'gt':
                return Number(current) > Number(expected);
            case 'gte':
                return Number(current) >= Number(expected);
            case 'lt':
                return Number(current) < Number(expected);
            case 'lte':
                return Number(current) <= Number(expected);
            default:
                return this.valuesEqual(current, expected);
        }
    }

    private valuesEqual(a: any, b: any): boolean {
        if (a === b) return true;
        if (typeof a === 'number' && typeof b === 'number') return a === b;
        if (typeof a === 'string' && typeof b === 'string') return a === b;
        return String(a) === String(b);
    }
}
