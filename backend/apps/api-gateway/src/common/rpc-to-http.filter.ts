import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { RpcError } from '@app/common';

/** Turns errors coming back from microservices into the matching HTTP response. */
@Catch()
export class RpcToHttpFilter implements ExceptionFilter {
  private readonly logger = new Logger('Gateway');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const response = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response
        .status(exception.getStatus())
        .json(typeof body === 'object' ? body : { statusCode: exception.getStatus(), message: body });
      return;
    }
    const error = RpcError.from(exception);
    if (error.statusCode >= 500) this.logger.error(`${error.pattern ?? ''} ${error.message}`);
    response.status(error.statusCode).json({
      statusCode: error.statusCode,
      message: error.statusCode >= 500 && error.statusCode !== 503 ? 'Erreur interne, réessayez.' : error.details,
    });
  }
}
