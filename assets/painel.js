// Painel do PC: abastecimento, troca de óleo e cadastros
const LIMITE = 1500;
const COLS_PESSOAS = 'id,nome,re,funcao,papeis,email,ativo,criado_em,tem_pin';
let eu = null, VE = [], PE = [], AB = [], PD = [], TR = [], LI = [];
const papel = p => eu && (eu.papeis.includes(p) || eu.papeis.includes('admin'));
const opera = () => papel('lider') || papel('assistente');  // solicita, autoriza, lança custo, corrige km
const cadastra = () => papel('lider');                        // aba Cadastros: só líder e admin
const pessoaNome = id => (PE.find(p => p.id === id) || {}).nome;
const veic = pl => VE.find(v => v.placa === pl) || { placa: pl };

function toast(m, erro) {
  const t = document.createElement('div'); t.className = 'toast' + (erro ? ' erro' : ''); t.textContent = m; t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), erro ? 5000 : 2500);
}

// ================= LOGIN =================
iniciarTema();
$('tl-ab').insertAdjacentHTML('afterbegin', ICONE_BOMBA.replace(/46/g, '30'));
$('tl-ol').insertAdjacentHTML('afterbegin', ICONE_GOTA.replace(/46/g, '30'));

function mostrar(v) { $('v-login').hidden = v !== 'login'; $('v-painel').hidden = v !== 'painel'; }
async function iniciar() {
  if (!configurado) { mostrar('login'); $('f-login').hidden = true; $('sem-config').hidden = false; return; }
  const { data } = await sb.auth.getSession();
  if (data.session) await entrarPainel(); else mostrar('login');
}
sb && sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') { mostrar('login'); $('f-login').hidden = true; $('f-nova').hidden = false; }
});
$('f-login').addEventListener('submit', async e => {
  e.preventDefault(); $('l-msg').className = 'msg'; $('l-msg').textContent = 'Entrando…';
  const { error } = await sb.auth.signInWithPassword({ email: $('l-email').value.trim(), password: $('l-senha').value });
  if (error) { $('l-msg').className = 'msg erro'; $('l-msg').textContent = /Invalid login/i.test(error.message) ? 'E-mail ou senha incorretos.' : msgErro(error); return; }
  $('l-msg').textContent = ''; await entrarPainel();
});
$('esqueci').onclick = async () => {
  const email = $('l-email').value.trim();
  if (!email) { $('l-msg').className = 'msg erro'; $('l-msg').textContent = 'Digite seu e-mail acima e clique de novo em "Esqueci minha senha".'; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
  $('l-msg').className = 'msg ' + (error ? 'erro' : 'ok');
  $('l-msg').textContent = error ? msgErro(error) : 'Enviamos um link para o seu e-mail. Abra o link para criar uma nova senha.';
};
$('f-nova').addEventListener('submit', async e => {
  e.preventDefault(); const s = $('n-senha').value;
  if (s.length < 8) { $('n-msg').className = 'msg erro'; $('n-msg').textContent = 'Use pelo menos 8 caracteres.'; return; }
  if (s !== $('n-senha2').value) { $('n-msg').className = 'msg erro'; $('n-msg').textContent = 'As duas senhas estão diferentes.'; return; }
  const { error } = await sb.auth.updateUser({ password: s });
  if (error) { $('n-msg').className = 'msg erro'; $('n-msg').textContent = msgErro(error); return; }
  $('f-nova').reset(); $('n-msg').textContent = ''; $('f-nova').hidden = true; $('f-login').hidden = false; history.replaceState(null, '', location.pathname);
  await entrarPainel(); toast('Senha alterada.');
});
// trocar a própria senha estando logado
$('trocar-senha').onclick = () => { $('f-nova').reset(); $('n-msg').textContent = ''; mostrar('login'); $('f-login').hidden = true; $('sem-config').hidden = true; $('f-nova').hidden = false; $('n-cancelar').hidden = false; $('n-senha').focus(); };
$('n-cancelar').onclick = () => { $('f-nova').hidden = true; $('f-login').hidden = false; $('n-cancelar').hidden = true; mostrar('painel'); };
$('sair').onclick = async () => { await sb.auth.signOut(); eu = null; $('user-top').hidden = true; mostrar('login'); };

async function entrarPainel() {
  try { eu = await rpc('painel_eu'); } catch (e) { eu = null; }
  if (!eu) {
    await sb.auth.signOut(); mostrar('login');
    $('l-msg').className = 'msg erro'; $('l-msg').textContent = 'Seu e-mail ainda não tem acesso ao painel. Peça para a Fernanda cadastrar seu e-mail em Cadastros.';
    return;
  }
  $('user-nome').textContent = curto(eu.nome); $('user-top').hidden = false;
  $('tab-btn-cad').hidden = !cadastra();
  $('th-corr').hidden = !opera();
  mostrar('painel'); await carregarTudo();
}

// busca todas as linhas de uma tabela (o Supabase entrega no máximo 1000 por vez)
async function tudo(tabela, ordem, asc = true, cols = '*') {
  const out = []; let de = 0;
  for (;;) {
    const { data, error } = await sb.from(tabela).select(cols).order(ordem, { ascending: asc }).range(de, de + 999);
    if (error) throw new Error(msgErro(error));
    out.push(...data); if (data.length < 1000) break; de += 1000;
  }
  return out;
}
async function carregarTudo() {
  $('note').textContent = 'Carregando dados…';
  try {
    [VE, PE, AB, PD, TR, LI] = await Promise.all([
      tudo('veiculos', 'placa'), tudo('pessoas', 'nome', true, COLS_PESSOAS), tudo('abastecimentos', 'registrado_em'),
      tudo('pedidos_troca', 'id'), tudo('trocas_oleo', 'data'), tudo('listas', 'ordem')]);
  } catch (e) { $('note').textContent = 'Não consegui carregar os dados: ' + e.message; return; }
  AB.forEach(r => { r.t = new Date(r.registrado_em); r.l = r.litros == null ? 0 : Number(r.litros); });
  TR.forEach(r => { r.d = new Date(r.data); });
  analisar(); montarFiltros(); pintaDatas(); render(); renderOleo(); if (cadastra()) renderCad();
}
// recarrega os dados a cada 2 minutos, para ver o que a portaria lançou
setInterval(() => { if (eu && document.visibilityState === 'visible' && !document.querySelector('.form-cad:not([hidden])')) carregarTudo(); }, 120000);

// ================= ABAS =================
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  [...$('tabs').children].forEach(x => x.setAttribute('aria-pressed', x === b));
  const t = b.dataset.t; $('tab-ab').hidden = t !== 'ab'; $('tab-oleo').hidden = t !== 'oleo'; $('tab-cad').hidden = t !== 'cad';
  $('note').style.display = t === 'ab' ? '' : 'none';
});

