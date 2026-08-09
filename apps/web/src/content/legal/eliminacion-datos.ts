import type { LegalDoc } from '@/components/legal/LegalLayout'

/**
 * BORRADOR funcional de las Instrucciones de Eliminación de Datos (requerido por Meta para publicar
 * la app). El abogado puede formalizarlo; reemplaza el texto SIN cambiar la URL (/eliminacion-datos).
 */
export const eliminacionDatos: LegalDoc = {
  title:   'Instrucciones de eliminación de datos',
  updated: '6 de agosto de 2026',
  intro:   'En NEXOR ONE S.A.S respetamos tu derecho a que tus datos personales sean eliminados. Esta página explica cómo solicitar la eliminación de los datos tratados a través de la plataforma NEXOR, incluidos los mensajes recibidos por los canales integrados (WhatsApp, correo).',
  sections: [
    {
      heading: '1. Cómo solicitar la eliminación',
      body:
`Envía una solicitud a gerencia@nexor-one.com con el asunto "Eliminación de datos", indicando:

- Tu nombre y el correo o número de teléfono asociado a los datos.
- La empresa a través de la cual interactuaste con NEXOR (si aplica).
- Si eres una empresa cliente o un cliente final que escribió por WhatsApp/correo.`,
    },
    {
      heading: '2. Qué datos se eliminan',
      body: 'A tu solicitud, eliminamos los datos personales asociados que tratamos como responsables o encargados: datos de contacto, contenido de conversaciones de los canales integrados y registros relacionados, salvo aquello que debamos conservar por obligación legal o para la defensa de reclamaciones.',
    },
    {
      heading: '3. Clientes finales que escriben por WhatsApp o correo',
      body: 'Si eres un cliente final que se comunicó con una empresa a través de NEXOR y deseas eliminar tus datos, puedes escribirnos a gerencia@nexor-one.com o solicitarlo directamente a la empresa con la que conversaste. Coordinaremos con esa empresa (responsable de la relación contigo) para atender la solicitud.',
    },
    {
      heading: '4. Plazo de respuesta',
      body: 'Atenderemos tu solicitud dentro de los plazos que establece la Ley 1581 de 2012 de Colombia. Podríamos solicitar información adicional para verificar tu identidad antes de proceder, con el fin de proteger tus propios datos.',
    },
    {
      heading: '5. Contacto',
      body: 'Para solicitudes o dudas sobre la eliminación de datos: gerencia@nexor-one.com.',
    },
  ],
}
