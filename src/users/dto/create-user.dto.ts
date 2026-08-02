export class CreateUserDto {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  phone?: string;
  nationalCode?: string;
  positionTitle: string;
  departmentId: number;
  roleId: number;
  managerId?: number;
}
