const net = require('net');

const portArg = process.argv[2];
const port = Number(portArg || 5180);

if (!Number.isInteger(port) || port <= 0) {
  console.error(`[dev] Invalid port: ${portArg}`);
  process.exit(1);
}

const socket = new net.Socket();
socket.setTimeout(750);

socket.once('connect', () => {
  socket.destroy();
  console.error(`[dev] Port ${port} is already in use. Stop the existing dev server or Electron instance first.`);
  process.exit(1);
});

socket.once('timeout', () => {
  socket.destroy();
  process.exit(0);
});

socket.once('error', () => {
  socket.destroy();
  process.exit(0);
});

socket.connect(port, '127.0.0.1');
