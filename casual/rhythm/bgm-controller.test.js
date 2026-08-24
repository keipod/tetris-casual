#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "bgm-controller.js"), "utf8");
const sandbox = { console, Audio: undefined };
vm.runInNewContext(src, sandbox);
const { createBgmController, computeGameEndMs } = sandbox.RhythmBgm;

class FakeAudio {
  constructor(url) {
    this.src = url;
    this.currentTime = 0;
    this.paused = true;
    this.volume = 1;
    this.muted = false;
    this.readyState = 4;
    this.loop = false;
    this.preload = "auto";
    this._playCalls = 0;
    this._pauseCalls = 0;
    this._listeners = {};
  }
  addEventListener(type, fn) {
    (this._listeners[type] || (this._listeners[type] = [])).push(fn);
  }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  }
  load() {}
  play() {
    this._playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this._pauseCalls += 1;
    this.paused = true;
  }
}

function testComputeGameEndMs() {
  // Must not truncate a 75s song down to lastNote+2.2s when last note is early.
  // Old bug: Math.min(durationMs, lastNote + 2200)
  const end = computeGameEndMs(75000, 10000);
  assert.strictEqual(end, 75000, "full duration must be kept when longer than lastNote+grace");
  assert.ok(end > 12200, "must not use Math.min truncation");
  assert.strictEqual(computeGameEndMs(75000, 74582), 76782);
}

async function testMissDoesNotStopBgm() {
  const bgm = createBgmController({ AudioCtor: FakeAudio });
  bgm.attach("assets/bgm/berry-bounce.mp3");
  const ok = await bgm.start(0, 0.85);
  assert.strictEqual(ok, true);
  const el = bgm.getElement();
  assert.strictEqual(el.paused, false);
  const playsBefore = el._playCalls;
  const pausesBefore = el._pauseCalls;

  bgm.onMiss();
  bgm.onMiss();

  assert.strictEqual(el.paused, false, "miss must leave BGM playing");
  assert.strictEqual(el._pauseCalls, pausesBefore, "miss must not pause BGM");
  assert.strictEqual(el._playCalls, playsBefore, "miss must not restart BGM");
  assert.ok(bgm.songTimeMs() !== null, "song clock stays available while playing");
}

async function testPrimeThenStartKeepsElement() {
  const bgm = createBgmController({ AudioCtor: FakeAudio });
  bgm.prime("assets/bgm/spark-waltz.mp3");
  await new Promise((r) => setTimeout(r, 0));
  const first = bgm.getElement();
  bgm.attach("assets/bgm/spark-waltz.mp3");
  assert.strictEqual(bgm.getElement(), first, "same URL reuses primed element");
  await bgm.start(0, 0.8);
  assert.strictEqual(first.paused, false);
  assert.strictEqual(first.muted, false);
}

async function main() {
  testComputeGameEndMs();
  await testMissDoesNotStopBgm();
  await testPrimeThenStartKeepsElement();
  console.log("ok — bgm-controller tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
