import { Module } from '@nestjs/common';
import { DailyWorksService } from './daily-works.service';
import { WorkAttachmentsService } from './work-attachments.service';
import { WorkAuthorizationService } from './work-authorization.service';
import { WorkNotificationsService } from './work-notifications.service';
import { WorkReportsService } from './work-reports.service';
import { WorksController } from './works.controller';
import { WorksService } from './works.service';

@Module({
  controllers: [WorksController],
  providers: [
    WorksService,
    DailyWorksService,
    WorkReportsService,
    WorkAuthorizationService,
    WorkNotificationsService,
    WorkAttachmentsService,
  ],
  exports: [
    WorksService,
    DailyWorksService,
    WorkReportsService,
  ],
})
export class WorksModule {}
