/*! CasualSafeStorage — localStorage 가용성 검사 + no-op 폴백 제공
 *  사용법: const store = CasualSafeStorage.get(); store.setItem(key, val);
 *  게임 페이지는 <script src="../assets/safe-storage.js"></script> 로 로드합니다. */
(function (root) {
  "use strict";
  var PROBE_KEY = "__casual_storage_probe";

  function detect() {
    try {
      localStorage.setItem(PROBE_KEY, "1");
      localStorage.removeItem(PROBE_KEY);
      return localStorage;
    } catch (_) {
      return { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
    }
  }

  var shared = null;

  root.CasualSafeStorage = {
    get: function () {
      if (!shared) shared = detect();
      return shared;
    }
  };
})(window);
