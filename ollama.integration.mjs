import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getVersion, listModels, embedTexts, streamChat } from '../js/ollama.js';

let server, endpoint;

test.before(async () => {
  server = http.createServer(async (req,res) => {
    let body='';
    for await (const chunk of req) body += chunk;
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Content-Type','application/json');
    if (req.url === '/api/version') return res.end(JSON.stringify({version:'test-1.0'}));
    if (req.url === '/api/tags') return res.end(JSON.stringify({models:[{name:'qwen-test:1b',size:1},{name:'embed-test',size:2}]}));
    if (req.url === '/api/embed') {
      const payload=JSON.parse(body || '{}');
      const inputs=Array.isArray(payload.input)?payload.input:[payload.input];
      return res.end(JSON.stringify({embeddings:inputs.map((_,i)=>[1,i,0.5])}));
    }
    if (req.url === '/api/chat') {
      const payload=JSON.parse(body || '{}');
      if (payload.model === 'slow-model') {
        res.write(JSON.stringify({message:{role:'assistant',content:'slow '},done:false})+'\n');
        setTimeout(()=>res.write(JSON.stringify({message:{role:'assistant',content:'but '},done:false})+'\n'),30);
        setTimeout(()=>res.write(JSON.stringify({message:{role:'assistant',content:'alive'},done:false})+'\n'),60);
        return setTimeout(()=>res.end(JSON.stringify({done:true})+'\n'),90);
      }
      if (payload.model === 'malformed-model') {
        res.write(JSON.stringify({message:{role:'assistant',content:'good '},done:false})+'\n');
        res.write('{not valid json}\n');
        return res.end(JSON.stringify({message:{role:'assistant',content:'answer'},done:true})+'\n');
      }
      if (payload.model === 'slow-start-model') {
        return setTimeout(() => {
          res.write(JSON.stringify({message:{role:'assistant',content:'finally '},done:false})+'\n');
          res.end(JSON.stringify({message:{role:'assistant',content:'started'},done:true})+'\n');
        },120);
      }
      res.write(JSON.stringify({message:{role:'assistant',content:'Hello '},done:false})+'\n');
      res.write(JSON.stringify({message:{role:'assistant',content:'world'},done:false})+'\n');
      return res.end(JSON.stringify({message:{role:'assistant',content:'!'},done:true,eval_count:3,eval_duration:1000000000})+'\n');
    }
    res.statusCode=404; res.end(JSON.stringify({error:'not found'}));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  endpoint=`http://127.0.0.1:${server.address().port}`;
});

test.after(async () => new Promise(resolve => server.close(resolve)));

test('version request', async () => {
  const v=await getVersion(endpoint,5);
  assert.equal(v.version,'test-1.0');
});

test('model discovery', async () => {
  const models=await listModels(endpoint,5);
  assert.deepEqual(models.map(x=>x.name),['qwen-test:1b','embed-test']);
});

test('embedding batch', async () => {
  const vectors=await embedTexts({endpoint,model:'embed-test',texts:['a','b'],timeoutSeconds:5});
  assert.equal(vectors.length,2);
  assert.deepEqual(vectors[1],[1,1,0.5]);
});

test('streaming chat', async () => {
  let observed='';
  const full=await streamChat({endpoint,model:'qwen-test:1b',messages:[{role:'user',content:'hi'}],timeoutSeconds:5,onToken:(_t,all)=>observed=all});
  assert.equal(full,'Hello world!');
  assert.equal(observed,'Hello world!');
});


test('slow active Ollama stream uses inactivity timeout rather than total-duration timeout', async () => {
  const full=await streamChat({endpoint,model:'slow-model',messages:[{role:'user',content:'hi'}],timeoutSeconds:0.05});
  assert.equal(full,'slow but alive');
});

test('first-response timeout is separate from streaming inactivity timeout', async () => {
  const full=await streamChat({
    endpoint,model:'slow-start-model',messages:[{role:'user',content:'hi'}],
    timeoutSeconds:0.05,firstResponseTimeoutSeconds:0.25,inactivityTimeoutSeconds:0.05
  });
  assert.equal(full,'finally started');
  await assert.rejects(
    () => streamChat({endpoint,model:'slow-start-model',messages:[{role:'user',content:'hi'}],timeoutSeconds:0.05,firstResponseTimeoutSeconds:0.05,inactivityTimeoutSeconds:0.2}),
    err => err?.name === 'TimeoutError' || /first response|model load|timed out/i.test(String(err?.message || ''))
  );
});

test('one malformed NDJSON line does not destroy the rest of an Ollama answer', async () => {
  const oldWarn=console.warn; console.warn=()=>{};
  try {
    const full=await streamChat({endpoint,model:'malformed-model',messages:[{role:'user',content:'hi'}],timeoutSeconds:5});
    assert.equal(full,'good answer');
  } finally { console.warn=oldWarn; }
});

test('Ollama generation can be cancelled by caller', async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('Generation cancelled','AbortError')), 45);
  await assert.rejects(
    () => streamChat({endpoint,model:'slow-model',messages:[{role:'user',content:'cancel'}],timeoutSeconds:1,signal:controller.signal}),
    err => err?.name === 'AbortError' || /cancel/i.test(String(err?.message || ''))
  );
});
