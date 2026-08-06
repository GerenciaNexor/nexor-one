import type { LegalDoc } from '@/components/legal/LegalLayout'

/**
 * BORRADOR funcional de los Términos / Condiciones del Servicio. El abogado entregará la versión
 * final; reemplaza el texto SIN cambiar la URL (/terminos).
 */
export const terminos: LegalDoc = {
  title:   'Términos y Condiciones del Servicio',
  updated: '6 de agosto de 2026',
  intro:   'Estos términos regulan el acceso y uso de la plataforma NEXOR (nexor-one.com) y sus servicios, operados por NEXOR ONE SAS. Al crear una cuenta o utilizar la plataforma, la empresa cliente y sus usuarios aceptan estos términos.',
  sections: [
    {
      heading: '1. Aceptación de los términos',
      body: 'Al acceder o usar NEXOR, aceptas estos Términos y la Política de Privacidad (/privacidad). Si usas la plataforma en nombre de una empresa, declaras estar autorizado para obligarla a estos términos. Si no estás de acuerdo, no uses el servicio.',
    },
    {
      heading: '2. Descripción del servicio',
      body: 'NEXOR es una plataforma de gestión empresarial (ventas, compras, inventario, agenda y finanzas) con agentes de inteligencia artificial que atienden a los clientes finales de la empresa a través de canales integrados como WhatsApp y correo electrónico.',
    },
    {
      heading: '3. Cuentas, acceso y responsabilidad del usuario',
      body:
`- La empresa cliente es responsable de la veracidad de los datos de registro y de mantener la confidencialidad de sus credenciales.
- Cada usuario es responsable de la actividad realizada bajo su cuenta.
- Debes notificar de inmediato a gerencia@nexor-one.com ante cualquier uso no autorizado.`,
    },
    {
      heading: '4. Uso aceptable',
      body:
`Te comprometes a no usar NEXOR para:

- Actividades ilegales o que infrinjan derechos de terceros.
- Enviar mensajes no solicitados (spam) o vulnerar las políticas de WhatsApp Business y de los proveedores de correo.
- Intentar acceder a datos de otras empresas cliente, o comprometer la seguridad o disponibilidad de la plataforma.`,
    },
    {
      heading: '5. Datos y contenido del cliente',
      body: 'La empresa cliente conserva la titularidad de los datos que carga y de las conversaciones gestionadas a través de la plataforma. La empresa es responsable de contar con las autorizaciones necesarias de sus propios clientes finales para el tratamiento de esos datos. NEXOR trata esos datos como encargado, según la Política de Privacidad.',
    },
    {
      heading: '6. Canales integrados y agentes de IA',
      body: 'Las respuestas generadas por los agentes de IA son un apoyo automatizado y pueden contener errores. La empresa cliente es responsable de supervisar la operación y de las comunicaciones enviadas a sus clientes finales. El uso de WhatsApp y de las APIs de Google/Meta está además sujeto a los términos de dichos proveedores.',
    },
    {
      heading: '7. Propiedad intelectual',
      body: 'La plataforma, su software, marca y contenidos son propiedad de NEXOR ONE SAS o de sus licenciantes. Estos términos no transfieren ningún derecho de propiedad intelectual sobre la plataforma a la empresa cliente, salvo el derecho de uso durante la vigencia del servicio.',
    },
    {
      heading: '8. Disponibilidad, soporte y cambios en el servicio',
      body: 'Procuramos mantener la plataforma disponible y segura, pero el servicio se presta "tal cual" y puede sufrir interrupciones por mantenimiento o causas ajenas. Podemos modificar, agregar o retirar funcionalidades para mejorar el servicio.',
    },
    {
      heading: '9. Limitación de responsabilidad',
      body: 'En la máxima medida permitida por la ley, NEXOR ONE SAS no será responsable por daños indirectos, lucro cesante o pérdida de datos derivados del uso o la imposibilidad de uso de la plataforma. Nada en estos términos limita responsabilidades que no puedan excluirse legalmente.',
    },
    {
      heading: '10. Vigencia y terminación',
      body: 'Estos términos aplican mientras uses la plataforma. Cualquiera de las partes puede terminar la relación conforme a lo acordado; a la terminación, se aplicará la política de conservación y eliminación de datos (ver /eliminacion-datos).',
    },
    {
      heading: '11. Cambios a los términos',
      body: 'Podemos actualizar estos términos. Los cambios se publicarán en esta misma página con su fecha de actualización; el uso continuado de la plataforma implica su aceptación.',
    },
    {
      heading: '12. Ley aplicable y jurisdicción',
      body: 'Estos términos se rigen por las leyes de la República de Colombia. Cualquier controversia se someterá a los jueces y tribunales competentes de Colombia.',
    },
    {
      heading: '13. Contacto',
      body: 'Para cualquier consulta sobre estos términos: gerencia@nexor-one.com.',
    },
  ],
}
