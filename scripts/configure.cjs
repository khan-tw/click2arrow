const fs = require('node:fs');
const path = require('node:path');
const id = process.argv[2];
if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) || id === 'REPLACE_WITH_YOUR_PLUGIN_ID') {
  console.error('Usage: npm run configure -- <ID assigned by Figma>');
  process.exit(1);
}
fs.writeFileSync(path.resolve(__dirname, '../manifest.local.json'), JSON.stringify({ id }, null, 2) + '\n', { mode: 0o600 });
console.log('Saved the plugin ID in ignored local configuration. Run npm run build next.');
