import { Module } from '@nestjs/common';
import { DuesModule } from '../dues/dues.module';
import { AccountsController, AccountsService, CategoriesService } from './accounts';
import { AttachmentsController, AttachmentsService } from './attachments';
import { DashboardController, DashboardService } from './dashboard';
import { FinanceReportsController, FinanceReportsService } from './reports';
import { FileStorage, LocalFileStorage } from './storage';
import { TransactionsController, TransactionsService } from './transactions';
import { TransparencyController, TransparencyService } from './transparency';
import { VendorsController, VendorsService } from './vendors';
import { WorksController, WorksService } from './works';

@Module({
  imports: [DuesModule],
  controllers: [
    AccountsController,
    DashboardController,
    VendorsController,
    TransactionsController,
    WorksController,
    AttachmentsController,
    FinanceReportsController,
    TransparencyController,
  ],
  providers: [
    AccountsService,
    DashboardService,
    CategoriesService,
    VendorsService,
    TransactionsService,
    WorksService,
    AttachmentsService,
    FinanceReportsService,
    TransparencyService,
    { provide: FileStorage, useClass: LocalFileStorage },
  ],
})
export class FinanceModule {}
