const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI 元素
const title = document.getElementById('title');
const instruction = document.getElementById('instruction');
const scoreBoard = document.getElementById('score-board');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScore = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const bestScoreDisplay = document.getElementById('best-score');
const finalBestScore = document.getElementById('final-best-score');
const bgmVolumeInput = document.getElementById('bgm-volume');
const sfxVolumeInput = document.getElementById('sfx-volume');
const charSelectMenu = document.getElementById('character-select');
const charBtns = document.querySelectorAll('.char-btn');
const pauseBtn = document.getElementById('pause-btn');
const pauseScreen = document.getElementById('pause-screen');
const resumeBtn = document.getElementById('resume-btn');

let currentCharIndex = 0; // 紀錄目前選擇的角色編號
let frames = 0;
let gameState = 'START'; // 三種狀態: START, PLAYING, GAMEOVER
let score = 0;
let highScore = localStorage.getItem('flappyHighScore') || 0;
bestScoreDisplay.innerText = highScore;

// 遊戲物理常數
const GRAVITY = 0.6;   // 重力
const JUMP = -8;       // 跳躍力道
const SPEED = 3;       // 畫面捲動速度
const PIPE_WIDTH = 60; // 水管寬度
const PIPE_GAP = 175;  // 上下水管之間的空隙 (配合腳色放大而稍微調寬)

