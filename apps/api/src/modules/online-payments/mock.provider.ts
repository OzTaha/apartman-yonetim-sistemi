import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  PaymentProvider,
  type CallbackRequest,
  type CheckoutRequest,
  type CheckoutSession,
  type ProviderEvent,
} from './payment.provider';

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

interface MockSession extends CheckoutRequest {
  result: ProviderEvent | null;
}

@Injectable()
export class MockPaymentProvider extends PaymentProvider {
  readonly name = 'mock';
  readonly testMode = true;
  private readonly secret = randomBytes(32);
  private readonly sessions = new Map<string, MockSession>();

  createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const token = randomUUID();
    this.sessions.set(token, { ...request, result: null });
    return Promise.resolve({ token, redirectUrl: `/api/online-payments/mock/${token}` });
  }

  session(token: string): MockSession | undefined {
    return this.sessions.get(token);
  }

  complete(token: string, success: boolean): CallbackRequest {
    const session = this.sessions.get(token);
    if (!session) throw new UnauthorizedException('Ödeme oturumu bulunamadı');
    const event: ProviderEvent = {
      token,
      status: success ? 'SUCCEEDED' : 'FAILED',
      amountKurus: session.amountKurus,
      providerPayment: success ? `mock-${randomUUID()}` : null,
      reason: success ? null : 'Kart reddedildi',
    };
    session.result = event;
    return { headers: { [MOCK_SIGNATURE_HEADER]: this.sign(event) }, body: event };
  }

  verifyCallback(request: CallbackRequest): ProviderEvent {
    const body = request.body as Partial<ProviderEvent> | undefined;
    const signature = request.headers[MOCK_SIGNATURE_HEADER];
    if (
      !body ||
      typeof body.token !== 'string' ||
      (body.status !== 'SUCCEEDED' && body.status !== 'FAILED') ||
      typeof body.amountKurus !== 'number' ||
      typeof signature !== 'string'
    ) {
      throw new UnauthorizedException('Ödeme bildirimi doğrulanamadı');
    }
    const event: ProviderEvent = {
      token: body.token,
      status: body.status,
      amountKurus: body.amountKurus,
      providerPayment: body.providerPayment ?? null,
      reason: body.reason ?? null,
    };
    const expected = Buffer.from(this.sign(event), 'hex');
    const given = Buffer.from(signature, 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new UnauthorizedException('Ödeme bildirimi doğrulanamadı');
    }
    return event;
  }

  getStatus(token: string): Promise<ProviderEvent | null> {
    return Promise.resolve(this.sessions.get(token)?.result ?? null);
  }

  refund(): Promise<{ reference: string }> {
    return Promise.resolve({ reference: `mock-refund-${randomUUID()}` });
  }

  private sign(event: ProviderEvent): string {
    return createHmac('sha256', this.secret)
      .update(`${event.token}|${event.status}|${event.amountKurus}|${event.providerPayment ?? ''}`)
      .digest('hex');
  }
}
