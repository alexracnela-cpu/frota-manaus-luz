// =====================================================================
// FLEET — aba Cadastros em quadros: cada cadastro vira um quadro pequeno;
// ao clicar, abre só aquele (os outros ficam fechados).
// Funciona com os quadros do painel e com os do checklist (painel-ck.js).
// =====================================================================
(function () {
  const sv = d => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    pessoas: sv('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>'),
    veiculos: sv('<path d="M3 16V7a1 1 0 0 1 1-1h10v10"/><path d="M14 9h4l3 3.5V16h-7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'),
    listas: sv('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
    fotos: sv('<rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-9 8"/>'),
    perm: sv('<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>'),
    ckveic: sv('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3M8.5 11l2 2 4-4M8.5 17h7"/>'),
    escadas: sv('<path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10"/>'),
    itens: sv('<path d="M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h7"/>'),
    hist: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  };
  // quadro pelo título do cartão
  const DEF = {
    'Pessoas': { ic: 'pessoas', d: 'Nome, RE, acessos e PIN', n: () => `${PE.filter(p => p.ativo).length} ativas` },
    'Veículos': { ic: 'veiculos', d: 'Cadastrar e editar veículos', n: () => `${VE.filter(v => v.ativo).length} ativos` },
    'Listas do formulário': { ic: 'listas', d: 'Locais da troca, óleos e funções', n: () => `${LI.length} opções` },
    'Fotos': { ic: 'fotos', d: 'Espaço usado, baixar e arquivar', n: () => ($('uso-txt') ? $('uso-txt').textContent.split('·')[0].trim() : '') },
    'Permissões do checklist': { ic: 'perm', d: 'Quem dirige o quê e quem autoriza' },
    'Veículos no checklist': { ic: 'ckveic', t: 'Checklist dos veículos', d: 'Modelo de checklist, ARLA e equipamentos' },
    'Escadas': { ic: 'escadas', d: 'Escadas da frota (nº da etiqueta)' },
    'Itens do checklist': { ic: 'itens', d: 'Texto, item crítico e ativo' },
    'Histórico de edições': { ic: 'hist', d: 'Quem mudou o quê (só o administrador)' },
  };
  let aberto = null;   // título do quadro aberto
  try { aberto = sessionStorage.getItem('cad-aberto'); } catch (_) {}

  const tab = $('tab-cad');
  const box = document.createElement('div'); box.id = 'cad-quadros'; box.className = 'cad-quadros';
  tab.prepend(box);

  const titulo = c => { const h = c.querySelector(':scope > .card-h h2'); return h ? h.textContent.trim() : ''; };
  function cartoes() {
    // só os cartões que a pessoa pode ver (a assistente não vê os do painel)
    return [...tab.querySelectorAll('.cad-grid > .card, #cad-ck > .card')].filter(c => {
      const pai = c.closest('.cad-grid, #cad-ck'); return pai && !pai.hidden && titulo(c);
    });
  }
  let pintando = false;
  function pintar() {
    if (pintando) return; pintando = true;
    const cs = cartoes(), nomes = cs.map(titulo);
    if (aberto && !nomes.includes(aberto)) aberto = null;
    box.innerHTML = cs.map(c => {
      const t = titulo(c), d = DEF[t] || {}, on = t === aberto;
      let n = ''; try { n = d.n ? d.n() : ''; } catch (_) {}
      return `<button type="button" class="cq${on ? ' on' : ''}" data-cq="${esc(t)}" aria-expanded="${on}">
        <span class="cq-ic">${IC[d.ic] || IC.listas}</span>
        <span class="cq-tx"><b>${esc(d.t || t)}</b><small>${esc(d.d || '')}</small>${n ? `<em>${esc(n)}</em>` : ''}</span>
        <span class="cq-seta" aria-hidden="true">${on ? '▲' : '▼'}</span></button>`;
    }).join('');
    cs.forEach(c => { const v = titulo(c) !== aberto; if (c.hidden !== v) c.hidden = v; });
    pintando = false;
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-cq]'); if (!b) return;
    const t = b.dataset.cq; aberto = aberto === t ? null : t;
    try { aberto ? sessionStorage.setItem('cad-aberto', aberto) : sessionStorage.removeItem('cad-aberto'); } catch (_) {}
    pintar();
    if (aberto) { const c = cartoes().find(x => titulo(x) === aberto); if (c) c.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  });
  // quando o painel ou o checklist redesenham os cadastros, aplica de novo
  // (observa só os cartões, não os próprios quadros, para não entrar em laço)
  const obsCk = new MutationObserver(() => pintar());
  const ligaCk = () => { const ck = $('cad-ck'); if (ck && !ck.dataset.obs) { ck.dataset.obs = 1; obsCk.observe(ck, { childList: true }); pintar(); } };
  new MutationObserver(ligaCk).observe(tab, { childList: true });
  // ao entrar na aba, atualiza os números dos quadros
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.t === 'cad') pintar(); });
  pintar();
})();
