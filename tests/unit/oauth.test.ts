import { describe, expect, it } from 'vitest';
import { createGoogleOAuthAttempt, googleAuthorizationUrl, googleRedirectUri, verifyGoogleOAuthAttempt } from '../../lib/services/google-oauth';

const secret = 'oauth-unit-test-secret-with-at-least-32-characters';

describe('Google OAuth PKCE boundary', () => {
  it('creates a signed, expiring attempt bound to state', async () => {
    const attempt = await createGoogleOAuthAttempt(secret, 'guest-1', 1_700_000_000_000);
    expect(attempt.verifier.length).toBeGreaterThan(43);
    expect(attempt.challenge).not.toBe(attempt.verifier);
    await expect(verifyGoogleOAuthAttempt(attempt.token, attempt.state, secret, 1_700_000_001_000)).resolves.toMatchObject({ guestUserId: 'guest-1', state: attempt.state });
    await expect(verifyGoogleOAuthAttempt(attempt.token, 'wrong', secret, 1_700_000_001_000)).resolves.toBeNull();
    await expect(verifyGoogleOAuthAttempt(attempt.token, attempt.state, secret, 1_700_001_000_000)).resolves.toBeNull();
  });

  it('uses only fixed Google endpoints and trusted callback origins', () => {
    expect(googleRedirectUri('https://app.example/request', 'https://game.example/path')).toBe('https://game.example/api/auth/google/callback');
    expect(googleRedirectUri('http://evil.example/request')).toBeNull();
    expect(googleRedirectUri('http://localhost:3000/request')).toBe('http://localhost:3000/api/auth/google/callback');
    const authorization = new URL(googleAuthorizationUrl('client-id', 'https://game.example/api/auth/google/callback', 'state', 'challenge'));
    expect(authorization.origin).toBe('https://accounts.google.com');
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('scope')).toContain('openid');
  });
});
