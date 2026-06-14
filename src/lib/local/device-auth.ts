// ============================================================
// AI Relay — Local Device Authentication
// ============================================================

/**
 * Hash a device token using HMAC-SHA256.
 * Used for storing device credentials securely in KV/database.
 *
 * @throws {Error} If DEVICE_TOKEN_SECRET environment variable is not set
 */
export async function hashDeviceToken(token: string): Promise<string> {
  const secret = process.env.DEVICE_TOKEN_SECRET;

  if (!secret) {
    throw new Error(
      'DEVICE_TOKEN_SECRET environment variable is required for device authentication. ' +
      'Please set it to a strong, random secret (e.g., generate with: openssl rand -hex 32)'
    );
  }

  const encoder = new TextEncoder();
  const secretData = encoder.encode(secret);
  const tokenData = encoder.encode(token);

  const key = await crypto.subtle.importKey(
    'raw',
    secretData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, tokenData);

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
