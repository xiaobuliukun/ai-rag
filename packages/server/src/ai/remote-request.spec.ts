import {
  buildRemoteRequestUrl,
  normalizeRemoteBaseUrl,
  parseRemoteRequestTimeout,
} from './remote-request';

describe('remote request helpers', () => {
  it('allows absolute HTTP(S) URLs including local model endpoints', () => {
    expect(normalizeRemoteBaseUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1',
    );
    expect(normalizeRemoteBaseUrl('http://127.0.0.1:11434/v1')).toBe(
      'http://127.0.0.1:11434/v1',
    );
    expect(
      buildRemoteRequestUrl('http://localhost:11434/v1', '/chat/completions'),
    ).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('rejects missing protocols and dangerous URL schemes', () => {
    expect(() => normalizeRemoteBaseUrl('localhost:11434/v1')).toThrow(
      /http:\/\/ or https:\/\//,
    );
    expect(() => normalizeRemoteBaseUrl('file:///tmp/model')).toThrow(
      /http:\/\/ or https:\/\//,
    );
    expect(() => normalizeRemoteBaseUrl('ftp://example.com/v1')).toThrow(
      /http:\/\/ or https:\/\//,
    );
  });

  it('rejects query strings and fragments in base URLs', () => {
    expect(() =>
      normalizeRemoteBaseUrl('https://example.com/v1?key=x'),
    ).toThrow(/query string or fragment/);
    expect(() => normalizeRemoteBaseUrl('https://example.com/v1#chat')).toThrow(
      /query string or fragment/,
    );
  });

  it('bounds configurable remote request timeouts', () => {
    expect(parseRemoteRequestTimeout(undefined, 60_000)).toBe(60_000);
    expect(parseRemoteRequestTimeout('not-a-number', 60_000)).toBe(60_000);
    expect(parseRemoteRequestTimeout('500', 60_000)).toBe(60_000);
    expect(parseRemoteRequestTimeout('1500', 60_000)).toBe(1500);
    expect(parseRemoteRequestTimeout('999999', 60_000)).toBe(300_000);
  });
});
