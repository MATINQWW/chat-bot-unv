// One-time import of the bundled JSONL to Supabase REST API.
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
const fs = require('fs');
const path = require('path');
async function main() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const file = path.join(process.cwd(), 'data', 'knowledge_records_v1.jsonl');
  const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
    const r = JSON.parse(line);
    return { ...r, published_at: r.published_at || null, valid_until: r.valid_until || null };
  });
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const response = await fetch(`${url}/rest/v1/knowledge_records?on_conflict=id`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error(`Import batch ${i / 100 + 1} failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    console.log(`Imported ${Math.min(i + batch.length, rows.length)}/${rows.length}`);
  }
  console.log('Import complete. All records remain unverified until reviewed.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
