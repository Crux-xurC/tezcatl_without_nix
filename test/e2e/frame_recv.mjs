// test/e2e/frame_recv.mjs -- the source of the receiving side in the frame's
// dock (D-unified-dock): output_target (otgt) lists tezcatl, emacs-vent and each
// xterm of the skin; while the keyboard is in the input form the receiving
// side follows where the input sends (an xterm: what it printed, as lines);
// out of it, the one chosen in otgt (;o and a letter, the keyboard comes
// back); a tezcatl error is put in whichever is shown; a destination with no
// source (code_editor) shows tezcatl's with a note; Shift+↓ from @gsel reaches otgt.
// On the right dock (frame-rd) and below.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const SHIFT = 8;

for (const side of ['r', 'b']) {
  console.log('the dock on side ' + side);
  const f = await openPage(PAGES + 'panels/skins/frame.html?dock=' + side);
  await f.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
  const OT = `window.frameSkin.dock().partOf('output_target').contentWindow`;
  await f.waitFor(`(() => { try { return ${OT}.Tezcatl.sourcesReady && window.frameSkin.target().contentWindow.Tezcatl.targetsReady; } catch (_) { return false; } })()`, 15000);
  const otList = () => f.eval(`${OT}.document.getElementById('list').textContent`);
  const otHead = () => f.eval(`${OT}.document.getElementById('head').textContent`);
  const other = () => f.eval(`document.getElementById('dock').classList.contains('recv-other')`);
  const recvx = () => f.eval(`[...document.getElementById('recvx').children].map((d) => d.textContent).join('\\n')`);
  const where = () => f.eval(`(() => { const a = document.activeElement; return a.id || a.getAttribute('data-dock-part') || a.className || a.tagName; })()`);
  const type = async (s) => { for (const ch of s) await f.key(ch, '', ch); await wait(250); };
  const formFocus = () => f.eval(`document.getElementById('line').focus(); true`);

  check(/t\s*tezcatl/.test(await otList()) && /e\s*emacs-vent/.test(await otList()), 'otgt lists tezcatl and emacs-vent -- ' + await otList());
  check(/← tezcatl/.test(await otHead()) && !(await other()), 'tezcatl chosen at first: the frame\'s own lines');

  await f.eval(`window.frameSkin.run('skin main 2'); true`);
  await f.eval(`window.frameSkin.run('skin add xterm'); true`);
  await f.waitFor(`/x\\s*xterm/.test(${OT}.document.getElementById('list').textContent)`, 15000);
  check(true, 'an xterm added to the skin is listed (x)');
  const XT = `window.frameSkin.frameAt('11').contentWindow`;
  await f.waitFor(`(() => { try { return /connected/.test(${XT}.document.body.textContent); } catch (_) { return false; } })()`, 15000);

  // send to the xterm: while in the input form, the receiving side follows it
  await formFocus();
  await type(';i');
  await f.key('x', 'KeyX', 'x');
  await wait(400);
  await formFocus();
  await type('echo recv-ok-' + side + ';e');
  await f.key('Enter', 'Enter', '\r');
  await f.waitFor(`[...document.getElementById('recvx').children].some((d) => d.textContent === 'recv-ok-${side}')`, 10000);
  check(await other(), 'in the input form, sending to the xterm: its lines are shown');
  check(/^── xterm .*\(following the input\)/.test(await recvx()), 'with whose they are -- ' + (await recvx()).split('\n')[0]);
  check(/following the input/.test(await otHead()), 'otgt says what it follows -- ' + await otHead());

  // out of the input form: the one chosen (tezcatl)
  await f.eval(`document.getElementById('line').blur(); document.body.focus(); true`);
  await f.waitFor(`!document.getElementById('dock').classList.contains('recv-other')`, 5000);
  check(!(await other()), 'out of the input form: back to tezcatl (chosen)');

  // ;o x: choose the xterm; the keyboard comes back
  await formFocus();
  await type(';o');
  check(await where() === 'otgt', ';o: to the output_target -- ' + await where());
  await f.key('x', 'KeyX', 'x');
  await wait(400);
  check(await where() === 'line' && /← xterm/.test(await otHead()), 'x chooses the xterm and the keyboard comes back');
  // send to tezcatl again: in the form, tezcatl; out of it, the xterm
  await type(';i');
  await f.key('t', 'KeyT', 't');
  await wait(400);
  await formFocus();
  await wait(300);
  check(!(await other()), 'in the form, sending to tezcatl: the frame\'s own lines');
  await f.eval(`document.getElementById('line').blur(); document.body.focus(); true`);
  await f.waitFor(`document.getElementById('dock').classList.contains('recv-other')`, 5000);
  check(/^── xterm [^(]*$/m.test((await recvx()).split('\n')[0]) && /recv-ok/.test(await recvx()), 'out of it: the chosen xterm, not following -- ' + (await recvx()).split('\n')[0]);

  // a tezcatl error is put in whichever is shown
  await f.eval(`window.frameSkin.run('skin nonsense'); true`);
  await wait(500);
  check(/^! no such command: skin nonsense/m.test(await recvx()), 'a tezcatl error shows over the xterm\'s lines -- ' + (await recvx()).split('\n').filter((l) => l.startsWith('!')).join(' | '));

  // a destination with no source: tezcatl's, with a note
  await f.eval(`window.frameSkin.run('skin add code_editor'); true`);
  await f.waitFor(`/c\\s*code_editor/.test(window.frameSkin.target().contentWindow.document.getElementById('list').textContent)`, 15000);
  await formFocus();
  await type(';i');
  await f.key('c', 'KeyC', 'c');
  await wait(400);
  await formFocus();
  await wait(400);
  check(/^── no source for code_editor/.test(await recvx()) && /skin add code_editor/.test(await recvx()), 'sending to a code_editor: tezcatl\'s lines with a note -- ' + (await recvx()).split('\n')[0]);
  await type(';i');
  await f.key('t', 'KeyT', 't');
  await wait(300);

  // Shift+↓ from the suggestions' source reaches otgt (the clock between takes no keys)
  await formFocus();
  await type(';g');
  await f.key('ArrowDown', 'ArrowDown', '', SHIFT);
  await wait(300);
  check(await where() === 'otgt', 'Shift+↓ from @gsel: past the clock, to otgt -- ' + await where());

  const shot = await f.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(E2E, 'frame_recv_' + side + '.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('  (screenshot: ' + path.join(E2E, 'frame_recv_' + side + '.png') + ')');
  await f.close();
}

console.log('alone in a window');
const o = await openPage(PAGES + 'panels/extra/output_target.html');
await o.waitFor(`window.Tezcatl && Tezcatl.sourcesReady`, 15000);
const al = await o.eval(`document.getElementById('list').textContent`);
check(/t\s*tezcatl/.test(al) && /e\s*emacs-vent/.test(al) && !/xterm/.test(al), 'tezcatl and emacs-vent; no xterm alone -- ' + al);
await o.key('e', 'KeyE', 'e');
await wait(300);
check(/← emacs-vent/.test(await o.eval(`document.getElementById('head').textContent`)), 'e chooses emacs-vent');
await o.close();
done();
