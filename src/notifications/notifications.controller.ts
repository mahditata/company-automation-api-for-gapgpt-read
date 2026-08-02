import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  findAll(
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);
    return this.notificationsService.findAll(userId);
  }

  @Get('unread-count')
  getUnreadCount(
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);
    return this.notificationsService.getUnreadCount(userId);
  }

  @Patch('read-all')
  markAllAsRead(
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);
    return this.notificationsService.markAsRead(id, userId);
  }

  private getCurrentUserId(req: any, userIdHeader?: string): number {
    const rawUserId =
      req?.user?.userId ??
      req?.user?.id ??
      req?.user?.sub ??
      userIdHeader;

    if (
      rawUserId === undefined ||
      rawUserId === null ||
      String(rawUserId).trim() === ''
    ) {
      throw new UnauthorizedException('User id is required');
    }

    const userId = Number(rawUserId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Invalid user id');
    }

    return userId;
  }
}
