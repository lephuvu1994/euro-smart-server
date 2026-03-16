import { registerAs } from '@nestjs/config';

export default registerAs('mqtt', () => ({
    // Ưu tiên MQTT_HOST, nếu không có thì lấy MQTT_HOST_PUBLIC, nếu không có nữa thì localhost
    host: process.env.MQTT_HOST || process.env.MQTT_HOST_PUBLIC || 'localhost',

    // Port mặc định là 1883
    port: parseInt(process.env.MQTT_PORT, 10) || 1883,

    // User và Pass (có thể để trống)
    user: process.env.MQTT_USER || '',
    password: process.env.MQTT_PASS || '',

    // Tạo Client ID ngẫu nhiên để tránh bị trùng khi dev
    clientId:
        process.env.MQTT_CLIENT_ID ||
        `nestjs_server_${Math.random().toString(16).substr(2, 8)}`,
}));
