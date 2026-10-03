import { Clock } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useIdleLogout } from '@/lib/idle';

export function IdleWarning() {
  const { warning, secondsLeft, stay } = useIdleLogout();
  const minutes = Math.max(1, Math.ceil(secondsLeft / 60));
  return (
    <AlertDialog open={warning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="size-5 text-primary" />
            Hâlâ burada mısınız?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Uzun süredir işlem yapmadınız. Güvenliğiniz için oturumunuz yaklaşık {minutes} dakika
            içinde kapanacak. Devam etmek için aşağıdaki düğmeye basın.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogAction onClick={stay}>Devam et</AlertDialogAction>
      </AlertDialogContent>
    </AlertDialog>
  );
}
