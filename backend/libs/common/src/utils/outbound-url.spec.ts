import { BadRequestException } from '@nestjs/common';
import * as dns from 'dns';
import { csvEnv } from '../config/env';
import {
  AddressKind,
  assertOutboundAllowed,
  classifyAddress,
  hostsFromUrls,
  ipInCidrs,
  OutboundPolicy,
  parseOutboundUrl,
} from './outbound-url';

type LookupAnswer = { address: string; family: number }[];

/** Replaces dns.promises.lookup (no real DNS in tests). */
function mockLookup(answer: LookupAnswer | Error) {
  return jest
    .spyOn(dns.promises, 'lookup')
    .mockImplementation((async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    }) as never);
}

/** Expects assertOutboundAllowed to let `url` through. */
async function allows(url: string, policy?: OutboundPolicy): Promise<void> {
  await expect(assertOutboundAllowed(new URL(url), policy)).resolves.toBeUndefined();
}

/** The error assertOutboundAllowed throws for `url` (fails the test when it is allowed). */
async function refusal(url: string, policy?: OutboundPolicy): Promise<Error> {
  try {
    await assertOutboundAllowed(new URL(url), policy);
  } catch (err) {
    return err as Error;
  }
  throw new Error(`${url} was allowed`);
}

function parseError(raw: unknown): Error {
  try {
    parseOutboundUrl(raw);
  } catch (err) {
    return err as Error;
  }
  throw new Error(`${String(raw)} was accepted`);
}

afterEach(() => jest.restoreAllMocks());

describe('classifyAddress', () => {
  const cases: [AddressKind, string[]][] = [
    [
      'public',
      [
        '8.8.8.8',
        '93.184.216.34',
        '9.255.255.255',
        '11.0.0.0',
        '172.15.255.255',
        '172.32.0.0',
        '100.63.255.255',
        '100.128.0.0',
        '192.167.255.255',
        '192.169.0.0',
        '169.253.255.255',
        '223.255.255.255',
        '2606:4700:4700::1111',
        '2a00:1450:4007:80b::200e',
        '::ffff:8.8.8.8',
        '64:ff9b::808:808',
      ],
    ],
    [
      'private',
      [
        '10.0.0.1',
        '10.255.255.255',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.1.10',
        '100.64.0.1',
        '100.127.255.255',
        'fc00::1',
        'fd12:3456:789a::1',
        'fec0::1',
        '::ffff:10.0.0.1',
        '::ffff:a00:1',
        '0:0:0:0:0:ffff:c0a8:0101',
        '64:ff9b::a00:1',
        '64:ff9b::10.0.0.1',
      ],
    ],
    [
      'loopback',
      [
        '127.0.0.1',
        '127.255.255.254',
        '::1',
        '0:0:0:0:0:0:0:1',
        '::ffff:127.0.0.1',
        '::ffff:7f00:1',
        '64:ff9b::7f00:1',
      ],
    ],
    [
      'link-local',
      [
        '169.254.169.254',
        '169.254.0.1',
        'fe80::1',
        'fe80::1%en0',
        'febf::1',
        '::ffff:169.254.169.254',
        '::ffff:a9fe:a9fe',
      ],
    ],
    ['unspecified', ['0.0.0.0', '0.1.2.3', '::', '0:0:0:0:0:0:0:0', '::ffff:0.0.0.0']],
    ['multicast', ['224.0.0.1', '239.255.255.250', 'ff02::1', 'ff05::1:3', '::ffff:224.0.0.251']],
    [
      'reserved',
      [
        '240.0.0.1',
        '255.255.255.255',
        '192.0.0.8',
        '198.18.0.1',
        '198.19.255.255',
        '192.0.2.1',
        '203.0.113.5',
        '2001:db8::1',
        '2002:a00:1::1',
        '::127.0.0.1',
        '::ffff:0:a00:1',
        '4000::1',
      ],
    ],
  ];

  for (const [kind, ips] of cases) {
    it.each(ips)(`classifies %s as ${kind}`, (ip) => {
      expect(classifyAddress(ip)).toBe(kind);
    });
  }

  it('accepts bracketed IPv6 literals', () => {
    expect(classifyAddress('[::1]')).toBe('loopback');
    expect(classifyAddress('[2606:4700:4700::1111]')).toBe('public');
  });

  it.each(['example.com', '', '127.1', '0x7f.0.0.1', '256.0.0.1', '1.2.3', '::ffff:999.0.0.1'])(
    'never treats %p as public (not an IP literal)',
    (value) => {
      expect(classifyAddress(value)).toBe('reserved');
    },
  );
});

