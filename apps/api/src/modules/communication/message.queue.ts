import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingProvider } from './messaging.provider';

export const MESSAGE_QUEUE = 'messages';
export const MESSAGE_ATTEMPTS = 3;

export interface MessageJob {
  deliveryId: string;
}

export function redisConnection(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number(parsed.pathname.slice(1) || 0),
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

export function queuePrefix(databaseUrl: string): string {
  return `apartman:${new URL(databaseUrl).pathname.slice(1)}`;
}

@Injectable()
export class MessageQueue {
  constructor(@InjectQueue(MESSAGE_QUEUE) private readonly queue: Queue<MessageJob>) {}

  async enqueue(deliveryIds: string[]): Promise<void> {
    if (deliveryIds.length === 0) return;
    await this.queue.addBulk(
      deliveryIds.map((deliveryId) => ({ name: 'send', data: { deliveryId } })),
    );
  }
}

@Processor(MESSAGE_QUEUE, { concurrency: 5, limiter: { max: 20, duration: 1000 } })
export class MessageProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: MessagingProvider,
  ) {
    super();
  }

  async process(job: Job<MessageJob>): Promise<void> {
    const delivery = await this.prisma.messageDelivery.findUnique({
      where: { id: job.data.deliveryId },
      include: { campaign: { select: { channel: true } } },
    });
    if (!delivery || delivery.status !== 'QUEUED' || !delivery.phone) return;
    try {
      const result = await this.provider.send(
        delivery.campaign.channel,
        delivery.phone,
        delivery.text,
      );
      await this.prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SENT',
          attempts: { increment: 1 },
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          error: null,
        },
      });
    } catch (error) {
      const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: final ? 'FAILED' : 'QUEUED',
          attempts: { increment: 1 },
          error: (error as Error).message.slice(0, 500),
        },
      });
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<MessageJob> | undefined, error: Error) {
    this.logger.warn(`Mesaj gönderilemedi (${job?.data.deliveryId}): ${error.message}`);
  }
}
