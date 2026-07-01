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
const tileSize = canvas.width / gridSize;
const baseTickMs = 128;
const minTickMs = 64;
const bestScoreKey = "neon-snake-best-score";

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
  showOverlay("准备开始", "按空格键或点击“开始游戏”进入霓虹赛道。");
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
  setStatus("能量赛道运行中");
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
  showOverlay("已暂停", "按空格键或点击“开始游戏”继续挑战。");
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
    updateParticles();
    draw();
    lastFrameTime = timestamp;
  }

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

  ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridSize; i += 1) {
    const position = i * tileSize;
    ctx.beginPath();
    ctx.moveTo(position, 0);
    ctx.lineTo(position, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, position);
    ctx.lineTo(canvas.width, position);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(49, 232, 255, 0.12)";
  ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, canvas.width - 5, canvas.height - 5);
}

function drawSnake() {
  snake.forEach((segment, index) => {
    const inset = index === 0 ? 2 : 3;
    const x = segment.x * tileSize + inset;
    const y = segment.y * tileSize + inset;
    const size = tileSize - inset * 2;
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);

    gradient.addColorStop(0, index === 0 ? "#f4ff78" : "#31e8ff");
    gradient.addColorStop(1, index === 0 ? "#65ff9f" : "#7c5cff");

    ctx.shadowColor = index === 0 ? "rgba(101, 255, 159, 0.9)" : "rgba(49, 232, 255, 0.5)";
    ctx.shadowBlur = index === 0 ? 18 : 10;
    ctx.fillStyle = gradient;
    roundRect(x, y, size, size, 8);
    ctx.fill();

    if (index === 0) {
      drawSnakeEyes(segment);
    }
  });
  ctx.shadowBlur = 0;
}

function drawFood() {
  const centerX = food.x * tileSize + tileSize / 2;
  const centerY = food.y * tileSize + tileSize / 2;
  const pulse = Math.sin(performance.now() / 150) * 0.08;
  const radius = tileSize * (0.36 + pulse);
  const gradient = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, radius);

  gradient.addColorStop(0, "#fff7bd");
  gradient.addColorStop(0.45, "#ffcf5a");
  gradient.addColorStop(1, "#ff5bd1");

  ctx.shadowColor = "rgba(255, 91, 209, 0.9)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.58)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawSnakeEyes(head) {
  const centerX = head.x * tileSize + tileSize / 2;
  const centerY = head.y * tileSize + tileSize / 2;
  const eyeOffsetX = direction.y !== 0 ? 6 : 0;
  const eyeOffsetY = direction.x !== 0 ? 6 : 0;
  const forwardX = direction.x * 5;
  const forwardY = direction.y * 5;

  ctx.fillStyle = "#06111f";
  ctx.shadowBlur = 0;
  [
    { x: centerX + eyeOffsetX + forwardX, y: centerY + eyeOffsetY + forwardY },
    { x: centerX - eyeOffsetX + forwardX, y: centerY - eyeOffsetY + forwardY },
  ].forEach((eye) => {
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function burstParticles(origin) {
  const centerX = origin.x * tileSize + tileSize / 2;
  const centerY = origin.y * tileSize + tileSize / 2;

  for (let i = 0; i < 24; i += 1) {
    const angle = (Math.PI * 2 * i) / 24;
    const speed = 2.2 + Math.random() * 2.8;
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 28 + Math.random() * 16,
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
      vx: particle.vx * 0.94,
      vy: particle.vy * 0.94,
      life: particle.life - 1,
    }))
    .filter((particle) => particle.life > 0);
}

function drawParticles() {
  particles.forEach((particle) => {
    const alpha = Math.max(0, particle.life / 42);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
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