describe('ipInCidrs', () => {
  it('matches IPv4 CIDRs and plain IPs', () => {
    expect(ipInCidrs('10.1.2.3', ['10.0.0.0/8'])).toBe(true);
    expect(ipInCidrs('11.0.0.1', ['10.0.0.0/8'])).toBe(false);
    expect(ipInCidrs('192.168.1.50', ['192.168.1.50'])).toBe(true);
    expect(ipInCidrs('192.168.1.51', ['192.168.1.50'])).toBe(false);
    expect(ipInCidrs('172.20.0.4', ['192.168.1.0/24', '172.16.0.0/12'])).toBe(true);
  });

  it('matches IPv6 CIDRs and plain IPs', () => {
    expect(ipInCidrs('fd00::5', ['fd00::/8'])).toBe(true);
    expect(ipInCidrs('fe80::1', ['fd00::/8'])).toBe(false);
    expect(ipInCidrs('fd00::5', ['fd00::5'])).toBe(true);
    expect(ipInCidrs('[fd00::5]', ['fd00::/8'])).toBe(true);
  });

  it('matches IPv4-mapped IPv6 addresses against IPv4 CIDRs', () => {
    expect(ipInCidrs('::ffff:10.0.0.1', ['10.0.0.0/8'])).toBe(true);
    expect(ipInCidrs('::ffff:a00:1', ['10.0.0.0/8'])).toBe(true);
    expect(ipInCidrs('::ffff:a00:1', ['192.168.0.0/16'])).toBe(false);
  });

  it('never matches an IPv4 address with an IPv6 range', () => {
    expect(ipInCidrs('10.0.0.1', ['::/0'])).toBe(false);
  });

  it('ignores blank entries and trims the others', () => {
    expect(ipInCidrs('10.0.0.1', ['', '   ', ' 10.0.0.0/8 '])).toBe(true);
    expect(ipInCidrs('10.0.0.1', [])).toBe(false);
  });

  it('is false for something that is not an IP', () => {
    expect(ipInCidrs('example.com', ['10.0.0.0/8'])).toBe(false);
  });

  const malformed = ['10.0.0.0/33', 'not-an-ip', '10.0.0/8', 'fd00::/129', '10.0.0.0/8/9', '10.0.0.0/', '10.0.0.0/-1'];
  it.each([...malformed, '10.0.0.0/8a', 'fe80::1%en0/64'])('throws on the malformed entry %p', (entry) => {
    expect(() => ipInCidrs('10.0.0.1', ['192.168.0.0/16', entry])).toThrow(
      `Plage IP invalide dans la configuration : « ${entry} »`,
    );
  });
});

describe('parseOutboundUrl', () => {
  it('returns the URL for http and https', () => {
    expect(parseOutboundUrl('https://hooks.example.com/run?id=1').href).toBe('https://hooks.example.com/run?id=1');
    expect(parseOutboundUrl('  http://example.com:8080/x  ').href).toBe('http://example.com:8080/x');
  });

  it.each([undefined, null, 42, {}, '', '   ', 'not a url', '/relative/path'])('refuses %p', (raw) => {
    const error = parseError(raw);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('URL invalide.');
  });

  const otherSchemes = ['ftp://example.com/', 'file:///etc/passwd', 'gopher://example.com/', 'javascript:alert(1)'];
  it.each([...otherSchemes, 'data:text/plain,x'])('refuses the scheme of %s', (raw) => {
    const error = parseError(raw);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('URL invalide : seuls les protocoles http et https sont acceptés.');
  });

  it.each(['http://user:pass@example.com/', 'http://user@example.com/', 'https://:secret@example.com/'])(
    'refuses credentials in %s',
    (raw) => {
      const error = parseError(raw);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe("URL invalide : retirez l'identifiant et le mot de passe de l'URL.");
    },
  );

  it('limits the length to 2048 characters', () => {
    const base = 'https://example.com/';
    expect(parseOutboundUrl(base + 'a'.repeat(2048 - base.length)).href).toHaveLength(2048);
    const error = parseError(base + 'a'.repeat(2049 - base.length));
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('URL trop longue (2048 caractères maximum).');
  });
});

