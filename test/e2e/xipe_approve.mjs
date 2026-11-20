// test/e2e/xipe_approve.mjs -- the approval view (D-xipe-approval) against
// the real xipe_totec copy (root "."): an agent's proposal (effect/propose, as
// the MCP bridge's propose_class sends it) is listed in
// matrix.html?kind=xipe_classes with its class and reason; `matrix approve`
// on the selected row approves it (effect/approve) and it leaves the table; the
// function's class is then the person's. Approving elsewhere is refused.
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await openPage(PAGES + 'panels/resident/matrix.html?kind=xipe_classes&root=.&ref=all');
const x = (method, params) => p.eval(`Tezcatl.xipeClient.request(Tezcatl.config, '.', ${JSON.stringify(method)}, ${JSON.stringify(params)})`);
const msg = () => p.eval(`document.getElementById('msg').textContent`);
const cmd = (name) => p.eval(`Promise.resolve(Tezcatl.commands.invoke(${JSON.stringify(name)}, {}, { local: true })).then(() => true)`);

await p.waitFor(`/xipe classes waiting/.test(document.getElementById('ref-label').textContent) || !document.getElementById('placeholder').hidden`, 60000);
check(/\(no class waits for approval\)/.test(await msg()), 'nothing waits at first: "(no class waits for approval)"');

const sub = await x('node/resolve', { module: 'Calc', name: 'sub', arity: '2' });
await x('effect/propose', { id: sub.id, effect: 'pure', reason: 'subtracts two numbers; touches nothing' });

await cmd('matrix.update');
await p.waitFor(`document.querySelectorAll('table.mx-grid tbody tr').length === 1`, 20000);
const row = await p.eval(`[...document.querySelectorAll('table.mx-grid tbody tr')][0].innerText`);
console.log('xipe_classes: ' + row.replace(/\s+/g, ' '));
check(/Calc\.sub\/2/.test(row) && /pure/.test(row) && /proposed/.test(row), 'the proposal is listed: function, class, "proposed"');
check(/subtracts two numbers; touches nothing/.test(row), 'with the agent\'s reason');

await p.eval(`document.getElementById('grid-wrap').focus(); true`);
await cmd('matrix.approve');
await p.waitFor(`/approved 1/.test(document.getElementById('msg').textContent)`, 20000);
check(await p.eval(`document.querySelectorAll('table.mx-grid tbody tr').length === 0`), 'approved: it leaves the table');
const card = (await x('card/list', {})).cards.find((c) => c.id === sub.id);
check(card && card.effect === 'pure' && card.effect_source === 'user', 'Calc.sub/2 is now pure by a person (effect_source user)');

await cmd('matrix.approve');
await wait(300);
check(/approve: no row selected/.test(await msg()), 'with no row, approve says so');

await p.eval(`Tezcatl.commands.invoke('matrix.get', { path: 'xipe_rows:all' }, { local: true }); true`);
await p.waitFor(`/xipe rows/.test(document.getElementById('ref-label').textContent)`, 20000);
await cmd('matrix.approve');
await wait(300);
check(/approve: only on a xipe_classes table/.test(await msg()), 'on another table, approve is refused');

// leave the copy as it was for the scenarios after this one
await x('effect/set', { id: sub.id, effect: 'unknown' }).catch(() => null);

const errs = p.logs.filter((l) => /exception|console.error/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
