import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateEmployeeRequest,
  EmployeeDto,
  IdRequest,
  ListEmployeesRequest,
  OkResult,
  PATTERNS,
  UpdateEmployeeRequest,
} from '@app/common';
import { EmployeesService } from './employees.service';

@Controller()
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @MessagePattern(PATTERNS.employees.list)
  list(@Payload() request: ListEmployeesRequest): Promise<EmployeeDto[]> {
    return this.employees.list(request ?? {});
  }

  @MessagePattern(PATTERNS.employees.get)
  get(@Payload() request: IdRequest): Promise<EmployeeDto> {
    return this.employees.get(request);
  }

  @MessagePattern(PATTERNS.employees.create)
  create(@Payload() request: CreateEmployeeRequest): Promise<EmployeeDto> {
    return this.employees.create(request);
  }

  @MessagePattern(PATTERNS.employees.update)
  update(@Payload() request: UpdateEmployeeRequest): Promise<EmployeeDto> {
    return this.employees.update(request);
  }

  @MessagePattern(PATTERNS.employees.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.employees.remove(request);
  }
}
