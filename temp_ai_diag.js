const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ts = require('typescript');
const commits = ['203629cc3e9eb2308c893566353c2820c548c13c','467fdde','a1ad837','9f8398a','853d943'];
for (const c of commits) {
  const src = execSync(`git show ${c}:frontend/src/components/feature/AIChat.tsx`).toString('utf8');
  const r = ts.transpileModule(src, {
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  console.log(`${c}: ${r.diagnostics ? r.diagnostics.length : 0}`);
}
