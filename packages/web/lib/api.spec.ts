import { createApiHeaders, getApiAccessToken } from './api';

describe('API access token headers', () => {
  const originalToken = process.env.NEXT_PUBLIC_API_ACCESS_TOKEN;
  const originalServerToken = process.env.API_ACCESS_TOKEN;

  beforeEach(() => {
    delete process.env.API_ACCESS_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.NEXT_PUBLIC_API_ACCESS_TOKEN;
    } else {
      process.env.NEXT_PUBLIC_API_ACCESS_TOKEN = originalToken;
    }
    if (originalServerToken === undefined) {
      delete process.env.API_ACCESS_TOKEN;
    } else {
      process.env.API_ACCESS_TOKEN = originalServerToken;
    }
  });

  it('adds a configured Bearer token to API requests', () => {
    process.env.NEXT_PUBLIC_API_ACCESS_TOKEN = ' test-token ';

    expect(getApiAccessToken()).toBe('test-token');
    expect(createApiHeaders().get('Authorization')).toBe(
      'Bearer test-token',
    );
  });

  it('does not override an explicitly supplied Authorization header', () => {
    process.env.NEXT_PUBLIC_API_ACCESS_TOKEN = 'default-token';

    expect(
      createApiHeaders({ Authorization: 'Bearer per-request' }).get(
        'Authorization',
      ),
    ).toBe('Bearer per-request');
  });
});
