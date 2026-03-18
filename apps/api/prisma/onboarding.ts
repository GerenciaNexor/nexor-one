/**
 * onboarding.ts — Script de seed automático desde Excel de onboarding de clientes
 *
 * USO:
 *   pnpm --filter @nexor/api onboarding --file="ruta/al/archivo.xlsx"
 *   pnpm --filter @nexor/api onboarding --file="ruta.xlsx" --modules="ARI,AGENDA,VERA"
 *
 *   En produccion (Railway):
 *   DATABASE_URL="postgresql://..." pnpm --filter @nexor/api onboarding --file="ruta.xlsx"
 *
 * COMPORTAMIENTO:
 *   1. Lee y valida el Excel — si hay errores, los reporta TODOS y no escribe nada
 *   2. Si es valido, crea en orden: tenant → sucursales → feature flags → usuarios → productos → stock → proveedores
 *   3. Es idempotente: ejecutarlo dos veces produce el mismo resultado que ejecutarlo una vez
 *   4. Las contrasenas temporales se hashean con bcrypt — nunca aparecen en consola ni logs
 */

import path from 'path'
import crypto from 'crypto'
import fs from 'fs'
import ExcelJS from 'exceljs'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import type { Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// =============================================================================
// TIPOS INTERNOS
// =============================================================================

interface EmpresaData {
  nombreComercial: string
  nombreLegal:     string | null
  nit:             string | null
  timezone:        string
  currency:        string
  logoUrl:         string | null
}

interface SucursalData {
  nombre:    string
  ciudad:    string | null
  direccion: string | null
  telefono:  string | null
}

interface UsuarioData {
  nombre:    string
  email:     string
  rol:       string
  modulo:    string | null
  sucursal:  string | null
  rowNum:    number
}

interface ProductoData {
  sku:         string
  nombre:      string
  categoria:   string | null
  unidad:      string
  precioVenta: number | null
  precioCosto: number | null
  stockMin:    number
  stockMax:    number | null
  rowNum:      number
}

interface StockData {
  sku:      string
  sucursal: string
  cantidad: number
  rowNum:   number
}

interface ProveedorData {
  nombre:     string
  contacto:   string | null
  email:      string | null
  telefono:   string | null
  nit:        string | null
  diasCredito: number | null
}

interface ExcelParsed {
  empresa:      EmpresaData
  sucursales:   SucursalData[]
  usuarios:     UsuarioData[]
  productos:    ProductoData[]
  stockInicial: StockData[]
  proveedores:  ProveedorData[]
}

const ROLES_VALIDOS = ['TENANT_ADMIN', 'BRANCH_ADMIN', 'AREA_MANAGER', 'OPERATIVE'] as const
const MODULOS_VALIDOS = ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const

// =============================================================================
// ARGUMENTOS CLI
// =============================================================================

const args = process.argv.slice(2)
const fileArg = args.find((a) => a.startsWith('--file='))?.replace('--file=', '')
const modulesArg = args.find((a) => a.startsWith('--modules='))?.replace('--modules=', '')

if (!fileArg) {
  console.error('\n❌ ERROR: Debes indicar el archivo Excel con --file="ruta/al/archivo.xlsx"\n')
  console.error('  Ejemplo local:      pnpm --filter @nexor/api onboarding --file="docs/cliente.xlsx"')
  console.error('  Con módulos extra:  pnpm --filter @nexor/api onboarding --file="docs/cliente.xlsx" --modules="ARI,AGENDA"\n')
  process.exit(1)
}

const filePath = path.resolve(process.cwd(), fileArg)

if (!fs.existsSync(filePath)) {
  console.error(`\n❌ ERROR: El archivo no existe: ${filePath}\n`)
  process.exit(1)
}

// Módulos extra forzados por CLI (además de los auto-detectados)
const modulesExtra: string[] = modulesArg
  ? modulesArg.split(',').map((m) => m.trim().toUpperCase())
  : []

// =============================================================================
// HELPERS
// =============================================================================

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('').trim()
  }
  return String(v).trim()
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell.value
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function isExampleRow(row: ExcelJS.Row): boolean {
  // Las filas de ejemplo tienen fondo verde (argb FF...2E7D32 o similar)
  // Pero la forma más confiable es verificar si la primera celda tiene algún valor
  // y no confiar en el color. El sheet tiene: fila 1 instrucciones, fila 2 header,
  // fila 3+ datos. Las filas de ejemplo las leeremos igual que datos reales — el
  // usuario puede dejar las filas de ejemplo o borrarlas; si son datos ficticios
  // la validación de emails únicos o SKU duplicado las atrapará.
  return false // No filtramos por color — leemos todas las filas post-header
}

