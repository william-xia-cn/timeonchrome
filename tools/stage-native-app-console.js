const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'native-app-control', 'console');
const destination = path.join(root, 'pages', 'native-apps');
const files = ['index.html', 'native-apps.css', 'native-apps.js'];

fs.mkdirSync(destination, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(source, file), path.join(destination, file));
console.log(`Staged Native Apps console: ${files.length} files`);
