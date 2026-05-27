(function(){
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      try {
        const nav = document.querySelector('.nav-tabs');
        const sections = document.querySelector('.tab-sections');
        if (!nav || !sections) return;
        if (document.querySelector('[data-tab="strategic"]')) return;

        const btn = document.createElement('button');
        btn.className = 'nav-tab';
        btn.setAttribute('data-tab','strategic');
        btn.type = 'button';
        btn.innerHTML = '<span style="display:inline-block;width:16px;text-align:center;margin-right:6px">⚑</span><span>Estrategia</span>';

        btn.addEventListener('click', () => {
          // deactivate other nav tabs
          document.querySelectorAll('.nav-tab').forEach(n => n.classList.remove('active'));
          btn.classList.add('active');
          // hide all sections
          document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('tab-visible'));
          // show strategic section
          const sec = document.getElementById('tab-strategic');
          if (sec) sec.classList.add('tab-visible');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        nav.appendChild(btn);

        const sec = document.createElement('div');
        sec.id = 'tab-strategic';
        sec.className = 'tab-section';
        sec.innerHTML = '<div id="v5-integration-root" class="v5-integration-root" style="padding:12px"></div>';
        sections.appendChild(sec);

        // Attach V5 workspace when available
        const attachV5 = () => {
          const v5 = window.__HX_V5__;
          const root = document.getElementById('v5-integration-root');
          if (!root) return;
          if (v5 && typeof v5.buildWorkspaceDashboard === 'function') {
            try {
              const c = v5.buildWorkspaceDashboard();
              root.innerHTML = '';
              root.appendChild(c);
            } catch (e) {
              root.innerHTML = '<div class="muted">Error inicializando workspace estratégico</div>';
            }
          } else {
            setTimeout(attachV5, 1000);
          }
        };
        attachV5();
      } catch (e) { console.error('strategic-integration failed', e); }
    }, 800);
  });
})();