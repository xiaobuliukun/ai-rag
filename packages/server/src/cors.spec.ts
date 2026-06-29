import {
  createCorsOptions,
  isCorsOriginAllowed,
  parseCorsOrigins,
} from './cors';

describe('CORS configuration', () => {
  const originalCorsOrigins = process.env.CORS_ORIGINS;
  const originalCorsOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    restoreEnv('CORS_ORIGINS', originalCorsOrigins);
    restoreEnv('CORS_ORIGIN', originalCorsOrigin);
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
});

function restoreEnv(name: 'CORS_ORIGINS' | 'CORS_ORIGIN', value?: string) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
