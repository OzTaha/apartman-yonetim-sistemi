import {
  acceptInviteSchema,
  blockSchema,
  bulkUnitsSchema,
  changePasswordSchema,
  loginSchema,
  moveOutSchema,
  occupancyCreateSchema,
  occupancyUpdateSchema,
  residentListQuerySchema,
  siteCreateSchema,
  siteManagerAssignSchema,
  siteUpdateSchema,
  unitCreateSchema,
  unitListQuerySchema,
  unitUpdateSchema,
} from '@apartman/shared';
import { createZodDto } from 'nestjs-zod';

export class LoginDto extends createZodDto(loginSchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export class AcceptInviteDto extends createZodDto(acceptInviteSchema) {}

export class SiteCreateDto extends createZodDto(siteCreateSchema) {}
export class SiteUpdateDto extends createZodDto(siteUpdateSchema) {}
export class SiteManagerAssignDto extends createZodDto(siteManagerAssignSchema) {}

export class BlockDto extends createZodDto(blockSchema) {}

export class UnitCreateDto extends createZodDto(unitCreateSchema) {}
export class UnitUpdateDto extends createZodDto(unitUpdateSchema) {}
export class BulkUnitsDto extends createZodDto(bulkUnitsSchema) {}
export class UnitListQueryDto extends createZodDto(unitListQuerySchema) {}

export class OccupancyCreateDto extends createZodDto(occupancyCreateSchema) {}
export class OccupancyUpdateDto extends createZodDto(occupancyUpdateSchema) {}
export class MoveOutDto extends createZodDto(moveOutSchema) {}
export class ResidentListQueryDto extends createZodDto(residentListQuerySchema) {}
