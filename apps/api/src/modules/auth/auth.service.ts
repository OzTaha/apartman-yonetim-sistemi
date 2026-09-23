import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  normalizeTrPhone,
  type AcceptInviteResultDto,
  type AuthResponse,
  type InvitationInfoDto,
  type MeDto,
} from '@apartman/shared';
import { sha256 } from '../../common/crypto';
import { activeOn } from '../../common/dates';
import type { AcceptInviteDto, ChangePasswordDto, LoginDto } from '../../common/dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getDummyHash, hashPassword, verifyPassword } from './password';
import { type ClientMeta, TokenService } from './token.service';

export interface Session {
  response: AuthResponse;
  refreshToken: string;
}

const INVALID_CREDENTIALS = 'E-posta/telefon veya şifre hatalı';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginDto, meta: ClientMeta): Promise<Session> {
    const user = await this.findByIdentifier(input.identifier);
    if (!user?.passwordHash || !user.isActive) {
      await verifyPassword(await getDummyHash(), input.password);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!(await verifyPassword(user.passwordHash, input.password))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.startSession(user.id, meta);
  }

  async refresh(refreshToken: string, meta: ClientMeta): Promise<Session> {
    const rotated = await this.tokens.rotateRefreshToken(refreshToken, meta);
    const user = await this.getMe(rotated.userId);
    const accessToken = await this.tokens.signAccessToken(user);
    return { response: { accessToken, user }, refreshToken: rotated.token };
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return refreshToken ? this.tokens.revokeRefreshToken(refreshToken) : Promise.resolve();
  }

  async changePassword(
    userId: string,
    input: ChangePasswordDto,
    meta: ClientMeta,
  ): Promise<Session> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new BadRequestException('Mevcut şifre hatalı');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    await this.tokens.revokeAllForUser(userId);
    await this.audit.record({
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
      siteId: null,
    });
    return this.startSession(userId, meta);
  }

  async getMe(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: { site: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        occupancies: {
          where: activeOn(),
          include: {
            site: { select: { name: true } },
            unit: { select: { number: true, block: { select: { name: true } } } },
          },
          orderBy: { startDate: 'asc' },
        },
      },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Hesap bulunamadı');

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      isPlatformAdmin: user.isPlatformAdmin,
      memberships: user.memberships.map((m) => ({
        siteId: m.siteId,
        siteName: m.site.name,
        role: m.role,
      })),
      occupancies: user.occupancies.map((o) => ({
        occupancyId: o.id,
        siteId: o.siteId,
        siteName: o.site.name,
        unitId: o.unitId,
        blockName: o.unit.block.name,
        unitNumber: o.unit.number,
        type: o.type,
      })),
    };
  }

  async getInvitation(token: string): Promise<InvitationInfoDto> {
    const invitation = await this.findValidInvitation(token);
    const { occupancy } = invitation;
    const existing = await this.findUserForOccupancy(occupancy);
    return {
      firstName: occupancy.firstName,
      lastName: occupancy.lastName,
      siteName: occupancy.site.name,
      blockName: occupancy.unit.block.name,
      unitNumber: occupancy.unit.number,
      hasExistingAccount: Boolean(existing?.passwordHash),
    };
  }

  async acceptInvitation(
    token: string,
    input: AcceptInviteDto,
    meta: ClientMeta,
  ): Promise<{ result: AcceptInviteResultDto; refreshToken?: string }> {
    const invitation = await this.findValidInvitation(token);
    const { occupancy } = invitation;
    const existingBefore = await this.findUserForOccupancy(occupancy);
    if (!existingBefore?.passwordHash && !input.password) {
      throw new BadRequestException('Hesabınız için bir şifre belirleyin');
    }
    const passwordHash = input.password ? await hashPassword(input.password) : null;

    const outcome = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.invitation.updateMany({
        where: { id: invitation.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count !== 1) throw new GoneException('Bu davet bağlantısı zaten kullanılmış');

      const existing = await this.findUserForOccupancy(occupancy, tx);
      let userId: string;
      let status: AcceptInviteResultDto['status'];

      if (existing?.passwordHash) {
        userId = existing.id;
        status = 'LINKED_EXISTING';
      } else if (!passwordHash) {
        throw new BadRequestException('Hesabınız için bir şifre belirleyin');
      } else if (existing) {
        await tx.user.update({ where: { id: existing.id }, data: { passwordHash } });
        userId = existing.id;
        status = 'ACTIVATED';
      } else {
        const created = await tx.user.create({
          data: {
            firstName: occupancy.firstName,
            lastName: occupancy.lastName,
            email: occupancy.email,
            phone: occupancy.phone,
            passwordHash,
          },
        });
        userId = created.id;
        status = 'ACTIVATED';
      }

      await tx.occupancy.update({ where: { id: occupancy.id }, data: { userId } });
      await tx.siteMembership.upsert({
        where: { siteId_userId: { siteId: occupancy.siteId, userId } },
        create: { siteId: occupancy.siteId, userId, role: 'RESIDENT' },
        update: {},
      });
      return { userId, status };
    });

    await this.audit.record({
      action: 'INVITATION_ACCEPTED',
      entityType: 'Occupancy',
      entityId: occupancy.id,
      siteId: occupancy.siteId,
      after: { userId: outcome.userId, status: outcome.status },
    });

    if (outcome.status === 'LINKED_EXISTING') return { result: { status: 'LINKED_EXISTING' } };
    const session = await this.startSession(outcome.userId, meta);
    return {
      result: { status: 'ACTIVATED', ...session.response },
      refreshToken: session.refreshToken,
    };
  }

  private async startSession(userId: string, meta: ClientMeta): Promise<Session> {
    const user = await this.getMe(userId);
    const accessToken = await this.tokens.signAccessToken(user);
    const refreshToken = await this.tokens.issueRefreshToken(userId, meta);
    return { response: { accessToken, user }, refreshToken };
  }

  private findByIdentifier(identifier: string) {
    const value = identifier.trim();
    if (value.includes('@')) {
      return this.prisma.user.findUnique({ where: { email: value.toLowerCase() } });
    }
    const phone = normalizeTrPhone(value);
    return phone ? this.prisma.user.findUnique({ where: { phone } }) : Promise.resolve(null);
  }

  private async findValidInvitation(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        occupancy: {
          include: {
            site: { select: { name: true } },
            unit: { select: { number: true, block: { select: { name: true } } } },
          },
        },
      },
    });
    if (!invitation) throw new NotFoundException('Davet bağlantısı geçersiz');
    if (invitation.usedAt) throw new GoneException('Bu davet bağlantısı zaten kullanılmış');
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new GoneException(
        'Davet bağlantısının süresi dolmuş. Yöneticinizden yeni bağlantı isteyin.',
      );
    }
    return invitation;
  }

  private findUserForOccupancy(
    occupancy: { userId: string | null; email: string | null; phone: string | null },
    client: Pick<PrismaService, 'user'> = this.prisma,
  ) {
    if (occupancy.userId) return client.user.findUnique({ where: { id: occupancy.userId } });
    const or = [
      ...(occupancy.email ? [{ email: occupancy.email }] : []),
      ...(occupancy.phone ? [{ phone: occupancy.phone }] : []),
    ];
    return or.length > 0 ? client.user.findFirst({ where: { OR: or } }) : Promise.resolve(null);
  }
}
