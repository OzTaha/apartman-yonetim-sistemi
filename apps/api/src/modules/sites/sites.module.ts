import { Module } from '@nestjs/common';
import { DuesModule } from '../dues/dues.module';
import { FinanceModule } from '../finance/finance.module';
import { SiteDeletionService } from './site-deletion';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [DuesModule, FinanceModule],
  controllers: [SitesController],
  providers: [SitesService, SiteDeletionService],
})
export class SitesModule {}
