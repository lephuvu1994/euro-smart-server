/**
 * Trả về cấu hình Helmet mặc định cho MCP Server.
 * "Fake" lại hàm này để trả về cấu hình cơ bản, an toàn.
 */
export function getMCPHelmetConfig() {
    return {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                baseUri: ["'self'"],
                blockAllMixedContent: [],
                fontSrc: ["'self'", 'https:', 'data:'],
                frameAncestors: ["'self'"],
                imgSrc: ["'self'", 'data:'],
                objectSrc: ["'none'"],
                scriptSrc: ["'self'", "'unsafe-inline'"], // Cần thiết nếu có Swagger UI
                scriptSrcAttr: ["'none'"],
                styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
                upgradeInsecureRequests: [],
            },
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' }, // Cho phép truy cập tài nguyên chéo (quan trọng cho API)
    };
}
