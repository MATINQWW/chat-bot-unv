'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const auth = require('../api/admin-auth');
const { createHandler } = require('../api/admin-users');
function hash(p) { const s=crypto.randomBytes(16); return `scrypt$${s.toString('hex')}$${crypto.scryptSync(p,s,64).toString('hex')}`; }
class Store {
  constructor(){ this.remote=true; this.h=new Map(); this.k=new Map(); this.l=new Map(); }
  async exec(cmds){ return cmds.map(c=>{ const [op,key,...a]=c.map(String); if(op==='GET') return this.k.get(key)||null; if(op==='SET'){this.k.set(key,a[0]);return 'OK';} if(op==='HGET'){return this.h.get(key)?.get(a[0])||null;} if(op==='HSET'){if(!this.h.has(key))this.h.set(key,new Map());this.h.get(key).set(a[0],a[1]);return 1;}if(op==='HSETNX'){if(!this.h.has(key))this.h.set(key,new Map());if(this.h.get(key).has(a[0]))return 0;this.h.get(key).set(a[0],a[1]);return 1;} if(op==='HDEL'){return this.h.get(key)?.delete(a[0])?1:0;} if(op==='HGETALL'){const m=this.h.get(key);return m?[...m.entries()].flat():[];} if(op==='LPUSH'){if(!this.l.has(key))this.l.set(key,[]);this.l.get(key).unshift(...a);return this.l.get(key).length;} if(op==='LTRIM'){const l=this.l.get(key)||[];this.l.set(key,l.slice(Number(a[0]),Number(a[1])+1));return 'OK';} throw Error(op); }); }
}
function invoke(handler,{method='GET',body,cookie='',origin='https://nooka.test'}={}){const req={method,body,headers:{cookie,origin,host:'nooka.test'},socket:{remoteAddress:'127.0.0.1'}};const h={};const res={statusCode:200,setHeader(k,v){h[k.toLowerCase()]=v;return this;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};return Promise.resolve(handler(req,res)).then(()=>({status:res.statusCode,body:res.body,headers:h}));}
(async()=>{
 const store=new Store(), password='Strong-Super-Password-2026!'; const env={NOOKA_SUPERADMIN_EMAIL:'owner@nooka.test',NOOKA_SUPERADMIN_PASSWORD_HASH:hash(password),NOOKA_SUPERADMIN_NAME:'مدیر اصلی'};
 const token=crypto.randomBytes(32).toString('base64url'); await store.exec([['SET',auth.sessionKey(token),JSON.stringify({email:'owner@nooka.test',key:'super',credentialVersion:auth.credentialFingerprint({passwordHash:env.NOOKA_SUPERADMIN_PASSWORD_HASH})})]]); const cookie=`${auth.cookieName}=${token}`;
 const handler=createHandler({kv:store,env});
 let r=await invoke(handler,{method:'POST',cookie,body:{name:'مدیر دانش',email:'knowledge@nooka.test',password:'Knowledge-Admin-2026!',views:['dashboard','knowledge']}}); assert.equal(r.status,201);
 const user=JSON.parse((await store.exec([['HGET','nooka:admin:users','knowledge@nooka.test']]))[0]); assert.match(user.passwordHash,/^scrypt\$/); assert.equal(user.views.includes('knowledge'),true);
 r=await invoke(handler,{cookie}); assert.equal(r.status,200); assert.equal(r.body.admins.length,2);
 r=await invoke(handler,{method:'PUT',cookie,body:{email:'knowledge@nooka.test',name:'مدیر دانش ۲',views:['knowledge'],active:false}}); assert.equal(r.status,200);
 const login=auth.createHandler({kv:store,env,rateLimited:async()=>false,originAllowed:()=>true}); const req={method:'GET',headers:{cookie},socket:{remoteAddress:'127.0.0.1'}};
 const disabledToken=crypto.randomBytes(32).toString('base64url'); await store.exec([['SET',auth.sessionKey(disabledToken),JSON.stringify({email:'knowledge@nooka.test',key:user.key,credentialVersion:auth.credentialFingerprint(user)})]]);
 const resolved=await auth.resolveSession({headers:{cookie:`${auth.cookieName}=${disabledToken}`}},store,env); assert.equal(resolved,null,'disabled admins cannot restore old sessions');
 r=await invoke(handler,{method:'PUT',cookie,body:{email:'knowledge@nooka.test',active:true}}); assert.equal(r.status,200);
 const afterReenable=await auth.resolveSession({headers:{cookie:`${auth.cookieName}=${disabledToken}`}},store,env); assert.equal(afterReenable,null,'re-enabled admins must not revive old sessions');
 r=await invoke(handler,{method:'DELETE',cookie,body:{email:'knowledge@nooka.test'}}); assert.equal(r.status,200);
 r=await invoke(handler,{method:'DELETE',cookie,body:{email:'owner@nooka.test'}}); assert.equal(r.status,404);
 console.log('✓ admin users: Redis persistence, scrypt password hashing, selective views, update, disable/revoke, delete, super-admin protection');
})().catch(e=>{console.error(e);process.exitCode=1;});
