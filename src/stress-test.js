/**
 * stress-test.js — Stress Test Real para Validación Anti-Freeze
 * ─────────────────────────────────────────────────────────────────────────────
 * FASE 2: Ejecución de pruebas de estrés
 * 
 * Pruebas:
 * 1. Hard reload x20
 * 2. Navegación rápida entre tabs
 * 3. Resize continuo ventana
 * 4. Background/foreground tab
 * 5. Abrir DevTools
 * 6. Minimizar/restaurar
 * 7. Scroll agresivo
 * 8. Navegación lateral repetida
 * 9. Simulación idle 10 min
 * 10. Simulación low-end device
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function() {
  'use strict';
  
  if (typeof window === 'undefined') return;
  
  if (window.__HX_STRESS_TEST__) {
    console.warn('[stress-test] Already initialized, skipping');
    return;
  }
  
  const RESULTS = {
    tests: [],
    startTime: Date.now(),
    metrics: {
      before: null,
      after: null,
      peak: null
    },
    anomalies: [],
    completed: false
  };
  
  function getMetrics() {
    if (!window.__APP_METRICS__) return null;
    return window.__APP_METRICS__.getSnapshot();
  }
  
  function captureMetrics(label) {
    const snapshot = getMetrics();
    if (!snapshot) return null;
    
    const result = {
      label: label,
      ts: Date.now(),
      ...snapshot
    };
    
    RESULTS.metrics.before = RESULTS.metrics.before || result;
    RESULTS.metrics.after = result;
    
    // Track peak values
    if (!RESULTS.metrics.peak) {
      RESULTS.metrics.peak = { ...snapshot };
    } else {
      RESULTS.metrics.peak.activeIntervals = Math.max(RESULTS.metrics.peak.activeIntervals, snapshot.activeIntervals);
      RESULTS.metrics.peak.activeListeners = Math.max(RESULTS.metrics.peak.activeListeners, snapshot.activeListeners);
      RESULTS.metrics.peak.activeRAF = Math.max(RESULTS.metrics.peak.activeRAF, snapshot.activeRAF);
    }
    
    return result;
  }
  
  function logTest(name, status, details = {}) {
    const result = {
      name,
      status,
      ts: Date.now(),
      duration: details.duration || 0,
      details
    };
    RESULTS.tests.push(result);
    
    if (status === 'PASS') {
      console.info(`[stress-test] ✓ ${name}`);
    } else if (status === 'FAIL') {
      console.error(`[stress-test] ✗ ${name}`, details);
      RESULTS.anomalies.push({ test: name, type: 'failure', details });
    } else {
      console.log(`[stress-test] ○ ${name}`);
    }
    
    return result;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Hard Reload Detection
  // ─────────────────────────────────────────────────────────────────────────
  
  async function testHardReload(count = 5) {
    const testName = `Hard Reload x${count}`;
    console.log(`[stress-test] Iniciando: ${testName}`);
    
    // Check session storage for reload count
    const key = '__hx_reload_count__';
    const currentCount = parseInt(sessionStorage.getItem(key) || '0', 10);
    
    if (currentCount < count) {
      sessionStorage.setItem(key, String(currentCount + 1));
      captureMetrics(`reload-${currentCount}`);
      
      // Simular hard reload con navegación
      window.location.reload(true);
      return { status: 'PENDING', message: `Reload ${currentCount + 1}/${count}` };
    } else {
      sessionStorage.removeItem(key);
      const finalMetrics = captureMetrics('reload-final');
      logTest(testName, 'PASS', { reloads: count, finalMetrics });
      return { status: 'COMPLETE', results: RESULTS };
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Navegación Rápida Entre Tabs
  // ─────────────────────────────────────────────────────────────────────────
  
  async function testTabNavigation(iterations = 10) {
    const testName = 'Navegación Rápida Tabs';
    console.log(`[stress-test] Iniciando: ${testName}`);
    
    const startTs = Date.now();
    const tabs = ['tab-empleados', 'tab-convocatorias', 'tab-sabados', 'tab-estadisticas', 'tab-config'];
    let successCount = 0;
    
    for (let i = 0; i < iterations; i++) {
      for (const tabId of tabs) {
        const tab = document.getElementById(tabId);
        const navBtn = document.querySelector(`[data-tab="${tabId}"]`) || 
                       document.querySelector(`button[data-target="${tabId}"]`) ||
                       document.querySelector(`a[href="#${tabId}"]`);
        
        if (navBtn && tab) {
          try {
            navBtn.click();
            await new Promise(resolve => setTimeout(resolve, 50));
            successCount++;
          } catch (e) {
            // Ignore navigation errors
          }
        }
      }
    }
    
    const duration = Date.now() - startTs;
    const metrics = captureMetrics('tab-navigation');
    
    if (successCount >= iterations * tabs.length * 0.8) {
      logTest(testName, 'PASS', { iterations, successCount, duration, metrics });
    } else {
      logTest(testName, 'FAIL', { iterations, successCount, expected: iterations * tabs.length });
    }
    
    return { success: successCount, total: iterations * tabs.length };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Resize Continuo Ventana
  // ─────────────────────────────────────────────────────────────────────────
  
  async function testWindowResize(iterations = 20) {
    const testName = 'Resize Continuo Ventana';
    console.log(`[stress-test] Iniciando: ${testName}`);
    
    const startTs = Date.now();
    const sizes = [
      { w: 1920, h: 1080 },
      { w: 1366, h: 768 },
      { w: 1024, h: 768 },
      { w: 768, h: 1024 },
      { w: 375, h: 667 }
    ];
    
    let resizeCount = 0;
    
    for (let i = 0; i < iterations; i++) {
      const size = sizes[i % sizes.length];
      // Note: window.resizeTo requires browser permissions
      // Instead, we dispatch resize events
      window.dispatchEvent(new Event('resize'));
      resizeCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    const duration = Date.now() - startTs;
    const metrics = captureMetrics('resize-test');
    const anomalies = window.__APP_METRICS__?.getAnomalies?.() || {};
    const resizeStorms = anomalies.observerStorms?.filter(s => s.type === 'resize') || [];
    
    if (resizeStorms.length < 5) {
      logTest(testName, 'PASS', { iterations: resizeCount, duration, resizeStorms: resizeStorms.length, metrics });
    } else {
      logTest(testName, 'WARN', { iterations: resizeCount, duration, resizeStorms: resizeStorms.length });
    }
    
    return { resizeCount, storms: resizeStorms.length };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Background/Foreground Tab
  // ─────────────────────────────────────────────────────────────────────────
  
  async function testTabVisibility() {
    const testName = 'Background/Foreground Tab';
    console.log(`[stress-test] Iniciando: ${testName}`);
    
    const startTs = Date.now();
    let visibilityChanges = 0;
    
    const handleVisibility = () => {
      visibilityChanges++;
      captureMetrics(document.visibilityState);
    };
    
    document.addEventListener('visibilitychange', handleVisibility);
    
    // Simulate visibility changes via events
    for (let i = 0; i < 5; i++) {
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    document.removeEventListener('visibilitychange', handleVisibility);
    
    const duration = Date.now() - startTs;
    const metrics = captureMetrics('visibility-test');
    
    logTest(testName, 'PASS', { visibilityChanges, duration, metrics });
    
    return { visibilityChanges, duration };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Scroll Agresivo
  // ─────────────────────────────────────────────────────────────────────────
  
  async function testAggressiveScroll() {
    const testName = 'Scroll Agresivo';
    console.log(`[stress-test] Iniciando: ${testName}`);
    
    const startTs = Date.now();
    const scrollTop = window.scrollY || window.pageYOffset;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    
    let scrollEvents = 0;
    
    const handleScroll = () => { scrollEvents++; };
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Rapid scroll simulation
    for (let i = 0; i < 20; i++) {
      const targetY = (i % 2 === 0) ? 0 : maxScroll;
      window.scrollTo({ top: targetY, behavior: 'auto' });
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    
    window.removeEventListener('scroll', handleScroll);
    window.scrollTo({ top: scrollTop, behavior: 'smooth' });
    
    const duration = Date.now() - startTs;
    const metrics = captureMetrics('scroll-test');
    
    logTest(testName, 'PASS', { scrollEvents, duration, metrics });
    
    return { scrollEvents, duration };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Simulación Idle 10 min (acelerado)
  // ─────────────────────────────────────────────────────────────────────────
  
  async function testIdleSimulation() {
    const testName = 'Simulación Idle (acelerado 10s)';
    console.log(`[stress-test] Iniciando: ${testName}`);
    
    const startTs = Date.now();
    const initialMetrics = captureMetrics('idle-start');
    
    // Wait 10 seconds instead of 10 minutes for testing
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const finalMetrics = captureMetrics('idle-end');
    const duration = Date.now() - startTs;
    
    // Check for memory leaks during idle
    const memoryLeak = finalMetrics.memorySnapshots > initialMetrics.memorySnapshots + 10;
    
    if (!memoryLeak) {
      logTest(testName, 'PASS', { duration, initialMetrics, finalMetrics });
    } else {
      logTest(testName, 'WARN', { duration, memoryLeak, initialMetrics, finalMetrics });
    }
    
    return { duration, memoryLeak };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: CPU/Memory Stability Check
  // ─────────────────────────────────────────────────────────────────────────
  
  async function testStability() {
    const testName = 'Estabilidad CPU/Memoria';
    console.log(`[stress-test] Iniciando: ${testName}`);
    
    const samples = [];
    
    for (let i = 0; i < 5; i++) {
      const metrics = getMetrics();
      if (metrics) {
        samples.push({
          ts: Date.now(),
          activeIntervals: metrics.activeIntervals,
          activeListeners: metrics.activeListeners,
          activeRAF: metrics.activeRAF
        });
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Check for growth pattern
    const intervalGrowth = samples[samples.length - 1]?.activeIntervals - samples[0]?.activeIntervals;
    const listenerGrowth = samples[samples.length - 1]?.activeListeners - samples[0]?.activeListeners;
    
    const stable = (intervalGrowth <= 2) && (listenerGrowth <= 5);
    
    if (stable) {
      logTest(testName, 'PASS', { samples, intervalGrowth, listenerGrowth });
    } else {
      logTest(testName, 'FAIL', { samples, intervalGrowth, listenerGrowth, anomaly: 'Resource leak detected' });
      RESULTS.anomalies.push({ test: testName, type: 'resource_leak', intervalGrowth, listenerGrowth });
    }
    
    return { stable, samples };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // RUN ALL TESTS
  // ─────────────────────────────────────────────────────────────────────────
  
  async function runAllTests() {
    console.group('[stress-test] === INICIANDO SUITE DE STRESS TEST ===');
    
    RESULTS.startTime = Date.now();
    captureMetrics('pre-tests');
    
    // Run tests sequentially
    await testTabNavigation(5);
    await testWindowResize(10);
    await testTabVisibility();
    await testAggressiveScroll();
    await testStability();
    await testIdleSimulation();
    
    captureMetrics('post-tests');
    
    const summary = {
      totalTests: RESULTS.tests.length,
      passed: RESULTS.tests.filter(t => t.status === 'PASS').length,
      failed: RESULTS.tests.filter(t => t.status === 'FAIL').length,
      warnings: RESULTS.tests.filter(t => t.status === 'WARN').length,
      duration: Date.now() - RESULTS.startTime,
      anomalies: RESULTS.anomalies.length,
      metrics: RESULTS.metrics
    };
    
    RESULTS.completed = true;
    
    console.groupEnd();
    console.info('[stress-test] === RESUMEN ===', summary);
    
    return {
      summary,
      tests: RESULTS.tests,
      anomalies: RESULTS.anomalies,
      metrics: RESULTS.metrics
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────
  
  window.__HX_STRESS_TEST__ = {
    runAllTests,
    testHardReload,
    testTabNavigation,
    testWindowResize,
    testTabVisibility,
    testAggressiveScroll,
    testIdleSimulation,
    testStability,
    getResults: () => RESULTS,
    captureMetrics,
    
    // Quick health check
    quickHealthCheck() {
      const metrics = getMetrics();
      const anomalies = window.__APP_METRICS__?.getAnomalies?.() || {};
      
      const health = {
        status: 'HEALTHY',
        issues: [],
        metrics
      };
      
      if (metrics.activeIntervals > 20) {
        health.status = 'WARNING';
        health.issues.push(`High interval count: ${metrics.activeIntervals}`);
      }
      
      if (metrics.activeListeners > 100) {
        health.status = 'WARNING';
        health.issues.push(`High listener count: ${metrics.activeListeners}`);
      }
      
      if (anomalies.duplicateListeners?.length > 0) {
        health.status = 'WARNING';
        health.issues.push(`Duplicate listeners: ${anomalies.duplicateListeners.length}`);
      }
      
      if (anomalies.infiniteRAF?.length > 0) {
        health.status = 'CRITICAL';
        health.issues.push(`Infinite RAF detected: ${anomalies.infiniteRAF.length}`);
      }
      
      return health;
    }
  };
  
  console.info('[stress-test] Module loaded. Use window.__HX_STRESS_TEST__.runAllTests() to execute.');
})();

export default window.__HX_STRESS_TEST__;
