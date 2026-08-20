/**
 * Tile.js - 개별 타일 클래스
 */
class Tile {
    constructor(type, row, col) {
        this.type = type;           // 타일 타입 (0-5: 일반, 6: 폭탄, 7: 무지개)
        this.row = row;             // 행 위치
        this.col = col;             // 열 위치
        
        // 렌더링 위치 (애니메이션용)
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.targetY = 0;
        
        // 애니메이션 상태
        this.scale = 1;
        this.alpha = 1;
        this.rotation = 0;
        
        // 특수 타일 플래그
        this.isSpecial = false;
        this.specialType = null;    // 'bomb' | 'rainbow'
        
        // 선택/매치 상태
        this.selected = false;
        this.matched = false;
        
        // shift 값 (낙하 애니메이션용)
        this.shift = 0;
    }
    
    /**
     * 타일을 특수 타일로 변환
     */
    makeSpecial(specialType) {
        this.isSpecial = true;
        this.specialType = specialType;
        
        if (specialType === 'bomb') {
            this.type = 6;
        } else if (specialType === 'rainbow') {
            this.type = 7;
        }
    }
    
    /**
     * 타일 위치 설정
     */
    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
    }
    
    /**
     * 목표 위치 설정 (애니메이션)
     */
    setTarget(x, y) {
        this.targetX = x;
        this.targetY = y;
    }
    
    /**
     * 위치 업데이트 (애니메이션 적용)
     */
    update(speed = 0.2) {
        // 부드러운 이동 (선형 보간)
        this.x += (this.targetX - this.x) * speed;
        this.y += (this.targetY - this.y) * speed;
        
        // 거의 도착하면 스냅
        if (Math.abs(this.targetX - this.x) < 0.5) this.x = this.targetX;
        if (Math.abs(this.targetY - this.y) < 0.5) this.y = this.targetY;
        
        return this.isAtTarget();
    }
    
    /**
     * 목표 위치에 도달했는지 확인
     */
    isAtTarget() {
        return this.x === this.targetX && this.y === this.targetY;
    }
    
    /**
     * 타일 복사
     */
    clone() {
        const tile = new Tile(this.type, this.row, this.col);
        tile.isSpecial = this.isSpecial;
        tile.specialType = this.specialType;
        return tile;
    }
    
    /**
     * 리셋
     */
    reset() {
        this.scale = 1;
        this.alpha = 1;
        this.rotation = 0;
        this.selected = false;
        this.matched = false;
        this.shift = 0;
    }
}

// 타일 타입 상수
Tile.TYPES = {
    NORMAL_COUNT: 6,    // 일반 타일 종류 수
    BOMB: 6,            // 폭탄 타입
    RAINBOW: 7          // 무지개 타입
};

// 모듈 내보내기 (ES6 모듈 또는 전역)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Tile;
}
