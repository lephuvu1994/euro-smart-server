import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
declare const JwtRefreshStrategy_base: new (
  ...args:
    | [opt: import('passport-jwt').StrategyOptionsWithRequest]
    | [opt: import('passport-jwt').StrategyOptionsWithoutRequest]
) => Strategy & {
  validate(...args: any[]): unknown;
};
export declare class JwtRefreshStrategy extends JwtRefreshStrategy_base {
  private configService;
  constructor(configService: ConfigService);
  validate(
    payload: Record<string, string | number>,
  ): Promise<Record<string, string | number>>;
}
export {};
