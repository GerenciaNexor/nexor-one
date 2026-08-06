import type { LegalDoc } from '@/components/legal/LegalLayout'

/**
 * BORRADOR funcional de la Política de Privacidad. El abogado entregará la versión final;
 * reemplaza el texto de abajo SIN cambiar la URL (/privacidad). Formato: párrafos separados
 * por una línea en blanco; viñetas con líneas que empiezan con "- ".
 */
export const privacidad: LegalDoc = {
  title:   'Política de Privacidad',
  updated: '6 de agosto de 2026',
  sections: [
    {
      heading: '1. Identificación del responsable',
      body: 'NEXOR ONE SAS, sociedad constituida en Colombia, con domicilio en [dirección — por definir], es responsable del tratamiento de los datos personales recogidos a través de la plataforma NEXOR (nexor-one.com) y sus servicios asociados. Contacto: gerencia@nexor-one.com.',
    },
    {
      heading: '2. Qué datos recopilamos',
      body:
`NEXOR es una plataforma de gestión empresarial que integra canales de comunicación (WhatsApp, correo electrónico). Podemos recopilar y procesar:

- Datos de las empresas cliente y sus usuarios (nombre, correo, teléfono, cargo).
- Datos operativos que las empresas cargan en la plataforma (clientes, proveedores, productos, transacciones).
- Contenido de las conversaciones que los clientes finales sostienen con las empresas a través de los canales integrados (WhatsApp, correo), para prestar el servicio de atención automatizada.
- Datos técnicos de uso (registros de acceso, dirección IP, actividad en la plataforma).`,
    },
    {
      heading: '3. Para qué usamos los datos',
      body:
`- Prestar el servicio de gestión empresarial y atención automatizada mediante agentes.
- Procesar y responder los mensajes recibidos por los canales integrados.
- Operar, mantener y mejorar la plataforma.
- Cumplir obligaciones legales y de seguridad.

No vendemos datos personales a terceros.`,
    },
    {
      heading: '4. Tratamiento de mensajes de WhatsApp y correo',
      body: 'Cuando una empresa cliente conecta su cuenta de WhatsApp Business o correo, NEXOR procesa los mensajes entrantes y salientes con el único fin de prestar el servicio de atención automatizada contratado por esa empresa. Los mensajes se procesan de forma aislada por empresa y no se comparten entre distintas empresas cliente.',
    },
    {
      heading: '5. Terceros y encargados',
      body: 'Para operar, NEXOR se apoya en proveedores de infraestructura y servicios (alojamiento en la nube, procesamiento de IA, APIs de mensajería de Meta y Google). Estos actúan como encargados del tratamiento bajo nuestras instrucciones.',
    },
    {
      heading: '6. Conservación y eliminación de datos',
      body: 'Los datos se conservan mientras la empresa cliente mantenga su relación con NEXOR. La empresa o los titulares pueden solicitar la eliminación de sus datos escribiendo a gerencia@nexor-one.com. Consulta las instrucciones en la página de Eliminación de datos (/eliminacion-datos).',
    },
    {
      heading: '7. Derechos de los titulares',
      body: 'Conforme a la Ley 1581 de 2012 de Colombia, los titulares tienen derecho a conocer, actualizar, rectificar y suprimir sus datos, y a revocar la autorización. Para ejercerlos, escribir a gerencia@nexor-one.com.',
    },
    {
      heading: '8. Seguridad',
      body: 'NEXOR aplica medidas técnicas y organizativas para proteger los datos, incluyendo cifrado de credenciales sensibles y aislamiento de datos entre empresas cliente.',
    },
    {
      heading: '9. Cambios a esta política',
      body: 'Podemos actualizar esta política. Los cambios se publicarán en esta misma página con su fecha de actualización.',
    },
    {
      heading: '10. Contacto',
      body: 'Para cualquier consulta sobre esta política o el tratamiento de datos: gerencia@nexor-one.com.',
    },
  ],
}
