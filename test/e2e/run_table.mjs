// test/e2e/run_table.mjs -- the run_table panel (D-run-table): `run new <template>`
// makes a book from a template (a path of the FS root here) in the work place;
// `run start` sends the rows, the smallest id with an empty status first, each to
// its input -- tezcatl (the frame's own lines are watched) and an xterm (what it
// prints) -- and writes what came of it: a key of the template (a line beginning
// with its prefix; `! ` from tasks/run_keys.json), done (the wait went by),
// skip (auto F under a failure), send-failed (no such input). A variable goes
// in escaped. `run stop` writes stop in every empty status; `run save` writes
// the book (refused over a file there, save! does it); x empties a status and
// R sends it again; `run new` of the same template reads its book. `run insert-if
// <status> #<id>` (stage 2), a row's line to tezcatl: when the row above has the
// status, a copy of #<id> goes just under it (4 -> 4.1), the row itself done at
// once; a row that is not there is a `! ` line (err); typed by hand, refused.
// `run from <intent>` (stage 3): the book made from the intent's answer by its
// result.book (a page of its own plays the input panel: it answers intent.run);
// `-` leaves a row out; `intent <id> name=value` runs an intent from a row (a
// value in quotes keeps its blank), a failure a `! ` line (err).
// Stage 4: rows start and stop an output_log (`log start! <path>` / `log stop`),
// which writes down the frame's lines, the xterm's and the run lines; `run match
// <record>` sets it beside the book -- a line that came after its row's wait (a
// late #fail) is ≠ there, though the book says done.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, PAGES, check, done } from './cdp.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const E2E = process.env.E2E_DIR || path.join(process.env.TMPDIR || '/tmp', 'tezcatl-e2e');
const dir = path.join(E2E, 'fsroot', 'rt');
const books = path.join(E2E, 'work', 'books', 'run');
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(books, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const COLS = ['id', 'input', 'line', 'wait', 'auto', 'status', 'note', 'arg'];
fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({
  columns: COLS, defaults: { input: 't', wait: '1', auto: 'T' }, keys: { fail: ['#fail'] },
  rows: [
    ['1', 't', 'skin nonsense'],
    ['2', 't', 'who', '', 'F'],
    ['3', 't', 'who', '', 'T'],
    ['4', 'x', 'echo "#fail {arg}";e', '5', '', '', '', 'a;b'],
    ['5', 'x', 'echo fine;e'],
    ['6', 'z9', 'who'],
  ],
}));
fs.writeFileSync(path.join(dir, 'i.json'), JSON.stringify({
  columns: COLS, defaults: { input: 't', wait: '1' },
  rows: [
    ['1', '', 'skin nonsense'],
    ['2', '', 'run insert-if err #20', '6'],
    ['3', '', 'run insert-if done #20', '6'],
    ['4', '', 'run insert-if done #99', '6'],
    ['5', '', 'run insert-if err #20', '6'],
    ['20', 'x', 'echo fixed;e', '', '', '-'],
  ],
}));
fs.writeFileSync(path.join(dir, 'f.json'), JSON.stringify({
  columns: ['id', 'input', 'line', 'wait', 'auto', 'status', 'note', 'section', 'path'],
  defaults: { input: 't', wait: '3', line: 'intent fake.stage path="{path}"' },
  rows: [],
}));
fs.writeFileSync(path.join(dir, 'l.json'), JSON.stringify({
  columns: COLS, defaults: { input: 't', wait: '1' }, keys: { fail: ['#fail'] },
  rows: [
    ['1', 't', 'log start! ~work/logs/e2e.log'],
    ['2', 'x', 'echo one;e'],
    ['3', 'x', '(sleep 2;; echo;; echo "#fail late") &;e'],
    ['4', 't', 'who', '3'],
    ['5', 't', 'log stop', '2'],
  ],
}));
fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({
  columns: COLS, defaults: { input: 't', wait: '2' },
  rows: [['1', '', 'who'], ['2', '', 'who'], ['3', '', 'who']],
}));
const book = (n) => JSON.parse(fs.readFileSync(path.join(books, n + '.json'), 'utf8'));
const statuses = (n) => book(n).rows.map((r) => r[5]);

