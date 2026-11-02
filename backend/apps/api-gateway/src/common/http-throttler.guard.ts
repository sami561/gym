import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { throttleTracker } from './throttle-tracker';

/**
 * Rate limiting for HTTP requests only (not for the bus events the gateway listens to). Registered
 * after the AuthGuard: signed-in callers are counted per user, anonymous ones per client address
 * (req.ip, see TRUST_PROXY in main.ts).
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  canActivate(context: ExecutionContext): Promise<boolean> {
    return context.getType() === 'http' ? super.canActivate(context) : Promise.resolve(true);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    return throttleTracker(req.user, await super.getTracker(req));
  }
}
