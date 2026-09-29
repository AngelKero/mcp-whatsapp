/**
 * modules/academic/notion-notes-builder.js
 * Responsabilidad única: Convertir el JSON de síntesis pedagógica estructurada
 * en el árbol de bloques nativos de Notion (Callouts, Tablas, Headings, Tareas).
 */

class NotionNotesBuilder {
  buildBlocks(materiaName, synthesis, transcriptPath) {
    const blocks = [];

    // 1. Callout de Resumen
    blocks.push({
      object: 'block',
      type: 'callout',
      callout: {
        icon: { type: 'emoji', emoji: '📋' },
        rich_text: [{ type: 'text', text: { content: synthesis.resumen || 'Resumen de la sesión.' } }]
      }
    });

    blocks.push({ object: 'block', type: 'divider', divider: {} });

    // 2. Temas Vistos
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: '🎯 Temas Vistos en Clase' } }] }
    });

    for (const tema of (synthesis.temas || [])) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ type: 'text', text: { content: tema } }] }
      });
    }

    // 3. Conceptos Clave (Tabla Notion de 2 columnas)
    if (synthesis.conceptos && synthesis.conceptos.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: '📝 Conceptos Clave & Definiciones' } }] }
      });

      const tableRows = [
        {
          type: 'table_row',
          table_row: {
            cells: [
              [{ type: 'text', text: { content: 'Concepto' } }],
              [{ type: 'text', text: { content: 'Explicación / Definición' } }]
            ]
          }
        }
      ];

      for (const item of synthesis.conceptos.slice(0, 15)) {
        tableRows.push({
          type: 'table_row',
          table_row: {
            cells: [
              [{ type: 'text', text: { content: (item.concepto || '').slice(0, 100) } }],
              [{ type: 'text', text: { content: (item.definicion || '').slice(0, 400) } }]
            ]
          }
        });
      }

      blocks.push({
        object: 'block',
        type: 'table',
        table: {
          table_width: 2,
          has_column_header: true,
          has_row_header: false,
          children: tableRows
        }
      });
    }

    // 4. Puntos Enfatizados por el Profesor
    if (synthesis.puntosProfesor && synthesis.puntosProfesor.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: '💡 Puntos Clave Enfatizados por el Docente' } }] }
      });

      for (const punto of synthesis.puntosProfesor) {
        blocks.push({
          object: 'block',
          type: 'callout',
          callout: {
            icon: { type: 'emoji', emoji: '⭐' },
            rich_text: [{ type: 'text', text: { content: punto } }]
          }
        });
      }
    }

    // 5. Tareas y Proyectos Asignados
    if (synthesis.tareas && synthesis.tareas.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: '🔥 Tareas & Pendientes Asignados' } }] }
      });

      for (const tarea of synthesis.tareas) {
        const txt = typeof tarea === 'string' ? tarea : (tarea.tarea || 'Tarea de clase');
        blocks.push({
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: [{ type: 'text', text: { content: txt } }],
            checked: false
          }
        });
      }
    }

    // 6. Preguntas de Repaso / Examen
    if (synthesis.preguntasEstudio && synthesis.preguntasEstudio.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: '❓ Preguntas de Repaso para Examen' } }] }
      });

      for (const preg of synthesis.preguntasEstudio) {
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: { rich_text: [{ type: 'text', text: { content: preg } }] }
        });
      }
    }

    // 7. Pie de Página con archivo de transcripción
    blocks.push({ object: 'block', type: 'divider', divider: {} });
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: `🎙️ Transcrito con Whisper Small MLX · Archivo local: ${transcriptPath || 'Guardado en Documents/Transcripciones'}` }, annotations: { italic: true, color: 'gray' } }
        ]
      }
    });

    return blocks;
  }
}

module.exports = new NotionNotesBuilder();
