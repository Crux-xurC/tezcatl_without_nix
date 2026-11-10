// test/e2e/frame_suggest.mjs -- the suggestions in the frame's dock (D-suggestions,
// D-dock): @sugg follows the input line; Shift+↓ at the end of the line goes
// into it, a digit picks a word into the line and the keyboard stays; Shift+↑
// back to the line, Shift+← to the source line (@gsel) where ↓ turns the
// source and Enter goes into it; ;g and a letter pick a source and come back;
// a destination other than tezcatl dims the lines; Shift+← at the start of the
// line goes to the input_target. On the right dock (frame-rd) and below: the
// arrows follow the grid, so they are the same.
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
  const SW = `document.querySelector('#dock iframe[title="suggestions"]').contentWindow`;
  await f.waitFor(`(() => { try { return ${SW}.document.querySelectorAll('#grid .cell').length > 0
    && window.frameSkin.target().contentWindow.Tezcatl.targetsReady; } catch (_) { return false; } })()`, 15000);
  const words = () => f.eval(`[...${SW}.document.querySelectorAll('#grid .cell .word')].map((e) => e.textContent).join(' ')`);
  const where = () => f.eval(`(() => { const a = document.activeElement;
    if (a.id === 'line') return 'form';
    if (a.classList.contains('dock-gsel')) return 'gsel';
    if (a.title === 'suggestions') return 'sugg';
    return a.getAttribute('data-dock-part') || a.title || a.tagName; })()`);
  const line = () => f.eval(`document.getElementById('line').value`);
  const gsel = () => f.eval(`document.querySelector('#dock .dock-gsel').textContent`);
  const press = async (key, code, text, mods = 0) => { await f.key(key, code, text, mods); await wait(250); };
  const type = async (s) => { for (const ch of s) await f.key(ch, '', ch); await wait(300); };

  check(/▼ lines/.test(await gsel()), 'the source line: ▼ lines -- ' + await gsel());
  check((await words()).startsWith('skin block'), 'the suggestions: the first words -- ' + await words());

  await f.eval(`document.getElementById('line').focus(); true`);
  await type('sk');
  check(await words() === 'skin', 'they follow the line as it is typed -- ' + await words());
  await press('ArrowLeft', 'ArrowLeft', '');
  await press('ArrowDown', 'ArrowDown', '', SHIFT);
  check(await where() === 'form', 'Shift+↓ with the caret not at the end: stays (a selection is not taken)');
  await f.eval(`(() => { const l = document.getElementById('line'); l.setSelectionRange(l.value.length, l.value.length); return true; })()`);
  await press('ArrowDown', 'ArrowDown', '', SHIFT);
  check(await where() === 'sugg', 'Shift+↓ at the end: into the suggestions');
  await press('1', 'Digit1', '1');
  check(await line() === 'skin ' && await where() === 'sugg', 'a digit: the word into the line, the keyboard stays -- "' + await line() + '"');
  check((await words()).startsWith('add'), 'the next words -- ' + await words());
  await press('1', 'Digit1', '1');
  check(await line() === 'skin add ', 'and the next -- "' + await line() + '"');
  await press('ArrowUp', 'ArrowUp', '', SHIFT);
  check(await where() === 'form', 'Shift+↑: back to the line');
  await type('tree');
  await press('Enter', 'Enter', '\r');
  await f.waitFor(`/> skin add tree/.test(document.getElementById('recv').textContent)`, 8000);
  check(true, 'the line built runs (skin add tree)');
  await wait(300);
  check((await words()).startsWith('skin block'), 'the line emptied: the suggestions from the first word again');

  await f.eval(`document.getElementById('line').focus(); true`);
  await press('ArrowDown', 'ArrowDown', '', SHIFT);
  await press('ArrowLeft', 'ArrowLeft', '', SHIFT);
  check(await where() === 'gsel', 'Shift+← from the suggestions: the source line');
  await press('ArrowDown', 'ArrowDown', '');
  check(/▼ intents/.test(await gsel()), '↓ turns the source -- ' + await gsel());
  await f.waitFor(`(() => { try { return /config=intent/.test(${SW}.location.search) && ${SW}.document.querySelectorAll('#grid .cell').length > 0; } catch (_) { return false; } })()`, 8000);
  check((await words()).startsWith('magit.'), 'the shell shows that source -- ' + await words());
  await press('Enter', 'Enter', '\r');
  check(await where() === 'sugg', 'Enter: into the suggestions');
  await press('ArrowRight', 'ArrowRight', '', SHIFT);
  check(await where() === 'sugg', 'Shift+→ with nothing there to enter: stays');

  await f.eval(`document.getElementById('line').focus(); true`);
  await type(';g');
  check(await where() === 'gsel', ';g: to the source line');
  await press('l', 'KeyL', 'l');
  check(/▼ lines/.test(await gsel()) && await where() === 'form', 'l: lines, and back to the line');
  await f.waitFor(`(() => { try { return /config=line/.test(${SW}.location.search) && ${SW}.document.querySelectorAll('#grid .cell').length > 0; } catch (_) { return false; } })()`, 8000);

  await type(';i');
  await press('e', 'KeyE', 'e');
  await wait(300);
  const dim = await f.eval(`${SW}.document.getElementById('grid').className + ' | ' + ${SW}.document.getElementById('note').textContent`);
  check(/^dim \| the input form sends to emacs-vent/.test(dim), 'sending to emacs-vent: the lines dim, with a note -- ' + dim);
  await type(';i');
  await press('t', 'KeyT', 't');
  await wait(300);
  check(!/dim/.test(await f.eval(`${SW}.document.getElementById('grid').className`)), 'back to tezcatl: not dim');

  await f.eval(`(() => { const l = document.getElementById('line'); l.focus(); l.value = ''; return true; })()`);
  await press('ArrowLeft', 'ArrowLeft', '', SHIFT);
  check(await where() === 'itgt', 'Shift+← at the start of the line: the input_target -- ' + await where());

  const shot = await f.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(E2E, 'frame_suggest_' + side + '.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('  (screenshot: ' + path.join(E2E, 'frame_suggest_' + side + '.png') + ')');
  await f.close();
}
done();
