/**
 * Matcher.js - 매치 감지 알고리즘
 */
class Matcher {
    constructor(grid) {
        this.grid = grid;
    }
    
    /**
     * 모든 매치 찾기
     */
    findAllMatches() {
        const horizontalMatches = this.findHorizontalMatches();
        const verticalMatches = this.findVerticalMatches();
        
        // 중복 제거 및 병합
        return this.mergeMatches([...horizontalMatches, ...verticalMatches]);
    }
    
    /**
     * 가로 매치 찾기
     */
    findHorizontalMatches() {
        const matches = [];
        
        for (let row = 0; row < this.grid.rows; row++) {
            let matchLength = 1;
            let matchType = -1;
            let matchStart = 0;
            
            for (let col = 0; col < this.grid.cols; col++) {
                const tile = this.grid.getTile(row, col);
                
                if (!tile || tile.type >= Tile.TYPES.BOMB) {
                    // 빈 타일이거나 특수 타일
                    if (matchLength >= 3) {
                        matches.push(this.createMatch(row, matchStart, matchLength, true, matchType));
                    }
                    matchLength = 1;
                    matchType = -1;
                    matchStart = col + 1;
                    continue;
                }
                
                if (tile.type === matchType) {
                    matchLength++;
                } else {
                    // 이전 매치 저장
                    if (matchLength >= 3) {
                        matches.push(this.createMatch(row, matchStart, matchLength, true, matchType));
                    }
                    matchLength = 1;
                    matchType = tile.type;
                    matchStart = col;
                }
            }
            
            // 마지막 매치 확인
            if (matchLength >= 3) {
                matches.push(this.createMatch(row, matchStart, matchLength, true, matchType));
            }
        }
        
        return matches;
    }
    
    /**
     * 세로 매치 찾기
     */
    findVerticalMatches() {
        const matches = [];
        
        for (let col = 0; col < this.grid.cols; col++) {
            let matchLength = 1;
            let matchType = -1;
            let matchStart = 0;
            
            for (let row = 0; row < this.grid.rows; row++) {
                const tile = this.grid.getTile(row, col);
                
                if (!tile || tile.type >= Tile.TYPES.BOMB) {
                    if (matchLength >= 3) {
                        matches.push(this.createMatch(matchStart, col, matchLength, false, matchType));
                    }
                    matchLength = 1;
                    matchType = -1;
                    matchStart = row + 1;
                    continue;
                }
                
                if (tile.type === matchType) {
                    matchLength++;
                } else {
                    if (matchLength >= 3) {
                        matches.push(this.createMatch(matchStart, col, matchLength, false, matchType));
                    }
                    matchLength = 1;
                    matchType = tile.type;
                    matchStart = row;
                }
            }
            
            if (matchLength >= 3) {
                matches.push(this.createMatch(matchStart, col, matchLength, false, matchType));
            }
        }
        
        return matches;
    }
    
    /**
     * 매치 객체 생성
     */
    createMatch(rowOrStart, colOrStart, length, horizontal, type) {
        const tiles = [];
        
        if (horizontal) {
            for (let i = 0; i < length; i++) {
                const tile = this.grid.getTile(rowOrStart, colOrStart + i);
                if (tile) {
                    tile.matched = true;
                    tiles.push(tile);
                }
            }
        } else {
            for (let i = 0; i < length; i++) {
                const tile = this.grid.getTile(rowOrStart + i, colOrStart);
                if (tile) {
                    tile.matched = true;
                    tiles.push(tile);
                }
            }
        }
        
        return {
            tiles,
            type,
            horizontal,
            length
        };
    }
    
    /**
     * 매치 병합 (교차점 처리)
     */
    mergeMatches(matches) {
        // 간단히 모든 매치 반환 (추후 교차점 최적화 가능)
        return matches;
    }
    
    /**
     * 특수 타일 활성화 시 영향받는 타일 찾기
     */
    findSpecialTileTargets(tile, swappedTile = null) {
        const targets = [];
        
        if (tile.specialType === 'bomb') {
            // 폭탄: 십자 모양 (가로 + 세로 한 줄)
            const row = tile.row;
            const col = tile.col;
            
            // 가로 줄 전체
            for (let c = 0; c < this.grid.cols; c++) {
                const t = this.grid.getTile(row, c);
                if (t && t !== tile) targets.push(t);
            }
            
            // 세로 줄 전체
            for (let r = 0; r < this.grid.rows; r++) {
                const t = this.grid.getTile(r, col);
                if (t && t !== tile && !targets.includes(t)) targets.push(t);
            }
        } else if (tile.specialType === 'rainbow') {
            // 무지개: 스왑한 타일과 같은 타입의 모든 타일 제거
            if (swappedTile && !swappedTile.isSpecial) {
                const targetType = swappedTile.type;
                for (let r = 0; r < this.grid.rows; r++) {
                    for (let c = 0; c < this.grid.cols; c++) {
                        const t = this.grid.getTile(r, c);
                        if (t && t.type === targetType && !t.isSpecial) {
                            targets.push(t);
                        }
                    }
                }
            }
        }
        
        return targets;
    }
    
    /**
     * 가능한 이동이 있는지 확인
     */
    hasPossibleMoves() {
        for (let row = 0; row < this.grid.rows; row++) {
            for (let col = 0; col < this.grid.cols; col++) {
                // 오른쪽으로 스왑 시도
                if (col < this.grid.cols - 1) {
                    if (this.wouldMatchAfterSwap(row, col, row, col + 1)) {
                        return true;
                    }
                }
                
                // 아래로 스왑 시도
                if (row < this.grid.rows - 1) {
                    if (this.wouldMatchAfterSwap(row, col, row + 1, col)) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
    
    /**
     * 스왑 후 매치가 되는지 확인 (실제 스왑하지 않음)
     */
    wouldMatchAfterSwap(row1, col1, row2, col2) {
        const tile1 = this.grid.getTile(row1, col1);
        const tile2 = this.grid.getTile(row2, col2);
        
        if (!tile1 || !tile2) return false;
        
        // 임시 스왑
        this.grid.tiles[row1][col1] = tile2;
        this.grid.tiles[row2][col2] = tile1;
        tile1.row = row2; tile1.col = col2;
        tile2.row = row1; tile2.col = col1;
        
        // 매치 확인
        const hasMatch = this.checkMatchAt(row1, col1) || this.checkMatchAt(row2, col2);
        
        // 되돌리기
        this.grid.tiles[row1][col1] = tile1;
        this.grid.tiles[row2][col2] = tile2;
        tile1.row = row1; tile1.col = col1;
        tile2.row = row2; tile2.col = col2;
        
        return hasMatch;
    }
    
    /**
     * 특정 위치에서 매치 확인
     */
    checkMatchAt(row, col) {
        const tile = this.grid.getTile(row, col);
        if (!tile) return false;
        
        const type = tile.type;
        
        // 가로 확인
        let hCount = 1;
        for (let c = col - 1; c >= 0 && this.grid.getTile(row, c)?.type === type; c--) hCount++;
        for (let c = col + 1; c < this.grid.cols && this.grid.getTile(row, c)?.type === type; c++) hCount++;
        if (hCount >= 3) return true;
        
        // 세로 확인
        let vCount = 1;
        for (let r = row - 1; r >= 0 && this.grid.getTile(r, col)?.type === type; r--) vCount++;
        for (let r = row + 1; r < this.grid.rows && this.grid.getTile(r, col)?.type === type; r++) vCount++;
        if (vCount >= 3) return true;
        
        return false;
    }
}

// 모듈 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Matcher;
}
