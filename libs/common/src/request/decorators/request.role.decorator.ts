import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { ROLES_DECORATOR_KEY } from '../constants/request.constant';

export const AllowedRoles = (roles: UserRole[]): CustomDecorator<string> =>
    SetMetadata(ROLES_DECORATOR_KEY, roles);
