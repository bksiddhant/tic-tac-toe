/* Ultimate Tic-Tac-Toe
   - All-in-one vanilla JS implementation with sound, confetti, particles, minimax AI (with difficulty),
     undo, timed turns, match history, animated reveal, theme switching, dynamic board sizes.
*/

/* ===================== Utilities & Setup ===================== */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const qs = (root, sel) => (root||document).querySelector(sel);

const state = {
  boardSize: 3,
  winLength: 3,
  board: [], // 'X'|'O'|null
  current: 'X',
  moves: [], // history {idx,player}
  isGameOver: false,
  mode: 'local', // 'local'|'ai'
  difficulty: 'hard',
  startPlayer: 'X',
  swapStart: false,
  historyStats: { X:0, O:0, D:0 },
  soundOn: true,
  confettiOn: true,
  particlesOn: true,
  shakeOn: true,
  timed: false,
  secondsPerTurn: 10,
  timeoutAction: 'pass', // 'pass'|'random'
  timerRemaining: 0,
  timerInterval: null,
  audioCtx: null,
  playingSound: false
};

// DOM refs
const boardEl = $('#board');
const winSvg = $('#winSvg');
const fxCanvas = $('#fxCanvas');
const turnPlayer = $('#turnPlayer');
const resultEl = $('#result');
const scoreX = $('#scoreX'), scoreO = $('#scoreO'), scoreD = $('#scoreD') || $('#scoreD');
const scoreDraw = $('#scoreD') || null;
const undoBtn = $('#undoBtn');
const rematchBtn = $('#rematchBtn');
const replayBtn = $('#replayBtn');
const modeSelect = $('#modeSelect'), difficultySelect = $('#difficultySelect'), sizeSelect = $('#sizeSelect'), themeSelect = $('#themeSelect');
const timedToggle = $('#timedToggle'), secondsPerTurn = $('#secondsPerTurn'), timeoutAction = $('#timeoutAction'), timerWrap = $('#timerWrap'), timerValue = $('#timerValue'), timerFill = $('#timerFill');
const startPlayerSelect = $('#startPlayer'), swapStart = $('#swapStart');
const confettiToggle = $('#confettiToggle'), particlesToggle = $('#particlesToggle'), shakeToggle = $('#shakeToggle');
const soundToggle = $('#soundToggle');
const historyText = $('#historyText'), modeLabel = $('#modeLabel');

/* Canvas for effects */
const fx = fxCanvas;
const fxCtx = fx.getContext('2d');

/* Audio helpers (WebAudio synth) */
function ensureAudio() {
  if (!state.audioCtx) {
    try {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {
      state.audioCtx = null;
    }
  }
}

/* simple click sound */
function playClick(player) {
  if (!state.soundOn) return;
  ensureAudio();
  if (!state.audioCtx) return;
  const ctx = state.audioCtx;
  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = player === 'X' ? 'sawtooth' : 'sine';
  o.frequency.value = player === 'X' ? 600 : 440;
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.05, now+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now+0.18);
  o.start(now); o.stop(now+0.2);
}

/* victory fanfare (short) */
function playFanfare() {
  if (!state.soundOn) return;
  ensureAudio(); if (!state.audioCtx) return;
  const ctx = state.audioCtx;
  const now = ctx.currentTime;
  const notes = [660,880,990,1320];
  notes.forEach((n,i)=>{
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = n;
    o.connect(g); g.connect(ctx.destination);
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.06, now + i*0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i*0.12 + 0.2);
    o.start(now + i*0.12); o.stop(now + i*0.12 + 0.28);
  });
}

