import { Test, TestingModule } from '@nestjs/testing';
import { DailyReportsController } from './daily-reports.controller';

describe('DailyReportsController', () => {
  let controller: DailyReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DailyReportsController],
    }).compile();

    controller = module.get<DailyReportsController>(DailyReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
