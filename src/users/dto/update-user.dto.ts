export class UpdateUserDto {
  firstName?: string;
  lastName?: string;
  username?: string;
  password?: string;
  phone?: string;
  nationalCode?: string;
  positionTitle?: string;
  departmentId?: number;
  roleId?: number;
  managerId?: number;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  mustChangePassword?: boolean;
}
