// Review the bytes in the Git index, which are the bytes the next commit uses.
// Findings print filenames/categories only, never matched sensitive values.
const { execFileSync } = require('node:child_process');
const allowed = new Set([
  '.gitattributes', '.gitignore', '.github/workflows/ci.yml',
  'README.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md',
  'code.ts', 'ui.html', 'manifest.json', 'package.json', 'package-lock.json', 'tsconfig.json',
  'scripts/build.cjs', 'scripts/configure.cjs', 'scripts/benchmark.cjs', 'scripts/verify-public.cjs',
  'tests/figma-mock.cjs', 'tests/plugin.test.cjs',
  'docs/product-review.md', 'docs/interaction-design.md', 'docs/performance.json', 'docs/validation.md', 'docs/security-review.md'
]);
const patterns = [
  ['personal filesystem path', /\/(?:Users|home)\/[a-z0-9._ -]+\//i],
  ['Windows user path', /[A-Z]:\\Users\\[^\\\s]+/i],
  ['email address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['private design URL', /https?:\/\/(?:www\.)?figma\.com\/(?:design|file|board|slides|make)\/[a-z0-9]{12,}/i],
  ['account-library resource', /try-tool-resource-(?:content-id|type)=/i],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Google API key', /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ['Slack credential', /\bxox[baprs]-[A-Za-z0-9-]{15,}\b/],
  ['OpenAI-style credential', /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ['credential in URL', /https?:\/\/[^\s/@:]+:[^\s/@]+@/i]
];
const git = args => execFileSync('git', args, { maxBuffer: 16 * 1024 * 1024 });
const files = git(['ls-files', '-z', '--cached']).toString().split('\0').filter(Boolean);
if (!files.length) throw new Error('No staged public files. Stage the reviewed source before running this check.');
const failures = [];
for (const file of files) {
  if (!allowed.has(file)) { failures.push(`${file}: outside public-file allowlist`); continue; }
  const mode = git(['ls-files', '--stage', '--', file]).toString().split(' ')[0];
  if (mode !== '100644' && mode !== '100755') { failures.push(`${file}: unsupported file type`); continue; }
  const bytes = git(['show', `:${file}`]);
  if (bytes.includes(0) || bytes.length > 512 * 1024) { failures.push(`${file}: binary or oversized content`); continue; }
  const text = bytes.toString('utf8');
  for (const [category, pattern] of patterns) if (pattern.test(text)) failures.push(`${file}: ${category}`);
}
const manifest = JSON.parse(git(['show', ':manifest.json']).toString());
if (manifest.id !== 'REPLACE_WITH_YOUR_PLUGIN_ID') failures.push('manifest.json: account-specific plugin ID');
if (JSON.stringify(manifest.networkAccess?.allowedDomains) !== '["none"]') failures.push('manifest.json: network access must remain disabled');
if (manifest.relaunchButtons?.some(b => b.command !== 'edit')) failures.push('manifest.json: unexpected relaunch command');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Public index check passed: ${files.length} allowlisted text files; no configured sensitive patterns found.`);
