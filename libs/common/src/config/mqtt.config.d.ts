declare const _default: (() => {
  host: string;
  port: number;
  user: string;
  password: string;
  clientId: string;
}) &
  import('@nestjs/config').ConfigFactoryKeyHost<{
    host: string;
    port: number;
    user: string;
    password: string;
    clientId: string;
  }>;
export default _default;
