/**
 * SoundManager.js - 효과음·BGM
 */
class SoundManager {
    constructor() {
        this.enabled = true;
        this.sounds = {};
        this.audioContext = null;
        this.bgm = null;
        this._unlocked = false;
        this.initAudioContext();
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    async load() {
        const names = ['select', 'swap', 'match', 'combo', 'bomb', 'rainbow'];
        await Promise.all(names.map((name) => this._loadClip(name, `../assets/audio/${name}.mp3`)));
        this.bgm = new Audio('../assets/audio/bgm.mp3');
        this.bgm.loop = true;
        this.bgm.volume = 0.28;
        this.bgm.preload = 'auto';
        this.bgm.addEventListener('error', () => {
            this.bgm = new Audio('../assets/audio/bgm.wav');
            this.bgm.loop = true;
            this.bgm.volume = 0.22;
            if (this._unlocked && this.enabled) this._syncBgm();
        }, { once: true });
        const unlock = () => {
            this.unlock();
            window.removeEventListener('pointerdown', unlock);
        };
        window.addEventListener('pointerdown', unlock, { once: true });
    }

    _loadClip(name, src) {
        return new Promise((resolve) => {
            const audio = new Audio(src);
            audio.preload = 'auto';
            audio.addEventListener('canplaythrough', () => {
                this.sounds[name] = audio;
                resolve();
            }, { once: true });
            audio.addEventListener('error', () => resolve(), { once: true });
            audio.load();
        });
    }

    unlock() {
        if (this._unlocked) return;
        this._unlocked = true;
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        this._syncBgm();
    }

    toggle() {
        this.enabled = !this.enabled;
        this._syncBgm();
        return this.enabled;
    }

    _syncBgm() {
        if (!this.bgm) return;
        if (this.enabled) {
            const play = this.bgm.play();
            if (play && typeof play.catch === 'function') play.catch(() => {});
        } else {
            this.bgm.pause();
        }
    }

    play(soundName) {
        if (!this.enabled) return;
        const clip = this.sounds[soundName];
        if (clip) {
            try {
                const node = clip.cloneNode();
                node.volume = 0.7;
                node.play();
            } catch (e) {
                /* ignore */
            }
            return;
        }
        if (!this.audioContext) return;
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        const soundConfig = this.getSoundConfig(soundName);
        oscillator.frequency.value = soundConfig.frequency;
        oscillator.type = soundConfig.type;
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + soundConfig.duration);
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + soundConfig.duration);
    }

    getSoundConfig(soundName) {
        const configs = {
            select: { frequency: 440, duration: 0.1, type: 'sine' },
            swap: { frequency: 523, duration: 0.15, type: 'sine' },
            match: { frequency: 659, duration: 0.2, type: 'sine' },
            combo: { frequency: 880, duration: 0.3, type: 'triangle' },
            bomb: { frequency: 150, duration: 0.4, type: 'sawtooth' },
            rainbow: { frequency: 1000, duration: 0.5, type: 'sine' }
        };
        return configs[soundName] || configs.select;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SoundManager;
}
