import {
  createLocalAccessGuard,
  createCorsOptions,
  isAccessTokenValid,
  isCorsOriginAllowed,
  isLocalRemoteAddress,
  isLocalRequest,
  isRemoteApiAllowed,
  isRequestHostAllowed,
  parseCorsOrigins,
} from './cors';

describe('CORS configuration', () => {
  const originalCorsOrigins = process.env.CORS_ORIGINS;
  const originalCorsOrigin = process.env.CORS_ORIGIN;
  const originalAllowRemoteApi = process.env.ALLOW_REMOTE_API;
  const originalApiAccessToken = process.env.API_ACCESS_TOKEN;

  afterEach(() => {
    restoreEnv('CORS_ORIGINS', originalCorsOrigins);
    restoreEnv('CORS_ORIGIN', originalCorsOrigin);
    restoreEnv('ALLOW_REMOTE_API', originalAllowRemoteApi);
    restoreEnv('API_ACCESS_TOKEN', originalApiAccessToken);
  });

  it('defaults to local web origins', () => {
    delete process.env.CORS_ORIGINS;
    delete process.env.CORS_ORIGIN;

    expect(parseCorsOrigins()).toEqual([
      'http://127.0.0.1:3000',
      'http://localhost:3000',
    ]);
  });

  it('parses comma-separated origins', () => {
    expect(
      parseCorsOrigins(' http://127.0.0.1:3000, https://example.test ,, '),
    ).toEqual(['http://127.0.0.1:3000', 'https://example.test']);
  });

  it('allows server-to-server requests and configured browser origins', () => {
    const allowedOrigins = ['http://127.0.0.1:3000'];

    expect(isCorsOriginAllowed(undefined, allowedOrigins)).toBe(true);
    expect(isCorsOriginAllowed('http://127.0.0.1:3000', allowedOrigins)).toBe(
      true,
    );
    expect(isCorsOriginAllowed('https://example.test', allowedOrigins)).toBe(
      false,
    );
  });

  it('supports an explicit wildcard override', () => {
    expect(isCorsOriginAllowed('https://example.test', ['*'])).toBe(true);
  });

  it('creates Nest-compatible CORS options', () => {
    const options = createCorsOptions();
    const callback = jest.fn();

    expect(typeof options.origin).toBe('function');
    if (typeof options.origin === 'function') {
      options.origin('http://127.0.0.1:3000', callback);
    }

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('restricts request hosts to local hosts by default', () => {
    delete process.env.ALLOW_REMOTE_API;

    expect(isRequestHostAllowed()).toBe(false);
    expect(isRequestHostAllowed('localhost:3001')).toBe(true);
    expect(isRequestHostAllowed('127.0.0.1:3001')).toBe(true);
    expect(isRequestHostAllowed('[::1]:3001')).toBe(true);
    expect(isRequestHostAllowed('10.0.2.2:3001')).toBe(true);
    expect(isRequestHostAllowed('192.168.1.10:3001')).toBe(false);
  });

  it('allows remote API access only through an explicit override', () => {
    process.env.ALLOW_REMOTE_API = 'true';

    expect(isRemoteApiAllowed()).toBe(true);
    expect(isRequestHostAllowed('192.168.1.10:3001')).toBe(true);
  });

  it('recognizes loopback socket addresses including IPv4-mapped IPv6', () => {
    expect(isLocalRemoteAddress('127.0.0.1')).toBe(true);
    expect(isLocalRemoteAddress('127.8.9.10')).toBe(true);
    expect(isLocalRemoteAddress('::1')).toBe(true);
    expect(isLocalRemoteAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLocalRemoteAddress('::ffff:192.168.1.10')).toBe(false);
    expect(isLocalRemoteAddress('192.168.1.10')).toBe(false);
    expect(isLocalRemoteAddress()).toBe(false);
  });

  it('requires both a local Host and a local socket address', () => {
    expect(isLocalRequest('localhost:3001', '127.0.0.1')).toBe(true);
    expect(isLocalRequest('[::1]:3001', '::1')).toBe(true);
    expect(isLocalRequest('10.0.2.2:3001', '127.0.0.1')).toBe(true);
    expect(isLocalRequest('localhost:3001', '192.168.1.10')).toBe(false);
    expect(isLocalRequest('10.0.2.2:3001', '192.168.1.10')).toBe(false);
    expect(isLocalRequest('192.168.1.10:3001', '127.0.0.1')).toBe(false);
  });

  it('does not let a remote client bypass the guard with a forged local Host', () => {
    delete process.env.ALLOW_REMOTE_API;
    const result = runGuard({
      host: 'localhost:3001',
      remoteAddress: '192.168.1.20',
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
  });

  it('rejects browser requests from untrusted origins even over loopback', () => {
    const rejected = runGuard({
      host: '127.0.0.1:3001',
      remoteAddress: '127.0.0.1',
      origin: 'https://malicious.example',
    });
    expect(rejected.next).not.toHaveBeenCalled();
    expect(rejected.status).toHaveBeenCalledWith(403);

    const accepted = runGuard({
      host: '127.0.0.1:3001',
      remoteAddress: '127.0.0.1',
      origin: 'http://127.0.0.1:3000',
    });
    expect(accepted.next).toHaveBeenCalledTimes(1);
  });

  it('keeps local requests token-free even when an access token is configured', () => {
    process.env.API_ACCESS_TOKEN = 'secret-token';
    const result = runGuard({
      host: '127.0.0.1:3001',
      remoteAddress: '::ffff:127.0.0.1',
    });

    expect(result.next).toHaveBeenCalledTimes(1);
    expect(result.status).not.toHaveBeenCalled();
  });

  it('requires the configured Bearer token for remote API requests', () => {
    process.env.ALLOW_REMOTE_API = 'true';
    process.env.API_ACCESS_TOKEN = 'secret-token';

    const rejected = runGuard({
      host: '192.168.1.10:3001',
      remoteAddress: '192.168.1.20',
      authorization: 'Bearer wrong-token',
    });
    expect(rejected.next).not.toHaveBeenCalled();
    expect(rejected.status).toHaveBeenCalledWith(401);
    expect(rejected.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer',
    );

    const accepted = runGuard({
      host: '192.168.1.10:3001',
      remoteAddress: '192.168.1.20',
      authorization: 'Bearer secret-token',
    });
    expect(accepted.next).toHaveBeenCalledTimes(1);
  });

  it('rejects remote API access when no access token is configured', () => {
    process.env.ALLOW_REMOTE_API = 'true';
    delete process.env.API_ACCESS_TOKEN;

    const result = runGuard({
      host: '192.168.1.10:3001',
      remoteAddress: '192.168.1.20',
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
  });

  it('validates Bearer tokens without accepting other auth schemes', () => {
    expect(isAccessTokenValid('Bearer secret-token', 'secret-token')).toBe(
      true,
    );
    expect(isAccessTokenValid('Basic secret-token', 'secret-token')).toBe(
      false,
    );
    expect(isAccessTokenValid(undefined, 'secret-token')).toBe(false);
    expect(isAccessTokenValid(undefined, undefined)).toBe(false);
  });
});

function restoreEnv(
  name:
    | 'CORS_ORIGINS'
    | 'CORS_ORIGIN'
    | 'ALLOW_REMOTE_API'
    | 'API_ACCESS_TOKEN',
  value?: string,
) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function runGuard({
  host,
  remoteAddress,
  authorization,
  origin,
}: {
  host?: string;
  remoteAddress?: string;
  authorization?: string;
  origin?: string;
}) {
  const next = jest.fn();
  const status = jest.fn();
  const json = jest.fn();
  const setHeader = jest.fn();
  const response = {
    status: status.mockReturnThis(),
    json,
    setHeader,
  };

  createLocalAccessGuard()(
    {
      headers: { host, authorization, origin },
      socket: { remoteAddress },
    } as never,
    response as never,
    next,
  );

  return { next, status, json, setHeader };
}
