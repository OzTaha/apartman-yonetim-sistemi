import { toast } from 'sonner';

export function withUndo({
  message,
  run,
  onUndo,
  seconds = 6,
}: {
  message: string;
  run: () => void;
  onUndo?: () => void;
  seconds?: number;
}) {
  let undone = false;
  let done = false;
  const commit = () => {
    if (undone || done) return;
    done = true;
    run();
  };
  toast(message, {
    description: `${seconds} saniye içinde geri alabilirsiniz.`,
    duration: seconds * 1000,
    action: {
      label: 'Geri al',
      onClick: () => {
        undone = true;
        onUndo?.();
        toast.success('Geri alındı');
      },
    },
    onAutoClose: commit,
    onDismiss: commit,
  });
}
