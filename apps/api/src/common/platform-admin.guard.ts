import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './auth-user';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.isPlatformAdmin) {
      throw new ForbiddenException('Bu işlem yalnızca sistem yöneticisine açıktır');
    }
    return true;
  }
}

export const PlatformAdminOnly = () => UseGuards(PlatformAdminGuard);
