import { IAuthUser } from '../../request/interfaces/request.interface';

import {
  IAuthTokenResponse,
  IEncryptDataPayload,
} from './encryption.interface';

export interface IHelperEncryptionService {
  createJwtTokens(payload: IAuthUser, sid?: string): Promise<IAuthTokenResponse>;
  createAccessToken(payload: IAuthUser, sid?: string): Promise<string>;
  createRefreshToken(payload: IAuthUser, sid?: string): Promise<string>;
  createHash(password: string): Promise<string>;
  match(hash: string, password: string): Promise<boolean>;
  encrypt(text: string): Promise<IEncryptDataPayload>;
  decrypt(data: IEncryptDataPayload): Promise<string>;
}
