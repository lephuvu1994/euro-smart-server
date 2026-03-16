import { UserRole } from '@prisma/client';

export interface IAuthUser {
    userId: string;
    role: UserRole;
}

export interface IRequest {
    user: IAuthUser;
}