/* ===================== Persistence ===================== */
function loadHistory() {
  try {
    const raw = localStorage.getItem('ttt_history_v1');
    if (raw) state.historyStats = JSON.parse(raw);
  } catch(e){}
  renderHistory();
}
function saveHistory() { localStorage.setItem('ttt_history_v1', JSON.stringify(state.historyStats)); }
function renderHistory(){
  $('#scoreX').textContent = state.historyStats.X || 0;
  $('#scoreO').textContent = state.historyStats.O || 0;
  $('#scoreD').textContent = state.historyStats.D || 0;
  historyText.textContent = `X: ${state.historyStats.X||0} • O: ${state.historyStats.O||0} • Draws: ${state.historyStats.D||0}`;
  modeLabel.textContent = `Mode: ${state.mode === 'ai' ? 'Player vs AI' : 'Local'}`;
}

/* ===================== Board & UI generation ===================== */
function computeWinLength(size) {
  // For 3 -> 3, 4 -> 4, 5 -> 4 (chaos)
  if (size <= 3) return 3;
  if (size === 4) return 4;
  return 4;
}

function resizeFxCanvas() {
  const rect = $('#boardWrapper').getBoundingClientRect();
  fx.width = rect.width;
  fx.height = rect.height;
  fx.style.width = rect.width + 'px';
  fx.style.height = rect.height + 'px';
  winSvg.setAttribute('width', rect.width);
  winSvg.setAttribute('height', rect.height);
}

/* Build board grid */
function buildBoard() {
  boardEl.innerHTML = '';
  const n = state.boardSize;
  boardEl.style.gridTemplateColumns = `repeat(${n}, var(--cell-size))`;
  boardEl.style.gridTemplateRows = `repeat(${n}, var(--cell-size))`;
  state.board = Array(n*n).fill(null);
  state.moves = [];
  state.isGameOver = false;
  state.winLine = null;
  // create cells
  for (let i=0;i<n*n;i++){
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = i;
    cell.addEventListener('click', onCellClick);
    boardEl.appendChild(cell);
    // show reveal with stagger
    setTimeout(()=>cell.classList.add('show'), 60 + (i*30));
  }
  boardEl.dataset.current = state.current;
  turnPlayer.textContent = state.current;
  resizeFxCanvas();
  clearSvg();
  resultEl.classList.add('hidden');
}

/* Show symbol in cell */
function renderBoard() {
  const cells = $$('.cell');
  cells.forEach((el, idx) => {
    const v = state.board[idx];
    el.classList.remove('x','o');
    el.innerHTML = '';
    if (v) {
      el.classList.add(v === 'X' ? 'x' : 'o');
      const span = document.createElement('div');
      span.className = 'symbol';
      span.textContent = v;
      el.appendChild(span);
    }
  });
  boardEl.dataset.current = state.current;
  turnPlayer.textContent = state.current;
}

/* ===================== Game Mechanics ===================== */

function makeMove(index, player, record=true) {
  if (state.isGameOver) return false;
  if (state.board[index]) {
    if (state.shakeOn) triggerShake();
    return false;
  }
  state.board[index] = player;
  if (record) state.moves.push({index,player});
  renderBoard();
  playClick(player);
  const win = checkWinner(state.board, state.boardSize, state.winLength);
  if (win) {
    onWin(win);
    return true;
  }
  if (state.board.every(Boolean)) {
    onDraw();
    return true;
  }
  // advance turn
  state.current = player === 'X' ? 'O' : 'X';
  boardEl.dataset.current = state.current;
  turnPlayer.textContent = state.current;
  resetTimerForTurn();
  // if mode is ai and current is O (AI) and mode===ai
  if (state.mode === 'ai' && state.current === 'O') {
    // small delay for realism
    setTimeout(()=>aiMove(), 320 + Math.random()*320);
  }
  return true;
}

function onCellClick(e) {
  const idx = Number(e.currentTarget.dataset.index);
  // allow click to start audio context on user gesture
  ensureAudio();
  if (!state.playStarted){
    state.playStarted = true;
    if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume();
  }
  if (state.isGameOver) return;
  // If AI mode and it's AI's turn, block clicks
  if (state.mode === 'ai' && state.current === 'O') return;
  // try move
  const success = makeMove(idx, state.current);
  if (!success) {
    if (state.shakeOn) boardEl.classList.add('shake');
    setTimeout(()=>boardEl.classList.remove('shake'), 650);
    return;
  }
}

