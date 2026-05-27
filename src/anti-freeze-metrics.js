/**
 * anti-freeze-metrics.js — Instrumentación ForeNSE Anti-Freeze
 * ─────────────────────────────────────────────────────────────────────────────
 * FASE 1: Instrumentación forense de runtime
 * 
 * Intercepta y monitorea:
 * - setInterval / clearInterval
 * - setTimeout / clearTimeout
 * - requestAnimationFrame / cancelAnimationFrame
 * - addEventListener / removeEventListener
 * - MutationObserver
 * - ResizeObserver
 * 
 * Detecta automáticamente:
 * - listeners duplicados
 * - intervals huérfanos
 * - RAF infinitos
 * - observer storms
 * - render storms
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function() {
  'use strict';
  
  if (typeof window === 'undefined') return;
  
  // Singleton guard
  if (window.__HX_ANTI_FREEZE__) {
    console.warn('[anti-freeze] Already initialized, skipping');
    return;
  }
  
  const CAPACITY = {
    INTERVALS: 100,
    TIMEOUTS: 200,
    RAF: 100,
    LISTENERS: 500,
    OBSERVERS: 50,
    RENDER_HISTORY: 100,
    LONG_TASKS: 50
  };
  
  // Métricas centrales
  const metrics = {
    activeIntervals: new Map(),      // id -> { origin, created, count }
    activeTimeouts: new Map(),       // id -> { origin, created }
    activeRAF: new Map(),            // id -> { origin, created, lastFrame }
    activeListeners: new Map(),      // key -> [{ target, type, listener, origin, created }]
    activeObservers: {
      mutation: [],
      resize: [],
      intersection: []
    },
    renderCount: 0,
    renderHistory: [],               // { ts, duration, component }
    bootstrapCount: 0,
    memorySnapshots: [],
    longTasks: [],
    
    // Contadores acumulativos
    totals: {
      intervalsCreated: 0,
      intervalsCleared: 0,
      timeoutsCreated: 0,
      timeoutsCleared: 0,
      rafCreated: 0,
      rafCancelled: 0,
      listenersAdded: 0,
      listenersRemoved: 0,
      observersCreated: 0,
      observersDisconnected: 0
    },
    
    // Detección de anomalías
    anomalies: {
      duplicateListeners: [],
      orphanIntervals: [],
      infiniteRAF: [],
      observerStorms: [],
      renderStorms: []
    },
    
    initTs: Date.now()
  };
  
  // Helpers
  function getOrigin() {
    try {
      const err = new Error();
      const stack = err.stack || '';
      const match = stack.split('\n')[3]?.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      if (match) {
        return { fn: match[1], file: match[2], line: match[3], col: match[4] };
      }
      return { fn: 'anonymous', file: 'unknown', line: 0, col: 0 };
    } catch (e) {
      return { fn: 'unknown', file: 'unknown', line: 0, col: 0 };
    }
  }
  
  function safeJson(obj) {
    try { return JSON.stringify(obj); } catch (e) { return '{}'; }
  }
  
  function listenerKey(target, type) {
    const targetId = target?.id || target?.className?.split(' ')[0] || target?.tagName || 'unknown';
    return `${targetId}:${type}`;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // INTERCEPTACIÓN DE setInterval / clearInterval
  // ─────────────────────────────────────────────────────────────────────────
  
  const originalSetInterval = window.setInterval;
  const originalClearInterval = window.clearInterval;
  
  window.setInterval = function(fn, delay, ...args) {
    const id = originalSetInterval.call(window, fn, delay, ...args);
    const origin = getOrigin();
    
    metrics.activeIntervals.set(id, {
      origin: origin.fn + '@' + origin.file + ':' + origin.line,
      created: Date.now(),
      delay: delay,
      count: 0,
      args: args.length > 0 ? args.length : 0
    });
    
    metrics.totals.intervalsCreated++;
    
    // Alerta si hay demasiados intervals
    if (metrics.activeIntervals.size > 20) {
      console.warn('[anti-freeze] High interval count:', metrics.activeIntervals.size);
      metrics.anomalies.orphanIntervals.push({
        ts: Date.now(),
        count: metrics.activeIntervals.size,
        severity: 'warning'
      });
    }
    
    return id;
  };
  
  window.clearInterval = function(id) {
    const existed = metrics.activeIntervals.has(id);
    originalClearInterval.call(window, id);
    
    if (existed) {
      metrics.activeIntervals.delete(id);
      metrics.totals.intervalsCleared++;
    }
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // INTERCEPTACIÓN DE setTimeout / clearTimeout
  // ─────────────────────────────────────────────────────────────────────────
  
  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  
  window.setTimeout = function(fn, delay, ...args) {
    const id = originalSetTimeout.call(window, fn, delay, ...args);
    const origin = getOrigin();
    
    metrics.activeTimeouts.set(id, {
      origin: origin.fn + '@' + origin.file + ':' + origin.line,
      created: Date.now(),
      delay: delay
    });
    
    metrics.totals.timeoutsCreated++;
    
    // Cleanup automático de timeouts viejos
    if (metrics.activeTimeouts.size > CAPACITY.TIMEOUTS) {
      const now = Date.now();
      for (const [tid, data] of metrics.activeTimeouts.entries()) {
        if (now - data.created > 60000) {
          metrics.activeTimeouts.delete(tid);
        }
      }
    }
    
    return id;
  };
  
  window.clearTimeout = function(id) {
    const existed = metrics.activeTimeouts.has(id);
    originalClearTimeout.call(window, id);
    
    if (existed) {
      metrics.activeTimeouts.delete(id);
      metrics.totals.timeoutsCleared++;
    }
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // INTERCEPTACIÓN DE requestAnimationFrame
  // ─────────────────────────────────────────────────────────────────────────
  
  const originalRAF = window.requestAnimationFrame;
  const originalCancelRAF = window.cancelAnimationFrame;
  
  let rafCounter = 0;
  
  window.requestAnimationFrame = function(callback) {
    const id = originalRAF.call(window, callback);
    const origin = getOrigin();
    const rafId = ++rafCounter;
    
    metrics.activeRAF.set(id, {
      rafId: rafId,
      origin: origin.fn + '@' + origin.file + ':' + origin.line,
      created: Date.now(),
      lastFrame: Date.now(),
      frameCount: 0
    });
    
    metrics.totals.rafCreated++;
    
    // Wrap callback para tracking
    const wrappedCallback = function(ts) {
      const data = metrics.activeRAF.get(id);
      if (data) {
        data.lastFrame = Date.now();
        data.frameCount++;
        
        // Detectar RAF infinito (> 60 fps por más de 5 segundos)
        if (data.frameCount > 300 && (Date.now() - data.created) < 5000) {
          metrics.anomalies.infiniteRAF.push({
            ts: Date.now(),
            rafId: data.rafId,
            origin: data.origin,
            frameCount: data.frameCount,
            severity: 'critical'
          });
          console.error('[anti-freeze] Infinite RAF detected:', data.origin);
        }
      }
      return callback.call(this, ts);
    };
    
    // Re-schedule con callback wrapped
    originalRAF.call(window, wrappedCallback);
    
    return id;
  };
  
  window.cancelAnimationFrame = function(id) {
    const existed = metrics.activeRAF.has(id);
    originalCancelRAF.call(window, id);
    
    if (existed) {
      metrics.activeRAF.delete(id);
      metrics.totals.rafCancelled++;
    }
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // INTERCEPTACIÓN DE addEventListener / removeEventListener
  // ─────────────────────────────────────────────────────────────────────────
  
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
  
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    const origin = getOrigin();
    const key = listenerKey(this, type);
    
    // Check duplicados
    const existingListeners = metrics.activeListeners.get(key) || [];
    const isDuplicate = existingListeners.some(l => l.listener === listener);
    
    if (isDuplicate) {
      metrics.anomalies.duplicateListeners.push({
        ts: Date.now(),
        target: key,
        type: type,
        origin: origin.fn,
        severity: 'warning'
      });
      console.warn('[anti-freeze] Duplicate listener:', type, 'on', key);
    }
    
    originalAddEventListener.call(this, type, listener, options);
    
    const record = {
      target: this,
      type: type,
      listener: listener,
      origin: origin.fn + '@' + origin.file + ':' + origin.line,
      created: Date.now(),
      options: options
    };
    
    if (!metrics.activeListeners.has(key)) {
      metrics.activeListeners.set(key, []);
    }
    metrics.activeListeners.get(key).push(record);
    
    metrics.totals.listenersAdded++;
    
    // Alerta si hay demasiados listeners
    const totalListeners = Array.from(metrics.activeListeners.values()).reduce((sum, arr) => sum + arr.length, 0);
    if (totalListeners > 100) {
      console.warn('[anti-freeze] High listener count:', totalListeners);
    }
    
    return;
  };
  
  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    const key = listenerKey(this, type);
    const listeners = metrics.activeListeners.get(key) || [];
    
    originalRemoveEventListener.call(this, type, listener, options);
    
    const idx = listeners.findIndex(l => l.listener === listener);
    if (idx >= 0) {
      listeners.splice(idx, 1);
      if (listeners.length === 0) {
        metrics.activeListeners.delete(key);
      }
      metrics.totals.listenersRemoved++;
    }
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // INTERCEPTACIÓN DE MutationObserver
  // ─────────────────────────────────────────────────────────────────────────
  
  const OriginalMutationObserver = window.MutationObserver;
  
  window.MutationObserver = function(callback) {
    const origin = getOrigin();
    
    const wrappedCallback = function(mutations, observer) {
      // Detectar observer storm (> 50 mutations en 1 segundo)
      if (mutations.length > 50) {
        metrics.anomalies.observerStorms.push({
          ts: Date.now(),
          type: 'mutation',
          mutationCount: mutations.length,
          origin: origin.fn,
          severity: 'warning'
        });
      }
      return callback.call(this, mutations, observer);
    };
    
    const observer = new OriginalMutationObserver(wrappedCallback);
    
    metrics.activeObservers.mutation.push({
      observer: observer,
      origin: origin.fn + '@' + origin.file + ':' + origin.line,
      created: Date.now(),
      callbackCount: 0
    });
    
    metrics.totals.observersCreated++;
    
    // Override disconnect para cleanup tracking
    const originalDisconnect = observer.disconnect;
    observer.disconnect = function() {
      const idx = metrics.activeObservers.mutation.findIndex(o => o.observer === observer);
      if (idx >= 0) {
        metrics.activeObservers.mutation.splice(idx, 1);
        metrics.totals.observersDisconnected++;
      }
      return originalDisconnect.call(this);
    };
    
    // Override observe para tracking
    const originalObserve = observer.observe;
    observer.observe = function(target, options) {
      const lastRecord = metrics.activeObservers.mutation[metrics.activeObservers.mutation.length - 1];
      if (lastRecord && lastRecord.observer === observer) {
        lastRecord.target = target;
        lastRecord.options = options;
      }
      return originalObserve.call(this, target, options);
    };
    
    return observer;
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // INTERCEPTACIÓN DE ResizeObserver
  // ─────────────────────────────────────────────────────────────────────────
  
  const OriginalResizeObserver = window.ResizeObserver;
  
  if (OriginalResizeObserver) {
    window.ResizeObserver = function(callback) {
      const origin = getOrigin();
      
      const wrappedCallback = function(entries, observer) {
        // Detectar resize storm
        if (entries.length > 10) {
          metrics.anomalies.observerStorms.push({
            ts: Date.now(),
            type: 'resize',
            entryCount: entries.length,
            origin: origin.fn,
            severity: 'info'
          });
        }
        return callback.call(this, entries, observer);
      };
      
      const observer = new OriginalResizeObserver(wrappedCallback);
      
      metrics.activeObservers.resize.push({
        observer: observer,
        origin: origin.fn + '@' + origin.file + ':' + origin.line,
        created: Date.now()
      });
      
      metrics.totals.observersCreated++;
      
      const originalDisconnect = observer.disconnect;
      observer.disconnect = function() {
        const idx = metrics.activeObservers.resize.findIndex(o => o.observer === observer);
        if (idx >= 0) {
          metrics.activeObservers.resize.splice(idx, 1);
          metrics.totals.observersDisconnected++;
        }
        return originalDisconnect.call(this);
      };
      
      return observer;
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // MONITOREO DE RENDERS
  // ─────────────────────────────────────────────────────────────────────────
  
  function trackRender(component, duration) {
    metrics.renderCount++;
    const now = Date.now();
    
    metrics.renderHistory.push({
      ts: now,
      duration: duration || 0,
      component: component || 'unknown'
    });
    
    // Cap history
    if (metrics.renderHistory.length > CAPACITY.RENDER_HISTORY) {
      metrics.renderHistory.shift();
    }
    
    // Detectar render storm (> 20 renders en 1 segundo)
    const recentRenders = metrics.renderHistory.filter(r => now - r.ts < 1000);
    if (recentRenders.length > 20) {
      metrics.anomalies.renderStorms.push({
        ts: now,
        renderCount: recentRenders.length,
        avgDuration: recentRenders.reduce((s, r) => s + r.duration, 0) / recentRenders.length,
        severity: 'warning'
      });
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PERFORMANCE OBSERVER PARA LONG TASKS
  // ─────────────────────────────────────────────────────────────────────────
  
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          metrics.longTasks.push({
            ts: entry.startTime,
            duration: entry.duration,
            name: entry.name,
            attribution: entry.attribution?.[0]?.name || 'unknown'
          });
          
          // Cap long tasks
          if (metrics.longTasks.length > CAPACITY.LONG_TASKS) {
            metrics.longTasks.shift();
          }
          
          // Alerta para long tasks > 200ms
          if (entry.duration > 200) {
            console.warn('[anti-freeze] Long task detected:', Math.round(entry.duration) + 'ms');
          }
        });
      });
      
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // Long task observation not supported
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // MEMORY SNAPSHOTS (si está disponible performance.memory)
  // ─────────────────────────────────────────────────────────────────────────
  
  function takeMemorySnapshot() {
    const snapshot = {
      ts: Date.now(),
      usedJSHeapSize: performance.memory?.usedJSHeapSize || null,
      totalJSHeapSize: performance.memory?.totalJSHeapSize || null,
      jsHeapSizeLimit: performance.memory?.jsHeapSizeLimit || null
    };
    
    metrics.memorySnapshots.push(snapshot);
    
    // Cap snapshots
    if (metrics.memorySnapshots.length > 50) {
      metrics.memorySnapshots.shift();
    }
    
    return snapshot;
  }
  
  // Auto memory snapshot cada 10 segundos
  setInterval(takeMemorySnapshot, 10000);
  
  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────
  
  const AntiFreezeMetrics = {
    // Getters para métricas actuales
    getActiveIntervals() {
      return Array.from(metrics.activeIntervals.entries()).map(([id, data]) => ({
        id,
        ...data,
        age: Date.now() - data.created
      }));
    },
    
    getActiveTimeouts() {
      return Array.from(metrics.activeTimeouts.entries()).map(([id, data]) => ({
        id,
        ...data,
        age: Date.now() - data.created
      }));
    },
    
    getActiveRAF() {
      return Array.from(metrics.activeRAF.entries()).map(([id, data]) => ({
        id,
        rafId: data.rafId,
        ...data,
        age: Date.now() - data.created
      }));
    },
    
    getActiveListeners() {
      const result = [];
      for (const [key, listeners] of metrics.activeListeners.entries()) {
        listeners.forEach(l => {
          result.push({
            key,
            type: l.type,
            origin: l.origin,
            age: Date.now() - l.created
          });
        });
      }
      return result;
    },
    
    getActiveObservers() {
      return {
        mutation: metrics.activeObservers.mutation.map(o => ({
          origin: o.origin,
          age: Date.now() - o.created,
          callbackCount: o.callbackCount
        })),
        resize: metrics.activeObservers.resize.map(o => ({
          origin: o.origin,
          age: Date.now() - o.created
        }))
      };
    },
    
    getAnomalies() {
      return { ...metrics.anomalies };
    },
    
    getTotals() {
      return { ...metrics.totals };
    },
    
    getRenderStats() {
      const history = metrics.renderHistory;
      if (!history.length) return { count: 0, avgDuration: 0 };
      
      return {
        count: metrics.renderCount,
        avgDuration: history.reduce((s, r) => s + r.duration, 0) / history.length,
        recent: history.slice(-10)
      };
    },
    
    getLongTasks() {
      return [...metrics.longTasks];
    },
    
    getMemoryHistory() {
      return [...metrics.memorySnapshots];
    },
    
    // Snapshot completo para debugging
    getSnapshot() {
      return {
        uptime: Date.now() - metrics.initTs,
        activeIntervals: this.getActiveIntervals().length,
        activeTimeouts: this.getActiveTimeouts().length,
        activeRAF: this.getActiveRAF().length,
        activeListeners: this.getActiveListeners().length,
        activeObservers: {
          mutation: metrics.activeObservers.mutation.length,
          resize: metrics.activeObservers.resize.length
        },
        renderCount: metrics.renderCount,
        bootstrapCount: metrics.bootstrapCount,
        totals: { ...metrics.totals },
        anomalies: { ...metrics.anomalies },
        longTasks: metrics.longTasks.length,
        memorySnapshots: metrics.memorySnapshots.length
      };
    },
    
    // Utilidades
    trackRender,
    takeMemorySnapshot,
    
    incrementBootstrap() {
      metrics.bootstrapCount++;
    },
    
    // Cleanup y reporting
    printReport() {
      const snapshot = this.getSnapshot();
      console.group('[anti-freeze] Reporte de métricas');
      console.log('Uptime:', snapshot.uptime + 'ms');
      console.log('Active Intervals:', snapshot.activeIntervals);
      console.log('Active Timeouts:', snapshot.activeTimeouts);
      console.log('Active RAF:', snapshot.activeRAF);
      console.log('Active Listeners:', snapshot.activeListeners);
      console.log('Active Observers:', snapshot.activeObservers);
      console.log('Render Count:', snapshot.renderCount);
      console.log('Totals:', snapshot.totals);
      console.log('Anomalies:', snapshot.anomalies);
      console.log('Long Tasks:', snapshot.longTasks);
      console.groupEnd();
      return snapshot;
    },
    
    // Export para window global
    exportToGlobal() {
      window.__APP_METRICS__ = {
        getActiveIntervals: () => this.getActiveIntervals(),
        getActiveTimeouts: () => this.getActiveTimeouts(),
        getActiveRAF: () => this.getActiveRAF(),
        getActiveListeners: () => this.getActiveListeners(),
        getActiveObservers: () => this.getActiveObservers(),
        getAnomalies: () => this.getAnomalies(),
        getTotals: () => this.getTotals(),
        getRenderStats: () => this.getRenderStats(),
        getLongTasks: () => this.getLongTasks(),
        getMemoryHistory: () => this.getMemoryHistory(),
        getSnapshot: () => this.getSnapshot(),
        trackRender: trackRender,
        takeMemorySnapshot: () => this.takeMemorySnapshot(),
        printReport: () => this.printReport()
      };
    }
  };
  
  // Exponer globalmente
  window.__HX_ANTI_FREEZE__ = AntiFreezeMetrics;
  AntiFreezeMetrics.exportToGlobal();
  
  // Auto-report cada 30 segundos en consola
  setInterval(() => {
    const snapshot = AntiFreezeMetrics.getSnapshot();
    if (snapshot.activeIntervals > 15 || snapshot.activeListeners > 80) {
      console.warn('[anti-freeze] Elevated resource usage detected', snapshot);
    }
  }, 30000);
  
  console.info('[anti-freeze] Initialized successfully');
})();

export default window.__HX_ANTI_FREEZE__;