const p = await openPage(PAGES + 'panels/skins/frame.html');
await p.waitFor(`/ready|empty\\./.test(document.getElementById('recv').textContent)`, 15000);
const IT = `window.frameSkin.target().contentWindow`;
await p.waitFor(`(() => { try { return ${IT}.Tezcatl.targetsReady; } catch (_) { return false; } })()`, 15000);
const recvAll = () => p.eval(`document.getElementById('recv').textContent`);
const run = (line) => p.eval(`window.frameSkin.run(${JSON.stringify(line)}); true`);
const st = () => p.eval(`JSON.stringify(window.frameSkin.state())`).then(JSON.parse);
const placeOf = async (panel) => { const s = await st(); for (let c = 0; c < s.columns.length; c++) for (let r = 0; r < s.columns[c].length; r++) if (s.columns[c][r][0] === panel) return String(c + 1) + String(r + 1); return null; };
const fdoc = (pl) => `window.frameSkin.frameAt(${JSON.stringify(pl)}).contentDocument`;
const press = async (pl, ...ks) => { for (const k of ks) { await p.eval(`(() => { const g = ${fdoc(pl)}.getElementById('grid-wrap'); g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true })); return true; })()`); await wait(60); } };
const gridRows = (pl) => p.eval(`JSON.stringify([...${fdoc(pl)}.querySelectorAll('table.mx-grid tbody tr')].map((tr) => [...tr.querySelectorAll('td')].slice(1).map((td) => td.textContent)))`).then(JSON.parse);
async function until(fn, ms) { const t = Date.now() + ms; while (Date.now() < t) { try { if (await fn()) return true; } catch (_) {} await wait(200); } return false; }

// an xterm to send to (x)
await run('skin main 2');
await run('skin add xterm');
await p.waitFor(`/x\\s*xterm[^\\n]*connected/.test(${IT}.document.getElementById('list').innerText)`, 20000);
check(true, 'an xterm in the skin, connected (x in input_target)');

console.log('run_table: new, start');
await run('run new rt/a.json');
check(await until(async () => fs.existsSync(path.join(books, 'a.json')), 10000), 'run new rt/a.json: its book made in the work place (~work/books/run/a.json)');
const rp = await placeOf('run_table');
check(rp && await p.waitFor(`${fdoc(rp)} && ${fdoc(rp)}.querySelectorAll('table.mx-grid tbody tr').length === 6`, 10000), '...a run_table drawn with its 6 rows');
check(JSON.stringify(book('a').columns) === JSON.stringify(COLS) && book('a').rows[1][3] === '1', '...the defaults in (wait 1)');

