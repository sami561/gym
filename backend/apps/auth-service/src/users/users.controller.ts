import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateUserRequest,
  GetManyUsersRequest,
  IdRequest,
  ListUsersRequest,
  PATTERNS,
  UpdateUserRequest,
} from '@app/common';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @MessagePattern(PATTERNS.users.create)
  create(@Payload() req: CreateUserRequest) {
    return this.users.create(req);
  }

  @MessagePattern(PATTERNS.users.list)
  list(@Payload() req: ListUsersRequest) {
    return this.users.list(req ?? {});
  }

  @MessagePattern(PATTERNS.users.get)
  get(@Payload() req: IdRequest) {
    return this.users.get(req.id);
  }

  @MessagePattern(PATTERNS.users.getMany)
  getMany(@Payload() req: GetManyUsersRequest) {
    return this.users.getMany(req.ids ?? []);
  }

  @MessagePattern(PATTERNS.users.update)
  update(@Payload() req: UpdateUserRequest) {
    return this.users.update(req);
  }

  @MessagePattern(PATTERNS.users.remove)
  remove(@Payload() req: IdRequest) {
    return this.users.remove(req.id);
  }

  @MessagePattern(PATTERNS.users.publicCoaches)
  publicCoaches() {
    return this.users.publicCoaches();
  }
}
