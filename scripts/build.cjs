const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
esbuild.buildSync({ entryPoints: [path.join(root, 'code.ts')], bundle: true, outfile: path.join(root, 'code.js'), target: 'es2017' });
const output = path.join(root, 'native-plugin');
fs.mkdirSync(output, { recursive: true });
// Package equivalent native HTML controls from the declarative UI source.
// The output has no web server or external script dependency.
let html = fs.readFileSync(path.join(root, 'ui.html'), 'utf8');
html = html
  .replace(/<fig-content>/g, '<main class="plugin-content">').replace(/<\/fig-content>/g, '</main>')
  .replace(/<fig-footer>/g, '<footer class="plugin-footer">').replace(/<\/fig-footer>/g, '</footer>')
  .replace(/<fig-field\b([^>]*)>/g, '<div class="field"$1>').replace(/<\/fig-field>/g, '</div>')
  .replace(/<fig-button\b([^>]*)>/g, '<button class="primary"$1>').replace(/<\/fig-button>/g, '</button>')
  .replace(/<fig-input-number\b([^>]*)><\/fig-input-number>/g, '<input class="number-input" type="number"$1>')
  .replace(/<fig-input-text\b([^>]*)><\/fig-input-text>/g, (_, attrs) => /\bmultiline\b/.test(attrs)
    ? `<textarea class="text-input multiline-input" rows="5"${attrs.replace(/\bmultiline\b|\bvalue="[^"]*"/g, '')}></textarea>`
    : `<input class="text-input" type="text"${attrs}>`)
  .replace(/fig-content/g, '.plugin-content').replace(/fig-footer/g, '.plugin-footer').replace(/fig-field/g, '.field')
  .replace('</style>', `
    .field { display: block; }
    .field > label { display: block; margin-bottom: 6px; }
    .primary { display: block; height: 34px; border: 0; border-radius: 6px; background: var(--accent); color: var(--on-accent); font-weight: 550; }
    .text-input, .number-input { width: 100%; height: 32px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); padding: 6px 9px; outline-color: var(--accent); }
    .multiline-input { height: 116px; min-height: 80px; resize: vertical; }
  </style>`)
  .replace('id="label" value=', 'id="label" maxlength="180" value=')
  .replace('id="diagram-text" value=', 'id="diagram-text" maxlength="120" value=');
if (/<\/?fig-/.test(html)) throw new Error('Unconverted PropsKit control in native package');
if (/<\./.test(html)) throw new Error('Malformed native control tag');
const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const localPath = path.join(root, 'manifest.local.json');
const local = fs.existsSync(localPath) ? JSON.parse(fs.readFileSync(localPath, 'utf8')) : {};
if (local.id !== undefined && (typeof local.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(local.id))) throw new Error('Invalid local plugin ID');
const nativeManifest = {
  name: sourceManifest.name,
  id: local.id || sourceManifest.id,
  api: '1.0.0',
  main: 'code.js',
  ui: 'ui.html',
  editorType: ['figma'],
  documentAccess: 'dynamic-page',
  networkAccess: { allowedDomains: ['none'] },
  relaunchButtons: sourceManifest.relaunchButtons
};
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(nativeManifest, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'ui.html'), html);
fs.copyFileSync(path.join(root, 'code.js'), path.join(output, 'code.js'));
process.stdout.write('Built Figma plugin: native-plugin/manifest.json\n');
if (!local.id) process.stdout.write('Before importing, configure your own Figma plugin ID (see README).\n');
