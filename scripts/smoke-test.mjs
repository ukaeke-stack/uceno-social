import assert from 'node:assert/strict';

const base = (process.env.UCENO_BASE_URL || 'https://uceno-social.onrender.com').replace(/\/$/, '');
const checks = [
  { name: 'home page responds', path: '/', expected: [200] },
  { name: 'account page responds', path: '/account', expected: [200] },
  { name: 'session endpoint responds', path: '/api/auth/me', expected: [200] },
  { name: 'media signature rejects anonymous uploads', path: '/api/media/signature', method: 'POST', expected: [401] },
  { name: 'call token rejects anonymous calls', path: '/api/calls/token', method: 'POST', body: { room: 'smoke-test-room', mode: 'audio' }, expected: [401] },
  { name: 'messages list requires authentication', path: '/api/conversations', expected: [401] },
  { name: 'community list requires authentication', path: '/api/communities', expected: [401] },
];

let failed = 0;
for (const check of checks) {
  try {
    const response = await fetch(base + check.path, {
      method: check.method || 'GET',
      headers: check.body ? { 'Content-Type': 'application/json' } : undefined,
      body: check.body ? JSON.stringify(check.body) : undefined,
      redirect: 'manual',
    });
    const ok = check.expected.includes(response.status);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.name} (HTTP ${response.status})`);
    if (!ok) failed++;
    await response.body?.cancel();
  } catch (error) {
    failed++;
    console.error(`FAIL ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
assert.equal(failed, 0, `${failed} smoke check(s) failed`);
console.log(`All ${checks.length} public/auth-boundary smoke checks passed.`);
