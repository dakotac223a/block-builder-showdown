const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const CANNON = require('cannon-es');

app.use(express.static('public'));

const players = {};
let currentMode = null;
let currentTheme = null;
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

const groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

const traditionalThemes = ["Tallest Tower", "Bridge", "Castle Wall", "Pyramid", "Staircase"];
const artistThemes = ["Tree", "House", "Animal", "Vehicle", "Pixel Art Face"];

const badWords = ['fuck', 'shit', 'nigger', 'asshole', 'bitch'];
function filterUsername(username) {
  const lower = username.toLowerCase();
  return !badWords.some(word => lower.includes(word));
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('startGame', ({ mode, username }) => {
    if (!filterUsername(username)) {
      socket.emit('init', { players, mode: currentMode, theme: currentTheme, error: 'Inappropriate username!' });
      return;
    }
    players[socket.id] = { blocks: [], bodies: [], username };
    
    if (!currentMode) {
      currentMode = mode;
      currentTheme = mode === 'traditional' 
        ? traditionalThemes[Math.floor(Math.random() * traditionalThemes.length)]
        : artistThemes[Math.floor(Math.random() * artistThemes.length)];
      console.log(`Game mode: ${mode}, Theme: ${currentTheme}`);
    }
    io.emit('init', { players, mode: currentMode, theme: currentTheme });
  });

  socket.on('addBlock', (blockData) => {
    if (!players[socket.id]) return;
    players[socket.id].blocks.push(blockData);
    io.emit('addBlock', { id: socket.id, block: blockData });

    if (currentMode === 'traditional') {
      const blockBody = new CANNON.Body({
        mass: 1,
        position: new CANNON.Vec3(blockData.x, blockData.y, blockData.z),
      });
      blockBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
      world.addBody(blockBody);
      players[socket.id].bodies.push(blockBody);
    }
  });

  socket.on('voteWinner', (winnerId) => {
    if (players[winnerId]) {
      io.emit('showWinner', winnerId);
    }
  });

  socket.on('disconnect', () => {
    if (players[socket.id]) {
      players[socket.id].bodies.forEach(body => world.removeBody(body));
      delete players[socket.id];
      io.emit('playerLeft', socket.id);
      console.log('Player disconnected:', socket.id);
    }
  });
});

setInterval(() => {
  if (currentMode === 'traditional') {
    world.step(1 / 60);
    const blockStates = {};
    for (const id in players) {
      blockStates[id] = players[id].bodies.map(body => ({
        position: { x: body.position.x, y: body.position.y, z: body.position.z },
        quaternion: { x: body.quaternion.x, y: body.quaternion.y, z: body.quaternion.z, w: body.quaternion.w }
      }));
    }
    io.emit('updatePhysics', blockStates);
  }
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));