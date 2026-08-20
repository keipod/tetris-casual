/**
 * Game.js - 메인 게임 클래스
 */
class Game {
    constructor(canvasId, theme = 'gems') {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.theme = theme;
        
        // 게임 설정
        this.gridSize = 8;
        
        // 반응형 캔버스 크기 설정
        this.setupResponsiveCanvas();
        window.addEventListener('resize', () => this.setupResponsiveCanvas());
        
        // 컴포넌트 초기화
        this.grid = new Grid(this.gridSize, this.gridSize, this.tileSize);
        this.matcher = new Matcher(this.grid);
        this.animator = new Animator(this);
        this.soundManager = new SoundManager();
        
        // 게임 상태
        this.state = 'idle';  // idle, selecting, swapping, matching, falling, refilling
        this.score = 0;
        this.combo = 0;
        
        // 드래그 상태
        this.dragStartTile = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.isDragging = false;
        
        // 타이머 (5분 = 300초)
        this.timeLimit = 300;
        this.timeRemaining = 300;
        this.timerInterval = null;
        this.gameOver = false;
        
        // 테마 이미지
        this.images = {};
        this.boardImage = null;
        this.imagesLoaded = false;
        
        // 이벤트 바인딩
        this.bindEvents();
    }
    
    /**
     * 반응형 캔버스 크기 설정
     */
    setupResponsiveCanvas() {
        // 뷰포트 크기 확인
        const maxSize = Math.min(
            window.innerWidth - 40,  // 양쪽 여백
            window.innerHeight - 250, // 상하 UI 공간
            600  // 최대 크기
        );
        
        // 모바일 디바이스 확인
        const isMobile = window.innerWidth <= 768;
        const canvasSize = isMobile 
            ? Math.min(maxSize, window.innerWidth - 40)
            : Math.min(maxSize, 512);
        
        this.tileSize = Math.floor(canvasSize / this.gridSize);
        const actualSize = this.tileSize * this.gridSize;
        
        this.canvas.width = actualSize;
        this.canvas.height = actualSize;
        
        // CSS로도 크기 설정 (레티나 디스플레이 대응)
        this.canvas.style.width = actualSize + 'px';
        this.canvas.style.height = actualSize + 'px';
        
        // 기존 그리드가 있다면 타일 위치 재조정
        if (this.grid) {
            this.grid.tileSize = this.tileSize;
            this.grid.forEach(tile => {
                tile.targetX = tile.col * this.tileSize + this.tileSize / 2;
                tile.targetY = tile.row * this.tileSize + this.tileSize / 2;
                tile.x = tile.targetX;
                tile.y = tile.targetY;
            });
        }
    }
    
    /**
     * 게임 시작
     */
    async start() {
        await Promise.all([this.loadImages(), this.soundManager.load()]);
        this.grid.init();
        this.startTimer();
        this.gameLoop();
    }
    
    /**
     * 타이머 시작
     */
    startTimer() {
        this.timeRemaining = this.timeLimit;
        this.gameOver = false;
        this.updateTimerDisplay();
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        this.timerInterval = setInterval(() => {
            if (!this.gameOver) {
                this.timeRemaining--;
                this.updateTimerDisplay();
                
                if (this.timeRemaining <= 0) {
                    this.endGame();
                }
            }
        }, 1000);
    }
    
    /**
     * 타이머 표시 업데이트
     */
    updateTimerDisplay() {
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }
    
    /**
     * 게임 종료
     */
    endGame() {
        this.gameOver = true;
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // 게임 오버 메시지 표시
        setTimeout(() => {
            const title = typeof i18n !== 'undefined' ? i18n.t('game.over.title') : 'Game Over!';
            const message = typeof i18n !== 'undefined' 
                ? i18n.t('game.over.message', { score: this.score.toLocaleString() })
                : `Final Score: ${this.score.toLocaleString()}`;
            alert(`${title}\n${message}`);
        }, 100);
    }
    
    /**
     * 이미지 로드
     */
    async loadImages() {
        const types = ['tile0', 'tile1', 'tile2', 'tile3', 'tile4', 'tile5', 'bomb', 'rainbow'];
        const loaded = await Promise.all(types.map((type) => this.loadImage(type)));
        this.boardImage = await this.loadImageFile(`../assets/${this.theme}/board.png`);
        this.imagesLoaded = loaded.some(Boolean);
    }
    
    /**
     * 단일 이미지 로드
     */
    loadImage(name) {
        return this.loadImageFile(`../assets/${this.theme}/${name}.png`).then((img) => {
            if (img) this.images[name] = img;
            return img;
        });
    }

    loadImageFile(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }
    
