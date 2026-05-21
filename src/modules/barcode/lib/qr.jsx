// Pure-JS QR generator (byte mode, EC L, v1-10) — no external deps.
const EXP = new Uint8Array(512); const LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const gMul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
function rsGenerator(degree) {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= gMul(g[j], 1); next[j + 1] ^= gMul(g[j], EXP[i]); }
    g = next;
  } return g;
}
function rsEncode(data, degree) {
  const gen = rsGenerator(degree); const out = new Uint8Array(degree);
  for (const b of data) { const f = b ^ out[0]; out.copyWithin(0, 1); out[degree - 1] = 0;
    for (let j = 0; j < degree; j++) out[j] ^= gMul(gen[j + 1], f); } return out;
}
const VERSION_INFO = [null,
  { dc: 19,  ec: 7,  g1: 1, dc1: 19,  g2: 0, dc2: 0  },
  { dc: 34,  ec: 10, g1: 1, dc1: 34,  g2: 0, dc2: 0  },
  { dc: 55,  ec: 15, g1: 1, dc1: 55,  g2: 0, dc2: 0  },
  { dc: 80,  ec: 20, g1: 1, dc1: 80,  g2: 0, dc2: 0  },
  { dc: 108, ec: 26, g1: 1, dc1: 108, g2: 0, dc2: 0  },
  { dc: 136, ec: 18, g1: 2, dc1: 68,  g2: 0, dc2: 0  },
  { dc: 156, ec: 20, g1: 2, dc1: 78,  g2: 0, dc2: 0  },
  { dc: 194, ec: 24, g1: 2, dc1: 97,  g2: 0, dc2: 0  },
  { dc: 232, ec: 30, g1: 2, dc1: 116, g2: 0, dc2: 0  },
  { dc: 274, ec: 18, g1: 2, dc1: 68,  g2: 2, dc2: 69 },
];
function pickVersion(byteLength) {
  for (let v = 1; v < VERSION_INFO.length; v++) {
    const headerBits = 4 + (v < 10 ? 8 : 16);
    const dataBits = headerBits + byteLength * 8 + 4;
    if (Math.ceil(dataBits / 8) <= VERSION_INFO[v].dc) return v;
  } return 10;
}
function bitsToBytes(bits) {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) out[i >> 3] |= 0x80 >> (i & 7);
  return out;
}
function encodeData(text, version) {
  const bytes = new TextEncoder().encode(text);
  const lenBits = version < 10 ? 8 : 16; const bits = [];
  for (const b of [0,1,0,0]) bits.push(b);
  for (let i = lenBits - 1; i >= 0; i--) bits.push((bytes.length >> i) & 1);
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  const cap = VERSION_INFO[version].dc * 8;
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  let pad = 0xEC;
  while (bits.length < cap) {
    for (let i = 7; i >= 0; i--) bits.push((pad >> i) & 1);
    pad = pad === 0xEC ? 0x11 : 0xEC;
  } return bitsToBytes(bits);
}
function interleave(data, vinfo) {
  const blocks = []; let cursor = 0;
  for (let g = 0; g < vinfo.g1; g++) { blocks.push(data.slice(cursor, cursor + vinfo.dc1)); cursor += vinfo.dc1; }
  for (let g = 0; g < vinfo.g2; g++) { blocks.push(data.slice(cursor, cursor + vinfo.dc2)); cursor += vinfo.dc2; }
  const ecBlocks = blocks.map((b) => rsEncode(b, vinfo.ec));
  const maxLen = Math.max(...blocks.map((b) => b.length));
  const out = [];
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < vinfo.ec; i++) for (const b of ecBlocks) out.push(b[i]);
  return out;
}
function placeFinder(m, x, y) {
  for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
    const cx = x + dx, cy = y + dy;
    if (cx < 0 || cy < 0 || cx >= m.length || cy >= m.length) continue;
    const isBorder = dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
                     (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
    m[cy][cx] = isBorder ? 1 : 0;
  }
}
function makeMatrix(text) {
  const data = new TextEncoder().encode(text);
  const version = pickVersion(data.length);
  const size = 21 + (version - 1) * 4;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  placeFinder(m, 0, 0); placeFinder(m, size - 7, 0); placeFinder(m, 0, size - 7);
  for (let i = 8; i < size - 8; i++) {
    if (m[6][i] === null) m[6][i] = i % 2 === 0 ? 1 : 0;
    if (m[i][6] === null) m[i][6] = i % 2 === 0 ? 1 : 0;
  }
  m[size - 8][8] = 1;
  const fmt = []; for (let i = 0; i <= 8; i++) { fmt.push([i, 8]); fmt.push([8, i]); }
  for (let i = size - 8; i < size; i++) { fmt.push([8, i]); fmt.push([i, 8]); }
  fmt.forEach(([x, y]) => { if (m[y][x] === null) m[y][x] = 0; });
  const vinfo = VERSION_INFO[version];
  const interleaved = interleave(encodeData(text, version), vinfo);
  let bitIndex = 0; let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < size; i++) {
      const y = upward ? size - 1 - i : i;
      for (let dx = 0; dx < 2; dx++) {
        const x = col - dx; if (m[y][x] !== null) continue;
        const byte = interleaved[bitIndex >> 3] || 0;
        const bit = (byte >> (7 - (bitIndex & 7))) & 1;
        const mask = ((x + y) % 2) === 0;
        m[y][x] = bit ^ (mask ? 1 : 0); bitIndex++;
      }
    }
    upward = !upward;
  }
  const FORMAT_BITS = 0b111011111000100;
  for (let i = 0; i <= 5; i++)  m[8][i] = (FORMAT_BITS >> i) & 1;
  m[8][7] = (FORMAT_BITS >> 6) & 1; m[8][8] = (FORMAT_BITS >> 7) & 1; m[7][8] = (FORMAT_BITS >> 8) & 1;
  for (let i = 9; i < 15; i++)  m[14 - i][8] = (FORMAT_BITS >> i) & 1;
  for (let i = 0; i < 8; i++)   m[size - 1 - i][8] = (FORMAT_BITS >> i) & 1;
  for (let i = 0; i < 7; i++)   m[8][size - 7 + i] = (FORMAT_BITS >> (8 + i)) & 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m[y][x] === null) m[y][x] = 0;
  return m;
}
export function qrSVG(text, { size = 96, margin = 2, color = "#000", bg = "#fff" } = {}) {
  if (!text) return "";
  const m = makeMatrix(String(text)); const n = m.length;
  const total = n + margin * 2; const cell = size / total; const rects = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    if (m[y][x]) rects.push(`<rect x="${(x + margin) * cell}" y="${(y + margin) * cell}" width="${cell}" height="${cell}" fill="${color}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${bg}"/>${rects.join("")}</svg>`;
}
export function qrDataUrl(text, opts) {
  const svg = qrSVG(text, opts);
  if (!svg) return "";
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}
