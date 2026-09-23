import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { type AuthenticatedRequest, IS_PUBLIC_KEY } from '../../common/auth-user';
import type { AppClsStore } from '../../tenancy/tenancy';
import { TokenService } from './token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Oturum açmanız gerekiyor');

    try {
      const payload = await this.tokens.verifyAccessToken(token);
      request.user = { id: payload.sub, isPlatformAdmin: payload.adm };
      this.cls.set('userId', payload.sub);
      return true;
    } catch {
      throw new UnauthorizedException('Oturum süresi doldu');
    }
  }
}