    /**
     * 이벤트 바인딩
     */
    bindEvents() {
        // 마우스 이벤트
        this.canvas.addEventListener('mousedown', (e) => this.handleDragStart(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleDragMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleDragEnd(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handleDragEnd(e));
        
        // 터치 이벤트
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        this.canvas.addEventListener('touchcancel', (e) => this.handleTouchEnd(e));
    }
    
    /**
     * 드래그 시작 (마우스)
     */
    handleDragStart(e) {
        if (this.state !== 'idle' || this.gameOver) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const tile = this.grid.getTileAt(x, y);
        if (tile) {
            this.dragStartTile = tile;
            this.dragStartX = x;
            this.dragStartY = y;
            this.isDragging = true;
            tile.selected = true;
        }
    }
    
    /**
     * 드래그 중 (마우스)
     */
    handleDragMove(e) {
        if (!this.isDragging || !this.dragStartTile) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const dx = x - this.dragStartX;
        const dy = y - this.dragStartY;
        const threshold = this.tileSize * 0.3; // 30% 이동 시 스왑
        
        if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
            // 방향 결정
            let targetTile = null;
            if (Math.abs(dx) > Math.abs(dy)) {
                // 좌우 이동
                if (dx > 0 && this.dragStartTile.col < this.gridSize - 1) {
                    targetTile = this.grid.getTile(this.dragStartTile.row, this.dragStartTile.col + 1);
                } else if (dx < 0 && this.dragStartTile.col > 0) {
                    targetTile = this.grid.getTile(this.dragStartTile.row, this.dragStartTile.col - 1);
                }
            } else {
                // 상하 이동
                if (dy > 0 && this.dragStartTile.row < this.gridSize - 1) {
                    targetTile = this.grid.getTile(this.dragStartTile.row + 1, this.dragStartTile.col);
                } else if (dy < 0 && this.dragStartTile.row > 0) {
                    targetTile = this.grid.getTile(this.dragStartTile.row - 1, this.dragStartTile.col);
                }
            }
            
            if (targetTile) {
                this.dragStartTile.selected = false;
                this.trySwap(this.dragStartTile, targetTile);
                this.isDragging = false;
                this.dragStartTile = null;
            }
        }
    }
    
    /**
     * 드래그 종료 (마우스)
     */
    handleDragEnd(e) {
        if (this.dragStartTile) {
            this.dragStartTile.selected = false;
        }
        this.isDragging = false;
        this.dragStartTile = null;
    }
    
    /**
     * 터치 시작
     */
    handleTouchStart(e) {
        e.preventDefault();
        if (this.state !== 'idle' || this.gameOver) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        const tile = this.grid.getTileAt(x, y);
        if (tile) {
            this.dragStartTile = tile;
            this.dragStartX = x;
            this.dragStartY = y;
            this.isDragging = true;
            tile.selected = true;
        }
    }
    
    /**
     * 터치 이동
     */
    handleTouchMove(e) {
        e.preventDefault();
        if (!this.isDragging || !this.dragStartTile) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        const dx = x - this.dragStartX;
        const dy = y - this.dragStartY;
        const threshold = this.tileSize * 0.3;
        
        if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
            let targetTile = null;
            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 0 && this.dragStartTile.col < this.gridSize - 1) {
                    targetTile = this.grid.getTile(this.dragStartTile.row, this.dragStartTile.col + 1);
                } else if (dx < 0 && this.dragStartTile.col > 0) {
                    targetTile = this.grid.getTile(this.dragStartTile.row, this.dragStartTile.col - 1);
                }
            } else {
                if (dy > 0 && this.dragStartTile.row < this.gridSize - 1) {
                    targetTile = this.grid.getTile(this.dragStartTile.row + 1, this.dragStartTile.col);
                } else if (dy < 0 && this.dragStartTile.row > 0) {
                    targetTile = this.grid.getTile(this.dragStartTile.row - 1, this.dragStartTile.col);
                }
            }
            