function dataRows(sheet: ExcelJS.Worksheet): ExcelJS.Row[] {
  const rows: ExcelJS.Row[] = []
  sheet.eachRow((row, rowNum) => {
    if (rowNum <= 2) return // Saltar instrucciones (1) y header (2)
    const first = cellStr(row.getCell(1))
    if (!first) return // Fila vacía
    rows.push(row)
  })
  return rows
}

// =============================================================================
// PARSEO DEL EXCEL
// =============================================================================

async function parseExcel(filePath: string): Promise<ExcelParsed> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  // ─── Empresa ───────────────────────────────────────────────────────────────
  const sheetEmpresa = wb.getWorksheet('Empresa')
  if (!sheetEmpresa) throw new Error('No se encontró la pestaña "Empresa" en el Excel.')

  const empRow = sheetEmpresa.getRow(3) // Primera fila de datos
  const empresa: EmpresaData = {
    nombreComercial: cellStr(empRow.getCell(1)),
    nombreLegal:     cellStr(empRow.getCell(2)) || null,
    nit:             cellStr(empRow.getCell(3)) || null,
    timezone:        cellStr(empRow.getCell(4)) || 'America/Bogota',
    currency:        cellStr(empRow.getCell(5)) || 'COP',
    logoUrl:         cellStr(empRow.getCell(6)) || null,
  }

  // ─── Sucursales ────────────────────────────────────────────────────────────
  const sheetSucursales = wb.getWorksheet('Sucursales')
  if (!sheetSucursales) throw new Error('No se encontró la pestaña "Sucursales" en el Excel.')

  const sucursales: SucursalData[] = dataRows(sheetSucursales).map((row) => ({
    nombre:    cellStr(row.getCell(1)),
    ciudad:    cellStr(row.getCell(2)) || null,
    direccion: cellStr(row.getCell(3)) || null,
    telefono:  cellStr(row.getCell(4)) || null,
  }))

  // ─── Usuarios ──────────────────────────────────────────────────────────────
  const sheetUsuarios = wb.getWorksheet('Usuarios')
  if (!sheetUsuarios) throw new Error('No se encontró la pestaña "Usuarios" en el Excel.')

  const usuarios: UsuarioData[] = []
  sheetUsuarios.eachRow((row, rowNum) => {
    if (rowNum <= 2) return
    const nombre = cellStr(row.getCell(1))
    if (!nombre) return
    usuarios.push({
      nombre,
      email:   cellStr(row.getCell(2)),
      rol:     cellStr(row.getCell(3)).toUpperCase(),
      modulo:  cellStr(row.getCell(4)).toUpperCase() || null,
      sucursal:cellStr(row.getCell(5)) || null,
      rowNum,
    })
  })

  // ─── Productos ─────────────────────────────────────────────────────────────
  const sheetProductos = wb.getWorksheet('Productos')
  if (!sheetProductos) throw new Error('No se encontró la pestaña "Productos" en el Excel.')

  const productos: ProductoData[] = []
  sheetProductos.eachRow((row, rowNum) => {
    if (rowNum <= 2) return
    const sku = cellStr(row.getCell(1))
    if (!sku) return
    productos.push({
      sku,
      nombre:      cellStr(row.getCell(2)),
      categoria:   cellStr(row.getCell(3)) || null,
      unidad:      cellStr(row.getCell(4)) || 'unidad',
      precioVenta: cellNum(row.getCell(5)),
      precioCosto: cellNum(row.getCell(6)),
      stockMin:    cellNum(row.getCell(7)) ?? 0,
      stockMax:    cellNum(row.getCell(8)),
      rowNum,
    })
  })

  // ─── Stock inicial ─────────────────────────────────────────────────────────
  const sheetStock = wb.getWorksheet('Stock inicial')
  if (!sheetStock) throw new Error('No se encontró la pestaña "Stock inicial" en el Excel.')

  const stockInicial: StockData[] = []
  sheetStock.eachRow((row, rowNum) => {
    if (rowNum <= 2) return
    const sku = cellStr(row.getCell(1))
    if (!sku) return
    stockInicial.push({
      sku,
      sucursal: cellStr(row.getCell(2)),
      cantidad: cellNum(row.getCell(3)) ?? 0,
      rowNum,
    })
  })

  // ─── Proveedores ───────────────────────────────────────────────────────────
  const sheetProveedores = wb.getWorksheet('Proveedores')
  if (!sheetProveedores) throw new Error('No se encontró la pestaña "Proveedores" en el Excel.')

  const proveedores: ProveedorData[] = dataRows(sheetProveedores).map((row) => ({
    nombre:      cellStr(row.getCell(1)),
    contacto:    cellStr(row.getCell(2)) || null,
    email:       cellStr(row.getCell(3)) || null,
    telefono:    cellStr(row.getCell(4)) || null,
    nit:         cellStr(row.getCell(5)) || null,
    diasCredito: cellNum(row.getCell(6)),
  }))

  return { empresa, sucursales, usuarios, productos, stockInicial, proveedores }
}

