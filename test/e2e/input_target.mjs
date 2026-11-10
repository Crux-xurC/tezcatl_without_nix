// test/e2e/input_target.mjs -- where the lead-key input form sends
// (panels/extra/input_target.html; D-lead-key): it takes `lead.send`
// {id, events}, hands the events to emacs-vent unread (kind:"input") and
// answers `lead.sent` {id, ok} to the sender; it shows the destination and its
// connection. In a skin only the panels of the same skin are listened to.
// Nothing answers behind the test relay (the vent uplink goes nowhere), so
// what would go to Emacs is caught by wrapping Tezcatl.ws.send in the page.
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const C = (s) => JSON.stringify(s);

// in a page reached by `win` (an expression for its window): catch what goes out
const catchSends = (p, win) => p.eval(`(() => { const w = ${win}; w.__sent = [];
  const orig = w.Tezcatl.ws.send; w.Tezcatl.ws.send = (o) => { w.__sent.push(o); return orig(o); }; return true; })()`);
// in a page reached by `win`: post lead.send and collect lead.sent answers
const listen = (p, win) => p.eval(`(() => { const w = ${win}; w.__got = [];
  w.Tezcatl.bus.onMine('lead.sent', (pl) => w.__got.push(pl)); return true; })()`);
const sendFrom = (p, win, id, events, to) => p.eval(`${win}.Tezcatl.bus.post('lead.send', ${C({ id, events })}${to ? ', { to: ' + C(to) + ' }' : ''}); true`);

console.log('alone in a window');
const t = await openPage(PAGES + 'panels/extra/input_target.html');
await t.waitFor(`/connected/.test(document.getElementById('list').textContent)`, 15000);
check(true, 'connected to the relay');
check(await t.eval(`document.getElementById('head').textContent`) === '→ emacs-vent', 'alone, the destination is emacs-vent (the first that can take keys: tezcatl needs a skin)');
await catchSends(t, 'window');
const tid = await t.eval(`Tezcatl.bus.self.id`);
await wait(200);

const o = await openPage(PAGES + 'panels/extra/color.html');
await o.waitFor(`!!(window.Tezcatl && Tezcatl.bus)`, 8000);
await listen(o, 'window');
const events = [{ key: 'l', modifiers: [] }, { key: 'd', modifiers: ['control'] }, { key: 'return', modifiers: [] }];
await sendFrom(o, 'window', 'a0', events);
await wait(600);
check(await t.eval(`window.__sent.length`) === 0, 'alone, an unaddressed lead.send is not taken (each lone input_target would send it)');
await sendFrom(o, 'window', 'a1', events, tid);
await o.waitFor(`window.__got.length > 0`, 5000);
const got = await o.eval(`JSON.stringify(window.__got)`).then(JSON.parse);
check(got.length === 1 && got[0].id === 'a1' && got[0].ok === true && got[0].target === 'emacs-vent',
  'lead.sent comes back to the sender: ' + C(got));
const sent = await t.eval(`JSON.stringify(window.__sent.filter((m) => m.kind === 'input'))`).then(JSON.parse);
check(sent.length === 1 && C(sent[0].sequence) === C(events), 'the events go to emacs-vent unread as kind:"input"');

await sendFrom(o, 'window', 'a2', [], tid);
await o.waitFor(`window.__got.length > 1`, 5000);
const empty = await o.eval(`JSON.stringify(window.__got[1])`).then(JSON.parse);
check(empty.ok === false && /nothing/.test(empty.error), 'an empty send is refused: ' + C(empty));

console.log('in a frame');
const f = await openPage(PAGES + 'panels/skins/frame.html');
await f.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
async function line(text) {
  await f.eval(`document.getElementById('line').focus(); true`);
  await f.send('Input.insertText', { text });
  await f.key('Enter', 'Enter', '\r');
  await wait(400);
}
await line('skin main 2');
await line('skin add input_target');
await line('skin add color');
const frameWin = (name) => `[...document.querySelectorAll('iframe')].find((i) => /${name}/.test(i.src)).contentWindow`;
await f.waitFor(`(() => { try { return /connected/.test(${frameWin('input_target')}.document.getElementById('list').textContent); } catch (_) { return false; } })()`, 15000);
await f.waitFor(`(() => { try { return !!${frameWin('color')}.Tezcatl.bus; } catch (_) { return false; } })()`, 10000);
// in a skin the first destination is tezcatl: pick emacs-vent (e)
await f.eval(`(() => { const w = ${frameWin('input_target')}; w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'e' })); return true; })()`);
await f.waitFor(`${frameWin('input_target')}.document.getElementById('head').textContent === '→ emacs-vent'`, 5000);
await catchSends(f, frameWin('input_target'));
await listen(f, frameWin('color'));

await o.eval(`window.__got = []; true`);
await t.eval(`window.__sent = []; true`);
const ftid = await f.eval(`${frameWin('input_target')}.Tezcatl.bus.self.id`);
await sendFrom(o, 'window', 'b1', [{ key: 'x', modifiers: [] }], ftid);
await wait(600);
const inFrame = await f.eval(`${frameWin('input_target')}.__sent.length`);
check(inFrame === 0, 'a page outside the skin is not taken by the frame\'s input_target, even addressed to it');

await sendFrom(f, frameWin('color'), 'b2', [{ key: 'y', modifiers: [] }]);
await f.waitFor(`${frameWin('color')}.__got.length > 0`, 5000);
const fr = await f.eval(`JSON.stringify(${frameWin('color')}.__got[0])`).then(JSON.parse);
check(fr.id === 'b2' && fr.ok === true, 'a panel of the same skin is: ' + C(fr));
const fs = await f.eval(`JSON.stringify(${frameWin('input_target')}.__sent.filter((m) => m.kind === 'input'))`).then(JSON.parse);
check(fs.length === 1 && fs[0].sequence[0].key === 'y', 'and its keys go out');

done();
