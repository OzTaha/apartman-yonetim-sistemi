import {
  taskPriorityLabels,
  taskStatusLabels,
  type TaskPriority,
  type TaskStatus,
} from '@apartman/shared';
import { Badge } from '@/components/ui/badge';

const statusClasses: Record<TaskStatus, string> = {
  TODO: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  DONE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  CANCELLED: 'bg-muted text-muted-foreground line-through',
};

export function TaskStatusBadge({ status, overdue }: { status: TaskStatus; overdue?: boolean }) {
  if (overdue) {
    return (
      <Badge
        variant="secondary"
        className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
      >
        Gecikmiş
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className={statusClasses[status]}>
      {taskStatusLabels[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority === 'NORMAL') return null;
  return priority === 'HIGH' ? (
    <Badge variant="destructive">{taskPriorityLabels.HIGH}</Badge>
  ) : (
    <Badge variant="outline">{taskPriorityLabels.LOW}</Badge>
  );
}
