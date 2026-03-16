import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IAuthUser } from '../../request/interfaces/request.interface';
import {
  IAuthTokenResponse,
  IEncryptDataPayload,
} from '../interfaces/encryption.interface';
import { IHelperEncryptionService } from '../interfaces/encryption.service.interface';
export declare class HelperEncryptionService
  implements IHelperEncryptionService
{
  private readonly configService;
  private readonly jwtService;
  private readonly logger;
  private readonly algorithm;
  private readonly keyLength;
  private readonly saltLength;
  private readonly ivLength;
  private readonly tagLength;
  private readonly accessTokenSecret;
  private readonly refreshTokenSecret;
  private readonly accessTokenExpire;
  private readonly refreshTokenExpire;
  constructor(configService: ConfigService, jwtService: JwtService);
  createJwtTokens(payload: IAuthUser): Promise<IAuthTokenResponse>;
  createAccessToken(payload: IAuthUser): Promise<string>;
  createRefreshToken(payload: IAuthUser): Promise<string>;
  createHash(password: string): Promise<string>;
  match(hash: string, password: string): Promise<boolean>;
  encrypt(text: string): Promise<IEncryptDataPayload>;
  decrypt({ data, iv, tag, salt }: IEncryptDataPayload): Promise<string>;
  private deriveKey;
}
