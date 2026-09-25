import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDuesSettings } from '@/lib/queries';

export function MissingUnitDataAlert() {
  const units = useDuesSettings().data?.missingDataUnits ?? [];
  if (units.length === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertDescription>
        Aidat m² veya arsa payına göre dağıtılıyor ancak şu dairelerin bilgisi eksik:{' '}
        {units.join(', ')}. Bilgiler tamamlanmadan aylık aidat yazılamaz.
      </AlertDescription>
    </Alert>
  );
}
