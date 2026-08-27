function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const decoded = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyEs256Jwt(
  token: string,
  publicJwkJson: string,
  expectedAudience: string,
  expectedIssuer: string
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader)));
    if (header.alg !== 'ES256' || header.typ !== 'JWT') return null;
    const key = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(publicJwkJson),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64UrlDecode(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== expectedIssuer || payload.aud !== expectedAudience) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= now) return null;
    if (!Number.isFinite(payload.iat) || payload.iat > now + 60) return null;
    return payload;
  } catch {
    return null;
  }
}

export function randomSecret(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64UrlEncode(bytes);
}
