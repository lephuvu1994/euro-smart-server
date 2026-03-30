import {
  randomBytes,
  scrypt,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { promisify } from 'node:util';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { IAuthUser } from '../../request/interfaces/request.interface';

import {
  IAuthTokenResponse,
  IEncryptDataPayload,
} from '../interfaces/encryption.interface';
import { IHelperEncryptionService } from '../interfaces/encryption.service.interface';

@Injectable()
export class HelperEncryptionService implements IHelperEncryptionService {
  private readonly logger = new Logger(HelperEncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly saltLength = 16;
  private readonly ivLength = 12;
  private readonly tagLength = 16;

  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpire: string;
  private readonly refreshTokenExpire: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.accessTokenSecret = this.configService.getOrThrow<string>(
      'auth.accessToken.secret',
    );
    this.refreshTokenSecret = this.configService.getOrThrow<string>(
      'auth.refreshToken.secret',
    );
    this.accessTokenExpire = this.configService.getOrThrow<string>(
      'auth.accessToken.tokenExp',
    );
    this.refreshTokenExpire = this.configService.getOrThrow<string>(
      'auth.refreshToken.tokenExp',
    );
  }

  public async createJwtTokens(
    payload: IAuthUser,
    sid?: string,
  ): Promise<IAuthTokenResponse> {
    const [accessToken, refreshToken] = await Promise.all([
      this.createAccessToken(payload, sid),
      this.createRefreshToken(payload, sid),
    ]);
    return { accessToken, refreshToken };
  }

  public createAccessToken(payload: IAuthUser, sid?: string): Promise<string> {
    const accessTokenPayload = { ...payload, ...(sid && { sid }) };
    return this.jwtService.signAsync(accessTokenPayload, {
      secret: this.accessTokenSecret,
      expiresIn: this.accessTokenExpire as any,
    });
  }

  public createRefreshToken(payload: IAuthUser, sid?: string): Promise<string> {
    const refreshTokenPayload = { ...payload, ...(sid && { sid }) };
    return this.jwtService.signAsync(refreshTokenPayload, {
      secret: this.refreshTokenSecret,
      expiresIn: this.refreshTokenExpire as any,
    });
  }

  /**
   * Parse JWT duration string (e.g. '30d', '24h', '3600s') to days.
   */
  public getRefreshTokenExpireDays(): number {
    const match = this.refreshTokenExpire.match(/^(\d+)([dhms]?)$/);
    if (!match) return 7;
    const value = parseInt(match[1], 10);
    switch (match[2]) {
      case 'h': return value / 24;
      case 'm': return value / (24 * 60);
      case 's': return value / (24 * 60 * 60);
      case 'd':
      default: return value;
    }
  }

  public createHash(password: string): Promise<string> {
    return argon2.hash(password);
  }

  public match(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  public async encrypt(text: string): Promise<IEncryptDataPayload> {
    const salt = randomBytes(this.saltLength);
    const iv = randomBytes(this.ivLength);
    const key = await this.deriveKey(this.accessTokenSecret, salt);

    const cipher = createCipheriv(this.algorithm, key, iv, {
      authTagLength: this.tagLength,
    });
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      data: encrypted.toString('hex'),
      tag: tag.toString('hex'),
      salt: salt.toString('hex'),
    };
  }

  public async decrypt({
    data,
    iv,
    tag,
    salt,
  }: IEncryptDataPayload): Promise<string> {
    const key = await this.deriveKey(
      this.accessTokenSecret,
      Buffer.from(salt, 'hex'),
    );
    const decipher = createDecipheriv(
      this.algorithm,
      key,
      Buffer.from(iv, 'hex'),
      {
        authTagLength: this.tagLength,
      },
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(data, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  private async deriveKey(secret: string, salt: Buffer): Promise<Buffer> {
    const scryptAsync = promisify(scrypt);
    return scryptAsync(secret, salt, this.keyLength) as Promise<Buffer>;
  }
}
