// FLEET — checklist no celular: saída e volta do veículo, escadas, autorizações, portaria e veículos bloqueados.
// Usa o que o app (campo-novo.js) já tem: token, eu, tela(), carregando(), abrirMenu(), sairUsuario(), contagem().
const CK = (() => {
  const OPC = { STD: ['C', 'NC', 'NA'], LAT: ['C', 'R', 'A'], EXT: ['C', 'R', 'Q'] };
  const LEG = { LAT: 'C conforme · R riscado/ralado · A amassado', EXT: 'C conforme · R riscado · Q quebrado' };
  const CAT = { cesto: 'Cesto', munk: 'Munck', leve: 'Frota leve', moto: 'Moto' };
  const SIT = { disp: ['Disponível', 'ok'], aut: ['Aguardando autorização', 'prox'], port: ['Aguardando portaria', 'prox'],
    uso: ['Em uso', 'info'], volta: ['Volta a conferir', 'prox'], blq: ['Bloqueado', 'venc'] };
  const LOCAIS = ['Capô', 'Para-choque dianteiro', 'Para-choque traseiro', 'Para-lama dianteiro esquerdo', 'Para-lama dianteiro direito',
    'Para-lama traseiro esquerdo', 'Para-lama traseiro direito', 'Porta dianteira esquerda', 'Porta dianteira direita', 'Porta traseira esquerda',
    'Porta traseira direita', 'Porta-malas / caçamba', 'Teto', 'Retrovisor esquerdo', 'Retrovisor direito', 'Para-brisa', 'Vidro lateral',
    'Farol / lanterna', 'Cabine (pesados)', 'Carroceria / baú', 'Cesto / lança (pesados)', 'Tanque (moto)', 'Carenagem (moto)', 'Outro'];
  const NIV = ['E', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8', 'F'];
  const nomeComb = i => i == null ? '' : i === 0 ? 'Vazio (E)' : i === 8 ? 'Cheio (F)' : i === 4 ? 'Meio tanque' : NIV[i] + ' do tanque';
  const ruim = v => !!v && v !== 'C' && v !== 'NA';
  const defeito = v => v === 'NC' || v === 'Q';
  const tag = s => `<span class="pill ${SIT[s][1]}">${SIT[s][0]}</span>`;
  const hora = t => t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

  let D = null, V = { tela: 'home' }, d = null, aut = [], port = null, blq = [], conf = {}, rec = null, dq = null, nl = null;
  const raiz = () => $('s-ck');

  // ---------- rascunho (fica no celular, ligado ao RE de quem começou) ----------
  const chaveR = () => 'fleet_rasc_' + (eu && eu.re ? eu.re : '');
  function rascunho() { try { const r = localStorage.getItem(chaveR()); return r ? JSON.parse(r) : null; } catch (_) { return null; } }
  function guardar(motivo) {
    if (!d || !eu || !eu.re) return;
    const tem = d.km || Object.keys(d.itens).length || d.avarias.length;
    if (!tem) return;
    const r = { d, em: new Date().toISOString(), motivo };
    try { localStorage.setItem(chaveR(), JSON.stringify(r)); }
    catch (_) {   // sem espaço: guarda sem as fotos
      try { const c = JSON.parse(JSON.stringify(r)); limpaFotos(c.d); localStorage.setItem(chaveR(), JSON.stringify(c)); } catch (__) {}
    }
  }
  function limpaFotos(x) { for (const k in x) { if (k === 'foto') x[k] = ''; else if (x[k] && typeof x[k] === 'object') limpaFotos(x[k]); } }
  function descartar() { try { localStorage.removeItem(chaveR()); } catch (_) {} }

  // ---------- entrada pelo menu ----------
  async function abrir(modo) {
    V = { tela: modo }; carregando(true, 'Abrindo…');
    try {
      if (modo === 'home') D = await rpc('campo_ck_inicio', { p_token: token });
      if (modo === 'aut') aut = await rpc('campo_aut_lista', { p_token: token });
      if (modo === 'port') { port = await rpc('campo_port_lista', { p_token: token }); conf = {}; }
      if (modo === 'blq') blq = await rpc('campo_blq_lista', { p_token: token });
      rec = dq = nl = null; render(); tela('s-ck');
    } catch (err) { alert_(err.message); }
    finally { carregando(false); }
  }
  function alert_(m) { V.aviso = m; render(); tela('s-ck'); }
  function ativo() { return !$('s-ck').hidden && (V.tela === 'form'); }

  // ---------- telas ----------
  function appbar(t, who) {
    return `<div class="appbar"><div><h2>${t}</h2><div class="who">${who || ''}</div></div><button type="button" class="voltar" data-act="${V.tela === 'form' ? 'home' : 'menu'}" style="padding:6px 14px 6px 10px;font-size:14px">${ICONE_VOLTAR}Voltar</button></div>`;
  }
  const quem = () => `${esc(curto(eu.nome))} · RE <span class="num">${esc(eu.re || '')}</span>`;
  function render() {
    const f = { home: telaHome, form: telaForm, aut: telaAut, port: telaPort, blq: telaBlq }[V.tela];
    raiz().innerHTML = f ? f() : '';
    if (V.foco) { const el = $(V.foco); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} } V.foco = null; }
  }
  const aviso = () => V.aviso ? `<div class="alert" role="alert">${esc(V.aviso)}</div>` : '';

  function telaHome() {
    const me = D.eu;
    if (me.afastado) return appbar('Checklist', quem()) + `<div class="pane"><div class="vazio"><b>Acesso suspenso</b><span>Você está marcado como afastado, então nenhum veículo aparece. Fale com a líder de frota.</span></div></div>`;
    const vs = D.veiculos, disp = vs.filter(v => v.situacao === 'disp');
    const uso = D.abertos.filter(c => c.situacao === 'uso'), and = D.abertos.filter(c => c.situacao !== 'uso');
    const r = rascunho();
    let h = appbar('Checklist', quem()) + '<div class="pane">' + aviso();
    if (r) {
      const n = Object.values(r.d.itens).filter(x => x.v).length;
      h += `<div class="quem"><div class="quem-t">Você tem um checklist pela metade</div><div>${r.d.tipo === 'saida' ? 'Saída' : 'Volta'} do <b>${esc(r.d.placa)}</b> · ${n} itens respondidos · guardado às ${hora(r.em)}</div>
        <div class="two"><button type="button" class="btn btn-sm btn-ghost" data-act="rascDesc">Descartar</button><button type="button" class="btn btn-sm btn-main" data-act="rascCont">Continuar</button></div></div>`;
    }
    if (uso.length) h += `<div class="mine"><h3>Registrar volta</h3>${uso.map(c => `<button type="button" class="aprov" data-act="volta" data-v="${c.id}"><span><b>${esc(c.placa)}</b><small class="num">${esc(c.numero)}</small></span><span class="pill info">Em uso</span><small class="aprov-d">Toque para registrar a volta.</small></button>`).join('')}</div>`;
    if (and.length) h += `<div class="mine"><h3>Em andamento</h3>${and.map(c => `<div class="mine-row"><span><b>${esc(c.placa)}</b> <span class="mut num">${esc(c.numero)}</span>${c.situacao === 'aut' && c.autorizador ? `<br><small class="mut">aguardando ${esc(c.autorizador)}</small>` : ''}</span><span>${tag(c.situacao)}${['aut', 'port'].includes(c.situacao) ? ` <button type="button" class="linkbtn" data-act="cancelar" data-v="${c.id}">Cancelar</button>` : ''}</span></div>`).join('')}</div>`;
    h += `<div class="mine"><h3>Sair com um veículo</h3>${disp.map(v => `<button type="button" class="aprov" data-act="saida" data-v="${esc(v.placa)}"><span><b>${esc(v.placa)}</b><small>${esc(v.modelo || '')} · ${CAT[v.modelo_ck]}</small></span><span class="pill ok">Disponível</span></button>`).join('')
      || '<div class="vazio"><b>Nenhum veículo disponível</b><span>Não há veículo livre nas categorias que você dirige.</span></div>'}</div>`;
    const ocup = vs.filter(v => v.situacao !== 'disp' && !D.abertos.some(c => c.placa === v.placa));
    if (ocup.length) h += `<details class="mine"><summary class="mut">Veículos ocupados ou bloqueados (${ocup.length})</summary>${ocup.map(v => `<div class="mine-row"><span><b>${esc(v.placa)}</b>${v.com ? ` <small class="mut">com ${esc(v.com)}</small>` : ''}</span>${tag(v.situacao)}</div>`).join('')}</details>`;
    const cats = [...new Set(vs.map(v => CAT[v.modelo_ck]))];
    h += `<div class="mut nota">Você dirige: <b>${cats.join(', ') || 'nenhuma categoria'}</b>.</div></div>`;
    return h;
  }

  function novo(tipo, placa, base) {
    const v = D.veiculos.find(x => x.placa === placa), m = D.modelos[v.modelo_ck];
    const x = { tipo, placa, ck: base ? base.id : null, modelo: v.modelo_ck, km: '', comb: null, pneus: base ? base.saida.pneus : '',
      itens: {}, qtd: {}, escadas: [], avarias: [], obs: '', autorizador: '', erros: null };
    m.qtd.forEach(k => { x.qtd[k] = base ? (base.qtd_porteiro || base.saida.qtd)[k] : (v.equip && v.equip[k] != null ? v.equip[k] : ''); });
    if (base) Object.entries(base.saida.itens).forEach(([k, it]) => { x.itens[k] = { v: it.v }; if (ruim(it.v)) { x.itens[k].desc = it.desc || ''; x.itens[k].foto = ''; } });
    if (!base && m.qtd_escada && x.qtd[m.qtd_escada] !== '') x.escadas = Array.from({ length: +x.qtd[m.qtd_escada] }, () => ({ num: '', ok: false, itens: {} }));
    return x;
  }
  function refItens() { return d.tipo === 'volta' ? d.ref : D.modelos[d.modelo].itens.filter(i => !(i.nome === 'Nível do ARLA 32' && !veic().usa_arla) && !(i.q4 && (veic().portas || 4) < 4)); }
  const veic = () => D.veiculos.find(x => x.placa === d.placa) || {};

  function opc(opts, val, act, extra) {
    return `<div class="opc" style="grid-template-columns:repeat(${opts.length},1fr)">${opts.map(o => { const c = val === o ? 'on ' + (o === 'NA' ? 'na' : (o === 'R' || o === 'A') ? 'av' : (o === 'NC' || o === 'Q') ? 'mau' : '') : '';
      return `<button type="button" class="${c}" data-act="${act}" data-v="${esc(o)}" ${extra || ''} aria-pressed="${val === o}">${o}</button>`; }).join('')}</div>`;
  }
  function fotoBox(x, act, key, rotulo) {
    return x.foto ? `<label class="foto ok"><input type="file" accept="image/*" capture="environment" data-foto="${act}" data-k="${key}"><img src="${x.foto}" alt=""><span class="cap">${rotulo} ✓</span></label>`
      : `<label class="foto falta"><input type="file" accept="image/*" capture="environment" data-foto="${act}" data-k="${key}"><span>📷</span><span>${rotulo}</span></label>`;
  }
  function blocoNC(x, act, key) {
    return `<div class="nc-extra"><div class="fotos" style="grid-template-columns:repeat(3,1fr)">${fotoBox(x, act, key, 'Foto do defeito')}</div>
      <div class="field"><input id="${act}-${key}" placeholder="Descreva o problema" value="${esc(x.desc || '')}" data-in="${act}" data-k="${key}"></div></div>`;
  }

  function gauge(i) {
    const G = { cx: 150, cy: 168, a0: 152, a1: 28 }, pt = (a, r) => { const t = a * Math.PI / 180; return [G.cx + r * Math.cos(t), G.cy - r * Math.sin(t)]; };
    const ang = v => G.a0 - (G.a0 - G.a1) * v;
    let t = ''; for (let k = 0; k <= 24; k++) { const a = ang(k / 24), M = k % 12 === 0; const [x1, y1] = pt(a, M ? 90 : 97), [x2, y2] = pt(a, 116);
      t += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${k < 3 ? '#e5332a' : '#f4f4f4'}" stroke-width="${M ? 8 : 4.5}" stroke-linecap="round"/>`; }
    const a = ang(i == null ? .5 : i / 8), [nx, ny] = pt(a, 104), [bx, by] = pt(a, -12);
    return `<svg viewBox="0 0 300 200" class="gauge-svg" role="img" aria-label="Marcador de combustível"><rect width="300" height="200" rx="18" fill="#07090d"/>${t}
      <text x="34" y="182" fill="#f4f4f4" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="30" text-anchor="middle">E</text>
      <text x="266" y="182" fill="#f4f4f4" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="30" text-anchor="middle">F</text>
      <g transform="translate(138 92)" fill="#f4f4f4"><rect width="17" height="27" rx="2"/><rect x="3" y="3" width="11" height="8" fill="#07090d"/><rect x="-2" y="26" width="21" height="4" rx="1"/><path d="M17 6h3a2 2 0 0 1 2 2v12a2 2 0 0 0 4 0V9l-4-5" fill="none" stroke="#f4f4f4" stroke-width="2.2" stroke-linecap="round"/></g>
      <line id="g-agulha" x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="${i == null ? '#5b616b' : '#f26a1b'}" stroke-width="11"/><circle cx="150" cy="168" r="9" fill="#1b1f27"/></svg>`;
  }
  function setComb(i) {
    d.comb = i; const g = document.querySelector('#s-ck .gauge'); if (!g) return;
    g.querySelector('svg').outerHTML = gauge(i); g.classList.remove('vazio');
    $('comb-txt').textContent = nomeComb(i); const r = $('ck-comb'); r.value = i; r.setAttribute('aria-valuetext', nomeComb(i));
  }

  function telaForm() {
    const v = veic(), m = D.modelos[d.modelo], ref = refItens(), volta = d.tipo === 'volta';
    let h = appbar(`${volta ? 'Volta' : 'Saída'} · ${esc(d.placa)}`, `${esc(m.nome)} · ${esc(m.rev || '')}`) + '<form class="pane" novalidate onsubmit="return false">' + aviso();
    h += `<div class="veic-box"><b>${esc(d.placa)}</b> · ${esc(v.modelo || '')}<br><small>${volta ? `Saiu com km ${fmt(d.base.km)}. Os itens vêm como estavam na saída; mude só o que mudou.` : `Último km conhecido: ${v.km ? fmt(v.km) : '—'}`}</small></div>
      <div class="auto">${quem()}<br>Data e hora entram sozinhas no envio.</div>
      <div class="hint">O que você preenche fica guardado neste celular. Sem uso por 10 minutos, o app sai sozinho e guarda o rascunho.</div>
      <div class="field"><label for="ck-km">Km do painel</label><input id="ck-km" class="num" inputmode="numeric" placeholder="000000" value="${esc(d.km)}" data-in="km" autocomplete="off"></div>
      <div class="field"><label for="ck-comb">Combustível</label><div class="gauge ${d.comb == null ? 'vazio' : ''}">${gauge(d.comb)}<div class="gauge-val"><b id="comb-txt">${d.comb == null ? 'Toque ou arraste o ponteiro' : nomeComb(d.comb)}</b><span>igual ao marcador do painel</span></div>
        <input type="range" id="ck-comb" class="sr" min="0" max="8" step="1" value="${d.comb == null ? 4 : d.comb}" data-in="comb" aria-label="Nível de combustível" aria-valuetext="${d.comb == null ? 'não marcado' : nomeComb(d.comb)}"></div></div>
      <div class="field"><label>Pneus</label>${opc(['Novos', 'Bons', 'Ruins'], d.pneus, 'pneus')}</div>`;
    const secoes = []; ref.forEach(i => { let s = secoes.find(x => x.t === i.secao); if (!s) secoes.push(s = { t: i.secao, o: i.opcoes, i: [] }); s.i.push(i); });
    secoes.forEach((s, si) => {
      const resp = s.i.filter(i => d.itens[i.id] && d.itens[i.id].v).length, ruins = s.i.filter(i => ruim((d.itens[i.id] || {}).v)).length;
      h += `<div class="secao ${ruins ? 'tem-nc' : ''}"><div class="secao-h"><h3>${esc(s.t)}</h3><span class="mut num">${resp}/${s.i.length}${ruins ? ` · ${ruins} com problema` : ''}</span></div>${LEG[s.o] ? `<div class="mut" style="margin:-4px 0 6px">${LEG[s.o]}</div>` : ''}
        <button type="button" class="linkbtn" data-act="secaoC" data-v="${si}" style="align-self:flex-start;padding:0 0 6px">Marcar esta seção toda como C</button>`;
      s.i.forEach(i => { const x = d.itens[i.id] || {}, mau = ruim(x.v);
        h += `<div class="item ${mau ? 'ruim' : ''}"><p>${esc(i.nome)}${i.critico ? ' <span class="crit">CRÍTICO</span>' : ''}</p>${opc(OPC[i.opcoes], x.v, 'item', `data-k="${i.id}"`)}
          ${mau ? blocoNC(x, 'itf', i.id) + (i.critico && defeito(x.v) ? `<div class="aviso-nc">Item crítico: o veículo fica bloqueado${volta ? ' até o conserto' : ' e não pode sair'}.</div>` : '') : ''}</div>`; });
      h += '</div>';
      V.secoes = secoes;
    });
    if (m.qtd.length) {
      const base = volta ? (d.base.qtd_porteiro || d.base.qtd) : null;
      h += `<div class="secao"><div class="secao-h"><h3>Quantidades</h3>${volta ? '<span class="mut">comparando com a saída</span>' : ''}</div>`;
      m.qtd.forEach(k => { const val = d.qtd[k], dif = base && val !== '' && val != null ? val - base[k] : null;
        h += `<div class="qtd"><span>${esc(k)}${base ? `<br><span class="mut">saída: ${base[k]}</span>` : ''}</span><span class="qtd-d">${dif !== null ? (dif < 0 ? `<span class="pill venc">${dif} faltando</span>` : dif > 0 ? `<span class="pill info">+${dif}</span>` : '<span class="pill ok">ok</span>') : ''}<span class="passo"><button type="button" data-act="qtd" data-k="${esc(k)}" data-v="-1" aria-label="menos">−</button><b class="num">${val === '' || val == null ? '—' : val}</b><button type="button" data-act="qtd" data-k="${esc(k)}" data-v="1" aria-label="mais">+</button></span></span></div>`; });
      h += '</div>';
    }
    if (!volta) d.escadas.forEach((e, ei) => { h += blocoEscada(e, ei); });
    h += `<div class="secao"><div class="secao-h"><h3>Avarias externas</h3><span class="mut num">${d.avarias.length}</span></div><div class="mut" style="margin-bottom:6px;font-size:13px">Registre <b>todas</b> as avarias que você vê no veículo, inclusive as que já existiam.</div>`;
    d.avarias.forEach((a, ai) => {
      h += `<div class="item"><p>Avaria ${ai + 1} <button type="button" class="linkbtn" data-act="avDel" data-k="${ai}" style="padding:0;margin-left:auto">remover</button></p>${opc(['R', 'A', 'Q'], a.tipo, 'avTipo', `data-k="${ai}"`)}<div class="mut" style="margin-top:3px">R riscado · A amassado · Q quebrado</div>
        <div class="field" style="margin-top:8px"><label for="av-${ai}">Local</label><select id="av-${ai}" data-in="avLocal" data-k="${ai}"><option value="">Escolha o local</option>${LOCAIS.map(l => `<option ${a.local === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${a.local === 'Outro' ? `<div class="field"><input id="avo-${ai}" placeholder="Qual local?" value="${esc(a.outro || '')}" data-in="avOutro" data-k="${ai}"></div>` : ''}
        <div class="fotos" style="margin-top:8px">${fotoBox(a, 'avf', ai, 'Foto da avaria')}</div></div>`; });
    h += `<button type="button" class="btn btn-sm btn-ghost" data-act="avAdd">+ Adicionar avaria</button></div>
      <div class="field"><label for="ck-obs">Observações</label><textarea id="ck-obs" data-in="obs" placeholder="Opcional">${esc(d.obs)}</textarea></div>`;
    if (!volta) h += !D.eu.sai_sem ? `<div class="quem"><div class="quem-t">Quem vai autorizar a saída</div><div class="field"><select id="ck-aut" data-in="aut"><option value="">Escolha</option>${D.autorizadores.map(p => `<option value="${p.id}" ${d.autorizador === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div><div class="mut" style="font-size:13px">${D.eu.mecanico ? 'Mecânico: a saída é autorizada pela Fernanda ou pela Deysimar. ' : ''}Avise a pessoa: ela autoriza pelo celular ou pelo painel. Depois disso o veículo aparece para o porteiro.</div></div>`
      : '<div class="auto">Você sai sem precisar de autorização: o checklist vai direto para o porteiro.</div>';
    if (d.erros && d.erros.length) h += `<div class="alert" role="alert"><strong>Falta completar:</strong><ul style="margin:4px 0 0;padding-left:18px">${d.erros.slice(0, 8).map(e => `<li>${esc(e)}</li>`).join('')}${d.erros.length > 8 ? `<li>e mais ${d.erros.length - 8}</li>` : ''}</ul></div>`;
    return h + `<button type="button" class="btn btn-main" data-act="enviar">${volta ? 'Registrar volta' : 'Enviar checklist de saída'}</button></form>`;
  }

  function blocoEscada(e, ei) {
    const achada = D.escadas.find(x => x.num === e.num.trim()), itens = D.modelos.escada ? D.modelos.escada.itens : [];
    let h = `<div class="secao"><div class="secao-h"><h3>Escada${d.escadas.length > 1 ? ' ' + (ei + 1) : ''} · inspeção</h3><span class="mut">${itens.length} itens do modelo</span></div>`;
    if (!e.ok) {
      h += `<div class="field"><label for="esc-${ei}">Nº da escada (como na etiqueta)</label><input id="esc-${ei}" class="num" placeholder="ex.: 21" value="${esc(e.num)}" data-in="escnum" data-k="${ei}" autocomplete="off"></div>
        <button type="button" class="btn btn-sm btn-ghost" data-act="escBuscar" data-k="${ei}">Buscar escada</button>`;
      if (e.buscou) h += !achada ? `<div class="alert"><strong>Nenhuma escada com o nº ${esc(e.num)}.</strong> Confira a etiqueta: 001 e 01 são escadas diferentes.</div>`
        : `<div class="veic-box"><small>Escada encontrada</small><br><b>Nº ${esc(achada.num)}</b> · ${esc(achada.tipo)}<br><small>${esc(achada.material || '')} · ${esc(achada.tamanho || '')}</small></div><div class="hint"><b>É esta escada?</b></div><div class="two"><button type="button" class="btn btn-ghost" data-act="escCorrigir" data-k="${ei}">Corrigir</button><button type="button" class="btn btn-main" data-act="escOk" data-k="${ei}">Sim, é esta</button></div>`;
      return h + '</div>';
    }
    const ext = achada.tipo === 'Extensiva';
    h += `<div class="veic-box"><b>Nº ${esc(achada.num)}</b> · ${esc(achada.tipo)}<br><small>${esc(achada.material || '')} · ${esc(achada.tamanho || '')} · <button type="button" class="linkbtn" data-act="escCorrigir" data-k="${ei}" style="padding:0">trocar</button></small></div>
      <button type="button" class="linkbtn" data-act="escC" data-k="${ei}" style="align-self:flex-start;padding:0 0 6px">Marcar os itens que se aplicam como C</button>`;
    itens.forEach((it, n) => {
      const num = String(n + 1).padStart(2, '0');
      if (!(ext ? it.ext : it.a)) { h += `<div class="item na-auto"><p><span class="num">${num}</span><span>${esc(it.nome)}</span></p><span class="pill cinza">NA automático · não se aplica a ${ext ? 'extensiva' : 'escada tipo A / tesoura'}</span></div>`; return; }
      const x = e.itens[it.id] || {}, mau = x.v === 'NC';
      h += `<div class="item ${mau ? 'ruim' : ''}"><p><span class="num">${num}</span><span>${esc(it.nome)}</span></p>${opc(OPC.STD, x.v, 'escItem', `data-k="${ei}|${it.id}"`)}${mau ? blocoNC(x, 'escf', ei + '|' + it.id) + '<div class="aviso-nc">A escada não é bloqueada: o registro vai para a Segurança do Trabalho.</div>' : ''}</div>`;
    });
    return h + '</div>';
  }

  // ---------- conferência antes de enviar (o banco confere de novo) ----------
  function validar() {
    const E = [], ref = refItens(), m = D.modelos[d.modelo], km = +String(d.km).replace(/\D/g, '');
    if (!km) E.push('Km do painel');
    else if (d.tipo === 'saida' && veic().km && km < veic().km) E.push(`Km menor que o último registrado do veículo (${fmt(veic().km)}). Confira o painel.`);
    else if (d.tipo === 'volta' && km < d.base.km) E.push(`Km da volta menor que o da saída (${fmt(d.base.km)})`);
    if (d.comb == null) E.push('Nível de combustível'); if (!d.pneus) E.push('Estado dos pneus');
    ref.forEach(i => { const x = d.itens[i.id]; if (!x || !x.v) E.push(`${i.secao}: ${i.nome}`); else if (ruim(x.v) && (!x.foto || !(x.desc || '').trim())) E.push(`Foto e descrição: ${i.nome}`); });
    m.qtd.forEach(k => { if (d.qtd[k] === '' || d.qtd[k] == null) E.push('Quantidade: ' + k); });
    if (d.tipo === 'saida') {
      const itensE = D.modelos.escada ? D.modelos.escada.itens : [];
      d.escadas.forEach((e, ei) => { if (!e.ok) { E.push(`Escada ${ei + 1}: confirmar o nº`); return; }
        const a = D.escadas.find(x => x.num === e.num.trim()), ext = a.tipo === 'Extensiva';
        itensE.forEach((it, n) => { if (!(ext ? it.ext : it.a)) return; const x = e.itens[it.id];
          if (!x || !x.v) E.push(`Escada ${a.num}: item ${String(n + 1).padStart(2, '0')}`); else if (x.v === 'NC' && (!x.foto || !(x.desc || '').trim())) E.push(`Escada ${a.num}: foto e descrição do item ${n + 1}`); }); });
      const nums = d.escadas.filter(e => e.ok).map(e => e.num.trim()); if (new Set(nums).size < nums.length) E.push('A mesma escada foi informada duas vezes');
      if (!D.eu.sai_sem && !d.autorizador) E.push('Quem vai autorizar a saída');
    }
    d.avarias.forEach((a, ai) => { if (!a.tipo || !a.local || !a.foto || (a.local === 'Outro' && !(a.outro || '').trim())) E.push(`Avaria ${ai + 1}: tipo, local e foto`); });
    return E;
  }

  // fotos: no rascunho ficam como imagem; no envio vão para a pasta e viram caminho
  const blobDe = u => fetch(u).then(r => r.blob());
  async function subir(obj, rot) { if (obj.foto && obj.foto.startsWith('data:')) obj.foto = await enviarFoto(await blobDe(obj.foto), rot); }
  async function enviar() {
    d.erros = validar(); if (d.erros.length) { render(); document.querySelector('#s-ck .alert[role=alert]:last-of-type')?.scrollIntoView({ block: 'center' }); return; }
    d.erros = null; const x = JSON.parse(JSON.stringify(d));
    carregando(true, 'Enviando fotos…');
    try {
      for (const k in x.itens) { if (!ruim(x.itens[k].v)) { delete x.itens[k].foto; delete x.itens[k].desc; } await subir(x.itens[k], 'item'); }
      for (const a of x.avarias) await subir(a, 'avaria');
      for (const e of x.escadas) for (const k in e.itens) { if (e.itens[k].v !== 'NC') { delete e.itens[k].foto; delete e.itens[k].desc; } await subir(e.itens[k], 'escada'); }
      carregando(true, 'Registrando…');
      const dados = { km: x.km, comb: String(x.comb), pneus: x.pneus, itens: x.itens, qtd: x.qtd, avarias: x.avarias, obs: x.obs,
        escadas: x.escadas.map(e => ({ num: e.num.trim(), itens: e.itens })), autorizador: x.autorizador };
      let r;
      if (d.tipo === 'saida') r = await rpc('campo_ck_saida', { p_token: token, p_placa: d.placa, p_dados: dados });
      else r = await rpc('campo_ck_volta', { p_token: token, p_ck: d.ck, p_dados: dados });
      descartar(); fim(r); d = null;
    } catch (err) { V.aviso = 'Não foi registrado. ' + err.message; render(); window.scrollTo(0, 0); }
    finally { carregando(false); }
  }
  function fim(r) {
    const linhas = [['Veículo', esc(d.placa)], ['Checklist', `<span class="num">${esc(r.numero)}</span>`], ['Km', `<span class="num">${fmt(+String(d.km).replace(/\D/g, ''))}</span>`]];
    let msg;
    if (d.tipo === 'saida') {
      if (r.situacao === 'bloqueado') msg = `<strong>Veículo bloqueado.</strong> Item crítico com problema: ${esc((r.criticos || []).join(', '))}. Ele não pode sair e já foi para a Fernanda. Escolha outro veículo.`;
      else if (r.situacao === 'aut') msg = `Agora <b>${esc(r.autorizador)}</b> precisa autorizar. Avise a pessoa. Depois disso o veículo aparece para o porteiro.`;
      else msg = 'Vá até a portaria: o porteiro confere os itens e libera a saída.';
    } else msg = (r.criticos && r.criticos.length) ? `<strong>Item crítico com problema:</strong> ${esc(r.criticos.join(', '))}. Depois que o porteiro conferir, o veículo fica bloqueado até o conserto.` : 'Passe na portaria: o porteiro confere o que voltou e encerra o checklist.';
    $('recibo').innerHTML = linhas.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('') + `<div style="grid-column:1/-1;text-align:left;font-weight:400">${msg}</div>`;
    $('novo').hidden = false; tela('s-done'); contagem();
  }

  // ---------- autorizações ----------
  function resumo(c, comAut) {
    return `<div class="ped-h"><b class="placa">${esc(c.placa)}</b><span class="mut num">${esc(c.numero)}</span></div>
      <div class="ped-d">${esc(c.veiculo || '')}<br><b>${esc(c.motorista)}</b> · RE ${esc(c.motorista_re || '')}<br><span class="mut">Checklist às ${hora(c.saida_em)} · km ${fmt(+c.km)} · combustível ${nomeComb(+c.comb)}</span>
      ${comAut ? `<br>${c.autorizador ? `Autorizado por <b>${esc(c.autorizador)}</b>` : 'Sai sem autorização (a função permite)'}` : ''}
      <br>${c.problemas.length ? `<span class="bad">Itens com problema: ${esc(c.problemas.map(p => `${p.nome} (${p.v})${p.desc ? ': ' + p.desc : ''}`).join(', '))}</span>` : '<span style="color:var(--ok);font-weight:600">Todos os itens conformes</span>'}
      ${c.avarias.length ? `<br><span class="mut">Avarias: ${esc(c.avarias.map(a => `${a.tipo} ${a.local}${a.vezes > 1 ? ` (${a.vezes}x)` : ''}`).join(', '))}</span>` : ''}
      ${c.escadas.length ? `<br>Escada(s): ${c.escadas.map(e => esc(e.num) + (e.nc ? ' <span class="bad">com NC</span>' : '')).join(', ')}` : ''}
      ${c.obs ? `<br><span class="mut">Obs.: ${esc(c.obs)}</span>` : ''}</div>`;
  }
  function telaAut() {
    let h = appbar('Autorizações', quem()) + '<div class="pane">' + aviso() + '<div class="who" style="margin-top:-4px">Pedidos em que o motorista escolheu você. Confira e autorize ou recuse.</div><div class="peds">';
    h += aut.map(c => { const r = rec && rec.id === c.id ? rec : null;
      return `<div class="ped">${resumo(c)}${r ? `<div class="recusa"><div class="field"><label>Motivo da recusa</label>${opc(['Defeito no veículo', 'Outro motivo'], r.motivo, 'recMotivo')}</div>
        ${r.motivo === 'Defeito no veículo' ? `<div class="fotos">${fotoBox(r, 'recf', c.id, 'Foto do defeito')}</div>` : ''}
        ${r.motivo ? `<div class="field"><input id="rec-desc" data-in="recDesc" placeholder="${r.motivo === 'Defeito no veículo' ? 'Descreva o defeito' : 'Ex.: fora de escala'}" value="${esc(r.desc || '')}"></div>` : ''}
        ${r.motivo === 'Defeito no veículo' ? '<div class="aviso-nc">O veículo fica bloqueado e vai para a Fernanda.</div>' : r.motivo ? '<div class="hint">O veículo volta a ficar disponível.</div>' : ''}
        ${r.erro ? `<div class="err" style="text-align:left">${esc(r.erro)}</div>` : ''}
        <div class="ped-act"><button type="button" class="btn btn-sm btn-ghost" data-act="recVoltar">Voltar</button><button type="button" class="btn btn-sm btn-warn" data-act="recOk" data-v="${c.id}">Confirmar recusa</button></div></div>`
        : `<div class="ped-act"><button type="button" class="btn btn-sm btn-ghost" data-act="recusar" data-v="${c.id}">Recusar</button><button type="button" class="btn btn-sm btn-main" data-act="autorizar" data-v="${c.id}">Autorizar saída</button></div>`}</div>`; }).join('')
      || '<div class="vazio"><b>Nada aguardando você</b><span>Quando um motorista escolher seu nome, o pedido aparece aqui.</span></div>';
    return h + '</div><button type="button" class="btn btn-ghost" data-act="recarregar">Atualizar</button></div>';
  }

  // ---------- portaria ----------
  function cf(c, tipo) {
    const k = tipo + c.id; if (!conf[k]) conf[k] = { qtd: Object.assign({}, tipo === 'saida' ? c.qtd : c.volta.qtd), esc: {}, erro: '' };
    return conf[k];
  }
  function contar(c, tipo) {
    const x = cf(c, tipo), ks = Object.keys(c.qtd || {});
    if (!ks.length) return '<div class="auto" style="margin-top:8px">Moto: sem cones, calços, escadas ou fita para contar.</div>';
    const saiu = c.qtd_porteiro || c.qtd, ref = tipo === 'saida' ? c.qtd : c.volta.qtd;
    let h = `<div class="contagem"><div class="contagem-t">${tipo === 'saida' ? 'Conte o que está saindo' : 'Conte o que voltou'}</div>`;
    ks.forEach(k => { const v = x.qtd[k], dm = v - ref[k], ds = tipo === 'volta' ? v - saiu[k] : 0;
      h += `<div class="qtd"><span>${esc(k)}<br><span class="mut">${tipo === 'saida' ? `motorista informou ${ref[k]}` : `saiu ${saiu[k]} · motorista diz ${ref[k]}`}</span></span><span class="qtd-d">${tipo === 'volta' && ds < 0 ? `<span class="pill venc">${ds} faltando</span>` : dm !== 0 ? '<span class="pill prox">diferente</span>' : '<span class="pill ok">confere</span>'}<span class="passo"><button type="button" data-act="pqtd" data-k="${tipo}|${c.id}|${esc(k)}" data-v="-1" aria-label="menos">−</button><b class="num">${v}</b><button type="button" data-act="pqtd" data-k="${tipo}|${c.id}|${esc(k)}" data-v="1" aria-label="mais">+</button></span></span></div>`; });
    if (tipo === 'saida') h += c.escadas.map(e => `<label class="conf-esc"><input type="checkbox" class="chk" data-chk="${c.id}|${esc(e.num)}" ${x.esc[e.num] ? 'checked' : ''}> Escada nº <b class="num">${esc(e.num)}</b> (${esc(e.tipo || '')}) confere com a etiqueta</label>`).join('');
    return h + '</div>';
  }
  function telaPort() {
    let h = appbar('Portaria', esc(curto(eu.nome))) + '<div class="pane">' + aviso() + '<div class="mine"><h3>Saídas para liberar</h3></div><div class="peds">';
    h += port.saidas.map(c => { const x = cf(c, 'saida'), n = nl && nl.id === c.id ? nl : null, dif = Object.keys(c.qtd || {}).some(k => x.qtd[k] !== c.qtd[k]);
      return `<div class="ped">${resumo(c, true)}${contar(c, 'saida')}${x.erro ? `<div class="err" style="text-align:left">${esc(x.erro)}</div>` : ''}
        ${n ? `<div class="field" style="margin-top:8px"><input id="nl-desc" data-in="nlDesc" placeholder="Motivo (ex.: motorista não é o do checklist)" value="${esc(n.desc || '')}"></div>${n.erro ? `<div class="err" style="text-align:left">${esc(n.erro)}</div>` : ''}<div class="ped-act"><button type="button" class="btn btn-sm btn-ghost" data-act="nlVoltar">Voltar</button><button type="button" class="btn btn-sm btn-warn" data-act="nlOk" data-v="${c.id}">Confirmar</button></div>`
          : `<div class="ped-act"><button type="button" class="btn btn-sm btn-ghost" data-act="naoLiberar" data-v="${c.id}">Não liberar</button><button type="button" class="btn btn-sm ${dif ? 'btn-warn' : 'btn-main'}" data-act="liberar" data-v="${c.id}">${dif ? 'Liberar com diferença' : 'Liberar saída'}</button></div>${dif ? '<div class="hint">Vale a contagem do porteiro. A diferença fica registrada no checklist.</div>' : ''}`}</div>`; }).join('')
      || '<div class="vazio"><b>Nenhuma saída para liberar</b><span>Quando quem autoriza der o OK, o veículo aparece aqui.</span></div>';
    h += '</div><div class="mine"><h3>Voltas para conferir</h3></div><div class="peds">';
    h += port.voltas.map(c => `<div class="ped"><div class="ped-h"><b class="placa">${esc(c.placa)}</b><span class="mut num">${esc(c.numero)}</span></div><div class="ped-d">${esc(c.motorista)}<br>Km ${fmt(+c.km)} → <b class="num">${fmt(+c.volta.km)}</b> <span class="mut">(${fmt(c.volta.km - c.km)} km)</span>${c.volta.obs ? `<br><span class="mut">Obs.: ${esc(c.volta.obs)}</span>` : ''}</div>
      ${contar(c, 'volta')}${(c.volta.criticos || []).length ? `<div class="aviso-nc">Item crítico com problema: ${esc(c.volta.criticos.join(', '))}. O veículo será bloqueado.</div>` : ''}
      <div class="ped-act"><button type="button" class="btn btn-sm btn-main" data-act="confVolta" data-v="${c.id}">Confirmar volta</button></div></div>`).join('')
      || '<div class="vazio"><b>Nenhuma volta aguardando</b></div>';
    return h + '</div><button type="button" class="btn btn-ghost" data-act="recarregar">Atualizar</button></div>';
  }

  // ---------- veículos bloqueados ----------
  function telaBlq() {
    let h = appbar('Veículos bloqueados', quem()) + '<div class="pane">' + aviso() + '<div class="who" style="margin-top:-4px">Depois do conserto, descreva o que foi feito e desbloqueie. O veículo volta para a lista de disponíveis.</div><div class="peds">';
    h += blq.map(v => { const q = dq && dq.placa === v.placa ? dq : null;
      return `<div class="ped"><div class="ped-h"><b class="placa">${esc(v.placa)}</b><span class="pill venc">Bloqueado</span></div><div class="ped-d">${esc(v.modelo || '')}<br><span class="bad">${esc(v.motivo || '')}</span>${v.numero ? `<br><span class="mut">Checklist ${esc(v.numero)}</span>` : ''}</div>
        ${q ? `<div class="field" style="margin-top:8px"><label for="dq-desc">O que foi feito</label><input id="dq-desc" data-in="dqDesc" placeholder="Ex.: lâmpada de freio trocada" value="${esc(q.desc || '')}"></div>${q.erro ? `<div class="err" style="text-align:left">${esc(q.erro)}</div>` : ''}
          <div class="ped-act"><button type="button" class="btn btn-sm btn-ghost" data-act="dqVoltar">Voltar</button><button type="button" class="btn btn-sm btn-main" data-act="dqOk" data-v="${esc(v.placa)}">Desbloquear veículo</button></div>`
          : `<div class="ped-act"><button type="button" class="btn btn-sm btn-main" data-act="desbloquear" data-v="${esc(v.placa)}">Consertado, desbloquear</button></div>`}</div>`; }).join('')
      || '<div class="vazio"><b>Nenhum veículo bloqueado</b><span>Quando um checklist tiver item crítico com problema, o veículo aparece aqui.</span></div>';
    return h + '</div></div>';
  }

  // ---------- eventos ----------
  async function acao(a, b) {
    const k = b.dataset.k, v = b.dataset.v; V.aviso = null;
    const it = (o, key) => (o[key] = o[key] || {});
    switch (a) {
      case 'menu': guardar('voltou'); d = null; return abrirMenu(false);
      case 'home': guardar('voltou'); d = null; return abrir('home');
      case 'recarregar': return abrir(V.tela);
      case 'saida': d = novo('saida', v); V.tela = 'form'; break;
      case 'volta': { carregando(true, 'Abrindo…');
        try { const c = await rpc('campo_ck_meu', { p_token: token, p_ck: +v }); d = novo('volta', c.placa, c); d.ref = c.itens_ref; d.base = { km: c.saida.km, qtd: c.saida.qtd, qtd_porteiro: c.qtd_porteiro }; V.tela = 'form'; }
        catch (err) { V.aviso = err.message; } finally { carregando(false); } break; }
      case 'rascCont': { const r = rascunho(); const vv = r && D.veiculos.find(x => x.placa === r.d.placa);
        const okS = r && r.d.tipo === 'saida' && vv && vv.situacao === 'disp', okV = r && r.d.tipo === 'volta' && D.abertos.some(c => c.id === r.d.ck && c.situacao === 'uso');
        if (okS || okV) { d = r.d; d.erros = null; V.tela = 'form'; } else { descartar(); V.aviso = 'O veículo do rascunho mudou de situação. O rascunho foi descartado.'; } break; }
      case 'rascDesc': descartar(); break;
      case 'cancelar': if (!confirm('Cancelar este checklist? O veículo volta a ficar disponível.')) return;
        try { await rpc('campo_ck_cancelar', { p_token: token, p_ck: +v }); return abrir('home'); } catch (err) { V.aviso = err.message; } break;
      case 'pneus': d.pneus = v; break;
      case 'item': { const x = it(d.itens, k); x.v = v; if (!ruim(v)) { delete x.foto; delete x.desc; } break; }
      case 'secaoC': V.secoes[+v].i.forEach(i => { const x = d.itens[i.id]; if (!x || !x.v) d.itens[i.id] = { v: 'C' }; }); break;
      case 'qtd': { const m = D.modelos[d.modelo], cur = d.qtd[k] === '' || d.qtd[k] == null ? 0 : +d.qtd[k]; d.qtd[k] = Math.max(0, Math.min(99, cur + (+v)));
        if (d.tipo === 'saida' && k === m.qtd_escada) { while (d.escadas.length < d.qtd[k]) d.escadas.push({ num: '', ok: false, itens: {} }); d.escadas.length = d.qtd[k]; } break; }
      case 'escBuscar': d.escadas[+k].buscou = true; break;
      case 'escCorrigir': Object.assign(d.escadas[+k], { ok: false, buscou: false, itens: {} }); V.foco = 'esc-' + k; break;
      case 'escOk': { const e = d.escadas[+k], n = e.num.trim(); if (d.escadas.some((x, i) => i !== +k && x.ok && x.num.trim() === n)) { V.aviso = `A escada ${n} já foi informada.`; break; } e.ok = true; break; }
      case 'escC': { const e = d.escadas[+k], a = D.escadas.find(x => x.num === e.num.trim()), ext = a.tipo === 'Extensiva';
        D.modelos.escada.itens.forEach(i => { if ((ext ? i.ext : i.a) && !(e.itens[i.id] && e.itens[i.id].v)) e.itens[i.id] = { v: 'C' }; }); break; }
      case 'escItem': { const [ei, id] = k.split('|'), x = it(d.escadas[+ei].itens, id); x.v = v; if (v !== 'NC') { delete x.foto; delete x.desc; } break; }
      case 'avAdd': d.avarias.push({ tipo: '', local: '', foto: '' }); break;
      case 'avDel': d.avarias.splice(+k, 1); break;
      case 'avTipo': d.avarias[+k].tipo = v; break;
      case 'enviar': return enviar();
      case 'autorizar': try { carregando(true, 'Autorizando…'); await rpc('campo_aut_decidir', { p_token: token, p_ck: +v, p_aprovar: true }); carregando(false); return abrir('aut'); }
        catch (err) { V.aviso = err.message; } finally { carregando(false); } break;
      case 'recusar': rec = { id: +v }; break;
      case 'recVoltar': rec = null; break;
      case 'recMotivo': rec.motivo = v; rec.erro = ''; break;
      case 'recOk': { if (!rec.motivo) { rec.erro = 'Escolha o motivo.'; break; } if (!(rec.desc || '').trim()) { rec.erro = 'Escreva uma descrição.'; break; }
        const def = rec.motivo === 'Defeito no veículo'; if (def && !rec.foto) { rec.erro = 'Tire a foto do defeito.'; break; }
        carregando(true, 'Registrando…');
        try { const foto = def ? await enviarFoto(await blobDe(rec.foto), 'recusa') : null;
          await rpc('campo_aut_decidir', { p_token: token, p_ck: +v, p_aprovar: false, p_motivo: rec.motivo, p_desc: rec.desc, p_foto: foto }); carregando(false); return abrir('aut'); }
        catch (err) { rec.erro = err.message; } finally { carregando(false); } break; }
      case 'pqtd': { const [t, id, q] = k.split('|'), c = (t === 'saida' ? port.saidas : port.voltas).find(x => x.id === +id), x = cf(c, t); x.qtd[q] = Math.max(0, Math.min(99, x.qtd[q] + (+v))); x.erro = ''; break; }
      case 'liberar': { const c = port.saidas.find(x => x.id === +v), x = cf(c, 'saida');
        const falta = c.escadas.filter(e => !x.esc[e.num]); if (falta.length) { x.erro = `Confira a etiqueta da escada ${falta.map(e => e.num).join(', ')} antes de liberar.`; break; }
        carregando(true, 'Liberando…');
        try { await rpc('campo_port_saida', { p_token: token, p_ck: c.id, p_liberar: true, p_qtd: x.qtd }); carregando(false); return abrir('port'); }
        catch (err) { x.erro = err.message; } finally { carregando(false); } break; }
      case 'naoLiberar': nl = { id: +v }; V.foco = 'nl-desc'; break;
      case 'nlVoltar': nl = null; break;
      case 'nlOk': if (!(nl.desc || '').trim()) { nl.erro = 'Escreva o motivo.'; break; }
        try { await rpc('campo_port_saida', { p_token: token, p_ck: +v, p_liberar: false, p_qtd: {}, p_motivo: nl.desc }); return abrir('port'); } catch (err) { nl.erro = err.message; } break;
      case 'confVolta': { const c = port.voltas.find(x => x.id === +v), x = cf(c, 'volta'); carregando(true, 'Conferindo…');
        try { const r = await rpc('campo_port_volta', { p_token: token, p_ck: c.id, p_qtd: x.qtd }); carregando(false);
          if (r.faltas || r.bloqueado) alert((r.faltas ? 'Falta registrada: ' + r.faltas + '. ' : '') + (r.bloqueado ? 'O veículo ficou bloqueado.' : ''));
          return abrir('port'); }
        catch (err) { x.erro = err.message; } finally { carregando(false); } break; }
      case 'desbloquear': dq = { placa: v }; V.foco = 'dq-desc'; break;
      case 'dqVoltar': dq = null; break;
      case 'dqOk': if (!(dq.desc || '').trim()) { dq.erro = 'Escreva o que foi feito.'; break; }
        try { await rpc('campo_desbloquear', { p_token: token, p_placa: v, p_desc: dq.desc }); return abrir('blq'); } catch (err) { dq.erro = err.message; } break;
    }
    render();
  }
  function entrada(el) {
    const t = el.dataset.in, k = el.dataset.k, val = el.value;
    if (t === 'km') d.km = val.replace(/\D/g, '');
    else if (t === 'comb') setComb(+val);
    else if (t === 'obs') d.obs = val;
    else if (t === 'aut') d.autorizador = val;
    else if (t === 'itf') (d.itens[k] = d.itens[k] || {}).desc = val;
    else if (t === 'escf') { const [ei, id] = k.split('|'); d.escadas[+ei].itens[id].desc = val; }
    else if (t === 'escnum') { d.escadas[+k].num = val; d.escadas[+k].buscou = false; }
    else if (t === 'avLocal') { d.avarias[+k].local = val; render(); }
    else if (t === 'avOutro') d.avarias[+k].outro = val;
    else if (t === 'recDesc') rec.desc = val;
    else if (t === 'nlDesc') nl.desc = val;
    else if (t === 'dqDesc') dq.desc = val;
    if (d) guardarDepois();
  }
  let tG = null; function guardarDepois() { clearTimeout(tG); tG = setTimeout(() => guardar('auto'), 800); }
  async function foto(el) {
    const f = el.files[0]; if (!f) return; const t = el.dataset.foto, k = el.dataset.k;
    try {
      const b = await reduzir(f), u = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
      if (t === 'itf') (d.itens[k] = d.itens[k] || {}).foto = u;
      else if (t === 'escf') { const [ei, id] = k.split('|'); d.escadas[+ei].itens[id].foto = u; }
      else if (t === 'avf') d.avarias[+k].foto = u;
      else if (t === 'recf') rec.foto = u;
      if (d) guardar('foto');
    } catch (err) { V.aviso = err.message + ' Tire a foto de novo.'; }
    render();
  }

  function ligar() {
    const r = raiz();
    r.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && r.contains(b)) { e.preventDefault(); acao(b.dataset.act, b); } });
    r.addEventListener('input', e => { if (e.target.dataset.in && e.target.tagName !== 'SELECT') entrada(e.target); });
    r.addEventListener('change', e => { if (e.target.dataset.foto) foto(e.target); else if (e.target.dataset.chk) { const [id, n] = e.target.dataset.chk.split('|'); cf(port.saidas.find(x => x.id === +id), 'saida').esc[n] = e.target.checked; render(); } else if (e.target.dataset.in && e.target.tagName === 'SELECT') entrada(e.target); });
    // marcador de combustível: toque ou arraste
    let arr = false;
    const pos = ev => { const svg = ev.target.closest && ev.target.closest('.gauge-svg') || document.querySelector('#s-ck .gauge-svg'); if (!svg) return;
      const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse());
      let a = Math.atan2(168 - q.y, q.x - 150) * 180 / Math.PI; if (a < -90) a += 360;
      const f = Math.max(0, Math.min(1, (152 - a) / (152 - 28))); setComb(Math.round(f * 8)); guardarDepois(); };
    r.addEventListener('pointerdown', ev => { if (ev.target.closest('.gauge-svg')) { arr = true; ev.preventDefault(); pos(ev); } });
    document.addEventListener('pointermove', ev => { if (arr) pos(ev); });
    document.addEventListener('pointerup', () => { arr = false; });
  }
  ligar();
  return { abrir, guardar, ativo };
})();
