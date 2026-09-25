import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { formatKurus } from '@apartman/shared';
import type { Response } from 'express';
import { Public } from '../../common/auth-user';
import { MockPaymentProvider } from './mock.provider';
import { OnlinePaymentsService } from './online-payments';
import { PaymentProvider } from './payment.provider';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

@ApiExcludeController()
@Public()
@Controller('online-payments/mock')
export class MockCheckoutController {
  constructor(
    private readonly provider: PaymentProvider,
    private readonly online: OnlinePaymentsService,
  ) {}

  private mock(): MockPaymentProvider {
    if (!(this.provider instanceof MockPaymentProvider)) {
      throw new NotFoundException('Test ödeme sağlayıcısı kapalı');
    }
    return this.provider;
  }

  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  page(@Param('token', ParseUUIDPipe) token: string): string {
    const session = this.mock().session(token);
    if (!session) throw new NotFoundException('Ödeme oturumu bulunamadı');
    return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test ödeme sayfası</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f4f4f5; margin: 0; padding: 16px; color: #18181b; }
  main { max-width: 420px; margin: 40px auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px #0002; }
  .note { background: #fef3c7; color: #92400e; border-radius: 8px; padding: 10px 12px; font-size: 14px; }
  .amount { font-size: 32px; font-weight: 700; margin: 16px 0 4px; }
  p { margin: 4px 0; color: #52525b; }
  button { width: 100%; padding: 12px; border-radius: 8px; border: 0; font-size: 16px; margin-top: 12px; cursor: pointer; }
  .ok { background: #16a34a; color: #fff; }
  .fail { background: #e4e4e7; color: #18181b; }
</style>
</head>
<body>
<main>
  <div class="note">Test ödeme sayfası. Gerçek kart bilgisi istenmez, para çekilmez.</div>
  <div class="amount">${escape(formatKurus(session.amountKurus))}</div>
  <p>${escape(session.description)}</p>
  <p>${escape(session.buyerName)}</p>
  <form method="post">
    <button class="ok" name="result" value="success">Ödemeyi onayla</button>
    <button class="fail" name="result" value="fail">Ödeme başarısız olsun</button>
  </form>
</main>
</body>
</html>`;
  }

  @Post(':token')
  async complete(
    @Param('token', ParseUUIDPipe) token: string,
    @Body() body: { result?: string },
    @Res() res: Response,
  ): Promise<void> {
    const mock = this.mock();
    const session = mock.session(token);
    if (!session) throw new NotFoundException('Ödeme oturumu bulunamadı');
    await this.online.handleCallback(mock.name, mock.complete(token, body.result === 'success'));
    res.redirect(303, session.returnUrl);
  }
}
