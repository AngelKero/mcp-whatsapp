const noticeRepository = require('../../repositories/notice-repository.js');

// Mapeo de grupos oficiales del semestre 2026B a Materias en Notion
const MONITORED_GROUPS = {
  '120363411190829094@g.us': { name: 'Programación Web', materiaId: '24a853a1-d77e-80ec-bf20-e4fe770d19b2' },
  '120363427680990546@g.us': { name: 'Bases de Datos II', materiaId: '24a853a1-d77e-8025-9f0d-f27304f4840d' },
  '120363429650635642@g.us': { name: 'Fundamentos de Redes', materiaId: '24a853a1-d77e-8056-b6cc-e40fe1c1cbfb' },
  '120363411893241865@g.us': { name: 'Inteligencia de Negocios', materiaId: '24a853a1-d77e-8088-8d79-efd519fb7db5' },
  '120363410099002300@g.us': { name: 'Ingeniería de Software', materiaId: '24a853a1-d77e-80d3-8c05-e04170ebb809' }
  // Nota: Equipo 3 (120363431633640655@g.us) es equipo de trabajo, no grupo de materia oficial.
};

/**
 * pipeline/middlewares/school-notice.middleware.js
 * Monitorea y clasifica cancelaciones, clases virtuales y cambios de aula en grupos de CUCEA.
 */
module.exports = function createSchoolNoticeMiddleware(classifyMessageFn, db) {
  return async function schoolNoticeMiddleware(ctx, next) {
    const { msg, text, chatJid, sender } = ctx;

    if (msg.is_from_me === 1) return; // No procesar mensajes propios

    const groupInfo = MONITORED_GROUPS[chatJid];
    if (groupInfo) {
      const tipo = await classifyMessageFn(text);
      if (tipo) {
        console.log(`🚨 ¡DETECCIÓN DE AVISO en ${groupInfo.name}! Clasificación: ${tipo}`);
        let senderDisplayName = sender;
        try {
          const cRow = db.prepare('SELECT name FROM chats WHERE jid = ?').get(sender);
          if (cRow?.name) senderDisplayName = cRow.name;
        } catch {}

        try {
          await noticeRepository.createNotice({
            groupName: groupInfo.name,
            materiaId: groupInfo.materiaId,
            senderName: senderDisplayName,
            text,
            tipo,
            origin: 'WhatsApp'
          });
        } catch (err) {
          console.error('Error publicando aviso a Notion:', err.message);
        }
      }
    }

    await next();
  };
};
