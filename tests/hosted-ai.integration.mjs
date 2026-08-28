import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { embedAiTexts, listAiModels, streamAiChat, testAiConnection } from '../js/ai.js';

let server, endpoint;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

test.before(async () => {
  server = http.createServer(async (req,res) => {
    let body='';
    for await (const chunk of req) body += chunk;
    if (req.headers.authorization !== 'Bearer test-token') return json(res, 401, {error:'unauthorized'});
    if (req.url === '/v1/models') return json(res, 200, {data:[{id:'hosted-chat'},{id:'hosted-embed'}]});
    if (req.url === '/v1/embeddings') {
      const payload=JSON.parse(body || '{}');
      const inputs=Array.isArray(payload.input)?payload.input:[payload.input];
      return json(res, 200, {data:inputs.map((_,i)=>({index:i,embedding:[0.1,i,0.9]}))});
    }
    if (req.url === '/v1/chat/completions') {
      res.statusCode=200;
      res.setHeader('Content-Type','text/event-stream');
      res.setHeader('Access-Control-Allow-Origin','*');
      res.write('data: '+JSON.stringify({choices:[{delta:{content:'Hosted '}}]})+'\n\n');
      res.write('data: '+JSON.stringify({choices:[{delta:{content:'response'}}]})+'\n\n');
      res.end('data: [DONE]\n\n');
      return;
    }
    return json(res,404,{error:'not found'});
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  endpoint=`http://127.0.0.1:${server.address().port}/v1`;
});

test.after(async () => new Promise(resolve => server.close(resolve)));

test('hosted connection test authenticates and reaches model endpoint', async () => {
  const out=await testAiConnection({provider:'openai-compatible',endpoint,apiKey:'test-token',timeoutSeconds:5});
  assert.equal(out.ok,true);
  assert.equal(out.label,'Hosted AI online');
});

test('hosted model discovery', async () => {
  const models=await listAiModels({provider:'openai-compatible',endpoint,apiKey:'test-token',timeoutSeconds:5});
  assert.deepEqual(models.map(x=>x.name),['hosted-chat','hosted-embed']);
});

test('hosted embeddings preserve input order', async () => {
  const vectors=await embedAiTexts({provider:'openai-compatible',endpoint,apiKey:'test-token',model:'hosted-embed',texts:['a','b'],timeoutSeconds:5});
  assert.deepEqual(vectors,[[0.1,0,0.9],[0.1,1,0.9]]);
});

test('hosted streaming chat consumes SSE', async () => {
  let observed='';
  const full=await streamAiChat({provider:'openai-compatible',endpoint,apiKey:'test-token',model:'hosted-chat',messages:[{role:'user',content:'hi'}],timeoutSeconds:5,onToken:(_t,all)=>observed=all});
  assert.equal(full,'Hosted response');
  assert.equal(observed,'Hosted response');
});
