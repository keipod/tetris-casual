/*! CasualMobile — shared mobile hardening for casual games
 *  Fixes: long-press context menus / selection, drag-to-refresh,
 *  missing fullscreen (Android nav bar overlap), screen sleep mid-game.
 *  Depends on ../assets/no-select.css being linked (button styles live there).
 */
(function () {
  "use strict";
  if (window.__casualMobileHardening) return;
  window.__casualMobileHardening = true;

  var doc = document;
  var root = doc.documentElement;

  function isFormField(el) {
    while (el && el !== doc.body) {
      var tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }

  ["contextmenu", "selectstart"].forEach(function (type) {
    doc.addEventListener(type, function (e) {
      if (!isFormField(e.target)) e.preventDefault();
    });
  });
  doc.addEventListener("dragstart", function (e) {
    if (!isFormField(e.target)) e.preventDefault();
  });

  // Invariant: never cancel touches that could scroll something real.
  // no-select.css overscroll-behavior:none already blocks modern Chrome
  // pull-to-refresh; here we only catch engines where it does not apply,
  // so preventDefault fires only when neither root nor any ancestor of
  // the touch target can actually scroll.
  function scrollable(el) {
    var s = getComputedStyle(el);
    return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
  }
  function rootScrollable() {
    return root.scrollHeight > root.clientHeight + 1 || doc.body.scrollHeight > doc.body.clientHeight + 1;
  }
  function wouldScrollAnywhere(target) {
    if (rootScrollable()) return true;
    for (var n = target; n && n !== doc.body; n = n.parentElement) {
      if (scrollable(n)) return true;
    }
    return false;
  }
  window.addEventListener(
    "touchmove",
    function (e) {
      if (e.defaultPrevented) return;
      if (e.touches.length > 1) return;
      if (!wouldScrollAnywhere(e.target)) e.preventDefault();
    },
    { passive: false }
  );

  var fsBtn = null;
  function fsSupported() {
    return typeof root.requestFullscreen === "function";
  }
  function fsElement() {
    return doc.fullscreenElement;
  }
  function enterFs() {
    var p = root.requestFullscreen({ navigationUI: "hide" });
    if (p && typeof p.catch === "function") p.catch(function () {});
  }
  function toggleFs() {
    if (fsElement()) {
      var p = doc.exitFullscreen();
      if (p && typeof p.catch === "function") p.catch(function () {});
    } else {
      enterFs();
    }
  }

  // Contract: per-game override via <body data-mh-fs-pos="tr|tl|br|bl">.
  // Games occupy different corners, so probe for a corner whose 34x34
  // button footprint intersects no visible interactive element.
  var BTN_SIZE = 34;
  var BTN_INSET = 8;
  function cornerRect(corner) {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var top = corner.indexOf("t") === 0;
    var right = corner.indexOf("r") === 1;
    return {
      left: right ? w - BTN_INSET - BTN_SIZE : BTN_INSET,
      right: right ? w - BTN_INSET : BTN_INSET + BTN_SIZE,
      top: top ? BTN_INSET : h - BTN_INSET - BTN_SIZE,
      bottom: top ? BTN_INSET + BTN_SIZE : h - BTN_INSET,
    };
  }
  function cornerInteractive(corner) {
    var r = cornerRect(corner);
    var els = doc.querySelectorAll("button,a,select,input,label,[role=button]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (fsBtn && fsBtn.contains(el)) continue;
      var st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") continue;
      var b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (!(r.right < b.left || r.left > b.right || r.bottom < b.top || r.top > b.bottom)) return true;
    }
    return false;
  }
  function pickCorner(exclude) {
    var order = ["tr", "tl", "br", "bl"];
    var forced = doc.body.getAttribute("data-mh-fs-pos");
    if (forced && /^[tblr]{2}$/.test(forced)) order = [forced].concat(order.filter(function (c) { return c !== forced; }));
    if (exclude) order = order.filter(function (c) { return c !== exclude; });
    for (var i = 0; i < order.length; i++) {
      if (!cornerInteractive(order[i])) return order[i];
    }
    return exclude ? exclude : "tr";
  }
  function currentCorner() {
    var s = fsBtn.style;
    if (s.top !== "auto") return s.right !== "auto" ? "tr" : "tl";
    return s.right !== "auto" ? "br" : "bl";
  }
  function placeButton(corner) {
    fsBtn.style.top = "auto";
    fsBtn.style.left = "auto";
    fsBtn.style.right = "auto";
    fsBtn.style.bottom = "auto";
    var inset = "calc(env(safe-area-inset-%1, 0px) + 8px)";
    if (corner.indexOf("t") === 0) fsBtn.style.top = inset.replace("%1", "top");
    else fsBtn.style.bottom = inset.replace("%1", "bottom");
    if (corner.indexOf("r") === 1) fsBtn.style.right = inset.replace("%1", "right");
    else fsBtn.style.left = inset.replace("%1", "left");
  }
  function ensureButton() {
    if (!fsSupported() || fsBtn) return;
    fsBtn = doc.createElement("button");
    fsBtn.id = "mh-fs-btn";
    fsBtn.type = "button";
    fsBtn.setAttribute("aria-label", "전체화면 전환");
    fsBtn.textContent = "⛶";
    fsBtn.addEventListener("click", toggleFs);
    doc.body.appendChild(fsBtn);
    placeButton(pickCorner());
  }

  // Init-time corner picks are provisional: title overlays hide the real UI
  // (skyraid BOMB, tetris header icons), so relocate lazily once revealed.
  function coveringInteractive() {
    var r = fsBtn.getBoundingClientRect();
    var prevPe = fsBtn.style.pointerEvents;
    fsBtn.style.pointerEvents = "none";
    var el = doc.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    fsBtn.style.pointerEvents = prevPe;
    return !!(el && el.closest && el.closest("button,a,select,input,label,[role=button]"));
  }
  function relocateIfNeeded() {
    if (!fsBtn || !coveringInteractive()) return;
    placeButton(pickCorner(currentCorner()));
  }

  // Games size their canvas from window dims: refit after FS change.
  doc.addEventListener("fullscreenchange", function () {
    setTimeout(function () {
      window.dispatchEvent(new Event("resize"));
      requestWakeLock();
      relocateIfNeeded();
    }, 80);
  });

  // Contract: opt out per game via <body data-mh-no-auto-fs>.
  // Coarse pointers only - desktop stays manual via the button.
  var triedAuto = false;
  var relocateScheduled = false;
  function scheduleRelocate(e) {
    if (relocateScheduled || !fsBtn) return;
    if (e && fsBtn.contains(e.target)) return;
    relocateScheduled = true;
    [400, 1000, 2500].forEach(function (ms) {
      setTimeout(relocateIfNeeded, ms);
    });
  }
  window.addEventListener("pointerdown", scheduleRelocate, { capture: true });
  // .click() without a pointer (programmatic starts) fires no pointerdown.
  window.addEventListener("click", scheduleRelocate, { capture: true });
  window.addEventListener(
    "pointerdown",
    function () {
      if (triedAuto) return;
      triedAuto = true;
      if (!fsSupported() || fsElement()) return;
      if (doc.body.hasAttribute("data-mh-no-auto-fs")) return;
      if (!window.matchMedia("(pointer: coarse)").matches) return;
      enterFs();
    },
    { capture: true }
  );

  var wakeLock = null;
  function requestWakeLock() {
    if (!("wakeLock" in navigator) || wakeLock) return;
    navigator.wakeLock.request("screen").then(function (lock) {
      wakeLock = lock;
      lock.addEventListener("release", function () {
        wakeLock = null;
      });
    }).catch(function () {});
  }
  doc.addEventListener("visibilitychange", function () {
    if (doc.visibilityState === "visible") requestWakeLock();
  });

  function init() {
    ensureButton();
    requestWakeLock();
    if (!doc.querySelector('link[rel~="icon"]')) {
      var fav = doc.createElement("link");
      fav.rel = "icon";
      fav.href =
        "data:image/svg+xml," +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="90">🎮</text></svg>');
      doc.head.appendChild(fav);
    }
  }
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CasualMobile = {
    vibrate: function (pattern) {
      try {
        if (navigator.vibrate) return navigator.vibrate(pattern);
      } catch (_) {}
      return false;
    },
    toggleFullscreen: toggleFs,
    isFullscreen: function () {
      return !!fsElement();
    },
  };
})();
