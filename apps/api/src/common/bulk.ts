import { HttpException } from '@nestjs/common';
import type { BulkCancelResultDto } from '@apartman/shared';

export async function cancelEach(
  ids: string[],
  cancel: (id: string) => Promise<unknown>,
): Promise<BulkCancelResultDto> {
  const result: BulkCancelResultDto = { cancelled: 0, skipped: [] };
  for (const id of new Set(ids)) {
    try {
      await cancel(id);
      result.cancelled += 1;
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      result.skipped.push({ id, message: error.message });
    }
  }
  return result;
}
