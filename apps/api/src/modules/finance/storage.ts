import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { Env } from '../../config/env';

export interface DetectedFile {
  mime: string;
  ext: string;
}

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

export function detectFileType(buf: Buffer): DetectedFile | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d]))
    return { mime: 'application/pdf', ext: 'pdf' };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

export abstract class FileStorage {
  abstract save(key: string, data: Buffer): Promise<void>;
  abstract open(key: string): Readable;
  abstract remove(key: string): Promise<void>;
}

@Injectable()
export class LocalFileStorage extends FileStorage {
  private readonly logger = new Logger(LocalFileStorage.name);
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.root = path.resolve(config.get('UPLOAD_DIR', { infer: true }));
  }

  async save(key: string, data: Buffer): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data, { flag: 'wx' });
  }

  open(key: string): Readable {
    return createReadStream(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') this.logger.warn(`Dosya silinemedi (${key}): ${error.message}`);
    });
  }

  private resolve(key: string): string {
    const file = path.resolve(this.root, key);
    if (!file.startsWith(this.root + path.sep)) throw new Error(`Geçersiz dosya anahtarı: ${key}`);
    return file;
  }
}
