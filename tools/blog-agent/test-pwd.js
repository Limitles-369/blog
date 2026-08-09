const { execFile } = require('node:child_process');
execFile('node', ['-e', 'console.log(process.cwd(), process.env.PWD)'], {
  cwd: '/tmp',
  env: { ...process.env }
}, (err, stdout, stderr) => {
  console.log(stdout.trim());
});
