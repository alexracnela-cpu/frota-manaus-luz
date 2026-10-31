// App do celular da portaria/oficina — entrada por RE + PIN
const LIMITE_KM = 1500;            // diferença de km que pede confirmação
const SAIDA_APOS_REGISTRO = 15;    // segundos
const SAIDA_INATIVO = 120000;      // 2 minutos
const SAIDA_INATIVO_CK = 600000;   // 10 minutos preenchendo checklist

let re = '', pin = '', fase = 're';          // entrada
let pinNovo = '', pinConf = '', passo = 1;   // criar PIN
let token = null, eu = null, modulo = null;  // eu = nome, função e acessos de quem entrou
let dadosAb = null, dadosOl = null, pedidoSel = null;
let fotos = {};
let tSaida = null, tInativo = null;

const telas = ['s-config', 's-inicio', 's-primeiro', 's-criar', 's-menu', 's-form', 's-oleo', 's-oleo-form', 's-ck', 's-done'];
const COM_FUNDO = ['s-inicio', 's-primeiro', 's-criar', 's-menu', 's-form', 's-ck'];
function tela(id) {
  telas.forEach(s => $(s).hidden = s !== id);
  $('tema').hidden = !['s-inicio', 's-menu', 's-config'].includes(id);   // botão Modo claro/escuro só na entrada e no menu
  document.querySelector('.screen').classList.toggle('fundo', COM_FUNDO.includes(id));
  if (id !== 's-done') clearInterval(tSaida);
  if (token) inativo(); else clearTimeout(tInativo);
  window.scrollTo(0, 0);
}
function carregando(on, t) { $('carregando').hidden = !on; if (t) $('carregando-t').textContent = t; }

$('ic-ab').innerHTML = ICONE_BOMBA; $('ic-ol').innerHTML = ICONE_GOTA;
$('ic-ck').innerHTML = ICK.lista; $('ic-aut').innerHTML = ICK.chave; $('ic-port').innerHTML = ICK.cancela; $('ic-blq').innerHTML = ICK.bloq;
['cr-voltar', 'o-voltar', 'oleo-menu'].forEach(id => $(id).innerHTML = ICONE_VOLTAR + 'Voltar');

// ---------- teclado numérico ----------
function montaPad(el, acao, fn) {
  el.innerHTML = ['1','2','3','4','5','6','7','8','9','⌫','0','ok'].map(k =>
    k === 'ok' ? (acao ? `<button type="button" class="acao" data-k="ok">${acao}</button>` : '<span></span>')
      : `<button type="button" data-k="${k}" aria-label="${k === '⌫' ? 'Apagar' : k}">${k}</button>`).join('');
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (b) fn(b.dataset.k); });
}
function pintaDots(id, n) { [...$(id).children].forEach((s, i) => s.classList.toggle('on', i < n)); }

// ---------- entrada: RE e depois PIN ----------
montaPad($('pad-ent'), 'Avançar', teclaEntrada);
function pintaEntrada() {
  $('re-txt').textContent = re; $('re-ph').hidden = !!re;
  $('re-box').classList.toggle('ativo', fase === 're');
  $('pin-sec').hidden = fase !== 'pin';
  pintaDots('dots', pin.length);
  const ok = $('pad-ent').querySelector('.acao'); if (ok) ok.textContent = fase === 're' ? 'Avançar' : 'Entrar';
}
function limparEntrada() { re = ''; pin = ''; fase = 're'; $('ent-err').textContent = ''; pintaEntrada(); }
$('re-box').onclick = () => { if (fase === 'pin') { fase = 're'; pin = ''; $('ent-err').textContent = ''; pintaEntrada(); } };
let ocupado = false;
async function teclaEntrada(k) {
  if (ocupado) return;
  $('ent-err').textContent = '';
  if (fase === 're') {
    if (k === '⌫') re = re.slice(0, -1);
    else if (k === 'ok') return verRe();
    else if (re.length < 12) re += k;
    pintaEntrada(); return;
  }
  if (k === '⌫') { if (pin) pin = pin.slice(0, -1); else { fase = 're'; } pintaEntrada(); return; }
  if (k === 'ok') { if (pin.length < 4) { $('ent-err').textContent = 'Digite os 4 números do PIN'; return; } return entrar(); }
  if (pin.length < 4) pin += k;
  pintaEntrada(); if (pin.length === 4) entrar();
}
let primeiro = null;
async function verRe() {
  if (!re) { $('ent-err').textContent = 'Digite seu RE'; return; }
  ocupado = true; carregando(true, 'Conferindo…');
  try {
    const r = await rpc('campo_re', { p_re: re });
    if (r.primeiro) { primeiro = r; abrirPrimeiro(); }
    else { fase = 'pin'; pin = ''; pintaEntrada(); }
  } catch (err) { $('ent-err').textContent = err.message; }
  finally { ocupado = false; carregando(false); }
}
async function entrar() {
  ocupado = true; carregando(true, 'Entrando…');
  try { const r = await rpc('campo_login', { p_re: re, p_pin: pin }); await dentro(r); }
  catch (err) { $('ent-err').textContent = err.message; pin = ''; setTimeout(pintaEntrada, 250); }
  finally { ocupado = false; carregando(false); }
}

