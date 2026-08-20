/**
 * Animator.js - 애니메이션 관리 클래스
 */
class Animator {
    constructor(game) {
        this.game = game;
        this.effects = [];
        this.isAnimating = false;
    }
    
    waitForGrid(timeout = 2000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const check = () => {
                const settled = this.game.grid.update();
                if (settled || Date.now() - startTime > timeout) {
                    resolve();
                } else {
                    requestAnimationFrame(check);
                }
            };
            check();
        });
    }
    
    animateMatches(matches) {
        return new Promise((resolve) => {
            const duration = 300;
            const startTime = Date.now();
            const tiles = [];
            
            for (const match of matches) {
                for (const tile of match.tiles) {
                    tiles.push(tile);
                    this.addMatchEffect(tile.x, tile.y, tile.type);
                }
            }
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                
                for (const tile of tiles) {
                    tile.scale = 1 - eased;
                    tile.alpha = 1 - eased;
                }
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    for (const tile of tiles) {
                        tile.scale = 1;
                        tile.alpha = 1;
                    }
                    resolve();
                }
            };
            animate();
        });
    }
    
    addMatchEffect(x, y, type) {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9'];
        const color = colors[type] || '#fff';
        
        for (let i = 0; i < 5; i++) {
            this.effects.push({
                type: 'particle',
                x: x, y: y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6 - 2,
                life: 1,
                color: color,
                size: Math.random() * 8 + 4
            });
        }
    }
    
    update() {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.life -= 0.03;
            if (effect.vx !== undefined) {
                effect.x += effect.vx;
                effect.vy += 0.2;
                effect.y += effect.vy;
            }
            if (effect.life <= 0) {
                this.effects.splice(i, 1);
            }
        }
    }
    
    render(ctx) {
        for (const effect of this.effects) {
            ctx.save();
            ctx.globalAlpha = effect.life;
            
            if (effect.type === 'particle') {
                ctx.fillStyle = effect.color;
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.size * effect.life, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.restore();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Animator;
}
