const canvas = document.querySelector("#game-board");
const ctx = canvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const bestScoreEl = document.querySelector("#best-score");
const speedEl = document.querySelector("#speed");
const statusEl = document.querySelector("#game-status");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayMessage = document.querySelector("#overlay-message");
const startButton = document.querySelector("#start-button");
const pauseButton = document.querySelector("#pause-button");
const restartButton = document.querySelector("#restart-button");

const gridSize = 24;
const baseTickMs = 128;
const minTickMs = 64;
const bestScoreKey = "neon-snake-best-score";
const iso = {
  originX: canvas.width / 2,
  originY: 80,
  halfW: 12,
  halfH: 7,
  cubeH: 15,
};

let snake;
let food;
let direction;
let nextDirection;
let score;
let tickMs;
let lastFrameTime;
let gameState;
let particles;
let bestScore = Number(localStorage.getItem(bestScoreKey)) || 0;

const directions = {
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 },
};

function resetGame() {
  snake = [
    { x: 11, y: 12 },
    { x: 10, y: 12 },
    { x: 9, y: 12 },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = direction;
  score = 0;
  tickMs = baseTickMs;
  lastFrameTime = 0;
  gameState = "ready";
  particles = [];
  food = createFood();
  updateStats();
  setStatus("等待启动");
  showOverlay("准备开始", "按空格键或点击“开始游戏”进入 3D 霓虹赛道。");
  draw();
}

function startGame() {
  if (gameState === "playing") {
    return;
  }

  if (gameState === "gameover") {
    resetGame();
  }

  gameState = "playing";
  setStatus("3D 赛道运行中");
  hideOverlay();
  lastFrameTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function pauseGame() {
  if (gameState !== "playing") {
    return;
  }

  gameState = "paused";
  setStatus("游戏已暂停");
  showOverlay("已暂停", "按空格键或点击“开始游戏”继续 3D 挑战。");
}

function restartGame() {
  resetGame();
  startGame();
}

function gameLoop(timestamp) {
  if (gameState !== "playing") {
    return;
  }

  if (timestamp - lastFrameTime >= tickMs) {
    update();
    lastFrameTime = timestamp;
  }

  updateParticles();
  draw();
  requestAnimationFrame(gameLoop);
}

function update() {
  direction = nextDirection;
  const head = snake[0];
  const newHead = {
    x: head.x + direction.x,
    y: head.y + direction.y,
  };
  const willEat = newHead.x === food.x && newHead.y === food.y;

  if (isWallCollision(newHead) || isSnakeCollision(newHead, willEat)) {
    endGame();
    return;
  }

  snake.unshift(newHead);

  if (willEat) {
    score += 10;
    tickMs = Math.max(minTickMs, baseTickMs - Math.floor(score / 50) * 7);
    burstParticles(food);
    food = createFood();
    updateStats();
  } else {
    snake.pop();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawParticles();
  drawFood();
  drawSnake();
}

function drawGrid() {
  const boardGradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    20,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width / 1.05,
  );
  boardGradient.addColorStop(0, "#10284a");
  boardGradient.addColorStop(0.64, "#07172a");
  boardGradient.addColorStop(1, "#040b17");

  ctx.fillStyle = boardGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawHorizon();
  drawBoardShadow();

  for (let depth = 0; depth <= (gridSize - 1) * 2; depth += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      const x = depth - y;
      if (x >= 0 && x < gridSize) {
        drawFloorTile(x, y);
      }
    }
  }

  drawBoardRim();
}

function drawSnake() {
  [...snake]
    .map((segment, index) => ({ segment, index }))
    .sort((a, b) => a.segment.x + a.segment.y - (b.segment.x + b.segment.y))
    .forEach(({ segment, index }) => {
      const isHead = index === 0;
      drawPrism(segment.x, segment.y, {
        height: isHead ? 23 : 18,
        top: isHead ? "#f4ff78" : "#31e8ff",
        left: isHead ? "#41d676" : "#168ee8",
        right: isHead ? "#20a85d" : "#5a45dd",
        stroke: isHead ? "rgba(244, 255, 120, 0.9)" : "rgba(49, 232, 255, 0.55)",
        glow: isHead ? "rgba(101, 255, 159, 0.72)" : "rgba(49, 232, 255, 0.38)",
      });

      if (isHead) {
        drawSnakeEyes(segment);
      }
    });
  ctx.shadowBlur = 0;
}

function drawFood() {
  const pulse = Math.sin(performance.now() / 150);
  const center = projectCell(food.x + 0.5, food.y + 0.5, 34 + pulse * 4);
  const shadow = projectCell(food.x + 0.5, food.y + 0.5, 1);
  const radius = 9 + pulse * 1.2;
  const gradient = ctx.createRadialGradient(center.x - 3, center.y - 4, 2, center.x, center.y, radius);

  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = "rgba(255, 91, 209, 0.45)";
  drawDiamondPath(shadow.x, shadow.y, iso.halfW * 0.82, iso.halfH * 0.82);
  ctx.fill();
  ctx.restore();

  gradient.addColorStop(0, "#fff7bd");
  gradient.addColorStop(0.45, "#ffcf5a");
  gradient.addColorStop(1, "#ff5bd1");

  ctx.shadowColor = "rgba(255, 91, 209, 0.95)";
  ctx.shadowBlur = 28;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.64)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, radius + 8, radius * 0.48, Math.PI / 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawSnakeEyes(head) {
  const center = projectCell(head.x + 0.5, head.y + 0.5, 27);
  const forwardTarget = projectCell(head.x + 0.5 + direction.x, head.y + 0.5 + direction.y, 27);
  const forward = normalizeVector({ x: forwardTarget.x - center.x, y: forwardTarget.y - center.y });
  const side = { x: -forward.y, y: forward.x };
  const eyeDistance = 4.4;
  const eyeForward = 5.8;

  ctx.fillStyle = "#06111f";
  ctx.shadowBlur = 0;
  [
    {
      x: center.x + side.x * eyeDistance + forward.x * eyeForward,
      y: center.y + side.y * eyeDistance + forward.y * eyeForward,
    },
    {
      x: center.x - side.x * eyeDistance + forward.x * eyeForward,
      y: center.y - side.y * eyeDistance + forward.y * eyeForward,
    },
  ].forEach((eye) => {
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, 2.7, 0, Math.PI * 2);
    ctx.fill();
  });
}