await run('run start');
check(await until(async () => statuses('a').every((s) => s && s !== 'sent'), 30000), 'run start: every status filled -- ' + statuses('a').join(', '));
const s = statuses('a');
const n = book('a').rows.map((r) => r[6]);
check(s[0] === 'err' && /^! no such command/.test(n[0]), '#1 tezcatl: "! " at the head of the frame\'s line is err (tasks/run_keys.json) -- ' + n[0]);
check(s[1] === 'skip' && /#1 failed/.test(n[1]), '#2 auto F under #1: skip -- ' + n[1]);
check(s[2] === 'done', '#3 auto T: sent anyway, nothing seen in the wait: done');
check(s[3] === 'fail' && n[3] === '#fail a;b', '#4 xterm: the template\'s key #fail, the variable in as typed (a;b) -- ' + n[3]);
check(s[4] === 'done', '#5 xterm: done');
check(s[5] === 'send-failed' && /no destination "z9"/.test(n[5]), '#6 no such input: send-failed -- ' + n[5]);
check(/▶ run a #1 → t/.test(await recvAll()), 'each row going is said on the receiving side (▶ run a #1 → t)');
check((await gridRows(rp)).map((r) => r[5]).join() === s.join(), 'the grid shows the same statuses');

console.log('x and R: a row again');
// the cursor on #3 (rows in id order): j j, x, R
await press(rp, 'j', 'j', 'x');
check(statuses('a')[2] === '' || await until(async () => statuses('a')[2] === '', 3000), 'x: #3\'s status emptied');
await press(rp, 'R');
check(await until(async () => statuses('a')[2] === 'done', 8000), 'R: only #3 goes again -- ' + statuses('a').join(', '));

console.log('run stop');
await run('run new rt/s.json');
check(await until(async () => fs.existsSync(path.join(books, 's.json')), 10000), 'a second run_table (s)');
await wait(800);
await run('run start');
await wait(300);
await run('run stop');
check(await until(async () => statuses('s').join() === 'done,stop,stop', 8000), 'run stop: stop in every empty status; the row going ends with its wait -- ' + statuses('s').join(', '));

console.log('run save');
await run('run save rt/saved.json');
check(await until(async () => fs.existsSync(path.join(dir, 'saved.json')), 5000) && JSON.parse(fs.readFileSync(path.join(dir, 'saved.json'), 'utf8')).rows.length === 3, 'run save: the book written to rt/saved.json');
await run('run save rt/saved.json');
check(await until(async () => /saved\.json is there/.test(await recvAll()), 5000), '...again: refused (save! writes over it)');
await run('run save! rt/saved.json');
check(await until(async () => (await recvAll()).match(/saved to rt\/saved\.json/g).length === 2, 5000), '...save!: written over');

console.log('run new of the same template reads its book');
await run('skin del');
await run('run new rt/s.json');
check(await until(async () => /read the book ~work\/books\/run\/s\.json/.test(await recvAll()), 8000), 'run new rt/s.json again: its book read (statuses kept)');
await run('run new! rt/s.json');
check(await until(async () => statuses('s').join() === ',,', 8000), 'run new!: made again from the template -- ' + statuses('s').join(', '));

console.log('run insert-if');
await run('run insert-if done #1');
check(await until(async () => /! run insert-if ── no run_table is sending a row now/.test(await recvAll()), 5000), 'typed by hand (no row going): refused');
await run('run new rt/i.json');
check(await until(async () => fs.existsSync(path.join(books, 'i.json')), 10000), 'a run_table of rt/i.json');
await wait(800);
const t0 = Date.now();
await run('run start');
const idsOf = () => book('i').rows.map((r) => r[0] + ':' + r[5]).join(' ');
check(await until(async () => book('i').rows.length === 9 && book('i').rows.every((r) => r[5] && r[5] !== 'sent'), 40000), 'every row filled -- ' + idsOf());
check(idsOf() === '1:err 2:done 2.1:done 3:done 3.1:done 4:err 5:done 5.1:done 20:-', '...the copies just under the rows whose row above had the status (2.1 under 2, 3.1 under 3 -- its row above is the copy 2.1 --, 5.1 under 5) -- ' + idsOf());
const ni = book('i').rows;
check(/inserted #2\.1 from #20 \(#1 was err\)/.test(ni[1][6]) && ni[2][1] === 'x' && ni[2][2] === 'echo fixed;e', '...the row itself done with what it did; the copy keeps the columns of #20 -- ' + ni[1][6]);
check(/^! run insert-if ── no row #99/.test(ni[5][6]), '#4: no row #99 is a ! line of the frame (err) -- ' + ni[5][6]);
check(Date.now() - t0 < 6 * 5 * 1000, 'insert-if rows end at once, not with their wait (6 s)');

console.log('run from <intent>, intent <id> ...');
const helper = await openPage(PAGES + 'panels/tool/list.html?config=commands');
await helper.waitFor(`!!(window.Tezcatl && Tezcatl.bus)`, 10000);
await helper.eval(`(() => {
  window.__ran = [];
  const BOOK = { template: 'rt/f.json', from: 'files', rows: 'objects', put: { path: 'path', section: 'section' } };
  Tezcatl.bus.on('intent.run', (p, meta) => {
    window.__ran.push(p);
    const to = { to: meta.from.id };
    if (p.id === 'fake.files') Tezcatl.bus.post('intent.ran', { req: p.req, ok: true, book: BOOK, payload: { files: [
      { section: 'unstaged', path: '/r/a.js' }, { section: 'untracked', path: '/r/b c.js' }, { section: 'unstaged', path: '/r/c.js' }] } }, to);
    else if (p.id === 'fake.nobook') Tezcatl.bus.post('intent.ran', { req: p.req, ok: true, book: null, payload: [] }, to);
    else if (p.id === 'fake.stage') Tezcatl.bus.post('intent.ran', p.args.path === '/r/c.js' ? { req: p.req, ok: false, error: 'cannot stage ' + p.args.path } : { req: p.req, ok: true, payload: null }, to);
  });
  return true; })()`);
await run('intent fake.stage path=/x/y.js');
check(await until(async () => /intent ── fake\.stage ok/.test(await recvAll()), 5000), 'intent fake.stage path=/x/y.js typed: run through the input panel, said ok');
await run('run from fake.nobook');
check(await until(async () => /the intent fake\.nobook has no result\.book/.test(await recvAll()), 8000), 'run from an intent with no result.book: refused');
await run('run from fake.files');
check(await until(async () => fs.existsSync(path.join(books, 'fake.files.json')), 10000), 'run from fake.files: a book made (~work/books/run/fake.files.json)');
const fb = () => book('fake.files');
check(fb().intent === 'fake.files' && fb().rows.map((r) => r[0] + ' ' + r[8] + ' ' + r[7]).join(' | ') === '1 /r/a.js unstaged | 2 /r/b c.js untracked | 3 /r/c.js unstaged', '...one row an item, the values in the columns result.book says -- ' + fb().rows.map((r) => r[8]).join(', '));
check(fb().rows[0][2] === 'intent fake.stage path="{path}"', '...the line the template\'s default');
const FD = `[...document.querySelectorAll('iframe')].find((f) => /intent=fake\\.files/.test(f.src)).contentDocument`;
await p.waitFor(`(() => { try { return ${FD}.querySelectorAll('table.mx-grid tbody tr').length === 3; } catch (_) { return false; } })()`, 8000);
await p.eval(`(() => { const g = ${FD}.getElementById('grid-wrap'); g.focus(); g.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true })); return true; })()`);
check(await until(async () => fb().rows[0][5] === '-', 3000), '-: #1 left out (its status -)');
await run('run start');
check(await until(async () => fb().rows.every((r) => r[5] && r[5] !== 'sent'), 20000), 'run start: every status filled -- ' + fb().rows.map((r) => r[5]).join(', '));
check(fb().rows.map((r) => r[5]).join() === '-,done,err', '...#1 not sent, #2 done, #3 err (its failure a ! line) -- ' + fb().rows.map((r) => r[5] + ' ' + r[6]).join(' | '));
const ran = JSON.parse(await helper.eval(`JSON.stringify(window.__ran.filter((x) => x.id === 'fake.stage').map((x) => x.args.path))`));
check(JSON.stringify(ran) === JSON.stringify(['/x/y.js', '/r/b c.js', '/r/c.js']), '...the intent got the value with its blank ("{path}") -- ' + ran.join(', '));
check(/^! intent ── fake\.stage: cannot stage \/r\/c\.js/.test(fb().rows[2][6]), '...the note of #3 -- ' + fb().rows[2][6]);
await run('run from fake.files');
check(await until(async () => /read the book ~work\/books\/run\/fake\.files\.json/.test(await recvAll()), 8000) && fb().rows[0][5] === '-', 'run from again: its book read (not asked again)');
const n0 = JSON.parse(await helper.eval(`JSON.stringify(window.__ran.filter((x) => x.id === 'fake.files').length)`));
await run('run from! fake.files');
check(await until(async () => fb().rows.every((r) => r[5] === ''), 8000), 'run from!: asked again, a new book -- asked ' + (JSON.parse(await helper.eval(`JSON.stringify(window.__ran.filter((x) => x.id === 'fake.files').length)`)) - n0) + ' more time(s)');

console.log('log start / stop in rows, run match');
await run('run new rt/l.json');
check(await until(async () => fs.existsSync(path.join(books, 'l.json')), 10000), 'a run_table of rt/l.json');
await wait(800);
await run('run start');
check(await until(async () => book('l').rows.every((r) => r[5] && r[5] !== 'sent'), 30000), 'every row filled -- ' + book('l').rows.map((r) => r[5]).join(', '));
check(book('l').rows.map((r) => r[5]).join() === 'done,done,done,done,done', '...#3 done in the book: its #fail came after its wait');
const LOGF = path.join(E2E, 'work', 'logs', 'e2e.log');
check(await until(async () => /log ── written to ~work\/logs\/e2e\.log \(\d+ lines\) and stopped/.test(await recvAll()), 8000), 'log stop: written and stopped');
const logText = fs.existsSync(LOGF) ? fs.readFileSync(LOGF, 'utf8') : '';
check(/^# output_log/m.test(logText.split('\n')[0].replace(/^\S+ log │ /, '')) && /run │ l #3 send x /.test(logText) && /run │ l #3 sent xterm /.test(logText) && /xterm:\S+ │ #fail late/.test(logText) && /tezcatl │ > who/.test(logText),
  'the record has the run lines, the xterm\'s and the frame\'s, one a line -- ' + logText.split('\n').length + ' lines');
check(await p.eval(`![...document.querySelectorAll('iframe')].some((f) => /output_log/.test(f.src))`), '...the output_log taken away');
await run('run match ~work/logs/e2e.log');
const MD = `[...document.querySelectorAll('iframe')].find((f) => /run_match/.test(f.src)).contentDocument`;
check(await until(async () => (await p.eval(`(() => { try { return ${MD}.querySelectorAll('table.mx-grid tbody tr').length; } catch (_) { return 0; } })()`)) === 5, 10000), 'run match: the 5 rows of the book (l, read from the record)');
const mrows = JSON.parse(await p.eval(`JSON.stringify([...${MD}.querySelectorAll('table.mx-grid tbody tr')].map((tr) => [...tr.querySelectorAll('td')].slice(1).map((td) => td.textContent)))`));
const m3 = mrows.find((r) => r[0] === '3');
check(m3 && m3[3] === 'done' && m3[5] === 'fail' && m3[6] === '#fail late' && m3[8] === '≠', '#3: the book says done, the record has fail (#fail late) -- ≠ -- ' + JSON.stringify(m3));
check(mrows.filter((r) => r[8] === '≠').length === 1, '...the others do not differ -- ' + mrows.map((r) => r[0] + ':' + r[8]).join(' '));
check(/run match ── l against ~work\/logs\/e2e\.log: 5 row\(s\), 1 differ/.test(await recvAll()), '...said on the receiving side');

done();
