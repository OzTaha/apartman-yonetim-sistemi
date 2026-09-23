import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  AcceptInviteResultDto,
  AuthResponse,
  InvitationInfoDto,
  MeDto,
} from '@apartman/shared';
import type { CookieOptions, Request, Response } from 'express';
import { type AuthUser, CurrentUser, Public } from '../../common/auth-user';
import { AcceptInviteDto, ChangePasswordDto, LoginDto } from '../../common/dto';
import type { Env } from '../../config/env';
import { AuthService, type Session } from './auth.service';
import { type ClientMeta, REFRESH_TOKEN_TTL_MS } from './token.service';

export const REFRESH_COOKIE = 'rt';

function clientMeta(req: Request): ClientMeta {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

@ApiTags('Kimlik doğrulama')
@Controller('auth')
export class AuthController {
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      secure: config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'strict',
      path: '/api/auth',
    };
  }

  @Public()
  @Throttle({
    default: { limit: () => Number(process.env.LOGIN_RATE_LIMIT ?? 10), ttl: 60_000 },
  })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.withCookie(res, await this.auth.login(body, clientMeta(req)));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('Oturum bulunamadı');
    return this.withCookie(res, await this.auth.refresh(token, clientMeta(req)));
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<MeDto> {
    return this.auth.getMe(user.id);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.withCookie(res, await this.auth.changePassword(user.id, body, clientMeta(req)));
  }

  @Public()
  @Get('invitations/:token')
  getInvitation(@Param('token') token: string): Promise<InvitationInfoDto> {
    return this.auth.getInvitation(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('invitations/:token/accept')
  @HttpCode(200)
  async acceptInvitation(
    @Param('token') token: string,
    @Body() body: AcceptInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AcceptInviteResultDto> {
    const { result, refreshToken } = await this.auth.acceptInvitation(token, body, clientMeta(req));
    if (refreshToken) this.setRefreshCookie(res, refreshToken);
    return result;
  }

  private withCookie(res: Response, session: Session): AuthResponse {
    this.setRefreshCookie(res, session.refreshToken);
    return session.response;
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, { ...this.cookieOptions, maxAge: REFRESH_TOKEN_TTL_MS });
  }
}
