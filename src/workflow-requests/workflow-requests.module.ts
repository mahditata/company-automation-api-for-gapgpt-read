import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkflowRequestsController } from './workflow-requests.controller';
import { WorkflowRequestsService } from './workflow-requests.service';

@Module({
  imports: [PrismaModule],
  controllers: [WorkflowRequestsController],
  providers: [WorkflowRequestsService],
  exports: [WorkflowRequestsService],
})
export class WorkflowRequestsModule {}
