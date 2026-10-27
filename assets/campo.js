// App do celular da portaria/oficina
const LIMITE_KM = 1500;            // diferença de km que pede confirmação
const SAIDA_APOS_REGISTRO = 15;    // segundos
const SAIDA_INATIVO = 120000;      // 2 minutos
const MOTORISTA = 'motorista';     // id especial na lista da troca de óleo

let inicio = { porteiros: [], mecanicos: [] };
let modulo = null, pessoa = null, pin = '', token = null, nomeLogado = '';
let dadosAb = null, dadosOl = null, pedidoSel = null;
let fotos = {};
let tSaida = null, tInativo = null;

const telas = ['s-config', 's-inicio', 's-login', 's-form', 's-oleo', 's-oleo-form', 's-done'];
function tela(id) {
  telas.forEach(s => $(s).hidden = s !== id);
  document.querySelector('.screen').classList.toggle('fundo', id === 's-inicio' || id === 's-login');
  if (id !== 's-done') clearInterval(tSaida);
  if (id === 's-login' || id === 's-inicio') clearTimeout(tInativo); else inativo();
  window.scrollTo(0, 0);
}
function carregando(on, t) { $('carregando').hidden = !on; if (t) $('carregando-t').textContent = t; }

// ---------- início ----------
$('ic-ab').innerHTML = ICONE_BOMBA; $('ic-ol').innerHTML = ICONE_GOTA;
$('voltar').innerHTML = ICONE_VOLTAR + 'Voltar'; $('o-voltar').innerHTML = ICONE_VOLTAR + 'Voltar';

async function carregarInicio() {
  if (!configurado) { tela('s-config'); return; }
  try { inicio = await rpc('campo_inicio'); } catch (e) { inicio = { porteiros: [], mecanicos: [] }; }
  tela('s-inicio');
}
document.querySelector('.mods').addEventListener('click', async e => {
  const b = e.target.closest('.mod'); if (!b) return;
  modulo = b.dataset.mod;
  try { inicio = await rpc('campo_inicio'); } catch (err) { alertaLogin(err.message); }
  $('modtag').textContent = modulo === 'abastecimento' ? 'Abastecimento · frota pesada' : 'Troca de óleo';
  pessoa = null; pin = ''; dots(); $('pin-err').textContent = ''; $('pin-msg').textContent = '';
  pintaUsuarios(); tela('s-login');
});
$('voltar').onclick = () => { pessoa = null; pin = ''; dots(); tela('s-inicio'); };
function alertaLogin(m) { $('pin-err').textContent = m; }