// ================= FOTOS =================
const urlCache = {};
async function assinar(caminhos) {
  const falta = [...new Set(caminhos.filter(c => c && !urlCache[c]))]; if (!falta.length) return;
  const { data } = await sb.storage.from('fotos').createSignedUrls(falta, 3600);
  (data || []).forEach(x => { if (x.signedUrl) urlCache[x.path] = x.signedUrl; });
}
const NF = { painel: 'Painel (km)', placa: 'Placa', bomba: 'Visor da bomba', adesivo: 'Adesivo da troca' };
function thumbs(fotos, legenda) {
  if (!fotos) return '<span class="semfoto">Sem foto</span>';
  return '<div class="thumbs">' + Object.keys(fotos).map(k => { const u = urlCache[fotos[k]];
    return u ? `<button type="button" data-src="${esc(u)}" data-cap="${esc(NF[k] || k)} · ${esc(legenda)}" aria-label="Ampliar foto: ${esc(NF[k] || k)}"><img src="${esc(u)}" alt="" loading="lazy"></button>` : '<span class="semfoto">…</span>'; }).join('') + '</div>';
}
async function pintarFotos(linhas, el, fn) { await assinar(linhas.flatMap(x => x.fotos ? Object.values(x.fotos) : [])); el.innerHTML = fn(); }
document.addEventListener('click', e => {
  const b = e.target.closest('.thumbs button'); if (!b) return;
  const d = document.createElement('div'); d.className = 'lb';
  d.innerHTML = `<img src="${b.dataset.src}" alt="${b.dataset.cap}"><div>${b.dataset.cap}</div><button class="btn btn-sm btn-main" type="button">Fechar</button>`;
  d.onclick = () => d.remove(); document.body.appendChild(d);
});

