import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { IdRequest, PATTERNS, SetPhotoRequest } from '@app/common';
import { CoachPhotosService } from './coach-photos.service';

@Controller()
export class CoachPhotosController {
  constructor(private readonly photos: CoachPhotosService) {}

  @MessagePattern(PATTERNS.users.photoGet)
  get(@Payload() req: IdRequest) {
    return this.photos.get(req?.id);
  }

  @MessagePattern(PATTERNS.users.photoSet)
  set(@Payload() req: SetPhotoRequest) {
    return this.photos.set(req);
  }

  @MessagePattern(PATTERNS.users.photoRemove)
  remove(@Payload() req: IdRequest) {
    return this.photos.remove(req?.id);
  }
}
