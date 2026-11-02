import { RpcError } from './rpc-error';

describe('RpcError (error shape carried across the bus)', () => {
  it('keeps the status, the French message and the pattern', () => {
    const error = new RpcError(404, 'Membre introuvable.', 'members.get');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RpcError');
    expect(error.message).toBe('Membre introuvable.');
    expect(error.pattern).toBe('members.get');
    expect(error.toPayload()).toEqual({ statusCode: 404, message: 'Membre introuvable.' });
  });

  it('joins validation messages for logs but sends them back as a list', () => {
    const error = new RpcError(400, ['email must be an email', 'password is too short']);
    expect(error.message).toBe('email must be an email, password is too short');
    expect(error.toPayload().message).toEqual(['email must be an email', 'password is too short']);
  });

  describe('RpcError.from', () => {
    it('returns an RpcError unchanged', () => {
      const error = new RpcError(409, 'Cette valeur existe déjà.');
      expect(RpcError.from(error, 'other.pattern')).toBe(error);
    });

    it('turns a bus timeout into 503 naming the pattern', () => {
      const timeout = Object.assign(new Error('Timeout has occurred'), { name: 'TimeoutError' });
      expect(RpcError.from(timeout, 'members.profile').toPayload()).toEqual({
        statusCode: 503,
        message: 'Service indisponible (members.profile)',
      });
      expect(RpcError.from(timeout).message).toBe('Service indisponible (rpc)');
    });

    it('keeps the { statusCode, message } sent by a service', () => {
      const error = RpcError.from({ statusCode: 409, message: 'Cette valeur existe déjà.' }, 'plans.create');
      expect(error.statusCode).toBe(409);
      expect(error.details).toBe('Cette valeur existe déjà.');
      expect(error.pattern).toBe('plans.create');
    });

    it('reads `status` too, and numeric strings', () => {
      expect(RpcError.from({ status: 403, message: ['Accès refusé.'] }).toPayload()).toEqual({
        statusCode: 403,
        message: ['Accès refusé.'],
      });
      expect(RpcError.from({ statusCode: '404', message: 'Séance introuvable.' }).statusCode).toBe(404);
    });

    it('defaults the message of an error status without one', () => {
      expect(RpcError.from({ statusCode: 502 }).toPayload()).toEqual({ statusCode: 502, message: 'Erreur interne' });
    });

    it('maps anything that is not a 4xx/5xx to 500', () => {
      expect(RpcError.from({ statusCode: 200, message: 'ok?' }).toPayload()).toEqual({ statusCode: 500, message: 'ok?' });
      expect(RpcError.from(new Error('connect ECONNREFUSED')).statusCode).toBe(500);
      expect(RpcError.from({ statusCode: 302 }).toPayload()).toEqual({ statusCode: 500, message: 'Erreur interne' });
    });

    it.each([null, undefined, 'boom', 42])('maps %p to a generic 500', (value) => {
      expect(RpcError.from(value).toPayload()).toEqual({ statusCode: 500, message: 'Erreur interne' });
    });
  });
});
