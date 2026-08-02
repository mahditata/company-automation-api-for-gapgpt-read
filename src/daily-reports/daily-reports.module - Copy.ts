import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DailyReportsController } from './daily-reports.controller';
import { DailyReportsService } from './daily-reports.service';

@Module({
  imports: [MulterModule.register({})],
  controllers: [DailyReportsController],
  providers: [DailyReportsService],
})
export class DailyReportsModule {}