describe('assertOutboundAllowed', () => {
  describe('IP literals (no DNS)', () => {
    let lookup: jest.SpyInstance;
    beforeEach(() => {
      lookup = mockLookup(new Error('no DNS for IP literals'));
    });
    afterEach(() => expect(lookup).not.toHaveBeenCalled());

    it.each([
      'https://93.184.216.34/hook',
      'http://8.8.8.8:8080/x',
      'https://[2606:4700:4700::1111]/',
      'http://[::ffff:8.8.8.8]/',
      'http://[64:ff9b::808:808]/',
    ])('allows the public address %s', async (url) => {
      await allows(url);
    });

    it.each([
      ['http://127.0.0.1:5678/webhook', '127.0.0.1'],
      ['http://169.254.169.254/latest/meta-data/', '169.254.169.254'],
      ['http://[::1]:4000/api', '[::1]'],
      ['http://[fe80::1]/', '[fe80::1]'],
      ['http://0.0.0.0:4000/', '0.0.0.0'],
      ['http://[::]/', '[::]'],
      ['http://10.0.0.5/', '10.0.0.5'],
      ['http://172.20.1.1/', '172.20.1.1'],
      ['http://192.168.1.1/admin', '192.168.1.1'],
      ['http://100.64.0.1/', '100.64.0.1'],
      ['http://[fd00::1]/', '[fd00::1]'],
      ['http://224.0.0.1/', '224.0.0.1'],
      ['http://255.255.255.255/', '255.255.255.255'],
      ['http://240.0.0.1/', '240.0.0.1'],
      ['http://198.18.0.1/', '198.18.0.1'],
      ['http://192.0.0.1/', '192.0.0.1'],
      ['http://[::ffff:127.0.0.1]/', '[::ffff:7f00:1]'],
      ['http://[::ffff:a9fe:a9fe]/latest/meta-data/', '[::ffff:a9fe:a9fe]'],
      ['http://[64:ff9b::7f00:1]/', '[64:ff9b::7f00:1]'],
    ])('refuses %s', async (url, host) => {
      const error = await refusal(url);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe(`Destination interdite : ${host}`);
    });

    it.each([
      ['http://2130706433/', '127.0.0.1'],
      ['http://0x7f.1/', '127.0.0.1'],
      ['http://0x7f000001/', '127.0.0.1'],
      ['http://017700000001/', '127.0.0.1'],
      ['http://127.1/', '127.0.0.1'],
      ['http://0/', '0.0.0.0'],
      ['http://0xa9.0xfe.0xa9.0xfe/', '169.254.169.254'],
      ['http://0x0a.0.0.1/', '10.0.0.1'],
      ['http://[0:0:0:0:0:ffff:7f00:1]/', '[::ffff:7f00:1]'],
    ])('refuses the disguised address %s (read as %s)', async (url, host) => {
      const error = await refusal(url);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe(`Destination interdite : ${host}`);
    });

    it('allows a private address inside allowPrivateCidrs only', async () => {
      const policy = { allowPrivateCidrs: ['192.168.1.0/24', 'fd00::/8'] };
      await allows('http://192.168.1.50/relay', policy);
      await allows('http://[::ffff:192.168.1.50]/', policy);
      await allows('http://[fd00::7]/', policy);
      expect((await refusal('http://192.168.2.50/', policy)).message).toBe('Destination interdite : 192.168.2.50');
      expect((await refusal('http://10.0.0.1/', policy)).message).toBe('Destination interdite : 10.0.0.1');
    });

    it('never lets allowPrivateCidrs open loopback, link-local or unspecified addresses', async () => {
      const policy = { allowPrivateCidrs: ['0.0.0.0/0', '::/0'] };
      for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/', 'http://0.0.0.0/', 'http://[::1]/']) {
        expect(await refusal(url, policy)).toBeInstanceOf(BadRequestException);
      }
      await allows('http://10.9.8.7/', policy);
    });

    it('throws a plain Error for a malformed allowPrivateCidrs entry, even for a public address', async () => {
      const error = await refusal('https://93.184.216.34/', { allowPrivateCidrs: ['192.168.1.0/33'] });
      expect(error).not.toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('Plage IP invalide dans la configuration : « 192.168.1.0/33 »');
    });

    it('refuses other schemes and credentials even when built by hand', async () => {
      expect((await refusal('ftp://93.184.216.34/')).message).toBe(
        'URL invalide : seuls les protocoles http et https sont acceptés.',
      );
      expect(await refusal('http://user:pass@93.184.216.34/')).toBeInstanceOf(BadRequestException);
    });
  });

  describe('allowHosts', () => {
    let lookup: jest.SpyInstance;
    beforeEach(() => {
      lookup = mockLookup([{ address: '127.0.0.1', family: 4 }]);
    });

    it('skips every check for a trusted host:port, case-insensitively', async () => {
      const policy = { allowHosts: ['LocalHost:5678'] };
      await allows('http://localhost:5678/webhook/x', policy);
      await allows('http://LOCALHOST:5678/', policy);
      expect(lookup).not.toHaveBeenCalled();
    });

    it('requires the same port when the entry has one', async () => {
      const error = await refusal('http://localhost:5679/', { allowHosts: ['localhost:5678'] });
      expect(error.message).toBe('Destination interdite : localhost');
      expect(lookup).toHaveBeenCalled();
    });

    it('matches any port when the entry has none, and the default port when it has one', async () => {
      await allows('http://n8n:5678/', { allowHosts: ['n8n'] });
      await allows('http://n8n/', { allowHosts: ['n8n:80'] });
      await allows('https://n8n/', { allowHosts: ['n8n:443'] });
      await allows('http://127.0.0.1:5678/', { allowHosts: ['127.0.0.1:5678'] });
      await allows('http://[::1]:5678/', { allowHosts: ['[::1]:5678'] });
      expect(lookup).not.toHaveBeenCalled();
    });

    it('does not trust a host that merely contains an allowed name', async () => {
      expect((await refusal('http://n8n.evil.test:5678/', { allowHosts: ['n8n:5678'] })).message).toBe(
        'Destination interdite : n8n.evil.test',
      );
      expect((await refusal('http://localhost.:5678/', { allowHosts: ['localhost:5678'] })).message).toBe(
        'Destination interdite : localhost.',
      );
    });
  });

  describe('host names', () => {
    it('resolves every address of the host and allows public ones', async () => {
      const lookup = mockLookup([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ]);
      await allows('https://hooks.example.com/x');
      expect(lookup).toHaveBeenCalledWith('hooks.example.com', { all: true, verbatim: true });
    });

    it('refuses when any resolved address is not public', async () => {
      mockLookup([
        { address: '93.184.216.34', family: 4 },
        { address: '::1', family: 6 },
      ]);
      expect((await refusal('https://mixed.example.com/')).message).toBe('Destination interdite : mixed.example.com');
    });

    it('refuses a host that resolves to a private address unless allowed', async () => {
      mockLookup([{ address: '10.0.0.7', family: 4 }]);
      expect((await refusal('http://internal.example.com/')).message).toBe(
        'Destination interdite : internal.example.com',
      );
      await allows('http://internal.example.com/', { allowPrivateCidrs: ['10.0.0.0/24'] });
    });

    it('refuses a host that does not resolve', async () => {
      mockLookup(Object.assign(new Error('getaddrinfo ENOTFOUND nowhere.invalid'), { code: 'ENOTFOUND' }));
      const error = await refusal('https://nowhere.invalid/');
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('Destination introuvable : nowhere.invalid');

      mockLookup([]);
      expect((await refusal('https://empty.example.com/')).message).toBe(
        'Destination introuvable : empty.example.com',
      );
    });
  });
});

