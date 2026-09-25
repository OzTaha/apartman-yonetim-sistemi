import { Module } from '@nestjs/common';
import { UnitAccessGuard } from '../units/units';
import { AccountController, AccountService } from './account';
import { ChargeTypesController, ChargeTypesService } from './charge-types';
import { ChargesController, ChargesService } from './charges';
import { DocumentsService } from './documents.service';
import { DuesController, DuesService } from './dues';
import { PaymentsController, PaymentsService } from './payments';

@Module({
  controllers: [
    ChargeTypesController,
    DuesController,
    ChargesController,
    PaymentsController,
    AccountController,
  ],
  providers: [
    ChargeTypesService,
    DuesService,
    ChargesService,
    PaymentsService,
    AccountService,
    DocumentsService,
    UnitAccessGuard,
  ],
  exports: [ChargeTypesService, DocumentsService, AccountService, PaymentsService],
})
export class DuesModule {}