            if (targetTile) {
                this.dragStartTile.selected = false;
                this.trySwap(this.dragStartTile, targetTile);
                this.isDragging = false;
                this.dragStartTile = null;
            }
        }
    }
    
    /**
     * 터치 종료
     */
    handleTouchEnd(e) {
        e.preventDefault();
        if (this.dragStartTile) {
            this.dragStartTile.selected = false;
        }
        this.isDragging = false;
        this.dragStartTile = null;
    }
    
    /**
     * 스왑 시도
     */
    async trySwap(tile1, tile2) {
        if (this.gameOver) return;
        
        this.state = 'swapping';
        
        // 스왑 애니메이션
        this.grid.swap(tile1, tile2);
        this.soundManager.play('swap');
        await this.animator.waitForGrid();
        
        // 특수 타일 발동 확인
        const hasSpecialTile = tile1.isSpecial || tile2.isSpecial;
        
        if (hasSpecialTile) {
            // 특수 타일 발동
            this.combo = 0;
            await this.activateSpecialTiles(tile1, tile2);
        } else {
            // 일반 매치 확인
            const matches = this.matcher.findAllMatches();
            
            if (matches.length > 0) {
                // 매치 성공 - 처리
                this.combo = 0;
                await this.processMatches(matches);
            } else {
                // 매치 실패 - 되돌리기
                this.grid.swap(tile1, tile2);
                await this.animator.waitForGrid();
            }
        }
        
        this.state = 'idle';
    }
    
    /**
     * 특수 타일 발동
     */
    async activateSpecialTiles(tile1, tile2) {
        this.state = 'matching';
        const tilesToRemove = [];
        
        // tile1이 특수 타일인 경우
        if (tile1.isSpecial) {
            const targets = this.matcher.findSpecialTileTargets(tile1, tile2);
            tilesToRemove.push(tile1, ...targets);
            this.soundManager.play(tile1.specialType);
        }
        
        // tile2가 특수 타일인 경우
        if (tile2.isSpecial) {
            const targets = this.matcher.findSpecialTileTargets(tile2, tile1);
            // 중복 제거
            for (const t of [tile2, ...targets]) {
                if (!tilesToRemove.includes(t)) {
                    tilesToRemove.push(t);
                }
            }
            this.soundManager.play(tile2.specialType);
        }
        
        // 점수 계산
        const points = tilesToRemove.length * 20; // 특수 타일은 더 높은 점수
        this.addScore(points);
        
        // 타일에 matched 표시
        tilesToRemove.forEach(t => t.matched = true);
        
        // 매치 애니메이션
        await this.animator.animateMatches([{ tiles: tilesToRemove }]);
        
        // 타일 제거
        this.grid.removeMatches([{ tiles: tilesToRemove }]);
        
        // 중력 적용
        this.state = 'falling';
        this.grid.applyGravity();
        await this.animator.waitForGrid();
        
        // 빈 공간 채우기
        this.state = 'refilling';
        this.grid.refill();
        await this.animator.waitForGrid();
        
        // 새로운 매치 확인
        const matches = this.matcher.findAllMatches();
        if (matches.length > 0) {
            await this.processMatches(matches);
        }
    }
    
    /**
     * 매치 처리
     */
    async processMatches(matches) {
        while (matches.length > 0) {
            this.state = 'matching';
            this.combo++;
            
            // 점수 계산
            let points = 0;
            for (const match of matches) {
                points += this.calculatePoints(match);
                
                // 특수 타일 생성 확인
                if (match.tiles.length === 4) {
                    this.createSpecialTile(match, 'bomb');
                } else if (match.tiles.length >= 5) {
                    this.createSpecialTile(match, 'rainbow');
                }
            }
            
            this.addScore(points);
            this.soundManager.play(this.combo > 1 ? 'combo' : 'match');
            
            // 콤보 표시
            if (this.combo > 1) {
                this.showCombo(this.combo);
            }
            
            // 매치 애니메이션
            await this.animator.animateMatches(matches);
            
            // 타일 제거
            this.grid.removeMatches(matches);
            
            // 중력 적용
            this.state = 'falling';
            this.grid.applyGravity();
            await this.animator.waitForGrid();
            
            // 빈 공간 채우기
            this.state = 'refilling';
            this.grid.refill();
            await this.animator.waitForGrid();
            
            // 새로운 매치 확인
            matches = this.matcher.findAllMatches();
        }
    }
    
    /**
     * 점수 계산
     */
    calculatePoints(match) {
        const basePoints = 10;
        const lengthBonus = (match.tiles.length - 3) * 5;
        const comboMultiplier = this.combo;
        return (basePoints + lengthBonus) * comboMultiplier;
    }
    
    /**
     * 점수 추가
     */
    addScore(points) {
        this.score += points;
        this.updateScoreDisplay();
    }
    
    /**
     * 점수 표시 업데이트
     */
    updateScoreDisplay() {
        const scoreElement = document.getElementById('score');
        if (scoreElement) {
            scoreElement.textContent = this.score.toLocaleString();
        }
    }
    
    /**
     * 콤보 표시
     */
    showCombo(combo) {
        const comboElement = document.querySelector('.combo-display');
        if (comboElement) {
            const comboText = typeof i18n !== 'undefined' ? i18n.t('game.combo') : 'COMBO!';
            comboElement.textContent = `${combo}x ${comboText}`;
            comboElement.classList.add('show');
            setTimeout(() => comboElement.classList.remove('show'), 1000);
        }
    }
    
    /**
     * 특수 타일 생성
     */
    createSpecialTile(match, type) {
        // 매치 중앙에 특수 타일 생성
        const centerIndex = Math.floor(match.tiles.length / 2);
        const centerTile = match.tiles[centerIndex];
        centerTile.makeSpecial(type);
        
        // 매치 목록에서 제외 (제거하지 않음)
        match.tiles = match.tiles.filter(t => t !== centerTile);
        
        this.soundManager.play(type);
    }
    
    /**
     * 게임 루프
     */
    gameLoop() {
        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
    
    /**
     * 업데이트
     */
    update() {
        this.grid.update();
        this.animator.update();
    }
    
    /**
     * 렌더링
     */
    render() {
        if (this.boardImage) {
            this.ctx.drawImage(this.boardImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = '#1a1a2e';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        // 그리드 배경
        this.renderGridBackground();
        
        this.grid.forEach((tile) => {
            this.renderTile(tile);
        });
        
        // 애니메이션 효과 렌더링
        this.animator.render(this.ctx);
    }
    
    /**
     * 그리드 배경 렌더링
     */
    renderGridBackground() {
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const x = col * this.tileSize;
                const y = row * this.tileSize;
                
                // 체커보드 패턴
                this.ctx.fillStyle = (row + col) % 2 === 0 
                    ? 'rgba(255, 255, 255, 0.05)' 
                    : 'rgba(255, 255, 255, 0.02)';
                this.ctx.fillRect(x, y, this.tileSize, this.tileSize);
            }
        }
    }
    
    /**
     * 타일 렌더링
     */
    renderTile(tile) {
        const size = this.tileSize * 0.85 * tile.scale;
        const x = tile.x - size / 2;
        const y = tile.y - size / 2;
        
        this.ctx.globalAlpha = tile.alpha;
        
        // 이미지가 있으면 이미지 사용, 없으면 색상
        const imgKey = tile.isSpecial ? tile.specialType : 'tile' + tile.type;
        const img = this.images[imgKey];
        
        if (img) {
            this.ctx.drawImage(img, x, y, size, size);
        } else {
            // 폴백: 색상으로 그리기
            this.renderTileFallback(tile, x, y, size);
        }
        
        // 선택 표시
        if (tile.selected) {
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(x - 2, y - 2, size + 4, size + 4);
        }
        
        this.ctx.globalAlpha = 1;
    }
    
    /**
     * 타일 폴백 렌더링 (이미지 없을 때)
     */
    renderTileFallback(tile, x, y, size) {
        const colors = [
            '#ff6b6b',  // 빨강
            '#4ecdc4',  // 청록
            '#45b7d1',  // 파랑
            '#96ceb4',  // 초록
            '#ffeaa7',  // 노랑
            '#dfe6e9'   // 흰색
        ];
        
        if (tile.type === Tile.TYPES.BOMB) {
            this.ctx.fillStyle = '#2d3436';
        } else if (tile.type === Tile.TYPES.RAINBOW) {
            // 무지개 그라데이션
            const gradient = this.ctx.createLinearGradient(x, y, x + size, y + size);
            gradient.addColorStop(0, '#ff6b6b');
            gradient.addColorStop(0.2, '#ffeaa7');
            gradient.addColorStop(0.4, '#96ceb4');
            gradient.addColorStop(0.6, '#45b7d1');
            gradient.addColorStop(0.8, '#a29bfe');
            gradient.addColorStop(1, '#fd79a8');
            this.ctx.fillStyle = gradient;
        } else {
            this.ctx.fillStyle = colors[tile.type] || '#888';
        }
        
        // 둥근 사각형
        const radius = size * 0.2;
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, size, size, radius);
        this.ctx.fill();
        
        // 특수 타일 표시
        if (tile.isSpecial) {
            this.ctx.fillStyle = '#fff';
            this.ctx.font = (size * 0.5) + 'px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(
                tile.specialType === 'bomb' ? '💣' : '🌈',
                x + size / 2,
                y + size / 2
            );
        }
    }
    
    /**
     * 게임 리셋
     */
    reset() {
        this.score = 0;
        this.combo = 0;
        this.state = 'idle';
        this.dragStartTile = null;
        this.isDragging = false;
        this.grid.init();
        this.updateScoreDisplay();
        this.startTimer();
    }
    
    /**
     * 사운드 토글
     */
    toggleSound() {
        this.soundManager.toggle();
        return this.soundManager.enabled;
    }
}

// 모듈 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Game;
}