// ---------- primeiro acesso ----------
function abrirPrimeiro() {
  $('pr-re').textContent = 'RE ' + re; $('pr-nome').textContent = primeiro.nome + '?';
  $('pr-funcao').textContent = primeiro.funcao || ''; tela('s-primeiro');
}
$('nao-sou').onclick = () => { primeiro = null; limparEntrada(); tela('s-inicio'); $('ent-err').textContent = 'Confira o RE. Se estiver certo, procure a líder de frota.'; };
$('sou-eu').onclick = () => { pinNovo = ''; pinConf = ''; passo = 1; pintaCriar(); $('cr-err').textContent = ''; tela('s-criar'); };
$('cr-voltar').onclick = () => { if (passo === 2) { passo = 1; pinNovo = ''; pinConf = ''; pintaCriar(); } else abrirPrimeiro(); };
montaPad($('pad-cr'), null, teclaCriar);
function pintaCriar() {
  $('cr-passo').textContent = passo === 1 ? 'Passo 1 de 2: escolha 4 números' : 'Passo 2 de 2: digite de novo para confirmar';
  pintaDots('cr-dots', (passo === 1 ? pinNovo : pinConf).length);
}
async function teclaCriar(k) {
  if (ocupado) return;
  $('cr-err').textContent = '';
  if (passo === 1) {
    if (k === '⌫') pinNovo = pinNovo.slice(0, -1); else if (pinNovo.length < 4) pinNovo += k;
    pintaCriar();
    if (pinNovo.length === 4) { if (fraco(pinNovo)) { $('cr-err').textContent = 'Esse PIN é fácil de adivinhar. Escolha outro.'; pinNovo = ''; setTimeout(pintaCriar, 250); return; } passo = 2; setTimeout(pintaCriar, 200); }
    return;
  }
  if (k === '⌫') pinConf = pinConf.slice(0, -1); else if (pinConf.length < 4) pinConf += k;
  pintaCriar(); if (pinConf.length < 4) return;
  if (pinConf !== pinNovo) { $('cr-err').textContent = 'Os dois PINs ficaram diferentes. Comece de novo.'; passo = 1; pinNovo = ''; pinConf = ''; setTimeout(pintaCriar, 250); return; }
  ocupado = true; carregando(true, 'Salvando seu PIN…');
  try { const r = await rpc('campo_criar_pin', { p_re: re, p_pin: pinNovo }); pinNovo = pinConf = ''; await dentro(r); }
  catch (err) { $('cr-err').textContent = err.message; passo = 1; pinNovo = ''; pinConf = ''; pintaCriar(); }
  finally { ocupado = false; carregando(false); }
}
// mesma regra do banco (o banco confere de novo)
function fraco(p) { return /^(.)\1{3}$/.test(p) || '01234567890'.includes(p) || '09876543210'.includes(p) || ['1212','2121','1122','2580','0852','1010','6969','1313','2020','2323'].includes(p); }

