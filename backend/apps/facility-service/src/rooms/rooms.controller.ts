import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CreateRoomRequest, IdRequest, OkResult, PATTERNS, RoomDto, UpdateRoomRequest } from '@app/common';
import { ListRoomsRequest, RoomsService } from './rooms.service';

@Controller()
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @MessagePattern(PATTERNS.rooms.list)
  list(@Payload() request: ListRoomsRequest): Promise<RoomDto[]> {
    return this.rooms.list(request ?? {});
  }

  @MessagePattern(PATTERNS.rooms.create)
  create(@Payload() request: CreateRoomRequest): Promise<RoomDto> {
    return this.rooms.create(request);
  }

  @MessagePattern(PATTERNS.rooms.update)
  update(@Payload() request: UpdateRoomRequest): Promise<RoomDto> {
    return this.rooms.update(request);
  }

  @MessagePattern(PATTERNS.rooms.remove)
  remove(@Payload() request: IdRequest): Promise<OkResult> {
    return this.rooms.remove(request);
  }
}