describe('hostsFromUrls', () => {
  it('returns host:port of each valid http(s) URL, once, with the default port written out', () => {
    expect(
      hostsFromUrls(
        'http://n8n:5678/webhook/meliora-events',
        undefined,
        '',
        'not a url',
        'https://Hooks.Example.com/x',
        'http://n8n:5678/webhook/other',
        'ftp://files.example.com/x',
      ),
    ).toEqual(['n8n:5678', 'hooks.example.com:443']);
  });

  it('trusts only the port of a URL written without one', async () => {
    mockLookup([{ address: '172.18.0.5', family: 4 }]);
    const allowHosts = hostsFromUrls('https://n8n.example.com/webhook/meliora-events');
    await allows('https://n8n.example.com/webhook/x', { allowHosts });
    expect((await refusal('http://n8n.example.com:6379/', { allowHosts })).message).toBe(
      'Destination interdite : n8n.example.com',
    );
  });

  it('builds an allow-list that assertOutboundAllowed accepts', async () => {
    const lookup = mockLookup([{ address: '172.18.0.5', family: 4 }]);
    const webhookUrl = 'http://n8n:5678/webhook/meliora-events';
    await allows(webhookUrl, { allowHosts: hostsFromUrls(webhookUrl) });
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('csvEnv', () => {
  const name = 'MELIORA_TEST_CSV_ENV';
  afterEach(() => {
    delete process.env[name];
  });

  it('splits on commas and drops blank entries', () => {
    process.env[name] = ' n8n:5678, ,localhost:5678 ,, 192.168.1.0/24 ';
    expect(csvEnv(name)).toEqual(['n8n:5678', 'localhost:5678', '192.168.1.0/24']);
  });

  it('is empty when the variable is unset or blank', () => {
    expect(csvEnv(name)).toEqual([]);
    process.env[name] = '  ';
    expect(csvEnv(name)).toEqual([]);
  });
});