function checkWinner(board, n, winLen) {
  // returns {player, indices:[...] } or null
  // check all lines; efficient scanning
  const lines = [];
  // rows
  for (let r=0;r<n;r++){
    for (let c=0;c<=n-winLen;c++){
      const idxs = [];
      for (let k=0;k<winLen;k++) idxs.push(r*n + (c+k));
      lines.push(idxs);
    }
  }
  // cols
  for (let c=0;c<n;c++){
    for (let r=0;r<=n-winLen;r++){
      const idxs=[];
      for (let k=0;k<winLen;k++) idxs.push((r+k)*n + c);
      lines.push(idxs);
    }
  }
  // diag down-right
  for (let r=0;r<=n-winLen;r++){
    for (let c=0;c<=n-winLen;c++){
      const idxs=[];
      for (let k=0;k<winLen;k++) idxs.push((r+k)*n + (c+k));
      lines.push(idxs);
    }
  }
  // diag up-right
  for (let r=winLen-1;r<n;r++){
    for (let c=0;c<=n-winLen;c++){
      const idxs=[];
      for (let k=0;k<winLen;k++) idxs.push((r-k)*n + (c+k));
      lines.push(idxs);
    }
  }

  for (const idxs of lines){
    const vals = idxs.map(i=>board[i]);
    if (vals.every(v=>v && v === vals[0])) {
      return { player: vals[0], indices: idxs.slice() };
    }
  }
  return null;
}

function onWin(win) {
  state.isGameOver = true;
  state.winLine = win;
  resultEl.textContent = `Player ${win.player} wins!`;
  resultEl.classList.remove('hidden');
  // animate winning line
  drawWinLine(win.indices);
  // particle + confetti
  if (state.particlesOn) explodeWinningCells(win.indices, win.player);
  if (state.confettiOn) startConfetti();
  // fanfare
  playFanfare();
  // update history stats
  state.historyStats[win.player] = (state.historyStats[win.player]||0) + 1;
  saveHistory(); renderHistory();
}

function onDraw() {
  state.isGameOver = true;
  resultEl.textContent = `Draw — nobody wins`;
  resultEl.classList.remove('hidden');
  if (state.confettiOn) startConfetti();
  state.historyStats.D = (state.historyStats.D||0) + 1;
  saveHistory(); renderHistory();
}

/* ===================== Winning line (SVG) ===================== */

function clearSvg() {
  while (winSvg.firstChild) winSvg.removeChild(winSvg.firstChild);
}

