/**
 * config/marketplace-filter.js
 * Centraliza la identificación y las políticas de exclusión para grupos y chats
 * de compra, venta, comercio, bazares, mercaditos, tianguis y publicidad.
 */

// JIDs de grupos comerciales / ventas conocidos en la cuenta de Ángel
const KNOWN_MARKETPLACE_JIDS = new Set([
  '120363038501758837@g.us', // CUCEA EATS 2.0
  '120363219998535614@g.us', // Mercadito cucea 2
  '120363411182361723@g.us', // El Barrio de Andares - Zona Real
  '120363410327821237@g.us', // El Barrio de Andares - Zona Real
  '120363421831313721@g.us'  // El panadero con el pan 🗣️❣️🧑‍🍳
]);

// Expresión regular para detectar por nombre de grupo o contacto si es de ventas/comercio
const MARKETPLACE_NAME_REGEX = /(?:ventas?|compras?|bazar(?:es)?|mercaditos?|mercados?|tianguis|eats|anuncios?|publicidad|market(?:place)?|ofertas?|clasificados?|barrio\s+de\s+andares|subastas?|panadero\s+con\s+el\s+pan)\b/i;

/**
 * Determina si un chat o grupo es de compra/venta/publicidad
 * @param {string} chatJid - JID del chat
 * @param {string} chatName - Nombre del contacto o grupo
 * @returns {boolean}
 */
function isMarketplaceChat(chatJid, chatName = '') {
  if (!chatJid) return false;
  if (KNOWN_MARKETPLACE_JIDS.has(chatJid)) return true;
  if (chatName && MARKETPLACE_NAME_REGEX.test(chatName)) return true;
  return false;
}

/**
 * Determina si el mensaje cumple con la excepción explícita solicitada por el usuario:
 * "a menos que por ejemplo te pida que busques algo o explícitamente te pida algo"
 * 
 * Requiere:
 * 1. Que provenga directamente de Ángel (isFromAngel === true)
 * 2. Que contenga comando explícito (!buscar, /buscar, !ia, /ia, !jarvis, /jarvis, !gemini, /gemini, @antigravity)
 *    o una búsqueda explícita dirigida al bot.
 * 
 * @param {string} text - Texto del mensaje
 * @param {boolean} isFromAngel - Si el emisor es Ángel
 * @returns {boolean}
 */
function isExplicitMarketplaceRequest(text, isFromAngel) {
  if (!text || !isFromAngel) return false;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Comandos de búsqueda
  if (lower.startsWith('!buscar') || lower.startsWith('/buscar')) return true;
  if (/^(?:[!/](?:ia|ai|jarvis|gemini)|@?(?:antigravity|jarvis|gemini))\s+(?:busca|buscar|encuentra)\s+/i.test(trimmed)) return true;

  // Comandos explícitos de IA
  if (/^[!/](?:ia|ai|jarvis|gemini)\b/i.test(lower)) return true;
  if (lower.includes('@antigravity') || lower.includes('@jarvis') || lower.includes('@gemini')) return true;
  if (/^(?:antigravity|jarvis|gemini)[,:]?\s+/i.test(lower)) return true;

  return false;
}

module.exports = {
  KNOWN_MARKETPLACE_JIDS,
  MARKETPLACE_NAME_REGEX,
  isMarketplaceChat,
  isExplicitMarketplaceRequest
};
