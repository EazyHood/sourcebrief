import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourcebriefServer } from '../server.mjs';
const pool='7chtSL1MVDZ3kMShbnWH8htZE5gayon4t4NMF21cKyqn';
test('launch HTTP routes retain GET/query boundaries and never expose a general RPC endpoint', async()=>{
  const calls=[];
  const server=createSourcebriefServer({service:{},launchService:{brief:async(id,options)=>{calls.push({id,options});return {id};}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/launch/examples`)).status,200);
    assert.equal((await fetch(`${base}/api/launch/${pool}?refresh=1&quoteAmount=0.1`)).status,200);
    assert.deepEqual(calls,[{id:pool,options:{refresh:true,quoteAmount:'0.1'}}]);
    for(const path of [`${pool}?refresh=0`,`${pool}?quoteAmount=1&quoteAmount=2`,`${pool}?endpoint=https://evil.test`,'invalid']) {
      assert.equal((await fetch(`${base}/api/launch/${path}`)).status,400);
    }
    assert.equal((await fetch(`${base}/api/launch/${pool}`,{method:'POST'})).status,405);
    assert.equal((await fetch(`${base}/api/rpc`)).status,404);
    assert.equal(calls.length,1);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