function drawWinLine(idxs) {
  clearSvg();
  // compute bounding center of first and last cell
  const cells = $$('.cell');
  const parentRect = boardEl.getBoundingClientRect();
  const firstRect = cells[idxs[0]].getBoundingClientRect();
  const lastRect = cells[idxs[idxs.length-1]].getBoundingClientRect();

  const bx = (firstRect.left + firstRect.right)/2 - parentRect.left;
  const by = (firstRect.top + firstRect.bottom)/2 - parentRect.top;
  const ex = (lastRect.left + lastRect.right)/2 - parentRect.left;
  const ey = (lastRect.top + lastRect.bottom)/2 - parentRect.top;

  const line = document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1', bx);
  line.setAttribute('y1', by);
  line.setAttribute('x2', bx);
  line.setAttribute('y2', by);
  line.setAttribute('stroke', 'url(#grad)');
  line.setAttribute('stroke-width', Math.max(6, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell-size'))/10));
  line.setAttribute('stroke-linecap','round');
  line.style.filter = 'drop-shadow(0 8px 18px rgba(0,0,0,0.45))';
  winSvg.appendChild(line);

  const grad = document.createElementNS('http://www.w3.org/2000/svg','linearGradient');
  grad.id = 'grad';
  grad.setAttribute('x1','0'); grad.setAttribute('y1','0'); grad.setAttribute('x2','1'); grad.setAttribute('y2','0');
  const stop1 = document.createElementNS('http://www.w3.org/2000/svg','stop'); stop1.setAttribute('offset','0%');
  stop1.setAttribute('stop-color', state.winLine.player === 'X' ? getComputedStyle(document.documentElement).getPropertyValue('--x-color') || '#ff4d6d' : getComputedStyle(document.documentElement).getPropertyValue('--o-color') || '#4dd6ff');
  const stop2 = document.createElementNS('http://www.w3.org/2000/svg','stop'); stop2.setAttribute('offset','100%'); stop2.setAttribute('stop-color','#fff');
  grad.appendChild(stop1); grad.appendChild(stop2);
  const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  defs.appendChild(grad); winSvg.insertBefore(defs, winSvg.firstChild);

  // animate the line from start to end
  const totalLength = Math.hypot(ex - bx, ey - by);
  const frames = 60; let t=0;
  const duration = 420;
  const start = performance.now();
  requestAnimationFrame(function animate(now){
    const p = Math.min(1, (now - start)/duration);
    const curx = bx + (ex-bx) * p;
    const cury = by + (ey-by) * p;
    line.setAttribute('x2', curx);
    line.setAttribute('y2', cury);
    if (p < 1) requestAnimationFrame(animate);
  });
}

/* ===================== Confetti & Particles ===================== */
let confettiPieces = [];
let particlePieces = [];
let confettiActive = false;
let particleActive = false;
function rand(min,max){ return Math.random()*(max-min)+min; }

function startConfetti(){
  if (!confettiPieces.length){
    confettiPieces = [];
    const count = 80;
    for (let i=0;i<count;i++){
      confettiPieces.push({
        x: rand(0,fx.width),
        y: rand(-fx.height,0),
        w: rand(6,12),
        h: rand(10,18),
        r: rand(0,360),
        vx: rand(-0.6,0.6),
        vy: rand(2,6),
        color: `hsl(${Math.floor(rand(0,360))}deg 80% 60%)`,
        spin: rand(-0.1,0.1)
      });
    }
  }
  confettiActive = true;
  animateFx();
  setTimeout(()=>{ confettiActive = false; },3000);
}

function explodeWinningCells(idxs, player) {
  // generate particles at each cell center
  const cells = $$('.cell');
  particlePieces = [];
  const parentRect = boardEl.getBoundingClientRect();
  idxs.forEach(i=>{
    const r = cells[i].getBoundingClientRect();
    const cx = (r.left + r.right)/2 - parentRect.left;
    const cy = (r.top + r.bottom)/2 - parentRect.top;
    for (let p=0;p<24;p++){
      particlePieces.push({
        x: cx + rand(-8,8),
        y: cy + rand(-8,8),
        vx: rand(-6,6),
        vy: rand(-6,6),
        life: rand(0.6,1.6),
        t: 0,
        size: rand(3,6),
        color: player === 'X' ? (getComputedStyle(document.documentElement).getPropertyValue('--x-color')||'#ff4d6d') : (getComputedStyle(document.documentElement).getPropertyValue('--o-color')||'#4dd6ff')
      });
    }
  });
  particleActive = true;
  animateFx();
  setTimeout(()=>{ particleActive = false; }, 2200);
}

function animateFx(){
  cancelAnimationFrame(animateFx._raf);
  fxCtx.clearRect(0,0,fx.width,fx.height);
  const dt = 1/60;
  // confetti
  if (confettiActive){
    confettiPieces.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.r += p.spin;
      fxCtx.save();
      fxCtx.translate(p.x,p.y);
      fxCtx.rotate(p.r);
      fxCtx.fillStyle = p.color;
      fxCtx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      fxCtx.restore();
    });
    // remove those below bottom for continuous look
    confettiPieces = confettiPieces.filter(p=>p.y < fx.height + 40);
  }
  if (particleActive){
    particlePieces.forEach((p,idx)=>{
      p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.t += dt;
      const alpha = Math.max(0, 1 - p.t/p.life);
      fxCtx.beginPath();
      fxCtx.fillStyle = p.color;
      fxCtx.globalAlpha = alpha;
      fxCtx.arc(p.x,p.y,p.size,0,Math.PI*2);
      fxCtx.fill();
      fxCtx.globalAlpha = 1;
    });
    particlePieces = particlePieces.filter(p=>p.t < p.life);
  }
  animateFx._raf = requestAnimationFrame(animateFx);
}

