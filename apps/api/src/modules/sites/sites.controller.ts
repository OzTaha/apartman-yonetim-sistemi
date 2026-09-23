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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { SiteDto } from '@apartman/shared';
import { type AuthUser, CurrentUser } from '../../common/auth-user';
import { SiteCreateDto, SiteManagerAssignDto, SiteUpdateDto } from '../../common/dto';
import { PlatformAdminOnly } from '../../common/platform-admin.guard';
import { SitesService } from './sites.service';

@ApiTags('Siteler')
@ApiBearerAuth()
@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<SiteDto[]> {
    return this.sites.list(user);
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
