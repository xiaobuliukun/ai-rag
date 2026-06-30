import {
  createCorsOptions,
  isCorsOriginAllowed,
  isRemoteApiAllowed,
  isRequestHostAllowed,
  parseCorsOrigins,
} from './cors';

describe('CORS configuration', () => {
  const originalCorsOrigins = process.env.CORS_ORIGINS;
  const originalCorsOrigin = process.env.CORS_ORIGIN;
  const originalAllowRemoteApi = process.env.ALLOW_REMOTE_API;

  afterEach(() => {
    restoreEnv('CORS_ORIGINS', originalCorsOrigins);
    restoreEnv('CORS_ORIGIN', originalCorsOrigin);
    restoreEnv('ALLOW_REMOTE_API', originalAllowRemoteApi);
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

    expect(isRequestHostAllowed('localhost:3001')).toBe(true);
    expect(isRequestHostAllowed('127.0.0.1:3001')).toBe(true);
    expect(isRequestHostAllowed('[::1]:3001')).toBe(true);
    expect(isRequestHostAllowed('192.168.1.10:3001')).toBe(false);
  });

  it('allows remote API access only through an explicit override', () => {
    process.env.ALLOW_REMOTE_API = 'true';

    expect(isRemoteApiAllowed()).toBe(true);
    expect(isRequestHostAllowed('192.168.1.10:3001')).toBe(true);
  });
});

function restoreEnv(
  name: 'CORS_ORIGINS' | 'CORS_ORIGIN' | 'ALLOW_REMOTE_API',
  value?: string,
) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