/* ===================== Undo, Replay, Rematch ===================== */
function undoMove() {
  if (!state.moves.length) return;
  // if vs AI, undo last two (player + AI) for fairness
  if (state.mode === 'ai' && state.moves.length >= 2) {
    const last = state.moves.pop();
    state.board[last.index] = null;
    const prev = state.moves.pop();
    state.board[prev.index] = null;
    state.current = prev.player;
  } else {
    const last = state.moves.pop();
    state.board[last.index] = null;
    state.current = last.player;
  }
  state.isGameOver = false;
  clearSvg();
  renderBoard();
  resetTimerForTurn();
}

function resetGame(keepScores=false) {
  state.boardSize = Number(sizeSelect.value);
  state.winLength = computeWinLength(state.boardSize);
  state.board = [];
  state.current = startPlayerSelect.value || state.startPlayer || 'X';
  if (!keepScores && state.swapStart) {
    // swap start if enabled
    state.current = state.current === 'X' ? 'O' : 'X';
    startPlayerSelect.value = state.current;
  }
  buildBoard();
  renderBoard();
  state.isGameOver = false;
  clearSvg();
  if (state.mode === 'ai' && state.current === 'O') {
    setTimeout(()=>aiMove(), 320);
  }
  resetTimerForTurn();
}

function rematch() {
  // rematch keeps scores but restarts board and optionally swaps start
  if (state.swapStart) startPlayerSelect.value = (startPlayerSelect.value === 'X' ? 'O' : 'X');
  resetGame(true);
}

/* ===================== Timer handling ===================== */
function resetTimerForTurn() {
  if (!state.timed) { timerWrap.classList.add('hidden'); return; }
  timerWrap.classList.remove('hidden');
  state.timerRemaining = Number(secondsPerTurn.value) || 10;
  timerValue.textContent = state.timerRemaining;
  updateTimerFill();
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(()=>{
    state.timerRemaining--;
    if (state.timerRemaining <= 0) {
      clearInterval(state.timerInterval);
      onTurnTimeout();
    }
    timerValue.textContent = Math.max(0, state.timerRemaining);
    updateTimerFill();
  }, 1000);
}

function updateTimerFill() {
  const total = Number(secondsPerTurn.value) || 10;
  const pct = Math.max(0, state.timerRemaining/total);
  timerFill.style.width = `${pct*100}%`;
}

function onTurnTimeout() {
  // handle according to settings
  if (state.timeoutAction === 'pass') {
    // skip turn: just switch player
    state.current = state.current === 'X' ? 'O' : 'X';
    boardEl.dataset.current = state.current;
    if (state.mode === 'ai' && state.current === 'O') {
      setTimeout(()=>aiMove(), 240);
    }
    resetTimerForTurn();
  } else {
    // make a random move on behalf of current player
    const avail = availableMoves(state.board);
    if (avail.length) {
      const idx = avail[Math.floor(Math.random()*avail.length)];
      makeMove(idx, state.current);
    }
    resetTimerForTurn();
  }
}

/* ===================== Helpers for available moves ===================== */
function availableMoves(board) {
  return board.map((v,i)=>v?null:i).filter(v=>v!==null);
}

/* ===================== AI (Easy/Medium/Hard) ===================== */

