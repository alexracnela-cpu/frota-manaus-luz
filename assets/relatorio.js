// =====================================================================
// FLEET — Relatório de troca de óleo da frota pesada (aba Troca de óleo)
// Usa os dados já carregados no painel (VE, TR, AB, KC) e as regras da
// "Situação da frota" (situacao / kmAtual em painel.js).
// =====================================================================
(function () {
  const PERTO = 2000;   // laranja: faltam menos de 2.000 km

  function linhas() {
    const pes = VE.filter(v => v.ativo && v.categoria === 'Pesado');
    return pes.map(v => {
      const s = situacao(v), ut = ultimaTroca(v.placa);
      const outroKm = AB.some(r => r.placa === v.placa && r.km != null && !r.sus) || (KC && KC[v.placa]);
      return {
        v, ut, gar: v.garantia,
        fab: v.fabricante || fabDoModelo(v.modelo),
        km: v.garantia ? kmAtual(v.placa) : s.km,
        prox: v.garantia ? null : s.prox,
        falta: v.garantia ? null : s.falta,
        susp: !!s.susp,
        semRecente: !v.garantia && ut && s.km != null && !outroKm,
        semKmTroca: !v.garantia && ut && ut.km == null && ut.km_proxima == null,
      };
    }).sort((a, b) => (a.gar - b.gar) || ((a.falta ?? 1e12) - (b.falta ?? 1e12)) || a.v.placa.localeCompare(b.v.placa));
  }

  function celFalta(r) {
    if (r.gar) return '<span class="rf cinza">Garantia</span>';
    if (!r.ut) return '<span class="rf cinza">Sem histórico</span>';
    if (r.semKmTroca) return '<span class="rf cinza">Sem km da troca</span>';
    if (r.susp) return '<span class="rf cinza">Conferir km</span>';
    if (r.falta == null) return '<span class="rf cinza">Sem km</span>';
    const prox = `<span class="rprox">próxima: ${fmt(r.prox)}</span>`;
    if (r.falta <= 0) return `<span class="rf venc">Passou ${fmt(-r.falta)} km</span>${prox}`;
    return `<span class="rf ${r.falta < PERTO ? 'perto' : 'ok'}">${fmt(r.falta)} km</span>${prox}`;
  }
  const filtros = t => `<span class="rfil ${t.filtro_oleo ? 's' : 'n'}">Óleo: ${t.filtro_oleo ? 'sim' : 'não'}</span><span class="rfil ${t.filtro_comb ? 's' : 'n'}">Comb.: ${t.filtro_comb ? 'sim' : 'não'}</span>`;
  const nd = (x, txt = '—') => x ? esc(x) : `<span class="rnd">${txt}</span>`;

  function montar() {
    const L = linhas(), hoje = new Date();
    const comTroca = L.filter(r => !r.gar && r.ut);
    const total = comTroca.reduce((s, r) => s + Number(r.ut.custo || 0), 0);
    const venc = L.filter(r => r.falta != null && r.falta <= 0).length;
    const m1 = L.filter(r => r.falta != null && r.falta > 0 && r.falta < 1000).length;
    const m2 = L.filter(r => r.falta != null && r.falta > 0 && r.falta < PERTO).length;
    const gar = L.filter(r => r.gar).length;
    const corpo = L.map(r => {
      const v = r.v, t = r.ut;
      const kmCel = r.km != null ? fmt(r.km) + (r.semRecente ? '<span class="raviso">sem km recente</span>' : '') : '<span class="rnd">—</span>';
      if (r.gar || !t) return `<tr><td class="rnd">—</td><td class="rpl">${esc(v.placa)}</td><td>${nd(v.modelo, 'não informado')}</td><td>${nd(r.fab)}</td><td>${nd(v.tipo, 'não informado')}</td>
        <td class="rnd" colspan="5">${r.gar ? 'Em garantia · revisão na concessionária' : 'Nenhuma troca registrada'}</td><td class="rn">${kmCel}</td><td>${celFalta(r)}</td></tr>`;
      return `<tr><td>${dataBr(t.d)}</td><td class="rpl">${esc(v.placa)}</td><td>${nd(v.modelo, 'não informado')}</td><td>${nd(r.fab)}</td><td>${nd(v.tipo, 'não informado')}</td>
        <td>${nd(t.estabelecimento)}</td><td>${nd(t.oleo)}</td><td class="rn">${nd(t.requisicao)}</td><td>${filtros(t)}</td>
        <td class="rn">${t.custo != null ? real(t.custo) : '<span class="raviso">pendente</span>'}</td><td class="rn">${kmCel}</td><td>${celFalta(r)}</td></tr>`;
    }).join('');
    $('rel-conteudo').innerHTML = `
      <div class="rtopo">
        <img class="rlogo rfleet" src="assets/fleet.png" alt="FLEET">
        <div class="rtit"><h1>Relatório de troca de óleo — Frota pesada</h1>
          <small>Situação em ${hoje.toLocaleDateString('pt-BR')} às ${hoje.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ordenado por quem está mais perto da próxima troca</small></div>
        <img class="rlogo rml" src="assets/logo-manaus-luz.png" alt="Manaus Luz">
      </div>
      <div class="rfaixa"></div>
      <div class="rresumo">
        <span>Veículos<b>${L.length}</b></span>
        ${venc ? `<span class="rvenc">Vencidas<b>${venc}</b></span>` : ''}
        <span>Faltam menos de 1.000 km<b>${m1}</b></span>
        <span>Faltam menos de 2.000 km<b>${m2}</b></span>
        <span>Em garantia<b>${gar}</b></span>
      </div>
      <div class="rtab"><table>
        <thead><tr><th>Última troca</th><th>Placa</th><th>Modelo</th><th>Fabricante</th><th>Tipo</th><th>Estabelecimento</th><th>Óleo</th>
          <th class="rn">Requisição</th><th>Filtros trocados</th><th class="rn">Custo</th><th class="rn">Km atual</th><th>Faltam p/ próxima</th></tr></thead>
        <tbody>${corpo}</tbody>
        <tfoot><tr><td colspan="9">Total das últimas trocas (${comTroca.length} veículos)</td><td class="rn">${real(total)}</td><td colspan="2"></td></tr></tfoot>
      </table></div>
      <p class="rnota"><b>Como ler:</b> "Km atual" é o maior entre o último abastecimento, o último checklist e a última troca.
        "Faltam" = km da próxima troca (KM ÓLEO do adesivo) − km atual. Laranja: faltam menos de 2.000 km. Vermelho: passou do km.</p>`;
    return L;
  }

  // Excel: CSV com ; e acentos (BOM), que o Excel em português abre direto
  function baixarExcel() {
    const L = linhas(), q = x => { x = x == null ? '' : String(x); return /[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    const n = x => x == null ? '' : String(x);
    const cab = ['Última troca', 'Placa', 'Modelo', 'Fabricante', 'Tipo', 'Estabelecimento', 'Óleo', 'Requisição', 'Filtro de óleo', 'Filtro de combustível', 'Custo (R$)', 'Km atual', 'Próxima troca (km)', 'Faltam (km)', 'Observação'];
    const rows = L.map(r => { const t = r.ut, v = r.v;
      const obs = r.gar ? 'Em garantia' : !t ? 'Sem histórico' : r.semKmTroca ? 'Sem km da troca' : r.susp ? 'Conferir km' : r.falta != null && r.falta <= 0 ? 'Vencida' : r.semRecente ? 'Sem km recente' : '';
      return [t && !r.gar ? dataBr(t.d) : '', v.placa, v.modelo, r.fab, v.tipo, !r.gar && t ? t.estabelecimento : '', !r.gar && t ? t.oleo : '', !r.gar && t ? t.requisicao : '',
        !r.gar && t ? (t.filtro_oleo ? 'Sim' : 'Não') : '', !r.gar && t ? (t.filtro_comb ? 'Sim' : 'Não') : '',
        !r.gar && t && t.custo != null ? Number(t.custo).toFixed(2).replace('.', ',') : '', n(r.km), n(r.prox), n(r.falta), obs].map(q).join(';'); });
    const csv = '﻿' + [cab.map(q).join(';'), ...rows].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `relatorio-oleo-frota-pesada-${iso(new Date())}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function abrir() {
    if (!eu || !VE.length) { toast('Os dados ainda estão carregando.', true); return; }
    montar(); $('rel-o').hidden = false; document.body.classList.add('com-rel'); $('rel-o').scrollTop = 0; $('rel-fechar').focus();
  }
  function fechar() { $('rel-o').hidden = true; document.body.classList.remove('com-rel'); $('abrir-rel').focus(); }

  // monta a janela do relatório uma vez
  const d = document.createElement('div'); d.id = 'rel-o'; d.className = 'rel'; d.hidden = true;
  d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Relatório de troca de óleo da frota pesada');
  d.innerHTML = `<div class="rel-barra"><button type="button" class="rbtn cheio" id="rel-imp">IMPRIMIR / PDF</button>
      <button type="button" class="rbtn" id="rel-xls">BAIXAR EXCEL</button><button type="button" class="rbtn" id="rel-fechar">FECHAR</button></div>
    <div class="rel-folha" id="rel-conteudo"></div>`;
  document.body.appendChild(d);
  $('abrir-rel').onclick = abrir;
  $('rel-fechar').onclick = fechar;
  $('rel-imp').onclick = () => window.print();
  $('rel-xls').onclick = baixarExcel;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('rel-o').hidden) fechar(); });
})();
