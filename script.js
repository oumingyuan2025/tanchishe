const canvas = document.querySelector("#game-board");
const gl = canvas.getContext("webgl", {
  antialias: true,
  alpha: true,
});

const scoreEl = document.querySelector("#score");
const bestScoreEl = document.querySelector("#best-score");
const speedEl = document.querySelector("#speed");
const heightLevelEl = document.querySelector("#height-level");
const targetLevelEl = document.querySelector("#target-level");
const statusEl = document.querySelector("#game-status");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayMessage = document.querySelector("#overlay-message");
const startButton = document.querySelector("#start-button");
const pauseButton = document.querySelector("#pause-button");
const restartButton = document.querySelector("#restart-button");

const gridSize = 12;
const levelCount = 8;
const baseTickMs = 128;
const minTickMs = 64;
const bestScoreKey = "neon-snake-best-score";
const boardOffset = gridSize / 2;
const levelHeight = 1.05;
const camera = {
  position: [13.5, 10.5, 17],
  target: [0, 3.2, 0],
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
let cubeMesh;
let sphereMesh;
let program;
let uniforms;
let attributes;
let bestScore = Number(localStorage.getItem(bestScoreKey)) || 0;

const directions = {
  ArrowUp: { x: 0, y: -1, z: 0 },
  KeyW: { x: 0, y: -1, z: 0 },
  ArrowDown: { x: 0, y: 1, z: 0 },
  KeyS: { x: 0, y: 1, z: 0 },
  ArrowLeft: { x: -1, y: 0, z: 0 },
  KeyA: { x: -1, y: 0, z: 0 },
  ArrowRight: { x: 1, y: 0, z: 0 },
  KeyD: { x: 1, y: 0, z: 0 },
  KeyQ: { x: 0, y: 0, z: 1 },
  KeyE: { x: 0, y: 0, z: -1 },
};

if (!gl) {
  showOverlay("浏览器不支持 WebGL", "请使用新版 Chrome、Edge 或 Firefox 打开真实 3D 版本。");
  setStatus("WebGL 不可用");
} else {
  initWebGL();
  resetGame();
}

function initWebGL() {
  const vertexShader = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;

    uniform mat4 uModel;
    uniform mat4 uViewProjection;

    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main() {
      vec4 worldPosition = uModel * vec4(aPosition, 1.0);
      vWorldPosition = worldPosition.xyz;
      vNormal = normalize(mat3(uModel) * aNormal);
      gl_Position = uViewProjection * worldPosition;
    }
  `;

  const fragmentShader = `
    precision mediump float;

    uniform vec3 uColor;
    uniform vec3 uLightDirection;
    uniform vec3 uCameraPosition;
    uniform float uEmissive;
    uniform float uAlpha;

    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 light = normalize(uLightDirection);
      vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
      vec3 halfVector = normalize(light + viewDirection);
      float diffuse = max(dot(normal, light), 0.0);
      float specular = pow(max(dot(normal, halfVector), 0.0), 28.0);
      vec3 color = uColor * (0.30 + diffuse * 0.78) + specular * vec3(0.72) + uColor * uEmissive;

      gl_FragColor = vec4(color, uAlpha);
    }
  `;

  program = createProgram(vertexShader, fragmentShader);
  attributes = {
    position: gl.getAttribLocation(program, "aPosition"),
    normal: gl.getAttribLocation(program, "aNormal"),
  };
  uniforms = {
    model: gl.getUniformLocation(program, "uModel"),
    viewProjection: gl.getUniformLocation(program, "uViewProjection"),
    color: gl.getUniformLocation(program, "uColor"),
    lightDirection: gl.getUniformLocation(program, "uLightDirection"),
    cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
    emissive: gl.getUniformLocation(program, "uEmissive"),
    alpha: gl.getUniformLocation(program, "uAlpha"),
  };

  cubeMesh = createMesh(createCubeGeometry());
  sphereMesh = createMesh(createSphereGeometry(18, 14));

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0.015, 0.035, 0.075, 1);
}

function resetGame() {
  snake = [
    { x: 5, y: 6, z: 2 },
    { x: 4, y: 6, z: 2 },
    { x: 3, y: 6, z: 2 },
  ];
  direction = { x: 1, y: 0, z: 0 };
  nextDirection = direction;
  score = 0;
  tickMs = baseTickMs;
  lastFrameTime = 0;
  gameState = "ready";
  particles = [];
  food = createFood();
  updateStats();
  setStatus("等待启动");
  showOverlay("准备开始", "按空格键或点击“开始游戏”进入可上下穿梭的 3D 立方赛道。");
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
  setStatus("三维空间赛道运行中");
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
  showOverlay("已暂停", "按空格键或点击“开始游戏”继续三维空间挑战。");
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
    z: head.z + direction.z,
  };
  const willEat = newHead.x === food.x && newHead.y === food.y && newHead.z === food.z;

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
  } else {
    snake.pop();
  }
  updateStats();
}

function draw() {
  if (!gl) {
    return;
  }

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);

  const aspect = canvas.width / canvas.height;
  const projection = mat4Perspective((42 * Math.PI) / 180, aspect, 0.1, 100);
  const time = performance.now() / 1000;
  const orbitRadius = 21;
  const cameraPosition = [
    Math.sin(time * 0.16) * orbitRadius,
    10.5 + Math.sin(time * 0.09) * 1.2,
    Math.cos(time * 0.16) * orbitRadius,
  ];
  const view = mat4LookAt(cameraPosition, camera.target, [0, 1, 0]);
  const viewProjection = mat4Multiply(projection, view);

  gl.uniformMatrix4fv(uniforms.viewProjection, false, viewProjection);
  gl.uniform3fv(uniforms.lightDirection, normalize3([0.35, 0.9, 0.48]));
  gl.uniform3fv(uniforms.cameraPosition, cameraPosition);

  drawSkyline();
  drawBoard();
  drawAltitudeGuides();
  drawFood();
  drawSnake();
  drawParticles();
}

function drawSkyline() {
  for (let i = 0; i < 18; i += 1) {
    const x = -18 + i * 2.1;
    const z = -15.5;
    const height = 0.9 + (i % 5) * 0.34;
    drawMesh(cubeMesh, [x, height / 2 - 0.1, z], [1.2, height, 0.34], [0.03, 0.13, 0.27], 0.28, 0.7);
  }
}

function drawBoard() {
  drawMesh(cubeMesh, [0, -0.22, 0], [gridSize + 1.1, 0.12, gridSize + 1.1], [0.02, 0.08, 0.17], 0.05, 0.38);

  for (let z = 0; z < levelCount; z += 1) {
    const levelY = z * levelHeight;
    const levelAlpha = z === snake[0].z || z === food.z ? 0.16 : 0.045;

    drawMesh(cubeMesh, [0, levelY, 0], [gridSize + 0.2, 0.018, gridSize + 0.2], [0.03, 0.2, 0.38], 0.08, levelAlpha);

    for (let i = 0; i < gridSize; i += 2) {
      const offset = i - boardOffset + 0.5;
      drawMesh(cubeMesh, [offset, levelY + 0.02, 0], [0.014, 0.014, gridSize], [0.08, 0.9, 1.0], 0.32, 0.14);
      drawMesh(cubeMesh, [0, levelY + 0.021, offset], [gridSize, 0.014, 0.014], [0.08, 0.9, 1.0], 0.32, 0.14);
    }
  }

  for (let x = 0; x <= gridSize; x += 3) {
    for (let y = 0; y <= gridSize; y += 3) {
      const world = cellToWorld(x - 0.5, y - 0.5, (levelCount - 1) / 2);
      const isCorner = (x === 0 || x === gridSize) && (y === 0 || y === gridSize);
      drawMesh(
        cubeMesh,
        [world[0], (levelCount - 1) * levelHeight / 2, world[2]],
        [isCorner ? 0.14 : 0.045, levelCount * levelHeight, isCorner ? 0.14 : 0.045],
        [0.08, 0.9, 1.0],
        isCorner ? 0.45 : 0.28,
        isCorner ? 0.72 : 0.25,
      );
    }
  }

  const rimColor = [0.08, 0.9, 1.0];
  drawMesh(cubeMesh, [0, 0.24, -boardOffset - 0.38], [gridSize + 0.8, 0.22, 0.18], rimColor, 0.35, 0.92);
  drawMesh(cubeMesh, [0, 0.24, boardOffset + 0.38], [gridSize + 0.8, 0.22, 0.18], rimColor, 0.35, 0.92);
  drawMesh(cubeMesh, [-boardOffset - 0.38, 0.24, 0], [0.18, 0.22, gridSize + 0.8], rimColor, 0.35, 0.92);
  drawMesh(cubeMesh, [boardOffset + 0.38, 0.24, 0], [0.18, 0.22, gridSize + 0.8], rimColor, 0.35, 0.92);

  const topY = (levelCount - 1) * levelHeight + 0.08;
  drawMesh(cubeMesh, [0, topY, -boardOffset - 0.38], [gridSize + 0.8, 0.14, 0.15], rimColor, 0.42, 0.72);
  drawMesh(cubeMesh, [0, topY, boardOffset + 0.38], [gridSize + 0.8, 0.14, 0.15], rimColor, 0.42, 0.72);
  drawMesh(cubeMesh, [-boardOffset - 0.38, topY, 0], [0.15, 0.14, gridSize + 0.8], rimColor, 0.42, 0.72);
  drawMesh(cubeMesh, [boardOffset + 0.38, topY, 0], [0.15, 0.14, gridSize + 0.8], rimColor, 0.42, 0.72);
}

function drawAltitudeGuides() {
  const head = snake[0];
  const headWorld = cellToWorld(head.x, head.y, head.z);
  const foodWorld = cellToWorld(food.x, food.y, food.z);

  drawVerticalBeacon(headWorld, head.z, [0.35, 1.0, 0.42], 0.5);
  drawVerticalBeacon(foodWorld, food.z, [1.0, 0.24, 0.83], 0.64);
  drawLevelHalo(head.z, [0.35, 1.0, 0.42], 0.14);
  drawLevelHalo(food.z, [1.0, 0.24, 0.83], 0.13);
}

function drawVerticalBeacon(world, level, color, emissive) {
  const height = level * levelHeight + 0.92;
  drawMesh(cubeMesh, [world[0], height / 2, world[2]], [0.08, height, 0.08], color, emissive, 0.52);
  drawMesh(cubeMesh, [world[0], level * levelHeight + 0.03, world[2]], [0.86, 0.04, 0.86], color, emissive, 0.22);
}

function drawLevelHalo(level, color, alpha) {
  const y = level * levelHeight + 0.05;
  drawMesh(cubeMesh, [0, y, -boardOffset - 0.18], [gridSize + 0.35, 0.07, 0.08], color, 0.36, alpha);
  drawMesh(cubeMesh, [0, y, boardOffset + 0.18], [gridSize + 0.35, 0.07, 0.08], color, 0.36, alpha);
  drawMesh(cubeMesh, [-boardOffset - 0.18, y, 0], [0.08, 0.07, gridSize + 0.35], color, 0.36, alpha);
  drawMesh(cubeMesh, [boardOffset + 0.18, y, 0], [0.08, 0.07, gridSize + 0.35], color, 0.36, alpha);
}

function drawSnake() {
  snake.forEach((segment, index) => {
    const world = cellToWorld(segment.x, segment.y, segment.z);
    const isHead = index === 0;
    const bodyPulse = Math.sin(performance.now() / 170 + index * 0.42) * 0.03;
    const size = isHead ? 0.92 : 0.82 + bodyPulse;

    drawMesh(
      cubeMesh,
      [world[0], world[1] + 0.44, world[2]],
      [size, isHead ? 0.96 : 0.82, size],
      isHead ? [0.83, 1.0, 0.22] : [0.05, 0.82, 1.0],
      isHead ? 0.45 : 0.23,
      1,
    );

    if (isHead) {
      drawSnakeEyes(world);
    }
  });
}

function drawSnakeEyes(headWorld) {
  const forward = normalize3([direction.x, direction.z, direction.y]);
  const side = normalize3([-forward[2], 0, forward[0]]);
  const eyeBase = [
    headWorld[0] + forward[0] * 0.43,
    headWorld[1] + 0.68 + forward[1] * 0.36,
    headWorld[2] + forward[2] * 0.43,
  ];

  [-1, 1].forEach((sign) => {
    drawMesh(
      sphereMesh,
      [
        eyeBase[0] + side[0] * 0.18 * sign,
        eyeBase[1],
        eyeBase[2] + side[2] * 0.18 * sign,
      ],
      [0.08, 0.08, 0.08],
      [0.01, 0.02, 0.04],
      0.08,
      1,
    );
  });
}

function drawFood() {
  const pulse = Math.sin(performance.now() / 150);
  const world = cellToWorld(food.x, food.y, food.z);

  drawMesh(cubeMesh, [world[0], world[1] + 0.025, world[2]], [0.78, 0.035, 0.78], [1, 0.24, 0.83], 0.36, 0.34);
  drawMesh(
    sphereMesh,
    [world[0], world[1] + 0.86 + pulse * 0.16, world[2]],
    [0.38 + pulse * 0.04, 0.38 + pulse * 0.04, 0.38 + pulse * 0.04],
    [1.0, 0.55, 0.12],
    0.72,
    1,
  );
}

function burstParticles(origin) {
  for (let i = 0; i < 34; i += 1) {
    const angle = (Math.PI * 2 * i) / 34;
    const speed = 0.055 + Math.random() * 0.05;
    particles.push({
      x: origin.x + 0.5,
      y: origin.y + 0.5,
      z: origin.z,
      height: 0.86,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      vh: 0.09 + Math.random() * 0.08,
      life: 34 + Math.random() * 18,
      color: i % 2 === 0 ? [1.0, 0.78, 0.18] : [1.0, 0.24, 0.83],
    });
  }
}

function updateParticles() {
  particles = particles
    .map((particle) => ({
      ...particle,
      x: particle.x + particle.vx,
      y: particle.y + particle.vy,
      height: particle.height + particle.vh,
      vx: particle.vx * 0.94,
      vy: particle.vy * 0.94,
      vh: particle.vh * 0.91 - 0.006,
      life: particle.life - 1,
    }))
    .filter((particle) => particle.life > 0);
}

function drawParticles() {
  particles.forEach((particle) => {
    const world = cellToWorld(particle.x - 0.5, particle.y - 0.5, particle.z);
    const alpha = Math.max(0, particle.life / 52);
    drawMesh(
      sphereMesh,
      [world[0], world[1] + particle.height, world[2]],
      [0.09, 0.09, 0.09],
      particle.color,
      0.86,
      alpha,
    );
  });
}

function drawMesh(mesh, position, scale, color, emissive = 0, alpha = 1) {
  const model = mat4FromTranslationScale(position, scale);

  gl.uniformMatrix4fv(uniforms.model, false, model);
  gl.uniform3fv(uniforms.color, color);
  gl.uniform1f(uniforms.emissive, emissive);
  gl.uniform1f(uniforms.alpha, alpha);

  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
  gl.vertexAttribPointer(attributes.position, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(attributes.position);

  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
  gl.vertexAttribPointer(attributes.normal, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(attributes.normal);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
  gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
}

function createFood() {
  const openCells = [];

  for (let z = 0; z < levelCount; z += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        if (!snake.some((segment) => segment.x === x && segment.y === y && segment.z === z)) {
          openCells.push({ x, y, z });
        }
      }
    }
  }

  return openCells[Math.floor(Math.random() * openCells.length)];
}

function isWallCollision(position) {
  return (
    position.x < 0 ||
    position.x >= gridSize ||
    position.y < 0 ||
    position.y >= gridSize ||
    position.z < 0 ||
    position.z >= levelCount
  );
}

function isSnakeCollision(position, willEat) {
  const bodyToCheck = willEat ? snake : snake.slice(0, -1);
  return bodyToCheck.some((segment) => segment.x === position.x && segment.y === position.y && segment.z === position.z);
}

function setDirection(newDirection) {
  const isOpposite =
    newDirection.x + direction.x === 0 &&
    newDirection.y + direction.y === 0 &&
    newDirection.z + direction.z === 0;
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
  setStatus("三维空间赛道熄火");
  draw();
  showOverlay("游戏结束", `本局得分 ${score}，按 R 或点击“重新开始”再来一局。`);
}

function updateStats() {
  scoreEl.textContent = score;
  bestScoreEl.textContent = bestScore;
  speedEl.textContent = `${(baseTickMs / tickMs).toFixed(1)}x`;
  heightLevelEl.textContent = snake ? `${snake[0].z + 1}/${levelCount}` : `--/${levelCount}`;
  targetLevelEl.textContent = food ? `${food.z + 1}/${levelCount}` : "--";
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

function cellToWorld(x, y, z = 0) {
  return [x - boardOffset + 0.5, z * levelHeight, y - boardOffset + 0.5];
}

function createProgram(vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  const shaderProgram = gl.createProgram();

  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    throw new Error(`WebGL program link failed: ${gl.getProgramInfoLog(shaderProgram)}`);
  }

  return shaderProgram;
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`WebGL shader compile failed: ${gl.getShaderInfoLog(shader)}`);
  }

  return shader;
}

function createMesh(geometry) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.positions), gl.STATIC_DRAW);

  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.normals), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geometry.indices), gl.STATIC_DRAW);

  return {
    positionBuffer,
    normalBuffer,
    indexBuffer,
    indexCount: geometry.indices.length,
  };
}

function createCubeGeometry() {
  const positions = [];
  const normals = [];
  const indices = [];
  const faces = [
    { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
    { n: [1, 0, 0], v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
    { n: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, 1, 0], v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
    { n: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  ];

  faces.forEach((face) => {
    const offset = positions.length / 3;
    face.v.forEach((vertex) => {
      positions.push(...vertex);
      normals.push(...face.n);
    });
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  });

  return { positions, normals, indices };
}

function createSphereGeometry(columns, rows) {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const theta = v * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const phi = u * Math.PI * 2;
      const x = Math.cos(phi) * sinTheta;
      const y = cosTheta;
      const z = Math.sin(phi) * sinTheta;
      positions.push(x * 0.5, y * 0.5, z * 0.5);
      normals.push(x, y, z);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const first = row * (columns + 1) + column;
      const second = first + columns + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }

  return { positions, normals, indices };
}

function mat4FromTranslationScale(translation, scale) {
  return new Float32Array([
    scale[0], 0, 0, 0,
    0, scale[1], 0, 0,
    0, 0, scale[2], 0,
    translation[0], translation[1], translation[2], 1,
  ]);
}

function mat4Perspective(fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2);
  const rangeInv = 1 / (near - far);

  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInv, -1,
    0, 0, near * far * rangeInv * 2, 0,
  ]);
}

function mat4LookAt(eye, target, up) {
  const zAxis = normalize3([
    eye[0] - target[0],
    eye[1] - target[1],
    eye[2] - target[2],
  ]);
  const xAxis = normalize3(cross3(up, zAxis));
  const yAxis = cross3(zAxis, xAxis);

  return new Float32Array([
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -dot3(xAxis, eye), -dot3(yAxis, eye), -dot3(zAxis, eye), 1,
  ]);
}

function mat4Multiply(a, b) {
  const output = new Float32Array(16);

  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3];
    }
  }

  return output;
}

function normalize3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
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
