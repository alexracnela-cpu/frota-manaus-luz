// Funções usadas pelo app do celular e pelo painel
(function(){
  const C = window.FROTA_CONFIG || {};
  window.configurado = !!(C.SUPABASE_URL && !C.SUPABASE_URL.startsWith('COLE') && C.SUPABASE_CHAVE && !C.SUPABASE_CHAVE.startsWith('COLE'));
  window.sb = window.configurado ? supabase.createClient(C.SUPABASE_URL, C.SUPABASE_CHAVE) : null;
})();

const $ = id => document.getElementById(id);
const fmt = (n, d = 0) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const real = n => n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fdt = t => { t = new Date(t); const o = { day: '2-digit', month: '2-digit' }; if (t.getFullYear() !== new Date().getFullYear()) o.year = '2-digit'; return t.toLocaleDateString('pt-BR', o) + ' ' + t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
const dataBr = t => new Date(t).toLocaleDateString('pt-BR');
// primeiro e último nome; Neto, Júnior, Filho e Sobrinho não contam como sobrenome
const curto = n => { if (!n) return '—'; const a = n.trim().split(/\s+/).map(w => w[0] + w.slice(1).toLowerCase()); let u = a.length - 1; if (u > 1 && /^(neto|junior|júnior|jr|filho|sobrinho)$/i.test(a[u])) u--; return u > 0 ? a[0] + ' ' + a[u] : a[0]; };
const ini = n => { const a = (n || '?').trim().split(/\s+/); return (a[0][0] + (a.length > 1 ? a[a.length - 1][0] : '')).toUpperCase(); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// mensagem de erro amigável a partir de um erro do Supabase
function msgErro(e) {
  if (!e) return 'Algo deu errado. Tente de novo.';
  const m = e.message || String(e);
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem internet no momento. Confira a conexão e tente de novo.';
  if (/JWT|session/i.test(m) && !/Sessão/.test(m)) return 'Sua sessão expirou. Entre de novo.';
  if (/Could not find the function|schema cache/i.test(m)) return 'O banco ainda não foi atualizado para esta função. Rode o último arquivo .sql no Supabase.';
  return m;
}

// chama uma função do banco; devolve os dados ou lança erro com mensagem amigável
async function rpc(nome, args) {
  const { data, error } = await sb.rpc(nome, args || {});
  if (error) throw new Error(msgErro(error));
  if (data && data.erro) throw new Error(data.erro);
  return data;
}

// reduz a foto para no máximo 1280 px e JPEG ~150 KB
function reduzir(file) {
  return new Promise((ok, err) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const m = 1280, k = Math.min(1, m / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob(b => b ? ok(b) : err(new Error('Não consegui abrir a foto.')), 'image/jpeg', 0.72);
    };
    img.onerror = () => err(new Error('Não consegui abrir a foto.'));
    img.src = u;
  });
}

// envia uma foto para fotos/campo/AAAA-MM/<id>.jpg e devolve o caminho
async function enviarFoto(blob, rotulo) {
  const d = new Date(), id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const caminho = `campo/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}/${id}-${rotulo}.jpg`;
  const { error } = await sb.storage.from('fotos').upload(caminho, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('Não consegui enviar a foto (' + rotulo + '). ' + msgErro(error));
  return caminho;
}

// botão de modo claro/escuro (elemento com id="tema")
function iniciarTema() {
  const raiz = document.documentElement, b = $('tema'); if (!b) return;
  const escuro = () => { const t = raiz.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  const pinta = () => { b.innerHTML = escuro()
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>Modo claro'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>Modo escuro'; };
  try { const t = localStorage.getItem('tema'); if (t) raiz.dataset.theme = t; } catch (_) {}
  b.onclick = () => { const n = escuro() ? 'light' : 'dark'; raiz.dataset.theme = n; try { localStorage.setItem('tema', n); } catch (_) {} pinta(); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', pinta); pinta();
}

const ICONE_BOMBA = '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M6 8h6"/><path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"/></svg>';
const ICONE_GOTA = '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c3 4 6 7.2 6 10.5A6 6 0 0 1 6 13.5C6 10.2 9 7 12 3z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/></svg>';
const ICONE_VOLTAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
