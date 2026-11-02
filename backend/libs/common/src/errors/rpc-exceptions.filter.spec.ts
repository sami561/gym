import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { QueryFailedError } from 'typeorm';
import { RpcError, RpcErrorPayload } from './rpc-error';
import { AllRpcExceptionsFilter } from './rpc-exceptions.filter';

function rpcHost(): ArgumentsHost {
  return { getType: () => 'rpc' } as unknown as ArgumentsHost;
}

function httpHost() {
  const response = { status: jest.fn(), json: jest.fn() };
  response.status.mockReturnValue(response);
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

/** What the caller on the bus receives. */
async function payloadOf(exception: unknown): Promise<RpcErrorPayload> {
  try {
    await lastValueFrom(new AllRpcExceptionsFilter().catch(exception, rpcHost()));
  } catch (payload) {
    return payload as RpcErrorPayload;
  }
  throw new Error('expected the filter to error');
}

function dbError(code: string, detail: string): QueryFailedError {
  return new QueryFailedError('INSERT INTO "members" ...', [], Object.assign(new Error(detail), { code }));
}

describe('AllRpcExceptionsFilter (service side)', () => {
  let logError: jest.SpyInstance;
  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => logError.mockRestore());

  it('sends HttpExceptions back as { statusCode, message }', async () => {
    expect(await payloadOf(new NotFoundException('Membre introuvable.'))).toEqual({
      statusCode: 404,
      message: 'Membre introuvable.',
    });
    expect(await payloadOf(new ConflictException('Cette vente est déjà remboursée.'))).toEqual({
      statusCode: 409,
      message: 'Cette vente est déjà remboursée.',
    });
  });

  it('keeps validation message lists', async () => {
    expect(await payloadOf(new BadRequestException(['name should not be empty', 'price must be a number']))).toEqual({
      statusCode: 400,
      message: ['name should not be empty', 'price must be a number'],
    });
  });

  it('uses the text of an HttpException built from a string', async () => {
    expect(await payloadOf(new HttpException('Trop de requêtes.', 429))).toEqual({
      statusCode: 429,
      message: 'Trop de requêtes.',
    });
  });

  it('passes RpcErrors and structured RpcExceptions through', async () => {
    expect(await payloadOf(new RpcError(503, 'Service indisponible (members.get)'))).toEqual({
      statusCode: 503,
      message: 'Service indisponible (members.get)',
    });
    expect(await payloadOf(new RpcException({ statusCode: 403, message: 'Accès refusé.' }))).toEqual({
      statusCode: 403,
      message: 'Accès refusé.',
    });
    expect(await payloadOf(new RpcException('Requête invalide.'))).toEqual({ statusCode: 400, message: 'Requête invalide.' });
  });

  it('translates known Postgres errors without leaking SQL', async () => {
    expect(await payloadOf(dbError('23505', 'duplicate key value violates unique constraint "UQ_email"'))).toEqual({
      statusCode: 409,
      message: 'Cette valeur existe déjà.',
    });
    expect(await payloadOf(dbError('23503', 'update or delete on table "rooms" violates foreign key'))).toEqual({
      statusCode: 409,
      message: 'Élément encore utilisé ailleurs.',
    });
    expect(await payloadOf(dbError('22P02', 'invalid input syntax for type uuid: "abc"'))).toEqual({
      statusCode: 400,
      message: 'Identifiant invalide.',
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('answers a generic 500 for anything else and logs it', async () => {
    const unknownDbError = await payloadOf(dbError('42P01', 'relation "secret_table" does not exist'));
    const crash = await payloadOf(new Error('password authentication failed for user "meliora"'));
    expect(unknownDbError).toEqual({ statusCode: 500, message: 'Erreur interne du service.' });
    expect(crash).toEqual({ statusCode: 500, message: 'Erreur interne du service.' });
    expect(logError).toHaveBeenCalledTimes(2);
  });

  it('answers HTTP requests of hybrid apps directly', async () => {
    const { host, response } = httpHost();
    const result = new AllRpcExceptionsFilter().catch(new NotFoundException('Porte introuvable.'), host);
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ statusCode: 404, message: 'Porte introuvable.' });
    await expect(lastValueFrom(result, { defaultValue: 'completed' })).resolves.toBe('completed');
  });
});
