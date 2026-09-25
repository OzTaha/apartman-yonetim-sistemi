import { Injectable, Logger } from '@nestjs/common';
import type { MessageChannel } from '@apartman/shared';
import { randomUUID } from 'node:crypto';

export interface SendResult {
  providerMessageId: string;
}

export abstract class MessagingProvider {
  abstract send(channel: MessageChannel, to: string, text: string): Promise<SendResult>;
}

const maskPhone = (phone: string) => `${phone.slice(0, -4).replace(/\d/g, '*')}${phone.slice(-4)}`;

@Injectable()
export class LogMessagingProvider extends MessagingProvider {
  private readonly logger = new Logger('Mesaj');

  send(channel: MessageChannel, to: string, text: string): Promise<SendResult> {
    this.logger.log(`${channel} ${maskPhone(to)}: ${text}`);
    return Promise.resolve({ providerMessageId: `log-${randomUUID()}` });
  }
}
