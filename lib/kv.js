// ═══════════════════════════════════════════════════════════
// KV — لایهٔ ذخیره‌سازی ساده برای حافظهٔ یادگیری، آمار و rate limit
//  • اگر UPSTASH_REDIS_REST_URL / TOKEN (یا KV_REST_API_URL / TOKEN) تنظیم باشد: Redis واقعی (REST)
//  • در غیر این صورت: حافظهٔ داخل همان instance (با ری‌استارت پاک می‌شود)
// همهٔ فراخوانی‌ها best-effort هستند: خطا → null؛ چت هیچ‌وقت به خاطر KV از کار نمی‌افتد.
// ═══════════════════════════════════════════════════════════

class MemKV {
  constructor() { this.d = new Map(); }
  _g(k) {
    const e = this.d.get(k);
    if (!e) return null;
    if (e.exp && e.exp < Date.now()) { this.d.delete(k); return null; }
    return e;
  }
  _rank(len, i) { return i < 0 ? len + i : i; }
  run(cmd) {
    if (this.d.size > 20000) this.d.clear();
    const [op, ...a] = cmd.map(String);
    switch (op.toUpperCase()) {
      case 'GET': { const e = this._g(a[0]); return e ? e.v : null; }
      case 'SET': {
        const [k, v, ...o] = a; let ex = 0, nx = false;
        for (let i = 0; i < o.length; i++) {
          const u = o[i].toUpperCase();
          if (u === 'EX') ex = +o[++i]; else if (u === 'NX') nx = true;
        }
        if (nx && this._g(k)) return null;
        this.d.set(k, { v, exp: ex ? Date.now() + ex * 1000 : 0 });
        return 'OK';
      }
      case 'DEL': return a.reduce((n, k) => n + (this.d.delete(k) ? 1 : 0), 0);
      case 'EXISTS': return a.reduce((n, k) => n + (this._g(k) ? 1 : 0), 0);
      case 'EXPIRE': { const e = this._g(a[0]); if (!e) return 0; e.exp = Date.now() + (+a[1]) * 1000; return 1; }
      case 'INCR': {
        const e = this._g(a[0]) || { v: '0', exp: 0 };
        e.v = String((parseInt(e.v, 10) || 0) + 1); this.d.set(a[0], e); return +e.v;
      }
      case 'HSET': {
        const e = this._g(a[0]) || { v: new Map(), exp: 0 }; let n = 0;
        for (let i = 1; i < a.length; i += 2) { if (!e.v.has(a[i])) n++; e.v.set(a[i], a[i + 1]); }
        this.d.set(a[0], e); return n;
      }
      case 'HGET': { const e = this._g(a[0]); return e && e.v.has(a[1]) ? e.v.get(a[1]) : null; }
      case 'HGETALL': { const e = this._g(a[0]); return e ? [].concat(...[...e.v.entries()]) : []; }
      case 'HDEL': { const e = this._g(a[0]); if (!e) return 0; return a.slice(1).reduce((n, f) => n + (e.v.delete(f) ? 1 : 0), 0); }
      case 'HLEN': { const e = this._g(a[0]); return e ? e.v.size : 0; }
      case 'HINCRBY': {
        const e = this._g(a[0]) || { v: new Map(), exp: 0 };
        const n = (parseInt(e.v.get(a[1]), 10) || 0) + (+a[2]);
        e.v.set(a[1], String(n)); this.d.set(a[0], e); return n;
      }
      case 'SADD': {
        const e = this._g(a[0]) || { v: new Set(), exp: 0 }; let n = 0;
        for (const m of a.slice(1)) { if (!e.v.has(m)) { e.v.add(m); n++; } }
        this.d.set(a[0], e); return n;
      }
      case 'SCARD': { const e = this._g(a[0]); return e ? e.v.size : 0; }
      case 'ZINCRBY': {
        const e = this._g(a[0]) || { v: new Map(), exp: 0 };
        const s = (parseFloat(e.v.get(a[2])) || 0) + (+a[1]);
        e.v.set(a[2], s); this.d.set(a[0], e); return String(s);
      }
      case 'ZREVRANGE': {
        const e = this._g(a[0]); if (!e) return [];
        const arr = [...e.v.entries()].sort((x, y) => y[1] - x[1]);
        const s = this._rank(arr.length, +a[1]), t = this._rank(arr.length, +a[2]);
        const sl = arr.slice(s, t + 1);
        return a[3] && a[3].toUpperCase() === 'WITHSCORES' ? [].concat(...sl.map(([m, sc]) => [m, String(sc)])) : sl.map(x => x[0]);
      }
      case 'ZREMRANGEBYRANK': {
        const e = this._g(a[0]); if (!e) return 0;
        const arr = [...e.v.entries()].sort((x, y) => x[1] - y[1]); // صعودی
        const s = this._rank(arr.length, +a[1]), t = this._rank(arr.length, +a[2]);
        const rm = arr.slice(s, t + 1); rm.forEach(([m]) => e.v.delete(m)); return rm.length;
      }
      case 'LPUSH': {
        const e = this._g(a[0]) || { v: [], exp: 0 };
        for (const m of a.slice(1)) e.v.unshift(m);
        this.d.set(a[0], e); return e.v.length;
      }
      case 'LTRIM': {
        const e = this._g(a[0]); if (!e) return 'OK';
        const s = this._rank(e.v.length, +a[1]), t = this._rank(e.v.length, +a[2]);
        e.v = e.v.slice(s, t + 1); return 'OK';
      }
      case 'LRANGE': {
        const e = this._g(a[0]); if (!e) return [];
        const s = this._rank(e.v.length, +a[1]), t = this._rank(e.v.length, +a[2]);
        return e.v.slice(s, t + 1);
      }
      case 'LLEN': { const e = this._g(a[0]); return e ? e.v.length : 0; }
      default: throw new Error('unsupported command ' + op);
    }
  }
}

function createKV(env = process.env, fetchImpl = (typeof fetch === 'function' ? fetch : null)) {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').replace(/\/$/, '');
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '';
  const remote = !!(url && token && fetchImpl);
  const mem = new MemKV();
  return {
    remote,
    // cmds: [[ 'GET', 'k' ], ...] → آرایهٔ نتایج، یا null در صورت خطا
    async exec(cmds) {
      if (remote) {
        try {
          const r = await fetchImpl(url + '/pipeline', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify(cmds.map(c => c.map(String))),
            signal: AbortSignal.timeout(2500),
          });
          if (!r.ok) return null;
          const j = await r.json();
          return j.map(x => (x && x.error ? null : x.result));
        } catch { return null; }
      }
      try { return cmds.map(c => mem.run(c)); } catch { return null; }
    },
  };
}

module.exports = { createKV, MemKV };
