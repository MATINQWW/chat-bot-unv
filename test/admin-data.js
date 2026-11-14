'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHandler } = require('../api/admin-data');
const auth = require('../api/admin-auth');
function makeHash(p){const s=crypto.randomBytes(16);return `scrypt$${s.toString('hex')}$${crypto.scryptSync(p,s,64).toString('hex')}`;}
class Store {
 constructor(){this.remote=true;this.k=new Map();this.h=new Map();this.l=new Map();}
 async exec(cmds){return cmds.map(c=>{const [op,key,...a]=c.map(String);if(op==='GET')return this.k.get(key)||null;if(op==='SET'){this.k.set(key,a[0]);return 'OK';}if(op==='HGETALL'){const h=this.h.get(key);return h?[...h.entries()].flat():[];}if(op==='LRANGE')return (this.l.get(key)||[]).slice(Number(a[0]),Number(a[1])+1);throw Error(op);});}
}
function invoke(handler,cookie=''){const req={method:'GET',headers:{cookie}};const h={};const res={statusCode:200,setHeader(k,v){h[k.toLowerCase()]=v;return this;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};return Promise.resolve(handler(req,res)).then(()=>({status:res.statusCode,body:res.body,headers:h}));}
(async()=>{
 const store=new Store(), env={NOOKA_SUPERADMIN_EMAIL:'root@nooka.test',NOOKA_SUPERADMIN_PASSWORD_HASH:makeHash('Super-Secret-Passphrase-2026!'),NOOKA_SUPERADMIN_NAME:'مدیر اصلی'};
 const token=crypto.randomBytes(32).toString('base64url'); await store.exec([['SET',auth.sessionKey(token),JSON.stringify({email:'root@nooka.test',key:'super',credentialVersion:auth.credentialFingerprint({passwordHash:env.NOOKA_SUPERADMIN_PASSWORD_HASH})})]]);
 const reports={prune:async()=>0,build:async()=>({summary:{total:0},questions:[],byDay:[]})};
 const handler=createHandler({kv:store,env,report:reports,getLearner:()=>({dashboard:async()=>({stats:{tokens_used:0}})})});
 let r=await invoke(handler); assert.equal(r.status,401);
 r=await invoke(handler,`${auth.cookieName}=${token}`); assert.equal(r.status,200); assert.equal(r.body.admin.email,'root@nooka.test'); assert.ok(r.body.report); assert.ok(r.body.tokens); assert.ok(r.body.knowledge); assert.ok(r.body.admins); assert.ok(r.body.audit); assert.match(r.headers['cache-control'],/no-store/);
 const staffToken=crypto.randomBytes(32).toString('base64url'); store.h.set('nooka:admin:users',new Map([['staff@nooka.test',JSON.stringify({key:'admin:staff',email:'staff@nooka.test',name:'کارشناس',passwordHash:makeHash('Staff-Secret-Passphrase!'),views:['dashboard'],active:true})]])); await store.exec([['SET',auth.sessionKey(staffToken),JSON.stringify({email:'staff@nooka.test',key:'admin:staff',credentialVersion:auth.credentialFingerprint(JSON.parse(store.h.get('nooka:admin:users').get('staff@nooka.test')))})]]);
 r=await invoke(handler,`${auth.cookieName}=${staffToken}`); assert.equal(r.status,200); assert.ok(r.body.report); assert.equal(r.body.tokens,undefined); assert.equal(r.body.knowledge,undefined); assert.equal(r.body.admins,undefined); assert.equal(r.body.audit,undefined);
 console.log('✓ admin data: cookie-authenticated reads, no-store, real report/knowledge/token/audit payloads and view-based server filtering');
})().catch(e=>{console.error(e);process.exitCode=1;});
