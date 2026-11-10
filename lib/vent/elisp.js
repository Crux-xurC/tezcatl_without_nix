// lib/vent/elisp.js -- the Elisp a resolver intent sends, built from its
// template (emacs.form, with {{param}} / {{local}}): the literals (strings
// escaped, ints, bools, enums), the fixed M-: wrapper that answers
// tez:<corr> ok|err <json>, and the key events that type it. The same for
// every Emacs extension -- what an extension does is its intents' forms, in
// command/dialects/emacs/extensions/<extension>.json. Split out of
// lib/vent/resolver.js.
(function (root) {
  'use strict';
  const Tezcatl = (root.Tezcatl = root.Tezcatl || {});

  function resolveLocal(providerId, ctx) {
    const map = {
      '$context.buffer-name': ctx && ctx['buffer-name'],
      '$context.window': ctx && ctx.window,
      '$context.frame': ctx && ctx.frame,
    };
    if (!(providerId in map)) throw new Error('unknown local provider "' + providerId + '"');
    const v = map[providerId];
    if (v == null) throw new Error('local "' + providerId + '" unavailable (no context yet)');
    return { value: v, type: 'string' };
  }

  function fill(form, intent, args, ctx) {
    const params = {};
    (intent.params || []).forEach(function (p) { params[p.name] = p; });
    const locals = intent.locals || {};

    return form.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, function (_, name) {
      if (params[name]) {
        const spec = params[name];
        let raw = args[name];
        if ((raw == null || raw === '') && spec.default != null) raw = spec.default;
        if (raw == null || raw === '') {
          if (spec.required) throw new Error('missing required param "' + name + '"');
          raw = '';
        }
        return elispLit(raw, spec.type || 'string', spec);
      }
      if (name in locals) {
        const r = resolveLocal(locals[name], ctx);
        return elispLit(r.value, r.type, null);
      }
      throw new Error('template refers to "{{' + name + '}}" -- not a param or local');
    });
  }

  const ELISP_ESC = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\t': '\\t',
                      '\r': '\\r', '\f': '\\f', '\v': '\\v' };
  function elispString(value) {
    return '"' + String(value).replace(/[\\"\x00-\x1f\x7f]/g, function (c) {
      return ELISP_ESC[c] ||
        ('\\' + ('00' + c.charCodeAt(0).toString(8)).slice(-3));
    }) + '"';
  }

  function elispLit(value, type, spec) {
    switch (type) {
      case 'string':
      case 'path':
        return elispString(value);
      case 'int': {
        const n = Number(value);
        if (!Number.isFinite(n) || Math.trunc(n) !== n) {
          throw new Error('param expects an integer, got "' + value + '"');
        }
        return String(n);
      }
      case 'bool':
        return (value === true || value === 'true' || value === 't') ? 't' : ':false';
      case 'enum': {
        const allowed = (spec && spec.values) || [];
        if (allowed.indexOf(String(value)) === -1) {
          throw new Error('enum param: "' + value + '" not one of ' + JSON.stringify(allowed));
        }
        return String(value);
      }
      default:
        throw new Error('unknown param type "' + type + '"');
    }
  }

  function j(expr) {
    return "(decode-coding-string (json-serialize " + expr + ") 'utf-8)";
  }

  function wrap(form, corr) {
    const id = '"' + corr + '"';
    return '(let ((message-log-max nil))' +
             '(condition-case e' +
                 '(let ((v ' + form + '))' +
                    '(message "tez:%s ok %s" ' + id + ' ' + j('(if (null v) :null v)') + '))' +
               '(quit (message "tez:%s err %s" ' + id + ' ' + j('"interrupted"') + '))' +
               '(error (message "tez:%s err %s" ' + id + ' ' + j('(error-message-string e)') + ')))' +
             'nil)';
  }

  // emacs.later (D-intent-later): the form starts a process and returns it.
  // tez:<corr> took <pid> at once; when the process ends, its sentinel (after
  // the one it had, Magit's) answers ok {exit, output} or err "exited <n>:
  // <output>". output: what (process-get proc 'tez-output) makes of the
  // process, if the form put a function there (a text to show, never read
  // here), its last OUTPUT_MAX characters.
  const OUTPUT_MAX = 2000;
  function wrapLater(form, corr) {
    const id = '"' + corr + '"';
    const out = '(let ((f (process-get proc (quote tez-output))) (s nil))' +
                  '(setq s (or (and f (condition-case nil (funcall f proc) (error nil))) ""))' +
                  '(if (> (length s) ' + OUTPUT_MAX + ') (substring s (- (length s) ' + OUTPUT_MAX + ')) s))';
    return '(let ((message-log-max nil))' +
             '(condition-case e' +
                 '(let ((p ' + form + '))' +
                    '(unless (processp p) (error "a later intent\'s form did not return a process"))' +
                    // no closure (M-: may evaluate with dynamic binding): the sentinel
                    // it had is kept on the process and called first
                    '(process-put p (quote tez-sentinel) (process-sentinel p))' +
                    '(set-process-sentinel p' +
                      '(lambda (proc event)' +
                        '(let ((s0 (process-get proc (quote tez-sentinel)))) (when s0 (funcall s0 proc event)))' +
                        '(unless (process-live-p proc)' +
                          '(let ((message-log-max nil) (code (process-exit-status proc)) (o ' + out + '))' +
                            '(if (eq code 0)' +
                                '(message "tez:%s ok %s" ' + id + ' ' + j('(list :exit 0 :output o)') + ')' +
                              '(message "tez:%s err %s" ' + id + ' ' + j('(format "exited %s: %s" code o)') + '))))))' +
                    '(message "tez:%s took %s" ' + id + ' ' + j('(process-id p)') + '))' +
               '(quit (message "tez:%s err %s" ' + id + ' ' + j('"interrupted"') + '))' +
               '(error (message "tez:%s err %s" ' + id + ' ' + j('(error-message-string e)') + ')))' +
             'nil)';
  }

  function buildEval(intent, args, ctx, corr) {
    const em = intent.emacs || {};
    const form = fill(em.form || '', intent, args || {}, ctx);
    const wrapped = em.later ? wrapLater(form, corr) : wrap(form, corr);
    const events = [{ key: ':', modifiers: ['meta'] }]
      .concat(Tezcatl.text.encode(wrapped).events)
      .concat([{ key: 'return', modifiers: [] }]);
    return { form: form, wrapped: wrapped, events: events };
  }

  Tezcatl.elisp = { resolveLocal: resolveLocal, fill: fill, elispString: elispString, elispLit: elispLit, wrap: wrap, wrapLater: wrapLater, buildEval: buildEval };
  if (typeof module === 'object' && module.exports) module.exports = Tezcatl.elisp;
})(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this));
