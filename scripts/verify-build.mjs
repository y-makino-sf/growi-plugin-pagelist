import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 実行ディレクトリに依存せず、GROWIが読む固定位置とエントリキーを検証します。
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(dist, '.vite', 'manifest.json'), 'utf8'));
const entry = manifest['client-entry.tsx'];
assert.ok(entry?.isEntry, 'client-entry.tsx がエントリとして登録されていません。');
for (const asset of [entry.file, ...(entry.css ?? [])]) {
  assert.equal(typeof asset, 'string');
  const assetPath = path.resolve(dist, asset);
  assert.ok(assetPath.startsWith(`${dist}${path.sep}`), '成果物のパスがdist外を参照しています。');
  assert.ok((await stat(assetPath)).size > 0, `成果物が空です: ${asset}`);
}
const script = await readFile(path.join(dist, entry.file), 'utf8');
assert.ok(script.includes('growi-plugin-pagelist') && script.includes('pluginActivators'), '登録処理がビルドに含まれていません。');
console.log(`ビルド成果物検証OK: client-entry.tsx -> ${entry.file}`);