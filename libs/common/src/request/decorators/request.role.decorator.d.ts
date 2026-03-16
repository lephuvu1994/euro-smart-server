import { CustomDecorator } from '@nestjs/common';
import { UserRole } from '@prisma/client';
export declare const AllowedRoles: (
  roles: UserRole[],
) => CustomDecorator<string>;
