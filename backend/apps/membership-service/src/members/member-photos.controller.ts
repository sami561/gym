import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { IdRequest, PATTERNS, SetMemberPhotoRequest } from '@app/common';
import { MemberPhotosService } from './member-photos.service';

@Controller()
export class MemberPhotosController {
  constructor(private readonly photos: MemberPhotosService) {}

  @MessagePattern(PATTERNS.members.photoGet)
  get(@Payload() req: IdRequest) {
    return this.photos.get(req?.id);
  }

  @MessagePattern(PATTERNS.members.photoSet)
  set(@Payload() req: SetMemberPhotoRequest) {
    return this.photos.set(req);
  }

  @MessagePattern(PATTERNS.members.photoRemove)
  remove(@Payload() req: IdRequest) {
    return this.photos.remove(req?.id);
  }
}
