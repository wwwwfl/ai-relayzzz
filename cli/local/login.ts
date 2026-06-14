// ============================================================
// AI Relay CLI — Device Login
// ============================================================

import { saveProfile } from './profile.js';

interface LoginOptions {
  device_name: string;
  platform: string;
}

export async function login(cloudUrl: string, options: LoginOptions) {
  console.log(`🔗 Connecting to ${cloudUrl}...`);

  const response = await fetch(`${cloudUrl}/api/local/devices/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_name: options.device_name,
      platform: options.platform,
    }),
  });

  if (!response.ok) {
    console.error('❌ Failed to create device session');
    process.exit(1);
  }

  const { device_code, device_id, verification_url, expires_in } = await response.json();

  console.log('\n📱 Please verify this device in your browser:');
  console.log(`   ${verification_url}`);
  console.log(`\n⏱  Code expires in ${Math.floor(expires_in / 60)} minutes\n`);
  console.log('   Waiting for verification...');

  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < expires_in * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    attempt++;

    const pollResponse = await fetch(
      `${cloudUrl}/api/local/devices/session?code=${device_code}`
    );

    if (!pollResponse.ok) {
      if (pollResponse.status === 410) {
        console.error('\n❌ Session expired. Please run login again.');
        process.exit(1);
      }
      continue;
    }

    const result = await pollResponse.json();

    if (result.status === 'completed') {
      console.log('✅ Device verified!\n');

      await saveProfile({
        cloudUrl,
        deviceId: result.device_id,
        deviceToken: result.device_token,
        deviceName: options.device_name,
      });

      console.log(`✨ Login successful!`);
      console.log(`   Device ID: ${result.device_id}`);
      console.log(`\n👉 Next: Run "airelay local:start" to start the relay\n`);
      return;
    }

    if (attempt % 5 === 0) {
      console.log(`   Still waiting... (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`);
    }
  }

  console.error('\n❌ Timeout waiting for verification');
  process.exit(1);
}
