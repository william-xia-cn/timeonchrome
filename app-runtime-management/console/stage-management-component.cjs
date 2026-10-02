// Canonical Runtime component builder; consumers may depend on this module, never the reverse.
const fs = require('node:fs');
const path = require('node:path');
const scripts = ['computer-usage-view.js', 'app-runtime-time.js', 'app-runtime-network.js', 'app-runtime-clipboard.js', 'app-runtime-policy.js', 'app-runtime-knowledge.js', 'app-runtime-devices.js', 'app-runtime.js'];
const styles = ['app-runtime.css', 'app-runtime-v2.css', 'app-runtime-knowledge.css'];
function stageRuntimeManagementComponent(source, destination) {
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error('Symlinks are not publishable');
  source = fs.realpathSync(source);
  destination = path.resolve(destination);
  const relative = path.relative(source, destination);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Output must be outside source');
  if (fs.existsSync(destination)) throw new Error('Output already exists; refusing overwrite');
  const files = ['index.html', ...scripts, ...styles];
  for (const file of files) {
    const target = path.join(source, file);
    if (!fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink()) throw new Error('Invalid component asset: ' + file);
  }
  const html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!body) throw new Error('Component body is missing');
  const template = body[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
  if (/<script\b|\bon\w+\s*=/i.test(template)) throw new Error('Executable template is not publishable');
  fs.mkdirSync(destination);
  for (const file of [...scripts, ...styles]) fs.copyFileSync(path.join(source, file), path.join(destination, file));
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({schemaVersion: 1, scripts, styles, template}) + '\n');
  return destination;
}
module.exports = {stageRuntimeManagementComponent, scripts, styles};
