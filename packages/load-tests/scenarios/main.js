/**
 * Escenario principal de load testing — HU-092
 *
 * Simula 15 tenants usando NEXOR simultáneamente con 5 VUs cada uno (75 VUs en total).
 *
 * Estructura del test:
 *   - 1 minuto de ramp-up: 0 → 75 VUs
 *   - 5 minutos de carga sostenida: 75 VUs
 *   - 30 segundos de ramp-down: 75 → 0 VUs
 *   Total: ~6.5 minutos de ejecución
 *
 * Cómo ejecutar:
 *   k6 run packages/load-tests/scenarios/main.js
 *   k6 run --env BASE_URL=https://staging.nexor.app packages/load-tests/scenarios/main.js
 *
 * Prerequisito:
 *   pnpm --filter @nexor/load-tests seed   ← crea los 15 tenants de prueba con datos representativos
 */

import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { Rate, Trend } from 'k6/metrics'
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/2.4.0/dist/bundle.js'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js'
import { login, authHeaders, checkOk, safeJson, pick } from '../utils/helpers.js'

// ─── Configuración ────────────────────────────────────────────────────────────

const BASE_URL  = __ENV.BASE_URL  || 'http://localhost:3001'
const TENANTS   = 15
const VUS_PER   = 5   // VUs por tenant
const PASSWORD  = 'LoadTest2024!'

// ─── Métricas personalizadas ──────────────────────────────────────────────────

const errorRate = new Rate('errors')

const trendStock      = new Trend('duration_kira_stock',    true)
const trendMovement   = new Trend('duration_kira_movement', true)
const trendDeals      = new Trend('duration_ari_deals',     true)
const trendVera       = new Trend('duration_vera_summary',  true)
const trendDashboard  = new Trend('duration_dashboard_kpis',true)
const trendChat       = new Trend('duration_chat_message',  true)

// ─── Opciones de k6 ──────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    carga_sostenida: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '1m',  target: TENANTS * VUS_PER },   // ramp-up
        { duration: '5m',  target: TENANTS * VUS_PER },   // carga sostenida
        { duration: '30s', target: 0 },                    // ramp-down
      ],
      gracefulRampDown: '30s',
    },
  },

  thresholds: {
    // SLA global: p95 < 2s, tasa de error < 1%
    'http_req_failed':            ['rate<0.01'],
    'errors':                     ['rate<0.01'],

    // Por endpoint — todos deben cumplir p95 < 2 segundos (excepto chat)
    'duration_kira_stock':        ['p(95)<2000'],
    'duration_kira_movement':     ['p(95)<2000'],
    'duration_ari_deals':         ['p(95)<2000'],
    'duration_vera_summary':      ['p(95)<2000'],
    'duration_dashboard_kpis':    ['p(95)<2000'],
    // Chat invoca Claude API — SLA separado: p95 < 30 segundos
    'duration_chat_message':      ['p(95)<30000'],
  },
}

// ─── Setup — autentica 15 tenants y obtiene datos de prueba ──────────────────
// Corre UNA VEZ antes de que empiecen los VUs. Su valor de retorno se pasa
// a todos los VUs como primer argumento de default().

export function setup() {
  console.log(`[setup] Autenticando ${TENANTS} tenants contra ${BASE_URL}...`)
  const tenants = []

  for (let i = 1; i <= TENANTS; i++) {
    const pad   = String(i).padStart(2, '0')
    const email = `admin${pad}@load-test.nexor.co`

    let token
    try {
      token = login(BASE_URL, email, PASSWORD)
    } catch (err) {
      console.error(`[setup] No se pudo autenticar ${email}: ${err.message}`)
      continue
    }

    const headers = authHeaders(token)

    // Obtener primer producto del tenant (para movimientos de stock)
    const productsRes = http.get(
      `${BASE_URL}/v1/kira/products?limit=1`,
      { headers, timeout: '10s' },
    )
    const products  = safeJson(productsRes).data || []
    const productId = products[0]?.id || null

    // Obtener primera sucursal del tenant (para movimientos de stock)
    const branchesRes = http.get(
      `${BASE_URL}/v1/branches`,
      { headers, timeout: '10s' },
    )
    const branches = safeJson(branchesRes).data || []
    const branchId = branches[0]?.id || null

    if (!productId || !branchId) {
      console.warn(
        `[setup] Tenant ${i}: datos incompletos — productId=${productId}, branchId=${branchId}. ` +
        '¿Ejecutaste el seed de staging?',
      )
    }

    tenants.push({ token, productId, branchId, index: i })
    console.log(
      `[setup] Tenant ${i}: OK — product=${productId?.slice(0, 8) || 'N/A'} branch=${branchId?.slice(0, 8) || 'N/A'}`,
    )
  }

  if (tenants.length === 0) {
    throw new Error(
      '[setup] Ningún tenant disponible. Ejecuta: pnpm --filter @nexor/load-tests seed',
    )
  }

  console.log(`[setup] ${tenants.length}/${TENANTS} tenants listos para el test.`)
  return { tenants }
}

// ─── VU default — lógica de cada usuario virtual ─────────────────────────────
// __VU:   número del VU (1-indexed, 1 a 75)
// __ITER: número de iteración del VU (0-indexed)

