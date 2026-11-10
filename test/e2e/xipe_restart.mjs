// test/e2e/xipe_restart.mjs -- the Xipe dialogue window keeps working
// across a Xipe Totec restart. The fake server (root
// "fake") is the relay's "connect" entry, the shape `t` runs the real one
// in; `stack.sh restart-fake` stops it and starts it again on the same port
// while the window stays open. The relay's upstream reconnects and says
// `attached` again; the window must re-`initialize` instead of getting
// `not_initialized` for every line from then on.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openPage, PAGES, check, done } from './cdp.mjs';

const stack = fileURLToPath(new URL('./stack.sh', import.meta.url));
const p = await openPage(PAGES + 'panels/skins/xipe.html?root=fake');
const F = (part) => `[...document.querySelectorAll('iframe')].find(f => (f.src||'').includes(${JSON.stringify(part)}))`;
const outText = `(${F('code_xipe_out')}?.contentDocument.querySelector('.cm-content')||{innerText:''}).innerText`;
const count = (re) => `((${outText}).match(${re}) || []).length`;
const sendLine = async (t) => {
  await p.eval(`${F('code_xipe_in')}.contentWindow.focus(); ${F('code_xipe_in')}.contentDocument.querySelector('.cm-content').focus(); true`);
  await p.send('Input.insertText', { text: t });
  await p.key('Enter', 'Enter', '\r', 2);
};

console.log('xipe window across a Xipe Totec restart (root=fake, mode connect)');
check(!!(await p.waitFor(`${count('/connected: project fake/g')} === 1`, 60000)), 'connects');
await sendLine('ping');
check(!!(await p.waitFor(`${count('/^pong$/gm')} === 1`, 8000)), 'a line is answered before the restart');

execFileSync(stack, ['restart-fake'], { stdio: 'inherit' });

check(!!(await p.waitFor(`${count('/connected: project fake/g')} === 2`, 30000)),
  'after the restart the window re-initializes by itself ("# connected" again)');
check(/# reattached/.test(await p.eval(outText)), 'the transcript says the connection was re-attached');
await sendLine('ping');
await p.waitFor(`${count('/^pong$/gm')} === 2 || /not_initialized/.test(${outText})`, 8000);
const after = await p.eval(outText);
check(!/not_initialized/.test(after), 'no not_initialized after the restart');
check((after.match(/^pong$/gm) || []).length === 2, 'a line typed after the restart is answered');
check(/open/.test(await p.eval(`document.getElementById('status').textContent`)), 'status bar is back to open');

const errs = p.logs.filter((l) => /exception|console.error/.test(l));
check(errs.length === 0, 'no JS exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.close();
done();
