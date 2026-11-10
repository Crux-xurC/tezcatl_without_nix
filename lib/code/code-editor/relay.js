// The relay as the code editor reaches it:
// its http(s) base -- ③ /fs/*, /mirror -- and the /lsp
// WebSocket URL, both from config.json's connections[0]; the hash a save is
// checked with, and the error of a refused /fs/* request.

// "sha256:<hex>" of a text as UTF-8 -- what the relay compares with the file
// on disk before it writes (x-tezcatl-base). crypto.subtle is there only in a
// secure context (127.0.0.1, localhost); a page opened by another host name
// (TEZCATL_ALLOWED_HOSTS) hashes with sha256Hex below, so the save is still
// checked (before, it went unchecked without a word).
export function hashText(text) {
  const bytes = new TextEncoder().encode(text);
  const subtle = typeof crypto !== "undefined" && crypto.subtle;
  if (!subtle) return Promise.resolve("sha256:" + sha256Hex(bytes));
  return subtle.digest("SHA-256", bytes)
    .then((b) => "sha256:" + Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join(""))
    .catch(() => "sha256:" + sha256Hex(bytes));
}

// SHA-256 (FIPS 180-4) of bytes -> lower-case hex. Plain and small: a text
// as large as an editor holds takes milliseconds.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256Hex(bytes) {
  const n = bytes.length;
  const len = ((n + 9 + 63) >> 6) << 6;           // the 0x80 and the 8-byte length, padded to 64
  const m = new Uint8Array(len);
  m.set(bytes);
  m[n] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(len - 8, Math.floor(n / 0x20000000));   // the length in bits, high word
  dv.setUint32(len - 4, (n << 3) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, r) => (x >>> r) | (x << (32 - r));
  for (let off = 0; off < len; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}

// a non-2xx answer of /fs/*: {error, code, current} when it is JSON
export function fsError(status, body) {
  let j = null;
  try { j = JSON.parse(body); } catch (_) {}
  const e = new Error((j && j.error) || ("HTTP " + status + " " + String(body || "").trim()));
  e.status = status;
  e.code = j && j.code;
  e.current = j && j.current;
  return e;
}

// T: window.Tezcatl (its config.load). Each URL is read once per editor.
export function createRelay(T) {
  function connectionUrl() {
    return (T.config && T.config.load ? T.config.load() : Promise.reject())
      .then((c) => {
        const u = c && c.connections && c.connections[0] && c.connections[0].url;
        return u ? new URL(u) : null;
      });
  }

  // http(s)://host:port of the relay -- ③ lives there
  let httpP = null;
  function httpBase() {
    if (!httpP) {
      httpP = connectionUrl()
        .then((x) => (x ? (x.protocol === "wss:" ? "https:" : "http:") + "//" + x.host : null))
        .catch(() => null);
    }
    return httpP;
  }

  let lspP = null;
  function lspUrl() {
    if (!lspP) {
      lspP = connectionUrl()
        .then((x) => {
          if (!x) return null;
          x.pathname = "/lsp";
          x.search = "";
          x.hash = "";
          return x.toString();
        })
        .catch(() => null);
    }
    return lspP;
  }

  // a WebSocket URL with a new ticket, for each handshake (lib/core/ticket.js,
  // D-poca-secret)
  function ticketed(url) {
    return T.ticket.url(url);
  }

  return { httpBase, lspUrl, ticketed };
}
