/**
 * Prove draw autonomy without Dashboard: POST reconcile only (no operator secret).
 * Usage: node scripts/bt-prod-smoke-reconcile.mjs [tournamentId]
 */
const PROD = process.env.BT_SMOKE_BASE_URL || 'https://ollo-pasidaojk.vercel.app';
const tid = process.argv[2] || '';

async function reconcile(tournamentId) {
  const res = await fetch(`${PROD}/api/bt-draw-reconcile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tournamentId }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  // Security: GET must not mutate
  const getTick = await fetch(`${PROD}/api/bt-draw-tick`, { method: 'GET' });
  console.log('tick_GET_status', getTick.status);
  if (getTick.status === 200) {
    console.error('FAIL: GET /api/bt-draw-tick must not succeed');
    process.exit(1);
  }

  const unauthTick = await fetch(`${PROD}/api/bt-draw-tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  console.log('tick_POST_unauth_status', unauthTick.status);
  if (unauthTick.status === 200) {
    console.error('FAIL: anonymous POST /api/bt-draw-tick must not succeed');
    process.exit(1);
  }

  if (!tid) {
    console.log('smoke_security_ok (pass tournamentId to exercise reconcile)');
    return;
  }

  const before = await reconcile(tid);
  console.log('reconcile_1', JSON.stringify(before));
  if (before.status !== 200 || !before.body.ok) {
    console.error('FAIL reconcile');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500));
  const again = await reconcile(tid);
  console.log('reconcile_2', JSON.stringify(again));
  console.log('smoke_reconcile_ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
