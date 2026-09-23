import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody } from '@apartman/shared';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client';

@Catch(ZodValidationException)
export class ZodValidationExceptionFilter implements ExceptionFilter {
  catch(exception: ZodValidationException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const zodError = exception.getZodError() as ZodError;
    const body: ApiErrorBody = {
      statusCode: HttpStatus.BAD_REQUEST,
      message: zodError.issues[0]?.message ?? 'Girilen bilgiler geçersiz',
      errors: zodError.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
    response.status(HttpStatus.BAD_REQUEST).json(body);
  }
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, 'Bu bilgilerle bir kayıt zaten mevcut'],
      P2003: [HttpStatus.CONFLICT, 'İlişkili kayıtlar olduğu için bu işlem yapılamaz'],
      P2025: [HttpStatus.NOT_FOUND, 'Kayıt bulunamadı'],
    };
    const mapped = map[exception.code];
    if (!mapped) {
      this.logger.error(`Beklenmeyen veritabanı hatası ${exception.code}: ${exception.message}`);
    }
    const [statusCode, message] = mapped ?? [HttpStatus.INTERNAL_SERVER_ERROR, 'Beklenmeyen hata'];
    const body: ApiErrorBody = { statusCode, message };
    response.status(statusCode).json(body);
  }
}