// eslint-disable-next-line no-undef
export default function (data) {
  // Asignar VU a un tenant por índice: VU 1-5 → tenant 0, VU 6-10 → tenant 1, etc.
  // eslint-disable-next-line no-undef
  const tenantIdx = Math.floor((__VU - 1) / VUS_PER) % data.tenants.length
  const tenant    = data.tenants[tenantIdx]

  if (!tenant) return   // tenant no autenticado durante el setup — saltear

  const headers = authHeaders(tenant.token)

  // Distribución de carga por endpoint (suma = 100)
  // Los valores reflejan el mix de tráfico real esperado en producción
  const roll = Math.floor(Math.random() * 100)

  if (roll < 30) {
    // ── 30% — KIRA: consulta de stock ─────────────────────────────────────────
    group('kira_stock', () => {
      const res = http.get(
        `${BASE_URL}/v1/kira/stock`,
        { headers, tags: { endpoint: 'kira-stock' } },
      )
      trendStock.add(res.timings.duration)
      const ok = checkOk(res, 'GET /v1/kira/stock')
      if (!ok) errorRate.add(1)
      else errorRate.add(0)
    })

  } else if (roll < 40) {
    // ── 10% — KIRA: registrar movimiento de stock ────────────────────────────
    group('kira_movement', () => {
      if (!tenant.productId || !tenant.branchId) {
        // Sin datos de seed, saltar esta iteración sin contar como error
        return
      }
      const body = JSON.stringify({
        type:      'ajuste',
        productId: tenant.productId,
        branchId:  tenant.branchId,
        quantity:  1,
        notes:     'Ajuste automático de load test',
      })
      const res = http.post(
        `${BASE_URL}/v1/kira/stock/movements`,
        body,
        { headers, tags: { endpoint: 'kira-movement' } },
      )
      trendMovement.add(res.timings.duration)
      const ok = checkOk(res, 'POST /v1/kira/stock/movements')
      if (!ok) errorRate.add(1)
      else errorRate.add(0)
    })

  } else if (roll < 60) {
    // ── 20% — ARI: listar deals del pipeline ─────────────────────────────────
    group('ari_deals', () => {
      const res = http.get(
        `${BASE_URL}/v1/ari/pipeline/deals`,
        { headers, tags: { endpoint: 'ari-deals' } },
      )
      trendDeals.add(res.timings.duration)
      const ok = checkOk(res, 'GET /v1/ari/pipeline/deals')
      if (!ok) errorRate.add(1)
      else errorRate.add(0)
    })

  } else if (roll < 80) {
    // ── 20% — VERA: reporte financiero ───────────────────────────────────────
    group('vera_summary', () => {
      const now   = new Date()
      const year  = now.getFullYear()
      const from  = `${year}-01-01`
      const to    = `${year}-12-31`
      const res   = http.get(
        `${BASE_URL}/v1/vera/reports/summary?from=${from}&to=${to}`,
        { headers, tags: { endpoint: 'vera-summary' } },
      )
      trendVera.add(res.timings.duration)
      const ok = checkOk(res, 'GET /v1/vera/reports/summary')
      if (!ok) errorRate.add(1)
      else errorRate.add(0)
    })

  } else if (roll < 95) {
    // ── 15% — Dashboard: KPIs ejecutivos ─────────────────────────────────────
    group('dashboard_kpis', () => {
      const res = http.get(
        `${BASE_URL}/v1/dashboard/kpis`,
        { headers, tags: { endpoint: 'dashboard-kpis' } },
      )
      trendDashboard.add(res.timings.duration)
      const ok = checkOk(res, 'GET /v1/dashboard/kpis')
      if (!ok) errorRate.add(1)
      else errorRate.add(0)
    })

  } else {
    // ── 5% — Chat: mensaje al agente IA ──────────────────────────────────────
    // Frecuencia baja — llama a Claude API (caro y lento por diseño)
    group('chat_message', () => {
      const questions = [
        '¿Cuántos productos tenemos en stock?',
        '¿Cuál es el resumen de ventas de este mes?',
        '¿Hay órdenes de compra pendientes de aprobación?',
      ]
      const res = http.post(
        `${BASE_URL}/v1/chat/message`,
        JSON.stringify({ message: pick(questions) }),
        { headers, tags: { endpoint: 'chat' }, timeout: '35s' },
      )
      trendChat.add(res.timings.duration)
      const ok = checkOk(res, 'POST /v1/chat/message')
      if (!ok) errorRate.add(1)
      else errorRate.add(0)
    })
  }

  // Pausa realista entre requests: 0.5 a 1.5 segundos
  sleep(0.5 + Math.random())
}

// ─── Resumen al finalizar ─────────────────────────────────────────────────────
// Genera reporte HTML + JSON y muestra el resumen en consola.

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const htmlFile  = `packages/load-tests/results/report-${timestamp}.html`
  const jsonFile  = `packages/load-tests/results/summary-${timestamp}.json`

  return {
    [htmlFile]:  htmlReport(data),
    [jsonFile]:  JSON.stringify(data, null, 2),
    stdout:      textSummary(data, { indent: ' ', enableColors: true }),
  }
}
