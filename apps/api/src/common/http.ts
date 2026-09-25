import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import type { Readable } from 'node:stream';

export const PDF = 'application/pdf';
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function formatDateTr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function sendFile(
  res: Response,
  filename: string,
  type: string,
  data: Buffer | Readable,
  disposition: 'attachment' | 'inline' = 'attachment',
): StreamableFile {
  const ascii = filename
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/"/g, '');
  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  return Buffer.isBuffer(data) ? new StreamableFile(data) : new StreamableFile(data);
}