// ---------- menu por papel ----------
const MODS = ['abastecimento', 'oleo', 'checklist', 'autorizacoes', 'portaria', 'bloqueados'];
function qtdAcessos() { return MODS.filter(m => eu[m]).length; }
async function dentro(r) {
  const reDigitado = re;
  token = r.token; eu = r; eu.re = /^\d{1,2}$/.test(reDigitado) ? reDigitado.padStart(3, '0') : reDigitado; re = ''; pin = ''; fase = 're'; pintaEntrada();
  await abrirMenu(true);
}
async function atualizaEu() { Object.assign(eu, await rpc('campo_menu', { p_token: token })); }
async function abrirMenu(direto) {
  if (!direto) { try { await atualizaEu(); } catch (e) { return sairUsuario(); } }
  if (direto && qtdAcessos() === 1) return abrirModulo(MODS.find(m => eu[m]));
  $('m-av').textContent = ini(eu.nome); $('m-ola').textContent = 'Olá, ' + curto(eu.nome).split(' ')[0];
  $('m-funcao').textContent = papeisTxt();
  $('m-ab').hidden = !eu.abastecimento; $('m-ol').hidden = !eu.oleo;
  $('m-ck').hidden = !eu.checklist; $('m-aut').hidden = !eu.autorizacoes; $('m-port').hidden = !eu.portaria; $('m-blq').hidden = !eu.bloqueados;
  const etq = (id, n, t) => { $(id).textContent = n ? t : ''; $(id).hidden = !n; };
  etq('m-ck-etq', eu.em_uso, eu.em_uso === 1 ? '1 veículo com você' : eu.em_uso + ' veículos com você');
  etq('m-aut-etq', eu.aut_qtd, eu.aut_qtd === 1 ? '1 aguardando você' : eu.aut_qtd + ' aguardando você');
  etq('m-port-etq', eu.port_qtd, eu.port_qtd === 1 ? '1 para conferir' : eu.port_qtd + ' para conferir');
  etq('m-blq-etq', eu.blq_qtd, eu.blq_qtd === 1 ? '1 bloqueado' : eu.blq_qtd + ' bloqueados');
  $('m-ol-etq').textContent = !eu.oleo_qtd ? '' : eu.mecanico ? `${eu.oleo_qtd} ${eu.oleo_qtd === 1 ? 'veículo aprovado' : 'veículos aprovados'}` : `${eu.oleo_qtd === 1 ? '1 veículo autorizado' : eu.oleo_qtd + ' veículos autorizados'} para você`;
  $('m-ol-etq').hidden = !eu.oleo_qtd;
  $('m-vazio').hidden = qtdAcessos() > 0; $('m-mods').hidden = qtdAcessos() === 0;
  tela('s-menu');
}
function papeisTxt() {
  const p = [];
  if (eu.abastecimento) p.push('Porteiro');
  if (eu.mecanico) p.push('Mecânico');
  if (!p.length) p.push(eu.funcao || 'Motorista');
  return 'RE ' + (eu.re || '') + ' · ' + p.join(' e ');
}
$('m-mods').addEventListener('click', e => { const b = e.target.closest('.mod'); if (b) abrirModulo(b.dataset.mod); });
$('m-sair').onclick = sairUsuario;
async function abrirModulo(m) {
  modulo = m; carregando(true, 'Abrindo…');
  const CKM = { checklist: 'home', autorizacoes: 'aut', portaria: 'port', bloqueados: 'blq' };
  if (CKM[m]) { carregando(false); return CK.abrir(CKM[m]); }
  try { if (m === 'abastecimento') { await carregarAbastecimento(); abrirFormAb(); } else await abrirListaOleo(); }
  catch (err) { await sairUsuario(); $('ent-err').textContent = err.message; }
  finally { carregando(false); }
}
// volta ao menu, ou sai se a pessoa só tem uma opção
function voltarMenu() { if (qtdAcessos() > 1) abrirMenu(false); else sairUsuario(); }

