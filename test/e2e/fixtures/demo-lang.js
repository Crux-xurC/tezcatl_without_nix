// A hand-written grammar plugin, no build step: the default
// export receives the bundle's language kit and returns an Extension.
// Used by test/e2e/highlight.mjs.
export default ({ language }) => language.StreamLanguage.define({
  name: 'demo',
  token(stream) {
    if (stream.match(/^#.*/)) return 'comment';
    if (stream.match(/^(let|in)\b/)) return 'keyword';
    if (stream.match(/^"[^"]*"/)) return 'string';
    stream.next();
    return null;
  },
});
