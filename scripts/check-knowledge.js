const { loadRecords, getKnowledgeSummary, retrieveKnowledge } = require('../lib/knowledge');
async function main() {
  const records = loadRecords();
  if (!records.length) throw new Error('Knowledge base is empty');
  const ids = new Set();
  for (const r of records) {
    if (!r.id || !r.content || !r.category) throw new Error(`Invalid record: ${r.id || '(missing id)'}`);
    if (ids.has(r.id)) throw new Error(`Duplicate id: ${r.id}`);
    ids.add(r.id);
  }
  const summary = getKnowledgeSummary();
  const sample = await retrieveKnowledge('معرفی رشته تکنولوژی اتاق عمل', 3000);
  if (!sample.sources.length) throw new Error('Retrieval smoke test returned no results');
  console.log(JSON.stringify({ records: records.length, categories: Object.keys(summary.byCategory).length, verified: summary.verifiedForOfficialClaims, sampleSources: sample.sources.slice(0, 3).map(s => s.id), backend: sample.backend }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
