import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications';
import { EmployeesController, EmployeesService } from './employees';
import { RecurringTasksController, RecurringTasksService } from './recurring-tasks';
import { ShiftsController, ShiftsService } from './shifts';
import { StaffReportController, StaffReportService } from './staff-report';
import {
  DoorController,
  DoorService,
  EmployeeAccessController,
  EmployeeAccessService,
  StaffMeController,
  StaffMeService,
} from './staff-access';
import { TasksController, TasksService } from './tasks';

@Module({
  imports: [NotificationsModule],
  controllers: [
    EmployeesController,
    ShiftsController,
    TasksController,
    RecurringTasksController,
    StaffReportController,
    EmployeeAccessController,
    StaffMeController,
    DoorController,
  ],
  providers: [
    EmployeesService,
    ShiftsService,
    TasksService,
    RecurringTasksService,
    StaffReportService,
    EmployeeAccessService,
    StaffMeService,
    DoorService,
  ],
})
export class StaffModule {}
