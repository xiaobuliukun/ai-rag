import { REPLACE_BACKUP_CONFIRMATION } from '@moxu/shared';
import {
  createApiHeaders,
  getApiAccessToken,
  importBackup,
} from './api';

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

  it('includes the explicit confirmation token for replace imports', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          indexPending: false,
          message: 'Imported',
          booksImported: 0,
          chaptersImported: 0,
          bookmarksImported: 0,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    try {
      await importBackup(
        {
          version: 1,
          exportedAt: '2026-08-09T00:00:00.000Z',
          books: [],
          bookmarks: [],
        },
        'replace',
      );

      const requestBody = JSON.parse(
        String(fetchSpy.mock.calls[0]?.[1]?.body),
      );
      expect(requestBody).toMatchObject({
        mode: 'replace',
        replaceConfirmation: REPLACE_BACKUP_CONFIRMATION,
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
