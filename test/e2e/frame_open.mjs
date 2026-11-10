// test/e2e/frame_open.mjs -- the frame's `open <page> [tab|window]` and the
// launcher's list (D-open-page), in headless Chromium: a window is a popup
// (no location bar), a tab is not; an unknown page and a bad line are said;
// the launcher's list goes through the same opener; main.html is the main skin (its image panel).
// In Poca itself (windows keeping the secret): poca_gate.mjs.
import { openPage, attachTo, PAGES, check, done } from './cdp.mjs';

const f = await openPage(PAGES + 'panels/skins/frame.html');
await f.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
// as from a key press (a user gesture: Chromium refuses a pop-up without one)
const gesture = (p, expression) => p.send('Runtime.evaluate', { expression, userGesture: true, awaitPromise: true });
const run = (line) => gesture(f, `window.frameSkin.run(${JSON.stringify(line)}); true`);
const popup = (p) => p.eval('!window.locationbar.visible');

await f.eval(`window.frameSkin.run('open nav window'); true`);
check(!!await f.waitFor(`/! the pop-up was refused \\(panels\\/tool\\/list\\.html, window\\)/.test(document.getElementById('recv').textContent)`, 5000),
  'without a key press Chromium refuses the pop-up, and the frame says so');
await run('open nav window');
const w = await attachTo('config=nav');
check(await popup(w), 'open nav window: a window (a popup, no location bar)');
await f.waitFor(`/opened panels\\/tool\\/list\\.html in a new window/.test(document.getElementById('recv').textContent)`, 5000);
check(true, 'the frame says what it opened');
await w.close();

await run('open tab killring');
const t = await attachTo('config=killring');
check(!await popup(t), 'open tab killring: a tab (the words in any order)');
await t.close();

await run('open no_such_page');
check(!!await f.waitFor(`/! no page "no_such_page" in the launcher/.test(document.getElementById('recv').textContent)`, 5000),
  'an unknown page is said');
await run('open a b');
check(!!await f.waitFor(`/! one page at a time: b/.test(document.getElementById('recv').textContent)`, 5000), 'two pages are refused');

// the launcher's list: M-w opens a window, Enter config.json's open-mode (tab)
const l = await openPage(PAGES + 'panels/tool/list.html?config=panels_and_skins');
await l.waitFor(`!!window.Tezcatl && !!Tezcatl.openPage && document.body.textContent.includes('code_editor')`, 10000);
const via = (fn) => gesture(l, `(${fn})(Tezcatl.listKinds.panels_and_skins, {id: 'xterm', raw: {id: 'xterm', page: 'panels/resident/xterm.html'}}); true`);
await via(`(k, it) => k.onKey('M-w', it, {keys: {'M-w': 'window'}}, {})`);
const lw = await attachTo('panels/resident/xterm.html');
check(await popup(lw), "the list's M-w: a window");
await lw.close();
await via(`(k, it) => k.onSelect(it, {}, {})`);
const lt = await attachTo('panels/resident/xterm.html');
check(!await popup(lt), "the list's Enter: a tab (launcher.open-mode)");
await lt.close();
await l.close();

// main.html: the main skin (skins/main.json) -- a frame with the dock and an image panel
const m = await openPage(PAGES + 'main.html');
await m.waitFor(`(() => { const f = document.getElementById('frame'); const d = f && f.contentDocument;
  return !!(d && [...d.querySelectorAll('iframe')].some((x) => /panels\/extra\/image\.html/.test(x.src))); })()`, 10000);
check(true, "main.html: the main skin, its image panel");
await m.close();
await f.close();
done();