// ----- 音效合成器 (Web Audio API) -----
const sfx = {
    ctx: null,
    bgmInterval: null,
    bgmVolume: 0.5, // 呼應 HTML 的預設值
    sfxVolume: 1.0,

    // 初始化 AudioContext (必須在玩家點擊後才能執行)
    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    // 產生基本波形的聲音
    playTone(freq, type, duration, vol = 0.1, isBgm = false) {
        if (!this.ctx) return;

        // 依照音效類型套用不同的音量比例設定
        const finalVol = vol * (isBgm ? this.bgmVolume : this.sfxVolume);
        if (finalVol <= 0) return; // 如果靜音就不播放

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(finalVol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    // 拍翅膀音效
    flap() {
        this.playTone(400, 'sine', 0.15, 0.15);
    },

    // 得分叮鈴聲
    score() {
        if (!this.ctx) return;
        if (this.sfxVolume <= 0) return; // 依套用音效音量，若靜音則不播放

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.setValueAtTime(1200, t + 0.1);

        // 將原本的基礎音量 0.1 調小至 0.03，並乘上玩家設定的音效音量 (sfxVolume)
        const finalVol = 0.06 * this.sfxVolume;

        gain.gain.setValueAtTime(finalVol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3); // 結尾慢慢變小至極小值
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(t + 0.3);
    },

    // 撞擊 / 失敗音效
    hit() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(t + 0.3);
    },

    // 結算音效 (降調和弦)
    gameOver() {
        if (!this.ctx) return;
        setTimeout(() => this.playTone(300, 'square', 0.2, 0.1), 300);
        setTimeout(() => this.playTone(250, 'square', 0.2, 0.1), 500);
        setTimeout(() => this.playTone(200, 'square', 0.5, 0.1), 700);
    },

    // 開始背景音樂 (簡單的貝斯節奏)
    startBGM() {
        if (this.bgmInterval) return;
        let noteIdx = 0;
        const bassNotes = [110, 110, 146.83, 164.81]; // A2, A2, D3, E3

        this.bgmInterval = setInterval(() => {
            if (gameState === 'PLAYING') {
                // 原本為 0.08，修改為 0.4 來大幅提升 BGM 音量
                this.playTone(bassNotes[noteIdx % bassNotes.length], 'triangle', 0.3, 0.4, true); // 標記為 BGM
                noteIdx++;
            }
        }, 400);
    },

    // 停止背景音樂
    stopBGM() {
        clearInterval(this.bgmInterval);
        this.bgmInterval = null;
    }
};

// 準備自訂義鳥圖片 (動態切換機制)
const birdImg = new Image();
let isCustomBirdLoaded = false;
birdImg.onload = () => { isCustomBirdLoaded = true; }; // 載入成功
birdImg.onerror = () => { isCustomBirdLoaded = false; }; // 載入失敗退回預設鳥

// 選角按鈕點擊事件監聽
charBtns.forEach((btn, index) => {
    btn.addEventListener('click', (e) => {
        currentCharIndex = index; // 同步目前選取的編號，以便鍵盤也能無縫接軌轉換

        // UI 切換標籤視覺特效
        charBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        const src = btn.getAttribute('data-src');
        if (src === 'default') {
            isCustomBirdLoaded = false; // 強制退回使用幾何鳥
        } else {
            isCustomBirdLoaded = false; // 在下次 onload 之前先暫時用幾何鳥
            birdImg.src = src;          // 開始載入點選的圖片路徑
        }

    });
});

// ----- 鳥的物件模型 -----
const bird = {
    x: 60,
    y: 150,
    radius: 18, // 略微放大碰撞體積，確保碰撞判定合理
    velocity: 0,
    rotation: 0,

    // 繪製鳥
    draw() {
        ctx.save(); // 儲存當前畫布狀態
        ctx.translate(this.x, this.y);

        // 根據跳躍或墜落旋轉鳥頭
        ctx.rotate(this.rotation);

        if (isCustomBirdLoaded) {
            // 若玩家有放 bird.png，則畫出玩家的照片
            // 範圍大幅放大以便遊玩時看清楚細節
            const size = this.radius * 3.5;
            ctx.drawImage(birdImg, -size / 2, -size / 2, size, size);
        } else {
            // 原本用程式碼畫的像素幾何鳥 (當作尚未上傳時的備案)
            ctx.save(); // 儲存為鳥繪製的 context

            // 由於前面把 radius 在物理上調大到 18 了，但程式碼繪圖座標寫死了原本的大小
            // 這裡我們進行等比例放大，讓鳥看起來正常不變形
            const scale = this.radius / 14;
            ctx.scale(scale, scale);

            // 身體
            ctx.fillStyle = '#f1c40f'; // 黃色
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 2); // 強制用原始基礎 14 畫圓，配合外部的 scale 放大
            ctx.fill();
            ctx.lineWidth = 2 / scale; // 筆畫粗細不跟著放大，保持線條銳利
            ctx.strokeStyle = '#000';
            ctx.stroke();
            ctx.closePath();

            // 眼睛
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(5, -5, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.closePath();

            // 眼珠
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(7, -5, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();

            // 鳥喙
            ctx.fillStyle = '#e67e22'; // 橘色
            ctx.beginPath();
            ctx.moveTo(8, 0);
            ctx.lineTo(20, 2);
            ctx.lineTo(8, 8);
            ctx.fill();
            ctx.stroke();
            ctx.closePath();

            // 翅膀
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.ellipse(-4, 2, 6, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.restore(); // 恢復畫圖前的 scale
        }

        ctx.restore(); // 恢復畫布狀態
    },

    // 更新物理狀態
    update() {
        this.velocity += GRAVITY;
        this.y += this.velocity;

        // 設定旋轉角度，當速度向下時往下看，向上時往上看
        if (this.velocity >= JUMP) {
            this.rotation = Math.min(Math.PI / 4, this.velocity * 0.1);
        } else {
            this.rotation = -Math.PI / 8;
        }

        // 碰撞偵測：撞到地板
        if (this.y + this.radius >= canvas.height - 50) {
            this.y = canvas.height - 50 - this.radius;
            gameOver();
        }
        // 碰撞偵測：撞到天花板
        if (this.y - this.radius <= 0) {
            this.y = this.radius;
            this.velocity = 0;
        }
    },

    // 飛行跳躍
    flap() {
        this.velocity = JUMP;
    },

    // 重置
    reset() {
        this.y = window.innerHeight / 2 || 300;
        this.velocity = 0;
        this.rotation = 0;
    }
}

// ----- 水管的物件模型 -----
const pipes = {
    position: [],

    draw() {
        for (let i = 0; i < this.position.length; i++) {
            let p = this.position[i];

            // 水管顏色與邊框設定
            ctx.fillStyle = '#55a020'; // 深綠色
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;

            // --- 繪畫上水管 ---
            ctx.fillRect(p.x, 0, PIPE_WIDTH, p.y);
            ctx.strokeRect(p.x, 0, PIPE_WIDTH, p.y);
            // 上水管的突出口
            ctx.fillRect(p.x - 4, p.y - 20, PIPE_WIDTH + 8, 20);
            ctx.strokeRect(p.x - 4, p.y - 20, PIPE_WIDTH + 8, 20);

            // --- 繪畫下水管 ---
            ctx.fillRect(p.x, p.y + PIPE_GAP, PIPE_WIDTH, canvas.height - p.y - PIPE_GAP - 50);
            ctx.strokeRect(p.x, p.y + PIPE_GAP, PIPE_WIDTH, canvas.height - p.y - PIPE_GAP - 50);
            // 下水管的突出口
            ctx.fillRect(p.x - 4, p.y + PIPE_GAP, PIPE_WIDTH + 8, 20);
            ctx.strokeRect(p.x - 4, p.y + PIPE_GAP, PIPE_WIDTH + 8, 20);
        }
    },

    update() {
        // 每隔 90 個 frame 產生一個新水管
        if (frames % 90 === 0) {
            this.position.push({
                x: canvas.width,
                // 設定水管開口高度隨機 (上下限防超出)
                y: Math.max(50, Math.random() * (canvas.height - PIPE_GAP - 150)) + 50,
                passed: false
            });
        }

        for (let i = 0; i < this.position.length; i++) {
            let p = this.position[i];
            p.x -= SPEED;

            // 碰撞偵測（鳥與水管）
            // 為了讓遊戲稍微友善一點，把鳥的碰撞範圍縮小一點點
            let collisionRadius = bird.radius - 2;

            // 檢查上水管
            if (bird.x + collisionRadius > p.x &&
                bird.x - collisionRadius < p.x + PIPE_WIDTH &&
                bird.y - collisionRadius < p.y) {
                gameOver();
            }
            // 檢查下水管
            if (bird.x + collisionRadius > p.x &&
                bird.x - collisionRadius < p.x + PIPE_WIDTH &&
                bird.y + collisionRadius > p.y + PIPE_GAP) {
                gameOver();
            }

            // 更新分數：當小鳥成功越過水管的右側邊緣
            if (!p.passed && p.x + PIPE_WIDTH < bird.x - bird.radius) {
                score++;
                scoreBoard.innerText = score;
                sfx.score(); // 播放得分音效
                p.passed = true;
            }

            // 移除已經移出畫面的水管
            if (p.x + PIPE_WIDTH <= 0) {
                this.position.shift();
                i--;
            }
        }
    },

    reset() {
        this.position = [];
    }
}

// ----- 背景與地板模型 -----
const environment = {
    groundX: 0,

    draw() {
        // 畫地板底色
        ctx.fillStyle = '#ded8bc';
        ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
        ctx.beginPath();
        ctx.moveTo(0, canvas.height - 50);
        ctx.lineTo(canvas.width, canvas.height - 50);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 畫地板上的移動紋路 (產生速度感)
        ctx.fillStyle = '#73bf2e'; // 地板頂端草皮
        ctx.fillRect(0, canvas.height - 50, canvas.width, 10);

        ctx.fillStyle = '#55a020'; // 草皮陰影紋路
        for (let i = 0; i < 15; i++) {
            ctx.fillRect(this.groundX + i * 35, canvas.height - 50, 15, 10);
        }
    },

    update() {
        this.groundX -= SPEED;
        // 當紋路位移超過一段距離後重置，達成無縫循環
        if (this.groundX <= -35) {
            this.groundX = 0;
        }
    }
}

// ----- 核心遊戲函數 -----

// 統一繪製畫面
function draw() {
    // 1. 清空畫布並畫出天空背景
    ctx.fillStyle = '#70c5ce';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. 依照不同遊戲狀態，決定畫什麼
    if (gameState === 'PLAYING' || gameState === 'PAUSED') {
        pipes.draw();
        environment.draw();
        bird.draw();
    } else if (gameState === 'START') {
        environment.draw();
        bird.draw();
    } else if (gameState === 'GAMEOVER') {
        pipes.draw();
        environment.draw();
        bird.draw();
    }
}

// 統一更新物理數據
function update() {
    if (gameState === 'PLAYING') {
        bird.update();
        pipes.update();
        environment.update();
    }
}

// 遊戲主迴圈
function loop() {
    update();
    draw();
    frames++;
    requestAnimationFrame(loop); // 電腦每秒約觸發 60 次這個函數
}

// 開始遊戲
function startGame() {
    gameState = 'PLAYING';
    title.style.display = 'none';
    instruction.style.display = 'none';
    if (charSelectMenu) charSelectMenu.style.display = 'none'; // 遊戲開始隱藏選角
    scoreBoard.style.display = 'block';
    if (pauseBtn) pauseBtn.classList.remove('hidden'); // 顯示暫停按鈕

    bird.reset();
    pipes.reset();

    score = 0;
    scoreBoard.innerText = score;
    frames = 0;

    // 播放背景音樂
    sfx.startBGM();

    // 開始第一跳
    bird.flap();
}

// 遊戲結束
function gameOver() {
    if (gameState === 'GAMEOVER') return; // 避免重複觸發

    gameState = 'GAMEOVER';

    sfx.stopBGM();     // 停止背景音樂
    sfx.hit();         // 播放撞擊音效
    sfx.gameOver();    // 播放結算音樂

    // 更新最高分
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('flappyHighScore', highScore);
        bestScoreDisplay.innerText = highScore;
    }

    scoreBoard.style.display = 'none';      // 隱藏目前分數
    if (pauseBtn) pauseBtn.classList.add('hidden'); // 隱藏暫停按鈕
    gameOverScreen.classList.remove('hidden'); // 顯示結算畫面
    finalScore.innerText = score;
    finalBestScore.innerText = highScore;
}

function togglePause() {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        if (pauseBtn) pauseBtn.classList.add('hidden');
        if (pauseScreen) pauseScreen.classList.remove('hidden');
    } else if (gameState === 'PAUSED') {
        gameState = 'PLAYING';
        if (pauseScreen) pauseScreen.classList.add('hidden');
        if (pauseBtn) pauseBtn.classList.remove('hidden');
    }
}

// ----- 輸入控制監聽 -----
function inputHandler() {
    sfx.init(); // 初始化音效引擎

    if (gameState === 'START') {
        startGame();
        sfx.flap();
    } else if (gameState === 'PLAYING') {
        bird.flap();
        sfx.flap();
    }
}

// 鍵盤操控 (空白鍵或向上鍵)
window.addEventListener('keydown', (e) => {
    // 遊戲開始畫面時允許使用左右鍵來循環切換角色
    if (gameState === 'START') {
        if (e.code === 'ArrowLeft') {
            currentCharIndex = (currentCharIndex - 1 + charBtns.length) % charBtns.length;
            charBtns[currentCharIndex].click();
        } else if (e.code === 'ArrowRight') {
            currentCharIndex = (currentCharIndex + 1) % charBtns.length;
            charBtns[currentCharIndex].click();
        }
    }

    if (e.code === 'Space' || e.code === 'ArrowUp') {
        inputHandler();
        e.preventDefault(); // 防止按空白鍵時網頁向下捲動
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
        togglePause();
    }
    // 允許按 Enter 重啟遊戲或解除暫停
    if (e.code === 'Enter') {
        if (gameState === 'GAMEOVER') {
            restartBtn.click(); // 直接觸發重新開始按鈕的點擊事件
        } else if (gameState === 'PAUSED') {
            togglePause(); // 直接觸發解除暫停
        }
    }
});

// 手機觸控或滑鼠操控
canvas.addEventListener('mousedown', inputHandler);
canvas.addEventListener('touchstart', (e) => {
    inputHandler();
    e.preventDefault();
}, { passive: false });

// 暫停與繼續按鈕
if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
if (resumeBtn) resumeBtn.addEventListener('click', togglePause);

// 重新開始按鈕
restartBtn.addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    gameState = 'START';

    // 恢復標題文字
    title.style.display = 'block';
    instruction.style.display = 'block';
    if (charSelectMenu) charSelectMenu.style.display = 'block'; // 再次顯示選角

    bird.reset();
    pipes.reset();
});

// 監聽音量滑桿變動
bgmVolumeInput.addEventListener('input', (e) => {
    sfx.bgmVolume = parseFloat(e.target.value);
});

sfxVolumeInput.addEventListener('input', (e) => {
    sfx.sfxVolume = parseFloat(e.target.value);
});

// 動態調整遊戲畫面尺寸以符合視窗大小
function resizeGame() {
    const gameContainer = document.querySelector('.game-container');
    if (!gameContainer) return;
    
    // 計算比例，以原本的 400x600 為基準
    // 使用 Math.min 確保畫面在任何比例的視窗下都能夠完整顯示且不變形
    const scale = Math.min(window.innerWidth / 400, window.innerHeight / 600);
    
    gameContainer.style.transform = `scale(${scale})`;
    gameContainer.style.transformOrigin = 'center center';
}

// 監聽視窗縮放事件
window.addEventListener('resize', resizeGame);
resizeGame(); // 初始化時執行一次

// 啟動迴圈
bird.reset();
loop();
