/**
 * Device UI Config — Default values + Redis cache key.
 *
 * Stored in DB: SystemConfig table, key = DEVICE_UI_CONFIG, value = JSON string.
 * Cached in Redis: key = 'config:device_ui', no TTL (manually refreshed).
 *
 * Flow:
 *   GET /devices/config → Redis cache → DB fallback → seed default if empty
 *   POST /admin/device-config/refresh → DB → Redis (manual cache refresh)
 */

export const DEVICE_UI_CONFIG_KEY = 'DEVICE_UI_CONFIG';
export const DEVICE_UI_CONFIG_REDIS_KEY = 'config:device_ui';

export interface DeviceUiConfig {
  deviceType: string;
  hasToggle: boolean;
  accentColor: string;
  modalSnapPoints: string[];
  icon?: string;
}

/**
 * Default seed data — used when DB has no config yet.
 * Admin can update via API, which writes to DB + refreshes Redis.
 */
export const DEFAULT_DEVICE_UI_CONFIGS: DeviceUiConfig[] = [
  // By Feature Category
  {
    deviceType: 'light',
    hasToggle: true,
    accentColor: '#A3EC3E',
    modalSnapPoints: ['50%'],
  },
  {
    deviceType: 'switch',
    hasToggle: true,
    accentColor: '#A3EC3E',
    modalSnapPoints: ['50%'],
  },
  {
    deviceType: 'sensor',
    hasToggle: false,
    accentColor: '#60A5FA',
    modalSnapPoints: ['60%'],
  },
  {
    deviceType: 'camera',
    hasToggle: false,
    accentColor: '#60A5FA',
    modalSnapPoints: ['70%'],
  },
  {
    deviceType: 'lock',
    hasToggle: true,
    accentColor: '#F59E0B',
    modalSnapPoints: ['50%'],
  },
  {
    deviceType: 'curtain',
    hasToggle: true,
    accentColor: '#8B5CF6',
    modalSnapPoints: ['50%'],
  },
  {
    deviceType: 'climate',
    hasToggle: true,
    accentColor: '#06B6D4',
    modalSnapPoints: ['60%'],
  },
  // By DeviceModel.code
  {
    deviceType: 'WIFI_SWITCH_4',
    hasToggle: true,
    accentColor: '#A3EC3E',
    modalSnapPoints: ['50%'],
  },
  {
    deviceType: 'SHUTTER_DOOR',
    hasToggle: true,
    accentColor: '#F59E0B',
    modalSnapPoints: ['50%'],
  },
  {
    deviceType: 'alexa',
    hasToggle: false,
    accentColor: '#8B5CF6',
    modalSnapPoints: ['50%'],
  },
];