// =============================================================================
// VALIDACIONES
// =============================================================================

function validate(data: ExcelParsed): string[] {
  const errors: string[] = []
  const { empresa, sucursales, usuarios, productos, stockInicial, proveedores } = data

  // ─── Empresa ───────────────────────────────────────────────────────────────
  if (!empresa.nombreComercial) errors.push('[Empresa] El nombre comercial es obligatorio.')

  // ─── Sucursales ────────────────────────────────────────────────────────────
  if (sucursales.length === 0) {
    errors.push('[Sucursales] Se requiere al menos una sucursal.')
  }
  sucursales.forEach((s, i) => {
    if (!s.nombre) errors.push(`[Sucursales] Fila ${i + 3}: el nombre de la sucursal es obligatorio.`)
    if (!s.ciudad) errors.push(`[Sucursales] Fila ${i + 3}: la ciudad es obligatoria.`)
  })
  const nombresSucursales = new Set(sucursales.map((s) => s.nombre))

  // ─── Usuarios ──────────────────────────────────────────────────────────────
  if (usuarios.length === 0) {
    errors.push('[Usuarios] Se requiere al menos un usuario.')
  }
  const tieneTenantAdmin = usuarios.some((u) => u.rol === 'TENANT_ADMIN')
  if (!tieneTenantAdmin) {
    errors.push('[Usuarios] Se requiere al menos un usuario con rol TENANT_ADMIN.')
  }

  const emailsVistos = new Set<string>()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  usuarios.forEach((u) => {
    if (!u.nombre) errors.push(`[Usuarios] Fila ${u.rowNum}: el nombre completo es obligatorio.`)
    if (!u.email) {
      errors.push(`[Usuarios] Fila ${u.rowNum}: el email es obligatorio.`)
    } else {
      if (!emailRegex.test(u.email)) {
        errors.push(`[Usuarios] Fila ${u.rowNum}: email inválido: "${u.email}".`)
      }
      if (emailsVistos.has(u.email.toLowerCase())) {
        errors.push(`[Usuarios] Fila ${u.rowNum}: email duplicado: "${u.email}".`)
      }
      emailsVistos.add(u.email.toLowerCase())
    }
    if (!ROLES_VALIDOS.includes(u.rol as (typeof ROLES_VALIDOS)[number])) {
      errors.push(
        `[Usuarios] Fila ${u.rowNum}: rol inválido "${u.rol}". Válidos: ${ROLES_VALIDOS.join(', ')}.`,
      )
    }
    if (u.modulo && !MODULOS_VALIDOS.includes(u.modulo as (typeof MODULOS_VALIDOS)[number])) {
      errors.push(
        `[Usuarios] Fila ${u.rowNum}: módulo inválido "${u.modulo}". Válidos: ${MODULOS_VALIDOS.join(', ')}.`,
      )
    }
    if (u.sucursal && !nombresSucursales.has(u.sucursal)) {
      errors.push(
        `[Usuarios] Fila ${u.rowNum}: sucursal "${u.sucursal}" no existe en la pestaña Sucursales.`,
      )
    }
  })

  // ─── Productos ─────────────────────────────────────────────────────────────
  const skusVistos = new Set<string>()
  productos.forEach((p) => {
    if (!p.sku) errors.push(`[Productos] Fila ${p.rowNum}: el SKU es obligatorio.`)
    if (!p.nombre) errors.push(`[Productos] Fila ${p.rowNum}: el nombre es obligatorio.`)
    if (!p.unidad) errors.push(`[Productos] Fila ${p.rowNum}: la unidad de medida es obligatoria.`)
    if (skusVistos.has(p.sku)) {
      errors.push(`[Productos] Fila ${p.rowNum}: SKU duplicado: "${p.sku}".`)
    }
    skusVistos.add(p.sku)
  })

  // ─── Stock inicial ─────────────────────────────────────────────────────────
  stockInicial.forEach((s) => {
    if (!s.sku) errors.push(`[Stock inicial] Fila ${s.rowNum}: el SKU es obligatorio.`)
    if (!s.sucursal) errors.push(`[Stock inicial] Fila ${s.rowNum}: el nombre de sucursal es obligatorio.`)
    if (s.sku && !skusVistos.has(s.sku)) {
      errors.push(
        `[Stock inicial] Fila ${s.rowNum}: SKU "${s.sku}" no existe en la pestaña Productos.`,
      )
    }
    if (s.sucursal && !nombresSucursales.has(s.sucursal)) {
      errors.push(
        `[Stock inicial] Fila ${s.rowNum}: sucursal "${s.sucursal}" no existe en la pestaña Sucursales.`,
      )
    }
    if (s.cantidad < 0) {
      errors.push(`[Stock inicial] Fila ${s.rowNum}: la cantidad no puede ser negativa.`)
    }
  })

  // ─── Proveedores ───────────────────────────────────────────────────────────
  proveedores.forEach((p, i) => {
    if (!p.nombre) errors.push(`[Proveedores] Fila ${i + 3}: el nombre del proveedor es obligatorio.`)
  })

  return errors
}

