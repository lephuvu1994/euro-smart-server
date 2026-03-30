import { UserRole } from '@prisma/client';

export interface IAuthUser {
  userId: string;
  role: UserRole;
  sid?: string;
  refreshToken?: string;
}

export interface IRequest {
  user: IAuthUser;
}