// ================= ABASTECIMENTO =================
function analisar() {
  AB.sort((a, b) => a.t - b.t);
  const porV = {}; AB.forEach(r => { (porV[r.placa] = porV[r.placa] || []).push(r); });
  Object.values(porV).forEach(g => {
    g.forEach(r => { r.semL = r.litros == null; });
    g.forEach((r, i) => {
      r.sus = false; r.esp = null; r.rod = null;
      if (r.km == null) { r.sus = true; return; }
      const prev = g.slice(0, i).reverse().find(x => x.km != null), next = g.slice(i + 1).find(x => x.km != null);
      const offP = prev ? Math.abs(r.km - prev.km) > LIMITE || r.km < prev.km : false;
      const offN = next ? Math.abs(next.km - r.km) > LIMITE || next.km < r.km : false;
      if (prev && next) { if (offP && offN && !(Math.abs(next.km - prev.km) > LIMITE)) { r.sus = true; r.esp = prev.km; } }
      else if (prev && offP) { r.sus = true; r.esp = prev.km; }
    });
    g.forEach(r => { if (r.semL) r.sus = true; });
    let last = null;
    g.forEach(r => { if (r.sus || r.km == null) return; if (last != null && r.km > last && r.km - last <= LIMITE) r.rod = r.km - last; last = r.km; });
  });
}
const tipoV = pl => { const v = veic(pl); return v.tipo || v.modelo || '—'; };
function montarFiltros() {
  const placas = [...new Set(AB.map(r => r.placa))].sort();
  const tipos = [...new Set(placas.map(tipoV))].sort();
  const mots = [...new Set(AB.map(r => r.motorista_id).filter(Boolean))].map(id => ({ id, n: curto(pessoaNome(id)) })).sort((a, b) => a.n.localeCompare(b.n));
  const keep = (id, html) => { const v = $(id).value; $(id).innerHTML = html; $(id).value = v; };
  keep('fl-tipo', '<option value="">Todos</option>' + tipos.map(t => `<option>${esc(t)}</option>`).join(''));
  keep('fl-placa', '<option value="">Todos</option>' + placas.map(p => `<option>${esc(p)}</option>`).join(''));
  keep('fl-mot', '<option value="">Todos</option>' + mots.map(m => `<option value="${m.id}">${esc(m.n)}</option>`).join(''));
}
let per = '30', mv = 'l', mm = 'l';
function periodo() {
  if (per === 'custom') { const [y1, m1, d1] = $('dt-de').value.split('-').map(Number), [y2, m2, d2] = $('dt-ate').value.split('-').map(Number); return [new Date(y1, m1 - 1, d1), new Date(y2, m2 - 1, d2, 23, 59, 59)]; }
  const fim = new Date(); let ini;
  if (per === 'all') ini = new Date(0); else if (per === 'mes') ini = new Date(fim.getFullYear(), fim.getMonth(), 1); else { ini = new Date(fim); ini.setHours(0, 0, 0, 0); ini.setDate(ini.getDate() - (+per) + 1); }
  return [ini, fim];
}
function pintaDatas() { const [a, b] = periodo(); $('dt-de').value = iso(per === 'all' ? (AB[0] ? AB[0].t : new Date()) : a); $('dt-ate').value = iso(b); }
$('per').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; per = b.dataset.p; [...$('per').children].forEach(x => x.setAttribute('aria-pressed', x === b)); pintaDatas(); render(); });
['dt-de', 'dt-ate'].forEach(id => $(id).addEventListener('change', () => {
  if (!$('dt-de').value || !$('dt-ate').value) return;
  if ($('dt-de').value > $('dt-ate').value) { const t = $('dt-de').value; $('dt-de').value = $('dt-ate').value; $('dt-ate').value = t; }
  per = 'custom'; [...$('per').children].forEach(x => x.setAttribute('aria-pressed', 'false')); render();
}));
['fl-tipo', 'fl-placa', 'fl-mot'].forEach(id => $(id).onchange = render);
function tg(id, set) { $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; [...$(id).children].forEach(x => x.setAttribute('aria-pressed', x === b)); set(b.dataset.m); render(); }); }
tg('tg-v', x => mv = x); tg('tg-m', x => mm = x);
function filtrar() {
  const [a, b] = periodo(), t = $('fl-tipo').value, pl = $('fl-placa').value, mo = $('fl-mot').value;
  return AB.filter(r => r.t >= a && r.t <= b && (!t || tipoV(r.placa) === t) && (!pl || r.placa === pl) && (!mo || r.motorista_id === mo));
}
function agrupa(f, key) {
  const g = {}; f.forEach(r => { const k = r[key] || '—'; const o = g[k] = g[k] || { k, l: 0, n: 0, rod: 0, lrod: 0, sus: 0 };
    o.l += r.l; o.n++; if (r.rod) { o.rod += r.rod; o.lrod += r.l; } if (r.sus) o.sus++; });
  return Object.values(g).map(o => (o.kml = o.lrod ? o.rod / o.lrod : null, o));
}
function ranking(el, lista, metr, nome, sub) {
  if (!lista.length) { $(el).innerHTML = '<div class="empty">Nenhum abastecimento neste filtro.</div>'; return; }
  const val = o => metr === 'kml' ? o.kml : o[metr];
  lista = lista.filter(o => val(o) != null).sort((a, b) => val(b) - val(a)); const max = Math.max(...lista.map(val));
  $(el).innerHTML = lista.slice(0, 10).map((o, i) => { const x = val(o);
    const txt = metr === 'l' ? `${fmt(x)} <small>L</small>` : metr === 'n' ? `${x} <small>vezes</small>` : `${fmt(x, 2)} <small>km/l</small>`;
    return `<div class="rk"><span class="pos">${i + 1}</span><div class="nm"><div>${esc(nome(o))}${o.sus ? `<span class="tag w">${o.sus} a revisar</span>` : ''}</div><small>${esc(sub(o))}</small><div class="track"><div class="fill" style="width:${(x / max * 100).toFixed(1)}%"></div></div></div><span class="val">${txt}</span></div>`; }).join('');
}
function semana(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return +d; }
function grafico(f) {
  const g = {}; f.forEach(r => { const k = semana(r.t); g[k] = (g[k] || 0) + r.l; });
  const ks = Object.keys(g).map(Number).sort((a, b) => a - b), svg = $('chart');
  if (!ks.length) { svg.innerHTML = '<text x="500" y="120" text-anchor="middle">Sem dados no período</text>'; $('sem-sub').textContent = ''; return; }
  const W = 1000, H = 240, L = 54, R = 12, T = 14, B = 30, max = Math.max(...ks.map(k => g[k]));
  const passo = max > 2000 ? 500 : max > 800 ? 200 : max > 300 ? 100 : 50, top = Math.ceil(max / passo) * passo;
  const y = v => T + (H - T - B) * (1 - v / top), bw = (W - L - R) / ks.length;
  let s = ''; for (let v = 0; v <= top; v += passo) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  ks.forEach((k, i) => { const x = L + i * bw + bw * .18, w = bw * .64, h = y(0) - y(g[k]), last = i === ks.length - 1;
    s += `<rect x="${x}" y="${y(g[k])}" width="${w}" height="${h}" rx="3" fill="${last ? 'var(--accent)' : 'var(--bar)'}"><title>${fmt(g[k])} L</title></rect>`;
    const d = new Date(k); if (ks.length <= 14 || i % Math.ceil(ks.length / 14) === 0) s += `<text x="${x + w / 2}" y="${H - 10}" text-anchor="middle">${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</text>`;
    if (ks.length <= 8) s += `<text x="${x + w / 2}" y="${y(g[k]) - 6}" text-anchor="middle" style="fill:var(--fg)">${fmt(g[k])}</text>`; });
  svg.innerHTML = s; $('sem-sub').textContent = 'Cada barra começa na segunda-feira; a destacada é a semana mais recente';
}
function render() {
  if (!eu) return;
  const f = filtrar(), tot = f.reduce((s, r) => s + r.l, 0), rod = f.reduce((s, r) => s + (r.rod || 0), 0), lrod = f.reduce((s, r) => s + (r.rod ? r.l : 0), 0), sus = f.filter(r => r.sus).length;
  const [a, b] = periodo(), dias = Math.max(1, Math.round((b - a) / 864e5));
  const lbl = per === 'custom' ? `de ${a.toLocaleDateString('pt-BR')} até ${b.toLocaleDateString('pt-BR')}` : per === 'all' ? 'todo o histórico' : per === 'mes' ? 'este mês' : `últimos ${per} dias`;
  $('note').textContent = `Mostrando ${lbl}. Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
  $('kpis').innerHTML = `
    <div class="kpi"><span class="l">Litros abastecidos</span><span class="v">${fmt(tot)}<small>L</small></span><span class="s">${per === 'all' ? '' : 'média de ' + fmt(tot / dias) + ' L por dia'}</span></div>
    <div class="kpi"><span class="l">Abastecimentos</span><span class="v">${f.length}</span><span class="s">${fmt(f.length ? tot / f.length : 0, 1)} L por abastecimento</span></div>
    <div class="kpi"><span class="l">Consumo médio</span><span class="v">${lrod ? fmt(rod / lrod, 2) : '—'}<small>km/l</small></span><span class="s">${fmt(rod)} km rodados com km válido</span></div>
    ${sus ? '<a class="kpi flag" href="#revisar" id="ir-rev">' : '<div class="kpi">'}<span class="l">Para revisar</span><span class="v">${sus}</span><span class="s">registros com km fora da sequência</span>${sus ? '</a>' : '</div>'}`;
  const ir = $('ir-rev'); if (ir) ir.onclick = e => { e.preventDefault(); const c = $('card-rev'); c.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); c.classList.remove('foco'); void c.offsetWidth; c.classList.add('foco'); };
  ranking('rk-v', agrupa(f, 'placa'), mv, o => o.k, o => `${tipoV(o.k)} · ${o.n} abast.${o.kml ? ` · ${fmt(o.kml, 2)} km/l` : ''}`);
  ranking('rk-m', agrupa(f, 'motorista_id'), mm, o => curto(pessoaNome(o.k)), o => `${o.n} abast. · ${fmt(o.l / o.n, 1)} L em média`);
  grafico(f);
  const ult = f.slice().sort((a, b) => b.t - a.t).slice(0, 10);
  const linhaU = x => `<tr><td class="num">${fdt(x.t)}</td><td>${esc(x.placa)}</td><td>${esc(curto(pessoaNome(x.motorista_id)))}</td><td>${esc(curto(pessoaNome(x.porteiro_id)))}</td><td class="r num">${fmt(x.l, 1)}</td><td class="r num">${x.sus ? `<span class="bad">${fmt(x.km)}</span>` : fmt(x.km)}${x.km_original != null ? ' <small class="mut">(corrigido)</small>' : ''}</td><td>${thumbs(x.fotos, x.placa + ' · ' + fdt(x.t))}</td></tr>`;
  const fu = () => ult.map(linhaU).join('') || '<tr><td colspan="7" class="empty">Nenhum abastecimento neste filtro.</td></tr>';
  $('ult').innerHTML = fu(); pintarFotos(ult, $('ult'), fu);
  const rv = f.filter(x => x.sus).sort((a, b) => b.t - a.t);
  const fr = () => rv.length ? rv.map(x => `<tr><td class="num">${fdt(x.t)}</td><td>${esc(x.placa)}</td><td>${esc(curto(pessoaNome(x.motorista_id)))}</td><td>${esc(curto(pessoaNome(x.porteiro_id)))}</td><td class="r num">${x.semL ? `<span class="bad">${x.litros_original != null ? fmt(x.litros_original, 1) + ' ?' : '—'}</span>` : fmt(x.l, 1)}</td><td class="r num">${x.semL && x.esp == null ? fmt(x.km) : `<span class="bad">${fmt(x.km)}</span>`}</td><td class="r num">${x.esp != null ? '≈ ' + fmt(x.esp) : '—'}</td><td>${thumbs(x.fotos, x.placa + ' · ' + fdt(x.t))}</td>${opera() ? `<td><div class="ed-km"><input id="ck-${x.id}" class="num" inputmode="numeric" placeholder="km certo" aria-label="Km correto"><button type="button" class="btn btn-sm btn-ghost" data-corr="${x.id}">Salvar</button></div></td>` : ''}</tr>`).join('') : `<tr><td colspan="9" class="empty">Nenhum registro para revisar neste filtro.</td></tr>`;
  $('rev').innerHTML = fr(); pintarFotos(rv, $('rev'), fr);
}
$('rev').addEventListener('click', async e => {
  const id = e.target.dataset.corr; if (!id) return;
  const km = parseInt($('ck-' + id).value.replace(/\D/g, ''), 10); if (!(km > 0)) { $('ck-' + id).focus(); return; }
  try { await rpc('painel_corrigir_km', { p_abast: +id, p_km: km }); const r = AB.find(x => x.id === +id); r.km_original = r.km_original ?? r.km; r.km = km; analisar(); render(); renderOleo(); toast('Km corrigido'); }
  catch (err) { toast(err.message, true); }
});

// ================= TROCA DE ÓLEO =================
let catO = '';
function kmAtual(pl) {
  const a = AB.filter(r => r.placa === pl && r.km != null && !r.sus).at(-1), t = TR.filter(r => r.placa === pl && r.km != null).at(-1);
  return Math.max(a ? a.km : 0, t ? t.km : 0) || null;
}
function ultimaTroca(pl) { return TR.filter(r => r.placa === pl).at(-1); }
function situacao(v) {
  if (v.garantia) return { o: 5, cls: 'gar', txt: 'Garantia', det: 'Revisão na concessionária' };
  const ut = ultimaTroca(v.placa);
  if (!ut) return { o: 4, cls: 'cinza', txt: 'Sem histórico', det: 'Nenhuma troca registrada' };
  const int = v.intervalo_km || 5000; let km = kmAtual(v.placa), susp = false;
  if (km != null && ut.km != null && km - ut.km > 3 * int) { susp = true; km = null; }
  const falta = (km != null && ut.km != null) ? ut.km + int - km : null;
  const dias = Math.floor((Date.now() - ut.d) / 864e5), restD = 182 - dias, aviso = Math.min(1000, int * .2);
  const r = { km, falta, dias, restD, susp, ut, prox: ut.km != null ? ut.km + int : null };
  if ((falta != null && falta <= 0) || restD <= 0) return { ...r, o: 0, cls: 'venc', txt: 'Vencida', det: falta != null && falta <= 0 ? `passou ${fmt(-falta)} km` : `${Math.floor(dias / 30)} meses sem troca` };
  if ((falta != null && falta <= aviso) || restD <= 15) return { ...r, o: 1, cls: 'prox', txt: 'Próxima', det: falta != null && falta <= aviso ? `faltam ${fmt(falta)} km` : `vence por tempo em ${restD} dias` };
  return { ...r, o: 2, cls: 'ok', txt: 'Em dia', det: falta != null ? `faltam ${fmt(falta)} km` : `${restD} dias até o limite de 6 meses` };
}
const pedidoAberto = pl => PD.find(x => x.placa === pl && ['solicitado', 'aprovado', 'realizado'].includes(x.status));
const trocaDoPedido = id => TR.find(t => t.pedido_id === id);
function passos(x) {
  const st = ['solicitado', 'aprovado', 'realizado', 'fechado'], nomes = ['Solicitado', 'Aprovado', 'Realizado', 'Custo lançado'];
  if (x.status === 'recusado') return '<div class="passos"><span class="ps feito">Solicitado</span><span class="ps rec">Recusado</span></div>';
  if (x.status === 'cancelado') return '<div class="passos"><span class="ps feito">Solicitado</span><span class="ps rec">Cancelado</span></div>';
  const i = st.indexOf(x.status); return '<div class="passos">' + nomes.map((n, j) => `<span class="ps ${j <= i ? 'feito' : ''} ${j === i + 1 ? 'atual' : ''}">${n}</span>`).join('') + '</div>';
}
$('cat-o').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; catO = b.dataset.c; [...$('cat-o').children].forEach(x => x.setAttribute('aria-pressed', x === b)); renderOleo(); });
function renderOleo() {
  if (!eu) return;
  const ativos = VE.filter(v => v.ativo);
  const lista = ativos.filter(v => !catO || v.categoria === catO).map(v => ({ v, s: situacao(v) })).sort((a, b) => a.s.o - b.s.o || (a.s.falta ?? 1e9) - (b.s.falta ?? 1e9));
  const todos = ativos.map(situacao), ano = new Date().getFullYear();
  const venc = todos.filter(s => s.cls === 'venc').length, prox = todos.filter(s => s.cls === 'prox').length;
  const aguard = PD.filter(x => x.status === 'solicitado').length, cpend = TR.filter(t => t.origem === 'app' && t.custo == null).length;
  const doAno = TR.filter(t => t.d.getFullYear() === ano), gasto = doAno.reduce((s, t) => s + Number(t.custo || 0), 0);
  $('kpis-o').innerHTML = `
    <div class="kpi ${venc ? 'flag' : ''}"><span class="l">Trocas vencidas</span><span class="v">${venc}</span><span class="s">por km ou por 6 meses</span></div>
    <div class="kpi"><span class="l">Próximas</span><span class="v" style="color:var(--amb)">${prox}</span><span class="s">menos de 1.000 km ou 15 dias</span></div>
    <div class="kpi"><span class="l">Aguardando aprovação</span><span class="v">${aguard}</span><span class="s">pedidos da líder de frota</span></div>
    <div class="kpi"><span class="l">Custo pendente</span><span class="v">${cpend}</span><span class="s">trocas feitas sem valor lançado</span></div>
    <div class="kpi"><span class="l">Gasto em ${ano}</span><span class="v" style="font-size:28px">${real(gasto)}</span><span class="s">${doAno.length} trocas no ano</span></div>`;
  $('sit').innerHTML = lista.map(({ v, s }) => { const pa = pedidoAberto(v.placa); let acao = '';
    if (pa) acao = `<span class="pill info">${{ solicitado: 'Aguardando aprovação', aprovado: 'Aprovado', realizado: 'Feito · custo pendente' }[pa.status]}</span>`;
    else if (opera() && !v.garantia) acao = `<button type="button" class="btn btn-sm ${s.o < 2 ? 'btn-main' : 'btn-ghost'}" data-sol="${esc(v.placa)}">Solicitar troca</button>`;
    return `<tr><td><b>${esc(v.placa)}</b><br><small class="mut">${esc(v.modelo || v.tipo || '')}</small></td><td>${esc(v.categoria)}</td><td class="num">${s.ut ? dataBr(s.ut.d) : '—'}<br><small class="mut">${s.ut && s.ut.km != null ? fmt(s.ut.km) + ' km' : s.ut ? 'km não informado' : ''}</small></td><td class="r num">${s.km != null ? fmt(s.km) : s.susp ? '<span class="bad">conferir</span>' : '—'}</td><td class="r num">${s.prox != null && !v.garantia ? fmt(s.prox) : '—'}</td><td><span class="pill ${s.cls}">${s.txt}</span><br><small class="mut">${s.det}</small></td><td class="r">${acao}</td></tr>`; }).join('');

  const ord = { solicitado: 0, realizado: 1, aprovado: 2, recusado: 3, fechado: 4, cancelado: 5 };
  const recentes = PD.filter(x => ['solicitado', 'aprovado', 'realizado'].includes(x.status) || (Date.now() - new Date(x.solicitado_em)) < 30 * 864e5);
  const ps = recentes.slice().sort((a, b) => ord[a.status] - ord[b.status] || b.id - a.id);
  const fp = () => ps.map(x => { const v = veic(x.placa), t = trocaDoPedido(x.id); let act = '';
    if (x.status === 'solicitado' && papel('gerente')) act = `<div class="ped-act"><button type="button" class="btn btn-sm btn-main" data-apr="${x.id}">Aprovar</button><input id="mot-${x.id}" placeholder="Motivo, se recusar" aria-label="Motivo da recusa"><button type="button" class="btn btn-sm btn-ghost" data-rec="${x.id}">Recusar</button></div>`;
    else if (x.status === 'solicitado') act = '<div class="mut">Aguardando o gerente aprovar.</div>';
    if (x.status === 'aprovado' && opera()) act = x.codigo && !x.codigo_usado && x.codigo_dia === iso(new Date())
      ? `<div class="cod"><div><span class="mut">Código para o motorista · vale só hoje, só para ${esc(x.placa)}</span><b class="num">${esc(x.codigo)}</b></div><button type="button" class="btn btn-sm btn-ghost" data-copia="${esc(x.codigo)}">Copiar</button><button type="button" class="btn btn-sm btn-ghost" data-canc="${x.id}">Cancelar código</button></div>`
      : `<div class="ped-act"><button type="button" class="btn btn-sm btn-ghost" data-lib="${x.id}">AUTORIZAR MOTORISTA</button><button type="button" class="btn btn-sm btn-ghost" data-cancped="${x.id}">Cancelar pedido</button><span class="mut">O código vale só hoje, para um motorista fazer esta troca.</span></div>`;
    if (x.status === 'realizado' && opera() && t) act = `<div class="ped-act"><label for="cus-${t.id}" class="mut">Custo (R$)</label><input id="cus-${t.id}" inputmode="decimal" placeholder="0,00" class="num"><button type="button" class="btn btn-sm btn-main" data-cus="${t.id}">Lançar custo</button></div>`;
    else if (x.status === 'realizado') act = '<div class="mut">A líder de frota vai lançar o custo.</div>';
    const det = t ? `${dataBr(t.d)} · ${esc(curto(t.feito_por_nome))}${t.funcao && t.funcao !== 'Mecânico' ? ` (${esc(t.funcao)}${t.re ? ', RE ' + esc(t.re) : ''})` : ''} · ${esc(t.estabelecimento || '')} · ${esc(t.oleo || '')} · ${fmt(t.km)} km${t.requisicao ? ' · req. ' + esc(t.requisicao) : ''}${t.custo != null ? ' · ' + real(t.custo) : ''}`
      : x.status === 'recusado' ? `Recusado por ${esc(curto(pessoaNome(x.decidido_por)))}. Motivo: ${esc(x.motivo_recusa || 'não informado')}`
      : x.status === 'aprovado' ? `Aprovado por ${esc(curto(pessoaNome(x.decidido_por)))} em ${dataBr(x.decidido_em)} · na lista do mecânico`
      : `Solicitado por ${esc(curto(pessoaNome(x.solicitado_por)))} em ${dataBr(x.solicitado_em)}`;
    return `<div class="ped"><div class="ped-h"><div><b>${esc(x.placa)}</b> <span class="mut">${esc(v.modelo || v.tipo || '')}</span></div>${t && t.fotos ? thumbs(t.fotos, x.placa) : ''}</div>${passos(x)}<div class="mut ped-d">${det}</div>${act}</div>`; }).join('') || '<div class="empty">Nenhum pedido nos últimos 30 dias.</div>';
  $('peds').innerHTML = fp(); pintarFotos(ps.map(trocaDoPedido).filter(Boolean), $('peds'), fp);

  const hs = TR.slice().sort((a, b) => b.d - a.d).slice(0, 20);
  const fh = () => hs.map(h => `<tr><td class="num">${dataBr(h.d)}</td><td><b>${esc(h.placa)}</b><br><small class="mut">${esc(veic(h.placa).modelo || '')}</small></td><td>${esc(curto(h.feito_por_nome))}</td><td>${esc(h.estabelecimento || '—')}</td><td>${esc(h.oleo || '—')}</td><td class="r num">${h.km != null ? fmt(h.km) : '—'}</td><td>${h.filtro_oleo ? 'Óleo' : ''}${h.filtro_oleo && h.filtro_comb ? ' + ' : ''}${h.filtro_comb ? 'Comb.' : ''}${!h.filtro_oleo && !h.filtro_comb ? '—' : ''}</td><td>${h.fotos ? thumbs(h.fotos, h.placa) : '<span class="semfoto">—</span>'}</td><td class="r num">${h.custo != null ? real(h.custo) : '<span class="bad">pendente</span>'}</td></tr>`).join('');
  $('hist-o').innerHTML = fh(); pintarFotos(hs, $('hist-o'), fh);
  $('papel-d').textContent = opera() && papel('gerente') ? 'Você pode solicitar, aprovar e lançar custos.' : opera() ? 'Você solicita trocas, autoriza motorista e lança o custo.' : papel('gerente') ? 'Você aprova ou recusa os pedidos.' : '';
  const cp = $('card-peds'), cs = $('card-sit');
  if (papel('gerente') && !eu.papeis.includes('lider') && !eu.papeis.includes('assistente')) { if (cp.nextElementSibling !== cs) cs.before(cp); } else if (cs.nextElementSibling !== cp) cp.before(cs);
}
$('tab-oleo').addEventListener('click', async e => {
  const d = e.target.dataset; if (!d) return;
  try {
    if (d.sol) { await rpc('painel_solicitar', { p_placa: d.sol }); toast('Troca solicitada. Aguardando o gerente.'); }
    else if (d.apr) { await rpc('painel_decidir', { p_pedido: +d.apr, p_aprovar: true }); toast('Aprovado. O veículo já aparece para o mecânico.'); }
    else if (d.rec) { await rpc('painel_decidir', { p_pedido: +d.rec, p_aprovar: false, p_motivo: $('mot-' + d.rec).value }); toast('Pedido recusado.'); }
    else if (d.lib) { const c = await rpc('painel_liberar_codigo', { p_pedido: +d.lib }); toast('Código ' + c + ' gerado.'); }
    else if (d.canc) { await rpc('painel_cancelar_codigo', { p_pedido: +d.canc }); toast('Código cancelado.'); }
    else if (d.cancped) { await rpc('painel_cancelar_pedido', { p_pedido: +d.cancped }); toast('Pedido cancelado.'); }
    else if (d.cus) { const v = parseFloat($('cus-' + d.cus).value.replace(/\./g, '').replace(',', '.')); if (!(v > 0)) { $('cus-' + d.cus).focus(); return; } await rpc('painel_lancar_custo', { p_troca: +d.cus, p_custo: v }); toast('Custo lançado.'); }
    else if (d.copia) { try { await navigator.clipboard.writeText(d.copia); e.target.textContent = 'Copiado'; } catch (_) { e.target.textContent = d.copia; } return; }
    else return;
  } catch (err) { toast(err.message, true); return; }
  [PD, TR] = await Promise.all([tudo('pedidos_troca', 'id'), tudo('trocas_oleo', 'data')]); TR.forEach(r => { r.d = new Date(r.data); }); renderOleo();
});

// ================= CADASTROS =================
const PAPEIS = [['porteiro', 'Porteiro (abastecimento)'], ['mecanico', 'Mecânico (troca de óleo)'], ['motorista', 'Motorista'], ['lider', 'Líder de frota'], ['assistente', 'Assistente da líder (sem cadastros)'], ['gerente', 'Gerente'], ['admin', 'Administrador']];
const NOME_PAPEL = Object.fromEntries(PAPEIS);
$('p-papeis').innerHTML = PAPEIS.map(([k, n]) => `<label><input type="checkbox" value="${k}">${n}</label>`).join('');
function renderCad() {
  $('t-pessoas').innerHTML = PE.map(p => `<tr class="${p.ativo ? '' : 'inativo'}"><td><b>${esc(p.nome)}</b><br><small class="mut">${esc(p.funcao || '')}${p.email ? ' · ' + esc(p.email) : ''}</small></td><td class="num">${esc(p.re || '—')}</td><td>${p.papeis.map(x => `<span class="pill info" style="margin:1px">${esc((NOME_PAPEL[x] || x).split(' (')[0])}</span>`).join(' ')}</td><td>${p.papeis.some(x => x === 'porteiro' || x === 'mecanico') ? (p.tem_pin ? '<span class="pill ok">definido</span>' : '<span class="bad">sem PIN</span>') : ''}</td><td><button type="button" class="btn btn-sm btn-ghost" data-edp="${p.id}">Editar</button></td></tr>`).join('');
  $('t-veics').innerHTML = VE.map(v => `<tr class="${v.ativo ? '' : 'inativo'}"><td><b>${esc(v.placa)}</b></td><td>${esc(v.modelo || '')}<br><small class="mut">${esc(v.tipo || '')}</small></td><td>${esc(v.categoria)}${v.garantia ? ' <span class="pill gar">Garantia</span>' : ''}</td><td class="r num">${v.intervalo_km ? fmt(v.intervalo_km) : '—'}</td><td>${v.frota_pesada ? 'Sim' : ''}</td><td><button type="button" class="btn btn-sm btn-ghost" data-edv="${esc(v.placa)}">Editar</button></td></tr>`).join('');
  const tipos = [['estabelecimento', 'Locais da troca'], ['oleo', 'Tipos de óleo'], ['funcao', 'Funções (motorista ou outro)']];
  $('listas').innerHTML = tipos.map(([t, n]) => `<div style="margin-bottom:14px"><b>${n}</b><div class="chips-lista">${LI.filter(l => l.tipo === t).map(l => `<span>${esc(l.valor)}<button type="button" data-rml="${t}" data-v="${esc(l.valor)}" aria-label="Remover ${esc(l.valor)}">×</button></span>`).join('')}</div><div class="linha-btn" style="margin-top:8px"><input id="nl-${t}" placeholder="Adicionar" style="padding:6px 8px;border-radius:6px;border:1.5px solid var(--line);background:var(--surface)"><button type="button" class="btn btn-sm btn-ghost" data-addl="${t}">Adicionar</button></div></div>`).join('');
}
function abrirPessoa(p) {
  $('f-pessoa').hidden = false; $('p-msg').textContent = '';
  $('p-id').value = p ? p.id : ''; $('p-nome').value = p ? p.nome : ''; $('p-re').value = p ? p.re || '' : ''; $('p-funcao').value = p ? p.funcao || '' : ''; $('p-email').value = p ? p.email || '' : '';
  $('p-ativo').checked = p ? p.ativo : true; $('p-pin').value = '';
  [...$('p-papeis').querySelectorAll('input')].forEach(i => { i.checked = p ? p.papeis.includes(i.value) : false; });
  $('p-pin-box').hidden = !p; $('p-nome').focus();
}
$('nova-pessoa').onclick = () => abrirPessoa(null);
$('p-cancelar').onclick = () => { $('f-pessoa').hidden = true; };
$('t-pessoas').addEventListener('click', e => { const id = e.target.dataset.edp; if (id) { abrirPessoa(PE.find(p => p.id === id)); $('f-pessoa').scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
$('f-pessoa').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const id = await rpc('painel_salvar_pessoa', { p_id: $('p-id').value || null, p_nome: $('p-nome').value, p_re: $('p-re').value, p_funcao: $('p-funcao').value,
      p_papeis: [...$('p-papeis').querySelectorAll('input:checked')].map(i => i.value), p_email: $('p-email').value, p_ativo: $('p-ativo').checked });
    PE = await tudo('pessoas', 'nome', true, COLS_PESSOAS); renderCad(); $('p-id').value = id; $('p-pin-box').hidden = false;
    $('p-msg').className = 'msg ok'; $('p-msg').textContent = 'Salvo. Para porteiro ou mecânico, defina o PIN abaixo.' + ($('p-email').value ? ' Para o painel, crie também o login desse e-mail no Supabase (veja o guia).' : '');
  } catch (err) { $('p-msg').className = 'msg erro'; $('p-msg').textContent = err.message; }
});
$('p-pin-salvar').onclick = async () => {
  try { await rpc('painel_definir_pin', { p_pessoa: $('p-id').value, p_pin: $('p-pin').value }); $('p-pin').value = ''; $('p-msg').className = 'msg ok'; $('p-msg').textContent = 'PIN definido. Passe o PIN para a pessoa pessoalmente.'; }
  catch (err) { $('p-msg').className = 'msg erro'; $('p-msg').textContent = err.message; }
};
function abrirVeic(v) {
  $('f-veic').hidden = false; $('v-msg').textContent = '';
  $('v-placa').value = v ? v.placa : ''; $('v-placa').readOnly = !!v; $('v-modelo').value = v ? v.modelo || '' : ''; $('v-cat').value = v ? v.categoria : 'Pesado';
  $('v-tipo').value = v ? v.tipo || '' : ''; $('v-int').value = v && v.intervalo_km ? v.intervalo_km : '';
  $('v-pesada').checked = v ? v.frota_pesada : false; $('v-gar').checked = v ? v.garantia : false; $('v-ativo').checked = v ? v.ativo : true;
}
$('novo-veic').onclick = () => abrirVeic(null);
$('v-cancelar').onclick = () => { $('f-veic').hidden = true; };
$('t-veics').addEventListener('click', e => { const p = e.target.dataset.edv; if (p) { abrirVeic(veic(p)); $('f-veic').scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
$('f-veic').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await rpc('painel_salvar_veiculo', { p_placa: $('v-placa').value, p_modelo: $('v-modelo').value || null, p_categoria: $('v-cat').value, p_tipo: $('v-tipo').value || null,
      p_intervalo: parseInt($('v-int').value, 10) || null, p_garantia: $('v-gar').checked, p_frota_pesada: $('v-pesada').checked, p_ativo: $('v-ativo').checked });
    VE = await tudo('veiculos', 'placa'); renderCad(); renderOleo(); $('f-veic').hidden = true; toast('Veículo salvo.');
  } catch (err) { $('v-msg').className = 'msg erro'; $('v-msg').textContent = err.message; }
});
$('listas').addEventListener('click', async e => {
  const d = e.target.dataset;
  try {
    if (d.addl) { const v = $('nl-' + d.addl).value.trim(); if (!v) return; await rpc('painel_salvar_lista', { p_tipo: d.addl, p_valor: v }); }
    else if (d.rml) await rpc('painel_salvar_lista', { p_tipo: d.rml, p_valor: d.v, p_remover: true });
    else return;
    LI = await tudo('listas', 'ordem'); renderCad();
  } catch (err) { toast(err.message, true); }
});

iniciar();
