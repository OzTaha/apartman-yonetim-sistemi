import { Global, Module } from '@nestjs/common';
import { TenantContext, TenantGuard } from './tenancy';

@Global()
@Module({
  providers: [TenantContext, TenantGuard],
  exports: [TenantContext, TenantGuard],
})
export class TenancyModule {}
