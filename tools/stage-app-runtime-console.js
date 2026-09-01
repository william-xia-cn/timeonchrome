const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'app-runtime-management', 'console');
const destination = path.join(root, 'pages', 'app-runtime');
const files = ['index.html', 'app-runtime.css', 'app-runtime-network.js', 'app-runtime.js'];
fs.mkdirSync(destination, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(source, file), path.join(destination, file));
console.log(`Staged App Runtime console: ${files.length} files`);
