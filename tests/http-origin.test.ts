import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sameOrigin} from '../src/server/http';
function check(mode:string,expected:string,origin:string,url=origin,site='same-origin'){
 const oldMode=process.env.NODE_ENV,oldOrigin=process.env.APP_ORIGIN;
 Object.assign(process.env,{NODE_ENV:mode,APP_ORIGIN:expected});
 try{sameOrigin(new Request(`${url}/api/auth/login`,{method:'POST',headers:{origin,'sec-fetch-site':site}}));}
 finally{Object.assign(process.env,{NODE_ENV:oldMode});if(oldOrigin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=oldOrigin;}
}
test('local development accepts localhost and IPv4 loopback aliases on the same port',()=>{
 assert.doesNotThrow(()=>check('development','http://localhost:3000','http://127.0.0.1:3000'));
 assert.doesNotThrow(()=>check('development','http://127.0.0.1:3000','http://localhost:3000'));
});
test('development still rejects other ports, protocols, hosts and malformed origins',()=>{
 for(const origin of ['http://localhost:3107','https://localhost:3000','http://example.test:3000','http://localhost.evil.test:3000'])assert.throws(()=>check('development','http://localhost:3000',origin));
 assert.throws(()=>check('development','http://localhost:3000','null','http://localhost:3000'));
 assert.throws(()=>check('development','http://localhost:3000','http://127.0.0.1:3000','http://example.test:3000'));
});
test('production keeps exact origin matching and cross-site browser requests remain forbidden',()=>{
 assert.throws(()=>check('production','http://localhost:3000','http://127.0.0.1:3000'));
 assert.doesNotThrow(()=>check('production','https://nexo.example.test','https://nexo.example.test'));
 assert.throws(()=>check('development','http://localhost:3000','http://localhost:3000','http://localhost:3000','cross-site'));
});