// =============================================================================
// SEED
// =============================================================================

async function seed(data: ExcelParsed, modulesFromCli: string[]): Promise<void> {
  const { empresa, sucursales, usuarios, productos, stockInicial, proveedores } = data

  // ─── Detectar módulos activos ───────────────────────────────────────────────
  const modulosActivos = new Set<string>(modulesFromCli)
  if (productos.length > 0) modulosActivos.add('KIRA')
  if (proveedores.length > 0) modulosActivos.add('NIRA')

  console.log('\n📋 Módulos activos para este tenant:', [...modulosActivos].join(', ') || 'ninguno')

  // ─── 1. Tenant ─────────────────────────────────────────────────────────────
  const slug = toSlug(empresa.nombreComercial)
  console.log('\n[1/7] Creando tenant...')

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    create: {
      name:      empresa.nombreComercial,
      slug,
      legalName: empresa.nombreLegal,
      taxId:     empresa.nit,
      timezone:  empresa.timezone,
      currency:  empresa.currency,
      logoUrl:   empresa.logoUrl,
    },
    update: {
      name:      empresa.nombreComercial,
      legalName: empresa.nombreLegal,
      taxId:     empresa.nit,
      timezone:  empresa.timezone,
      currency:  empresa.currency,
      logoUrl:   empresa.logoUrl,
    },
  })
  console.log(`   ✅ Tenant: ${tenant.name} (ID: ${tenant.id})`)

  // ─── 2. Sucursales ─────────────────────────────────────────────────────────
  console.log('\n[2/7] Creando sucursales...')

  const branchMap = new Map<string, string>() // nombre → id

  for (const s of sucursales) {
    const existing = await prisma.branch.findFirst({
      where: { tenantId: tenant.id, name: s.nombre },
      select: { id: true },
    })

    let branchId: string
    if (existing) {
      await prisma.branch.update({
        where: { id: existing.id },
        data: { city: s.ciudad, address: s.direccion, phone: s.telefono },
      })
      branchId = existing.id
      console.log(`   ↩ Sucursal existente actualizada: ${s.nombre}`)
    } else {
      const branch = await prisma.branch.create({
        data: {
          tenantId: tenant.id,
          name:     s.nombre,
          city:     s.ciudad,
          address:  s.direccion,
          phone:    s.telefono,
        },
      })
      branchId = branch.id
      console.log(`   ✅ Sucursal creada: ${s.nombre}`)
    }
    branchMap.set(s.nombre, branchId)
  }

  // ─── 3. Feature flags ──────────────────────────────────────────────────────
  console.log('\n[3/7] Configurando feature flags...')

  for (const mod of MODULOS_VALIDOS) {
    const enabled = modulosActivos.has(mod)
    await prisma.featureFlag.upsert({
      where: { tenantId_module: { tenantId: tenant.id, module: mod as never } },
      create: { tenantId: tenant.id, module: mod as never, enabled },
      update: { enabled },
    })
    console.log(`   ${enabled ? '✅' : '○ '} ${mod}: ${enabled ? 'activo' : 'inactivo'}`)
  }

  // ─── 4. Usuarios ───────────────────────────────────────────────────────────
  console.log('\n[4/7] Creando usuarios...')

  let createdUsers = 0
  let updatedUsers = 0

  for (const u of usuarios) {
    const branchId = u.sucursal ? (branchMap.get(u.sucursal) ?? null) : null
    const existing = await prisma.user.findUnique({
      where: { email: u.email.toLowerCase() },
      select: { id: true },
    })

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name:     u.nombre,
          role:     u.rol as never,
          module:   (u.modulo as never) ?? null,
          branchId: branchId,
        },
      })
      updatedUsers++
      console.log(`   ↩ Usuario actualizado: ${u.email} (${u.rol})`)
    } else {
      // Contraseña temporal — NUNCA se imprime en consola
      const tempPassword = crypto.randomBytes(12).toString('base64url')
      const passwordHash = await bcrypt.hash(tempPassword, 12)

      await prisma.user.create({
        data: {
          tenantId:     tenant.id,
          branchId:     branchId,
          email:        u.email.toLowerCase(),
          name:         u.nombre,
          passwordHash,
          role:         u.rol as never,
          module:       (u.modulo as never) ?? null,
        },
      })
      createdUsers++
      console.log(`   ✅ Usuario creado: ${u.email} (${u.rol})`)
    }
  }

  // ─── 5. Productos ──────────────────────────────────────────────────────────
  console.log('\n[5/7] Importando catálogo de productos...')

  const productMap = new Map<string, string>() // sku → id

  for (const p of productos) {
    const existing = await prisma.product.findFirst({
      where: { tenantId: tenant.id, sku: p.sku },
      select: { id: true },
    })

    let productId: string
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          name:      p.nombre,
          category:  p.categoria,
          unit:      p.unidad,
          salePrice: p.precioVenta !== null ? p.precioVenta : undefined,
          costPrice: p.precioCosto !== null ? p.precioCosto : undefined,
          minStock:  p.stockMin,
          maxStock:  p.stockMax,
        },
      })
      productId = existing.id
      console.log(`   ↩ Producto actualizado: ${p.sku} — ${p.nombre}`)
    } else {
      const product = await prisma.product.create({
        data: {
          tenantId:  tenant.id,
          sku:       p.sku,
          name:      p.nombre,
          category:  p.categoria,
          unit:      p.unidad,
          salePrice: p.precioVenta !== null ? p.precioVenta : undefined,
          costPrice: p.precioCosto !== null ? p.precioCosto : undefined,
          minStock:  p.stockMin,
          maxStock:  p.stockMax,
        },
      })
      productId = product.id
      console.log(`   ✅ Producto creado: ${p.sku} — ${p.nombre}`)
    }
    productMap.set(p.sku, productId)
  }

  // ─── 6. Stock inicial ──────────────────────────────────────────────────────
  console.log('\n[6/7] Configurando stock inicial...')

  for (const s of stockInicial) {
    const productId = productMap.get(s.sku)!
    const branchId  = branchMap.get(s.sucursal)!

    await prisma.stock.upsert({
      where: { productId_branchId: { productId, branchId } },
      create: { productId, branchId, quantity: s.cantidad },
      update: { quantity: s.cantidad },
    })
    console.log(`   ✅ Stock: ${s.sku} en ${s.sucursal} → ${s.cantidad} unidades`)
  }

  // ─── 7. Proveedores ────────────────────────────────────────────────────────
  console.log('\n[7/7] Importando proveedores...')

  for (const p of proveedores) {
    const existing = await prisma.supplier.findFirst({
      where: { tenantId: tenant.id, name: p.nombre },
      select: { id: true },
    })

    if (existing) {
      await prisma.supplier.update({
        where: { id: existing.id },
        data: {
          contactName:  p.contacto,
          email:        p.email,
          phone:        p.telefono,
          taxId:        p.nit,
          paymentTerms: p.diasCredito,
        },
      })
      console.log(`   ↩ Proveedor actualizado: ${p.nombre}`)
    } else {
      await prisma.supplier.create({
        data: {
          tenantId:     tenant.id,
          name:         p.nombre,
          contactName:  p.contacto,
          email:        p.email,
          phone:        p.telefono,
          taxId:        p.nit,
          paymentTerms: p.diasCredito,
        },
      })
      console.log(`   ✅ Proveedor creado: ${p.nombre}`)
    }
  }

  // ─── Resumen final ─────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('🎉 Onboarding completado exitosamente')
  console.log('═'.repeat(60))
  console.log(`  Empresa:    ${tenant.name}`)
  console.log(`  Tenant ID:  ${tenant.id}`)
  console.log(`  Slug:       ${tenant.slug}`)
  console.log(`  Sucursales: ${sucursales.length}`)
  console.log(`  Usuarios:   ${createdUsers} creados, ${updatedUsers} actualizados`)
  console.log(`  Productos:  ${productos.length}`)
  console.log(`  Stock:      ${stockInicial.length} registros`)
  console.log(`  Proveedores:${proveedores.length}`)
  console.log(`  Módulos:    ${[...modulosActivos].join(', ') || 'ninguno'}`)
  console.log('═'.repeat(60))
  console.log('\n⚠️  Próximos pasos:')
  console.log('  1. Enviar emails de invitación a cada usuario (contienen su contraseña temporal)')
  console.log('  2. Conectar integraciones de WhatsApp / Gmail si aplica')
  console.log('  3. Verificar datos en Prisma Studio: pnpm --filter @nexor/api db:studio')
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log('\n🚀 NEXOR — Script de onboarding de clientes')
  console.log(`   Archivo: ${filePath}`)
  console.log(`   Módulos extra (CLI): ${modulesExtra.join(', ') || 'ninguno'}`)
  console.log(`   Base de datos: ${process.env['DATABASE_URL']?.replace(/:([^@]+)@/, ':***@') ?? 'DATABASE_URL no definida'}`)

  console.log('\n📖 Leyendo Excel...')
  let data: ExcelParsed
  try {
    data = await parseExcel(filePath)
  } catch (err) {
    console.error(`\n❌ Error al leer el Excel: ${(err as Error).message}`)
    process.exit(1)
  }

  console.log('   ✅ Excel leído correctamente')
  console.log(`   Empresa: ${data.empresa.nombreComercial || '(vacío)'}`)
  console.log(`   Sucursales: ${data.sucursales.length}`)
  console.log(`   Usuarios: ${data.usuarios.length}`)
  console.log(`   Productos: ${data.productos.length}`)
  console.log(`   Stock inicial: ${data.stockInicial.length} registros`)
  console.log(`   Proveedores: ${data.proveedores.length}`)

  console.log('\n🔍 Validando datos...')
  const errors = validate(data)

  if (errors.length > 0) {
    console.error(`\n❌ Se encontraron ${errors.length} error(es) de validación. No se escribió nada en la base de datos.\n`)
    errors.forEach((e, i) => console.error(`   ${i + 1}. ${e}`))
    console.error('\n   Corrige el Excel y vuelve a ejecutar el script.\n')
    process.exit(1)
  }

  console.log('   ✅ Validación exitosa — sin errores')
  console.log('\n📝 Escribiendo en la base de datos...')

  await seed(data, modulesExtra)
}

main()
  .catch((e) => {
    console.error('\n❌ Error inesperado:', (e as Error).message)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
