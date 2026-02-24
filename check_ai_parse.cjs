const fs = require('fs');
const ts = require('typescript');
const path = process.argv[2];
const source = fs.readFileSync(path, 'utf8');
const res = ts.transpileModule(source, {
  fileName: path,
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    allowJs: false,
    strict: false,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
    lib: ['ES2020', 'DOM'],
    esModuleInterop: true,
    skipLibCheck: true,
  },
  reportDiagnostics: true,
});
if (res.diagnostics && res.diagnostics.length) {
  console.error('diag', res.diagnostics.length);
  for (const d of res.diagnostics.slice(0,5)) {
    const pos = d.start == null ? -1 : d.start;
    const line = source.slice(0, pos).split('\n').length;
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    console.error('line', line, msg);
  }
  process.exit(1);
}
console.log('ok');
