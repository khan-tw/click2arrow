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
function nativeTag(tag, className, attributes) {
  const existing = /\bclass="([^"]*)"/.exec(attributes);
  const attrs = existing ? attributes.replace(existing[0], '') : attributes;
  return `<${tag} class="${className}${existing ? ' ' + existing[1] : ''}"${attrs}>`;
}
html = html
  .replace(/<fig-content\b([^>]*)>/g, (_, attrs) => nativeTag('main', 'plugin-content', attrs)).replace(/<\/fig-content>/g, '</main>')
  .replace(/<fig-footer\b([^>]*)>/g, (_, attrs) => nativeTag('footer', 'plugin-footer', attrs)).replace(/<\/fig-footer>/g, '</footer>')
  .replace(/<fig-field\b([^>]*)>/g, (_, attrs) => nativeTag('div', 'field', attrs)).replace(/<\/fig-field>/g, '</div>')
  .replace(/<fig-button\b([^>]*)>/g, '<button class="primary"$1>').replace(/<\/fig-button>/g, '</button>')
  .replace(/<fig-input-number\b([^>]*)><\/fig-input-number>/g, '<input class="number-input" type="number"$1>')
  .replace(/<fig-input-text\b([^>]*)><\/fig-input-text>/g, (_, attrs) => /\bmultiline\b/.test(attrs)
    ? `<textarea class="text-input multiline-input" rows="5"${attrs.replace(/\bmultiline\b|\bvalue="[^"]*"/g, '')}></textarea>`
    : `<input class="text-input" type="text"${attrs}>`)
  .replace(/fig-content/g, '.plugin-content').replace(/fig-footer/g, '.plugin-footer').replace(/fig-field/g, '.field')
;
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
