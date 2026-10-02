import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  type StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { DeletedSiteDto, SiteDto } from '@apartman/shared';
import { type AuthUser, CurrentUser } from '../../common/auth-user';
import { todayInIstanbul } from '../../common/dates';
import {
  SiteCreateDto,
  SiteDeleteDto,
  SiteManagerAssignDto,
  SiteUpdateDto,
} from '../../common/dto';
import { sendFile, XLSX } from '../../common/http';
import { PlatformAdminOnly } from '../../common/platform-admin.guard';
import { SiteDeletionService } from './site-deletion';
import { SitesService } from './sites.service';

@ApiTags('Siteler')
@ApiBearerAuth()
@Controller('sites')
export class SitesController {
  constructor(
    private readonly sites: SitesService,
    private readonly deletion: SiteDeletionService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<SiteDto[]> {
    return this.sites.list(user);
  }

  @PlatformAdminOnly()
  @Get('deleted')
  listDeleted(): Promise<DeletedSiteDto[]> {
    return this.deletion.listDeleted();
  }

  @PlatformAdminOnly()
  @Get(':id/export.xlsx')
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { name, buffer } = await this.deletion.exportXlsx(id);
    return sendFile(res, `${name} veriler ${todayInIstanbul()}.xlsx`, XLSX, buffer);
  }

  @PlatformAdminOnly()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SiteDeleteDto,
  ): Promise<void> {
    return this.deletion.softDelete(user, id, body);
  }

  @PlatformAdminOnly()
  @Post(':id/restore')
  @HttpCode(204)
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.deletion.restore(id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<SiteDto> {
    return this.sites.get(user, id);
  }

  @PlatformAdminOnly()
  @Post()
  create(@Body() body: SiteCreateDto): Promise<SiteDto> {
    return this.sites.create(body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SiteUpdateDto,
  ): Promise<SiteDto> {
    return this.sites.update(user, id, body);
  }

  @PlatformAdminOnly()
  @Post(':id/managers')
  assignManager(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SiteManagerAssignDto,
  ): Promise<SiteDto> {
    return this.sites.assignManager(id, body);
  }

  @PlatformAdminOnly()
  @Delete(':id/managers/:userId')
  @HttpCode(204)
  removeManager(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.sites.removeManager(id, userId);
  }
}
