/**
 * scripts/harvest-mac-stickers.js
 * Extrae e indexa los stickers existentes en WhatsApp Desktop en macOS
 * y los incorpora al StickerVault local (store/sticker-vault.db).
 *
 * Ejecución: node scripts/harvest-mac-stickers.js
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const stickerVault = require('../modules/stickers/sticker-vault.js');
const stickerVision = require('../modules/stickers/sticker-vision.js');

const MAC_CONTAINER_DIR = '/Users/angelzaragoza/Library/Group Containers/group.net.whatsapp.WhatsApp.shared';
const MAC_STICKER_DB = path.join(MAC_CONTAINER_DIR, 'Sticker.sqlite');
const MAC_STICKER_MEDIA_DIR = path.join(MAC_CONTAINER_DIR, 'stickers');
const VAULT_DIR = path.join(__dirname, '..', 'store', 'stickers', 'vault');
const UPLOADS_DIR = path.join(__dirname, '..', 'store', 'uploads', 'stickers');

function computeFileSha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function mapPackToCategory(packName, emojis) {
  const p = (packName || '').toLowerCase();
  if (p.includes('cuppy')) return { emotion: 'ternura y juego cotidiano', intent: 'bromear, convivir' };
  if (p.includes('introvert')) return { emotion: 'introversión y timidez cómica', intent: 'retirarse, descansar, pena' };
  if (p.includes('party')) return { emotion: 'celebración y fiesta', intent: 'festejar, invitar' };
  if (p.includes('dance')) return { emotion: 'ritmo y alegría', intent: 'festejar, animar' };
  if (p.includes('taste') || p.includes('food')) return { emotion: 'antojo y hambre', intent: 'comer, antojar' };
  if (p.includes('xoxo')) return { emotion: 'cariño y afecto', intent: 'agradecer con cariño, afecto' };
  if (p.includes('match') || p.includes('game')) return { emotion: 'competitividad y victoria', intent: 'festejar gol o victoria' };
  if (p.includes('spring')) return { emotion: 'frescura y calma', intent: 'saludar, buen día' };
  if (p.includes('astro')) return { emotion: 'vibra cósmica / destino', intent: 'reaccionar con sorpresa o misticismo' };

  if (emojis) {
    if (emojis.includes('😂') || emojis.includes('😆')) return { emotion: 'risa y gracia', intent: 'reírse de una broma' };
    if (emojis.includes('🤔') || emojis.includes('❓')) return { emotion: 'duda e intriga', intent: 'cuestionar, dudar' };
    if (emojis.includes('😎') || emojis.includes('🔥')) return { emotion: 'confianza y orgullo', intent: 'celebrar un logro' };
    if (emojis.includes('😭') || emojis.includes('😢')) return { emotion: 'tristeza dramática o desahogo', intent: 'quejarse con humor' };
    if (emojis.includes('❤️') || emojis.includes('🥰')) return { emotion: 'afecto y amor', intent: 'demostrar cariño' };
  }
  return { emotion: 'humor y reacción', intent: 'acompañar la conversación' };
}

async function harvest() {
  console.log('========================================================================');
  console.log('📦 Semillero de Stickers: Extracción de WhatsApp Desktop en macOS');
  console.log('========================================================================\n');

  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }

  let totalHarvested = 0;
  let totalUploaded = 0;

  // 1. Ingestar stickers del catálogo nativo de WhatsApp Desktop
  if (fs.existsSync(MAC_STICKER_DB)) {
    console.log(`📡 Leyendo base nativa de WhatsApp: ${MAC_STICKER_DB}`);
    try {
      const db = new DatabaseSync(MAC_STICKER_DB, { readOnly: true });
      const query = `
        SELECT 
          s.Z_PK as id,
          s.ZACCESSIBILITYTEXT as alt_text,
          s.ZEMOJIS as emojis,
          s.ZMIMETYPE as mimetype,
          s.ZRELATIVEIMAGEPATH as rel_path,
          p.ZNAME as pack_name,
          p.ZPACKDESCRIPTION as pack_desc
        FROM ZWACDSTICKER s
        LEFT JOIN ZWACDABSTRACTSTICKERPACK p ON s.ZSTICKERPACK = p.Z_PK
      `;
      const rows = db.prepare(query).all();
      console.log(`🔍 Stickers registrados en base de datos macOS: ${rows.length}`);

      for (const row of rows) {
        if (!row.rel_path) continue;
        const packNameLower = (row.pack_name || '').toLowerCase();
        if (packNameLower.includes('cuppy')) continue; // Ignorar Cuppy por petición del usuario

        const sourcePath = path.join(MAC_STICKER_MEDIA_DIR, row.rel_path);
        if (!fs.existsSync(sourcePath)) continue;

        const hash = computeFileSha256(sourcePath);
        const vaultDestPath = path.join(VAULT_DIR, `${hash}.webp`);

        if (!fs.existsSync(vaultDestPath)) {
          fs.copyFileSync(sourcePath, vaultDestPath);
        }

        const ocrText = stickerVision.runLocalOcr(vaultDestPath);
        const cat = mapPackToCategory(row.pack_name, row.emojis);

        const packClean = (row.pack_name || 'WhatsApp').trim();
        const memeName = `${packClean} ${row.emojis || ''}`.trim();
        const visualDesc = row.alt_text || `Sticker de ${packClean}${row.emojis ? ` con emojis ${row.emojis}` : ''}`;

        const tags = [
          packClean.toLowerCase(),
          ...(row.emojis ? row.emojis.split(/\s+/) : []),
          'whatsapp',
          'mac_vault'
        ].filter(Boolean);

        const profile = {
          id: hash,
          file_path: vaultDestPath,
          source: 'local_whatsapp_mac',
          sender_jid: '',
          pack_name: packClean,
          meme_name: memeName,
          visual_description: visualDesc,
          emotion: cat.emotion,
          intent: cat.intent,
          ocr_text: ocrText,
          tags: tags,
          emojis: row.emojis || '',
          suggested_contexts: `Uso afín a ${packClean}: ${row.pack_desc || cat.intent}`
        };

        stickerVault.saveSticker(profile);
        totalHarvested++;
      }
      console.log(`✅ ${totalHarvested} stickers de WhatsApp Desktop ingestados exitosamente.`);
    } catch (err) {
      console.error('Error leyendo Sticker.sqlite:', err.message);
    }
  } else {
    console.warn('⚠️ No se encontró Sticker.sqlite en la ruta de WhatsApp Desktop.');
  }

  // 2. Ingestar stickers locales personalizados de Antigravity (store/uploads/stickers)
  if (fs.existsSync(UPLOADS_DIR)) {
    console.log(`\n🎨 Ingestando stickers personalizados de: ${UPLOADS_DIR}`);
    const customFiles = fs.readdirSync(UPLOADS_DIR).filter(f => f.endsWith('.webp'));

    for (const f of customFiles) {
      const srcPath = path.join(UPLOADS_DIR, f);
      const hash = computeFileSha256(srcPath);
      const vaultDestPath = path.join(VAULT_DIR, `${hash}.webp`);

      if (!fs.existsSync(vaultDestPath)) {
        fs.copyFileSync(srcPath, vaultDestPath);
      }

      const ocrText = stickerVision.runLocalOcr(vaultDestPath);
      let memeName = 'Antigravity Dev Sticker';
      let emotion = 'humor dev y complicidad';
      let intent = 'rematar plática con onda dev';
      let emojis = ':3';

      if (f.includes('chapa')) {
        memeName = 'Meneando la chapa';
        emotion = 'buena onda, ritmo y cotorreo';
        intent = 'festejar o ponerle ritmo al chat';
      } else if (f.includes('exito')) {
        memeName = 'Sin miedo al éxito / Jale en producción';
        emotion = 'audacia y optimismo dev';
        intent = 'celebrar deploy o trabajo entregado';
      } else if (f.includes('saludo')) {
        memeName = 'Saludo Antigravity';
        emotion = 'saludo cordial y relajado';
        intent = 'decir hola o iniciar plática';
      }

      const profile = {
        id: hash,
        file_path: vaultDestPath,
        source: 'custom_antigravity',
        sender_jid: '',
        pack_name: 'Antigravity Dev',
        meme_name: memeName,
        visual_description: `Sticker con diseño oficial dev de Antigravity: "${memeName}"`,
        emotion,
        intent,
        ocr_text: ocrText,
        tags: ['antigravity', 'dev', 'bot', 'humor', f.replace('.webp', '')],
        emojis,
        suggested_contexts: 'Bromas de programación, logros y pláticas entre devs'
      };

      stickerVault.saveSticker(profile);
      totalUploaded++;
    }
    console.log(`✅ ${totalUploaded} stickers personalizados ingestados.`);
  }

  console.log(`\n🎉 Total de stickers disponibles en StickerVault: ${stickerVault.count()}`);
}

harvest().catch(console.error);