// ---------- login ----------
function pintaUsuarios() {
  const lista = modulo === 'abastecimento' ? inicio.porteiros : inicio.mecanicos.concat([{ id: MOTORISTA, nome: 'Motorista ou outro funcionário' }]);
  $('users').innerHTML = lista.length ? lista.map(p => `<button type="button" class="user" data-id="${esc(p.id)}" aria-pressed="false"><span class="av">${p.id === MOTORISTA ? '?' : esc(ini(p.nome))}</span><span>${p.id === MOTORISTA ? esc(p.nome) : esc(curto(p.nome))}</span></button>`).join('')
    : '<div class="vazio"><b>Ninguém cadastrado</b><span>A Fernanda precisa cadastrar os nomes e PINs no painel.</span></div>';
}
$('users').addEventListener('click', e => {
  const b = e.target.closest('.user'); if (!b) return;
  [...$('users').children].forEach(x => x.setAttribute('aria-pressed', x === b));
  pessoa = b.dataset.id; pin = ''; dots(); $('pin-err').textContent = '';
  $('pin-msg').textContent = pessoa === MOTORISTA ? 'Digite o código de autorização que a Fernanda passou' : 'Digite seu PIN';
});
$('pad').innerHTML = ['1','2','3','4','5','6','7','8','9','','0','⌫'].map(k => k ? `<button type="button" data-k="${k}" aria-label="${k === '⌫' ? 'Apagar' : k}">${k}</button>` : '<span></span>').join('');
function dots() { [...$('dots').children].forEach((s, i) => s.classList.toggle('on', i < pin.length)); }
let entrando = false;
$('pad').addEventListener('click', async e => {
  const k = e.target.dataset.k; if (!k || entrando) return;
  if (pessoa == null) { $('pin-err').textContent = 'Escolha seu nome primeiro'; return; }
  if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
  dots(); if (pin.length < 4) return;
  entrando = true; carregando(true, 'Entrando…');
  try {
    if (pessoa === MOTORISTA) {
      const r = await rpc('campo_codigo', { p_codigo: pin });
      token = r.token; nomeLogado = 'Motorista ou outro funcionário';
      dadosOl = await rpc('campo_aprovados', { p_token: token });
      pedidoSel = dadosOl.pedidos[0];
      if (!pedidoSel) throw new Error('Este veículo não está mais aprovado para troca.');
      abrirFormOleo();
    } else {
      const r = await rpc('campo_entrar', { p_pessoa: pessoa, p_pin: pin, p_modulo: modulo });
      token = r.token; nomeLogado = r.nome;
      if (modulo === 'abastecimento') { await carregarAbastecimento(); abrirFormAb(); }
      else { await abrirListaOleo(); }
    }
  } catch (err) { $('pin-err').textContent = err.message; pin = ''; setTimeout(dots, 250); }
  finally { entrando = false; carregando(false); }
});

// ---------- saída automática ----------
async function sairUsuario() {
  clearInterval(tSaida); clearTimeout(tInativo);
  if (token) { const t = token; token = null; try { await rpc('campo_sair', { p_token: t }); } catch (_) {} }
  pessoa = null; pin = ''; dots(); $('pin-err').textContent = ''; dadosAb = null; dadosOl = null;
  tela('s-inicio');
}
function inativo() { clearTimeout(tInativo); if (token) tInativo = setTimeout(() => { sairUsuario(); }, SAIDA_INATIVO); }
document.addEventListener('pointerdown', inativo); document.addEventListener('input', inativo);
function contagem() {
  clearInterval(tSaida); let s = SAIDA_APOS_REGISTRO;
  const f = () => { $('saida').textContent = `Saindo automaticamente em ${s} s para o próximo`; if (s-- <= 0) sairUsuario(); };
  f(); tSaida = setInterval(f, 1000);
}
['sair', 'sair2', 'sair-oleo'].forEach(id => $(id).onclick = sairUsuario);
$('o-voltar').onclick = () => { if (pessoa === MOTORISTA) sairUsuario(); else abrirListaOleo(); };
$('novo').onclick = async () => { try { if (modulo === 'abastecimento') { await carregarAbastecimento(); abrirFormAb(); } else if (pessoa === MOTORISTA) sairUsuario(); else await abrirListaOleo(); } catch (e) { sairUsuario(); } };

// ---------- fotos ----------
const NF = { painel: 'Painel (km)', placa: 'Placa', bomba: 'Visor da bomba', 'o-placa': 'Placa', 'o-adesivo': 'Adesivo da troca' };
function pintaFoto(k) {
  const l = document.querySelector(`.foto[data-f="${k}"]`); if (!l) return;
  l.classList.toggle('ok', !!fotos[k]); l.classList.remove('falta');
  [...l.querySelectorAll('img,.cap')].forEach(n => n.remove());
  if (fotos[k]) { const u = URL.createObjectURL(fotos[k]); l.insertAdjacentHTML('beforeend', `<img src="${u}" alt="Foto: ${NF[k]}"><span class="cap">${NF[k]} · ${Math.round(fotos[k].size / 1024)} KB</span>`); }
}
document.querySelectorAll('.foto').forEach(l => l.querySelector('input').addEventListener('change', async e => {
  const f = e.target.files[0], k = l.dataset.f; if (!f) return;
  try { fotos[k] = await reduzir(f); pintaFoto(k); } catch (err) { (k.startsWith('o-') ? avisoO : aviso)('<strong>' + esc(err.message) + '</strong> Tire a foto de novo.'); }
  e.target.value = '';
}));
async function enviarFotos(chaves) {
  const r = {};
  for (const k of chaves) r[k.replace('o-', '')] = await enviarFoto(fotos[k], k.replace('o-', ''));
  return r;
}

