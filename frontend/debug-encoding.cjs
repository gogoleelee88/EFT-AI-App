const fs = require("fs");
const { TextDecoder } = require('util');
const path = 'src/components/feature/AIChat.tsx';
const buf = fs.readFileSync(path);
const dec = new TextDecoder('utf-8', { fatal: true });
try {
  dec.decode(buf);
  console.log('ok');
} catch (e) {
  console.log('invalid utf8');
  console.log('message:', e.message);
}
