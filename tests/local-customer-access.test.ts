import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localCustomerAccess} from '../src/server/local-customer-access';
import {configurationIssues} from '../src/server/deployment';
const enabled={NODE_ENV:'development',NEXO_LOCAL_SETUP_ENABLED:'true',NEXO_LOCAL_CUSTOMER_ACCESS:'true'} as const;
test('local customer access requires every explicit development flag',()=>{
 assert.equal(localCustomerAccess(enabled),true);
 assert.equal(localCustomerAccess({...enabled,NODE_ENV:'test'}),false);
 assert.equal(localCustomerAccess({...enabled,NEXO_LOCAL_SETUP_ENABLED:'false'}),false);
 assert.equal(localCustomerAccess({...enabled,NEXO_LOCAL_CUSTOMER_ACCESS:undefined}),false);
});
test('production ignores the local bypass and deployment diagnostics reject it',()=>{
 assert.equal(localCustomerAccess({...enabled,NODE_ENV:'production'}),false);
 assert.ok(configurationIssues({...enabled,NODE_ENV:'production'}).includes('LOCAL_CUSTOMER_ACCESS_FORBIDDEN'));
});
