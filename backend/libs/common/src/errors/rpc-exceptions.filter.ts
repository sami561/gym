import { ArgumentsHost, Catch, HttpException, Logger, RpcExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { EMPTY, Observable, throwError } from 'rxjs';
import { QueryFailedError } from 'typeorm';
import { RpcError, RpcErrorPayload } from './rpc-error';

/**
 * Global filter for microservices: lets handlers throw regular Nest HttpExceptions
 * (NotFoundException, ConflictException...) and sends { statusCode, message } back
 * to the caller, which the gateway turns into the matching HTTP response.
 */
@Catch()
export class AllRpcExceptionsFilter implements RpcExceptionFilter<unknown> {
  private readonly logger = new Logger('RpcExceptions');

  catch(exception: unknown, host: ArgumentsHost): Observable<never> {
    const payload = this.toPayload(exception);
    if (payload.statusCode >= 500) {
      this.logger.error(String((exception as Error)?.stack ?? exception));
    }
    // Hybrid apps (HTTP + bus) share this filter: answer HTTP requests directly.
    if (host.getType() === 'http') {
      host.switchToHttp().getResponse().status(payload.statusCode).json(payload);
      return EMPTY;
    }
    return throwError(() => payload);
  }

  private toPayload(exception: unknown): RpcErrorPayload {
    if (exception instanceof RpcError) return exception.toPayload();
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? (response as { message: string | string[] }).message
          : exception.message;
      return { statusCode: exception.getStatus(), message };
    }
    if (exception instanceof RpcException) {
      const error = exception.getError();
      if (typeof error === 'string') return { statusCode: 400, message: error };
      // An object without a status would reach the caller as "[object Object]".
      return typeof error === 'object' && error !== null && 'statusCode' in error
        ? (error as RpcErrorPayload)
        : { statusCode: 400, message: 'Requête invalide.' };
    }
    if (exception instanceof QueryFailedError) {
      const code = (exception as QueryFailedError & { code?: string }).code;
      if (code === '23505') return { statusCode: 409, message: 'Cette valeur existe déjà.' };
      if (code === '23503') return { statusCode: 409, message: 'Élément encore utilisé ailleurs.' };
      if (code === '22P02') return { statusCode: 400, message: 'Identifiant invalide.' };
    }
    return { statusCode: 500, message: 'Erreur interne du service.' };
  }
}
