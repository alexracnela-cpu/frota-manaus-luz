// Painel do PC: abastecimento, troca de óleo e cadastros
const LIMITE = 1500;
const COLS_PESSOAS_ANT = 'id,nome,re,funcao,papeis,email,ativo,criado_em,tem_pin';
let COLS_PESSOAS = COLS_PESSOAS_ANT + ',pin_criado_em', falta09 = false;
const CAMPO = ['porteiro', 'mecanico', 'motorista'];   // papéis que usam o celular
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
  mostrar('painel'); await carregarTudo(); verUsoFotos();
  if (falta09 && cadastra()) toast('Falta rodar o arquivo 09_login_re_pin.sql no Supabase para o login por RE funcionar.', true);
  if (typeof PCK !== 'undefined') await PCK.iniciar();   // checklist e escadas (painel-ck.js)
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
  // antes de rodar o 09_login_re_pin.sql a coluna pin_criado_em não existe: usa a lista antiga
  if (!falta09) { try { await sb.from('pessoas').select(COLS_PESSOAS).limit(1).then(r => { if (r.error) throw r.error; }); }
    catch (e) { if (/pin_criado_em/.test(e.message || '')) { falta09 = true; COLS_PESSOAS = COLS_PESSOAS_ANT; } } }
  try {
    [VE, PE, AB, PD, TR, LI] = await Promise.all([
      tudo('veiculos', 'placa'), tudo('pessoas', 'nome', true, COLS_PESSOAS), tudo('abastecimentos', 'registrado_em'),
      tudo('pedidos_troca', 'id'), tudo('trocas_oleo', 'data'), tudo('listas', 'ordem')]);
  } catch (e) { $('note').textContent = 'Não consegui carregar os dados: ' + e.message; return; }
  try { KC = await rpc('painel_km_checklist') || {}; } catch (_) { KC = {}; }   // antes do 14_km_checklist.sql: só abastecimento e troca
  AB.forEach(r => { r.t = new Date(r.registrado_em); r.l = r.litros == null ? 0 : Number(r.litros); });
  TR.forEach(r => { r.d = new Date(r.data); });
  analisar(); montarFiltros(); pintaDatas(); render(); renderOleo(); if (cadastra()) { renderCad(); renderFotos(); }
}
// recarrega os dados a cada 2 minutos, para ver o que a portaria lançou
setInterval(() => { if (eu && document.visibilityState === 'visible' && !ocupadoFotos && !document.querySelector('.form-cad:not([hidden])')) carregarTudo(); }, 120000);

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
function thumbsR(r, leg, vazio = 'Sem foto') { return r.fotos ? thumbs(r.fotos, leg) : `<span class="semfoto">${r.fotos_arquivadas_em ? 'Arquivada' : vazio}</span>`; }
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
  const fechar = () => { d.remove(); document.removeEventListener('keydown', esc_); }; const esc_ = ev => { if (ev.key === 'Escape') fechar(); };
  d.onclick = fechar; document.addEventListener('keydown', esc_); document.body.appendChild(d);
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
  const linhaU = x => `<tr><td class="num">${fdt(x.t)}</td><td>${esc(x.placa)}</td><td>${esc(curto(pessoaNome(x.motorista_id)))}</td><td>${esc(curto(pessoaNome(x.porteiro_id)))}</td><td class="r num">${fmt(x.l, 1)}</td><td class="r num">${x.sus ? `<span class="bad">${fmt(x.km)}</span>` : fmt(x.km)}${x.km_original != null ? ' <small class="mut">(corrigido)</small>' : ''}</td><td>${thumbsR(x, x.placa + ' · ' + fdt(x.t))}</td></tr>`;
  const fu = () => ult.map(linhaU).join('') || '<tr><td colspan="7" class="empty">Nenhum abastecimento neste filtro.</td></tr>';
  $('ult').innerHTML = fu(); pintarFotos(ult, $('ult'), fu);
  const rv = f.filter(x => x.sus).sort((a, b) => b.t - a.t);
  const fr = () => rv.length ? rv.map(x => `<tr><td class="num">${fdt(x.t)}</td><td>${esc(x.placa)}</td><td>${esc(curto(pessoaNome(x.motorista_id)))}</td><td>${esc(curto(pessoaNome(x.porteiro_id)))}</td><td class="r num">${x.semL ? `<span class="bad">${x.litros_original != null ? fmt(x.litros_original, 1) + ' ?' : '—'}</span>` : fmt(x.l, 1)}</td><td class="r num">${x.semL && x.esp == null ? fmt(x.km) : `<span class="bad">${fmt(x.km)}</span>`}</td><td class="r num">${x.esp != null ? '≈ ' + fmt(x.esp) : '—'}</td><td>${thumbsR(x, x.placa + ' · ' + fdt(x.t))}</td>${opera() ? `<td><div class="ed-km"><input id="ck-${x.id}" class="num" inputmode="numeric" placeholder="km certo" aria-label="Km correto"><button type="button" class="btn btn-sm btn-ghost" data-corr="${x.id}">Salvar</button></div></td>` : ''}</tr>`).join('') : `<tr><td colspan="9" class="empty">Nenhum registro para revisar neste filtro.</td></tr>`;
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
// km atual = o maior entre o último abastecimento, a última troca e o último checklist (14_km_checklist.sql)
let KC = {};
function kmAtual(pl) {
  const a = AB.filter(r => r.placa === pl && r.km != null && !r.sus).at(-1), t = TR.filter(r => r.placa === pl && r.km != null).at(-1), c = KC[pl];
  return Math.max(a ? a.km : 0, t ? t.km : 0, c ? c.km : 0) || null;
}
function ultimaTroca(pl) { return TR.filter(r => r.placa === pl).at(-1); }
function situacao(v) {
  if (v.garantia) return { o: 5, cls: 'gar', txt: 'Garantia', det: 'Revisão na concessionária' };
  const ut = ultimaTroca(v.placa);
  if (!ut) return { o: 4, cls: 'cinza', txt: 'Sem histórico', det: 'Nenhuma troca registrada' };
  // próxima troca = KM ÓLEO informado (adesivo); sem ele, km da troca + intervalo do veículo
  const int = v.intervalo_km || 5000;
  const prox = ut.km_proxima != null ? ut.km_proxima : (ut.km != null ? ut.km + int : null);
  let km = kmAtual(v.placa), susp = false;
  if (km != null && ut.km != null && km - ut.km > 3 * int) { susp = true; km = null; }
  const falta = (km != null && prox != null) ? prox - km : null;
  const r = { km, falta, susp, ut, prox, estimada: ut.km_proxima == null };
  if (falta == null) return { ...r, o: 3, cls: 'cinza', txt: 'Sem km', det: susp ? 'km atual fora do padrão' : 'km não informado' };
  if (falta <= 0) return { ...r, o: 0, cls: 'venc', txt: 'Vencida', det: `passou ${fmt(-falta)} km` };
  if (falta < 1000) return { ...r, o: 1, cls: 'prox', txt: 'Próxima', det: `faltam ${fmt(falta)} km` };
  return { ...r, o: 2, cls: 'ok', txt: 'Em dia', det: `faltam ${fmt(falta)} km` };
}
const pedidoAberto = pl => PD.find(x => x.placa === pl && ['solicitado', 'aprovado', 'realizado'].includes(x.status));
const trocaDoPedido = id => TR.find(t => t.pedido_id === id);
const autorizadoHoje = x => x.autorizado_para && x.autorizado_dia === iso(new Date());
// pessoas que podem ser autorizadas: ativas e com RE (motoristas primeiro)
function opcoesMotorista() {
  return PE.filter(p => p.ativo && p.re).sort((a, b) => (b.papeis.includes('motorista') - a.papeis.includes('motorista')) || a.nome.localeCompare(b.nome))
    .map(p => `<option value="${p.id}">${esc(curto(p.nome))} · RE ${esc(p.re)}${p.funcao ? ' · ' + esc(p.funcao) : ''}</option>`).join('');
}
function passos(x) {
  const st = ['solicitado', 'aprovado', 'realizado', 'fechado'], nomes = ['Solicitado', 'Aprovado', 'Realizado', 'Custo lançado'];
  if (x.status === 'recusado') return '<div class="passos"><span class="ps feito">Solicitado</span><span class="ps rec">Recusado</span></div>';
  if (x.status === 'cancelado') return '<div class="passos"><span class="ps feito">Solicitado</span><span class="ps rec">Cancelado</span></div>';
  const i = st.indexOf(x.status); return '<div class="passos">' + nomes.map((n, j) => `<span class="ps ${j <= i ? 'feito' : ''} ${j === i + 1 ? 'atual' : ''}">${n}</span>`).join('') + '</div>';
}
let perO = 'ano';
function periodoO() {
  if (perO === 'custom') { const [y1, m1, d1] = $('dto-de').value.split('-').map(Number), [y2, m2, d2] = $('dto-ate').value.split('-').map(Number); return [new Date(y1, m1 - 1, d1), new Date(y2, m2 - 1, d2, 23, 59, 59)]; }
  const fim = new Date(); let ini;
  if (perO === 'all') ini = TR.length ? new Date(Math.min(...TR.map(t => t.d))) : new Date(0);
  else if (perO === 'mes') ini = new Date(fim.getFullYear(), fim.getMonth(), 1);
  else if (perO === 'ano') ini = new Date(fim.getFullYear(), 0, 1);
  else { ini = new Date(fim.getFullYear(), fim.getMonth() - 12, fim.getDate()); }
  ini.setHours(0, 0, 0, 0); return [ini, fim];
}
function rotuloO() { const [a, b] = periodoO(); return perO === 'mes' ? 'este mês' : perO === 'ano' ? 'em ' + b.getFullYear() : perO === '12m' ? 'nos últimos 12 meses' : perO === 'all' ? 'em todo o histórico' : `de ${a.toLocaleDateString('pt-BR')} até ${b.toLocaleDateString('pt-BR')}`; }
function pintaDatasO() { const [a, b] = periodoO(); $('dto-de').value = iso(a); $('dto-ate').value = iso(b); }
$('per-o').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; perO = b.dataset.p; [...$('per-o').children].forEach(x => x.setAttribute('aria-pressed', x === b)); pintaDatasO(); renderOleo(); });
['dto-de', 'dto-ate'].forEach(id => $(id).addEventListener('change', () => {
  if (!$('dto-de').value || !$('dto-ate').value) return;
  if ($('dto-de').value > $('dto-ate').value) { const t = $('dto-de').value; $('dto-de').value = $('dto-ate').value; $('dto-ate').value = t; }
  perO = 'custom'; [...$('per-o').children].forEach(x => x.setAttribute('aria-pressed', 'false')); renderOleo();
}));
$('cat-o').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; catO = b.dataset.c; [...$('cat-o').children].forEach(x => x.setAttribute('aria-pressed', x === b)); renderOleo(); });
function renderOleo() {
  if (!eu) return;
  const ativos = VE.filter(v => v.ativo);
  const lista = ativos.filter(v => !catO || v.categoria === catO).map(v => ({ v, s: situacao(v) })).sort((a, b) => a.s.o - b.s.o || (a.s.falta ?? 1e9) - (b.s.falta ?? 1e9));
  const catOk = pl => !catO || veic(pl).categoria === catO;
  const todos = ativos.filter(v => !catO || v.categoria === catO).map(situacao);
  const [pa, pb] = periodoO(), noPer = TR.filter(t => t.d >= pa && t.d <= pb && catOk(t.placa));
  if (!$('dto-de').value) pintaDatasO();
  const venc = todos.filter(s => s.cls === 'venc').length, prox = todos.filter(s => s.cls === 'prox').length;
  const aguard = PD.filter(x => x.status === 'solicitado' && catOk(x.placa)).length, cpend = TR.filter(t => t.origem === 'app' && t.custo == null && catOk(t.placa)).length;
  const gasto = noPer.reduce((s, t) => s + Number(t.custo || 0), 0);
  $('kpis-o').innerHTML = `
    <div class="kpi ${venc ? 'flag' : ''}"><span class="l">Trocas vencidas</span><span class="v">${venc}</span><span class="s">km atual passou do km da próxima troca</span></div>
    <div class="kpi"><span class="l">Próximas</span><span class="v" style="color:var(--amb)">${prox}</span><span class="s">faltam menos de 1.000 km</span></div>
    <div class="kpi"><span class="l">Aguardando aprovação</span><span class="v">${aguard}</span><span class="s">pedidos da líder de frota</span></div>
    <div class="kpi"><span class="l">Custo pendente</span><span class="v">${cpend}</span><span class="s">trocas feitas sem valor lançado</span></div>
    <div class="kpi"><span class="l">Gasto no período</span><span class="v" style="font-size:28px">${real(gasto)}</span><span class="s">${noPer.length} trocas ${rotuloO()}</span></div>`;
  $('sit').innerHTML = lista.map(({ v, s }) => { const pa = pedidoAberto(v.placa); let acao = '';
    if (pa) acao = `<span class="pill info">${{ solicitado: 'Aguardando aprovação', aprovado: 'Aprovado', realizado: 'Feito · custo pendente' }[pa.status]}</span>`;
    else if (opera() && !v.garantia) acao = `<button type="button" class="btn btn-sm ${s.o < 2 ? 'btn-main' : 'btn-ghost'}" data-sol="${esc(v.placa)}">Solicitar troca</button>`;
    return `<tr><td><b>${esc(v.placa)}</b><br><small class="mut">${esc(v.modelo || v.tipo || '')}</small></td><td>${esc(v.categoria)}</td><td class="num">${s.ut ? dataBr(s.ut.d) : '—'}<br><small class="mut">${s.ut && s.ut.km != null ? fmt(s.ut.km) + ' km' : s.ut ? 'km não informado' : ''}</small></td><td class="r num">${s.km != null ? fmt(s.km) : s.susp ? '<span class="bad">conferir</span>' : '—'}</td><td class="r num">${s.prox != null && !v.garantia ? fmt(s.prox) + (s.estimada ? '<br><small class="mut" title="Sem KM ÓLEO informado: km da troca + intervalo">estimada</small>' : '') : '—'}</td><td><span class="pill ${s.cls}">${s.txt}</span><br><small class="mut">${s.det}</small></td><td class="r">${acao}</td></tr>`; }).join('');

  const ord = { solicitado: 0, realizado: 1, aprovado: 2, recusado: 3, fechado: 4, cancelado: 5 };
  const recentes = PD.filter(x => ['solicitado', 'aprovado', 'realizado'].includes(x.status) || (Date.now() - new Date(x.solicitado_em)) < 30 * 864e5);
  const ps = recentes.slice().sort((a, b) => ord[a.status] - ord[b.status] || b.id - a.id);
  const fp = () => ps.map(x => { const v = veic(x.placa), t = trocaDoPedido(x.id); let act = '';
    if (x.status === 'solicitado' && papel('gerente')) act = `<div class="ped-act"><button type="button" class="btn btn-sm btn-main" data-apr="${x.id}">Aprovar</button><input id="mot-${x.id}" placeholder="Motivo, se recusar" aria-label="Motivo da recusa"><button type="button" class="btn btn-sm btn-ghost" data-rec="${x.id}">Recusar</button></div>`;
    else if (x.status === 'solicitado') act = '<div class="mut">Aguardando o gerente aprovar.</div>';
    if (x.status === 'aprovado' && opera()) act = autorizadoHoje(x)
      ? `<div class="aut"><span>Autorizado para <b>${esc(curto(pessoaNome(x.autorizado_para)))}</b> hoje · ele entra no celular com o RE e o PIN dele e vê só a ${esc(x.placa)}</span><button type="button" class="btn btn-sm btn-ghost" data-cancaut="${x.id}">Cancelar autorização</button><button type="button" class="btn btn-sm btn-ghost" data-cancped="${x.id}">Cancelar pedido</button></div>`
      : `<div class="ped-act"><select id="aut-${x.id}" aria-label="Motorista que vai levar o veículo"><option value="">Escolha quem vai levar</option>${opcoesMotorista()}</select><button type="button" class="btn btn-sm btn-ghost" data-aut="${x.id}">AUTORIZAR MOTORISTA</button><button type="button" class="btn btn-sm btn-ghost" data-cancped="${x.id}">Cancelar pedido</button><span class="mut">Vale só hoje, só para este veículo e para uma troca.</span></div>`;
    if (x.status === 'realizado' && opera() && t) act = `<div class="ped-act"><label for="cus-${t.id}" class="mut">Custo (R$)</label><input id="cus-${t.id}" inputmode="decimal" placeholder="0,00" class="num"><button type="button" class="btn btn-sm btn-main" data-cus="${t.id}">Lançar custo</button></div>`;
    else if (x.status === 'realizado') act = '<div class="mut">A líder de frota vai lançar o custo.</div>';
    const det = t ? `${dataBr(t.d)} · ${esc(curto(t.feito_por_nome))}${t.funcao && t.funcao !== 'Mecânico' ? ` (${esc(t.funcao)}${t.re ? ', RE ' + esc(t.re) : ''})` : ''} · ${esc(t.estabelecimento || '')} · ${esc(t.oleo || '')} · ${fmt(t.km)} km${t.requisicao ? ' · req. ' + esc(t.requisicao) : ''}${t.custo != null ? ' · ' + real(t.custo) : ''}`
      : x.status === 'recusado' ? `Recusado por ${esc(curto(pessoaNome(x.decidido_por)))}. Motivo: ${esc(x.motivo_recusa || 'não informado')}`
      : x.status === 'aprovado' ? `Aprovado por ${esc(curto(pessoaNome(x.decidido_por)))} em ${dataBr(x.decidido_em)} · na lista do mecânico`
      : `Solicitado por ${esc(curto(pessoaNome(x.solicitado_por)))} em ${dataBr(x.solicitado_em)}`;
    return `<div class="ped"><div class="ped-h"><div><b>${esc(x.placa)}</b> <span class="mut">${esc(v.modelo || v.tipo || '')}</span></div>${t && t.fotos ? thumbs(t.fotos, x.placa) : ''}</div>${passos(x)}<div class="mut ped-d">${det}</div>${act}</div>`; }).join('') || '<div class="empty">Nenhum pedido nos últimos 30 dias.</div>';
  $('peds').innerHTML = fp(); pintarFotos(ps.map(trocaDoPedido).filter(Boolean), $('peds'), fp);

  const gv = {}; noPer.forEach(t => { const g = gv[t.placa] = gv[t.placa] || { n: 0, sc: 0, tot: 0, nc: 0 }; g.n++; if (t.custo == null) g.sc++; else { g.tot += Number(t.custo); g.nc++; } });
  const gl = Object.entries(gv).sort((a, b) => b[1].tot - a[1].tot);
  $('gv-sub').textContent = `${gl.length} veículos com troca ${rotuloO()}${catO ? ' · ' + { Pesado: 'pesados', Leve: 'leves', Moto: 'motos' }[catO] : ''}`;
  $('gv-o').innerHTML = gl.map(([pl, g]) => `<tr><td><b>${esc(pl)}</b><br><small class="mut">${esc(veic(pl).modelo || '')}</small></td><td>${esc(veic(pl).categoria || '')}</td><td class="r num">${g.n}</td><td class="r num">${g.sc ? `<span class="bad">${g.sc}</span>` : '—'}</td><td class="r num">${g.nc ? real(g.tot / g.nc) : '—'}</td><td class="r num"><b>${real(g.tot)}</b></td></tr>`).join('')
    + (gl.length ? `<tr><td colspan="2"><b>Total</b></td><td class="r num"><b>${noPer.length}</b></td><td></td><td></td><td class="r num"><b>${real(gasto)}</b></td></tr>` : '<tr><td colspan="6" class="empty">Nenhuma troca neste período.</td></tr>');
  const hs = noPer.slice().sort((a, b) => b.d - a.d).slice(0, 20);
  $('hist-sub').textContent = `20 mais recentes ${rotuloO()}, da planilha e do app`;
  const fh = () => hs.map(h => `<tr><td class="num">${dataBr(h.d)}</td><td><b>${esc(h.placa)}</b><br><small class="mut">${esc(veic(h.placa).modelo || '')}</small></td><td>${esc(curto(h.feito_por_nome))}</td><td>${esc(h.estabelecimento || '—')}</td><td>${esc(h.oleo || '—')}</td><td class="r num">${h.km != null ? fmt(h.km) : '—'}</td><td>${h.filtro_oleo ? 'Óleo' : ''}${h.filtro_oleo && h.filtro_comb ? ' + ' : ''}${h.filtro_comb ? 'Comb.' : ''}${!h.filtro_oleo && !h.filtro_comb ? '—' : ''}</td><td>${thumbsR(h, h.placa, '—')}</td><td class="r num">${h.custo != null ? real(h.custo) : '<span class="bad">pendente</span>'}</td></tr>`).join('');
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
    else if (d.aut) { const s = $('aut-' + d.aut); if (!s.value) { s.focus(); toast('Escolha quem vai levar o veículo.', true); return; }
      await rpc('painel_autorizar_motorista', { p_pedido: +d.aut, p_pessoa: s.value }); toast('Autorizado. A pessoa entra no celular com o RE e o PIN dela.'); }
    else if (d.cancaut) { await rpc('painel_cancelar_autorizacao', { p_pedido: +d.cancaut }); toast('Autorização cancelada.'); }
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
const usaCelular = p => p.papeis.some(x => CAMPO.includes(x));
function situacaoPin(p) {
  if (!p.re) return '<span class="mut">sem RE</span>';
  if (p.pin_criado_em) return `<span class="pill ok">Criado em ${dataBr(p.pin_criado_em)}</span>`;
  if (p.tem_pin) return '<span class="pill ok">Definido pela líder</span>';
  return '<span class="pill cinza">Aguardando primeiro acesso</span>';
}
function renderCad() {
  // quem usa o celular e está sem RE aparece primeiro, para a Fernanda completar
  const ord = PE.slice().sort((a, b) => ((b.ativo && usaCelular(b) && !b.re) - (a.ativo && usaCelular(a) && !a.re)) || (b.ativo - a.ativo) || a.nome.localeCompare(b.nome));
  const semRe = PE.filter(p => p.ativo && usaCelular(p) && !p.re).length;
  $('pes-sub').innerHTML = semRe ? `<span class="bad">${semRe} ${semRe === 1 ? 'pessoa do celular está' : 'pessoas do celular estão'} sem RE</span>` : '';
  $('t-pessoas').innerHTML = ord.map(p => `<tr class="${p.ativo ? '' : 'inativo'}"><td><b>${esc(p.nome)}</b><br><small class="mut">${esc(p.funcao || '')}${p.email ? ' · ' + esc(p.email) : ''}</small></td><td class="num">${p.re ? esc(p.re) : p.ativo ? '<span class="bad">falta RE</span>' : '—'}</td><td>${p.papeis.map(x => `<span class="pill info" style="margin:1px">${esc((NOME_PAPEL[x] || x).split(' (')[0])}</span>`).join(' ')}</td><td>${p.ativo && usaCelular(p) ? situacaoPin(p) : ''}</td><td><button type="button" class="btn btn-sm btn-ghost" data-edp="${p.id}">Editar</button></td></tr>`).join('');
  $('t-veics').innerHTML = VE.map(v => `<tr class="${v.ativo ? '' : 'inativo'}"><td><b>${esc(v.placa)}</b></td><td>${esc(v.modelo || '')}<br><small class="mut">${esc(v.tipo || '')}</small></td><td>${esc(v.categoria)}${v.garantia ? ' <span class="pill gar">Garantia</span>' : ''}</td><td class="r num">${v.intervalo_km ? fmt(v.intervalo_km) : '—'}</td><td>${v.frota_pesada ? 'Sim' : ''}</td><td><button type="button" class="btn btn-sm btn-ghost" data-edv="${esc(v.placa)}">Editar</button></td></tr>`).join('');
  const tipos = [['estabelecimento', 'Locais da troca'], ['oleo', 'Tipos de óleo'], ['funcao', 'Funções (motorista ou outro)']];
  $('listas').innerHTML = tipos.map(([t, n]) => `<div style="margin-bottom:14px"><b>${n}</b><div class="chips-lista">${LI.filter(l => l.tipo === t).map(l => `<span>${esc(l.valor)}<button type="button" data-rml="${t}" data-v="${esc(l.valor)}" aria-label="Remover ${esc(l.valor)}">×</button></span>`).join('')}</div><div class="linha-btn" style="margin-top:8px"><input id="nl-${t}" placeholder="Adicionar" style="padding:6px 8px;border-radius:6px;border:1.5px solid var(--line);background:var(--surface)"><button type="button" class="btn btn-sm btn-ghost" data-addl="${t}">Adicionar</button></div></div>`).join('');
}
function abrirPessoa(p) {
  $('f-pessoa').hidden = false; $('p-msg').textContent = '';
  $('p-id').value = p ? p.id : ''; $('p-nome').value = p ? p.nome : ''; $('p-re').value = p ? p.re || '' : ''; $('p-funcao').value = p ? p.funcao || '' : ''; $('p-email').value = p ? p.email || '' : '';
  $('p-ativo').checked = p ? p.ativo : true; $('p-zerar-conf').hidden = true;
  [...$('p-papeis').querySelectorAll('input')].forEach(i => { i.checked = p ? p.papeis.includes(i.value) : false; });
  pintaPinBox(p); $('p-nome').focus();
}
function pintaPinBox(p) {
  $('p-pin-box').hidden = !p || !usaCelular(p);
  if (!p) return;
  $('p-pin-sit').innerHTML = situacaoPin(p);
  $('p-pin-zerar').hidden = !p.tem_pin;
}
$('nova-pessoa').onclick = () => abrirPessoa(null);
$('p-cancelar').onclick = () => { $('f-pessoa').hidden = true; };
$('t-pessoas').addEventListener('click', e => { const id = e.target.dataset.edp; if (id) { abrirPessoa(PE.find(p => p.id === id)); $('f-pessoa').scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
$('f-pessoa').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const id = await rpc('painel_salvar_pessoa', { p_id: $('p-id').value || null, p_nome: $('p-nome').value, p_re: $('p-re').value, p_funcao: $('p-funcao').value,
      p_papeis: [...$('p-papeis').querySelectorAll('input:checked')].map(i => i.value), p_email: $('p-email').value, p_ativo: $('p-ativo').checked });
    PE = await tudo('pessoas', 'nome', true, COLS_PESSOAS); renderCad(); renderOleo(); $('p-id').value = id;
    const p = PE.find(x => x.id === id); pintaPinBox(p);
    $('p-msg').className = 'msg ok';
    $('p-msg').textContent = 'Salvo.' + (p && usaCelular(p) && !p.tem_pin ? ` No celular, a pessoa entra com o RE ${p.re} e cria o próprio PIN.` : '') + ($('p-email').value ? ' Para o painel, crie também o login desse e-mail no Supabase (veja o guia).' : '');
  } catch (err) { $('p-msg').className = 'msg erro'; $('p-msg').textContent = err.message; }
});
$('p-gerar').onclick = async () => {
  if ($('p-re').value.trim() && !confirm('Trocar o RE digitado por um código gerado?')) return;
  try { $('p-re').value = await rpc('painel_gerar_re'); $('p-msg').className = 'msg ok'; $('p-msg').textContent = 'Código gerado. Clique em Salvar e passe esse número para a pessoa: é o login dela no celular.'; }
  catch (err) { $('p-msg').className = 'msg erro'; $('p-msg').textContent = err.message; }
};
$('p-pin-zerar').onclick = () => { $('p-zerar-conf').hidden = false; };
$('p-zerar-nao').onclick = () => { $('p-zerar-conf').hidden = true; };
$('p-zerar-sim').onclick = async () => {
  try {
    await rpc('painel_zerar_pin', { p_pessoa: $('p-id').value });
    PE = await tudo('pessoas', 'nome', true, COLS_PESSOAS); renderCad(); pintaPinBox(PE.find(x => x.id === $('p-id').value));
    $('p-zerar-conf').hidden = true; $('p-msg').className = 'msg ok'; $('p-msg').textContent = 'PIN zerado. No próximo acesso, a pessoa digita o RE, confirma o nome e cria um PIN novo.';
  } catch (err) { $('p-msg').className = 'msg erro'; $('p-msg').textContent = err.message; }
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


// ================= FOTOS: ESPAÇO E ARQUIVAMENTO =================
const LIMITE_FOTOS = 1024 * 1024 * 1024;   // 1 GB do plano gratuito
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = m => { const [a, b] = m.split('-'); return `${MESES[+b - 1]}/${a}`; };
const tam = b => b >= 1073741824 ? fmt(b / 1073741824, 2) + ' GB' : b >= 1048576 ? fmt(b / 1048576, 0) + ' MB' : fmt(b / 1024, 0) + ' KB';
const baixados = new Map();   // mês -> registros do .zip baixado nesta sessão
let confirmando = null, ocupadoFotos = false;

async function verUsoFotos() {
  if (!cadastra()) return;
  let u; try { u = await rpc('painel_uso_fotos'); } catch (_) { return; }
  const pct = u.bytes / LIMITE_FOTOS * 100, barra = $('uso-barra');
  if (barra) { barra.style.width = Math.min(100, pct).toFixed(1) + '%'; barra.className = pct >= 95 ? 'critico' : pct >= 80 ? 'alto' : ''; }
  if ($('uso-txt')) $('uso-txt').textContent = `${tam(u.bytes)} de 1 GB (${fmt(pct, 0)}%) · ${fmt(u.fotos)} fotos`;
  const av = $('aviso-fotos');
  if (pct >= 80) {
    av.hidden = false;
    av.innerHTML = `<span><strong>${pct >= 95 ? 'Espaço das fotos quase acabando' : 'Espaço das fotos passando de 80%'}:</strong> ${tam(u.bytes)} de 1 GB (${fmt(pct, 0)}%). ${pct >= 95 ? 'Quando encher, os registros novos não vão conseguir enviar fotos.' : ''} Baixe e exclua as fotos dos meses mais antigos.</span><button type="button" class="btn btn-sm btn-main" id="ir-fotos">Ver fotos</button>`;
    $('ir-fotos').onclick = () => { document.querySelector('#tabs [data-t=cad]').click(); $('card-fotos').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  } else av.hidden = true;
}

async function renderFotos() {
  let d; try { d = await rpc('painel_fotos_meses'); } catch (e) { $('t-fotos').innerHTML = `<tr><td colspan="4" class="empty">${esc(e.message)}</td></tr>`; return; }
  const atual = iso(new Date()).slice(0, 7);
  $('t-fotos').innerHTML = d.com_fotos.length ? d.com_fotos.map(m => {
    const mes = m.mes.slice(0, 7), ok = baixados.has(mes);
    let acoes;
    if (confirmando === mes) acoes = `<div class="confirma"><span>Excluir ${fmt(m.fotos)} fotos de ${nomeMes(mes)}? Não dá para desfazer.</span><button type="button" class="btn btn-sm btn-main" data-exc-sim="${mes}">Sim, excluir</button><button type="button" class="btn btn-sm btn-ghost" data-exc-nao="1">Cancelar</button></div>`;
    else acoes = `<div class="acoes-mes"><button type="button" class="btn btn-sm ${ok ? 'btn-ghost' : 'btn-main'}" data-zip="${mes}">${ok ? 'Baixar de novo' : 'Baixar .zip'}</button>`
      + (mes === atual ? '<span class="mut">mês atual</span>' : `<button type="button" class="btn btn-sm btn-ghost" data-exc="${mes}" ${ok ? '' : 'disabled title="Baixe o .zip antes de excluir"'}>Excluir fotos</button>`) + '</div>';
    return `<tr><td><b>${nomeMes(mes)}</b></td><td class="r num">${fmt(m.fotos)}</td><td class="r num">${tam(m.bytes)}</td><td>${acoes}</td></tr>`;
  }).join('') : '<tr><td colspan="4" class="empty">Nenhuma foto no banco ainda.</td></tr>';
  $('arquivados').innerHTML = d.arquivados.length ? 'Meses já arquivados: ' + d.arquivados.map(a => `${nomeMes(a.mes.slice(0, 7))} (${fmt(a.registros)} registros, em ${dataBr(a.em)})`).join(' · ') : '';
}

// pastas do .zip e nomes no indice.csv (checklist e escadas vêm do 12_fotos_checklist.sql)
const PASTA = { abastecimento: 'abastecimentos', troca: 'trocas-de-oleo', checklist: 'checklists', escada: 'escadas' };
const ROT_FOTO = { item: 'Item com problema', avaria: 'Avaria', escada: 'Escada com NC', recusa: 'Recusa', foto: 'Foto' };
const rotuloFoto = k => { const m = /^([a-z]+)(\d*)$/.exec(k); return m && ROT_FOTO[m[1]] ? ROT_FOTO[m[1]] + (m[2] ? ' ' + m[2] : '') : k; };
const TIPO_FOTO = { abastecimento: 'Abastecimento', troca: 'Troca de óleo', checklist: 'Checklist', escada: 'Inspeção de escada' };
async function baixarZip(mes, btn) {
  const txt = btn.textContent; btn.disabled = true; ocupadoFotos = true;
  try {
    btn.textContent = 'Buscando…';
    const regs = await rpc('painel_fotos_do_mes', { p_mes: mes + '-01' });
    const itens = regs.flatMap(r => Object.entries(r.fotos).map(([k, cam]) => ({ r, k, cam })));
    if (!itens.length) { toast('Esse mês não tem fotos.'); return; }
    const urls = {};
    for (let i = 0; i < itens.length; i += 100) {
      const lote = itens.slice(i, i + 100).map(x => x.cam);
      const { data } = await sb.storage.from('fotos').createSignedUrls(lote, 900);
      (data || []).forEach(x => { if (x.signedUrl) urls[x.path] = x.signedUrl; });
    }
    const arquivos = [], falhas = [], linhas = ['tipo;data;hora;placa;foto;arquivo'];
    let feitos = 0;
    const p2 = n => String(n).padStart(2, '0');
    async function pega(x) {
      const d = new Date(x.r.data), dia = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, hora = `${p2(d.getHours())}${p2(d.getMinutes())}`;
      const pasta = PASTA[x.r.tipo] || 'outros';
      const nome = `${pasta}/${dia}_${hora}_${x.r.placa}_${x.k}_${x.r.numero || x.r.id}.jpg`;
      try {
        if (!urls[x.cam]) throw new Error('sem link');
        const resp = await fetch(urls[x.cam]); if (!resp.ok) throw new Error('HTTP ' + resp.status);
        arquivos.push({ nome, dados: new Uint8Array(await resp.arrayBuffer()), data: d });
        linhas.push([TIPO_FOTO[x.r.tipo] || x.r.tipo, dataBr(d), `${p2(d.getHours())}:${p2(d.getMinutes())}`, x.r.placa, NF[x.k] || rotuloFoto(x.k), nome].join(';'));
      } catch (_) { falhas.push(x); }
      feitos++; btn.textContent = `Baixando ${feitos}/${itens.length}…`;
    }
    for (let i = 0; i < itens.length; i += 6) await Promise.all(itens.slice(i, i + 6).map(pega));
    arquivos.push({ nome: 'indice.csv', dados: new TextEncoder().encode('﻿' + linhas.join('\r\n')), data: new Date() });
    const blob = criarZip(arquivos), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `fotos-frota-${mes}.zip`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    if (falhas.length) { baixados.delete(mes); toast(`${falhas.length} foto(s) não baixaram. Baixe de novo antes de excluir.`, true); }
    else { baixados.set(mes, regs); toast(`Baixado: ${itens.length} fotos (${tam(blob.size)}). Confira o .zip antes de excluir.`); }
  } catch (e) { toast(e.message, true); }
  finally { ocupadoFotos = false; btn.disabled = false; btn.textContent = txt; renderFotos(); }
}

async function excluirMes(mes, btn) {
  const regs = baixados.get(mes); if (!regs) { toast('Baixe o .zip antes de excluir.', true); return; }
  btn.disabled = true; btn.textContent = 'Excluindo…'; ocupadoFotos = true;
  try {
    const todos = regs.flatMap(r => Object.values(r.fotos)), apagados = new Set();
    for (let i = 0; i < todos.length; i += 100) {
      const lote = todos.slice(i, i + 100);
      const { data, error } = await sb.storage.from('fotos').remove(lote);
      if (error) throw new Error(msgErro(error));
      (data || []).forEach(o => apagados.add(o.name));
    }
    const ok = regs.filter(r => Object.values(r.fotos).every(c => apagados.has(c)));
    const arq = { p_abast: ok.filter(r => r.tipo === 'abastecimento').map(r => r.id), p_trocas: ok.filter(r => r.tipo === 'troca').map(r => r.id) };
    const cks = ok.filter(r => r.tipo === 'checklist').map(r => r.id), insp = ok.filter(r => r.tipo === 'escada').map(r => r.id);
    if (cks.length || insp.length) Object.assign(arq, { p_cks: cks, p_insp: insp });
    await rpc('painel_marcar_arquivadas', arq);
    baixados.delete(mes); confirmando = null;
    if (ok.length < regs.length) toast(`Excluídas as fotos de ${ok.length} de ${regs.length} registros. Tente de novo para o restante.`, true);
    else toast(`Fotos de ${nomeMes(mes)} excluídas. Os registros continuam no painel.`);
    ocupadoFotos = false; await carregarTudo(); verUsoFotos();
  } catch (e) { ocupadoFotos = false; toast(e.message, true); btn.disabled = false; btn.textContent = 'Sim, excluir'; }
}

$('t-fotos').addEventListener('click', e => {
  const d = e.target.dataset;
  if (d.zip) baixarZip(d.zip, e.target);
  else if (d.exc) { confirmando = d.exc; renderFotos(); }
  else if (d.excNao) { confirmando = null; renderFotos(); }
  else if (d.excSim) excluirMes(d.excSim, e.target);
});

iniciar();
