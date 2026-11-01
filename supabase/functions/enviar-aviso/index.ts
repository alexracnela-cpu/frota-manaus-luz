// @ts-nocheck
// FLEET · Edge Function "enviar-aviso"
// Envia as notificações do celular (Web Push). É chamada pelo banco a cada aviso novo.
// Não precisa de chave nem configuração: usa as variáveis que o Supabase já coloca em toda função.
// Cole este arquivo inteiro no editor da função e clique em Deploy.

// Web Push (RFC 8291 aes128gcm + VAPID RFC 8292) só com WebCrypto — funciona igual no Deno e no Node
const te = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const deB64u = (s: string) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const junta = (...a: Uint8Array[]) => { const n = a.reduce((t, x) => t + x.length, 0), o = new Uint8Array(n); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bits: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bits));
}

async function gerarChavesVapid() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publica = b64u(await crypto.subtle.exportKey('raw', k.publicKey));
  const privada = await crypto.subtle.exportKey('jwk', k.privateKey);
  return { publica, privada };
}

async function cifrar(texto: string, p256dh: string, auth: string) {
  const uaPub = deB64u(p256dh), segredo = deB64u(auth);
  const efem = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', efem.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const comum = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, efem.privateKey, 256));
  const ikm = await hkdf(segredo, comum, junta(te.encode('WebPush: info\0'), uaPub, asPub), 256);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, te.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hkdf(sal, ikm, te.encode('Content-Encoding: nonce\0'), 96);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifra = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, junta(te.encode(texto), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);   // 4096
  return junta(sal, rs, new Uint8Array([asPub.length]), asPub, cifra);
}

async function jwtVapid(endpoint: string, privadaJwk: JsonWebKey, sujeito: string) {
  const aud = new URL(endpoint).origin;
  const cab = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corpo = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujeito })));
  const k = await crypto.subtle.importKey('jwk', privadaJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const ass = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, te.encode(cab + '.' + corpo));
  return cab + '.' + corpo + '.' + b64u(ass);
}

// envia um aviso; devolve o status HTTP do serviço de push (201 = ok; 404/410 = inscrição vencida)
async function enviar(destino: any, aviso: unknown, vapid: any) {
  const corpo = await cifrar(JSON.stringify(aviso), destino.p256dh, destino.auth);
  const jwt = await jwtVapid(destino.endpoint, vapid.privada, vapid.sujeito);
  const r = await fetch(destino.endpoint, {
    method: 'POST',
    headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high',
      Authorization: `vapid t=${jwt}, k=${vapid.publica}` },
    body: corpo,
  });
  return { status: r.status, texto: r.ok ? '' : (await r.text()).slice(0, 200) };
}

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_CHAVE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function rpc(nome: string, args: Record<string, unknown>) {
  const h: Record<string, string> = { 'Content-Type': 'application/json', apikey: SB_CHAVE };
  if (SB_CHAVE.split('.').length === 3) h.Authorization = 'Bearer ' + SB_CHAVE;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${nome}`, { method: 'POST', headers: h, body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${nome}: ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

const resposta = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  try {
    const pedido = await req.json().catch(() => ({}));
    let cfg = await rpc('push_servidor_config', {});

    // primeira vez: cria as chaves VAPID e guarda no banco
    if (!cfg.vapid_publica) {
      const k = await gerarChavesVapid();
      await rpc('push_servidor_salvar_chaves', { p_publica: k.publica, p_privada: k.privada });
      cfg = await rpc('push_servidor_config', {});
    }
    if (pedido.setup) return resposta({ ok: true, publica: cfg.vapid_publica });
    if (!pedido.id) return resposta({ ok: false, erro: 'sem id' }, 400);

    // pega o aviso (só uma vez) e os celulares que devem receber
    const lote = await rpc('push_servidor_pegar', { p_id: pedido.id });
    if (!lote || !lote.destinos?.length) return resposta({ ok: true, enviados: 0 });
    const vapid = { publica: cfg.vapid_publica, privada: cfg.vapid_privada, sujeito: cfg.sujeito };

    let ok = 0; const remover: number[] = []; const erros: string[] = [];
    await Promise.all(lote.destinos.map(async (d: any) => {
      try {
        const r = await enviar(d, lote.aviso, vapid);
        if (r.status >= 200 && r.status < 300) ok++;
        else if (r.status === 404 || r.status === 410) remover.push(d.id);
        else erros.push(`${r.status} ${r.texto}`);
      } catch (e) { erros.push(String(e)); }
    }));
    await rpc('push_servidor_resultado', { p_id: pedido.id, p_ok: ok, p_remover: remover, p_erro: erros.join(' | ') || null });
    return resposta({ ok: true, enviados: ok, removidos: remover.length, erros });
  } catch (e) {
    console.error(e);
    return resposta({ ok: false, erro: String(e) }, 500);
  }
});
