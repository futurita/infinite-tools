;(function(){
  "use strict";

  function onReady(callback){ if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', callback, { once:true }); } else { callback(); } }

  function qs(root, sel){ return (root||document).querySelector(sel); }
  function qsa(root, sel){ return Array.from((root||document).querySelectorAll(sel)); }

  const UI = {
    enhance(){
      UI.tabs.enhanceAll();
      UI.modal.enhanceAll();
      UI.toast.ensureContainer();
      // Declarative hooks
      document.addEventListener('click', (e) => {
        const openBtn = e.target.closest('[data-modal-open]');
        if (openBtn){ e.preventDefault(); const target = openBtn.getAttribute('data-modal-open'); UI.modal.open(target); return; }
        const closeBtn = e.target.closest('[data-modal-close]');
        if (closeBtn){ e.preventDefault(); UI.modal.close(closeBtn.closest('.modal')); return; }
        const toastBtn = e.target.closest('[data-toast]');
        if (toastBtn){ e.preventDefault(); const msg = toastBtn.getAttribute('data-toast') || 'Saved'; const type = toastBtn.getAttribute('data-toast-type') || 'info'; UI.toast.show(msg, { type }); return; }
      });
    },

    tabs: {
      enhanceAll(){ qsa(document, '[data-tabs]').forEach(UI.tabs.enhance); },
      enhance(container){
        if (!container) return;
        const list = qs(container, '.tab-list');
        const buttons = qsa(list || container, '[data-tab-target]');
        const panels = qsa(container, '.tab-panel');
        function activate(id){
          buttons.forEach(btn => { const active = btn.getAttribute('data-tab-target') === id; btn.classList.toggle('active', active); btn.setAttribute('aria-selected', String(active)); });
          panels.forEach(p => { p.classList.toggle('active', '#' + p.id === id || p.id === id); });
        }
        buttons.forEach(btn => btn.addEventListener('click', () => activate(btn.getAttribute('data-tab-target'))));
        // Initial
        const initial = (buttons[0] && buttons[0].getAttribute('data-tab-target')) || (panels[0] ? '#' + panels[0].id : null);
        if (initial) activate(initial);
      }
    },

    modal: (function(){
      let backdrop = null;
      function ensureBackdrop(){ if(!backdrop){ backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop'; document.body.appendChild(backdrop); backdrop.addEventListener('click', () => UI.modal.close()); } return backdrop; }
      function open(target){
        ensureBackdrop();
        let el = null;
        if (typeof target === 'string'){
          el = document.querySelector(target);
        } else if (target && target.nodeType === 1){ el = target; }
        if (!el){ // build lightweight modal from data-content if selector not found
          el = document.createElement('div');
          el.className = 'modal';
          el.innerHTML = '<div class="dialog"><div class="header"><div class="title">Modal</div><button class="button outline" data-modal-close>Close</button></div><div class="body"></div></div>';
          document.body.appendChild(el);
        }
        el.classList.add('modal');
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.classList.add('open');
        ensureBackdrop().style.display = 'block';
        // Focus first focusable
        const focusable = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable) focusable.focus({ preventScroll:true });
        return el;
      }
      function close(el){
        const modals = el ? [el] : Array.from(document.querySelectorAll('.modal.open'));
        modals.forEach(m => m.classList.remove('open'));
        if (backdrop){ backdrop.style.display = 'none'; }
      }
      function enhanceAll(){ qsa(document, '.modal').forEach(m => { m.classList.remove('open'); }); ensureBackdrop(); }
      return { open, close, enhanceAll };
    })(),

    toast: {
      container: null,
      ensureContainer(){ if (!UI.toast.container){ const c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); UI.toast.container = c; } return UI.toast.container; },
      show(message, opts){
        const o = Object.assign({ type:'info', timeout:2500 }, opts||{});
        const c = UI.toast.ensureContainer();
        const t = document.createElement('div'); t.className = 'toast ' + (o.type||''); t.textContent = message || '';
        c.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(4px)'; }, Math.max(1, o.timeout - 350));
        setTimeout(() => { c.removeChild(t); }, o.timeout);
        return t;
      }
    }
  };

  window.UI = UI;
  onReady(() => UI.enhance());
})();


