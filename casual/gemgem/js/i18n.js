/**
 * i18n.js - Internationalization System
 */

const translations = {
    en: {
        // Main page
        'main.title': 'GemGem',
        'main.subtitle': 'Match-3 Puzzle Game',
        'main.footer': 'Made with ❤️',
        
        // Themes
        'theme.animals.title': 'Animal Match',
        'theme.animals.desc': 'Cute animal friends',
        'theme.gems.title': 'Gem Crush',
        'theme.gems.desc': 'Sparkling gems',
        'theme.fruits.title': 'Fruit Pop',
        'theme.fruits.desc': 'Sweet fruits',
        
        // Game UI
        'game.score': 'Score',
        'game.timer': 'Time',
        'game.restart': 'Restart',
        'game.back': '← Menu',
        'game.combo': 'COMBO!',
        
        // Game messages
        'game.over.title': 'Game Over!',
        'game.over.message': 'Final Score: {score}',
        
        // Special tiles
        'special.bomb': 'Bomb',
        'special.rainbow': 'Rainbow',
        'special.bomb.desc': '(4 match) - Cross explosion',
        'special.rainbow.desc': '(5 match) - Clear all same color'
    },
    ko: {
        // Main page
        'main.title': 'GemGem',
        'main.subtitle': 'Match-3 퍼즐 게임',
        'main.footer': '❤️로 만듦',
        
        // Themes
        'theme.animals.title': 'Animal Match',
        'theme.animals.desc': '귀여운 동물 친구들',
        'theme.gems.title': 'Gem Crush',
        'theme.gems.desc': '반짝이는 보석들',
        'theme.fruits.title': 'Fruit Pop',
        'theme.fruits.desc': '달콤한 과일들',
        
        // Game UI
        'game.score': '점수',
        'game.timer': '시간',
        'game.restart': '다시 시작',
        'game.back': '← 메뉴로',
        'game.combo': '콤보!',
        
        // Game messages
        'game.over.title': '게임 종료!',
        'game.over.message': '최종 점수: {score}',
        
        // Special tiles
        'special.bomb': '폭탄',
        'special.rainbow': '무지개',
        'special.bomb.desc': '(4개 매치) - 십자 방향으로 폭발',
        'special.rainbow.desc': '(5개 매치) - 같은 색 전체 제거'
    }
};

class I18n {
    constructor() {
        this.currentLang = this.loadLanguage();
        this.defaultLang = 'en';
    }
    
    /**
     * Load language from localStorage or use default
     */
    loadLanguage() {
        const saved = localStorage.getItem('gemgem-language');
        return saved || 'en';
    }
    
    /**
     * Save language to localStorage
     */
    saveLanguage(lang) {
        localStorage.setItem('gemgem-language', lang);
    }
    
    /**
     * Set current language
     */
    setLanguage(lang) {
        if (translations[lang]) {
            this.currentLang = lang;
            this.saveLanguage(lang);
            this.updatePage();
        }
    }
    
    /**
     * Get translated text
     */
    t(key, params = {}) {
        const langData = translations[this.currentLang] || translations[this.defaultLang];
        let text = langData[key] || key;
        
        // Replace parameters like {score}
        Object.keys(params).forEach(param => {
            text = text.replace(`{${param}}`, params[param]);
        });
        
        return text;
    }
    
    /**
     * Update all translatable elements on page
     */
    updatePage() {
        // Update elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });
        
        // Update elements with data-i18n-placeholder attribute
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });
        
        // Update language selector buttons
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-lang') === this.currentLang) {
                btn.classList.add('active');
            }
        });
    }
    
    /**
     * Get current language
     */
    getCurrentLanguage() {
        return this.currentLang;
    }
}

// Global instance
const i18n = new I18n();

// Initialize on page load
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        i18n.updatePage();
    });
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18n;
}