// ---------- saída automática ----------
async function sairUsuario() {
  clearInterval(tSaida); clearTimeout(tInativo);
  if (typeof CK !== 'undefined' && eu) CK.guardar('saiu');
  if (token) { const t = token; token = null; try { await rpc('campo_sair', { p_token: t }); } catch (_) {} }
  eu = null; dadosAb = null; dadosOl = null; primeiro = null; limparEntrada();
  tela('s-inicio');
}
function inativo() { clearTimeout(tInativo); if (token) tInativo = setTimeout(sairUsuario, typeof CK !== 'undefined' && CK.ativo() ? SAIDA_INATIVO_CK : SAIDA_INATIVO); }
document.addEventListener('pointerdown', inativo); document.addEventListener('input', inativo);
function contagem() {
  clearInterval(tSaida); let s = SAIDA_APOS_REGISTRO;
  const f = () => { $('saida').textContent = `Saindo automaticamente em ${s} s para o próximo`; if (s-- <= 0) sairUsuario(); };
  f(); tSaida = setInterval(f, 1000);
}
['sair', 'sair2', 'sair-oleo'].forEach(id => $(id).onclick = sairUsuario);
$('oleo-menu').onclick = voltarMenu;
$('o-voltar').onclick = () => { if (dadosOl && dadosOl.pedidos.length > 1) abrirListaOleo(); else voltarMenu(); };
$('novo').onclick = async () => {
  try {
    await atualizaEu();
    const CKM = { checklist: 'home', autorizacoes: 'aut', portaria: 'port', bloqueados: 'blq' };
    if (CKM[modulo] && eu[modulo]) return CK.abrir(CKM[modulo]);
    if (modulo === 'abastecimento' && eu.abastecimento) { await carregarAbastecimento(); abrirFormAb(); }
    else if (modulo === 'oleo' && eu.oleo) await abrirListaOleo();
    else await abrirMenu(false);
  } catch (e) { sairUsuario(); }
};

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
  $('who').textContent = curto(eu.nome) + ' · Portaria';
  $('form').reset(); fotos = {}; ['painel', 'placa', 'bomba'].forEach(pintaFoto);
  $('ultimo').textContent = ''; $('alerta').hidden = true; pendente = false;
  $('f-placa').innerHTML = '<option value="">Escolha o veículo</option>' + dadosAb.veiculos.map(v => `<option value="${esc(v.placa)}">${esc(v.placa)} · ${esc(v.tipo || '')}</option>`).join('');
  $('f-mot').innerHTML = '<option value="">Escolha o motorista</option>' + dadosAb.motoristas.map(m => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join('');
  $('agora').textContent = 'Data e hora: ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + ' (automático)';
  $('sair').textContent = qtdAcessos() > 1 ? 'Menu' : 'Sair';
  $('sair').onclick = qtdAcessos() > 1 ? () => abrirMenu(false) : sairUsuario;
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
  const ps = dadosOl.pedidos;
  // quem não é mecânico e tem um só veículo autorizado vai direto para o formulário
  if (!eu.mecanico && ps.length === 1) { pedidoSel = ps[0]; return abrirFormOleo(); }
  $('who-oleo').textContent = curto(eu.nome) + ' · ' + (eu.mecanico ? 'Mecânico' : (eu.funcao || 'Motorista'));
  $('oleo-dica').textContent = eu.mecanico ? 'Veículos aprovados para troca. Toque no veículo para registrar.' : 'Veículos autorizados para você hoje. Toque no veículo para registrar.';
  $('lista-apr').innerHTML = ps.length ? ps.map(x => `<button type="button" class="aprov" data-id="${x.id}"><span><b>${esc(x.placa)}</b><small>${esc(x.modelo || '')} · ${esc(x.categoria)}</small></span><span class="pill info">${x.autorizado ? 'Autorizado' : 'Aprovado'}</span><small class="aprov-d">Aprovado em ${dataBr(x.aprovado_em)}${x.km_atual ? ` · km atual ${fmt(x.km_atual)}` : ''}</small></button>`).join('')
    : `<div class="vazio"><b>${eu.mecanico ? 'Nenhum veículo aprovado agora' : 'Nenhum veículo autorizado para você agora'}</b><span>${eu.mecanico ? 'Quando o Carlos aprovar uma troca, o veículo aparece aqui.' : 'Peça para a Fernanda autorizar a troca no painel.'}</span></div>`;
  $('sair-oleo').textContent = qtdAcessos() > 1 ? 'Menu' : 'Sair';
  $('sair-oleo').onclick = qtdAcessos() > 1 ? () => abrirMenu(false) : sairUsuario;
  tela('s-oleo');
}
$('lista-apr').addEventListener('click', e => { const b = e.target.closest('.aprov'); if (!b) return; pedidoSel = dadosOl.pedidos.find(x => x.id === +b.dataset.id); abrirFormOleo(); });
function opcoes(lista, vazio) { return `<option value="">${vazio}</option>` + lista.map(x => `<option>${esc(x)}</option>`).join(''); }
function abrirFormOleo() {
  const x = pedidoSel;
  $('o-form').reset(); fotos = {}; ['o-placa', 'o-adesivo'].forEach(pintaFoto); $('o-alerta').hidden = true;
  $('o-estab').innerHTML = opcoes(dadosOl.estabelecimentos, 'Escolha o local');
  $('o-oleo').innerHTML = opcoes(dadosOl.oleos, 'Escolha o óleo');
  $('who-oleo2').textContent = curto(eu.nome) + ' · ' + (eu.mecanico ? 'Mecânico' : (eu.funcao || 'Motorista'));
  $('o-veic').innerHTML = `<b>${esc(x.placa)}</b> · ${esc(x.modelo || '')}<br><small>Última troca: ${x.ultima_data ? dataBr(x.ultima_data) : '—'}${x.ultimo_km ? ` com ${fmt(x.ultimo_km)} km` : ''}${x.ultimo_km_proxima ? ` · próxima prevista ${fmt(x.ultimo_km_proxima)} km` : ''}</small>`;
  $('o-kmhint').innerHTML = x.km_atual ? `Último km conhecido: <b class="num">${fmt(x.km_atual)}</b>` : '';
  $('o-agora').textContent = 'Data e hora: ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + ' (automático)';
  tela('s-oleo-form');
}
function avisoO(h) { $('o-alerta').innerHTML = h; $('o-alerta').hidden = false; $('o-alerta').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
$('o-form').addEventListener('submit', async e => {
  e.preventDefault(); if (salvando) return;
  const x = pedidoSel, estab = $('o-estab').value, oleo = $('o-oleo').value;
  const km = parseInt($('o-km').value.replace(/\D/g, ''), 10), req = $('o-req').value.trim();
  const kmp = parseInt($('o-kmp').value.replace(/\D/g, ''), 10);
  const fo = document.querySelector('input[name="o-fo"]:checked'), fc = document.querySelector('input[name="o-fc"]:checked');
  if (!estab || !oleo) return avisoO('<strong>Falta informação.</strong> Escolha o local e o óleo usado.');
  if (!(km > 0)) return avisoO('<strong>Km inválido.</strong> Digite o km do painel no momento da troca.');
  if (x.ultimo_km && km < x.ultimo_km) return avisoO(`<strong>Km menor que o da última troca</strong> (${fmt(x.ultimo_km)} km). Confira o número.`);
  if (!(kmp > km)) return avisoO('<strong>Km da próxima troca inválido.</strong> Digite o km da próxima troca que está escrito no adesivo. Ele precisa ser maior que o km do painel.');
  if (!fo || !fc) return avisoO('<strong>Falta informação.</strong> Marque se trocou o filtro de óleo e o de combustível.');
  const falta = ['o-placa', 'o-adesivo'].filter(k => !fotos[k]);
  if (falta.length) { falta.forEach(k => document.querySelector(`.foto[data-f="${k}"]`).classList.add('falta')); return avisoO(`<strong>Faltam fotos:</strong> ${falta.map(k => NF[k]).join(', ')}. As 2 fotos são obrigatórias.`); }
  salvando = true; carregando(true, 'Enviando fotos…');
  try {
    const caminhos = await enviarFotos(['o-placa', 'o-adesivo']);
    carregando(true, 'Registrando…');
    const r = await rpc('campo_trocar', { p_token: token, p_pedido: x.id, p_estab: estab, p_oleo: oleo, p_km: km, p_km_proxima: kmp, p_requisicao: req,
      p_filtro_oleo: fo.value === 's', p_filtro_comb: fc.value === 's', p_fotos: caminhos });
    $('recibo').innerHTML = `<div><span>Veículo</span><b>${esc(x.placa)}</b></div><div><span>Feito por</span><b>${esc(curto(eu.nome))}</b></div><div><span>Local</span><b>${esc(estab)}</b></div><div><span>Óleo</span><b>${esc(oleo)}</b></div><div><span>Km</span><b class="num">${fmt(km)}</b></div><div><span>Próxima troca</span><b class="num">${fmt(r.proxima_km)} km</b></div>`;
    $('novo').hidden = !eu.mecanico && qtdAcessos() < 2;
    tela('s-done'); contagem();
  } catch (err) { avisoO('<strong>Não foi registrado.</strong> ' + esc(err.message)); }
  finally { salvando = false; carregando(false); }
});

// mantém a tela acesa na portaria, quando o aparelho permitir
async function telaAcesa() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (_) {} }
document.addEventListener('visibilitychange', telaAcesa); telaAcesa();

iniciarTema();
if (!configurado) tela('s-config'); else { limparEntrada(); tela('s-inicio'); }
