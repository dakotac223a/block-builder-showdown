import * as THREE from 'three';
import { io } from 'socket.io-client';

const socket = io();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const groundGeo = new THREE.PlaneGeometry(20, 20);
const groundMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

let mode = null;
let gameActive = false;
let timeLeft = 120;
let selectedColor = 0x888888;
let username = null;
let currentTheme = "None";
const players = {};
const blockGeo = new THREE.BoxGeometry(1, 1, 1);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

camera.position.set(0, 10, 10);
camera.lookAt(0, 0, 0);

const modeSelect = document.getElementById('mode-select');
const usernamePrompt = document.getElementById('username-prompt');
const usernameInput = document.getElementById('username-input');
const gameDiv = document.getElementById('game');
const timerElement = document.getElementById('timer');
const themeElement = document.getElementById('theme');
const showcaseDiv = document.getElementById('showcase');
const winnerText = document.getElementById('winner-text');
document.getElementById('traditional').addEventListener('click', () => showUsernamePrompt('traditional'));
document.getElementById('artist').addEventListener('click', () => showUsernamePrompt('artist'));
document.getElementById('start-game').addEventListener('click', startGame);
document.getElementById('back-to-menu').addEventListener('click', resetToMenu);

function showUsernamePrompt(selectedMode) {
  mode = selectedMode;
  modeSelect.style.display = 'none';
  usernamePrompt.style.display = 'block';
}

function startGame() {
  username = usernameInput.value.trim();
  if (!username || username.length < 1) {
    alert('Please enter a username!');
    return;
  }
  usernamePrompt.style.display = 'none';
  gameDiv.style.display = 'block';
  gameActive = true;
  
  if (mode === 'artist') {
    setupPalette();
  }
  socket.emit('startGame', { mode, username });
}

function resetToMenu() {
  showcaseDiv.style.display = 'none';
  modeSelect.style.display = 'block';
  gameDiv.style.display = 'none';
  timeLeft = 120;
  gameActive = false;
  mode = null;
  username = null;
  for (const id in players) {
    players[id].blocks.forEach(block => scene.remove(block));
    delete players[id];
  }
  camera.position.set(0, 10, 10);
  camera.lookAt(0, 0, 0);
}

const paletteDiv = document.getElementById('palette');
function setupPalette() {
  const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff, 0x000000];
  colors.forEach(color => {
    const div = document.createElement('div');
    div.className = 'palette-color';
    div.style.backgroundColor = `#${color.toString(16).padStart(6, '0')}`;
    div.addEventListener('click', () => selectedColor = color);
    paletteDiv.appendChild(div);
  });
  paletteDiv.style.display = 'flex';
}

window.addEventListener('click', (event) => {
  if (!gameActive || mode === null) return;
  
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects([ground, ...Object.values(players).flatMap(p => p.blocks)]);
  
  if (intersects.length > 0) {
    const point = intersects[0].point;
    const blockData = { 
      x: Math.round(point.x), 
      y: point.y + 0.5, 
      z: Math.round(point.z), 
      color: mode === 'traditional' ? 0x888888 : selectedColor 
    };
    socket.emit('addBlock', blockData);
  }
});

function addBlock(playerId, blockData) {
  if (!players[playerId]) players[playerId] = { blocks: [], username: '' };
  
  const blockMat = new THREE.MeshBasicMaterial({ color: blockData.color });
  const block = new THREE.Mesh(blockGeo, blockMat);
  block.position.set(blockData.x, blockData.y, blockData.z);
  scene.add(block);
  players[playerId].blocks.push(block);
}

socket.on('init', (serverData) => {
  if (serverData.error) {
    alert(serverData.error);
    resetToMenu();
    return;
  }
  for (const id in serverData.players) {
    players[id] = { blocks: [], username: serverData.players[id].username };
    serverData.players[id].blocks.forEach(blockData => addBlock(id, blockData));
  }
  currentTheme = serverData.theme;
  themeElement.textContent = `Theme: ${currentTheme}`;
});

socket.on('addBlock', (data) => {
  addBlock(data.id, data.block);
});

socket.on('updatePhysics', (blockStates) => {
  if (mode === 'traditional') {
    for (const id in blockStates) {
      if (players[id]) {
        blockStates[id].forEach((state, i) => {
          const block = players[id].blocks[i];
          if (block) {
            block.position.set(state.position.x, state.position.y, state.position.z);
            block.quaternion.set(state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w);
          }
        });
      }
    }
  }
});

socket.on('playerLeft', (id) => {
  players[id].blocks.forEach(block => scene.remove(block));
  delete players[id];
});

socket.on('showWinner', (winnerId) => {
  gameActive = false;
  gameDiv.style.display = 'none';
  showcaseDiv.style.display = 'block';
  winnerText.textContent = `Winner: ${players[winnerId].username}`;
  
  const winnerBlocks = players[winnerId].blocks;
  if (winnerBlocks.length > 0) {
    const center = new THREE.Vector3();
    winnerBlocks.forEach(block => center.add(block.position));
    center.divideScalar(winnerBlocks.length);
    camera.position.set(center.x, center.y + 10, center.z + 10);
    camera.lookAt(center);
  }
});

function animate() {
  requestAnimationFrame(animate);
  
  if (gameActive) {
    timeLeft -= 1 / 60;
    timerElement.textContent = `Time Left: ${Math.max(0, Math.round(timeLeft))}`;
    if (timeLeft <= 0) {
      gameActive = false;
      showVoting();
    }
  }

  renderer.render(scene, camera);
}
animate();

function showVoting() {
  const winner = prompt(`Theme was "${currentTheme}". Who built the best? Enter a username or "me"`);
  const winnerId = winner === 'me' ? socket.id : Object.keys(players).find(id => players[id].username === winner);
  if (winnerId) {
    socket.emit('voteWinner', winnerId);
  } else {
    alert('Invalid username! Try again.');
    showVoting();
  }
}