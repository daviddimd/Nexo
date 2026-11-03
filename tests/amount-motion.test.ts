import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interpolateAmount} from '../src/catalog/amount-motion';

test('amount interpolation preserves exact CLP endpoints above safe integer range',()=>{
 const target=999999999999999999n;
 assert.equal(interpolateAmount(0n,target,0),0n);
 assert.equal(interpolateAmount(0n,target,.5),499999999999999999n);
 assert.equal(interpolateAmount(0n,target,1),target);
});
test('amount interpolation supports negative net balances and zero',()=>{
 assert.equal(interpolateAmount(0n,-700001n,.5),-350000n);
 assert.equal(interpolateAmount(0n,-700001n,1),-700001n);
 assert.equal(interpolateAmount(0n,0n,.9),0n);
});
test('amount interpolation clamps progress and never overshoots',()=>{
 assert.equal(interpolateAmount(0n,200n,-1),0n);
 assert.equal(interpolateAmount(0n,200n,2),200n);
 assert.equal(interpolateAmount(0n,200n,NaN),0n);
 let previous=0n;
 for(let i=0;i<=100;i++){const value=interpolateAmount(0n,100001n,i/100);assert.ok(value>=previous&&value<=100001n);previous=value;}
});
