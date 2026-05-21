const { spawn } = require('node:child_process');
const { join } = require('node:path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronVite = join(__dirname, '..', 'node_modules', 'electron-vite', 'dist', 'cli.js');

const child = spawn(process.execPath, [electronVite, 'dev', ...process.argv.slice(2)], {
  cwd: join(__dirname, '..'),
  env,
  stdio: 'inherit'
});

child.on('close', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
