import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DailyReportsModule } from './daily-reports/daily-reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { WorkflowRequestsModule } from './workflow-requests/workflow-requests.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    DailyReportsModule,
    WorkflowsModule,
    WorkflowRequestsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
