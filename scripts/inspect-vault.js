#!/usr/bin/env node
/**
 * scripts/inspect-vault.js
 * Utilidad CLI para inspeccionar y buscar en la bóveda de stickers.
 *
 * Uso:
 *   node scripts/inspect-vault.js               # Lista general de stickers
 *   node scripts/inspect-vault.js --search "..." # Búsqueda FTS5
 *   node scripts/inspect-vault.js --open         # Abre la carpeta en Finder
 *   node scripts/inspect-vault.js --detail <id>  # Muestra metadatos completos de un sticker
 */

const { execSync } = require('child_process');
const path = require('path');
const vault = require('../modules/stickers/sticker-vault');

const args = process.argv.slice(2);

if (args.includes('--open')) {
  const dir = args.includes('vault')
    ? path.join(__dirname, '..', 'store', 'stickers', 'vault')
    : path.join(__dirname, '..', 'store', 'stickers', 'preview');
  execSync(`open "${dir}"`);
  console.log(`📁 Carpeta abierta en Finder con nombres amigables: ${dir}`);
  process.exit(0);
}

const db = vault.getDb();
const total = db.prepare('SELECT COUNT(*) as c FROM stickers').get().c;

console.log('='.repeat(70));
console.log(`🏷️  BÓVEDA DE STICKERS DE WHATSAPP (${total} stickers registrados)`);
console.log('='.repeat(70));

const searchIdx = args.indexOf('--search');
if (searchIdx !== -1 && args[searchIdx + 1]) {
  const query = args[searchIdx + 1];
  console.log(`\n🔍 Búsqueda FTS5 para: "${query}"\n`);
  const results = vault.searchStickers(query, { limit: 10 });
  if (results.length === 0) {
    console.log('   (No se encontraron coincidencias)');
  } else {
    results.forEach((s, idx) => {
      console.log(`[${idx + 1}] ${s.meme_name || 'Sin nombre'}`);
      console.log(`    Emoción: ${s.emotion} | Intención: ${s.intent}`);
      console.log(`    Tags:    ${s.tags || 'n/a'}`);
      console.log(`    Archivo: ${path.basename(s.file_path)}`);
      console.log(`    ID:      ${s.id}`);
      console.log('-'.repeat(50));
    });
  }
  process.exit(0);
}

const detailIdx = args.indexOf('--detail');
if (detailIdx !== -1 && args[detailIdx + 1]) {
  const idPrefix = args[detailIdx + 1];
  const item = db.prepare('SELECT * FROM stickers WHERE id LIKE ? OR meme_name LIKE ?').get(`${idPrefix}%`, `%${idPrefix}%`);
  if (!item) {
    console.log(`❌ No se encontró sticker con id/nombre que coincida con "${idPrefix}".`);
  } else {
    console.log('\n📄 DETALLE DEL STICKER:');
    console.log(`  ID:                 ${item.id}`);
    console.log(`  Nombre / Meme:      ${item.meme_name}`);
    console.log(`  Emoción:            ${item.emotion}`);
    console.log(`  Intención:          ${item.intent}`);
    console.log(`  Descripción visual: ${item.visual_description}`);
    console.log(`  Texto OCR:          ${item.ocr_text || '(sin texto)'}`);
    console.log(`  Tags:               ${item.tags}`);
    console.log(`  Emojis:             ${item.emojis}`);
    console.log(`  Contextos sugeridos:${item.suggested_contexts}`);
    console.log(`  Uso en chat:        ${item.use_count} veces`);
    console.log(`  Ruta física:        ${item.file_path}`);
  }
  process.exit(0);
}

// Lista general resumida
const rows = db.prepare(`
  SELECT id, meme_name, emotion, intent, tags, file_path, use_count 
  FROM stickers 
  ORDER BY created_at DESC 
  LIMIT 25
`).all();

console.log('\nÚltimos stickers en la bóveda:\n');
rows.forEach((s, idx) => {
  const shortId = s.id.substring(0, 10);
  const name = (s.meme_name || 'Sin nombre').padEnd(30).substring(0, 30);
  const emotion = (s.emotion || 'n/a').padEnd(25).substring(0, 25);
  console.log(`#${String(idx + 1).padStart(2, ' ')} | ${name} | ${emotion} | [id: ${shortId}...]`);
});

console.log('\n' + '='.repeat(70));
console.log('💡 Atajos útiles:');
console.log('  • Buscar:              node scripts/inspect-vault.js --search "fiesta"');
console.log('  • Ver detalle de uno:  node scripts/inspect-vault.js --detail <id_o_nombre>');
console.log('  • Abrir en Finder:     node scripts/inspect-vault.js --open');
console.log('  • SQLite directo:      sqlite3 store/sticker-vault.db "SELECT meme_name, emotion FROM stickers"');
console.log('='.repeat(70));
