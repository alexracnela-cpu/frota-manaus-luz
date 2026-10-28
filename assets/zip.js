// Gera um arquivo .zip simples (sem compressão — fotos JPEG já são comprimidas).
// criarZip([{ nome: 'pasta/foto.jpg', dados: Uint8Array, data: Date }]) -> Blob
(function () {
  const TAB = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TAB[n] = c >>> 0; }
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = TAB[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function dosHora(d) { return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF; }
  function dosData(d) { return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF; }
  window.criarZip = function (arquivos) {
    const enc = new TextEncoder(), partes = [], central = []; let pos = 0;
    for (const a of arquivos) {
      const nome = enc.encode(a.nome), dados = a.dados, crc = crc32(dados), d = a.data || new Date();
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosHora(d), true); h.setUint16(12, dosData(d), true); h.setUint32(14, crc, true);
      h.setUint32(18, dados.length, true); h.setUint32(22, dados.length, true); h.setUint16(26, nome.length, true); h.setUint16(28, 0, true);
      partes.push(h.buffer, nome, dados);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosHora(d), true); c.setUint16(14, dosData(d), true); c.setUint32(16, crc, true);
      c.setUint32(20, dados.length, true); c.setUint32(24, dados.length, true); c.setUint16(28, nome.length, true);
      c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, pos, true);
      central.push(c.buffer, nome);
      pos += 30 + nome.length + dados.length;
    }
    const tamCentral = central.reduce((s, x) => s + (x.byteLength || x.length), 0);
    const f = new DataView(new ArrayBuffer(22));
    f.setUint32(0, 0x06054b50, true); f.setUint16(8, arquivos.length, true); f.setUint16(10, arquivos.length, true);
    f.setUint32(12, tamCentral, true); f.setUint32(16, pos, true);
    return new Blob([...partes, ...central, f.buffer], { type: 'application/zip' });
  };
})();