function aiMove() {
  if (state.isGameOver) return;
  if (state.mode !== 'ai') return;
  const aiPlayer = 'O', human = 'X';
  let move;
  const avail = availableMoves(state.board);
  if (!avail.length) return;
  if (state.difficulty === 'easy') {
    move = avail[Math.floor(Math.random()*avail.length)];
  } else if (state.difficulty === 'medium') {
    // try win, block, else random
    // check immediate win
    for (let idx of avail){
      const copy = state.board.slice(); copy[idx] = aiPlayer;
      if (checkWinner(copy, state.boardSize, state.winLength)) { move = idx; break; }
    }
    if (move === undefined) {
      for (let idx of avail){
        const copy = state.board.slice(); copy[idx] = human;
        if (checkWinner(copy, state.boardSize, state.winLength)) { move = idx; break; }
      }
    }
    if (move === undefined) {
      // prefer center-ish
      const center = Math.floor(state.boardSize/2) * state.boardSize + Math.floor(state.boardSize/2);
      if (avail.includes(center)) move = center;
    }
    if (move === undefined) move = avail[Math.floor(Math.random()*avail.length)];
  } else {
    // Hard -> minimax (alpha-beta)
    move = bestMoveMinimax(state.board, aiPlayer);
  }
  makeMove(move, aiPlayer);
}

/* Minimax with alpha-beta and dynamic depth limit */
function bestMoveMinimax(board, player) {
  const n = state.boardSize;
  const winLen = state.winLength;
  const avail = availableMoves(board);
  // Adaptive depth: full for 3x3, limited for larger boards
  const maxDepth = (n===3) ? 9 : (n===4 ? 5 : 4);

  let bestVal = -Infinity, bestIdx = avail[0];
  for (const idx of avail) {
    board[idx] = player;
    const val = minimax(board, 1, false, -Infinity, Infinity, player, maxDepth);
    board[idx] = null;
    if (val > bestVal) { bestVal = val; bestIdx = idx; }
  }
  return bestIdx;
}

