declare const _default: (() => {
  serverName: string;
  serverVersion: string;
  logLevel: string;
}) &
  import('@nestjs/config').ConfigFactoryKeyHost<{
    serverName: string;
    serverVersion: string;
    logLevel: string;
  }>;
export default _default;
