import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications';
import { EmployeesController, EmployeesService } from './employees';
import { RecurringTasksController, RecurringTasksService } from './recurring-tasks';
import { ShiftsController, ShiftsService } from './shifts';
import { StaffReportController, StaffReportService } from './staff-report';
import { TasksController, TasksService } from './tasks';

@Module({
  imports: [NotificationsModule],
  controllers: [
    EmployeesController,
    ShiftsController,
    TasksController,
    RecurringTasksController,
    StaffReportController,
  ],
  providers: [
    EmployeesService,
    ShiftsService,
    TasksService,
    RecurringTasksService,
    StaffReportService,
  ],
})
export class StaffModule {}
