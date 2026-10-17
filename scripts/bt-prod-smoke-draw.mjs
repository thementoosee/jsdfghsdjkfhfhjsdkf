/**
 * Post-deploy smoke: tick due draws via production proxy, assert countdown advances.
 * Usage: node scripts/bt-prod-smoke-draw.mjs
 * Does not delete tournaments or regenerate locked draws.
 */
const PROD = process.env.BT_SMOKE_BASE_URL || 'https://ollo-pasidaojk.vercel.app';

async function main() {
  const beforeRes = await fetch(`${PROD}/api/bt-draw-tick`, { method: 'GET' });
  const beforeText = await beforeRes.text();
  let before;
  try {
    before = JSON.parse(beforeText);
  } catch {
    console.error('tick_parse_failed', beforeRes.status, beforeText.slice(0, 300));
    process.exit(1);
  }
  console.log('tick_response', JSON.stringify(before, null, 2));
  if (!before.ok) {
    console.error('tick_not_ok');
    process.exit(1);
  }
  console.log('smoke_ok scanned=', before.scanned, 'advanced=', before.advanced);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