function burstParticles(origin) {
  for (let i = 0; i < 30; i += 1) {
    const angle = (Math.PI * 2 * i) / 30;
    const speed = 0.12 + Math.random() * 0.16;
    particles.push({
      x: origin.x + 0.5,
      y: origin.y + 0.5,
      z: 34,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      vz: 1.5 + Math.random() * 2.8,
      life: 30 + Math.random() * 18,
      color: i % 2 === 0 ? "#ffcf5a" : "#ff5bd1",
    });
  }
}

function updateParticles() {
  particles = particles
    .map((particle) => ({
      ...particle,
      x: particle.x + particle.vx,
      y: particle.y + particle.vy,
      z: particle.z + particle.vz,
      vx: particle.vx * 0.94,
      vy: particle.vy * 0.94,
      vz: particle.vz * 0.9 - 0.22,
      life: particle.life - 1,
    }))
    .filter((particle) => particle.life > 0);
}

function drawParticles() {
  particles.forEach((particle) => {
    const point = projectCell(particle.x, particle.y, particle.z);
    const alpha = Math.max(0, particle.life / 48);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawHorizon() {
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = "rgba(49, 232, 255, 0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i += 1) {
    const y = 48 + i * 34;
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(canvas.width - 30, y + i * 7);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBoardShadow() {
  const north = projectCell(0, 0, 0);
  const east = projectCell(gridSize, 0, 0);
  const south = projectCell(gridSize, gridSize, 0);
  const west = projectCell(0, gridSize, 0);
  const shadow = ctx.createLinearGradient(north.x, north.y, south.x, south.y + 80);

  shadow.addColorStop(0, "rgba(49, 232, 255, 0.2)");
  shadow.addColorStop(1, "rgba(255, 91, 209, 0.1)");
  ctx.fillStyle = shadow;
  ctx.shadowColor = "rgba(49, 232, 255, 0.34)";
  ctx.shadowBlur = 34;
  ctx.beginPath();
  ctx.moveTo(north.x, north.y + 8);
  ctx.lineTo(east.x + 8, east.y + 8);
  ctx.lineTo(south.x, south.y + 54);
  ctx.lineTo(west.x - 8, west.y + 8);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawFloorTile(x, y) {
  const center = projectCell(x + 0.5, y + 0.5, 0);
  const gradient = ctx.createLinearGradient(center.x, center.y - 10, center.x, center.y + 16);
  const isAlt = (x + y) % 2 === 0;

  gradient.addColorStop(0, isAlt ? "#13355f" : "#102d52");
  gradient.addColorStop(1, isAlt ? "#071b35" : "#06172e");
  ctx.fillStyle = gradient;
  ctx.strokeStyle = "rgba(130, 232, 255, 0.11)";
  ctx.lineWidth = 1;
  drawDiamondPath(center.x, center.y, iso.halfW - 0.7, iso.halfH - 0.4);
  ctx.fill();
  ctx.stroke();

  if (x === gridSize - 1 || y === gridSize - 1) {
    drawTileSide(center, x === gridSize - 1, y === gridSize - 1);
  }
}

function drawTileSide(center, drawRight, drawLeft) {
  if (drawRight) {
    ctx.fillStyle = "rgba(33, 102, 161, 0.52)";
    ctx.beginPath();
    ctx.moveTo(center.x + iso.halfW, center.y);
    ctx.lineTo(center.x, center.y + iso.halfH);
    ctx.lineTo(center.x, center.y + iso.halfH + 13);
    ctx.lineTo(center.x + iso.halfW, center.y + 13);
    ctx.closePath();
    ctx.fill();
  }

  if (drawLeft) {
    ctx.fillStyle = "rgba(10, 51, 104, 0.58)";
    ctx.beginPath();
    ctx.moveTo(center.x - iso.halfW, center.y);
    ctx.lineTo(center.x, center.y + iso.halfH);
    ctx.lineTo(center.x, center.y + iso.halfH + 13);
    ctx.lineTo(center.x - iso.halfW, center.y + 13);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBoardRim() {
  const north = projectCell(0, 0, 1);
  const east = projectCell(gridSize, 0, 1);
  const south = projectCell(gridSize, gridSize, 1);
  const west = projectCell(0, gridSize, 1);

  ctx.strokeStyle = "rgba(49, 232, 255, 0.42)";
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(49, 232, 255, 0.55)";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(north.x, north.y);
  ctx.lineTo(east.x, east.y);
  ctx.lineTo(south.x, south.y);
  ctx.lineTo(west.x, west.y);
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawPrism(x, y, palette) {
  const top = projectCell(x + 0.5, y + 0.5, palette.height);
  const bottomOffset = iso.cubeH;
  const left = { x: top.x - iso.halfW + 1, y: top.y };
  const right = { x: top.x + iso.halfW - 1, y: top.y };
  const front = { x: top.x, y: top.y + iso.halfH - 1 };
  const back = { x: top.x, y: top.y - iso.halfH + 1 };

  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = 20;
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  drawDiamondPath(top.x, top.y + bottomOffset + 5, iso.halfW * 0.9, iso.halfH * 0.78);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = palette.left;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(front.x, front.y);
  ctx.lineTo(front.x, front.y + bottomOffset);
  ctx.lineTo(left.x, left.y + bottomOffset);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = palette.right;
  ctx.beginPath();
  ctx.moveTo(right.x, right.y);
  ctx.lineTo(front.x, front.y);
  ctx.lineTo(front.x, front.y + bottomOffset);
  ctx.lineTo(right.x, right.y + bottomOffset);
  ctx.closePath();
  ctx.fill();

  const topGradient = ctx.createLinearGradient(back.x, back.y, front.x, front.y);
  topGradient.addColorStop(0, "#ffffff");
  topGradient.addColorStop(0.12, palette.top);
  topGradient.addColorStop(1, palette.right);
  ctx.fillStyle = topGradient;
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(back.x, back.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(front.x, front.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function projectCell(x, y, z = 0) {
  return {
    x: iso.originX + (x - y) * iso.halfW,
    y: iso.originY + (x + y) * iso.halfH - z,
  };
}

function drawDiamondPath(x, y, halfW, halfH) {
  ctx.beginPath();
  ctx.moveTo(x, y - halfH);
  ctx.lineTo(x + halfW, y);
  ctx.lineTo(x, y + halfH);
  ctx.lineTo(x - halfW, y);
  ctx.closePath();
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function createFood() {
  const openCells = [];

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      if (!snake.some((segment) => segment.x === x && segment.y === y)) {
        openCells.push({ x, y });
      }
    }
  }

  return openCells[Math.floor(Math.random() * openCells.length)];
}

function isWallCollision(position) {
  return position.x < 0 || position.x >= gridSize || position.y < 0 || position.y >= gridSize;
}

function isSnakeCollision(position, willEat) {
  const bodyToCheck = willEat ? snake : snake.slice(0, -1);
  return bodyToCheck.some((segment) => segment.x === position.x && segment.y === position.y);
}

function setDirection(newDirection) {
  const isOpposite = newDirection.x + direction.x === 0 && newDirection.y + direction.y === 0;
  if (!isOpposite) {
    nextDirection = newDirection;
  }
}

function endGame() {
  gameState = "gameover";
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(bestScoreKey, String(bestScore));
  }
  updateStats();
  setStatus("赛道熄火，准备重启");
  draw();
  showOverlay("游戏结束", `本局得分 ${score}，按 R 或点击“重新开始”再来一局。`);
}

function updateStats() {
  scoreEl.textContent = score;
  bestScoreEl.textContent = bestScore;
  speedEl.textContent = `${(baseTickMs / tickMs).toFixed(1)}x`;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function showOverlay(title, message) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  overlay.classList.remove("is-hidden");
}

function hideOverlay() {
  overlay.classList.add("is-hidden");
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

document.addEventListener("keydown", (event) => {
  if (directions[event.code]) {
    event.preventDefault();
    setDirection(directions[event.code]);
    if (gameState === "ready") {
      startGame();
    }
  }

  if (event.code === "Space") {
    event.preventDefault();
    if (gameState === "playing") {
      pauseGame();
    } else {
      startGame();
    }
  }

  if (event.code === "KeyR") {
    event.preventDefault();
    restartGame();
  }
});

startButton.addEventListener("click", startGame);
pauseButton.addEventListener("click", pauseGame);
restartButton.addEventListener("click", restartGame);

resetGame();
