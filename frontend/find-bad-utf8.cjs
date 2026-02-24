const fs = require('fs');
const { TextDecoder } = require('util');
const buf = fs.readFileSync('frontend/src/components/feature/AIChat.tsx');
const dec = new TextDecoder('utf-8', { fatal: true });
const bad = [];
for (let i = 1; i <= buf.length; i++) {
  try {
    dec.decode(buf.slice(0, i));
  } catch {
    bad.push(i - 1);
    if (bad.length >= 30) break;
  }
}
console.log('badCount', bad.length);
console.log('first', bad.slice(0, 30));
const textSoFar = fs.readFileSync('frontend/src/components/feature/AIChat.tsx', 'utf8');
const posToLine = (idx) => {
  const prefix = buf.slice(0, idx).toString('latin1');
  const line = prefix.split('\n').length;
  const col = idx - Buffer.from(prefix.replace(/\r?\n.*$/s, '')).length + 1;
  return { line, idx };
};
for (const i of bad.slice(0, 10)) {
  const up = buf.slice(0, i + 1);
  const line = up.toString('latin1').split('\n').length;
  const lineStart = up.lastIndexOf(10);
  const col = i - (lineStart >= 0 ? lineStart : -1) ;
  console.log('bad byte', i, 'line', line, 'col', col);
}
