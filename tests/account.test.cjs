const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
async function harness() {
  const stored = {}, rows = new Map(), nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { textContent: '', addEventListener() {} }); return nodes.get(id); };
  let offline = false;
  const client = {
    auth: { onAuthStateChange() {}, async getSession() { return { data: { session: { user: { id: 'a', email: 'a@example.com' } } } }; } },
    from() { return {
      async upsert(entries) { if (offline) return { error: new Error('offline') }; for (const row of entries) rows.set(JSON.stringify([row.user_id, row.kind, row.item_id]), row); return {}; },
      select() { let owner; return { eq(_, id) { owner = id; return this; }, order() { return this; }, async range(start, end) { if (offline) return { error: new Error('offline') }; return { data: [...rows.values()].filter(row => row.user_id === owner).slice(start, end + 1) }; } }; },
    }; },
  };
  const context = vm.createContext({
    window: { SPEAKLY_SUPABASE: { url: 'https://example.supabase.co', publishableKey: 'public' }, addEventListener() {} },
    document: { getElementById: node }, App: { reloadProgress() {} },
    localStorage: { getItem: key => stored[key] ?? null, setItem: (key, value) => stored[key] = value },
    fakeSdk: { createClient: () => client }, setTimeout: () => 1, clearTimeout() {}, console,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8'), context);
  const source = fs.readFileSync(path.join(__dirname, '../js/account.js'), 'utf8')
    .replace("await import('https://esm.sh/@supabase/supabase-js@2.57.4')", 'fakeSdk')
    .replace('return { init };', 'return { init, sync, sessionChanged };')
    .replace('void Account.init();', 'globalThis.ready = Account.init();');
  vm.runInContext(source, context); await context.ready;
  const evaluate = code => vm.runInContext(code, context);
  async function settle() { await new Promise(resolve => setImmediate(resolve)); }
  return { stored, rows, evaluate, settle, setOffline(value) { offline = value; } };
}

test('sync persists both a learned word and its removal', async () => {
  const app = await harness();
  app.evaluate("Storage.write('known', ['hello'])"); await app.settle();
  assert.equal([...app.rows.values()][0].value, true);
  app.evaluate("Storage.write('known', [])"); await app.settle();
  assert.equal([...app.rows.values()][0].value, false);
  assert.equal(app.evaluate("Object.keys(Storage.read('pending', {})).length"), 0);
});

test('offline changes remain queued and upload when connection returns', async () => {
  const app = await harness(); app.setOffline(true);
  app.evaluate("Storage.write('lessons', ['lesson-1'])"); await app.settle();
  assert.equal(app.evaluate("Object.keys(Storage.read('pending', {})).length"), 1);
  app.setOffline(false); await app.evaluate('Account.sync()');
  assert.equal([...app.rows.values()][0].value, true);
  assert.equal(app.evaluate("Object.keys(Storage.read('pending', {})).length"), 0);
});

test('cloud data uses pagination and switching account never inherits another user marks', async () => {
  const app = await harness();
  for (let i = 0; i < 1201; i++) app.rows.set('seed-' + i, { user_id: 'a', kind: 'known', item_id: 'word-' + i, value: true });
  await app.evaluate('Account.sync()');
  assert.equal(app.evaluate("Storage.read('known', []).length"), 1201);
  await app.evaluate("Account.sessionChanged({user:{id:'b',email:'b@example.com'}})");
  assert.equal(app.evaluate("Storage.read('known', []).length"), 0);
  app.evaluate("Storage.write('known', ['b-only'])"); await app.settle();
  assert([...app.rows.values()].some(row => row.user_id === 'b' && row.item_id === 'b-only'));
  await app.evaluate("Account.sessionChanged({user:{id:'a'}})");
  assert.equal(app.evaluate("Storage.read('known', []).length"), 1201);
});
