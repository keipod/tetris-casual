/**
 * Grid.js - 8x8 그리드 관리 클래스
 */
class Grid {
    constructor(rows = 8, cols = 8, tileSize = 64) {
        this.rows = rows;
        this.cols = cols;
        this.tileSize = tileSize;
        this.tiles = [];
        
        // 그리드 오프셋 (캔버스 내 위치)
        this.offsetX = 0;
        this.offsetY = 0;
        
        // 선택된 타일
        this.selectedTile = null;
    }
    
    /**
     * 그리드 초기화 (매치 없이 생성)
     */
    init() {
        this.tiles = [];
        
        for (let row = 0; row < this.rows; row++) {
            this.tiles[row] = [];
            for (let col = 0; col < this.cols; col++) {
                let type;
                do {
                    type = this.getRandomType();
                } while (this.wouldMatch(row, col, type));
                
                const tile = new Tile(type, row, col);
                this.setTilePosition(tile);
                this.tiles[row][col] = tile;
            }
        }
    }
    
    /**
     * 랜덤 타일 타입 반환
     */
    getRandomType() {
        return Math.floor(Math.random() * Tile.TYPES.NORMAL_COUNT);
    }
    
    /**
     * 해당 위치에 타입을 놓으면 매치가 되는지 확인
     */
    wouldMatch(row, col, type) {
        // 왼쪽 2개 확인 (가로 매치)
        if (col >= 2) {
            if (this.tiles[row][col - 1]?.type === type &&
                this.tiles[row][col - 2]?.type === type) {
                return true;
            }
        }
        
        // 위쪽 2개 확인 (세로 매치)
        if (row >= 2) {
            if (this.tiles[row - 1]?.[col]?.type === type &&
                this.tiles[row - 2]?.[col]?.type === type) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 타일의 캔버스 위치 설정
     */
    setTilePosition(tile) {
        const x = this.offsetX + tile.col * this.tileSize + this.tileSize / 2;
        const y = this.offsetY + tile.row * this.tileSize + this.tileSize / 2;
        tile.setPosition(x, y);
    }
    
    /**
     * 타일 가져오기
     */
    getTile(row, col) {
        if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
            return null;
        }
        return this.tiles[row]?.[col] || null;
    }
    
    /**
     * 타일 설정
     */
    setTile(row, col, tile) {
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            this.tiles[row][col] = tile;
            if (tile) {
                tile.row = row;
                tile.col = col;
            }
        }
    }
    
    /**
     * 두 타일 교환
     */
    swap(tile1, tile2) {
        const row1 = tile1.row, col1 = tile1.col;
        const row2 = tile2.row, col2 = tile2.col;
        
        // 배열에서 교환
        this.tiles[row1][col1] = tile2;
        this.tiles[row2][col2] = tile1;
        
        // 타일 위치 정보 업데이트
        tile1.row = row2;
        tile1.col = col2;
        tile2.row = row1;
        tile2.col = col1;
        
        // 목표 위치 업데이트 (애니메이션용)
        this.setTileTarget(tile1);
        this.setTileTarget(tile2);
    }
    
    /**
     * 타일의 목표 위치 설정
     */
    setTileTarget(tile) {
        const x = this.offsetX + tile.col * this.tileSize + this.tileSize / 2;
        const y = this.offsetY + tile.row * this.tileSize + this.tileSize / 2;
        tile.setTarget(x, y);
    }
    
    /**
     * 캔버스 좌표로 타일 찾기
     */
    getTileAt(canvasX, canvasY) {
        const col = Math.floor((canvasX - this.offsetX) / this.tileSize);
        const row = Math.floor((canvasY - this.offsetY) / this.tileSize);
        return this.getTile(row, col);
    }
    
    /**
     * 두 타일이 인접한지 확인
     */
    areAdjacent(tile1, tile2) {
        const rowDiff = Math.abs(tile1.row - tile2.row);
        const colDiff = Math.abs(tile1.col - tile2.col);
        return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
    }
    
    /**
     * 매치된 타일 제거 및 shift 계산
     */
    removeMatches(matches) {
        // 매치된 타일을 null로 표시
        for (const match of matches) {
            for (const tile of match.tiles) {
                this.tiles[tile.row][tile.col] = null;
            }
        }
        
        // 각 열에서 shift 계산
        for (let col = 0; col < this.cols; col++) {
            let shift = 0;
            for (let row = this.rows - 1; row >= 0; row--) {
                const tile = this.tiles[row][col];
                if (tile === null) {
                    shift++;
                } else if (shift > 0) {
                    tile.shift = shift;
                }
            }
        }
    }
    
    /**
     * 타일 낙하 적용
     */
    applyGravity() {
        for (let col = 0; col < this.cols; col++) {
            // 아래에서 위로 탐색
            for (let row = this.rows - 1; row >= 0; row--) {
                const tile = this.tiles[row][col];
                if (tile && tile.shift > 0) {
                    const newRow = row + tile.shift;
                    this.tiles[newRow][col] = tile;
                    this.tiles[row][col] = null;
                    tile.row = newRow;
                    tile.shift = 0;
                    this.setTileTarget(tile);
                }
            }
        }
    }
    
    /**
     * 빈 공간에 새 타일 채우기
     */
    refill() {
        const newTiles = [];
        
        for (let col = 0; col < this.cols; col++) {
            let emptyCount = 0;
            
            // 빈 공간 카운트
            for (let row = 0; row < this.rows; row++) {
                if (this.tiles[row][col] === null) {
                    emptyCount++;
                }
            }
            
            // 위에서부터 새 타일 생성
            for (let i = 0; i < emptyCount; i++) {
                const row = i;
                const type = this.getRandomType();
                const tile = new Tile(type, row, col);
                
                // 시작 위치 (화면 위)
                const startX = this.offsetX + col * this.tileSize + this.tileSize / 2;
                const startY = this.offsetY - (emptyCount - i) * this.tileSize;
                tile.setPosition(startX, startY);
                
                // 목표 위치
                this.setTileTarget(tile);
                
                this.tiles[row][col] = tile;
                newTiles.push(tile);
            }
        }
        
        return newTiles;
    }
    
    /**
     * 모든 타일 업데이트 (애니메이션)
     */
    update() {
        let allSettled = true;
        
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const tile = this.tiles[row][col];
                if (tile && !tile.update()) {
                    allSettled = false;
                }
            }
        }
        
        return allSettled;
    }
    
    /**
     * 모든 타일을 순회
     */
    forEach(callback) {
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const tile = this.tiles[row][col];
                if (tile) {
                    callback(tile, row, col);
                }
            }
        }
    }
}

// 모듈 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Grid;
}
