// FLEET — painel do PC: abas Checklist e Escadas, folhas impressas e cadastros do checklist.
// Usa o que o painel (painel.js) já tem: sb, rpc, eu, toast, esc, fmt, fdt, curto, iso.
const PCK = (() => {
  const CAT = { cesto: 'Cesto', munk: 'Munck', leve: 'Frota leve', moto: 'Moto' };
  const SIT = { disp: ['Disponível', 'ok'], aut: ['Aguardando autorização', 'prox'], port: ['Aguardando portaria', 'prox'],
    uso: ['Em uso', 'info'], volta: ['Volta a conferir', 'prox'], blq: ['Bloqueado', 'venc'] };
  const SIT_CK = { aut: 'Aguardando autorização', port: 'Aguardando portaria', uso: 'Em uso', volta: 'Volta a conferir', fim: 'Concluído',
    recusado: 'Não autorizado', barrado: 'Não liberado na portaria', bloqueado: 'Bloqueado na saída', cancelado: 'Cancelado', encerrado: 'Encerrado manualmente' };
  const ORD = { blq: 0, aut: 1, port: 2, volta: 3, uso: 4, disp: 5 };
  const TIPO_AL = { nc: 'Item com problema', falta: 'Falta na volta', avaria: 'Avaria nova', diferenca: 'Contagem diferente', bloqueio: 'Veículo bloqueado', recusa: 'Saída recusada' };
  const AV = { R: 'Riscado', A: 'Amassado', Q: 'Quebrado' };
  const NIV = ['E', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8', 'F'];
  const tag = s => `<span class="pill ${SIT[s][1]}">${SIT[s][0]}</span>`;
  const dt = t => t ? fdt(t) : '—';
  const ruim = v => !!v && v !== 'C' && v !== 'NA';

  let A = null, F = null, E = null, CAD = null, PP = [], AUD = null;
  let ordem = 'sit', busca = { offset: 0 }, buscaE = { offset: 0 }, res = null, resE = null, rec = null, enc = null, dq = null, excl = null;
  try { ordem = localStorage.getItem('fleet_ordem') || 'sit'; } catch (_) {}

  // ---------- abas ----------
  const SVG_LISTA = ICK.lista.replace(/46/g, '30'), SVG_ESC = ICK.escada;
  function montarAbas() {
    const t = $('tabs');
    t.insertAdjacentHTML('beforeend', `<button type="button" data-t="ck" aria-pressed="false" id="tab-btn-ck" hidden><span class="tab-l">${SVG_LISTA}Checklist</span></button>
      <button type="button" data-t="esc" aria-pressed="false" id="tab-btn-esc" hidden><span class="tab-l">${SVG_ESC}Escadas</span></button>`);
    $('tab-cad').insertAdjacentHTML('afterend', '<div class="tab" id="tab-ck" hidden></div><div class="tab" id="tab-esc" hidden></div>');
    document.body.insertAdjacentHTML('beforeend', '<div id="ck-modal" class="modal" hidden></div>');
    t.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
      $('tab-ck').hidden = b.dataset.t !== 'ck'; $('tab-esc').hidden = b.dataset.t !== 'esc';
      if (b.dataset.t === 'ck') carregarCk(); if (b.dataset.t === 'esc') carregarEsc(); });
  }
  async function iniciar() {
    try { A = await rpc('painel_ck_acesso'); } catch (_) { A = null; }
    if (!A) return;
    $('tab-btn-ck').hidden = !A.checklist; $('tab-btn-esc').hidden = !A.escadas;
    const antigo = eu && eu.papeis.some(p => ['admin', 'lider', 'gerente', 'assistente'].includes(p));
    // quem só autoriza ou é da Segurança do Trabalho não vê abastecimento nem troca de óleo
    document.querySelectorAll('#tabs [data-t=ab],#tabs [data-t=oleo]').forEach(b => b.hidden = !antigo);
    if (A.cadastros) { $('tab-btn-cad').hidden = false; montarCad(); }
    if (!antigo) { $('note').style.display = 'none'; const b = document.querySelector(A.checklist ? '#tabs [data-t=ck]' : '#tabs [data-t=esc]'); if (b) b.click(); }
  }

  // ---------- fotos ----------
  const urls = {};
  async function assinarFotos(lista) {
    const falta = [...new Set(lista.filter(p => p && !urls[p]))]; if (!falta.length) return;
    const { data } = await sb.storage.from('fotos').createSignedUrls(falta, 3600);
    (data || []).forEach(x => { if (x.signedUrl) urls[x.path] = x.signedUrl; });
  }
  const fotosDe = o => { const out = []; (function f(x) { if (!x || typeof x !== 'object') return; for (const k in x) { if (k === 'foto' && typeof x[k] === 'string' && x[k]) out.push(x[k]); else f(x[k]); } })(o); return out; };
  const thumb = (p, w = 58, h = 42) => p && urls[p] ? `<a href="${urls[p]}" target="_blank" rel="noopener"><img class="fthumb" src="${urls[p]}" alt="Foto" style="width:${w}px;height:${h}px;object-fit:cover"></a>` : p ? `<span class="fthumb" style="width:${w}px;height:${h}px">FOTO</span>` : '';

  // =================== ABA CHECKLIST ===================
  async function carregarCk() {
    $('tab-ck').innerHTML = '<p class="note">Carregando…</p>';
    try { F = await rpc('painel_ck_frota'); await assinarFotos([...fotosDe(F.atencao), ...fotosDe(F.avarias), ...fotosDe(F.autorizacoes)]); }
    catch (e) { $('tab-ck').innerHTML = `<div class="alert">${esc(e.message)}</div>`; return; }
    if (!res) await buscar();
    pintaCk();
  }
  function pintaCk() {
    const ver = A.opera || (eu && eu.papeis.includes('gerente')), h = [];
    if (F.autorizacoes.length) h.push(`<div class="card" style="border:2px solid var(--accent)"><div class="card-h"><h2>Aguardando sua autorização</h2><span class="sub">${F.autorizacoes.length} pedido(s)</span></div><div class="peds">${F.autorizacoes.map(cardAut).join('')}</div></div>`);
    if (ver) h.push(cardAtencao());
    h.push(cardFrota());
    if (ver) h.push(cardAvarias(), cardBusca());
    $('tab-ck').innerHTML = h.join('');
  }
  function resumo(c) {
    return `<div class="ped-h"><b class="placa">${esc(c.placa)}</b><span class="mut num">${esc(c.numero)}</span></div><div class="ped-d">${esc(c.veiculo || '')} · <b>${esc(c.motorista)}</b> · RE ${esc(c.motorista_re || '')}<br><span class="mut">Checklist às ${dt(c.saida_em)} · km ${fmt(+c.km)}</span>
      <br>${c.problemas.length ? `<span class="bad">Itens com problema: ${esc(c.problemas.map(p => `${p.nome} (${p.v})${p.desc ? ': ' + p.desc : ''}`).join(', '))}</span>` : '<span style="color:var(--ok);font-weight:600">Todos os itens conformes</span>'}
      ${c.avarias.length ? `<br><span class="mut">Avarias: ${esc(c.avarias.map(a => `${a.tipo} ${a.local}${a.vezes > 1 ? ` (${a.vezes}x)` : ''}`).join(', '))}</span>` : ''}
      ${c.escadas.length ? `<br>Escada(s): ${c.escadas.map(e => esc(e.num)).join(', ')}` : ''}</div>`;
  }
  function cardAut(c) {
    const r = rec && rec.id === c.id ? rec : null;
    return `<div class="ped">${resumo(c)}${r ? `<div class="recusa"><div class="chips">${['Defeito no veículo', 'Outro motivo'].map(m => `<button type="button" class="chip" data-a="recMotivo" data-v="${m}" aria-pressed="${r.motivo === m}">${m}</button>`).join('')}</div>
      ${r.motivo === 'Defeito no veículo' ? `<label class="btn btn-sm btn-ghost" style="justify-self:start">${r.foto ? 'Foto anexada ✓' : 'Anexar foto do defeito'}<input type="file" accept="image/*" data-foto="rec" hidden></label>` : ''}
      <input data-i="recDesc" placeholder="Descrição" value="${esc(r.desc || '')}" style="padding:8px 10px;border-radius:8px;border:1.5px solid var(--line);background:var(--surface)">
      ${r.motivo === 'Defeito no veículo' ? '<div class="aviso-nc">O veículo fica bloqueado.</div>' : ''}${r.erro ? `<div class="bad">${esc(r.erro)}</div>` : ''}
      <div class="ped-act"><button type="button" class="btn btn-sm btn-ghost" data-a="recVoltar">Voltar</button><button type="button" class="btn btn-sm btn-warn" data-a="recOk" data-v="${c.id}">Confirmar recusa</button></div></div>`
      : `<div class="ped-act"><button type="button" class="btn btn-sm btn-ghost" data-a="recusar" data-v="${c.id}">Recusar</button><button type="button" class="btn btn-sm btn-main" data-a="autorizar" data-v="${c.id}">Autorizar saída</button></div>`}</div>`;
  }
  function cardAtencao() {
    const L = F.atencao;
    return `<div class="card" style="border-color:var(--warn)"><div class="card-h"><h2>Precisa de atenção</h2><span class="sub">${L.length ? L.length + ' aviso(s)' : 'Nada pendente'}</span></div>
      ${L.length ? `<div class="tbl-wrap"><table><thead><tr><th>Quando</th><th>Veículo</th><th>Aviso</th><th>Foto</th><th></th></tr></thead><tbody>${L.map(a => `<tr><td class="num">${dt(a.em)}</td><td><b>${esc(a.placa || '')}</b><br><small class="mut">${esc(a.motorista || '')}</small></td>
        <td><span class="pill ${a.tipo === 'bloqueio' || a.tipo === 'falta' ? 'venc' : 'prox'}">${TIPO_AL[a.tipo] || a.tipo}</span><br>${esc(a.texto)}</td><td>${thumb(a.foto)}</td>
        <td style="white-space:nowrap">${a.ck ? `<button type="button" class="linkbtn" data-a="folha" data-v="${a.ck}">Ver</button>` : ''}${A.opera ? ` <button type="button" class="btn btn-sm btn-ghost" data-a="ciente" data-v="${a.id}">Ciente</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Quando aparecer item com problema, falta na volta, avaria nova ou bloqueio, o aviso aparece aqui.</p>'}</div>`;
  }
  function cardFrota() {
    const vs = F.veiculos.slice().sort((a, b) => ordem === 'placa' ? a.placa.localeCompare(b.placa)
      : ordem === 'cat' ? (a.modelo_ck.localeCompare(b.modelo_ck) || a.placa.localeCompare(b.placa)) : (ORD[a.situacao] - ORD[b.situacao] || a.placa.localeCompare(b.placa)));
    const n = s => F.veiculos.filter(v => v.situacao === s).length;
    return `<div class="card"><div class="card-h"><h2>Situação da frota</h2><span class="sub">${n('disp')} disponíveis · ${n('uso')} em uso · ${n('aut') + n('port') + n('volta')} aguardando · ${n('blq')} bloqueados</span>
      <div class="chips" style="margin-left:auto">${[['sit', 'Por situação'], ['cat', 'Por categoria'], ['placa', 'Por placa']].map(([k, t]) => `<button type="button" class="chip" data-a="ordem" data-v="${k}" aria-pressed="${ordem === k}">${t}</button>`).join('')}</div></div>
      <div class="tbl-wrap"><table><thead><tr><th>Veículo</th><th>Situação</th><th>Com quem / desde</th><th>Km</th><th></th></tr></thead><tbody>${vs.map(v => {
        const e = enc && enc.ck === v.ck ? enc : null, q = dq && dq.placa === v.placa ? dq : null;
        const ckv = v.ck || (v.bloqueio && v.bloqueio.checklist);
        let act = ckv ? `<button type="button" class="linkbtn" data-a="folha" data-v="${ckv}">Ver checklist</button>` : '';
        if (A.opera && ['aut', 'port'].includes(v.situacao)) act += ` <button type="button" class="btn btn-sm btn-ghost" data-a="cancelar" data-v="${v.ck}">Cancelar</button>`;
        if (A.opera && ['uso', 'volta'].includes(v.situacao)) act += e ? `<div class="enc"><input data-i="encMotivo" placeholder="Motivo (obrigatório)" value="${esc(e.motivo || '')}"><input data-i="encKm" class="num" inputmode="numeric" placeholder="Km atual (opcional)" value="${esc(e.km || '')}">${e.erro ? `<span class="bad">${esc(e.erro)}</span>` : ''}<div class="ped-act" style="margin:0"><button type="button" class="btn btn-sm btn-ghost" data-a="encVoltar">Voltar</button><button type="button" class="btn btn-sm btn-warn" data-a="encOk" data-v="${v.ck}">Encerrar</button></div></div>` : ` <button type="button" class="btn btn-sm btn-ghost" data-a="encerrar" data-v="${v.ck}">Encerrar</button>`;
        if (A.opera && v.situacao === 'blq') act += q ? `<div class="enc"><input data-i="dqDesc" placeholder="O que foi feito (obrigatório)" value="${esc(q.desc || '')}">${q.erro ? `<span class="bad">${esc(q.erro)}</span>` : ''}<div class="ped-act" style="margin:0"><button type="button" class="btn btn-sm btn-ghost" data-a="dqVoltar">Voltar</button><button type="button" class="btn btn-sm btn-main" data-a="dqOk" data-v="${esc(v.placa)}">Desbloquear</button></div></div>` : ` <button type="button" class="btn btn-sm btn-main" data-a="desbloquear" data-v="${esc(v.placa)}">Desbloquear</button>`;
        return `<tr><td><b>${esc(v.placa)}</b><br><small class="mut">${esc(v.modelo || '')} · ${CAT[v.modelo_ck]}</small></td><td>${tag(v.situacao)}${v.situacao === 'blq' && v.bloqueio ? `<br><small class="bad">${esc(v.bloqueio.motivo || '')}</small>` : ''}${v.situacao === 'aut' && v.autorizador ? `<br><small class="mut">aguardando ${esc(v.autorizador)}</small>` : ''}</td>
          <td>${v.com ? `${esc(v.com)}<br><small class="mut num">${dt(v.desde)}</small>` : '—'}</td><td class="num">${v.km ? fmt(v.km) : '—'}</td><td>${act}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  }
  function cardAvarias() {
    const L = F.avarias;
    return `<div class="card"><div class="card-h"><h2>Avarias por veículo</h2><span class="sub">Quantas vezes cada avaria já foi registrada pelos motoristas</span></div>
      ${L.length ? `<div class="tbl-wrap"><table><thead><tr><th>Veículo</th><th>Avaria</th><th>Menções</th><th>Primeira</th><th>Última</th><th>Foto</th></tr></thead><tbody>${L.map(a => `<tr><td><b>${esc(a.placa)}</b></td><td>${AV[a.tipo]} · ${esc(a.local)}</td><td class="num"><b>${a.vezes}x</b></td><td class="num">${dt(a.primeira)}</td><td class="num">${dt(a.ultima)}<br><small class="mut">${esc(a.quem || '')}</small></td><td>${thumb(a.foto)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Nenhuma avaria registrada ainda.</p>'}</div>`;
  }
  function cardBusca() {
    const b = busca;
    return `<div class="card"><div class="card-h"><h2>Buscar checklist</h2><span class="sub">Para consultar ou imprimir um checklist antigo</span></div>
      <div class="filters" style="margin-bottom:12px"><div class="field" style="flex:1 1 260px"><label for="b-txt">Nº, placa, motorista, RE ou código de verificação</label><input id="b-txt" data-i="bTxt" value="${esc(b.txt || '')}" placeholder="ex.: CK-2026-00125, CUI-3D39, Leandro"></div>
        <div class="field"><label for="b-de">De</label><input type="date" id="b-de" data-i="bDe" value="${esc(b.de || '')}"></div><div class="field"><label for="b-ate">Até</label><input type="date" id="b-ate" data-i="bAte" value="${esc(b.ate || '')}"></div>
        <div class="field"><label for="b-placa">Veículo</label><select id="b-placa" data-i="bPlaca"><option value="">Todos</option>${F.veiculos.map(v => `<option ${b.placa === v.placa ? 'selected' : ''}>${v.placa}</option>`).join('')}</select></div>
        <div class="field"><label for="b-sit">Situação</label><select id="b-sit" data-i="bSit"><option value="">Todas</option>${Object.entries(SIT_CK).map(([k, t]) => `<option value="${k}" ${b.sit === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label for="b-prob">Problemas</label><select id="b-prob" data-i="bProb"><option value="">Todos</option><option value="1" ${b.prob ? 'selected' : ''}>Só com NC, avaria ou falta</option></select></div>
        <button type="button" class="btn btn-sm btn-main" data-a="buscar">Buscar</button><button type="button" class="btn btn-sm btn-ghost" data-a="limpar">Limpar</button></div>
      ${!res || !res.length ? '<p class="mut">Nenhum checklist encontrado.</p>' : `<div class="tbl-wrap"><table><thead><tr><th>Nº</th><th>Veículo</th><th>Motorista</th><th>Saída</th><th>Volta</th><th>Situação</th><th></th></tr></thead><tbody>${res.slice(0, 20).map(c => `<tr>
        <td class="num">${esc(c.numero)}</td><td><b>${esc(c.placa)}</b></td><td>${esc(c.motorista)}<br><small class="mut">RE ${esc(c.re || '')}</small></td><td class="num">${dt(c.saida_em)}</td><td class="num">${dt(c.volta_em)}</td>
        <td>${SIT_CK[c.situacao]}${c.tem_nc || c.tem_falta || c.tem_avaria ? `<br><small class="bad">${[c.tem_nc && 'NC', c.tem_avaria && 'avaria', c.tem_falta && 'falta'].filter(Boolean).join(' · ')}</small>` : ''}</td>
        <td style="white-space:nowrap"><button type="button" class="btn btn-sm btn-ghost" data-a="folha" data-v="${c.id}">Imprimir</button>${A.admin ? (excl === c.id ? `<div class="excl"><span class="bad">Excluir ${esc(c.numero)}? Apaga o checklist, as fotos e as inspeções de escada dele. Não tem volta.</span><div class="ped-act" style="margin:0"><button type="button" class="btn btn-sm btn-ghost" data-a="exclVoltar">Não</button><button type="button" class="btn btn-sm btn-warn" data-a="exclOk" data-v="${c.id}">Sim, excluir</button></div></div>` : ` <button type="button" class="linkbtn btn-excl" data-a="excluir" data-v="${c.id}">Excluir</button>`) : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="ped-act">${busca.offset ? '<button type="button" class="btn btn-sm btn-ghost" data-a="anterior">Anteriores</button>' : ''}${res.length > 20 ? '<button type="button" class="btn btn-sm btn-ghost" data-a="mais">Mostrar mais</button>' : ''}</div>`}</div>`;
  }
  async function buscar() {
    try { res = await rpc('painel_ck_buscar', { p_texto: busca.txt || null, p_de: busca.de || null, p_ate: busca.ate || null, p_placa: busca.placa || null,
      p_situacao: busca.sit || null, p_problema: !!busca.prob, p_offset: busca.offset || 0 }); }
    catch (e) { res = []; if (!/Sem permissão/.test(e.message)) toast(e.message, true); }
  }

  // ---------- folha impressa do checklist ----------
  const quemE = (c, id) => id && c.nomes[id] ? c.nomes[id] : null;
  let parou = false;   // o checklist não chegou a sair: etapas seguintes ficam como "Não houve"
  const reg = (t, p, quando, sel) => p ? `<div class="freg"><small>${t}</small><b>${esc(p.nome)}</b><span class="num">RE ${esc(p.re || '')}<br>${esc(quando)}</span><div class="v">✓ ${sel}</div></div>` : `<div class="freg vazio"><small>${t}</small>${parou ? 'Não houve' : 'Pendente'}</div>`;
  function logos() { return '<span class="flogos"><img src="assets/fleet-branco.png?v=2" alt="FLEET"><span class="flogo-sep"></span><img class="fml" src="assets/logo-branco.png" alt="Manaus Luz"></span>'; }
  async function abrirFolha(id) {
    try { const c = await rpc('painel_ck_folha', { p_ck: +id }); await assinarFotos(fotosDe(c)); modal(folha(c), 'Folha A4 do checklist. Use Imprimir para imprimir ou salvar em PDF.'); }
    catch (e) { toast(e.message, true); }
  }
  function folha(c) {
    const m = c.modelo_info, ult = c.volta || c.saida, it = ult.itens || {}, ref = c.itens_ref;
    parou = ['bloqueado', 'recusado', 'barrado', 'cancelado'].includes(c.situacao);
    const probs = ref.filter(r => ruim((it[r.id] || {}).v)).length;
    const sit = c.situacao === 'fim' && c.volta && (c.volta.criticos || []).length && !c.desbloqueio ? 'BLOQUEADO' : (SIT_CK[c.situacao] || c.situacao).toUpperCase();
    const comb = i => { const n = Math.round(i / 2); return `<span style="display:inline-flex;gap:2px">${[1, 2, 3, 4].map(k => `<i style="width:14px;height:7px;border-radius:2px;background:${k <= n ? '#1f4ea8' : '#e3e6ec'}"></i>`).join('')}</span> <span class="num" style="font-size:11px">${NIV[i]}</span>`; };
    let h = `<div class="folha"><div class="ftopo"><div style="display:flex;gap:14px;align-items:center">${logos()}<div><h2>CHECKLIST DE VEÍCULO</h2><p>${esc(m.nome)} · ${esc(m.rev || '')} (digital)</p></div></div><div class="n"><small>Nº DO CHECKLIST</small><b>${esc(c.numero)}</b></div></div><div class="faixa"></div>
      <div class="fcards"><div class="fcard d"><small>Veículo</small><b>${esc(c.placa)}</b><div style="font-size:11px;color:var(--fm)">${esc(c.veiculo || '')}</div></div><div class="fcard"><small>Km saída</small><b>${fmt(c.saida.km)}</b>${c.volta ? `<div style="font-size:11px;color:var(--fm)">volta ${fmt(c.volta.km)}</div>` : ''}</div>
      <div class="fcard"><small>Combustível</small>${comb(ult.comb)}</div><div class="fcard"><small>Pneus</small><b style="font:700 15px var(--f-disp)">${esc((ult.pneus || '').toUpperCase())}</b></div>
      <div class="fcard ${probs || sit === 'BLOQUEADO' ? 'w' : ''}"><small>Situação</small><b>${esc(sit)}</b><div style="font-size:11px;color:var(--fm)">${probs} item(ns) com problema</div></div></div>
      <div class="fcards"><div class="fcard"><small>Saída</small><b style="font-size:13px">${dt(c.saida_em)}</b></div><div class="fcard"><small>Volta</small><b style="font-size:13px">${dt(c.volta_em)}</b></div>
      <div class="fcard"><small>Condutor</small><b style="font:600 13px var(--f-body)">${esc((quemE(c, c.motorista_id) || {}).nome || '')}</b></div><div class="fcard"><small>Saída autorizada por</small><b style="font:600 13px var(--f-body)">${c.autorizacao ? esc(quemE(c, c.autorizacao.por).nome) : c.saida.sai_sem ? 'Sem necessidade' : '—'}</b></div></div>`;
    const secoes = []; ref.forEach(i => { let s = secoes.find(x => x.t === i.secao); if (!s) secoes.push(s = { t: i.secao, i: [] }); s.i.push(i); });
    secoes.forEach(s => {
      const rs = s.i.filter(i => ruim((it[i.id] || {}).v)), meio = Math.ceil(s.i.length / 2);
      const lin = i => { const r = it[i.id] || {}, mau = ruim(r.v); return `<div class="fit ${mau ? 'r' : ''}"><span>${esc(i.nome)}</span>${i.critico ? '<span class="crit c1">CRÍTICO</span>' : ''}<span class="fchip c2 ${mau ? 'm' : r.v === 'NA' ? 'n' : ''}">${r.v || '—'}</span></div>`; };
      h += `<div class="fcat ${rs.length ? 'w' : ''}"><h4>${esc(s.t)}<em>${s.i.length} itens · ${rs.length} com problema</em></h4><div class="fcols"><div>${s.i.slice(0, meio).map(lin).join('')}</div><div>${s.i.slice(meio).map(lin).join('')}</div></div>
        ${rs.map(i => `<div class="fdef">${thumb(it[i.id].foto, 70, 50)}<div><small>${it[i.id].v} · ${esc(i.nome)}</small><div>${esc(it[i.id].desc || '')}</div></div></div>`).join('')}</div>`;
    });
    const ks = m.qtd || [];
    if (ks.length) { const qs = (c.portaria_saida && c.portaria_saida.qtd) || c.saida.qtd, qv = c.portaria_volta && c.portaria_volta.qtd;
      h += `<h5>Quantidades · saída x volta <span style="font:500 11px var(--f-body);color:var(--fm);text-transform:none;letter-spacing:0">contadas pelo porteiro</span></h5><div class="tbl-wrap"><table><thead><tr><th>Item</th><th>Saída</th><th>Volta</th><th>Diferença</th></tr></thead><tbody>${ks.map(k => { const vo = qv ? qv[k] : null, df = vo == null ? null : vo - qs[k];
        return `<tr class="${df < 0 ? 'dif' : ''}"><td>${esc(k)}</td><td class="num">${qs[k] ?? '—'}${c.saida.qtd[k] !== qs[k] ? ` <small>(motorista: ${c.saida.qtd[k]})</small>` : ''}</td><td class="num">${vo ?? '—'}${c.volta && qv && c.volta.qtd[k] !== vo ? ` <small>(motorista: ${c.volta.qtd[k]})</small>` : ''}</td><td class="num">${df == null ? '—' : df < 0 ? df + ' faltando' : 'ok'}</td></tr>`; }).join('')}</tbody></table></div>`; }
    if (c.escadas.length) h += `<h5>Escadas inspecionadas na saída</h5><div style="display:flex;gap:8px;flex-wrap:wrap">${c.escadas.map(e => `<div class="freg"><small>Escada ${esc(e.num)} · ${esc(e.numero)}</small><b>${esc(e.ref.tipo || '')} · ${esc(e.ref.tamanho || '')}</b><span class="${e.nc ? '' : 'v'}" style="${e.nc ? 'color:#e2711d;font-weight:700' : ''}">${e.nc ? 'COM NC (registro p/ Segurança)' : '✓ CONFORME'}</span></div>`).join('')}</div>`;
    if (c.avarias.length) h += `<h5>Avarias externas</h5><div style="display:flex;gap:8px;flex-wrap:wrap">${c.avarias.map(a => `<div class="freg" style="display:flex;gap:8px;align-items:center">${thumb(a.foto, 54, 40)}<div><b>${a.tipo} · ${AV[a.tipo]}</b>${esc(a.local)} · ${a.quando === 'saida' ? 'na saída' : 'na volta'}${a.vezes > 1 ? ` · <span style="color:#6b7280">mencionada ${a.vezes}x</span>` : ''}</div></div>`).join('')}</div>`;
    const obs = [c.saida.obs && 'Saída: ' + c.saida.obs, c.volta && c.volta.obs && 'Volta: ' + c.volta.obs].filter(Boolean).join(' ');
    if (obs) h += `<h5>Observações</h5><div style="border:1px solid var(--fl);border-radius:8px;padding:8px 10px">${esc(obs)}</div>`;
    const ps = c.portaria_saida, pv = c.portaria_volta;
    h += `<h5>Registros eletrônicos <span style="font:500 11px var(--f-body);color:var(--fm);text-transform:none;letter-spacing:0">cada etapa confirmada por login individual</span></h5><div class="fregs">
      ${reg('1 · Preenchido por', quemE(c, c.motorista_id), dt(c.saida_em), 'CONFIRMADO COM PIN')}
      ${c.saida.sai_sem ? '<div class="freg"><small>2 · Autorização</small><b>Não necessária</b><span class="num">função sai sem autorização</span></div>' : reg('2 · Saída autorizada por', c.autorizacao && quemE(c, c.autorizacao.por), c.autorizacao ? dt(c.autorizacao.em) + (c.autorizacao.via === 'celular' ? ' · pelo celular' : ' · pelo painel') : '', 'CONFIRMADO COM PIN')}
      ${c.recusa ? `<div class="freg" style="background:#fdeee2;border-color:#f3c39b"><small style="color:#e2711d">Não autorizado</small><b>${esc(quemE(c, c.recusa.por).nome)}</b><span class="num">${dt(c.recusa.em)}</span><div>${esc(c.recusa.motivo)}: ${esc(c.recusa.desc)}</div></div>` : ''}
      ${ps && ps.liberou === false ? `<div class="freg" style="background:#fdeee2;border-color:#f3c39b"><small style="color:#e2711d">3 · Portaria não liberou</small><b>${esc(quemE(c, ps.por).nome)}</b><span class="num">${dt(ps.em)}</span><div>${esc(ps.motivo || '')}</div></div>` : reg('3 · Saída liberada por (portaria)', ps && quemE(c, ps.por), ps ? dt(ps.em) : '', 'CONFIRMADO COM PIN')}
      ${c.encerramento ? `<div class="freg" style="background:#fdeee2;border-color:#f3c39b"><small style="color:#e2711d">4 · Encerrado manualmente</small><b>${esc(quemE(c, c.encerramento.por).nome)}</b><span class="num">${dt(c.encerramento.em)}</span><div>${esc(c.encerramento.motivo)}</div></div>`
        : c.cancelamento ? `<div class="freg" style="background:#f6f7f9"><small>Cancelado</small><b>${esc(quemE(c, c.cancelamento.por).nome)}</b><span class="num">${dt(c.cancelamento.em)}</span><div>${esc(c.cancelamento.motivo || '')}</div></div>`
        : reg('4 · Volta conferida por (portaria)', pv && quemE(c, pv.por), pv ? dt(pv.em) : '', 'CONFIRMADO COM PIN')}</div>
      ${c.desbloqueio ? `<div class="fdef" style="margin:12px 0 0;border-left:4px solid #1f8a5b;background:#e4f4ec;border-color:#b7dcc3"><div><small style="color:#1f8a5b">Desbloqueado</small><div><b>${esc(quemE(c, c.desbloqueio.por).nome)}</b> · RE ${esc(quemE(c, c.desbloqueio.por).re || '')} · ${dt(c.desbloqueio.em)}<br>Motivo do bloqueio: ${esc(c.desbloqueio.motivo || '')}<br>O que foi feito: ${esc(c.desbloqueio.desc)}</div></div></div>`
        : sit === 'BLOQUEADO' || c.situacao === 'bloqueado' || (c.recusa && c.recusa.motivo === 'Defeito no veículo') ? '<div class="fdef" style="margin:12px 0 0;border-left:4px solid #e2711d"><div><small>Veículo bloqueado</small><div>Desbloqueio: Fernanda, Deysimar ou mecânico, com a descrição do que foi feito.</div></div></div>' : ''}
      <div class="frod"><div>Documento gerado pelo FLEET, sistema de frota da Manaus Luz.<br>Código de verificação: <span class="fcod">${esc(c.codigo)}</span><br>Para conferir: painel → Checklist → Buscar checklist, digite o código</div><div style="margin-left:auto;text-align:right" class="num">Impresso em ${fdt(new Date())}<br>por ${esc(curto(eu.nome))}</div></div></div>`;
    return h;
  }
  function modal(html, txt) {
    const m = $('ck-modal');
    m.innerHTML = `<div class="modal-caixa"><div class="modal-barra"><span>${txt}</span><span style="display:flex;gap:8px"><button type="button" class="tema" data-a="imprimir">Imprimir</button><button type="button" class="tema" data-a="fechar">Fechar</button></span></div>${html}</div>`;
    m.hidden = false; document.body.classList.add('com-modal'); m.scrollTop = 0;
  }
  function fecharModal() { $('ck-modal').hidden = true; document.body.classList.remove('com-modal'); }

  // =================== ABA ESCADAS ===================
  async function carregarEsc() {
    $('tab-esc').innerHTML = '<p class="note">Carregando…</p>';
    try { E = await rpc('painel_esc_dados'); await assinarFotos(fotosDe(E.pendentes)); if (!resE) await buscarE(); }
    catch (e) { $('tab-esc').innerHTML = `<div class="alert">${esc(e.message)}</div>`; return; }
    pintaEsc();
  }
  async function buscarE() {
    try { resE = await rpc('painel_esc_buscar', { p_texto: buscaE.txt || null, p_de: buscaE.de || null, p_ate: buscaE.ate || null, p_escada: buscaE.num || null, p_resultado: buscaE.res || null, p_offset: buscaE.offset || 0 }); await assinarFotos(fotosDe(resE)); }
    catch (e) { resE = []; toast(e.message, true); }
  }
  function pintaEsc() {
    const P = E.pendentes, b = buscaE;
    const linhaInsp = i => `<tr><td class="num">${esc(i.numero)}</td><td><b>Nº ${esc(i.num)}</b><br><small class="mut">${esc(i.tipo || '')}</small></td><td>${esc(i.eletricista || '')}<br><small class="mut">RE ${esc(i.re || '')}</small></td><td><b>${esc(i.placa || '')}</b><br><small class="mut num">${esc(i.ck || '')}</small></td><td class="num">${dt(i.em)}</td>
      <td>${i.nao_saiu ? '<span class="pill cinza">Não saiu</span>' : i.nc ? `<span class="pill venc">Com NC</span>${i.ciente ? `<br><small class="mut">ciente: ${esc(i.ciente_por || '')}</small>` : ''}` : '<span class="pill ok">Conforme</span>'}</td>
      <td><button type="button" class="btn btn-sm btn-ghost" data-a="folhaE" data-v="${i.id}">Imprimir</button></td></tr>`;
    $('tab-esc').innerHTML = `
      <div class="card" style="border-color:var(--warn)"><div class="card-h"><h2>Não conformidades para tratar</h2><span class="sub">${P.length ? P.length + ' inspeção(ões) com NC sem ciência' : 'Nada pendente'}</span></div>
        ${P.length ? `<div class="peds">${P.map(i => `<div class="ped"><div class="ped-h"><b class="placa">Escada nº ${esc(i.num)}</b><span class="mut num">${esc(i.numero)}</span></div>
          <div class="ped-d">${esc(i.tipo || '')} · inspecionada por <b>${esc(i.eletricista || '')}</b> (RE ${esc(i.re || '')}) em ${dt(i.em)} · saiu no ${esc(i.placa || '')}</div>
          ${i.problemas.map(p => `<div class="fdef" style="margin:8px 0 0">${thumb(p.foto, 70, 50)}<div><small>Item ${String(p.ordem).padStart(2, '0')} · ${esc(p.nome)}</small><div>${esc(p.desc || '')}</div></div></div>`).join('')}
          <div class="ped-act"><input data-i="cieObs${i.id}" placeholder="O que foi feito (opcional)" style="flex:1 1 220px"><button type="button" class="btn btn-sm btn-main" data-a="cienteE" data-v="${i.id}">Ciente / tratado</button><button type="button" class="btn btn-sm btn-ghost" data-a="folhaE" data-v="${i.id}">Imprimir</button></div></div>`).join('')}</div>` : '<p class="mut">Quando um eletricista marcar NC numa escada, a inspeção aparece aqui.</p>'}</div>
      <div class="card"><div class="card-h"><h2>Escadas</h2><span class="sub">${E.escadas.filter(e => e.ativa).length} ativas · ${E.escadas.filter(e => e.fora).length} fora com algum veículo</span></div>
        <div class="tbl-wrap"><table><thead><tr><th>Nº</th><th>Tipo</th><th>Material · tamanho</th><th>Onde está</th><th>Última inspeção</th></tr></thead><tbody>${E.escadas.map(e => `<tr class="${e.ativa ? '' : 'inativo'}"><td><b class="num">${esc(e.num)}</b></td><td>${esc(e.tipo)}</td><td>${esc(e.material || '')} · ${esc(e.tamanho || '')}</td>
          <td>${!e.ativa ? 'Inativa' : e.fora ? `Com o <b>${esc(e.placa)}</b>` : 'Na base'}</td><td class="num">${e.ultima ? dt(e.ultima) + (e.ultima_nc ? ' <span class="bad">NC</span>' : '') : '—'}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-h"><h2>Buscar inspeção</h2><span class="sub">Para consultar ou imprimir uma inspeção antiga</span></div>
        <div class="filters" style="margin-bottom:12px"><div class="field" style="flex:1 1 260px"><label for="be-txt">Nº da escada, nº da inspeção, placa, eletricista, RE ou código</label><input id="be-txt" data-i="beTxt" value="${esc(b.txt || '')}" placeholder="ex.: 21, ESC-2026-00001, CUI-3D39"></div>
          <div class="field"><label for="be-de">De</label><input type="date" id="be-de" data-i="beDe" value="${esc(b.de || '')}"></div><div class="field"><label for="be-ate">Até</label><input type="date" id="be-ate" data-i="beAte" value="${esc(b.ate || '')}"></div>
          <div class="field"><label for="be-num">Escada</label><select id="be-num" data-i="beNum"><option value="">Todas</option>${E.escadas.map(e => `<option value="${esc(e.num)}" ${b.num === e.num ? 'selected' : ''}>${esc(e.num)} · ${esc(e.tipo)}</option>`).join('')}</select></div>
          <div class="field"><label for="be-res">Resultado</label><select id="be-res" data-i="beRes"><option value="">Todos</option>${[['conforme', 'Conforme'], ['nc', 'Com NC'], ['pendente', 'NC sem ciência'], ['nao_saiu', 'Não saiu']].map(([k, t]) => `<option value="${k}" ${b.res === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <button type="button" class="btn btn-sm btn-main" data-a="buscarE">Buscar</button><button type="button" class="btn btn-sm btn-ghost" data-a="limparE">Limpar</button></div>
        ${!resE || !resE.length ? '<p class="mut">Nenhuma inspeção encontrada.</p>' : `<div class="tbl-wrap"><table><thead><tr><th>Inspeção</th><th>Escada</th><th>Eletricista</th><th>Veículo</th><th>Data</th><th>Resultado</th><th></th></tr></thead><tbody>${resE.slice(0, 20).map(linhaInsp).join('')}</tbody></table></div>
          <div class="ped-act">${buscaE.offset ? '<button type="button" class="btn btn-sm btn-ghost" data-a="anteriorE">Anteriores</button>' : ''}${resE.length > 20 ? '<button type="button" class="btn btn-sm btn-ghost" data-a="maisE">Mostrar mais</button>' : ''}</div>`}</div>`;
  }
  async function abrirFolhaE(id) {
    try { const i = await rpc('painel_esc_folha', { p_insp: +id }); await assinarFotos(fotosDe(i)); modal(folhaE(i), 'Folha A4 da inspeção de escada. Use Imprimir para imprimir ou salvar em PDF.'); }
    catch (e) { toast(e.message, true); }
  }
  function folhaE(i) {
    const ext = (i.escada_ref.tipo || '') === 'Extensiva', its = i.itens || {};
    const nNC = i.problemas.length, nNA = Object.values(its).filter(x => x.v === 'NA').length, nC = Object.values(its).filter(x => x.v === 'C').length;
    const lin = (r, k) => { const v = (its[r.id] || {}).v || 'NA'; return `<div class="fit fe-it ${v === 'NC' ? 'r' : ''}"><span><span class="fe-n">${String(r.ordem).padStart(2, '0')}</span>${esc(r.nome)}</span><span class="fchip c2 ${v === 'NC' ? 'm' : v === 'NA' ? 'n' : ''}">${v}</span></div>`; };
    const ref = i.itens_ref, meio = Math.ceil(ref.length / 2);
    return `<div class="folha fe"><div class="ftopo"><div style="display:flex;gap:12px;align-items:center">${logos()}<span class="fe-selo">${ICK.escada.replace('stroke="currentColor"', 'stroke="#1c1a12"')}</span><div><h2>CHECKLIST DE ESCADA</h2><p>Inspeção visual · segurança em 1º lugar (digital)</p><span class="fe-tag">SEGURANÇA DO TRABALHO</span></div></div><div class="n"><small>Nº DA INSPEÇÃO</small><b>${esc(i.numero)}</b></div></div><div class="faixa"></div>
      <div class="fcards"><div class="fcard d"><small>Escada nº</small><b>${esc(i.escada_num)}</b><div style="font-size:11px;color:var(--fm)">conferida pela etiqueta</div></div><div class="fcard"><small>Tipo</small><b style="font:700 15px var(--f-disp)">${esc((i.escada_ref.tipo || '').toUpperCase())}</b><div style="font-size:11px;color:var(--fm)">${esc(i.escada_ref.material || '')} · ${esc(i.escada_ref.tamanho || '')}</div></div>
        <div class="fcard"><small>Saiu no veículo</small><b>${esc(i.placa || '—')}</b><div style="font-size:11px;color:var(--fm)">${esc(i.ck || '')}${i.nao_saiu ? ' · não saiu' : ''}</div></div><div class="fcard ${nNC ? 'w' : ''}"><small>Resultado</small><b>${nNC ? nNC + ' NC' : 'CONFORME'}</b><div style="font-size:11px;color:var(--fm)">${nNC ? (i.ciente ? 'ciente pela Segurança' : 'enviado à Segurança') : 'sem problemas'}</div></div></div>
      <div class="fcards"><div class="fcard"><small>Data da inspeção</small><b style="font-size:13px">${dt(i.em)}</b></div><div class="fcard"><small>Inspecionado por</small><b style="font:600 13px var(--f-body)">${esc(i.eletricista || '')}</b></div><div class="fcard"><small>RE</small><b style="font-size:13px">${esc(i.re || '')}</b></div></div>
      <div class="fcat ${nNC ? 'w' : ''}"><h4>Itens verificados<em>${ref.length} itens · ${nC} C · ${nNC} NC · ${nNA} NA</em></h4><div class="fcols"><div>${ref.slice(0, meio).map(lin).join('')}</div><div>${ref.slice(meio).map(lin).join('')}</div></div>
        ${i.problemas.map(p => `<div class="fdef">${thumb(p.foto, 70, 50)}<div><small>Não conforme · item ${String(p.ordem).padStart(2, '0')}</small><div>${esc(p.desc || '')}</div></div></div>`).join('')}</div>
      <h5>Registros eletrônicos <span style="font:500 11px var(--f-body);color:var(--fm);text-transform:none;letter-spacing:0">cada etapa confirmada por login individual</span></h5><div class="fregs">
        <div class="freg"><small>1 · Inspecionado por</small><b>${esc(i.eletricista || '')}</b><span class="num">RE ${esc(i.re || '')}<br>${dt(i.em)}</span><div class="v">✓ CONFIRMADO COM PIN</div></div>
        ${nNC ? (i.ciente ? `<div class="freg"><small>2 · Ciência da Segurança</small><b>${esc(i.ciente_por || '')}</b><span class="num">${dt(i.ciente_em)}</span><div class="v">✓ CIENTE / TRATADO</div>${i.ciente_obs ? `<div>${esc(i.ciente_obs)}</div>` : ''}</div>` : '<div class="freg vazio"><small>2 · Ciência da Segurança</small>Pendente</div>') : '<div class="freg"><small>2 · Ciência da Segurança</small><b>Não necessária</b><span class="num">sem não conformidade</span></div>'}</div>
      <div class="fe-lema">Em caso de não conformidade, a escada não deve ser utilizada: informe o responsável imediato.</div>
      <div class="frod"><div>Documento gerado pelo FLEET, sistema de frota da Manaus Luz.<br>Código de verificação: <span class="fcod">${esc(i.codigo)}</span><br>Para conferir: painel → Escadas → Buscar inspeção</div><div style="margin-left:auto;text-align:right" class="num">Impresso em ${fdt(new Date())}<br>por ${esc(curto(eu.nome))}</div></div></div>`;
  }

  // =================== CADASTROS DO CHECKLIST ===================
  function montarCad() {
    if ($('cad-ck')) return carregarCad();
    $('tab-cad').insertAdjacentHTML('beforeend', '<div id="cad-ck"></div>');
    // a assistente vê só os cadastros do checklist
    if (!A.itens) [...$('tab-cad').children].forEach(n => { if (n.id !== 'cad-ck') n.hidden = true; });
    carregarCad();
  }
  async function carregarCad() {
    try {
      const cols = 'id,nome,re,funcao,papeis,ativo,dirige_moto,dirige_leve,dirige_cesto,dirige_munk,afastado,autoriza,sai_sem_autorizacao';
      const [c, p, v] = await Promise.all([rpc('painel_ck_cadastros'), sb.from('pessoas').select(cols).order('nome'), sb.from('veiculos').select('placa,modelo,tipo,categoria,ativo,modelo_ck,usa_arla,equip_padrao').order('placa')]);
      CAD = c; CAD.veiculos = v.data || []; PP = p.data || [];
      if (A.admin) AUD = await rpc('painel_auditoria', { p_offset: 0 });
    } catch (e) { $('cad-ck').innerHTML = `<div class="alert">${esc(e.message)}</div>`; return; }
    pintaCad();
  }
  let filtroP = '', modItem = 'cesto', edVeic = null, edEsc = null;
  function pintaCad() {
    const chk = (k, on, dis) => `<input type="checkbox" class="chk" data-perm="${k}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}>`;
    const ps = PP.filter(p => p.ativo && (!filtroP || (p.nome + ' ' + (p.re || '')).toLowerCase().includes(filtroP.toLowerCase())));
    const ms = CAD.modelos.filter(m => m.modelo !== 'escada'), mItem = CAD.modelos.find(m => m.modelo === modItem);
    let h = `<div class="card"><div class="card-h"><h2>Permissões do checklist</h2><span class="sub">O que cada pessoa pode dirigir no checklist, se autoriza a saída de outros e se sai sem autorização. Marque e clique em Salvar na linha.</span></div>
      <div class="field" style="max-width:320px"><input data-i="filtroP" placeholder="Filtrar por nome ou RE" value="${esc(filtroP)}"></div>
      <div class="tbl-wrap"><table><thead><tr><th>Pessoa</th><th>Moto</th><th>Leve</th><th>Cesto</th><th>Munck</th><th>Afastado</th><th>Autoriza</th><th>Sai sem autorização</th><th></th></tr></thead><tbody>
      ${ps.map(p => `<tr data-p="${p.id}"><td><b>${esc(curto(p.nome))}</b><br><small class="mut">RE ${esc(p.re || '—')} · ${esc(p.funcao || '')}</small></td><td>${chk('moto', p.dirige_moto)}</td><td>${chk('leve', p.dirige_leve)}</td><td>${chk('cesto', p.dirige_cesto)}</td><td>${chk('munk', p.dirige_munk)}</td><td>${chk('afastado', p.afastado)}</td><td>${chk('autoriza', p.autoriza)}</td><td>${chk('sai', p.sai_sem_autorizacao)}</td>
        <td><button type="button" class="btn btn-sm btn-ghost" data-a="salvarPerm" data-v="${p.id}">Salvar</button></td></tr>`).join('')}</tbody></table></div></div>`;
    h += `<div class="card"><div class="card-h"><h2>Veículos no checklist</h2><span class="sub">Modelo de checklist de cada veículo, ARLA 32 e os equipamentos que ele costuma levar (o celular já vem com essas quantidades).</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Veículo</th><th>Modelo de checklist</th><th>Usa ARLA 32</th><th>Equipamentos padrão</th><th></th></tr></thead><tbody>
      ${CAD.veiculos.filter(v => v.ativo).map(v => { const ed = edVeic === v.placa, m = ms.find(x => x.modelo === v.modelo_ck);
        return `<tr data-v="${esc(v.placa)}"><td><b>${esc(v.placa)}</b><br><small class="mut">${esc(v.modelo || '')} ${esc(v.tipo || '')}</small></td>
        <td>${ed ? `<select data-ve="modelo"><option value="">Fora do checklist</option>${ms.map(x => `<option value="${x.modelo}" ${x.modelo === v.modelo_ck ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>` : m ? esc(m.nome) : '<span class="mut">Fora do checklist</span>'}</td>
        <td>${ed ? `<input type="checkbox" class="chk" data-ve="arla" ${v.usa_arla ? 'checked' : ''}>` : v.usa_arla ? 'Sim' : 'Não'}</td>
        <td>${ed && m ? `<div class="eqp">${m.qtd.map(k => `<label class="eqp-i">${esc(k)} <input class="num" data-eq="${esc(k)}" inputmode="numeric" style="width:56px;padding:4px 6px;border-radius:6px;border:1.5px solid var(--line);background:var(--surface)" value="${v.equip_padrao && v.equip_padrao[k] != null ? v.equip_padrao[k] : ''}"></label>`).join('')}</div>` : v.equip_padrao ? esc(Object.entries(v.equip_padrao).map(([k, q]) => `${k} ${q}`).join(' · ')) : '<span class="mut">em branco</span>'}</td>
        <td>${ed ? `<button type="button" class="btn btn-sm btn-ghost" data-a="vCancelar">Cancelar</button> <button type="button" class="btn btn-sm btn-main" data-a="vSalvar" data-v="${esc(v.placa)}">Salvar</button>` : `<button type="button" class="btn btn-sm btn-ghost" data-a="vEditar" data-v="${esc(v.placa)}">Editar</button>`}</td></tr>`; }).join('')}</tbody></table></div></div>`;
    const tiposE = ['Extensiva', 'Tesoura', 'Tesoura acesso duplo', 'A'];
    const linhaE = (e, novo) => { const ed = novo || edEsc === e.num;
      return ed ? `<tr data-e="${novo ? '' : esc(e.num)}"><td><input data-ee="num" class="num" value="${esc(e.num || '')}" style="width:80px"></td><td><select data-ee="tipo">${tiposE.map(t => `<option ${e.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td><td><input data-ee="material" value="${esc(e.material || '')}" style="width:100px"></td><td><input data-ee="tamanho" value="${esc(e.tamanho || '')}" style="width:80px"></td><td><input type="checkbox" class="chk" data-ee="ativa" ${e.ativa !== false ? 'checked' : ''}> ativa</td>
        <td><button type="button" class="btn btn-sm btn-ghost" data-a="eCancelar">Cancelar</button> <button type="button" class="btn btn-sm btn-main" data-a="eSalvar">Salvar</button></td></tr>`
        : `<tr class="${e.ativa ? '' : 'inativo'}"><td><b class="num">${esc(e.num)}</b></td><td>${esc(e.tipo)}</td><td>${esc(e.material || '')}</td><td>${esc(e.tamanho || '')}</td><td>${e.ativa ? 'Ativa' : 'Inativa'}</td><td><button type="button" class="btn btn-sm btn-ghost" data-a="eEditar" data-v="${esc(e.num)}">Editar</button></td></tr>`; };
    h += `<div class="card"><div class="card-h"><h2>Escadas</h2><span class="sub">O nº é o da etiqueta e é comparado exatamente: 001 e 01 são escadas diferentes. Inativar não apaga o histórico.</span><button type="button" class="btn btn-sm btn-main" data-a="eNova">+ Nova escada</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Nº</th><th>Tipo</th><th>Material</th><th>Tamanho</th><th>Situação</th><th></th></tr></thead><tbody>${edEsc === '' ? linhaE({ ativa: true, tipo: 'Extensiva' }, true) : ''}${CAD.escadas.map(e => linhaE(e)).join('')}</tbody></table></div></div>`;
    if (A.itens) {
      const its = CAD.itens.filter(i => i.modelo === modItem), secs = [...new Set(its.map(i => i.secao))];
      h += `<div class="card"><div class="card-h"><h2>Itens do checklist</h2><span class="sub">Editar o texto, marcar como crítico (NC bloqueia o veículo) e ativar ou inativar. Checklists já feitos guardam o texto do dia.</span></div>
        <div class="chips" style="margin-bottom:10px">${CAD.modelos.map(m => `<button type="button" class="chip" data-a="modItem" data-v="${m.modelo}" aria-pressed="${m.modelo === modItem}">${esc(m.modelo === 'escada' ? 'Escada' : CAT[m.modelo])}</button>`).join('')}</div>
        ${secs.map(s => `<div class="secao-ed"><div class="secao-ed-h"><h3>${esc(s)}</h3></div><table class="itens-ed"><thead><tr><th>Item</th>${modItem === 'escada' ? '<th>Extensiva</th><th>Tesoura / A</th>' : '<th>Crítico</th>'}<th>Ativo</th><th></th></tr></thead><tbody>
          ${its.filter(i => i.secao === s).map(i => `<tr class="${i.ativo ? '' : 'inativo'}" data-it="${i.id}"><td><input class="it-in" data-ie="nome" value="${esc(i.nome)}"></td>${modItem === 'escada' ? `<td><input type="checkbox" class="chk" data-ie="ext" ${i.esc_extensiva ? 'checked' : ''}></td><td><input type="checkbox" class="chk" data-ie="a" ${i.esc_a ? 'checked' : ''}></td>` : `<td><input type="checkbox" class="chk" data-ie="critico" ${i.critico ? 'checked' : ''}></td>`}<td><input type="checkbox" class="chk" data-ie="ativo" ${i.ativo ? 'checked' : ''}></td><td><button type="button" class="btn btn-sm btn-ghost" data-a="itSalvar" data-v="${i.id}">Salvar</button></td></tr>`).join('')}</tbody></table>
          <div class="add-it" data-sec="${esc(s)}"><input data-ni="nome" placeholder="Novo item nesta seção">${modItem === 'escada' ? '' : '<label><input type="checkbox" class="chk" data-ni="critico"> crítico</label>'}<button type="button" class="btn btn-sm btn-ghost" data-a="itNovo">Adicionar</button></div></div>`).join('')}
        ${mItem && mItem.qtd && mItem.qtd.length ? `<p class="mut">Quantidades contadas neste modelo: ${esc(mItem.qtd.join(', '))}.</p>` : ''}</div>`;
    }
    if (A.admin && AUD) h += `<div class="card"><div class="card-h"><h2>Histórico de edições</h2><span class="sub">Quem mudou o quê nos cadastros. Só o administrador vê.</span></div>
      ${AUD.length ? `<div class="tbl-wrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Onde</th><th>O que mudou</th></tr></thead><tbody>${AUD.slice(0, 50).map(a => `<tr><td class="num">${dt(a.em)}</td><td>${esc(curto(a.por_nome || ''))}</td><td>${esc(a.tabela)} · <b>${esc(a.chave || '')}</b><br><small class="mut">${esc(a.acao)}</small></td><td><small>${difTxt(a)}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Nenhuma edição registrada ainda.</p>'}</div>`;
    $('cad-ck').innerHTML = h;
  }
  function difTxt(a) {
    if (!a.antes || !a.depois) return esc(JSON.stringify(a.depois || a.antes || {}).slice(0, 200));
    return Object.keys(a.depois).filter(k => JSON.stringify(a.antes[k]) !== JSON.stringify(a.depois[k])).map(k => `<b>${esc(k)}</b>: ${esc(JSON.stringify(a.antes[k]))} → ${esc(JSON.stringify(a.depois[k]))}`).join('<br>') || '—';
  }

  // =================== EVENTOS ===================
  async function act(a, b) {
    const v = b.dataset.v;
    const vai = async (fn, ok) => { try { await fn(); if (ok) toast(ok); return true; } catch (e) { toast(e.message, true); return false; } };
    switch (a) {
      case 'ordem': ordem = v; try { localStorage.setItem('fleet_ordem', v); } catch (_) {} return pintaCk();
      case 'folha': return abrirFolha(v);
      case 'folhaE': return abrirFolhaE(v);
      case 'imprimir': return window.print();
      case 'fechar': return fecharModal();
      case 'autorizar': if (await vai(() => rpc('painel_aut_decidir', { p_ck: +v, p_aprovar: true }), 'Saída autorizada. Agora aparece para o porteiro.')) carregarCk(); return;
      case 'recusar': rec = { id: +v }; return pintaCk();
      case 'recVoltar': rec = null; return pintaCk();
      case 'recMotivo': rec.motivo = v; rec.erro = ''; return pintaCk();
      case 'recOk': { if (!rec.motivo) { rec.erro = 'Escolha o motivo.'; return pintaCk(); } if (!(rec.desc || '').trim()) { rec.erro = 'Escreva uma descrição.'; return pintaCk(); }
        const def = rec.motivo === 'Defeito no veículo'; if (def && !rec.foto) { rec.erro = 'Anexe a foto do defeito.'; return pintaCk(); }
        if (await vai(async () => { const foto = def ? await enviarFoto(rec.foto, 'recusa') : null; await rpc('painel_aut_decidir', { p_ck: +v, p_aprovar: false, p_motivo: rec.motivo, p_desc: rec.desc, p_foto: foto }); }, 'Recusa registrada.')) { rec = null; carregarCk(); } return; }
      case 'ciente': if (await vai(() => rpc('painel_ck_ciente', { p_alerta: +v }))) carregarCk(); return;
      case 'cancelar': { const m = prompt('Motivo do cancelamento:'); if (!m || !m.trim()) return; if (await vai(() => rpc('painel_ck_cancelar', { p_ck: +v, p_motivo: m }), 'Checklist cancelado. Veículo disponível.')) carregarCk(); return; }
      case 'encerrar': enc = { ck: +v }; return pintaCk();
      case 'encVoltar': enc = null; return pintaCk();
      case 'encOk': { if (!(enc.motivo || '').trim()) { enc.erro = 'Escreva o motivo.'; return pintaCk(); } const km = enc.km ? +String(enc.km).replace(/\D/g, '') : null;
        if (await vai(() => rpc('painel_ck_encerrar', { p_ck: +v, p_motivo: enc.motivo, p_km: km }), 'Encerrado. Veículo disponível.')) { enc = null; carregarCk(); } return; }
      case 'desbloquear': dq = { placa: v }; return pintaCk();
      case 'dqVoltar': dq = null; return pintaCk();
      case 'dqOk': if (!(dq.desc || '').trim()) { dq.erro = 'Escreva o que foi feito.'; return pintaCk(); }
        if (await vai(() => rpc('painel_desbloquear', { p_placa: v, p_desc: dq.desc }), 'Veículo desbloqueado.')) { dq = null; carregarCk(); } return;
      case 'buscar': busca.offset = 0; await buscar(); return pintaCk();
      case 'limpar': busca = { offset: 0 }; await buscar(); return pintaCk();
      case 'mais': busca.offset += 20; await buscar(); return pintaCk();
      case 'anterior': busca.offset = Math.max(0, busca.offset - 20); await buscar(); return pintaCk();
      case 'excluir': excl = +v; return pintaCk();
      case 'exclVoltar': excl = null; return pintaCk();
      case 'exclOk': if (await vai(async () => { const fotos = await rpc('painel_ck_excluir', { p_ck: +v }); if (fotos && fotos.length) await sb.storage.from('fotos').remove(fotos); }, 'Checklist excluído.')) { excl = null; await buscar(); carregarCk(); } return;
      case 'cienteE': { const obs = (document.querySelector(`[data-i="cieObs${v}"]`) || {}).value; if (await vai(() => rpc('painel_esc_ciente', { p_insp: +v, p_obs: obs || null }), 'Registrado.')) { resE = null; carregarEsc(); } return; }
      case 'buscarE': buscaE.offset = 0; await buscarE(); return pintaEsc();
      case 'limparE': buscaE = { offset: 0 }; await buscarE(); return pintaEsc();
      case 'maisE': buscaE.offset += 20; await buscarE(); return pintaEsc();
      case 'anteriorE': buscaE.offset = Math.max(0, buscaE.offset - 20); await buscarE(); return pintaEsc();
      // cadastros
      case 'salvarPerm': { const tr = b.closest('tr'), g = k => tr.querySelector(`[data-perm="${k}"]`).checked;
        if (await vai(() => rpc('painel_salvar_permissoes', { p_pessoa: v, p_moto: g('moto'), p_leve: g('leve'), p_cesto: g('cesto'), p_munk: g('munk'), p_afastado: g('afastado'), p_autoriza: g('autoriza'), p_sai_sem: g('sai') }), 'Permissões salvas.')) carregarCad(); return; }
      case 'vEditar': edVeic = v; return pintaCad();
      case 'vCancelar': edVeic = null; return pintaCad();
      case 'vSalvar': { const tr = b.closest('tr'), eq = {}; tr.querySelectorAll('[data-eq]').forEach(i => { if (i.value !== '') eq[i.dataset.eq] = +i.value.replace(/\D/g, ''); });
        if (await vai(() => rpc('painel_salvar_veiculo_ck', { p_placa: v, p_modelo_ck: tr.querySelector('[data-ve=modelo]').value || null, p_usa_arla: tr.querySelector('[data-ve=arla]').checked, p_equip: eq }), 'Veículo salvo.')) { edVeic = null; carregarCad(); } return; }
      case 'eNova': edEsc = ''; return pintaCad();
      case 'eEditar': edEsc = v; return pintaCad();
      case 'eCancelar': edEsc = null; return pintaCad();
      case 'eSalvar': { const tr = b.closest('tr'), g = k => tr.querySelector(`[data-ee="${k}"]`);
        if (await vai(() => rpc('painel_salvar_escada', { p_num_antigo: tr.dataset.e || null, p_num: g('num').value, p_tipo: g('tipo').value, p_material: g('material').value, p_tamanho: g('tamanho').value, p_ativa: g('ativa').checked }), 'Escada salva.')) { edEsc = null; carregarCad(); } return; }
      case 'modItem': modItem = v; return pintaCad();
      case 'itSalvar': { const tr = b.closest('tr'), g = k => tr.querySelector(`[data-ie="${k}"]`);
        if (await vai(() => rpc('painel_salvar_item', { p_id: +v, p_modelo: modItem, p_secao: null, p_nome: g('nome').value, p_critico: g('critico') ? g('critico').checked : false, p_ativo: g('ativo').checked, p_ext: g('ext') ? g('ext').checked : null, p_a: g('a') ? g('a').checked : null }), 'Item salvo.')) carregarCad(); return; }
      case 'itNovo': { const box = b.closest('.add-it'), nome = box.querySelector('[data-ni=nome]').value, cr = box.querySelector('[data-ni=critico]');
        if (await vai(() => rpc('painel_salvar_item', { p_id: null, p_modelo: modItem, p_secao: box.dataset.sec, p_nome: nome, p_critico: cr ? cr.checked : false, p_ativo: true }), 'Item adicionado.')) carregarCad(); return; }
    }
  }
  function entrada(el) {
    const k = el.dataset.i, val = el.value;
    if (k === 'recDesc') rec.desc = val; else if (k === 'encMotivo') enc.motivo = val; else if (k === 'encKm') enc.km = val; else if (k === 'dqDesc') dq.desc = val;
    else if (k === 'bTxt') busca.txt = val; else if (k === 'bDe') busca.de = val; else if (k === 'bAte') busca.ate = val; else if (k === 'bPlaca') busca.placa = val; else if (k === 'bSit') busca.sit = val; else if (k === 'bProb') busca.prob = val;
    else if (k === 'beTxt') buscaE.txt = val; else if (k === 'beDe') buscaE.de = val; else if (k === 'beAte') buscaE.ate = val; else if (k === 'beNum') buscaE.num = val; else if (k === 'beRes') buscaE.res = val;
    else if (k === 'filtroP') { filtroP = val; pintaCad(); const i = document.querySelector('[data-i=filtroP]'); i.focus(); i.setSelectionRange(val.length, val.length); }
  }
  function ligar() {
    document.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && (b.closest('#tab-ck,#tab-esc,#cad-ck,#ck-modal'))) { e.preventDefault(); act(b.dataset.a, b); } });
    document.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.i && e.target.closest('#tab-ck,#tab-esc,#cad-ck')) entrada(e.target); });
    document.addEventListener('change', async e => { if (e.target.dataset && e.target.dataset.foto === 'rec' && e.target.files[0]) { try { rec.foto = await reduzir(e.target.files[0]); pintaCk(); } catch (err) { toast(err.message, true); } } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('ck-modal').hidden) fecharModal(); if (e.key === 'Enter' && e.target.dataset && /^(bTxt|beTxt)$/.test(e.target.dataset.i || '')) act(e.target.dataset.i === 'bTxt' ? 'buscar' : 'buscarE', e.target); });
    $('ck-modal').addEventListener('click', e => { if (e.target.id === 'ck-modal') fecharModal(); });
  }
  montarAbas(); ligar();
  return { iniciar, atualizar: () => { if (!$('tab-ck').hidden) carregarCk(); if (!$('tab-esc').hidden) carregarEsc(); } };
})();

// se o login terminou antes deste arquivo carregar, liga o checklist agora
if (typeof eu !== 'undefined' && eu) PCK.iniciar();
setInterval(() => { if (typeof eu !== 'undefined' && eu && document.visibilityState === 'visible' && $('ck-modal').hidden && !document.querySelector('#tab-ck .enc,#tab-ck .recusa,#tab-ck .excl')) PCK.atualizar(); }, 60000);