function minimax(board, depth, isMax, alpha, beta, aiPlayer, maxDepth) {
  const n = state.boardSize, winLen = state.winLength;
  const winner = checkWinner(board, n, winLen);
  if (winner) {
    if (winner.player === aiPlayer) return 1000 - depth;
    return -1000 + depth;
  }
  const avail = availableMoves(board);
  if (avail.length === 0 || depth >= maxDepth) {
    // evaluate heuristic
    return heuristic(board, aiPlayer);
  }
  if (isMax) {
    let best = -Infinity;
    for (const idx of avail) {
      board[idx] = aiPlayer;
      const val = minimax(board, depth+1, false, alpha, beta, aiPlayer, maxDepth);
      board[idx] = null;
      best = Math.max(best, val);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    const opp = aiPlayer === 'X' ? 'O' : 'X';
    for (const idx of avail) {
      board[idx] = opp;
      const val = minimax(board, depth+1, true, alpha, beta, aiPlayer, maxDepth);
      board[idx] = null;
      best = Math.min(best, val);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/* Heuristic: simple scoring based on open lines for AI minus opponent */
function heuristic(board, aiPlayer) {
  const n = state.boardSize, winLen = state.winLength;
  const lines = generateLines(n, winLen);
  let score = 0;
  const opp = aiPlayer === 'X' ? 'O' : 'X';
  for (const idxs of lines) {
    const vals = idxs.map(i=>board[i]);
    if (vals.includes(aiPlayer) && vals.includes(opp)) continue;
    const aiCount = vals.filter(v=>v===aiPlayer).length;
    const oppCount = vals.filter(v=>v===opp).length;
    if (aiCount > 0) score += Math.pow(10, aiCount);
    if (oppCount > 0) score -= Math.pow(10, oppCount);
  }
  return score;
}

function generateLines(n, winLen) {
  const lines = [];
  for (let r=0;r<n;r++){
    for (let c=0;c<=n-winLen;c++){
      const idxs=[]; for (let k=0;k<winLen;k++) idxs.push(r*n + (c+k)); lines.push(idxs);
    }
  }
  for (let c=0;c<n;c++){
    for (let r=0;r<=n-winLen;r++){
      const idxs=[]; for (let k=0;k<winLen;k++) idxs.push((r+k)*n + c); lines.push(idxs);
    }
  }
  for (let r=0;r<=n-winLen;r++){
    for (let c=0;c<=n-winLen;c++){
      const idxs=[]; for (let k=0;k<winLen;k++) idxs.push((r+k)*n + (c+k)); lines.push(idxs);
    }
  }
  for (let r=winLen-1;r<n;r++){
    for (let c=0;c<=n-winLen;c++){
      const idxs=[]; for (let k=0;k<winLen;k++) idxs.push((r-k)*n + (c+k)); lines.push(idxs);
    }
  }
  return lines;
}

/* ===================== UI wiring & events ===================== */

window.addEventListener('resize', resizeFxCanvas);
window.addEventListener('load', ()=>{
  // initial settings
  state.mode = modeSelect.value;
  state.difficulty = difficultySelect.value;
  state.boardSize = Number(sizeSelect.value);
  state.winLength = computeWinLength(state.boardSize);
  state.current = startPlayerSelect.value;
  state.timed = timedToggle.checked;
  state.secondsPerTurn = Number(secondsPerTurn.value);
  state.timeoutAction = timeoutAction.value;
  state.soundOn = soundToggle.checked;
  state.confettiOn = confettiToggle.checked;
  state.particlesOn = particlesToggle.checked;
  state.shakeOn = shakeToggle.checked;
  buildBoard();
  renderHistory();
  attachControls();
  // ensure canvas sized
  setTimeout(resizeFxCanvas, 200);
});

function attachControls(){
  modeSelect.addEventListener('change', (e)=>{
    state.mode = e.target.value;
    document.getElementById('difficultyWrap').style.display = state.mode === 'ai' ? 'inline-block' : 'none';
    modeLabel.textContent = `Mode: ${state.mode === 'ai' ? 'Player vs AI' : 'Local'}`;
    resetGame(true);
  });
  difficultySelect.addEventListener('change', e => { state.difficulty = e.target.value; });
  sizeSelect.addEventListener('change', e => {
    state.boardSize = Number(e.target.value);
    state.winLength = computeWinLength(state.boardSize);
    resetGame(true);
  });
  themeSelect.addEventListener('change', e => {
    const v = e.target.value;
    document.body.className = `theme-${v}`;
  });
  soundToggle.addEventListener('change', e => state.soundOn = e.target.checked);
  confettiToggle.addEventListener('change', e => state.confettiOn = e.target.checked);
  particlesToggle.addEventListener('change', e => state.particlesOn = e.target.checked);
  shakeToggle.addEventListener('change', e => state.shakeOn = e.target.checked);
  undoBtn.addEventListener('click', undoMove);
  rematchBtn.addEventListener('click', rematch);
  replayBtn.addEventListener('click', ()=> { state.historyStats = {X:0,O:0,D:0}; saveHistory(); renderHistory(); resetGame(); });
  timedToggle.addEventListener('change', e => { state.timed = e.target.checked; resetTimerForTurn(); });
  secondsPerTurn.addEventListener('change', e => { state.secondsPerTurn = Number(e.target.value); resetTimerForTurn(); });
  timeoutAction.addEventListener('change', e => state.timeoutAction = e.target.value);
  startPlayerSelect.addEventListener('change', e => { state.startPlayer = e.target.value; resetGame(true); });
  swapStart.addEventListener('change', e => state.swapStart = e.target.checked);
  // sound context resume on any interaction
  document.addEventListener('click', ()=>{ ensureAudio(); if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume(); }, {once:true});
}

/* ===================== Utility for shake */
function triggerShake() {
  boardEl.classList.add('shake');
  setTimeout(()=>boardEl.classList.remove('shake'), 600);
}

/* ===================== Expose some debug helpers (optional) ===================== */
window.ttt = { state, resetGame, undoMove };

/* ===================== Initialization ===================== */
loadHistory();
resetGame(true);
