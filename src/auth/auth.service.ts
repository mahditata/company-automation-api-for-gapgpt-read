import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}
async changePassword(userId: number, changePasswordDto: ChangePasswordDto) {
  const { oldPassword, newPassword } = changePasswordDto;

  if (!newPassword) {
    throw new BadRequestException('New password is required');
  }

  const user = await this.prisma.user.findFirst({
    where: {
      id: userId,
      status: 'ACTIVE',
    },
  });

  if (!user) {
    throw new UnauthorizedException('User not found or inactive');
  }

  if (oldPassword) {
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isOldPasswordValid) {
      throw new UnauthorizedException('Old password is incorrect');
    }
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await this.prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      mustChangePassword: false,
    },
  });

  return {
    message: 'Password changed successfully',
  };
}


  async login(loginDto: LoginDto) {
    // دیباگ دقیق در کنسول بک‌اندم
    const phone = loginDto?.phone?.trim();
    const password = loginDto?.password;

    console.log(`[Login Attempt] Phone: "${phone}"`);

    if (!phone || !password) {
      throw new BadRequestException('Phone and password are required');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        phone: phone,
        status: 'ACTIVE',
      },
      include: {
        role: true,
        department: true,
      },
    });

    if (!user) {
      console.log(`[Login Failed] User not found for phone: ${phone}`);
      throw new UnauthorizedException('Invalid phone or password');
    }

    // بررسی وجود پسورد در دیتابیس
    if (!user.password) {
      console.log(`[Login Failed] User ${phone} has no password set in DB`);
      throw new UnauthorizedException('Invalid phone or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      console.log(`[Login Failed] Password mismatch for user: ${phone}`);
      throw new UnauthorizedException('Invalid phone or password');
    }

    const payload = {
      sub: user.id,
      username: user.username,
      phone: user.phone,
      role: user.role?.name,
      departmentId: user.departmentId,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    console.log(`[Login Success] User: ${user.username} (ID: ${user.id})`);

    return {
      accessToken,
      user: this.mapAuthUser(user),
    };
  }

  async me(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: 'ACTIVE',
      },
      include: {
        role: true,
        department: true,
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            phone: true,
            positionTitle: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (!user.role || !user.department) {
      throw new UnauthorizedException('User account is not configured correctly');
    }

    return this.mapAuthUser(user);
  }

  private mapAuthUser(user: any) {
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
      roleId: user.roleId,
      departmentId: user.departmentId,
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
}
