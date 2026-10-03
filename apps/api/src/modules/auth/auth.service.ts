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
          where: { site: { deletedAt: null } },
          include: { site: { select: { name: true, kind: true } } },
          orderBy: { createdAt: 'asc' },
        },
        occupancies: {
          where: { ...activeOn(), site: { deletedAt: null } },
          include: {
            site: { select: { name: true, kind: true } },
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
        siteKind: m.site.kind,
        role: m.role,
      })),
      occupancies: user.occupancies.map((o) => ({
        occupancyId: o.id,
        siteId: o.siteId,
        siteName: o.site.name,
        siteKind: o.site.kind,
        unitId: o.unitId,
        blockName: o.unit.block.name,
        unitNumber: o.unit.number,
        type: o.type,
      })),
    };
  }

  async getInvitation(token: string): Promise<InvitationInfoDto> {
    const invitation = await this.findValidInvitation(token);
    const target = this.inviteTarget(invitation);
    const existing = await this.findUserForOccupancy(target);
    return {
      kind: invitation.employee ? 'STAFF' : 'RESIDENT',
      firstName: target.firstName,
      lastName: target.lastName,
      siteName: target.site.name,
      siteKind: target.site.kind,
      blockName: invitation.occupancy?.unit.block.name ?? null,
      unitNumber: invitation.occupancy?.unit.number ?? null,
      hasExistingAccount: Boolean(existing?.passwordHash),
    };
  }

  private inviteTarget(invitation: Awaited<ReturnType<AuthService['findValidInvitation']>>) {
    const target = invitation.occupancy ?? invitation.employee;
    if (!target) throw new NotFoundException('Davet bağlantısı geçersiz');
    return {
      id: target.id,
      siteId: target.siteId,
      userId: target.userId,
      firstName: target.firstName,
      lastName: target.lastName,
      email: invitation.occupancy?.email ?? null,
      phone: target.phone,
      site: target.site,
    };
  }

  async acceptInvitation(
    token: string,
    input: AcceptInviteDto,
    meta: ClientMeta,
  ): Promise<{ result: AcceptInviteResultDto; refreshToken?: string }> {
    const invitation = await this.findValidInvitation(token);
    const target = this.inviteTarget(invitation);
    const staff = Boolean(invitation.employee);
    const existingBefore = await this.findUserForOccupancy(target);
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

      const existing = await this.findUserForOccupancy(target, tx);
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
            firstName: target.firstName,
            lastName: target.lastName,
            email: target.email,
            phone: target.phone,
            passwordHash,
          },
        });
        userId = created.id;
        status = 'ACTIVATED';
      }

      if (staff) {
        await tx.employee.update({ where: { id: target.id }, data: { userId } });
        const membership = await tx.siteMembership.findUnique({
          where: { siteId_userId: { siteId: target.siteId, userId } },
        });
        if (!membership) {
          await tx.siteMembership.create({
            data: { siteId: target.siteId, userId, role: 'STAFF' },
          });
        } else if (membership.role === 'RESIDENT') {
          await tx.siteMembership.update({ where: { id: membership.id }, data: { role: 'STAFF' } });
        }
      } else {
        await tx.occupancy.update({ where: { id: target.id }, data: { userId } });
        await tx.siteMembership.upsert({
          where: { siteId_userId: { siteId: target.siteId, userId } },
          create: { siteId: target.siteId, userId, role: 'RESIDENT' },
          update: {},
        });
      }
      return { userId, status };
    });

    await this.audit.record({
      action: 'INVITATION_ACCEPTED',
      entityType: staff ? 'Employee' : 'Occupancy',
      entityId: target.id,
      siteId: target.siteId,
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
            site: { select: { name: true, kind: true } },
            unit: { select: { number: true, block: { select: { name: true } } } },
          },
        },
        employee: { include: { site: { select: { name: true, kind: true } } } },
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
