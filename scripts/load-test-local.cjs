const http = require('node:http');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.chdir(root);
process.env.TRUST_PROXY = '1';
process.env.CHAT_SIGNING_SECRET = 'load-test-signing-secret-please-rotate';
process.env.LOAD_TEST_KEY = 'local-only-not-a-real-secret';

// Minimal OpenAI-compatible adapter for a local, deterministic mock provider.
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'openai') {
    return class OpenAI {
      constructor(opts) {
        this.opts = opts;
        this.chat = { completions: { create: async (body) => {
          const response = await fetch(this.opts.baseURL + 'chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.opts.apiKey },
            body: JSON.stringify(body),
          });
          if (!response.ok) {
            const error = new Error('HTTP ' + response.status);
            error.status = response.status;
            throw error;
          }
          return response.json();
        } } };
      }
    };
  }
  return originalLoad.call(this, request, ...args);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const percentile = (arr, p) => {
  const s = arr.slice().sort((a,b)=>a-b);
  return s[Math.min(s.length - 1, Math.floor((p/100) * s.length))] || 0;
};
async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(workers);
}
async function main() {
  let mockRequests = 0;
  const mock = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    mockRequests++;
    await sleep(35);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      id: 'local-mock', object: 'chat.completion',
      choices: [{ index: 0, message: { role: 'assistant', content: 'پاسخ آزمایشی نوکا: مسیر برنامه‌نویسی با تمرین و ساخت پروژه قابل بررسی است.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 }
    }));
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const llm = require(path.join(root, 'lib/llm'));
  llm._setConfig({
    use: 'mock', stream: false, maxConcurrent: 40, timeoutMs: 3000,
    providers: { mock: { url: `http://127.0.0.1:${mock.address().port}/v1`, model: 'local-mock', key: 'LOAD_TEST_KEY', vision: false, stream: false, maxConcurrent: 40 } }
  });
  const app = require(path.join(root, 'server.js'));
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.address().port}`;

  const runHttp = async (name, paths, count, concurrency, requestFactory) => {
    const results = [];
    const errors = [];
    const start = performance.now();
    await runPool(Array.from({length:count}, (_,i)=>i), concurrency, async (i) => {
      const t0 = performance.now();
      try {
        const opts = requestFactory(i);
        const response = await fetch(base + paths(i), opts);
        const text = await response.text();
        results.push({ status: response.status, ms: performance.now() - t0, bytes: Buffer.byteLength(text) });
        if (response.status < 200 || response.status >= 400) errors.push(`${response.status}`);
      } catch (e) { errors.push(e.name + ':' + e.message); }
    });
    const elapsed = performance.now() - start;
    const latencies = results.map(x=>x.ms);
    const statuses = {};
    for (const r of results) statuses[r.status] = (statuses[r.status] || 0) + 1;
    const report = {
      name, count, concurrency, completed: results.length, errors: count - results.length,
      statuses, elapsedMs: Math.round(elapsed), requestsPerSecond: +(results.length / (elapsed / 1000)).toFixed(1),
      latencyMs: { p50: +percentile(latencies,50).toFixed(1), p95: +percentile(latencies,95).toFixed(1), max: +Math.max(0,...latencies).toFixed(1) },
      avgResponseBytes: results.length ? Math.round(results.reduce((n,x)=>n+x.bytes,0)/results.length) : 0,
      errorSamples: errors.slice(0,5),
    };
    console.log(JSON.stringify(report));
    return report;
  };

  const staticResults = [];
  staticResults.push(await runHttp('health_live_local', i=>'/health/live', 1000, 40, ()=>({headers:{connection:'keep-alive'}})));
  staticResults.push(await runHttp('static_root_local', i=>'/', 500, 30, ()=>({headers:{connection:'keep-alive'}})));
  staticResults.push(await runHttp('static_js_local', i=>'/script.js', 300, 20, ()=>({headers:{connection:'keep-alive'}})));

  const apiResults = await runHttp('chat_api_mock_provider_local', i=>'/api/chat', 120, 20, (i)=>({
    method:'POST', headers:{'content-type':'application/json','x-forwarded-for':`198.51.100.${(i%200)+1}`,'connection':'keep-alive'},
    body:JSON.stringify({lang:'fa',stream:false,messages:[{role:'user',content:'برای شروع برنامه‌نویسی با ریاضی متوسط چه مسیرهایی را بررسی کنم؟'}]})
  }));

  console.log(JSON.stringify({summary:'LOCAL_ONLY_NO_PRODUCTION_TRAFFIC', mockProviderRequests:mockRequests, llmStats:llm.stats(), memory:process.memoryUsage()}, null, 2));
  await new Promise(r => app.close(r));
  mock.close();
  const all = [...staticResults, apiResults];
  if (all.some(r => r.errors > 0)) process.exitCode = 1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
