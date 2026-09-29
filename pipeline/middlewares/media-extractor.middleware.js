const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { downloadMedia, sendReaction, sendReply, sendMessage } = require('../../mcp-client.js');
const audioTranscriber = require('../../audio-transcriber.js');
const pdfParser = require('../../pdf-parser.js');
const receiptParser = require('../../receipt-parser.js');
const transactionRepository = require('../../repositories/transaction-repository.js');
const sessionManager = require('../../session-manager.js');
const stickerVault = require('../../modules/stickers/sticker-vault.js');
const stickerVision = require('../../modules/stickers/sticker-vision.js');
const antiEcho = require('../../modules/anti-echo-tracker.js');
const { MY_PHONE_JID } = require('../../config/env.js');
const { isMarketplaceChat } = require('../../config/marketplace-filter.js');

/**
 * pipeline/middlewares/media-extractor.middleware.js
 * Descarga y extrae contenido multimodal:
 * - Notas de voz (Whisper)
 * - Documentos PDF
 * - Comprobantes bancarios y fotos (Apple Vision OCR + VLM para fotos de contexto)
 * - Stickers de WhatsApp (Fusión de contexto semántico + Auto-aprendizaje en hilos activos)
 */
module.exports = function createMediaExtractorMiddleware(chatQueue = null) {
  return async function mediaExtractorMiddleware(ctx, next) {
    const {
      msg,
      chatJid,
      sender,
      isAudio,
      isDocument,
      isImage,
      isSticker,
      isGroup,
      isFromAngel,
      isFromErika,
      isMyOwnChat,
      senderName,
      contactName
    } = ctx;

    // Grupos y chats de compra/venta/publicidad quedan totalmente fuera de extracción multimedia
    if (isMarketplaceChat(chatJid, contactName)) {
      await next();
      return;
    }

    // Permiso modular por chat (Panel 8767): allow_media = 0 bloquea audio/PDF/imagen/sticker
    if (ctx.permissions && ctx.permissions.allow_media === 0) {
      await next();
      return;
    }

    const sessionState = sessionManager.getSessionState(chatJid);
    const isSessionActive = isMyOwnChat || sessionState.state === 'ACTIVE';

    const willProcessMedia = isAudio || isDocument || (isSticker && isSessionActive) || (isImage && (isFromAngel || isFromErika || !isGroup || isSessionActive));

    if (willProcessMedia && chatQueue?.startMediaPending) {
      chatQueue.startMediaPending(chatJid, msg.id);
    }

    try {

    // 1. Transcripción de Audio
    if (isAudio) {
      try {
        console.log(`🎙️ [AUDIO RECIBIDO] Descargando nota de voz: ${msg.id} en ${chatJid}...`);
        const mediaInfo = await downloadMedia(chatJid, msg.id);
        if (mediaInfo?.Path && fs.existsSync(mediaInfo.Path)) {
          const transcribedText = await audioTranscriber.transcribe(mediaInfo.Path);
          if (transcribedText) {
            console.log(`🗣️ [AUDIO TRANSCRITO]: "${transcribedText}"`);
            ctx.text = transcribedText;
          }
        }
      } catch (err) {
        console.error('Error transcribiendo audio:', err.message);
      }
    }

    // 2. Extracción de PDFs
    if (isDocument) {
      try {
        console.log(`📄 [DOCUMENTO RECIBIDO] Descargando: ${msg.id} en ${chatJid}...`);
        const mediaInfo = await downloadMedia(chatJid, msg.id);
        if (mediaInfo?.Path?.toLowerCase().endsWith('.pdf') && fs.existsSync(mediaInfo.Path)) {
          const pdfResult = await pdfParser.extractText(mediaInfo.Path);
          if (pdfResult?.success && pdfResult.text) {
            const truncated = pdfResult.text.slice(0, 3000);
            const prefix = ctx.text ? `${ctx.text}\n\n[Contenido del Documento PDF]:\n` : '[Contenido del Documento PDF enviado]:\n';
            ctx.text = `${prefix}${truncated}`;
          }
        }
      } catch (err) {
        console.error('Error procesando PDF:', err.message);
      }
    }

    // 3. Stickers (Fusión de Contexto & Auto-Aprendizaje en Hilos Activos)
    if (isSticker) {
      if (!isSessionActive) {
        // Filtro Anti-Saturación: No procesar stickers de charlas ajenas o grupos cuando el bot está inactivo
        await next();
        return;
      }

      try {
        console.log(`🎭 [STICKER ENTRANTE] Procesando en hilo activo (${chatJid})...`);
        const mediaInfo = await downloadMedia(chatJid, msg.id);
        if (mediaInfo?.Path && fs.existsSync(mediaInfo.Path)) {
          const buffer = fs.readFileSync(mediaInfo.Path);
          const stickerHash = crypto.createHash('sha256').update(buffer).digest('hex');

          // 🛑 FILTRO ANTI-ECHO: Si el sticker fue enviado por el bot, descartarlo
          if ((msg.id && typeof antiEcho.hasSentId === 'function' && antiEcho.hasSentId(msg.id)) || antiEcho.consumeSticker(stickerHash) || (msg.id && antiEcho.consumeSticker(msg.id))) {
            console.log(`🛑 [ANTI-ECHO] Sticker saliente del bot interceptado por ID/hash (${msg.id || stickerHash.slice(0, 8)}). Descartando turno para evitar auto-respuesta.`);
            return;
          }

          let profile = stickerVault.getById(stickerHash);
          if (!profile) {
            // Auto-aprendizaje: sticker nuevo enviado durante una plática activa
            console.log(`✨ [STICKER AUTO-LEARN] Analizando sticker nuevo (${stickerHash.slice(0, 8)}) de ${senderName}...`);
            const generated = await stickerVision.analyzeMedia(mediaInfo.Path, senderName);

            const vaultDir = path.join(__dirname, '..', '..', 'store', 'stickers', 'vault');
            if (!fs.existsSync(vaultDir)) fs.mkdirSync(vaultDir, { recursive: true });
            const vaultPath = path.join(vaultDir, `${stickerHash}.webp`);
            fs.copyFileSync(mediaInfo.Path, vaultPath);

            profile = {
              id: stickerHash,
              file_path: vaultPath,
              source: 'inbound_live',
              sender_jid: sender,
              pack_name: 'Stickers Aprendidos',
              meme_name: generated.meme_name,
              visual_description: generated.visual_description,
              emotion: generated.emotion,
              intent: generated.intent,
              ocr_text: generated.ocr_text,
              tags: generated.tags,
              emojis: generated.emojis,
              suggested_contexts: generated.suggested_contexts
            };

            stickerVault.saveSticker(profile);
            console.log(`✅ [STICKER APRENDIDO] Guardado en Vault: "${profile.meme_name}" (${profile.emotion})`);
          } else {
            console.log(`🎯 [STICKER CONOCIDO] Identificado: "${profile.meme_name}" (${profile.emotion})`);
          }

          // Inyección de contexto semántico
          const parts = [
            `[Sticker enviado por ${senderName}: ${profile.meme_name || 'Sticker'}`,
            `Emoción: ${profile.emotion || 'reacción'}`,
            `Intención: ${profile.intent || 'cotorreo'}`,
            profile.ocr_text ? `Texto visible: '${profile.ocr_text}'` : null
          ].filter(Boolean);

          const contextSnippet = parts.join(' | ') + ']';
          ctx.text = ctx.text ? `${ctx.text}\n\n${contextSnippet}` : contextSnippet;
        }
      } catch (err) {
        console.error('Error procesando sticker en media-extractor:', err.message);
      }
    }

    // 4. Comprobantes Bancarios y Fotos
    if (isImage && (isFromAngel || isFromErika || !isGroup || isSessionActive)) {
      try {
        console.log(`🖼️ [IMAGEN RECIBIDA] Analizando: ${msg.id} en ${chatJid}...`);
        const mediaInfo = await downloadMedia(chatJid, msg.id);
        if (mediaInfo?.Path && fs.existsSync(mediaInfo.Path)) {
          const receiptData = await receiptParser.parseReceipt(mediaInfo.Path);
          if (receiptData?.isReceipt && receiptData.amount > 0) {
            console.log(`🧾 [COMPROBANTE RECONOCIDO] ${receiptData.bankOrMerchant} - $${receiptData.amount}`);
            let finalConcept = receiptData.concept;
            if (ctx.text && !/(?:[!/]ai|[!/]ia|@?antigravity)/i.test(ctx.text)) {
              finalConcept = `${ctx.text} (${receiptData.bankOrMerchant})`;
            }

            await transactionRepository.createExpense({
              amount: receiptData.amount,
              concept: finalConcept,
              type: 'Gasto',
              date: receiptData.date,
              categoryId: receiptData.categoryId
            });

            try { await sendReaction(chatJid, msg.id, '💸'); } catch {}

            const formattedAmount = receiptData.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const confirmMsg = `💸 *[Comprobante Registrado en Notion]*\n` +
              `• *Emisor:* ${receiptData.bankOrMerchant}\n` +
              `• *Monto:* $${formattedAmount} MXN\n` +
              `• *Concepto:* ${finalConcept}\n` +
              `• *Categoría:* ${receiptData.categoryName}\n` +
              `• *Fecha:* ${receiptData.date}\n\n` +
              `_Guardado automáticamente en Finanzas / Transacciones._`;

            if (chatJid.includes('3325094748')) {
              await sendReply(chatJid, confirmMsg, msg.id, isGroup ? sender : '');
            } else {
              const originChat = contactName ? `chat con *${contactName}*` : (isGroup ? 'un grupo' : 'chat externo');
              await sendMessage(MY_PHONE_JID, `💸 *[Comprobante Detectado en ${originChat}]*\n\n${confirmMsg}`);
            }
            return; // Consumido exitosamente
          } else {
            const ocrText = receiptParser.getTextFromImage(mediaInfo.Path);
            if (ocrText) {
              // Post-OCR anti-echo: si la imagen/sticker contiene firmas del bot o texto de stickers del bot
              if (
                ocrText.includes('X Antigravity Bot X') ||
                ocrText.includes('X Bot X') ||
                /meneando\s+la\s+chapa/i.test(ocrText) ||
                /sin\s+miedo\s+al\s+[\u00e9e]xito/i.test(ocrText)
              ) {
                console.log(`🛡️ [ANTI-ECHO POST-OCR] Imagen/Sticker propio del bot descartado en ${chatJid}`);
                return;
              }
              ctx.text = ctx.text ? `${ctx.text}\n\n[Texto visible en la imagen]:\n${ocrText}` : `[Foto enviada con texto]:\n${ocrText}`;
            } else if (isSessionActive && !ctx.text) {
              // Si no hay texto detectable por OCR pero estamos en conversación activa, extraer descripción visual con VLM
              console.log(`👁️ [VISION DESCRIPTOR] Generando descripción visual para imagen sin OCR en ${chatJid}...`);
              const visualDesc = await stickerVision.analyzeMedia(mediaInfo.Path, senderName);
              ctx.text = `[Foto/Imagen enviada por ${senderName}: ${visualDesc.visual_description || visualDesc.meme_name} | Emoción/Tono: ${visualDesc.emotion}]`;
            } else if (!ctx.text) {
              ctx.text = `[El usuario envió una imagen sin texto detectable (archivo: ${path.basename(mediaInfo.Path)})]`;
            }
          }
        }
      } catch (err) {
        console.error('Error procesando imagen:', err.message);
      }

      if (!ctx.text) return;
    }

    await next();
    } finally {
      if (willProcessMedia && chatQueue?.finishMediaPending) {
        chatQueue.finishMediaPending(chatJid, msg.id);
      }
    }
  };
};
