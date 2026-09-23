import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { generateOpaqueToken, sha256 } from '../../common/crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REUSE_GRACE_MS = 30_000;

export interface AccessTokenPayload {
  sub: string;
  adm: boolean;
}

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  signAccessToken(user: { id: string; isPlatformAdmin: boolean }): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, adm: user.isPlatformAdmin };
    return this.jwt.signAsync(payload);
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token);
  }

  async issueRefreshToken(userId: string, meta: ClientMeta): Promise<string> {
    const token = generateOpaqueToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        userAgent: meta.userAgent?.slice(0, 300),
        ip: meta.ip,
      },
    });
    return token;
  }

  async rotateRefreshToken(
    token: string,
    meta: ClientMeta,
  ): Promise<{ userId: string; token: string }> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!existing) throw new UnauthorizedException('Oturum bulunamadı');

    if (existing.revokedAt) {
      const withinGrace =
        existing.replacedById !== null &&
        Date.now() - existing.revokedAt.getTime() < REUSE_GRACE_MS;
      if (!withinGrace) {
        this.logger.warn(
          `Refresh token yeniden kullanıldı, kullanıcı ${existing.userId} için tüm oturumlar kapatılıyor`,
        );
        await this.revokeAllForUser(existing.userId);
      }
      throw new UnauthorizedException('Oturum geçersiz');
    }
    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Oturum süresi doldu');
    }

    const newToken = generateOpaqueToken();
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: sha256(newToken),
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
          userAgent: meta.userAgent?.slice(0, 300),
          ip: meta.ip,
        },
      });
      const { count } = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: created.id },
      });
      if (count !== 1) throw new UnauthorizedException('Oturum geçersiz');
    });

    return { userId: existing.userId, token: newToken };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
