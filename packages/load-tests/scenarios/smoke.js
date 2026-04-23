/**
 * Smoke test — HU-092
 *
 * Prueba rápida (2 minutos, 3 VUs) para verificar que todos los endpoints
 * responden correctamente antes de lanzar el test de carga completo.
 *
 * Criterios:
 *   - Todos los endpoints responden < 1 segundo
 *   - Tasa de error 0%
 *
 * Cómo ejecutar:
 *   k6 run packages/load-tests/scenarios/smoke.js
 *   k6 run --env BASE_URL=https://staging.nexor.app packages/load-tests/scenarios/smoke.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js'
import { login, authHeaders, safeJson } from '../utils/helpers.js'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001'
const PASSWORD = 'LoadTest2024!'

export const options = {
  vus:      3,
  duration: '2m',
  thresholds: {
    'http_req_duration': ['p(95)<1000'],
    'http_req_failed':   ['rate==0'],
  },
}

// Datos compartidos entre VUs (inicializados en setup para evitar logins repetidos)
export function setup() {
  const token = login(BASE_URL, 'admin01@load-test.nexor.co', PASSWORD)
  const headers = authHeaders(token)

  const productsRes = http.get(`${BASE_URL}/v1/kira/products?limit=1`, { headers })
  const products    = safeJson(productsRes).data || []

  const branchesRes = http.get(`${BASE_URL}/v1/branches`, { headers })
  const branches    = safeJson(branchesRes).data || []

  return {
    token,
    productId: products[0]?.id || null,
    branchId:  branches[0]?.id || null,
  }
}

export default function (data) {
  const headers = authHeaders(data.token)
  const now     = new Date().getFullYear()

  // ── 1. KIRA stock ───────────────────────────────────────────────────────────
  {
    const res = http.get(`${BASE_URL}/v1/kira/stock`, { headers })
    check(res, {
      'GET /kira/stock — 200':   (r) => r.status === 200,
      'GET /kira/stock — < 1s':  (r) => r.timings.duration < 1000,
    })
  }

  // ── 2. KIRA movimiento ──────────────────────────────────────────────────────
  if (data.productId && data.branchId) {
    const res = http.post(
      `${BASE_URL}/v1/kira/stock/movements`,
      JSON.stringify({
        type:      'ajuste',
        productId: data.productId,
        branchId:  data.branchId,
        quantity:  1,
        notes:     'Smoke test',
      }),
      { headers },
    )
    check(res, {
      'POST /kira/movements — 201': (r) => r.status === 201,
      'POST /kira/movements — < 1s':(r) => r.timings.duration < 1000,
    })
  }

  // ── 3. ARI deals ────────────────────────────────────────────────────────────
  {
    const res = http.get(`${BASE_URL}/v1/ari/pipeline/deals`, { headers })
    check(res, {
      'GET /ari/pipeline/deals — 200':  (r) => r.status === 200,
      'GET /ari/pipeline/deals — < 1s': (r) => r.timings.duration < 1000,
    })
  }

  // ── 4. VERA summary ─────────────────────────────────────────────────────────
  {
    const res = http.get(
      `${BASE_URL}/v1/vera/reports/summary?from=${now}-01-01&to=${now}-12-31`,
      { headers },
    )
    check(res, {
      'GET /vera/reports/summary — 200':  (r) => r.status === 200,
      'GET /vera/reports/summary — < 1s': (r) => r.timings.duration < 1000,
    })
  }

  // ── 5. Dashboard KPIs ───────────────────────────────────────────────────────
  {
    const res = http.get(`${BASE_URL}/v1/dashboard/kpis`, { headers })
    check(res, {
      'GET /dashboard/kpis — 200':  (r) => r.status === 200,
      'GET /dashboard/kpis — < 1s': (r) => r.timings.duration < 1000,
    })
  }

  sleep(1)
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  }
}
