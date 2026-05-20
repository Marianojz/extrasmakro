// Minimal runtime diagnostics and safe write helpers for Firebase Realtime Database (staging-oriented)
// Integrates into window.__HX_RUNTIME__ as getFirebaseSecurityDiagnostics()

(function(global){
  const diagnostics = {
    deniedWrites: 0,
    invalidPayloads: 0,
    authMismatches: 0,
    roleViolations: 0,
    ruleFailures: 0,
    appendAuditViolations: 0,
    events: []
  };

  function record(kind, details){
    diagnostics.events.push({kind, details, ts: Date.now()});
    if(kind === 'deniedWrite') diagnostics.deniedWrites++;
    if(kind === 'invalidPayload') diagnostics.invalidPayloads++;
    if(kind === 'authMismatch') diagnostics.authMismatches++;
    if(kind === 'roleViolation') diagnostics.roleViolations++;
    if(kind === 'ruleFailure') diagnostics.ruleFailures++;
    if(kind === 'appendAuditViolation') diagnostics.appendAuditViolations++;
    // Keep events size bounded for staging
    if(diagnostics.events.length > 200) diagnostics.events.shift();
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function isUUID(v){
    return typeof v === 'string' && UUID_RE.test(v);
  }

  function basicSchemaCheck(payload, requirements){
    if(typeof payload !== 'object' || payload === null){
      record('invalidPayload',{reason:'not-object', payload});
      return false;
    }
    if(requirements && Array.isArray(requirements)){
      for(const key of requirements){
        if(!(key in payload)){
          record('invalidPayload',{reason:'missing-'+key, payload});
          return false;
        }
      }
    }
    if('schemaVersion' in payload && typeof payload.schemaVersion !== 'string'){
      record('invalidPayload',{reason:'bad-schemaVersion', payload});
      return false;
    }
    if('id' in payload && !isUUID(payload.id)){
      record('invalidPayload',{reason:'bad-id', payload});
      return false;
    }
    return true;
  }

  // Safe write wrapper for refs: performs client-side validation and records diagnostics
  function safeSet(ref, payload, opts){
    opts = opts || {};
    try{
      // basic checks
      if(opts.requireSchema){
        if(!basicSchemaCheck(payload, opts.requirements)){
          return Promise.reject(new Error('invalid-payload'));
        }
      }
      // prevent accidental large destructive imports unless explicit
      if(opts.mode === 'import' && !opts.allowDestructive){
        // require an explicit marker
        if(!payload || payload._importSafe !== true){
          record('roleViolation',{reason:'destructive-import-blocked', ref:ref.toString(), payloadSample:JSON.stringify(payload).slice(0,200)});
          return Promise.reject(new Error('destructive-import-blocked'));
        }
      }
      return ref.set(payload).catch(err=>{
        // Firebase Permission Denied or validation error
        record('deniedWrite',{ref:ref.toString(), code: err.code || 'unknown', message: err.message});
        return Promise.reject(err);
      });
    }catch(e){
      record('ruleFailure',{error: e && e.message});
      return Promise.reject(e);
    }
  }

  function safeUpdate(ref, payload, opts){
    opts = opts || {};
    try{
      if(!basicSchemaCheck(payload, opts.requirements || [])){
        return Promise.reject(new Error('invalid-payload'));
      }
      return ref.update(payload).catch(err=>{
        record('deniedWrite',{ref:ref.toString(), code: err.code || 'unknown', message: err.message});
        return Promise.reject(err);
      });
    }catch(e){
      record('ruleFailure',{error: e && e.message});
      return Promise.reject(e);
    }
  }

  function getFirebaseSecurityDiagnostics(){
    // return a shallow copy to prevent mutation
    return Object.assign({}, diagnostics, {events: diagnostics.events.slice()});
  }

  // Expose minimal public API
  const api = {
    record,
    safeSet,
    safeUpdate,
    getFirebaseSecurityDiagnostics
  };

  // Integrate with global runtime hook
  if(!global.__HX_RUNTIME__) global.__HX_RUNTIME__ = {};
  global.__HX_RUNTIME__.getFirebaseSecurityDiagnostics = getFirebaseSecurityDiagnostics;
  global.__HX_RUNTIME__._firebaseSecurity = api; // internal helpers

  // export for module systems
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  if(typeof define === 'function' && define.amd) define(()=>api);

})(typeof window !== 'undefined' ? window : global);
