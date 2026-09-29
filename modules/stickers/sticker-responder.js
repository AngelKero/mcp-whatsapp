/**
 * modules/stickers/sticker-responder.js
 * Motor de decisión pragmática y despacho de stickers de salida.
 * Controla cuándo enviar un sticker (evitando spam) y cuál seleccionar del vault.
 */

const stickerVault = require('./sticker-vault.js');
const { sendSticker } = require('../../mcp-client.js');

class StickerResponder {
  constructor(cooldownTurns = 4, cooldownMs = 60 * 1000) {
    this.cooldownTurns = cooldownTurns;
    this.cooldownMs = cooldownMs;
    this.lastStickerTimeByChat = new Map();
    this.turnsSinceStickerByChat = new Map();
  }

  recordTurn(chatJid) {
    const current = this.turnsSinceStickerByChat.get(chatJid) || 0;
    this.turnsSinceStickerByChat.set(chatJid, current + 1);
  }

  isExplicitStickerRequest(text) {
    if (!text) return false;
    return /\b(?:m[aá]ndame|env[ií]a|pon|tira|pasa|rolar?)\s+(?:un\s+)?sticker\b/i.test(text) ||
           /\b(?:otro\s+sticker|un\s+sticker|responde\s+con\s+sticker)\b/i.test(text);
  }

  shouldSendSticker(chatJid, userText, aiReply, isSystemCommand = false) {
    if (isSystemCommand) return false;
    
    // Si el usuario lo pidió expresamente, siempre concederlo
    if (this.isExplicitStickerRequest(userText)) {
      return { allowed: true, reason: 'explicit_request' };
    }

    const now = Date.now();
    const lastTime = this.lastStickerTimeByChat.get(chatJid) || 0;
    const turns = this.turnsSinceStickerByChat.get(chatJid) || 0;

    // Verificar cooldown
    if (now - lastTime < this.cooldownMs || turns < this.cooldownTurns) {
      return { allowed: false, reason: 'cooldown' };
    }

    // Verificar detonadores de complicidad, humor o celebración
    const combined = `${userText} ${aiReply}`.toLowerCase();
    const isPlayful = (
      combined.includes('xd') ||
      combined.includes(':3') ||
      combined.includes('jaja') ||
      combined.includes('sin miedo al éxito') ||
      combined.includes('producción') ||
      combined.includes('chapa') ||
      combined.includes('ánimo') ||
      combined.includes('con todo') ||
      combined.includes('felicidades') ||
      combined.includes('listo') ||
      combined.includes('a darle')
    );

    if (isPlayful) {
      return { allowed: true, reason: 'autonomous_playful' };
    }

    return { allowed: false, reason: 'no_trigger' };
  }

  async selectAndSendSticker(chatJid, userText, aiReply) {
    // 1. Construir query de búsqueda semántica
    let searchQuery = '';
    const cleanUser = (userText || '').toLowerCase();
    const cleanAi = (aiReply || '').toLowerCase();

    if (this.isExplicitStickerRequest(cleanUser)) {
      // Extraer concepto pedido: ej. "mándame un sticker de risa"
      const match = cleanUser.match(/(?:sticker\s+de\s+|sticker\s+)([\w\s]+)/i);
      searchQuery = match ? match[1].trim() : 'exito humor';
    } else if (cleanUser.includes('produccion') || cleanAi.includes('producción') || cleanUser.includes('exito') || cleanUser.includes('jale')) {
      searchQuery = 'exito produccion dev';
    } else if (cleanUser.includes('chapa') || cleanAi.includes('chapa') || cleanUser.includes('baile') || cleanUser.includes('ritmo')) {
      searchQuery = 'chapa ritmo baile';
    } else if (cleanUser.includes('dormir') || cleanUser.includes('sueño') || cleanUser.includes('cansad') || cleanUser.includes('desvelo') || cleanUser.includes('mimido')) {
      searchQuery = 'dormir sueño cansancio mimido taquito perrito';
    } else if (cleanUser.includes('caos') || cleanUser.includes('desmadre') || cleanUser.includes('fuego') || cleanUser.includes('mamo') || cleanUser.includes('valio')) {
      searchQuery = 'caos foca explosion nuclear';
    } else if (cleanUser.includes('jaja') || cleanAi.includes('jaja') || cleanUser.includes('xd')) {
      searchQuery = 'risa humor broma llanto chistoso comedia';
    } else if (cleanUser.includes('gracias') || cleanAi.includes('de nada') || cleanAi.includes(':3')) {
      searchQuery = 'ternura afecto carino bonito lindo';
    } else {
      searchQuery = 'humor meme cotorreo reaccion';
    }

    // 2. Buscar en Sticker Vault
    let candidates = stickerVault.searchHybrid(searchQuery, 8);
    if (candidates.length === 0) {
      // Fallback a cualquier sticker disponible en la bóveda
      candidates = stickerVault.searchHybrid('humor dev meme cotorreo', 8);
    }

    if (candidates.length === 0) {
      return null;
    }

    // Filtrar para no repetir ninguno de los últimos 5 stickers enviados en este chat
    if (!this.recentStickersByChat) this.recentStickersByChat = new Map();
    const recent = this.recentStickersByChat.get(chatJid) || [];
    const pool = candidates.filter(c => !recent.includes(c.id));
    const chosen = (pool.length > 0 ? pool : candidates)[Math.floor(Math.random() * (pool.length > 0 ? pool.length : candidates.length))];

    try {
      console.log(`🚀 [STICKER RESPONDER] Despachando sticker "${chosen.meme_name}" (${chosen.file_path}) a ${chatJid}...`);
      const res = await sendSticker(chatJid, chosen.file_path);
      
      // Actualizar contadores y vault
      stickerVault.recordUsage(chosen.id);
      recent.push(chosen.id);
      if (recent.length > 5) recent.shift();
      this.recentStickersByChat.set(chatJid, recent);
      this.lastStickerTimeByChat.set(chatJid, Date.now());
      this.turnsSinceStickerByChat.set(chatJid, 0);

      return {
        success: true,
        stickerId: chosen.id,
        memeName: chosen.meme_name,
        res
      };
    } catch (err) {
      console.error('[STICKER RESPONDER] Error enviando sticker:', err.message);
      return null;
    }
  }
}

const stickerResponder = new StickerResponder();

module.exports = stickerResponder;
module.exports.StickerResponder = StickerResponder;
