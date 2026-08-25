/** Three.js battle arena: classic anime framing, lunge attacks, impact FX.
 * Three.js is loaded dynamically so battle still runs in 2D if vendor/three is missing.
 */

let THREE = null;

async function ensureThree() {
  if (THREE) return true;
  try {
    THREE = await import("three");
    return true;
  } catch (err) {
    console.warn("[battle3d] three.js unavailable, using 2D fallback", err);
    THREE = null;
    return false;
  }
}

const TYPE_HEX = {
  normal: 0xa8a878, fire: 0xf08030, water: 0x6890f0, grass: 0x78c850, electric: 0xf8d030,
  ice: 0x98d8d8, fighting: 0xc03028, poison: 0xa040a0, ground: 0xe0c068, flying: 0xa890f0,
  psychic: 0xf85888, bug: 0xa8b820, rock: 0xb8a038, ghost: 0x705898, dragon: 0x7038f8,
  dark: 0x705848, steel: 0xb8b8d0, fairy: 0xee99ac,
};

export class Battle3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.use3d = false;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.wildSpr = null;
    this.allySpr = null;
    this.trainerSpr = null;
    this.ground = null;
    this.raf = 0;
    this.t0 = performance.now();
    this.images = {};
    this.shake = 0;
    this.flash = 0;
    this.flashColor = 0xffffff;
    this.fx = []; // { mesh, life, max, vel }
    this.attack = null; // active lunge tween
    this.baseCam = { x: 0, y: 4.4, z: 7.4 };
  }

  async loadImages(paths) {
    const entries = await Promise.all(
      Object.entries(paths).map(async ([key, src]) => {
        if (!src) return [key, null];
        try {
          const img = await loadImage(src);
          return [key, img];
        } catch {
          return [key, null];
        }
      }),
    );
    this.images = Object.fromEntries(entries);
  }

  async start() {
    this.use3d = await this.tryWebGL();
    this.resize();
    if (this.use3d) this.buildScene();
    this.loop();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.clearFx();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.scene = null;
    this.camera = null;
    this.wildSpr = null;
    this.allySpr = null;
    this.trainerSpr = null;
  }

  async tryWebGL() {
    if (!(await ensureThree())) return false;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: false,
      });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setClearColor(0x7eb8e8, 1);
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog(0x7eb8e8, 12, 32);
      this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 60);
      this.scene.add(new THREE.HemisphereLight(0xfff2d8, 0x5a8a48, 1.15));
      const sun = new THREE.DirectionalLight(0xffe6c0, 0.7);
      sun.position.set(5, 12, 3);
      this.scene.add(sun);
      return true;
    } catch (err) {
      console.warn("[battle3d] WebGL init failed", err);
      this.renderer = null;
      this.use3d = false;
      return false;
    }
  }

  texFrom(img) {
    if (!img || !this.use3d) return null;
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  makeSprite(img, color, w, h) {
    const mat = img
      ? new THREE.SpriteMaterial({ map: this.texFrom(img), transparent: true, depthWrite: false })
      : new THREE.SpriteMaterial({ color, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(w, h, 1);
    spr.center.set(0.5, 0.05);
    spr.userData.home = new THREE.Vector3();
    spr.userData.baseScale = { w, h };
    return spr;
  }

  buildScene() {
    const grass = this.texFrom(this.images.grass) || this.texFrom(this.images.meadow);
    if (grass) {
      grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
      grass.repeat.set(5, 4);
    }
    const geo = new THREE.PlaneGeometry(20, 16);
    geo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ color: grass ? 0xffffff : 0x6aa04a, map: grass }),
    );
    this.scene.add(this.ground);

    const meadow = this.texFrom(this.images.meadow);
    if (meadow) {
      const bg = new THREE.Mesh(
        new THREE.PlaneGeometry(26, 12),
        new THREE.MeshBasicMaterial({ map: meadow, depthWrite: false }),
      );
      bg.position.set(0, 5, -9);
      this.scene.add(bg);
    }

    // Classic Pokémon framing: wild far-right, ally near-left (back sprite)
    this.wildSpr = this.makeSprite(this.images.wild, 0xf0d060, 2.6, 2.6);
    this.wildSpr.position.set(2.8, 0, -3.4);
    this.wildSpr.userData.home.copy(this.wildSpr.position);
    this.scene.add(this.wildSpr);

    this.allySpr = this.makeSprite(this.images.ally || this.images.trainer, 0x4a7ad0, 2.5, 2.5);
    this.allySpr.position.set(-2.6, 0, 2.4);
    this.allySpr.userData.home.copy(this.allySpr.position);
    this.scene.add(this.allySpr);

    if (this.images.trainer && this.images.ally) {
      this.trainerSpr = this.makeSprite(this.images.trainer, 0x5080d0, 1.4, 1.7);
      this.trainerSpr.position.set(-4.2, 0, 3.4);
      this.trainerSpr.material.opacity = 0.85;
      this.scene.add(this.trainerSpr);
    }

    this.camera.position.set(this.baseCam.x, this.baseCam.y, this.baseCam.z);
    this.camera.lookAt(0.2, 1.0, -0.8);
  }

  setFighters({ wildImg, allyImg, trainerImg }) {
    if (wildImg) this.images.wild = wildImg;
    if (allyImg) this.images.ally = allyImg;
    if (trainerImg) this.images.trainer = trainerImg;
    if (!this.use3d || !this.scene) return;
    if (this.wildSpr) this.scene.remove(this.wildSpr);
    if (this.allySpr) this.scene.remove(this.allySpr);
    if (this.trainerSpr) this.scene.remove(this.trainerSpr);
    this.wildSpr = this.makeSprite(this.images.wild, 0xf0d060, 2.6, 2.6);
    this.wildSpr.position.set(2.8, 0, -3.4);
    this.wildSpr.userData.home.copy(this.wildSpr.position);
    this.scene.add(this.wildSpr);
    this.allySpr = this.makeSprite(this.images.ally || this.images.trainer, 0x4a7ad0, 2.5, 2.5);
    this.allySpr.position.set(-2.6, 0, 2.4);
    this.allySpr.userData.home.copy(this.allySpr.position);
    this.scene.add(this.allySpr);
  }

  clearFx() {
    for (const f of this.fx) {
      this.scene?.remove(f.mesh);
      f.mesh.material?.dispose?.();
      f.mesh.geometry?.dispose?.();
    }
    this.fx = [];
  }

  spawnBurst(pos, color, count = 14) {
    if (!this.use3d || !this.scene) return;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.06 + Math.random() * 0.08, 6, 6);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4.5,
        Math.random() * 3.2 + 0.6,
        (Math.random() - 0.5) * 4.5,
      );
      this.scene.add(mesh);
      this.fx.push({ mesh, life: 0, max: 0.35 + Math.random() * 0.25, vel });
    }
  }

  /**
   * Anime-style lunge attack.
   * @param {"ally"|"wild"} who
   * @param {string} typeKey
   * @returns {Promise<void>}
   */
  playAttack(who = "ally", typeKey = "normal") {
    return new Promise((resolve) => {
      const spr = who === "ally" ? this.allySpr : this.wildSpr;
      const target = who === "ally" ? this.wildSpr : this.allySpr;
      if (!spr || !this.use3d) {
        this.hitFlash(who === "ally" ? "wild" : "ally");
        setTimeout(resolve, 280);
        return;
      }
      const color = TYPE_HEX[typeKey] || 0xffffff;
      const home = spr.userData.home.clone();
      const aim = target ? target.position.clone() : home.clone();
      const mid = home.clone().lerp(aim, 0.72);
      mid.y += 0.35;
      this.attack = {
        spr,
        home,
        mid,
        phase: 0,
        t0: performance.now(),
        color,
        targetWho: who === "ally" ? "wild" : "ally",
        done: resolve,
      };
    });
  }

  hitFlash(who = "wild") {
    const spr = who === "wild" ? this.wildSpr : who === "ally" ? this.allySpr : this.trainerSpr;
    if (!spr) return;
    const mat = spr.material;
    const base = mat.opacity;
    mat.opacity = 0.2;
    mat.color?.setHex?.(0xffffff);
    setTimeout(() => { mat.opacity = base; }, 70);
    setTimeout(() => { mat.opacity = 0.35; }, 120);
    setTimeout(() => { mat.opacity = base; }, 180);
    this.shake = Math.max(this.shake, 0.55);
    this.flash = 0.55;
    this.flashColor = 0xffffff;
    if (spr.position) this.spawnBurst(spr.position.clone().add(new THREE.Vector3(0, 1.1, 0)), 0xfff0a0, 16);
  }

  impact(who = "wild", typeKey = "normal") {
    this.hitFlash(who);
    this.shake = Math.max(this.shake, 0.85);
    this.flash = 0.75;
    this.flashColor = TYPE_HEX[typeKey] || 0xffffff;
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || this.canvas.clientWidth || 360;
    const h = parent?.clientHeight || this.canvas.clientHeight || 480;
    this.canvas.width = w * devicePixelRatio;
    this.canvas.height = h * devicePixelRatio;
    if (this.use3d && this.renderer && this.camera) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
  }

  updateAttack(now) {
    const a = this.attack;
    if (!a) return;
    const bw = a.spr.userData.baseScale?.w || 2.5;
    const bh = a.spr.userData.baseScale?.h || 2.5;
    const u = Math.min(1, (now - a.t0) / 420);
    if (u < 0.45) {
      const t = u / 0.45;
      const e = t * t;
      a.spr.position.lerpVectors(a.home, a.mid, e);
      const s = 1 + e * 0.18;
      a.spr.scale.set(bw * s, bh * s, 1);
    } else if (u < 0.55) {
      if (a.phase === 0) {
        a.phase = 1;
        this.impact(a.targetWho, Object.keys(TYPE_HEX).find((k) => TYPE_HEX[k] === a.color) || "normal");
      }
    } else {
      const t = (u - 0.55) / 0.45;
      const e = 1 - (1 - t) * (1 - t);
      a.spr.position.lerpVectors(a.mid, a.home, e);
      const s = 1.18 - e * 0.18;
      a.spr.scale.set(bw * s, bh * s, 1);
      if (u >= 1) {
        a.spr.position.copy(a.home);
        a.spr.scale.set(bw, bh, 1);
        const done = a.done;
        this.attack = null;
        done?.();
      }
    }
  }

  loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const t = (now - this.t0) / 1000;
    const dt = 1 / 60;

    if (this.use3d && this.renderer && this.scene && this.camera) {
      this.updateAttack(now);

      if (this.wildSpr && !this.attack) {
        this.wildSpr.position.y = this.wildSpr.userData.home.y + Math.sin(t * 2.2) * 0.05;
      }
      if (this.allySpr && (!this.attack || this.attack.spr !== this.allySpr)) {
        this.allySpr.position.y = this.allySpr.userData.home.y + Math.sin(t * 1.8 + 1) * 0.04;
      }

      // particles
      for (let i = this.fx.length - 1; i >= 0; i--) {
        const f = this.fx[i];
        f.life += dt;
        f.mesh.position.addScaledVector(f.vel, dt);
        f.vel.y -= 6 * dt;
        f.mesh.material.opacity = Math.max(0, 1 - f.life / f.max);
        f.mesh.scale.setScalar(Math.max(0.1, 1 - f.life / f.max));
        if (f.life >= f.max) {
          this.scene.remove(f.mesh);
          f.mesh.geometry.dispose();
          f.mesh.material.dispose();
          this.fx.splice(i, 1);
        }
      }

      this.shake *= 0.86;
      this.flash *= 0.88;
      const sx = (Math.random() - 0.5) * this.shake;
      const sy = (Math.random() - 0.5) * this.shake * 0.6;
      this.camera.position.set(
        this.baseCam.x + Math.sin(t * 0.22) * 0.12 + sx,
        this.baseCam.y + sy,
        this.baseCam.z,
      );
      this.camera.lookAt(0.2, 1.0, -0.8);

      this.renderer.render(this.scene, this.camera);

      // 2d flash overlay on canvas
      if (this.flash > 0.04) {
        const ctx = this.canvas.getContext("2d");
        // WebGL owns canvas — skip 2d. Use DOM flash instead via callback.
      }
    } else {
      this.drawFallback(t);
    }
  };

  /** Expose flash amount for DOM overlay. */
  getFlash() {
    return this.flash;
  }

  getFlashCss() {
    const c = this.flashColor;
    const r = (c >> 16) & 255;
    const g = (c >> 8) & 255;
    const b = c & 255;
    return `rgba(${r},${g},${b},${Math.min(0.55, this.flash * 0.7)})`;
  }

  drawFallback(t) {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0, "#8ec8f0");
    sky.addColorStop(1, "#c8e8a8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#5a9a40";
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.92, w * 0.7, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    const bob = Math.sin(t * 2) * 6;
    const shakeX = (Math.random() - 0.5) * this.shake * 20;
    drawImg(ctx, this.images.wild, w * 0.58 + shakeX, h * 0.22 + bob, w * 0.3, w * 0.3);
    drawImg(ctx, this.images.ally || this.images.trainer, w * 0.08 + shakeX, h * 0.48, w * 0.34, w * 0.34);
    this.shake *= 0.86;
    this.flash *= 0.88;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // crossOrigin only for remote CDN sprites — same-origin assets often lack ACAO
    if (/^https?:\/\//i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawImg(ctx, img, x, y, w, h) {
  if (img) ctx.drawImage(img, x, y, w, h);
  else {
    ctx.fillStyle = "#ddd";
    ctx.fillRect(x, y, w, h);
  }
}
