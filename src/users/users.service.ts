import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private mapUser(user: any) {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      phone: user.phone,
      nationalCode: user.nationalCode,
      positionTitle: user.positionTitle,
      mustChangePassword: user.mustChangePassword,
      status: user.status,
      departmentId: user.departmentId,
      roleId: user.roleId,
      managerId: user.managerId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: user.role
        ? {
            id: user.role.id,
            name: user.role.name,
            title: user.role.title,
            description: user.role.description,
          }
        : null,
      department: user.department
        ? {
            id: user.department.id,
            name: user.department.name,
            description: user.department.description,
            parentId: user.department.parentId,
          }
        : null,
      manager: user.manager
        ? {
            id: user.manager.id,
            firstName: user.manager.firstName,
            lastName: user.manager.lastName,
            username: user.manager.username,
            phone: user.manager.phone,
            positionTitle: user.manager.positionTitle,
          }
        : null,
    };
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: {
        role: true,
        department: true,
        manager: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    return users.map((user) => this.mapUser(user));
  }

  async findMySubordinates(managerId: number) {
    const normalizedManagerId = Number(managerId);

    if (
      !Number.isInteger(normalizedManagerId) ||
      normalizedManagerId <= 0
    ) {
      return [];
    }

    const allSubordinates: any[] = [];

    /*
     * شناسه‌هایی که قبلاً بررسی شده‌اند.
     * شناسه مدیر جاری نیز از ابتدا اضافه می‌شود تا در صورت وجود
     * ارتباط حلقه‌ای اشتباه در دیتابیس، خود مدیر وارد خروجی نشود.
     */
    const visitedUserIds = new Set<number>([normalizedManagerId]);

    /*
     * در اولین مرحله فقط زیرمجموعه‌های مستقیم مدیر جاری بررسی می‌شوند.
     * در مراحل بعد، زیرمجموعه‌های افراد پیدا‌شده بررسی خواهند شد.
     */
    let currentManagerIds: number[] = [normalizedManagerId];

    while (currentManagerIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          managerId: {
            in: currentManagerIds,
          },
          status: 'ACTIVE',
        },
        include: {
          role: true,
          department: true,
          manager: true,
        },
        orderBy: {
          id: 'asc',
        },
      });

      const nextManagerIds: number[] = [];

      for (const user of users) {
        /*
         * از ثبت تکراری کاربر جلوگیری می‌کند و در صورت وجود
         * ارتباط حلقه‌ای اشتباه، مانع اجرای بی‌نهایت حلقه می‌شود.
         */
        if (visitedUserIds.has(user.id)) {
          continue;
        }

        visitedUserIds.add(user.id);
        allSubordinates.push(this.mapUser(user));
        nextManagerIds.push(user.id);
      }

      currentManagerIds = nextManagerIds;
    }

    return allSubordinates;
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        department: true,
        manager: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.mapUser(user);
  }

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { username: createUserDto.username },
    });

    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        username: createUserDto.username,
        password: hashedPassword,
        positionTitle: createUserDto.positionTitle,
        departmentId: createUserDto.departmentId,
        roleId: createUserDto.roleId,
      },
      include: {
        role: true,
        department: true,
        manager: true,
      },
    });

    return this.mapUser(user);
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    await this.findOne(id);

    if (updateUserDto.username) {
      const existingUser = await this.prisma.user.findUnique({
        where: { username: updateUserDto.username },
      });

      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('Username already exists');
      }
    }

    const data: Record<string, unknown> = {};

    if (updateUserDto.firstName !== undefined) {
      data.firstName = updateUserDto.firstName;
    }

    if (updateUserDto.lastName !== undefined) {
      data.lastName = updateUserDto.lastName;
    }

    if (updateUserDto.username !== undefined) {
      data.username = updateUserDto.username;
    }

    if (updateUserDto.phone !== undefined) {
      data.phone = updateUserDto.phone;
    }

    if (updateUserDto.nationalCode !== undefined) {
      data.nationalCode = updateUserDto.nationalCode;
    }

    if (updateUserDto.positionTitle !== undefined) {
      data.positionTitle = updateUserDto.positionTitle;
    }

    if (updateUserDto.departmentId !== undefined) {
      data.departmentId = updateUserDto.departmentId;
    }

    if (updateUserDto.roleId !== undefined) {
      data.roleId = updateUserDto.roleId;
    }

    if (updateUserDto.managerId !== undefined) {
      data.managerId = updateUserDto.managerId;
    }

    if (updateUserDto.status !== undefined) {
      data.status = updateUserDto.status;
    }

    if (updateUserDto.mustChangePassword !== undefined) {
      data.mustChangePassword = updateUserDto.mustChangePassword;
    }

    if (updateUserDto.password) {
      data.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: {
        role: true,
        department: true,
        manager: true,
      },
    });

    return this.mapUser(user);
  }
}
