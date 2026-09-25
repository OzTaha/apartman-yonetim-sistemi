export interface CheckoutRequest {
  intentId: string;
  amountKurus: number;
  description: string;
  buyerName: string;
  returnUrl: string;
}

export interface CheckoutSession {
  token: string;
  redirectUrl: string;
}

export interface ProviderEvent {
  token: string;
  status: 'SUCCEEDED' | 'FAILED';
  amountKurus: number;
  providerPayment: string | null;
  reason: string | null;
}

export interface CallbackRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export abstract class PaymentProvider {
  abstract readonly name: string;
  abstract readonly testMode: boolean;
  abstract createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  abstract verifyCallback(request: CallbackRequest): ProviderEvent;
  abstract getStatus(token: string): Promise<ProviderEvent | null>;
  abstract refund(providerPayment: string, amountKurus: number): Promise<{ reference: string }>;
}

export class DisabledPaymentProvider extends PaymentProvider {
  readonly name = 'none';
  readonly testMode = false;

  private unavailable(): never {
    throw new Error('Online ödeme sağlayıcısı tanımlı değil');
  }

  createCheckout(): Promise<CheckoutSession> {
    return this.unavailable();
  }

  verifyCallback(): ProviderEvent {
    return this.unavailable();
  }

  getStatus(): Promise<ProviderEvent | null> {
    return Promise.resolve(null);
  }

  refund(): Promise<{ reference: string }> {
    return this.unavailable();
  }
}