// ---------- abastecimento ----------
async function carregarAbastecimento() { dadosAb = await rpc('campo_dados_abastecimento', { p_token: token }); }
function abrirFormAb() {
  $('who').textContent = curto(nomeLogado) + ' · Portaria';
  $('form').reset(); fotos = {}; ['painel', 'placa', 'bomba'].forEach(pintaFoto);
  $('ultimo').textContent = ''; $('alerta').hidden = true; pendente = false;
  $('f-placa').innerHTML = '<option value="">Escolha o veículo</option>' + dadosAb.veiculos.map(v => `<option value="${esc(v.placa)}">${esc(v.placa)} · ${esc(v.tipo || '')}</option>`).join('');
  $('f-mot').innerHTML = '<option value="">Escolha o motorista</option>' + dadosAb.motoristas.map(m => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join('');
  $('agora').textContent = 'Data e hora: ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + ' (automático)';
  tela('s-form');
}
let pendente = false;
const veicAb = p => dadosAb.veiculos.find(v => v.placa === p);
$('f-placa').onchange = () => {
  $('alerta').hidden = true; pendente = false; const v = veicAb($('f-placa').value);
  $('ultimo').innerHTML = !v ? '' : v.ultimo_km ? `Último km: <b class="num">${fmt(v.ultimo_km)}</b> em ${fdt(v.ultimo_em)}` : 'Sem registro anterior';
};
['f-km', 'f-l'].forEach(id => $(id).addEventListener('input', () => { $('alerta').hidden = true; pendente = false; }));
function aviso(html, conf) {
  const a = $('alerta');
  a.innerHTML = html + (conf ? '<div class="row"><button type="button" class="btn btn-sm btn-ghost" id="corrigir">Corrigir</button><button type="button" class="btn btn-sm btn-main" id="confirmar">Está certo, registrar</button></div>' : '');
  a.hidden = false; a.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (conf) { $('corrigir').onclick = () => { a.hidden = true; $('f-km').focus(); }; $('confirmar').onclick = () => salvarAb(true); }
}
$('form').addEventListener('submit', e => { e.preventDefault(); salvarAb(false); });
let salvando = false;
async function salvarAb(forcar) {
  if (salvando) return;
  const placa = $('f-placa').value, mot = $('f-mot').value;
  const l = parseFloat($('f-l').value.replace(',', '.')), km = parseInt($('f-km').value.replace(/\D/g, ''), 10);
  if (!placa || !mot) return aviso('<strong>Falta informação.</strong> Escolha o veículo e o motorista.');
  if (!(l > 0) || l > 600) return aviso('<strong>Litros inválido.</strong> Digite os litros da bomba, por exemplo 45,5.');
  if (!(km > 0)) return aviso('<strong>Km inválido.</strong> Digite o km que aparece no painel do veículo.');
  const falta = ['painel', 'placa', 'bomba'].filter(k => !fotos[k]);
  if (falta.length) { falta.forEach(k => document.querySelector(`.foto[data-f="${k}"]`).classList.add('falta')); return aviso(`<strong>Faltam fotos:</strong> ${falta.map(k => NF[k]).join(', ')}. As 3 fotos são obrigatórias.`); }
  const v = veicAb(placa);
  if (!forcar && v && v.ultimo_km) {
    if (km < v.ultimo_km) return aviso(`<strong>Km menor que o último registro.</strong> A ${esc(placa)} estava com <span class="num">${fmt(v.ultimo_km)}</span> km em ${fdt(v.ultimo_em)}. Confira a placa e o km.`, true);
    if (km - v.ultimo_km > LIMITE_KM) return aviso(`<strong>Diferença grande de km.</strong> São <span class="num">${fmt(km - v.ultimo_km)}</span> km desde o último abastecimento da ${esc(placa)}. Confira o número.`, true);
  }
  salvando = true; carregando(true, 'Enviando fotos…');
  try {
    const caminhos = await enviarFotos(['painel', 'placa', 'bomba']);
    carregando(true, 'Registrando…');
    const r = await rpc('campo_abastecer', { p_token: token, p_placa: placa, p_motorista: mot, p_litros: l, p_km: km, p_confirmado: !!forcar, p_fotos: caminhos });
    const m = dadosAb.motoristas.find(x => x.id === mot);
    $('recibo').innerHTML = `<div><span>Veículo</span><b>${esc(placa)}</b></div><div><span>Motorista</span><b>${esc(curto(m && m.nome))}</b></div><div><span>Litros</span><b class="num">${fmt(l, 1)}</b></div><div><span>Km</span><b class="num">${fmt(km)}</b></div><div><span>Horário</span><b class="num">${fdt(r.registrado_em)}</b></div>` + (forcar ? '<div><span>Situação</span><b style="color:var(--warn)">Enviado para revisão</b></div>' : '');
    $('novo').hidden = false; tela('s-done'); contagem();
  } catch (err) { aviso('<strong>Não foi registrado.</strong> ' + esc(err.message)); }
  finally { salvando = false; carregando(false); }
}

// ---------- troca de óleo ----------
async function abrirListaOleo() {
  dadosOl = await rpc('campo_aprovados', { p_token: token });
  $('who-oleo').textContent = curto(nomeLogado) + ' · Mecânico';
  $('lista-apr').innerHTML = dadosOl.pedidos.length ? dadosOl.pedidos.map(x => `<button type="button" class="aprov" data-id="${x.id}"><span><b>${esc(x.placa)}</b><small>${esc(x.modelo || '')} · ${esc(x.categoria)}</small></span><span class="pill info">Aprovado</span><small class="aprov-d">Aprovado em ${dataBr(x.aprovado_em)}${x.km_atual ? ` · km atual ${fmt(x.km_atual)}` : ''}</small></button>`).join('')
    : '<div class="vazio"><b>Nenhum veículo aprovado agora</b><span>Quando o Carlos aprovar uma troca, o veículo aparece aqui.</span></div>';
  tela('s-oleo');
}
$('lista-apr').addEventListener('click', e => { const b = e.target.closest('.aprov'); if (!b) return; pedidoSel = dadosOl.pedidos.find(x => x.id === +b.dataset.id); abrirFormOleo(); });
function opcoes(lista, vazio) { return `<option value="">${vazio}</option>` + lista.map(x => `<option>${esc(x)}</option>`).join(''); }
function abrirFormOleo() {
  const x = pedidoSel;
  $('o-form').reset(); fotos = {}; ['o-placa', 'o-adesivo'].forEach(pintaFoto); $('o-alerta').hidden = true;
  $('o-estab').innerHTML = opcoes(dadosOl.estabelecimentos, 'Escolha o local');
  $('o-oleo').innerHTML = opcoes(dadosOl.oleos, 'Escolha o óleo');
  $('o-funcao').innerHTML = opcoes(dadosOl.funcoes, 'Escolha');
  $('lista-mot').innerHTML = (dadosOl.motoristas || []).map(n => `<option value="${esc(n)}">`).join('');
  $('o-quem').hidden = pessoa !== MOTORISTA;
  $('o-veic').innerHTML = `<b>${esc(x.placa)}</b> · ${esc(x.modelo || '')}<br><small>Última troca: ${x.ultima_data ? dataBr(x.ultima_data) : '—'}${x.ultimo_km ? ` com ${fmt(x.ultimo_km)} km` : ''}${x.intervalo_km ? ` · intervalo de ${fmt(x.intervalo_km)} km` : ''}</small>`;
  $('o-kmhint').innerHTML = x.km_atual ? `Último km conhecido: <b class="num">${fmt(x.km_atual)}</b>` : '';
  $('o-agora').textContent = 'Data e hora: ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + ' (automático)';
  tela('s-oleo-form');
}
function avisoO(h) { $('o-alerta').innerHTML = h; $('o-alerta').hidden = false; $('o-alerta').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
$('o-form').addEventListener('submit', async e => {
  e.preventDefault(); if (salvando) return;
  const x = pedidoSel, estab = $('o-estab').value, oleo = $('o-oleo').value;
  const km = parseInt($('o-km').value.replace(/\D/g, ''), 10), req = $('o-req').value.trim();
  const fo = document.querySelector('input[name="o-fo"]:checked'), fc = document.querySelector('input[name="o-fc"]:checked');
  const nome = $('o-nome').value.trim(), re = $('o-re').value.trim(), funcao = $('o-funcao').value;
  if (pessoa === MOTORISTA && (nome.split(/\s+/).length < 2 || !re || !funcao)) return avisoO('<strong>Falta informação de quem levou.</strong> Preencha o nome completo, o RE e a função.');
  if (!estab || !oleo) return avisoO('<strong>Falta informação.</strong> Escolha o local e o óleo usado.');
  if (!(km > 0)) return avisoO('<strong>Km inválido.</strong> Digite o km do painel no momento da troca.');
  if (x.ultimo_km && km < x.ultimo_km) return avisoO(`<strong>Km menor que o da última troca</strong> (${fmt(x.ultimo_km)} km). Confira o número.`);
  if (!fo || !fc) return avisoO('<strong>Falta informação.</strong> Marque se trocou o filtro de óleo e o de combustível.');
  const falta = ['o-placa', 'o-adesivo'].filter(k => !fotos[k]);
  if (falta.length) { falta.forEach(k => document.querySelector(`.foto[data-f="${k}"]`).classList.add('falta')); return avisoO(`<strong>Faltam fotos:</strong> ${falta.map(k => NF[k]).join(', ')}. As 2 fotos são obrigatórias.`); }
  salvando = true; carregando(true, 'Enviando fotos…');
  try {
    const caminhos = await enviarFotos(['o-placa', 'o-adesivo']);
    carregando(true, 'Registrando…');
    const r = await rpc('campo_trocar', { p_token: token, p_pedido: x.id, p_estab: estab, p_oleo: oleo, p_km: km, p_requisicao: req,
      p_filtro_oleo: fo.value === 's', p_filtro_comb: fc.value === 's', p_fotos: caminhos,
      p_nome: pessoa === MOTORISTA ? nome : null, p_re: pessoa === MOTORISTA ? re : null, p_funcao: pessoa === MOTORISTA ? funcao : null });
    if (pessoa === MOTORISTA) token = null; // o código já foi usado
    $('recibo').innerHTML = `<div><span>Veículo</span><b>${esc(x.placa)}</b></div>${pessoa === MOTORISTA ? `<div><span>Levado por</span><b>${esc(nome)} · ${esc(funcao)} · RE ${esc(re)}</b></div>` : ''}<div><span>Local</span><b>${esc(estab)}</b></div><div><span>Óleo</span><b>${esc(oleo)}</b></div><div><span>Km</span><b class="num">${fmt(km)}</b></div>${x.intervalo_km ? `<div><span>Próxima troca</span><b class="num">${fmt(r.proxima_km)} km</b></div>` : ''}`;
    $('novo').hidden = pessoa === MOTORISTA;
    tela('s-done'); contagem();
  } catch (err) { avisoO('<strong>Não foi registrado.</strong> ' + esc(err.message)); }
  finally { salvando = false; carregando(false); }
});

// mantém a tela acesa na portaria, quando o aparelho permitir
async function telaAcesa() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (_) {} }
document.addEventListener('visibilitychange', telaAcesa); telaAcesa();

carregarInicio();
