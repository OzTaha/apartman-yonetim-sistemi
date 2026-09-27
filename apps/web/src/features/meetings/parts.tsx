import {
  decisionResultLabels,
  meetingStatusLabels,
  type DecisionResult,
  type MeetingStatus,
} from '@apartman/shared';
import { Badge } from '@/components/ui/badge';

const statusClasses: Record<MeetingStatus, string> = {
  PLANNED: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  HELD: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  CANCELLED: 'bg-muted text-muted-foreground line-through',
};

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  return (
    <Badge variant="secondary" className={statusClasses[status]}>
      {meetingStatusLabels[status]}
    </Badge>
  );
}

const resultClasses: Record<DecisionResult, string> = {
  ACCEPTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  INFO: 'bg-muted text-muted-foreground',
};

export function DecisionBadge({ result }: { result: DecisionResult }) {
  return (
    <Badge variant="secondary" className={resultClasses[result]}>
      {decisionResultLabels[result]}
    </Badge>
  );
}
