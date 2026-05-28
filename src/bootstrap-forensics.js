// bootstrap-forensics.js
// Lightweight startup instrumentation to detect timer/listener/RAF storms.
(function () {
  if (typeof window === 'undefined') return;
  if (window.__HX_BOOT_FORENSICS__) return;

  const originalSetInterval = window.setInterval.bind(window);
  const originalClearInterval = window.clearInterval.bind(window);
  const originalRAF = window.requestAnimationFrame.bind(window);
  const originalAddEventListener = EventTarget.prototype.addEventListener;

  const activeIntervals = new Set();
  const listenerMap = new Map();

  function getListenerKey(target, type) {
    const tag = target === window
      ? 'window'
      : target === document
        ? 'document'
        : (target && target.constructor && target.constructor.name) || 'unknown';
    return tag + ':' + String(type || 'unknown');
  }

  function bumpListener(target, type) {
    const key = getListenerKey(target, type);
    listenerMap.set(key, (listenerMap.get(key) || 0) + 1);
  }

  EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
    try { bumpListener(this, type); } catch (e) { /* ignore */ }
    return originalAddEventListener.call(this, type, listener, options);
  };

  window.setInterval = function patchedSetInterval(handler, timeout, ...args) {
    const id = originalSetInterval(handler, timeout, ...args);
    activeIntervals.add(id);
    return id;
  };

  window.clearInterval = function patchedClearInterval(id) {
    activeIntervals.delete(id);
    return originalClearInterval(id);
  };

  let rafCount = 0;
  window.requestAnimationFrame = function patchedRAF(cb) {
    rafCount += 1;
    return originalRAF(cb);
  };

  const longTasks = [];
  try {
    if (typeof PerformanceObserver !== 'undefined') {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push({
            startTime: Math.round(entry.startTime),
            duration: Math.round(entry.duration),
          });
          if (longTasks.length > 200) longTasks.shift();
        }
      });
      po.observe({ entryTypes: ['longtask'] });
    }
  } catch (e) {
    // Non-blocking.
  }

  function snapshot() {
    const listeners = {};
    for (const [k, v] of listenerMap.entries()) listeners[k] = v;
    return {
      activeIntervals: activeIntervals.size,
      activeRAF: rafCount,
      activeListeners: listeners,
      longTasks: longTasks.slice(-30),
      ts: Date.now(),
    };
  }

  window.__HX_BOOT_FORENSICS__ = {
    snapshot,
    activeIntervals,
    longTasks,
  };
})();
