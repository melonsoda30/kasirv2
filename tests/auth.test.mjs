import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Execute the existing browser TypeScript with Node's test runner, without
// adding a test framework or contacting the live authentication server.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) specifier = new URL(`../src/${specifier.slice(2)}`, import.meta.url).href
    if (specifier.startsWith('file:')) {
      for (const extension of ['.ts', '.tsx']) {
        if (existsSync(fileURLToPath(specifier) + extension)) return nextResolve(specifier + extension, context)
      }
    }
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier, context.parentURL)
      for (const extension of ['.ts', '.tsx']) {
        if (existsSync(fileURLToPath(url) + extension)) return nextResolve(url.href + extension, context)
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (/\.tsx?$/.test(url) && !url.includes('/node_modules/')) {
      const source = readFileSync(new URL(url), 'utf8').replaceAll('import.meta.env', '({})')
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX },
      }).outputText }
    }
    return nextLoad(url, context)
  },
})

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}
globalThis.localStorage = new MemoryStorage()
globalThis.sessionStorage = new MemoryStorage()

const { useAuthStore, getAuthSession, getAccountBranches, safeRedirect } = await import('../src/features/auth/auth-store.ts')
const { api } = await import('../src/lib/api.ts')
const { login } = await import('../src/features/auth/login.ts')
const { AxiosError } = await import('axios')

test('login contract, bearer headers, remembered sessions, expiry and unauthorized responses', async () => {
  assert.equal(getAuthSession(), null)
  let sent
  const response = { status: 'success', data: {
    user: { id: '1', img: '../data-assets/upload/users/profile.jpg', username: 'tester', fullname: 'Test User',
      email: 'admin@example.com', phone: '081234567890', address: 'Jakarta Pusat', level: 'Administrator', level_slug: 'admin', role: 'admin' },
    store: { id: 'EVT-001', name: 'Bazar Kemang 2026', city: 'Jakarta Selatan', address: 'Jl. Kemang Raya No. 12',
      all_branches: true, branch_id: 'all', branches: [
        { id: 'BC-001', name: 'Bazar Kemang - Loka 1' },
        { id: 'BC-002', name: 'Bazar Kemang - Loka 2' },
      ] },
    token: 'test-token-only', expired: 1,
  } }
  api.defaults.adapter = async (config) => {
    sent = config
    return { config, status: 200, statusText: 'OK', headers: {}, data: response }
  }
  const session = await login(' tester ', 'test-password')
  assert.equal(sent.url, '/login.php')
  assert.equal(sent.method, 'post')
  assert.equal(sent.baseURL, 'https://kasirv2.dhcsupplement.co.id/API')
  assert.deepEqual(Object.fromEntries(sent.data.entries()), {
    action: 'login', username: 'tester', password: 'test-password',
  })
  assert.equal(sent.headers.get('Authorization'), undefined)
  assert.ok(Math.abs(session.expiresAt - Date.now() - 86_400_000) < 1000)
  response.data.access = {
    token: 'test-access-token', type: 'Bearer', expires_at: '2026-11-19 10:55:49',
    expires_in: 3600, session_id: 'test-session',
  }
  response.data.refresh = {
    token: 'test-refresh-token', expires_at: '2026-12-19 09:55:50', expires_in: 2_592_000,
  }
  const updatedSession = await login('tester', 'test-password')
  assert.equal(updatedSession.token, 'test-access-token')
  assert.equal(updatedSession.sessionId, 'test-session')
  assert.ok(Math.abs(updatedSession.expiresAt - Date.now() - 3_600_000) < 1000)
  assert.equal(updatedSession.refresh.token, 'test-refresh-token')
  assert.equal(updatedSession.refresh.expiresAt - updatedSession.expiresAt, 2_588_400_000)
  assert.equal(session.account.account_id, '1')
  assert.equal(session.account.event_id, 'EVT-001')
  assert.equal(session.account.event_location, 'Bazar Kemang 2026')
  assert.equal(session.account.account_role, 'admin')
  assert.equal(session.account.event_level, 'admin')
  assert.equal(session.account.account_email, 'admin@example.com')
  assert.equal(session.account.store.branch_id, 'all')
  assert.deepEqual(getAccountBranches(session.account.store), [
    { id: 'BC-001', name: 'Bazar Kemang - Loka 1' },
    { id: 'BC-002', name: 'Bazar Kemang - Loka 2' },
  ])
  assert.deepEqual(getAccountBranches({
    ...session.account.store, branches: { id: 'all', name: ['BC-001'] },
  }), [{ id: 'BC-001', name: 'BC-001' }])
  assert.equal('token' in session.account, false)

  useAuthStore.getState().setSession(session, false)
  assert.equal(localStorage.values.size, 0)
  assert.equal(sessionStorage.values.size, 1)
  assert.equal([...sessionStorage.values.values()][0].includes('test-password'), false)
  await api.get('/protected-test')
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token-only')
  useAuthStore.getState().setSession(updatedSession, false)
  await api.get('/protected-test')
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-access-token')
  await login('tester', 'test-password')
  assert.equal(sent.headers.get('Authorization'), undefined)

  useAuthStore.getState().setSession(session, true)
  assert.equal(localStorage.values.size, 1)
  assert.equal(sessionStorage.values.size, 0)
  useAuthStore.getState().setSession({ ...session, expiresAt: Date.now() - 1 }, true)
  assert.equal(getAuthSession(), null)
  assert.equal(localStorage.values.size, 0)

  useAuthStore.getState().setSession(session, true)
  api.defaults.adapter = async (config) => {
    throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined,
      { config, status: 401, statusText: 'Unauthorized', headers: {}, data: {} })
  }
  await assert.rejects(login('tester', 'incorrect'))
  assert.ok(getAuthSession(), 'A failed login must not clear an existing session')
  await assert.rejects(api.get('/protected-test'))
  assert.equal(getAuthSession(), null)
  assert.equal(localStorage.values.size, 0)

  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { message: 'Invalid credentials' } })
  await assert.rejects(login('tester', 'incorrect'), /Invalid credentials/)
  assert.equal(getAuthSession(), null)
})

test('session refresh rotates once for concurrent 401s and replays requests with the new access token', async () => {
  const account = { account_id: '1', account_username: 'tester', account_role: 'admin', event_id: 'EVT-001',
    store: { id: 'EVT-001', all_branches: true, branch_id: 'all', branches: [{ id: 'BC-001' }, { id: 'BC-002' }] } }
  const nextStore = { ...account.store, name: 'Toko', branches: [{ id: 'BC-002', name: 'Cabang 2' }] }
  const payload = { status: 'success', data: {
    user: { id: '1', username: 'tester', fullname: 'Nama baru', level: 'Administrator', level_slug: 'admin', role: 'admin' },
    store: nextStore, token: 'new-access', expired: 30,
    access: { token: 'new-access', expires_in: 3600, session_id: 'same-session' },
    refresh: { token: 'new-refresh', expires_in: 2592000 },
  } }
  const session = { account, token: 'old-access', expiresAt: Date.now() + 60_000, sessionId: 'same-session',
    refresh: { token: 'old-refresh', expiresAt: Date.now() + 120_000 }, adminBranchId: 'BC-001', cashierBranchId: 'BC-002' }
  useAuthStore.getState().setSession(session, true)
  let rotations = 0
  const attempts = []
  function unauthorized(config) {
    return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined,
      { config, status: 401, headers: {}, data: {} })
  }
  api.defaults.adapter = async (config) => {
    const authorization = config.headers.get('Authorization')
    if (config.url === '/login.php') {
      rotations++
      assert.equal(config.method, 'post')
      assert.equal(authorization, undefined)
      assert.deepEqual(Object.fromEntries(config.data), { action: 'refresh', refresh_token: 'old-refresh' })
      return { config, status: 200, headers: {}, data: payload }
    }
    attempts.push([config.url, authorization])
    if (authorization === 'Bearer old-access') throw unauthorized(config)
    if (config.url === '/second') assert.equal(config.data.get('quantity'), '2')
    return { config, status: 200, headers: {}, data: {} }
  }
  try {
    const data = new FormData()
    data.set('quantity', '2')
    await Promise.all([api.get('/first'), api.post('/second', data)])
    assert.equal(rotations, 1)
    for (const url of ['/first', '/second']) {
      assert.deepEqual(attempts.filter(([path]) => path === url), [[url, 'Bearer old-access'], [url, 'Bearer new-access']])
    }
    const rotated = getAuthSession()
    assert.equal(rotated.sessionId, 'same-session')
    assert.equal(rotated.remainingDays, 30)
    assert.equal(rotated.refresh.token, 'new-refresh')
    assert.equal(rotated.account.account_fullname, 'Nama baru')
    assert.equal(rotated.adminBranchId, undefined)
    assert.equal(rotated.cashierBranchId, 'BC-002')
    assert.deepEqual(JSON.parse(localStorage.getItem('kasirv2.auth')), rotated)
    assert.equal(sessionStorage.getItem('kasirv2.auth'), null)

    useAuthStore.getState().setSession({ ...session, expiresAt: Date.now() - 1 }, false)
    assert.ok(getAuthSession(), 'expired access can be restored with a valid refresh token')
    attempts.length = 0
    await api.get('/first')
    assert.equal(rotations, 2)
    assert.deepEqual(attempts, [['/first', 'Bearer new-access']])
    assert.equal(JSON.parse(sessionStorage.getItem('kasirv2.auth')).refresh.token, 'new-refresh')

    useAuthStore.getState().setSession({ ...session, expiresAt: Date.now() - 1 }, false)
    api.defaults.adapter = async () => { throw new AxiosError('Network error', 'ERR_NETWORK') }
    await assert.rejects(api.get('/first'), /Network error/)
    assert.equal(getAuthSession().refresh.token, 'old-refresh')

    useAuthStore.getState().setSession(session, false)
    api.defaults.adapter = async (config) => { throw unauthorized(config) }
    await assert.rejects(api.get('/first'))
    assert.equal(getAuthSession(), null)
    assert.equal(sessionStorage.getItem('kasirv2.auth'), null)
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('logout clears the local session and revokes a token rotated by a pending refresh', async () => {
  const { logoutSession, refreshAuthSession } = await import('../src/lib/api.ts')
  const account = { account_id: '1', account_username: 'tester' }
  const session = { account, token: 'old-access', expiresAt: Date.now() + 60_000,
    refresh: { token: 'old-refresh', expiresAt: Date.now() + 120_000 }, sessionId: 'same-session' }
  useAuthStore.getState().setSession(session, false)
  let finishRefresh
  const waitForLogout = new Promise(resolve => { finishRefresh = resolve })
  const requests = []
  api.defaults.adapter = async (config) => {
    const action = config.data.get('action')
    requests.push([config.url, action, config.headers.get('Authorization')])
    if (action === 'refresh') {
      await waitForLogout
      return { config, status: 200, headers: {}, data: { status: 'success', data: {
        user: { id: '1', username: 'tester' }, store: { id: 'EVT-001' },
        access: { token: 'new-access', expires_in: 3600, session_id: 'same-session' },
        refresh: { token: 'new-refresh', expires_in: 86400 },
      } } }
    }
    return { config, status: 200, headers: {}, data: { status: 'success' } }
  }
  const refreshing = refreshAuthSession(true)
  const logout = logoutSession()
  assert.equal(getAuthSession(), null)
  finishRefresh()
  await Promise.all([refreshing, logout])
  await logoutSession()
  assert.equal(getAuthSession(), null)
  assert.equal(sessionStorage.getItem('kasirv2.auth'), null)
  assert.deepEqual(requests, [['/login.php', 'refresh', undefined], ['/login.php', 'logout', 'Bearer new-refresh']])
})

test('return paths accept internal pages and reject external destinations', () => {
  assert.equal(safeRedirect('/produk?search=kopi'), '/produk?search=kopi')
  for (const path of ['https://example.com', '//example.com', '/\\example.com', '/login?redirect=/profil', '/login/', '/profil/../login', undefined]) {
    assert.equal(safeRedirect(path), '/')
  }
})

test('all current pages redirect unauthenticated visitors, while login stays public', async () => {
  const { Route } = await import('../src/routes/__root.tsx')
  useAuthStore.getState().clearSession()
  for (const pathname of ['/', '/produk', '/produk/tambah', '/produk/1/edit', '/penjualan', '/stok', '/profil', '/profil/ganti-password', '/users', '/users/tambah', '/users/3', '/order', '/cart', '/sesi-kas']) {
    assert.throws(() => Route.options.beforeLoad({ location: { pathname, href: pathname } }),
      (error) => error.options.to === '/login' && error.options.search.redirect === pathname)
  }
  assert.doesNotThrow(() => Route.options.beforeLoad({ location: { pathname: '/login', href: '/login' } }))
  useAuthStore.getState().setSession({ account: { account_username: 'tester' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  assert.doesNotThrow(() => Route.options.beforeLoad({
    location: { pathname: '/profil', href: '/profil' },
    matches: [{ routeId: '__root__' }, { routeId: '/profil' }],
  }))
  useAuthStore.getState().clearSession()
})

const adminBranches = {
  all_branches: true, branch_id: 'all', branches: [
    { id: 'BC-001', name: 'Cabang 1' }, { id: 'BC-002', name: 'Cabang 2' },
  ],
}

test('the root guard grants administrators full access and restricts cashiers to their operational routes', async () => {
  const { Route } = await import('../src/routes/__root.tsx')
  const session = {
    account: { account_id: '1', account_username: 'tester', event_level: 'kasir' },
    token: 'test-token-only', expiresAt: Date.now() + 60_000,
  }
  const operational = [
    ['/', '/'], ['/order', '/order'], ['/cart', '/cart'], ['/penjualan', '/penjualan'], ['/sesi-kas', '/sesi-kas'],
    ['/stok', '/stok'], ['/profil', '/profil'], ['/profil/edit', '/profil_/edit'],
    ['/profil/ganti-password', '/profil_/ganti-password'], ['/payment/order-1', '/payment/$orderId'],
  ]
  const administrative = [
    ['/produk', '/produk'], ['/produk/tambah', '/produk_/tambah'],
    ['/produk/menu-1/edit', '/produk_/$productId/edit'],
    ['/users', '/users'], ['/users/3', '/users_/$userId'], ['/users/tambah', '/users_/tambah'],
    ['/store', '/store'], ['/settings', '/settings'], ['/settings/shift', '/settings_/shift'],
    ['/settings/ppn', '/settings_/ppn'], ['/settings/pembayaran', '/settings_/pembayaran'],
  ]
  const open = ([pathname, routeId]) => Route.options.beforeLoad({
    location: { pathname, href: pathname },
    matches: [{ routeId: '__root__' }, { routeId }],
  })
  try {
    useAuthStore.getState().setSession(session, false)
    for (const route of operational) assert.doesNotThrow(() => open(route))
    for (const route of administrative) {
      assert.throws(() => open(route), (error) => error.options.to === '/' && error.options.replace)
    }

    useAuthStore.getState().setSession({ ...session, account: { ...session.account, event_level: 'administrator', store: adminBranches } }, false)
    for (const route of [...operational, ...administrative]) assert.doesNotThrow(() => open(route))
    assert.equal(useAuthStore.getState().setCashierBranch('BC-001'), true)
    for (const route of [...operational, ...administrative]) assert.doesNotThrow(() => open(route))

    useAuthStore.getState().setSession({ ...session, account: { ...session.account, event_level: 'unknown' } }, false)
    assert.throws(() => open(['/store', '/store']), (error) => error.options.to === '/profil')
    assert.doesNotThrow(() => open(['/profil/edit', '/profil_/edit']))
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('the legacy order route points cashiers to their home and stays available to administrators', async () => {
  const { Route } = await import('../src/routes/order.tsx')
  const session = {
    account: { account_id: '1', account_username: 'tester', event_level: ' KASIR ' },
    token: 'test-token-only', expiresAt: Date.now() + 60_000,
  }
  try {
    useAuthStore.getState().setSession(session, false)
    assert.throws(() => Route.options.beforeLoad(), (error) => error.options.to === '/' && error.options.replace)
    assert.throws(() => Route.options.beforeLoad({ search: { edit: 'TRX-1', session: 'SES-1' } }),
      (error) => error.options.search.edit === 'TRX-1' && error.options.search.session === 'SES-1')
    useAuthStore.getState().setSession({ ...session, account: { ...session.account, event_level: 'administrator', store: adminBranches } }, false)
    assert.doesNotThrow(() => Route.options.beforeLoad())
    assert.equal(useAuthStore.getState().setCashierBranch('BC-001'), true)
    assert.throws(() => Route.options.beforeLoad(), (error) => error.options.to === '/' && error.options.replace)
    useAuthStore.getState().setCashierBranch()
    assert.doesNotThrow(() => Route.options.beforeLoad())
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('admin branch selection is required per login and independent of cashier mode', async () => {
  const { getAdminBranch, getAdminBranches, getCashierBranch, getSuggestedAdminBranch, isAdminMode } = await import('../src/features/auth/auth-store.ts')
  const { setSession, setAdminBranch, setCashierBranch, replaceSessionTokens, clearSession } = useAuthStore.getState()
  const account = { account_id: 'branch-admin', account_username: 'branch-admin', account_role: 'admin', event_level: 'administrator', store: adminBranches }
  const session = { account, token: 'branch-admin-token', expiresAt: Date.now() + 60_000 }
  try {
    setSession(session, false)
    assert.equal(isAdminMode(getAuthSession()), true)
    assert.equal(getAdminBranch(getAuthSession()), undefined)
    assert.deepEqual(getAdminBranches(account).map(({ id }) => id), ['all', 'BC-001', 'BC-002'])
    assert.equal(setAdminBranch('all'), true)
    assert.equal(getAdminBranch(getAuthSession())?.name, 'Semua cabang')
    assert.equal(JSON.parse(sessionStorage.getItem('kasirv2.auth')).adminBranchId, 'all')
    assert.equal(setAdminBranch('OTHER'), false)
    assert.equal(setAdminBranch('BC-002'), true)
    assert.equal(getAdminBranch(getAuthSession())?.id, 'BC-002')
    assert.equal(JSON.parse(sessionStorage.getItem('kasirv2.auth')).adminBranchId, 'BC-002')
    assert.equal(getAuthSession().account.store.branch_id, 'all')
    assert.equal(setCashierBranch('BC-001'), true)
    assert.equal(isAdminMode(getAuthSession()), false)
    assert.equal(getAdminBranch(getAuthSession()), undefined)
    assert.equal(getCashierBranch(getAuthSession())?.id, 'BC-001')
    assert.equal(setAdminBranch('all'), false)
    assert.equal(replaceSessionTokens(session.token, { token: 'branch-admin-new-token', expiresAt: session.expiresAt }), true)
    assert.equal(getAuthSession().adminBranchId, 'BC-002')
    assert.equal(getCashierBranch(getAuthSession())?.id, 'BC-001')
    assert.equal(setCashierBranch(), true)
    assert.equal(getAdminBranch(getAuthSession())?.id, 'BC-002')
    assert.equal(setAdminBranch('all'), true)

    clearSession()
    setSession(session, true)
    assert.equal(getAdminBranch(getAuthSession()), undefined)
    assert.equal(getSuggestedAdminBranch(account)?.id, 'all')
    const restricted = { ...account, store: { ...account.store, all_branches: false, branch_id: 'BC-001' } }
    assert.deepEqual(getAdminBranches(restricted).map(({ id }) => id), ['BC-001'])
    setSession({ ...session, account: restricted }, true)
    assert.equal(getSuggestedAdminBranch(restricted)?.id, 'BC-001')
    assert.equal(setAdminBranch('all'), false)
    assert.equal(setAdminBranch('BC-002'), false)
    assert.equal(setAdminBranch('BC-001'), true)
    assert.equal(JSON.parse(localStorage.getItem('kasirv2.auth')).adminBranchId, 'BC-001')
  } finally {
    clearSession()
  }
})

test('admin cashier mode requires an assigned branch and keeps the account on token replacement', async () => {
  const { orderOwner, useOrderStore } = await import('../src/features/orders/order-store.ts')
  const { cashSessionAllowsSales } = await import('../src/features/cash-session/cash-session-query.ts')
  const { setSession, setCashierBranch, replaceSessionTokens, clearSession } = useAuthStore.getState()
  const account = { account_id: '1', account_username: 'admin', account_role: 'admin', event_level: 'administrator', store: adminBranches }
  const session = { account, token: 'original-token', expiresAt: Date.now() + 60_000 }
  try {
    setSession(session, true)
    assert.equal(setCashierBranch('all'), false)
    assert.equal(setCashierBranch('OTHER'), false)
    assert.equal(setCashierBranch('BC-001'), true)
    assert.deepEqual(getAuthSession(), { ...session, cashierBranchId: 'BC-001' })
    assert.equal(JSON.parse(localStorage.getItem('kasirv2.auth')).cashierBranchId, 'BC-001')

    assert.equal(replaceSessionTokens(session.token, { token: 'new-token', expiresAt: session.expiresAt }), true)
    assert.equal(getAuthSession().cashierBranchId, 'BC-001')
    assert.deepEqual(getAuthSession().account, account)

    const { initialize, createOrder } = useOrderStore.getState()
    initialize(orderOwner(getAuthSession()))
    const draftId = createOrder()
    setCashierBranch('BC-002')
    initialize(orderOwner(getAuthSession()))
    assert.equal(useOrderStore.getState().orders.length, 0)
    setCashierBranch('BC-001')
    initialize(orderOwner(getAuthSession()))
    assert.equal(useOrderStore.getState().activeId, draftId)

    const shift = { use_session: true, session: { status: 'open', branch_id: 'BC-001' } }
    assert.equal(cashSessionAllowsSales(shift, 'BC-001'), true)
    assert.equal(cashSessionAllowsSales(shift, 'BC-002'), false)
    assert.equal(cashSessionAllowsSales({ use_session: false }, 'BC-002'), true)

    clearSession()
    assert.equal(localStorage.getItem('kasirv2.auth'), null)
    setSession(session, false)
    assert.equal(getAuthSession().cashierBranchId, undefined)
  } finally {
    clearSession()
  }
})

test('the add-user page allows administrators and redirects cashiers to the users list', async () => {
  const { Route } = await import('../src/routes/users_.tambah.tsx')
  const account = { account_id: '1', account_username: 'tester', account_role: 'kasir' }
  const session = { account, token: 'test-token-only', expiresAt: Date.now() + 60_000 }
  try {
    useAuthStore.getState().setSession(session, false)
    assert.throws(() => Route.options.beforeLoad(), (error) => error.options.to === '/users')
    useAuthStore.getState().setSession({ ...session, account: { ...account, account_role: '', event_level: 'administrator' } }, false)
    assert.doesNotThrow(() => Route.options.beforeLoad())
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('list_user returns user IDs and store assignments for cashiers and administrators', async () => {
  const { fetchUsers } = await import('../src/features/users/users-api.ts')
  const cashier = {
    user_store_name: 'Bazar Kemang 2026', user_store_id: 'EVT-001', user_branch_id: 'BC-002',
    user_fullname: 'Kasir Kemang Loka 2', user_id: '3', user_username: 'kasir02',
    user_email: 'kasir02@kasir.test', user_phone: '081300000000', user_address: 'Jl. Kemang Raya No. 12',
    user_foto: '../data-assets/upload/users/profile.jpg', user_level: 'Kasir', user_level_slug: 'kasir',
    user_role: 'kasir', user_status: 'active', is_cashier: true,
  }
  const owner = {
    ...cashier, user_id: '1', user_fullname: 'Owner Bazar Kemang', user_branch_id: 'all',
    user_username: 'admin', user_level: 'Administrator', user_level_slug: 'administrator',
    user_role: 'admin', is_cashier: false,
  }
  const signal = new AbortController().signal
  let data = [cashier, owner]
  api.defaults.adapter = async (config) => {
    assert.equal(config.url, '/admin/setting')
    assert.equal(config.method, 'get')
    assert.deepEqual(config.params, { action: 'list_user' })
    assert.equal(config.signal, signal)
    return { config, status: 200, headers: {}, data: { status: 'success', msg: 'Successfully Get User', data } }
  }

  assert.deepEqual(await fetchUsers(signal), [cashier, owner])
  data = []
  assert.deepEqual(await fetchUsers(signal), [])
  data = [{ ...cashier, user_id: '' }]
  await assert.rejects(fetchUsers(signal), /ID pengguna/)
})

test('admin user mutations encode optional credentials, branch placement, binary photos, and status changes', async () => {
  const { canManageUsers, changeUser } = await import('../src/features/users/users-api.ts')
  assert.equal(canManageUsers({ account_role: '', event_level: 'administrator' }), true)
  assert.equal(canManageUsers({ account_role: 'kasir', event_level: 'administrator' }), false)
  const session = { account: { account_username: 'tester', account_id: '1' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }
  const photo = new File(['photo'], 'profile.png', { type: 'image/png' })
  const calls = []
  useAuthStore.getState().setSession(session, false)
  try {
    api.defaults.adapter = async (config) => {
      assert.equal(config.url, '/admin/setting')
      assert.equal(config.method, 'post')
      assert.equal(config.headers.get('Authorization'), 'Bearer test-token-only')
      const form = config.data instanceof FormData ? config.data : new URLSearchParams(config.data)
      calls.push(Object.fromEntries(form))
      const created = form.get('action') === 'add_user'
      const status = created ? 201 : 200
      return { config, status, headers: {}, data: {
        status: 'success', data: created ? { user_id: '4', store_id: 'EVT-001', branch_id: 'BC-001' } : undefined,
      } }
    }
    const created = await changeUser({
      action: 'add_user', fields: { username: ' kasir04 ', password: ' test password ', fullname: 'Kasir', branch_id: 'BC-001', is_cashier: true, img: photo },
    })
    assert.equal(created.data.user_id, '4')
    assert.ok(calls[0].img instanceof File)
    assert.equal(calls[0].img.name, 'profile.png')
    assert.equal(await calls[0].img.text(), 'photo')
    delete calls[0].img
    await changeUser({ action: 'add_user', fields: { username: 'admin04', level_user: 'Administrator' } })
    const fields = {
      username: 'admin04', fullname: 'Admin', email: 'admin04@kasir.test', phone: '081300000000',
      address: '', level_user: 'Administrator', is_cashier: false,
    }
    await changeUser({ action: 'edit_user', userId: '4', fields: { ...fields, branch_id: '' } })
    await changeUser({ action: 'edit_user', userId: '4', fields: { ...fields, branch_id: ' BC-002 ' } })
    await changeUser({ action: 'status_user', userId: '4', status: 'noactive' })
    await changeUser({ action: 'status_user', userId: '4', status: 'active' })
    assert.deepEqual(calls, [
      { action: 'add_user', username: 'kasir04', fullname: 'Kasir', is_cashier: '1', password: ' test password ', branch_id: 'BC-001' },
      { action: 'add_user', username: 'admin04', level_user: 'Administrator' },
      { action: 'edit_user', user_id: '4', ...fields, is_cashier: '0', branch_id: '' },
      { action: 'edit_user', user_id: '4', ...fields, is_cashier: '0', branch_id: 'BC-002' },
      { action: 'status_user', user_id: '4', status: 'noactive' },
      { action: 'status_user', user_id: '4', status: 'active' },
    ])

    for (const [change, msg] of [
      [{ action: 'add_user', fields: { username: 'taken' } }, 'Username sudah dipakai'],
      [{ action: 'add_user', fields: { username: 'other', branch_id: 'OTHER' } }, 'Branch tidak terdaftar di store ini'],
      [{ action: 'status_user', userId: '1', status: 'noactive' }, 'Tidak bisa menonaktifkan diri sendiri'],
    ]) {
      api.defaults.adapter = async (config) => {
        throw new AxiosError('Bad Request', 'ERR_BAD_REQUEST', config, undefined, {
          config, status: 400, statusText: 'Bad Request', headers: {}, data: { status: 'error', msg },
        })
      }
      await assert.rejects(changeUser(change), { message: msg })
    }
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('legacy dashboard endpoints accept independent report periods and daily shift summaries', async () => {
  const { fetchDashboard } = await import('../src/features/dashboard/dashboard-api.ts')
  const summary = {
    mode: 'shift', use_session: true, date: '2026-11-19', sessions: [{ session_id: '1' }],
    count: 2, open_count: 1, total_omzet: 720000, total_cash_in: 450000,
    total_difference: -5000, exceeded_count: 1, cash_tolerance: 5000,
  }
  const chart = {
    labels: ['10/11/26', '11/11/26'],
    datasets: [{ label: 'Earning ', data: [19980, 0], borderColor: '#003994', borderWidth: 1 }],
  }
  const responses = {
    total_earning: {
      period: 'today', granularity: 'day', start_date: '2026-11-24', end_date: '2026-11-24',
      previous_start_date: '2026-11-23', previous_end_date: '2026-11-23',
      labels: ['24/11/26'],
      datasets: [{ label: 'Earning ', data: [0], backgroundColor: '#003994', borderColor: '#003994', borderWidth: 1 }],
      current_earning: 0, previous_earning: 19980, grow: '-100 %',
    },
    profit_statistic: { ...chart, datasets: [{ label: 'Profit ', data: [-500, 0] }] },
    best_sales: [{ sales_nip: '2', sales_foto: null, sales_name: 'Kasir Demo', sales_earning: '19980' }],
    trending_product: {
      period: 'today', granularity: 'day', start_date: '2026-11-24', end_date: '2026-11-24',
      data: [{ product_img: '', product_name: 'Paket Hemat', qty: '2' }],
    },
    session_summary: summary,
  }
  const calls = []
  const signal = new AbortController().signal
  useAuthStore.getState().setSession({
    account: { account_username: 'tester', account_role: 'admin' },
    token: 'test-token-only', expiresAt: Date.now() + 60_000,
  }, false)
  try {
    api.defaults.adapter = async (config) => {
      assert.equal(config.url, '/admin/dashboard.php')
      assert.equal(config.method, 'get')
      assert.equal(config.headers.get('Authorization'), 'Bearer test-token-only')
      assert.equal(config.signal, signal)
      const { action } = config.params
      calls.push(config.params)
      const payload = responses[action]
      return { config, status: 200, headers: {}, data: action === 'best_sales' ? payload : { status: 'success', data: payload } }
    }
    assert.deepEqual(await fetchDashboard('total_earning', signal), responses.total_earning)
    assert.deepEqual(await fetchDashboard('profit_statistic', signal), responses.profit_statistic)
    assert.deepEqual(await fetchDashboard('best_sales', signal), [{ ...responses.best_sales[0], sales_earning: 19980 }])
    assert.equal((await fetchDashboard('trending_product', signal)).data[0].qty, 2)
    assert.deepEqual(await fetchDashboard('session_summary', signal), summary)
    const reportActions = ['total_earning', 'profit_statistic', 'best_sales', 'trending_product']
    assert.deepEqual(calls.splice(0), [
      ...reportActions.map((action) => ({ action, period: 'today' })),
      { action: 'session_summary' },
    ])
    responses.total_earning = {
      ...responses.total_earning,
      period: 'month', start_date: '2026-11-01', end_date: '2026-11-30',
      previous_start_date: '2026-10-01', previous_end_date: '2026-10-24',
      labels: Array.from({ length: 30 }, (_, index) => `${String(index + 1).padStart(2, '0')}/11/26`),
      datasets: [{
        ...responses.total_earning.datasets[0],
        data: Array.from({ length: 30 }, (_, index) => ({ 18: 314685, 22: 652445, 23: 204259 })[index] ?? 0),
      }],
      current_earning: 1171389, previous_earning: 0, grow: '0 %',
    }
    assert.deepEqual(await fetchDashboard('total_earning', signal, { period: 'month' }), responses.total_earning)
    const range = { period: 'range', startDate: '2026-01-15', endDate: '2026-06-20' }
    await fetchDashboard('profit_statistic', signal, range)
    await fetchDashboard('best_sales', signal, { period: 'month' })
    responses.trending_product = {
      period: 'year', granularity: 'month', start_date: '2026-01-01', end_date: '2026-12-31',
      data: [
        { product_img: '?v=1795524373', product_name: 'Air Mineral 600ml', qty: '20' },
        { product_img: '?v=1795524373', product_name: 'Keripik Pisang Madu', qty: '15' },
        { product_img: '?v=1795524373', product_name: 'Air Mineral 600ml', qty: '4' },
      ],
    }
    assert.deepEqual(await fetchDashboard('trending_product', signal, { period: 'year' }), {
      ...responses.trending_product,
      data: responses.trending_product.data.map((product) => ({ ...product, qty: Number(product.qty) })),
    })
    await fetchDashboard('session_summary', signal, range)
    assert.deepEqual(calls, [
      { action: 'total_earning', period: 'month' },
      { action: 'profit_statistic', ...range },
      { action: 'best_sales', period: 'month' },
      { action: 'trending_product', period: 'year' },
      { action: 'session_summary' },
    ])
    responses.session_summary = { mode: 'none', use_session: false, sessions: [] }
    assert.equal((await fetchDashboard('session_summary', signal)).use_session, false)
    responses.profit_statistic = []
    assert.equal(await fetchDashboard('profit_statistic', signal), null)
    responses.profit_statistic = { labels: [] }
    await assert.rejects(fetchDashboard('profit_statistic', signal), /Format data dashboard/)
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('dashboard summary returns panels from one report with a separate chart window and shift date', async () => {
  const { fetchDashboard } = await import('../src/features/dashboard/dashboard-api.ts')
  const signal = new AbortController().signal
  const period = {
    period: 'month', start_date: '2026-11-01', end_date: '2026-11-30',
    previous_start_date: '2026-10-01', previous_end_date: '2026-10-25',
  }
  const metric = { value: '290265', previous: 230000, grow: '26,2 %' }
  const sections = {
    kpi: { revenue: metric, trx_count: { value: 5, previous: 4, grow: '25 %' },
      items_sold: { value: 8, previous: 3, grow: '166,7 %' }, aov: { value: 58053, previous: 57500, grow: '1 %' } },
    revenue: {
      chart_start_date: '2026-10-27', chart_end_date: '2026-11-25', chart_granularity: 'day',
      labels: ['27/10/26', '28/10/26'], datasets: [{ label: 'Omzet', data: [0, 11655] }],
    },
    top_product: { data: [{ product_id: 'PE001', product_name: 'Air mineral', product_img: '', branch_id: 'BC-002', branch_name: 'Loka 2', qty: 3, revenue: 10500 }] },
    top_kasir: { data: [{ user_id: 2, name: 'Kasir Demo', foto: '', revenue: 290265 }] },
    top_branch: { data: [{ branch_id: 'BC-002', branch_name: 'Loka 2', revenue: 245310, share: 84.51 }] },
    payment_mix: { data: [{ method: 'cash', trx_count: 3, revenue: 44955, fee_total: 0 }] },
    peak_hour: { data: Array.from({ length: 24 }, (_, hour) => ({ hour, trx_count: 0, revenue: 0 })) },
    category_mix: { data: [{ category: 'satuan', qty: 6, revenue: 105615 }] },
    session_summary: {
      mode: 'shift', use_session: true, date: '2026-11-25', sessions: [], count: 2, open_count: 1,
      total_omzet: 290265, total_cash_in: 44955, total_difference: -5000, exceeded_count: 1, cash_tolerance: 0,
    },
  }
  let payload = { period, ...sections, meta: { available: Object.keys(sections), hidden: [] } }
  const calls = []
  api.defaults.adapter = async (config) => {
    assert.equal(config.url, '/admin/dashboard.php')
    assert.equal(config.method, 'get')
    assert.equal(config.signal, signal)
    calls.push(config.params)
    return { config, status: 200, headers: {}, data: { status: 'success', data: payload } }
  }
  const report = await fetchDashboard('summary', signal, { period: 'month' })
  assert.deepEqual(report, {
    ...payload,
    kpi: { ...sections.kpi, revenue: { ...metric, value: 290265 } },
    top_kasir: { data: [{ ...sections.top_kasir.data[0], user_id: '2' }] },
  })
  assert.notEqual(report.kpi.revenue.value, report.revenue.datasets[0].data.reduce((total, value) => total + value, 0))
  assert.equal(report.session_summary.date, '2026-11-25')

  const range = { period: 'range', startDate: '2026-11-01', endDate: '2026-11-05' }
  payload = {
    period: { ...period, period: 'range', end_date: range.endDate },
    kpi: sections.kpi,
    revenue: sections.revenue,
    peak_hour: sections.peak_hour,
    meta: { available: ['kpi', 'revenue', 'peak_hour'], hidden: [{ key: 'top_product', reason: 'Belum ada item terjual' }] },
  }
  const limited = await fetchDashboard('summary', signal, range)
  assert.deepEqual(limited.meta, payload.meta)
  assert.equal(limited.top_product, undefined)
  assert.equal(limited.session_summary, undefined)
  assert.deepEqual(calls, [{ action: 'summary', period: 'month' }, { action: 'summary', ...range }])
  await fetchDashboard('summary', signal, range, 'BC-002')
  assert.deepEqual(calls.at(-1), { action: 'summary', ...range, branch_id: 'BC-002' })
  await fetchDashboard('summary', signal, range, 'all')
  assert.deepEqual(calls.at(-1), { action: 'summary', ...range })
})

test('dashboard restores saved periods by report, account and branch', async () => {
  const { dashboardPeriodFilter, readDashboardFilter, saveDashboardFilter } = await import('../src/features/dashboard/dashboard-filters.ts')
  const account = { account_id: 'admin-one', store: { id: 'store-one', branch_id: 'branch-one' } }
  const range = { period: 'range', startDate: '2026-01-15', endDate: '2026-06-20' }
  saveDashboardFilter(account, 'total_earning', { period: 'week' })
  saveDashboardFilter(account, 'profit_statistic', range)

  assert.deepEqual(readDashboardFilter(account, 'total_earning'), { period: 'week' })
  assert.deepEqual(readDashboardFilter(account, 'summary'), { period: 'week' })
  saveDashboardFilter(account, 'summary', { period: 'year' })
  assert.deepEqual(readDashboardFilter(account, 'summary'), { period: 'year' })
  assert.deepEqual(readDashboardFilter({ ...account, account_id: 'admin-two' }, 'summary'), { period: 'today' })
  const { period, dateRange } = readDashboardFilter(account, 'profit_statistic')
  assert.deepEqual(dashboardPeriodFilter(period, dateRange), range)
  saveDashboardFilter(account, 'profit_statistic', dashboardPeriodFilter('month', dateRange))
  assert.deepEqual(readDashboardFilter(account, 'profit_statistic'), { period: 'month' })
  assert.deepEqual(readDashboardFilter(account, 'best_sales'), { period: 'today' })
  assert.deepEqual(readDashboardFilter({ ...account, account_id: 'admin-two' }, 'total_earning'), { period: 'today' })
  assert.deepEqual(readDashboardFilter({ ...account, store: { ...account.store, branch_id: 'branch-two' } }, 'total_earning'), { period: 'today' })
})

test('product catalog maps API records and sends the requested branch with bearer authorization', async () => {
  const { fetchProducts, mapProductRecord } = await import('../src/features/products/product-api.ts')
  const { useProductStore } = await import('../src/features/products/product-store.ts')
  const menu = {
    status: 'active', product_sku: 'PE00048', store_id: 'store-0328',
    branch_id: 'BC-001', branch_name: ' Loka 1 ', stock_quantity: 900,
    product_category_name: 'Satuan', product_category: 'satuan',
    product_img: '../../data-assets/upload/product/PE00048/PE00048.png?v=1794884307',
    product_name: 'DHC Perfect UV Milk ', product_price: '295000',
    product_description: 'Deskripsi produk', discount_type: 'none', discount: 0,
  }
  let sent
  api.defaults.adapter = async (config) => {
    sent = config
    return { config, status: 200, headers: {}, data: { status: 'success', msg: 'Successfully Get Product', data: [menu] } }
  }
  useAuthStore.getState().setSession({ account: { account_username: 'tester', event_id: 'store-0328' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  const products = await fetchProducts()
  assert.equal(sent.url, '/admin/product')
  assert.equal(sent.method, 'get')
  assert.deepEqual(sent.params, { action: 'list_product', category: 'all', search: '', status: 'all', menu_id: 'all', sort: 'manual' })
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token-only')
  assert.deepEqual(products[0], {
    id: 'PE00048', title: 'DHC Perfect UV Milk', price: 295000, category: 'satuan', categoryName: 'Satuan',
    store: 'store-0328', storeId: 'store-0328', branchId: 'BC-001', branchName: 'Loka 1',
    photo: 'https://kasirv2.dhcsupplement.co.id/data-assets/upload/product/PE00048/PE00048.png?v=1794884307',
    image: '', description: 'Deskripsi produk', discountType: 'Tanpa diskon', discount: 0, active: true, stock: 900,
  })
  const inactive = mapProductRecord({ ...menu, status: 'no active', product_img: '', product_price: 'invalid', stock_quantity: 0 })
  assert.equal(inactive.active, false)
  assert.equal(inactive.stock, 0)
  assert.equal(inactive.photo, '')
  assert.equal(inactive.price, 0)
  const updated = mapProductRecord({ ...menu, status: 'active', store_id: 'EVT-001',
    branch_id: 'BC-001', stock_quantity: 120,
    product_img: '?v=1794882411', product_name: 'Keripik Pisang Madu', product_price: '18000' })
  assert.equal(updated.stock, 120)
  assert.equal(updated.branchId, 'BC-001')
  assert.equal(updated.storeId, 'EVT-001')
  assert.equal(updated.photo, '')
  assert.equal(updated.price, 18000)
  assert.equal(mapProductRecord({ ...menu, stock_quantity: '12' }).stock, 12)
  assert.equal(mapProductRecord({ ...menu, stock_quantity: -5 }).stock, 0)
  assert.equal(mapProductRecord({ ...menu, branch_name: ' ' }).branchName, undefined)
  const bestSeller = mapProductRecord({ ...menu, sold_qty: '7', is_best_seller: true })
  assert.equal(bestSeller.soldQuantity, 7)
  assert.equal(bestSeller.isBestSeller, true)
  assert.equal(useProductStore.getState().products.length, 0)
  useProductStore.getState().setProducts(products)
  assert.equal(useProductStore.getState().products.length, 1)
  useAuthStore.getState().clearSession()
  assert.equal(useProductStore.getState().products.length, 0)
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: [menu] })
  assert.deepEqual(await fetchProducts(), products)
  api.defaults.adapter = async (config) => {
    assert.equal(config.params.branch_id, 'BC-002')
    assert.equal(config.params.sort, 'manual')
    return { config, status: 200, headers: {}, data: [menu, { ...menu, branch_id: 'BC-002', sort_order: '2' }] }
  }
  const manual = await fetchProducts(undefined, 'BC-002', 'manual')
  assert.deepEqual(manual.map(({ branchId, sortOrder }) => [branchId, sortOrder]), [['BC-002', 2]])
  api.defaults.adapter = async (config) => {
    assert.equal(Object.hasOwn(config.params, 'branch_id'), false)
    return { config, status: 200, headers: {}, data: [menu, { ...menu, branch_id: 'BC-002' }] }
  }
  assert.deepEqual((await fetchProducts(undefined, 'all')).map(({ branchId }) => branchId), ['BC-001', 'BC-002'])
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { status: 'error', msg: 'Menu unavailable', data: [] } })
  await assert.rejects(fetchProducts(), /Menu unavailable/)
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { message: 'Invalid response' } })
  await assert.rejects(fetchProducts(), /Format daftar produk/)
})

test('Order reads list_product with the requested sort and preserves the server order', async () => {
  const { fetchOrderProducts } = await import('../src/features/products/product-api.ts')
  const { productKey } = await import('../src/features/orders/order-store.ts')
  const product = {
    status: 'active', id: 'PE00004', location: 'EVT-001', branch: 'BC-001',
    category: 'satuan', category_name: 'Satuan', img: '?v=16', name: 'Air Mineral 600ml',
    price: '3500', description: 'Air mineral dalam kemasan 600ml', discount_type: 'none', discount: 0, stock: 100,
  }
  const signal = new AbortController().signal
  useAuthStore.getState().setSession({
    account: { account_id: '2', account_username: 'kasir', event_level: 'kasir' },
    token: 'test-token-only', expiresAt: Date.now() + 60_000,
  }, false)
  try {
    let sort = 'manual'
    let branchId
    let body = { status: 'success', msg: 'Successfully Get Products', sort: 'manual', data: [
      { ...product, sold_qty: 2, is_best_seller: true, sort_order: 2 },
      { ...product, branch: 'BC-002', status: 'noactive', stock: 0, use_stock: 'false', img: 'photo.png', discount_type: 'percent', discount: '10', sold_qty: '1', is_best_seller: false },
      { ...product, id: 'PE00005', name: 'Abon', price: '3300' },
    ] }
    api.defaults.adapter = async (config) => {
      assert.equal(config.url, '/product/product')
      assert.equal(config.method, 'get')
      assert.deepEqual(config.params, { action: 'list_product', sort, ...(branchId && { branch_id: branchId }) })
      assert.equal(config.signal, signal)
      assert.equal(config.headers.get('Authorization'), 'Bearer test-token-only')
      return { config, status: 200, headers: {}, data: body }
    }
    const products = await fetchOrderProducts(signal)
    const [available, inactive, legacy] = products
    assert.deepEqual(available, {
      id: 'PE00004', title: 'Air Mineral 600ml', store: 'EVT-001', storeId: 'EVT-001', branchId: 'BC-001',
      category: 'satuan', categoryName: 'Satuan', price: 3500, photo: '', image: '',
      description: 'Air mineral dalam kemasan 600ml', discount: 0, discountType: 'Tanpa diskon', active: true, stock: 100,
      soldQuantity: 2, isBestSeller: true, sortOrder: 2,
    })
    assert.equal(inactive.stock, 0)
    assert.equal(inactive.useStock, false)
    assert.equal(inactive.active, false)
    assert.equal(inactive.discount, 10)
    assert.equal(inactive.discountType, 'Persentase (%)')
    assert.equal(inactive.photo, 'https://kasirv2.dhcsupplement.co.id/API/product/photo.png')
    assert.equal(inactive.soldQuantity, 1)
    assert.equal(inactive.isBestSeller, false)
    assert.equal(legacy.soldQuantity, undefined)
    assert.equal(legacy.isBestSeller, undefined)
    assert.equal(legacy.sortOrder, undefined)
    assert.notEqual(productKey(available), productKey(inactive))
    const [first, second, third] = body.data
    for (sort of ['name_asc', 'name_desc', 'price_asc', 'price_desc', 'best_seller']) {
      body = { ...body, sort, data: [second, third, first] }
      assert.deepEqual(await fetchOrderProducts(signal, sort), [inactive, legacy, available])
    }
    sort = 'manual'
    branchId = 'BC-001'
    assert.deepEqual(await fetchOrderProducts(signal, sort, branchId), [legacy, available])
    branchId = undefined
    body = []
    assert.deepEqual(await fetchOrderProducts(signal), [])
    body = { status: 'error', msg: 'Produk tidak tersedia' }
    await assert.rejects(fetchOrderProducts(signal), /Produk tidak tersedia/)
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('product reorder posts a bulk list with the cashier session and propagates API failures', async () => {
  const { saveProductOrder } = await import('../src/features/products/product-api.ts')
  const order = [
    { id: 'PE00004', sort_order: 1 },
    { id: 'PE00003', sort_order: 2 },
    { id: 'PE00008', sort_order: 1 },
    { id: 'PE00007', sort_order: 2 },
  ]
  useAuthStore.getState().setSession({
    account: { account_id: '2', account_username: 'kasir', event_level: 'kasir' },
    token: 'cashier-test-token', expiresAt: Date.now() + 60_000,
  }, false)
  try {
    let denied = false
    api.defaults.adapter = async (config) => {
      assert.equal(config.url, '/setting.php')
      assert.equal(config.method, 'post')
      assert.equal(config.headers.get('Authorization'), 'Bearer cashier-test-token')
      assert.deepEqual(config.params, { action: 'set_product_sort_bulk' })
      const data = new URLSearchParams(config.data)
      assert.deepEqual([...data.keys()], ['product'])
      assert.deepEqual(JSON.parse(data.get('product')), order)
      if (denied) {
        throw new AxiosError('Forbidden', 'ERR_BAD_REQUEST', config, undefined, {
          config, status: 403, headers: {}, data: { status: 'error', msg: 'Akses hanya untuk admin' },
        })
      }
      return { config, status: 200, headers: {}, data: { status: 'success', data: { updated: 4 } } }
    }
    await saveProductOrder(order)
    denied = true
    await assert.rejects(saveProductOrder(order), (error) => error.response?.status === 403)
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('Order category tabs follow the saved order and include categories added to the catalog', async () => {
  const { getOrderCategories } = await import('../src/features/orders/order-category-order.ts')
  const products = [
    { category: 'satuan', categoryName: 'Satuan' },
    { category: 'paket', categoryName: 'Paket' },
    { category: 'satuan', categoryName: 'Satuan' },
    { category: 'snack', categoryName: 'Camilan' },
  ]
  const local = getOrderCategories(products, [], ['hilang', 'paket', 'paket', 'satuan'])
  assert.deepEqual(local.map(({ category_slug, product_count }) => [category_slug, product_count]), [
    ['paket', 1], ['satuan', 2], ['snack', 1],
  ])
  const admin = getOrderCategories(products, [
    { category_slug: 'SNACK', category_name: 'Makanan ringan' },
    { category_slug: 'satuan', category_name: 'Satuan' },
  ], [])
  assert.deepEqual(admin.map(({ category_slug, category_name }) => [category_slug, category_name]), [
    ['snack', 'Makanan ringan'], ['satuan', 'Satuan'], ['paket', 'Paket'],
  ])
})

test('POS payment methods preserve custom codes and read the active PPN rate', async () => {
  const { fetchPaymentMethods } = await import('../src/features/orders/payment-methods.ts')
  const { paymentTotals, savePayment } = await import('../src/features/orders/payment-details.ts')
  const edc = {
    payment_code: 'qris_edc', payment_method: 'EDC QRIS', payment_type: 'edc',
    fee: 0.7, fee_type: 'percent', fee_bearer: 'customer', image: '',
    is_active: true, fee_active: true,
  }
  const signal = new AbortController().signal
  const cashier = { account_id: '2', account_username: 'kasir', event_level: 'kasir' }
  let ppnActive = true
  useAuthStore.getState().setSession({
    account: cashier,
    token: 'test-token-only', expiresAt: Date.now() + 60_000,
  }, false)
  try {
    api.defaults.adapter = async (config) => {
      assert.equal(config.url, '/transaction/trx')
      assert.equal(config.method, 'get')
      assert.deepEqual(config.params, { action: 'list_payment' })
      assert.equal(config.signal, signal)
      assert.equal(config.headers.get('Authorization'), 'Bearer test-token-only')
      return { config, status: 200, headers: {}, data: { status: 'success', data: { payments: [
        edc,
        { ...edc, payment_code: 'debit_off_us', fee_active: false },
        { ...edc, payment_code: 'disabled', is_active: false },
        { ...edc, payment_code: 'cash', payment_type: 'cash', fee: 0, fee_type: 'flat', fee_active: false, fee_bearer: 'store' },
        { ...edc, payment_code: 'qris_cabang', payment_type: 'qris', image: '../../data-assets/qris.png' },
      ], ppn: { value: 10, is_active: ppnActive } } } }
    }
    const { payments: methods, ppnRate } = await fetchPaymentMethods(signal)
    assert.equal(ppnRate, 10)
    assert.deepEqual(methods.map(({ code }) => code), ['qris_edc', 'debit_off_us', 'cash', 'qris_cabang'])
    const [card, inactiveFee, cash, qris] = methods
    assert.deepEqual(card.fee, { amount: 0.7, type: 'percent' })
    assert.equal(card.feeBearer, 'customer')
    assert.equal(card.kind, 'noncash')
    assert.equal(inactiveFee.fee, undefined)
    assert.equal(cash.kind, 'cash')
    assert.equal(cash.fee, undefined)
    assert.equal(qris.kind, 'qris')
    assert.equal(qris.paymentType, 'qris')
    assert.equal(card.paymentType, 'edc')
    assert.equal(qris.image, 'https://kasirv2.dhcsupplement.co.id/data-assets/qris.png')
    ppnActive = false
    const { payments: historicalMethods, ppnRate: inactivePpn } = await fetchPaymentMethods(signal, 'all')
    assert.equal(inactivePpn, 0)
    assert.deepEqual(historicalMethods.map(({ code }) => code), [
      'qris_edc', 'debit_off_us', 'disabled', 'cash', 'qris_cabang',
    ])
    const { defaultSalesFilters, salesFilterChips } = await import('../src/features/sales/sales-filters.ts')
    const options = historicalMethods.map(({ code, title }) => ({ value: code, label: title }))
    assert.deepEqual(salesFilterChips({ ...defaultSalesFilters, paymentMethod: 'qris_edc' }, [], [], [], options), [
      { key: 'paymentMethod', label: edc.payment_method },
    ])

    let sent
    api.defaults.adapter = async (config) => {
      sent = config
      return { config, status: 200, headers: {}, data: { status: 'success', trx_id: 'TRX-RECEIPT' } }
    }
    const receipt = {
      order: { id: 'order-test', name: 'Pesanan', note: '  Tanpa es  ', items: [{
        product: { id: 'SKU-1', title: 'Air Mineral', price: 3500, branchId: 'branch-1', discountType: 'Persentase (%)', discount: 10 },
        unitPrice: 3150, quantity: 2,
      }] },
      subtotal: 6300, methodFeeAmount: 43, discountAmount: 320, discountAmounts: [320], total: 6123, paid: 6123, change: 0,
      additionalPrices: [{ title: 'Kemasan', value: 100 }], discounts: [{ title: 'Promo', type: 'percent', value: 5 }], method: card,
    }
    assert.equal(await savePayment(receipt, cashier), 'TRX-RECEIPT')
    assert.equal(sent.url, '/transaction/trx')
    assert.equal(sent.method, 'post')
    assert.equal(sent.data.get('action'), 'add_trx')
    assert.equal(sent.data.get('payment_methods'), 'qris_edc')
    assert.equal(sent.data.get('note'), 'Tanpa es')
    assert.equal(sent.data.get('payment_fee'), '0.7')
    assert.equal(sent.data.get('payment_additional_price[0][title]'), 'Kemasan')
    assert.equal(sent.data.get('payment_additional_price[0][value]'), '100')
    assert.equal(sent.data.has('payment_additional_price[1][value]'), false)
    assert.equal(sent.data.get('discounts[0][type]'), 'percent')
    assert.equal(sent.data.get('discounts[0][value]'), '5')
    assert.equal(sent.data.get('product[0][product_id]'), 'SKU-1')
    assert.equal(sent.data.get('product[0][product_qty]'), '2')
    assert.equal(sent.data.get('product[0][product_price]'), '3500')
    assert.equal(sent.data.get('product[0][product_price_total]'), '6300')
    assert.equal(sent.data.get('product[0][product_discount_type]'), 'percent')
    assert.equal(sent.data.get('product[0][product_discount]'), '10')
    assert.equal(sent.data.has('branch_id'), false)
    assert.equal(sent.data.has('event_id'), false)
    assert.equal(sent.data.has('kasir'), false)
    assert.equal(sent.data.has('payment_upload_file'), false)
    assert.equal(sent.data.has('payment_cash_nominal'), false)

    const additionalPrices = [...receipt.additionalPrices, { title: 'Layanan', value: 200 }]
    const discounts = [...receipt.discounts, { title: 'Voucher', type: 'fixed', value: 250 }]
    const totals = paymentTotals(receipt.order, additionalPrices, discounts, card)
    assert.equal(totals.total, 6062)
    assert.equal(totals.methodFeeAmount, 42)
    assert.deepEqual(totals.discountAmounts, [330, 250])
    await savePayment({ ...receipt, ...totals, additionalPrices, discounts }, cashier)
    assert.equal(sent.data.get('payment_total_price'), '6062')
    assert.equal(sent.data.get('payment_additional_price[1][title]'), 'Layanan')
    assert.equal(sent.data.get('payment_additional_price[1][value]'), '200')
    assert.equal(sent.data.get('discounts[1][title]'), 'Voucher')
    assert.equal(sent.data.get('discounts[1][type]'), 'fixed')
    assert.equal(sent.data.get('discounts[1][value]'), '250')
    for (const feeBearer of ['store', null, undefined]) {
      const method = { ...card, feeBearer }
      const totals = paymentTotals(receipt.order, additionalPrices, discounts, method)
      assert.equal(totals.methodFeeAmount, 0)
      assert.equal(totals.total, 6020)
      await savePayment({ ...receipt, ...totals, method, additionalPrices, discounts }, cashier)
      assert.equal(sent.data.get('payment_total_price'), '6020')
      assert.equal(sent.data.has('payment_fee'), false)
      assert.equal(sent.data.has('payment_additional_price[2][value]'), false)
    }
    const fixedMethod = { ...card, fee: { amount: 500, type: 'flat' } }
    for (const feeBearer of ['store', 'customer']) {
      const method = { ...fixedMethod, feeBearer }
      const totals = paymentTotals(receipt.order, [], [], method)
      const amount = feeBearer === 'customer' ? 500 : 0
      assert.equal(totals.methodFeeAmount, amount)
      assert.equal(totals.total, 6300 + amount)
      await savePayment({ ...receipt, ...totals, method, additionalPrices: [], discounts: [] }, cashier)
      assert.equal(sent.data.get('payment_additional_price[0][value]'), amount ? '500' : null)
    }
    const capped = paymentTotals(receipt.order, [], [discounts[0], { ...discounts[1], value: 9000 }])
    assert.equal(capped.total, 0)
    assert.deepEqual(capped.discountAmounts, [315, 5985])

    await savePayment({ ...receipt, method: qris, methodFeeAmount: 0, proof: new File([new Uint8Array(99_999)], 'qris.png', { type: 'image/png' }) }, cashier)
    assert.equal(sent.data.get('payment_methods'), 'qris_cabang')
    assert.equal(sent.data.get('payment_upload_file').name, 'qris.png')
    assert.equal(sent.data.get('payment_upload_file').size, 99_999)

    const admin = {
      ...cashier, account_role: 'admin', store: { all_branches: true, branches: [{ id: 'branch-1', name: 'Cabang 1' }] },
    }
    await savePayment({ ...receipt, method: cash, methodFeeAmount: 0, paid: 8000, change: 1878 }, admin, 'add_trx', 'branch-1')
    assert.equal(sent.data.get('payment_methods'), 'cash')
    assert.equal(sent.data.get('payment_cash_nominal'), '8000')
    assert.equal(sent.data.get('payment_cash_change'), '1878')
    assert.equal(sent.data.get('branch_id'), 'branch-1')
    await assert.rejects(savePayment(receipt, admin, 'add_trx', 'branch-2'), /Produk harus berasal dari cabang kasir/)

    const fullReceipt = {
      ...receipt, ppn: 11, sales: 'sales-1', proof: new File(['proof'], 'bukti.png', { type: 'image/png' }),
      order: { ...receipt.order, items: [{ ...receipt.order.items[0], product: {
        ...receipt.order.items[0].product, category: 'minuman', photo: 'air.png', description: 'Air botol',
      } }] },
    }
    await savePayment(fullReceipt, admin, 'add_trx', 'branch-1')
    const completed = Object.fromEntries(sent.data)
    assert.equal(completed.payment_ppn, '11')
    assert.equal(completed.sales, 'sales-1')
    assert.equal(completed['product[0][product_category]'], 'minuman')
    assert.equal(completed['product[0][product_img]'], 'air.png')
    assert.equal(completed['product[0][product_description]'], 'Air botol')
    await savePayment(fullReceipt, admin, 'pending_trx', 'branch-1')
    assert.deepEqual(Object.fromEntries(sent.data), {
      ...completed, action: 'pending_trx', payment_cash_nominal: '0', payment_cash_change: '0',
    })
    await savePayment({ ...receipt, method: cash, methodFeeAmount: 0, paid: 8000, change: 1878 }, cashier, 'pending_trx')
    assert.equal(sent.data.get('payment_methods'), 'cash')
    assert.equal(sent.data.get('payment_cash_nominal'), '0')
    assert.equal(sent.data.get('payment_cash_change'), '0')
    assert.equal(sent.data.has('branch_id'), false)

    const pendingRequest = sent
    const foreignOrder = { ...receipt.order, items: [{ ...receipt.order.items[0], product: {
      ...receipt.order.items[0].product, branchId: 'branch-2',
    } }] }
    await assert.rejects(savePayment({ ...receipt, order: foreignOrder }, admin, 'pending_trx'), /Branch tidak terdaftar di store ini/)
    await assert.rejects(savePayment({ ...receipt, order: foreignOrder }, {
      ...cashier, store: { branch_id: 'branch-1' },
    }), /Produk harus berasal dari cabang kasir/)
    await assert.rejects(savePayment({ ...receipt, order: { ...receipt.order, items: [] } }, cashier), /Tambahkan produk/)
    await assert.rejects(savePayment({ ...receipt, method: { ...cash, code: '' } }, cashier), /Pilih metode pembayaran/)
    await assert.rejects(savePayment({ ...receipt, total: NaN }, cashier), /Total pembayaran tidak valid/)
    await assert.rejects(savePayment({ ...receipt, order: { ...receipt.order, items: [{ ...receipt.order.items[0], quantity: 0 }] } }, cashier), /Data produk/)
    await assert.rejects(savePayment({ ...receipt, proof: new File([new Uint8Array(100_000)], 'bukti.png') }, cashier, 'pending_trx'), /di bawah 100 KB/)
    assert.equal(sent, pendingRequest)
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('product status posts active/noactive and accepts only successful API responses', async () => {
  const { updateProductStatus, mapProductRecord } = await import('../src/features/products/product-api.ts')
  let sent
  useAuthStore.getState().setSession({ account: { account_username: 'tester' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  api.defaults.adapter = async (config) => {
    sent = config
    return { config, status: 200, headers: {}, data: { status: 'success', msg: 'Successfully Activated' } }
  }
  assert.equal(await updateProductStatus('PE00048', true), 'Successfully Activated')
  assert.equal(sent.url, '/admin/product')
  assert.equal(sent.method, 'post')
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token-only')
  assert.deepEqual(Object.fromEntries(sent.data.entries()), { action: 'status_product', product_sku: 'PE00048', status: 'active' })
  await updateProductStatus('PE00048', false)
  assert.equal(sent.data.get('status'), 'noactive')
  assert.equal(mapProductRecord({ product_sku: '1', product_name: 'Test', status: 'noactive', product_price: 0, discount: 0 }).active, false)
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { status: 'error', msg: 'Not allowed' } })
  await assert.rejects(updateProductStatus('PE00048', true), /Not allowed/)
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: null })
  await assert.rejects(updateProductStatus('PE00048', true), /Gagal mengubah/)
  useAuthStore.getState().clearSession()
})

test('category API preserves slugs and order and sends category mutations', async () => {
  const { fetchCategories, addCategory, editCategory, deleteCategory } = await import('../src/features/products/category-api.ts')
  const first = { category_id: 2, category_slug: 'satuan', category_name: 'Satuan', category_sort: 1, category_status: 'active', product_count: 6 }
  const second = { ...first, category_id: 3, category_slug: 'satuan-2', category_sort: 10, category_status: 'noactive', product_count: 0 }
  let sent
  api.defaults.adapter = async (config) => {
    sent = config
    return { config, status: 200, headers: {}, data: { status: 'success', data: [second, first] } }
  }
  assert.deepEqual(await fetchCategories(), [first, second])
  assert.equal(sent.url, '/admin/category.php')
  assert.equal(sent.method, 'get')
  assert.deepEqual(sent.params, { action: 'list_category' })

  api.defaults.adapter = async (config) => {
    sent = config
    return { config, status: 201, headers: {}, data: { status: 'success', data: second } }
  }
  assert.equal((await addCategory({ name: 'Satuan' })).category_slug, 'satuan-2')
  assert.equal(sent.method, 'post')
  assert.deepEqual(Object.fromEntries(sent.data), { name: 'Satuan', action: 'add_category' })
  await editCategory(3, { name: 'Paket', slug: 'paket', sort_order: 0, status: 'noactive' })
  assert.deepEqual(Object.fromEntries(sent.data), {
    name: 'Paket', slug: 'paket', sort_order: '0', status: 'noactive',
    category_id: '3', action: 'edit_category',
  })
  await editCategory(3, { name: 'Paket', sort_order: 2 })
  assert.deepEqual(Object.fromEntries(sent.data), {
    name: 'Paket', sort_order: '2', category_id: '3', action: 'edit_category',
  })

  api.defaults.adapter = async (config) => {
    sent = config
    throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, {
      config, status: 400, headers: {},
      data: { status: 'error', msg: 'Kategori masih dipakai 6 produk', data: { used_by: 6 } },
    })
  }
  await assert.rejects(deleteCategory(2), (error) => error.response?.data?.data?.used_by === 6)
  assert.deepEqual(Object.fromEntries(sent.data), { category_id: '2', action: 'delete_category' })
})

test('add and edit products send store IDs, discounts, binary images and stock settings', async () => {
  const { saveProduct, mapProductRecord } = await import('../src/features/products/product-api.ts')
  const { productSchema } = await import('../src/features/products/product-schema.ts')
  let sent
  api.defaults.adapter = async (config) => {
    sent = config
    return { config, status: 200, headers: {}, data: { status: 'success', msg: 'Saved' } }
  }
  useAuthStore.getState().setSession({ account: { account_username: 'tester' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  const input = {
    eventId: 'store-0328', category: 'satuan', image: null, name: 'Test', price: '100000',
    description: 'Test description', discount: '10', discountType: 'Persentase (%)', useStock: true,
  }
  assert.equal(await saveProduct(input), 'Saved')
  assert.equal(sent.url, '/admin/product')
  assert.equal(sent.method, 'post')
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token-only')
  assert.deepEqual(Object.fromEntries(sent.data.entries()), {
    action: 'add_product', branch_id: 'store-0328', category: 'satuan', img: '', name: 'Test',
    price: '100000', description: 'Test description', discount: '10', discount_type: 'percent',
    use_stock: 'true',
  })
  await saveProduct({ ...input, menuId: 'PE00048', discountType: 'Nominal' })
  assert.equal(sent.data.get('action'), 'edit_product')
  assert.equal(sent.data.get('product_sku'), 'PE00048')
  assert.equal(sent.data.get('branch_id'), 'store-0328')
  assert.equal(sent.data.get('img'), '')
  assert.equal(sent.data.get('discount_type'), 'fixed')
  const image = new File(['test-image-bytes'], 'photo.png', { type: 'image/png' })
  await saveProduct({ ...input, menuId: 'PE00048', image, discountType: 'Tanpa diskon' })
  assert.equal(sent.data.get('img').name, 'photo.png')
  assert.equal(sent.data.get('img').type, 'image/png')
  assert.equal(await sent.data.get('img').text(), 'test-image-bytes')
  assert.equal(sent.data.get('discount_type'), 'none')
  assert.equal(sent.data.get('discount'), '0')
  assert.equal(sent.data.has('stock_qty'), false)
  await saveProduct({ ...input, stockQuantity: '0' })
  assert.equal(sent.data.get('stock_qty'), '0')
  await saveProduct({ ...input, menuId: 'PE00048', useStock: false, stockQuantity: '' })
  assert.equal(sent.data.get('use_stock'), 'false')
  assert.equal(sent.data.get('stock_qty'), '')
  const menu = { product_sku: '1', product_name: 'Test', status: 'active', product_price: 100, discount: 10 }
  assert.equal(mapProductRecord({ ...menu, discount_type: 'percent' }).discountType, 'Persentase (%)')
  assert.equal(mapProductRecord({ ...menu, discount_type: 'fixed' }).discountType, 'Nominal')
  assert.equal(mapProductRecord({ ...menu, discount_type: 'none' }).discountType, 'Tanpa diskon')
  assert.equal(mapProductRecord({ ...menu, stock_qty: null, stock_quantity: 0 }).useStock, false)
  assert.equal(mapProductRecord({ ...menu, stock_qty: '0' }).useStock ?? true, true)
  assert.equal(mapProductRecord({ ...menu, stock_qty: '12' }).stock, 12)
  assert.equal(mapProductRecord({ ...menu, use_stock: false, stock_qty: 10 }).useStock, false)
  assert.equal(mapProductRecord({ ...menu, use_stock: 'true', stock_qty: null }).useStock, true)
  const form = { store: 'store-0328', category: 'satuan', title: 'Test', price: '100000', photo: '', discount: '10', discountType: 'Persentase (%)', description: '' }
  assert.ok(productSchema.safeParse({ ...form, useStock: false, stock: '' }).success)
  assert.ok(productSchema.safeParse({ ...form, useStock: true, stock: '0' }).success)
  assert.ok(productSchema.safeParse({ ...form, useStock: false, stock: '', discount: '100' }).success)
  assert.ok(productSchema.safeParse({ ...form, useStock: false, stock: '', discountType: 'Nominal', discount: form.price }).success)
  const lastRequest = sent
  for (const [discountType, discount, error] of [
    ['Persentase (%)', '100.1', /maksimal 100%/],
    ['Nominal', '100001', /melebihi harga produk/],
  ]) {
    assert.equal(productSchema.safeParse({ ...form, useStock: false, stock: '', discountType, discount }).success, false)
    await assert.rejects(saveProduct({ ...input, discountType, discount }), error)
    await assert.rejects(saveProduct({ ...input, menuId: 'PE00048', discountType, discount }), error)
    assert.equal(sent, lastRequest)
  }
  for (const stock of ['', '-1', '1.5', '9007199254740992']) {
    assert.equal(productSchema.safeParse({ ...form, useStock: true, stock }).success, false)
  }
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { status: 'error', msg: 'Save denied' } })
  await assert.rejects(saveProduct(input), /Save denied/)
  useAuthStore.getState().clearSession()
})

test('copying a product sends the source SKU and the initial stock to copy_product', async () => {
  const { copyProductToBranch, getProductCopyDestinations } = await import('../src/features/products/product-copy.ts')
  const { mapProductRecord } = await import('../src/features/products/product-api.ts')
  const record = {
    status: 'active', product_sku: 'PE-01', store_id: 'STORE-01', branch_id: 'BC-001',
    product_name: 'Kopi Susu', product_price: 18000, product_category: 'minuman', product_category_name: 'Minuman',
    product_description: 'Kopi dengan susu', discount_type: 'percent', discount: 10, use_stock: true, stock_qty: 120,
    product_img: 'data:image/png;base64,aW1hZ2U=',
  }
  const product = mapProductRecord(record)
  const branches = ['all', 'BC-001', 'BC-002', 'BC-003', 'BC-004', 'BC-005'].map(id => ({ id, name: `Cabang ${id}` }))
  const records = [
    record,
    { ...record, product_sku: 'PE-02', branch_id: 'BC-002', product_name: ' kopi  susu ', status: 'noactive' },
    { ...record, product_sku: 'PE-03', branch_id: 'BC-003', product_category: 'makanan', product_category_name: 'Makanan' },
    { ...record, product_sku: 'PE-04', branch_id: 'BC-004', product_category: 'Minuman', status: 'active' },
  ]
  const posted = []
  let copyError = false
  useAuthStore.getState().setSession({
    account: { account_username: 'tester', store: { id: 'STORE-01', all_branches: true, branches } },
    token: 'test-token-only', expiresAt: Date.now() + 60_000,
  }, false)
  api.defaults.adapter = async (config) => {
    assert.equal(config.url, '/admin/product')
    if (config.method === 'get') {
      return { config, status: 200, headers: {}, data: { status: 'success', data: records } }
    }
    assert.equal(config.method, 'post')
    assert.equal(config.headers.get('Authorization'), 'Bearer test-token-only')
    const fields = Object.fromEntries(config.data.entries())
    if (copyError) return { config, status: 200, headers: {}, data: { status: 'error', msg: 'Salinan ditolak.' } }
    posted.push(fields)
    records.push({ ...record, product_sku: `NEW-${posted.length}`, branch_id: fields.branch_id, stock_qty: Number(fields.stock_qty ?? 0) })
    return { config, status: 200, headers: {}, data: { status: 'success' } }
  }
  try {
    assert.deepEqual(getProductCopyDestinations(product, records.map(item => mapProductRecord(item)), branches).map(branch => branch.id), ['BC-003', 'BC-005'])
    const input = { branchId: 'BC-005', useStock: true, stock: ' 7 ' }
    await assert.rejects(copyProductToBranch(product, { ...input, branchId: 'OTHER' }), /Pilih cabang tujuan/)
    await assert.rejects(copyProductToBranch(product, { ...input, branchId: 'BC-001' }), /Pilih cabang tujuan/)
    await assert.rejects(copyProductToBranch(product, { ...input, stock: '-1' }), /stok awal/)
    assert.equal(await copyProductToBranch(product, input), 'Cabang BC-005')
    assert.deepEqual(posted[0], {
      action: 'copy_product', product_sku: 'PE-01', branch_id: 'BC-005', use_stock: 'true', stock_qty: '7',
    })
    await assert.rejects(copyProductToBranch(product, input), /sudah tersedia/)
    assert.equal(posted.length, 1)
    const withoutStock = { branchId: 'BC-003', useStock: false, stock: '' }
    copyError = true
    await assert.rejects(copyProductToBranch(product, withoutStock), /Salinan ditolak/)
    copyError = false
    assert.equal(await copyProductToBranch(product, withoutStock), 'Cabang BC-003')
    assert.deepEqual(posted[1], {
      action: 'copy_product', product_sku: 'PE-01', branch_id: 'BC-003', use_stock: 'false',
    })
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('store API unwraps active stores with their branches and days', async () => {
  const { fetchStore } = await import('../src/features/products/store-api.ts')
  const store = {
    store_id: 'EVT-001', store_name: 'Bazar Kemang 2026', store_status: 'active',
    store_address: 'Jl. Kemang Raya No. 12', store_city: 'Jakarta Selatan',
    store_branch: [{ id: 'BC-001', name: 'Bazar Kemang - Loka 1' }],
    store_days: [{ days: 'days 1', date: '2026-11-10' }],
  }
  let sent
  useAuthStore.getState().setSession({ account: { account_username: 'tester' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  api.defaults.adapter = async (config) => {
    sent = config
    return { config, status: 200, headers: {}, data: { status: 'success', msg: 'Successfully Get Store', data: [store] } }
  }
  assert.deepEqual(await fetchStore(), [store])
  assert.equal(sent.url, '/store')
  assert.equal(sent.method, 'get')
  assert.deepEqual(sent.params, { action: 'list_store', status: 'active' })
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token-only')
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { status: 'success', data: [] } })
  assert.deepEqual(await fetchStore(), [])
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { status: 'error', msg: 'Store unavailable' } })
  await assert.rejects(fetchStore(), /Store unavailable/)
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { status: 'success', data: [null] } })
  await assert.rejects(fetchStore(), /Format daftar store/)
  useAuthStore.getState().clearSession()
})

test('admin branch changes send the required fields and preserve the server rejection for branches in use', async () => {
  const { saveBranch } = await import('../src/features/stores/stores-api.ts')
  const branch = { id: 'BC-001', name: 'Kemang' }
  const created = { store_id: 'EVT-001', branch, branches: [branch] }
  const calls = []
  useAuthStore.getState().setSession({ account: { account_username: 'tester' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  try {
    api.defaults.adapter = async (config) => {
      assert.equal(config.url, '/admin/store')
      assert.equal(config.method, 'post')
      assert.equal(config.headers.get('Authorization'), 'Bearer test-token-only')
      const fields = Object.fromEntries(config.data.entries())
      calls.push(fields)
      const status = fields.action === 'add_branch' ? 201 : 200
      const data = fields.action === 'add_branch' ? { status: 'success', data: created } : { status: 'success' }
      return { config, status, headers: {}, data }
    }

    assert.deepEqual(await saveBranch('EVT-001', { action: 'add_branch', name: 'Kemang' }), created)
    await saveBranch('EVT-001', { action: 'edit_branch', name: 'Kemang Baru', branchId: 'BC-001' })
    await saveBranch('EVT-001', { action: 'delete_branch', branchId: 'BC-001' })
    assert.deepEqual(calls, [
      { action: 'add_branch', store_id: 'EVT-001', name: 'Kemang' },
      { action: 'edit_branch', store_id: 'EVT-001', branch_id: 'BC-001', name: 'Kemang Baru' },
      { action: 'delete_branch', store_id: 'EVT-001', branch_id: 'BC-001' },
    ])

    const msg = 'Branch masih dipakai data lain (product, stock) dan tidak bisa dihapus'
    api.defaults.adapter = async (config) => {
      throw new AxiosError('Bad Request', 'ERR_BAD_REQUEST', config, undefined, {
        config, status: 400, statusText: 'Bad Request', headers: {},
        data: { status: 'error', msg, data: { used_by: ['product', 'stock'] } },
      })
    }
    await assert.rejects(saveBranch('EVT-001', { action: 'delete_branch', branchId: 'BC-001' }), { message: msg })
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('product prices support nominal and percentage discounts without negative prices', async () => {
  const { getProductPricing } = await import('../src/features/products/product-pricing.ts')
  assert.deepEqual(getProductPricing({ price: 100000, discount: 10, discountType: 'Persentase (%)' }), { finalPrice: 90000, percent: 10, hasDiscount: true })
  assert.deepEqual(getProductPricing({ price: 100000, discount: 15000, discountType: 'Nominal' }), { finalPrice: 85000, percent: null, hasDiscount: true })
  assert.deepEqual(getProductPricing({ price: 100000, discount: 10, discountType: 'Tanpa diskon' }), { finalPrice: 100000, percent: null, hasDiscount: false })
  assert.equal(getProductPricing({ price: 100000, discount: 0, discountType: 'Persentase (%)' }).hasDiscount, false)
  assert.equal(getProductPricing({ price: 100000, discount: 200000, discountType: 'Nominal' }).finalPrice, 0)
  assert.equal(getProductPricing({ price: 100000, discount: 150, discountType: 'Persentase (%)' }).finalPrice, 0)
})

test('transaction queries send supported filters, user IDs, exact payment codes and local calendar dates', async () => {
  const { transactionListParams, fetchTransactions } = await import('../src/features/sales/sales-api.ts')
  const filters = { store: 'branch-0328', paymentMethod: 'qris_edc', cashier: 'U-0011', sales: 'U-0012', product: 'ignored',
    dateRange: { from: new Date(2026, 10, 1), to: new Date(2026, 10, 17) } }
  const params = transactionListParams(filters, ' test ')
  assert.deepEqual(params, {
    action: 'list_trx', kasir: 'U-0011', sales: 'U-0012', search: 'test', payment: 'qris_edc',
    startDate: '2026-11-01', endDate: '2026-11-17',
  })
  assert.deepEqual(transactionListParams({ paymentMethod: 'all', cashier: 'all', sales: 'all', status: 'all' }, ' '), { action: 'list_trx' })
  assert.deepEqual(transactionListParams({ dateRange: { from: undefined, to: new Date(2026, 10, 17) } }, ''), {
    action: 'list_trx', endDate: '2026-11-17',
  })
  for (const status of ['pending', 'completed', 'cancelled', 'refund_partial', 'refund_full']) {
    assert.deepEqual(transactionListParams({ status }, ''), { action: 'list_trx', status })
    assert.deepEqual(transactionListParams({ status }, '', 'next-page'), { action: 'list_trx', status, cursor: 'next-page' })
  }
  const { defaultSalesFilters, salesFilterChips } = await import('../src/features/sales/sales-filters.ts')
  assert.deepEqual(salesFilterChips({ ...defaultSalesFilters, status: 'refund_full' }, []), [{ key: 'status', label: 'Refund penuh' }])
  let sent
  api.defaults.adapter = async (config) => { sent = config; return { config, status: 200, headers: {}, data: {
    status: 'success', msg: 'Successfully Get Transaction',
    data: { summary: { transaction: [], summary: [], payments: [], 'sales-promotion': [] }, data_trx: [] },
  } } }
  useAuthStore.getState().setSession({ account: { account_username: 'tester' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  assert.deepEqual((await fetchTransactions(filters, 'test')).sales, [])
  assert.equal(sent.url, '/transaction/trx')
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token-only')
  assert.deepEqual(sent.params, params)
  await fetchTransactions({ status: 'pending' }, '')
  assert.deepEqual(sent.params, { action: 'list_trx', status: 'pending' })
  useAuthStore.getState().clearSession()
})

test('transaction pages keep filters and follow the cursor while deduplicating transaction IDs', async () => {
  const { fetchAllTransactions, fetchTransactions, flattenTransactionPages, isInvalidTransactionCursor, mapTransactionList } = await import('../src/features/sales/sales-api.ts')
  const signal = new AbortController().signal
  const filters = { branchId: 'BC-001', status: 'pending' }
  const cursor = ' token+/= '
  const params = []
  const first = { trx_id: 'TRX-2', trx_kasir: 'Kasir', trx_location: 'Toko', trx_date: '26/11/2026 10:00',
    trx_total: '50000', trx_payment: 'cash', trx_change: '0', trx_total_items: 1, trx_status: 'pending' }
  api.defaults.adapter = async (config) => {
    assert.equal(config.signal, signal)
    params.push(config.params)
    const data = config.params.cursor ? {
      paging: { limit: 25, returned: 2, has_more: false, next_cursor: 'ignored' },
      data_trx: [first, { ...first, trx_id: 'TRX-1' }],
    } : {
      summary: { transaction: [{ title: 'transaction', value: 2 }], summary: [], payments: [] },
      paging: { limit: 25, returned: 1, has_more: true, next_cursor: cursor }, data_trx: [first],
    }
    return { config, status: 200, headers: {}, data: { status: 'success', data } }
  }
  const firstPage = await fetchTransactions(filters, ' kasir ', signal)
  assert.equal(firstPage.summary.transactions, 2)
  assert.equal(firstPage.nextCursor, cursor)
  const lastPage = await fetchTransactions(filters, ' kasir ', signal, firstPage.nextCursor)
  assert.equal(lastPage.nextCursor, undefined)
  assert.deepEqual(flattenTransactionPages([firstPage, lastPage]).map(({ id }) => id), ['TRX-2', 'TRX-1'])
  assert.deepEqual((await fetchAllTransactions(filters, ' kasir ', signal)).map(({ id }) => id), ['TRX-2', 'TRX-1'])
  const base = { action: 'list_trx', branch_id: 'BC-001', search: 'kasir', status: 'pending' }
  assert.deepEqual(params, [base, { ...base, cursor }, base, { ...base, cursor }])
  assert.equal(mapTransactionList({ summary: [], data_trx: [], paging: { has_more: true, next_cursor: '' } }).nextCursor, undefined)
  api.defaults.adapter = async (config) => {
    throw new AxiosError('Bad Request', 'ERR_BAD_REQUEST', config, undefined, {
      config, status: 400, headers: {}, data: { status: 'error', msg: 'Cursor tidak valid' },
    })
  }
  await assert.rejects(fetchTransactions(filters, ' kasir ', signal, cursor), isInvalidTransactionCursor)
})

test('transaction mapping uses server aggregates, Jakarta dates, payment names and actual change', async () => {
  const { mapTransactionList } = await import('../src/features/sales/sales-api.ts')
  const mapped = mapTransactionList({
    summary: {
      transaction: [{ title: 'transaction', value: 129 }, { title: 'variants', value: 265 }, { title: 'items', value: 364 }],
      summary: [{ title: 'sellings', value: 20363000 }, { title: 'changes', value: 150000 }],
      cash: { received: 150000, change: 44000, refund: 0, net: 106000, change_without_nominal: 0 },
      payments: [
        { title: 'qris', value: 19358000 }, { title: 'cash', value: 1005000 },
        { title: 'dibayaran', value: '1' }, { title: 'kembali', value: '0' },
      ],
    },
    data_trx: [{ trx_id: 'TRXWHSMEY', trx_kasir: 'Muhammad Idris Iswardana', trx_location: 'Jak Japan Matsuri 2026',
      trx_date: '01/11/2026 20:22', trx_total: '165000', trx_payment: 'cash', trx_change: '35000', trx_total_items: 2, trx_status: 'completed' }],
  })
  assert.deepEqual(mapped.summary, {
    transactions: 129, productsSold: 364, total: 20363000, change: 150000,
    paymentTotals: { QRIS: 19358000, Tunai: 1005000 },
    cash: { received: 150000, change: 44000 },
  })
  assert.equal(mapped.sales[0].occurredAt, '2026-11-01T20:22:00+07:00')
  assert.equal(mapped.sales[0].status, 'complete')
  assert.equal(mapped.sales[0].paymentMethod, 'Tunai')
  assert.equal(mapped.sales[0].total, 165000)
  assert.equal(mapped.sales[0].change, 35000)
  assert.equal(mapped.sales[0].totalItems, 2)
  assert.deepEqual(mapped.sales[0].items, [])
  assert.equal(mapped.sales[0].paymentProof, undefined)
  assert.deepEqual(mapTransactionList({
    summary: [], data_trx: [], cash: { received: '0', change: 0 },
  }).summary.cash, { received: 0, change: 0 })
  assert.deepEqual(mapTransactionList([]), {
    sales: [], summary: { transactions: 0, productsSold: 0, total: 0, change: 0, paymentTotals: {} },
  })
})

test('transaction status breakdown preserves zero counts and totals from the API', async () => {
  const { mapTransactionList } = await import('../src/features/sales/sales-api.ts')
  const summary = { transaction: [], summary: [], payments: [] }
  const status_breakdown = {
    completed: { count: '4', total: '141000' },
    pending: { count: 0, total: 0 },
    cancelled: { count: 0, total: 0 },
    refund_partial: { count: 0, total: 0 },
    refund_full: { count: 0, total: 0 },
  }
  const expected = { ...status_breakdown, completed: { count: 4, total: 141000 } }
  assert.deepEqual(mapTransactionList({ status: 'success', data: {
    summary, data_trx: [], status_breakdown,
  } }).summary.statusBreakdown, expected)
  assert.deepEqual(mapTransactionList({ summary: { ...summary, status_breakdown }, data_trx: [] }).summary.statusBreakdown, expected)
})

test('empty list responses render as no data while real API errors are preserved', async () => {
  const { fetchProducts, fetchOrderProducts } = await import('../src/features/products/product-api.ts')
  const { fetchCategories } = await import('../src/features/products/category-api.ts')
  const { fetchProductStock } = await import('../src/features/products/stock-api.ts')
  const { fetchStore } = await import('../src/features/products/store-api.ts')
  const { fetchUsers } = await import('../src/features/users/users-api.ts')
  const { fetchPaymentMethods } = await import('../src/features/orders/payment-methods.ts')
  const { fetchCashSessionExport, fetchCashSessions, fetchHandoverCandidates, fetchPendingHandovers } = await import('../src/features/cash-session/cash-session-api.ts')
  const { fetchDashboard } = await import('../src/features/dashboard/dashboard-api.ts')
  const { fetchStoreSettings } = await import('../src/features/settings/store-settings-query.ts')
  const { fetchTransactions } = await import('../src/features/sales/sales-api.ts')
  const signal = new AbortController().signal
  const listRequests = [fetchProducts, fetchOrderProducts, fetchCategories, fetchProductStock,
    fetchStore, fetchUsers, fetchHandoverCandidates, fetchPendingHandovers]
  const emptyTransactions = { sales: [], summary: { transactions: 0, productsSold: 0, total: 0, change: 0, paymentTotals: {} } }
  let payload
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: payload })

  for (const empty of [[], { status: 'success', data: [] }, { status: 'error', msg: 'No Data yet', data: [] }]) {
    payload = empty
    for (const fetchList of listRequests) assert.deepEqual(await fetchList(signal), [])
    assert.deepEqual(await fetchPaymentMethods(signal), { payments: [] })
    assert.deepEqual(await fetchCashSessionExport({}), [])
    assert.deepEqual(await fetchCashSessions({}), { sessions: [], count: 0 })
    assert.deepEqual(await fetchDashboard('best_sales'), [])
    assert.equal(await fetchDashboard('trending_product'), null)
    assert.equal(await fetchStoreSettings(), null)
    assert.deepEqual(await fetchTransactions({}, ''), emptyTransactions)
  }

  payload = { status: 'success', data: null }
  assert.equal(await fetchStoreSettings(), null)

  payload = { status: 'success', msg: 'No Data yet', data: { summary: [], data_trx: [] } }
  assert.deepEqual(await fetchTransactions({}, ''), emptyTransactions)
  payload = { status: 'success', data: { sessions: [] } }
  assert.deepEqual(await fetchCashSessions({}), { sessions: [], count: 0 })

  payload = { status: 'error', msg: 'Akses ditolak', data: [] }
  for (const fetchList of listRequests) await assert.rejects(fetchList(signal), /Akses ditolak/)
  await assert.rejects(fetchPaymentMethods(signal), /Akses ditolak/)
  await assert.rejects(fetchTransactions({}, ''), /Akses ditolak/)
  await assert.rejects(fetchCashSessions({}), /Akses ditolak/)
  await assert.rejects(fetchDashboard('trending_product'), /Akses ditolak/)
  await assert.rejects(fetchStoreSettings(), /Akses ditolak/)
})

test('store settings read fee details from each payment method', async () => {
  const { fetchStoreSettings, paymentImageUrl } = await import('../src/features/settings/store-settings-query.ts')
  const signal = new AbortController().signal
  const data = {
    store_id: 'EVT-001',
    shift: [{ code: 'pagi', title: 'Pagi', is_active: true, start_time: '06:00', end_time: '14:00' }],
    ppn: { value: 10, is_active: true },
    shift_mode: 'shift',
    cash_tolerance: 10000,
    payment: [
      { code: 'cash', title: 'CASH', type: 'cash', fee: 0, fee_type: 'flat', fee_active: false, fee_bearer: 'store', image: '', is_active: true },
      { code: 'qris', title: 'QRIS', type: 'qris', fee: 1, fee_type: 'percent', fee_active: true, fee_bearer: 'store', image: '../../data-assets/upload/qris/qris.jpg', is_active: true },
      { code: 'qris_customer', title: 'QRIS CUSTOMER', type: 'qris', fee: 0.5, fee_type: 'percent', fee_active: true, fee_bearer: 'customer', image: '', is_active: true },
    ],
  }
  api.defaults.adapter = async (config) => {
    assert.equal(config.url, '/admin/setting.php')
    assert.equal(config.method, 'get')
    assert.deepEqual(config.params, { action: 'setting' })
    assert.equal(config.signal, signal)
    return { config, status: 200, headers: {}, data: { status: 'success', msg: 'Successfully Get Setting', data } }
  }
  const settings = await fetchStoreSettings(signal)
  assert.deepEqual(settings, data)
  assert.equal(paymentImageUrl(settings.payment[1].image), 'https://kasirv2.dhcsupplement.co.id/data-assets/upload/qris/qris.jpg')
})

test('all-branch stock, shift history and sales omit the branch ID', async () => {
  const { fetchProductStock } = await import('../src/features/products/stock-api.ts')
  const { fetchCashSessions } = await import('../src/features/cash-session/cash-session-api.ts')
  const { transactionListParams } = await import('../src/features/sales/sales-api.ts')
  const stock = [{ branch_id: 'BC-001', branch_name: 'Loka 1' }, { branch_id: 'BC-002' }]
  const signal = new AbortController().signal
  let params
  api.defaults.adapter = async (config) => {
    params = config.params
    const data = config.url === '/admin/stock' ? stock : { status: 'success', data: { sessions: [] } }
    return { config, status: 200, headers: {}, data }
  }
  assert.deepEqual(await fetchProductStock(signal, 'all'), stock)
  assert.deepEqual(params, { action: 'list_stock' })
  assert.deepEqual(await fetchProductStock(signal, 'BC-002'), [stock[1]])
  assert.deepEqual(params, { action: 'list_stock', branch_id: 'BC-002' })
  await fetchCashSessions({ branch_id: 'all', status: 'open' }, signal)
  assert.deepEqual(params, { action: 'list_session', status: 'open' })
  await fetchCashSessions({ branch_id: 'BC-002', status: 'open' }, signal)
  assert.deepEqual(params, { action: 'list_session', status: 'open', branch_id: 'BC-002' })
  assert.deepEqual(transactionListParams({ branchId: 'all' }, ''), { action: 'list_trx' })
})

test('reports use the authenticated download endpoint and send only supported filters', async () => {
  const { fetchSalesHistoryTable, fetchSalesHistoryExport, fetchCashSessionExport } = await import('../src/features/reports/report-api.ts')
  const html = '<!doctype html><style>table { border-collapse: collapse }</style><table><tr><th>Shift</th><th>Sesi Kas</th></tr></table>'
  const sales = [{ 'ID Trx': 'TRX000001', Shift: 'pagi', 'Sesi Kas': 'SES-1', Subtotal: '18000' }]
  const sessions = [{ 'ID Sesi': 'SES-1', Kasir: 'Kasir Demo', Selisih: -5000, 'Nominal Serah Terima': null }]
  let payload = html
  const requests = []
  useAuthStore.getState().setSession({ account: { account_username: 'kasir' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  try {
    api.defaults.adapter = async (config) => {
      requests.push(config)
      assert.equal(config.url, '/download.php')
      assert.equal(config.method, 'get')
      assert.equal(config.headers.get('Authorization'), 'Bearer test-token-only')
      return { config, status: 200, headers: {}, data: payload }
    }
    const signal = new AbortController().signal
    assert.equal(await fetchSalesHistoryTable(signal), html)
    assert.deepEqual(requests.at(-1).params, { action: 'table_history' })
    assert.equal(requests.at(-1).headers.get('Accept'), 'text/html')
    assert.equal(requests.at(-1).responseType, 'text')
    assert.equal(requests.at(-1).signal, signal)
    const salesDates = { startDate: '2026-11-10', endDate: '2026-11-18' }
    assert.equal(await fetchSalesHistoryTable(signal, salesDates), html)
    assert.deepEqual(requests.at(-1).params, { action: 'table_history', ...salesDates })

    payload = { status: 'success', data: sales }
    assert.deepEqual(await fetchSalesHistoryExport(), sales)
    assert.deepEqual(requests.at(-1).params, { action: 'export_history' })
    assert.deepEqual(await fetchSalesHistoryExport(salesDates), sales)
    assert.deepEqual(requests.at(-1).params, { action: 'export_history', ...salesDates })

    payload = { status: 'success', data: sessions }
    assert.deepEqual(await fetchCashSessionExport({ startDate: '2026-11-19', endDate: '2026-11-25' }), sessions)
    assert.deepEqual(requests.at(-1).params, { action: 'export_session', startDate: '2026-11-19', endDate: '2026-11-25' })
    await fetchCashSessionExport({ endDate: '2026-11-25' })
    assert.deepEqual(requests.at(-1).params, { action: 'export_session', endDate: '2026-11-25' })
    await fetchCashSessionExport()
    assert.deepEqual(requests.at(-1).params, { action: 'export_session' })

    payload = { status: 'error', msg: 'No Data yet', data: [] }
    assert.deepEqual(await fetchSalesHistoryExport(), [])
    payload = { status: 'error', msg: 'Akses ditolak', data: [] }
    await assert.rejects(fetchSalesHistoryExport(), /Akses ditolak/)
    await assert.rejects(fetchCashSessionExport(), /Akses ditolak/)
    payload = JSON.stringify(payload)
    await assert.rejects(fetchSalesHistoryTable(), /Laporan penjualan tidak tersedia/)
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('Excel reports preserve columns and notes and store amounts as numbers', async () => {
  const { createReportWorkbook } = await import('../src/features/reports/report-excel.ts')
  const { unzipSync, strFromU8 } = createRequire(import.meta.resolve('write-excel-file/universal'))('fflate')
  const workbook = await createReportWorkbook([
    { 'ID Sesi': 'SES-1', Alasan: 'Uang kurang, kasir bilang "sudah hitung".\nDiperiksa ulang.', Selisih: -5000 },
    { 'ID Sesi': 'SES-2', Alasan: '=1+1', Selisih: '-1500', 'Nominal Serah Terima': null },
  ])
  const files = unzipSync(new Uint8Array(await workbook.arrayBuffer()))
  const worksheet = strFromU8(files['xl/worksheets/sheet1.xml'])
  const strings = strFromU8(files['xl/sharedStrings.xml'])
  assert.match(strings, /ID Sesi.*Alasan.*Selisih.*Nominal Serah Terima/s)
  assert.match(strings, /Uang kurang, kasir bilang.*Diperiksa ulang/s)
  assert.match(strings, />=1\+1</)
  assert.doesNotMatch(worksheet, /<f[>\s]/)
  assert.match(worksheet, /<v>-5000<\/v>/)
  assert.match(worksheet, /<v>-1500<\/v>/)
})

test('transaction lists unwrap server aggregates and sales assignments from the success response', async () => {
  const { mapTransactionList } = await import('../src/features/sales/sales-api.ts')
  const mapped = mapTransactionList({
    status: 'success', msg: 'Successfully Get Transaction',
    data: {
      summary: {
        transaction: [{ title: 'transaction', value: 6 }, { title: 'items', value: 12 }],
        summary: [{ title: 'sellings', value: 314685 }, { title: 'changes', value: 16930 }],
        payments: [{ title: 'qris', value: 51615 }, { title: 'cash', value: 263070 }],
        'sales-promotion': [{ title: 'Owner', value: 314685 }],
      },
      data_trx: [{
        trx_id: 'TRX000006', trx_kasir: 'Kasir Kemang Loka 2', trx_sales: { id: '1', name: 'Owner Bazar Kemang1' },
        trx_location: 'Bazar Kemang 2026', trx_branch_name: ' Kemang Loka 2 ', trx_date: '19/11/2026 12:30', trx_total: '11655',
        trx_payment: 'qris', trx_change: '0', trx_total_items: 3, trx_status: 'completed',
      }, {
        trx_id: 'TRXSBNRSS', trx_kasir: 'kasir', trx_location: 'Bazar Kemang 2026', trx_date: '23/11/2026 11:41',
        trx_payment: 'CASH', trx_total: '77000', trx_change: '0', trx_total_items: 2, trx_status: 'pending',
        trx_items: [
          { product_id: 'PE00002', name: 'Kopi Arabika Gayo 200g ', category: 'satuan', img: '',
            price: '65000', description: 'Kopi arabika', discount_type: 'none', discount: '0', qty: 1, price_total: '65000' },
          { product_id: 'PE00003', name: 'Teh Hijau Melati 250ml', category: 'satuan', img: '',
            price: '15000', discount_type: 'fixed', discount: '3000', qty: 1, price_total: '12000' },
        ],
      }],
    },
  })
  assert.deepEqual(mapped.summary, {
    transactions: 6, productsSold: 12, total: 314685, change: 16930,
    paymentTotals: { QRIS: 51615, Tunai: 263070 },
    salesPromotions: [{ name: 'Owner', total: 314685 }],
  })
  assert.deepEqual(mapped.sales[0].salesperson, { id: '1', name: 'Owner Bazar Kemang1' })
  assert.equal(mapped.sales[0].occurredAt, '2026-11-19T12:30:00+07:00')
  assert.equal(mapped.sales[0].total, 11655)
  assert.equal(mapped.sales[0].status, 'complete')
  assert.equal(mapped.sales[0].branchName, 'Kemang Loka 2')
  assert.equal(mapped.sales[0].store, 'Bazar Kemang 2026')
  const [, pending] = mapped.sales
  assert.equal(pending.branchName, undefined)
  assert.equal(pending.status, 'pending')
  assert.equal(pending.paymentMethod, 'Tunai')
  assert.deepEqual(pending.items[0], {
    productId: 'PE00002', title: 'Kopi Arabika Gayo 200g', category: 'satuan', image: '', quantity: 1,
    unitPrice: 65000, lineTotal: 65000, description: 'Kopi arabika', discountType: 'none', discount: 0,
  })
  const { orderTotal, pendingOrderDraft } = await import('../src/features/orders/order-store.ts')
  const order = pendingOrderDraft(pending)
  assert.equal(orderTotal(order), 77000)
  assert.equal(order.items[1].product.discountType, 'Nominal')
  assert.throws(() => mapTransactionList({ status: 'success' }), /Format daftar transaksi/)
  assert.throws(() => mapTransactionList({ status: 'error', msg: 'Transaksi tidak tersedia' }), /Transaksi tidak tersedia/)
})

test('transaction details fetch selected IDs and use historical images, line totals and QRIS proof', async () => {
  const { fetchTransactionDetail, mapTransactionDetail } = await import('../src/features/sales/sales-api.ts')
  const { percentageOf } = await import('../src/features/orders/payment-details.ts')
  const response = {
    trx_id: 'TRXWHSMEY', trx_kasir: 'Muhammad Idris Iswardana', trx_location: 'Jak Japan Matsuri 2026',
    trx_sales: { id: 1, name: 'Owner Bazar Kemang1' }, trx_note: 'Tanpa es',
    trx_date: '01/11/2026 20:22', trx_status: 'completed', trx_payment: 'qris', trx_total: '31720',
    trx_subtotal: '31500', trx_payment_fee: '0.7%',
    trx_nominal: '0', trx_change: '0', trx_total_items: 1,
    trx_products: [{ menu_id: 'PE00001', name: 'DHC Vitamin C ', img: '../../data-assets/upload/menu/PE00001/PE00001.png?v=19?v=11',
      price: '35000', qty: '1', price_total: '31500', discount_type: 'percent', discount: '10' }],
    trx_upload_file: '../../data-assets/upload/transaction/TRXWHSMEY/bukti_pembayaran_TRXWHSMEY.jpg',
  }
  assert.equal(mapTransactionDetail({ ...response, trx_payment_fee_bearer: 'store' }).paymentFee, 0)
  assert.equal(mapTransactionDetail({ ...response, payment_fee_bearer: 'customer' }).paymentFee, 0.7)
  let sent
  api.defaults.adapter = async (config) => { sent = config; return { config, status: 200, headers: {}, data: {
    status: 'success', msg: 'Successfully Get Transaction Detail', data: response,
  } } }
  useAuthStore.getState().setSession({ account: { account_username: 'tester' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  const detail = await fetchTransactionDetail('TRXWHSMEY')
  assert.equal(sent.url, '/transaction/trx')
  assert.deepEqual(sent.params, { action: 'detail_trx', trx_id: 'TRXWHSMEY' })
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token-only')
  assert.equal(detail.status, 'complete')
  assert.equal(detail.total, 31720)
  assert.equal(detail.paymentFee, 0.7)
  assert.equal(percentageOf(detail.subtotal, detail.paymentFee), 220)
  assert.deepEqual(detail.salesperson, { id: '1', name: 'Owner Bazar Kemang1' })
  assert.equal(detail.note, 'Tanpa es')
  assert.equal(detail.items[0].productId, 'PE00001')
  assert.equal(detail.items[0].title, 'DHC Vitamin C')
  assert.equal(detail.items[0].quantity, 1)
  assert.equal(detail.items[0].unitPrice, 35000)
  assert.equal(detail.items[0].lineTotal, 31500)
  assert.equal(detail.items[0].discountType, 'percent')
  assert.equal(detail.items[0].discount, 10)
  const [itemWithoutTotal] = mapTransactionDetail({ ...response, trx_products: [
    { ...response.trx_products[0], price_total: null },
  ] }).items
  assert.equal(itemWithoutTotal.lineTotal, undefined)
  assert.equal(detail.items[0].image, 'https://kasirv2.dhcsupplement.co.id/data-assets/upload/menu/PE00001/PE00001.png?v=19?v=11')
  assert.equal(detail.paymentProof.url, 'https://kasirv2.dhcsupplement.co.id/data-assets/upload/transaction/TRXWHSMEY/bukti_pembayaran_TRXWHSMEY.jpg')
  assert.equal(detail.paymentProof.type, 'image')
  const cash = mapTransactionDetail({ ...response, trx_payment: 'cash', trx_nominal: '50000' })
  assert.equal(cash.paid, 50000)
  assert.deepEqual(cash.paymentProof, detail.paymentProof)
  const edc = mapTransactionDetail({ ...response, trx_payment: 'debit_on_us', trx_upload_file: '  ../../data-assets/bukti.pdf  ' })
  assert.equal(edc.paymentProof.type, 'document')
  assert.equal(edc.paymentProof.url, 'https://kasirv2.dhcsupplement.co.id/data-assets/bukti.pdf')
  for (const trx_upload_file of ['', '  ', null, undefined]) {
    assert.equal(mapTransactionDetail({ ...response, trx_upload_file }).paymentProof, undefined)
  }
  assert.equal(mapTransactionDetail({ ...response, trx_products: [{ ...response.trx_products[0], menu_id: '', img: '?v=00' }] }).items[0].image, '')
  assert.throws(() => mapTransactionDetail({ status: 'error', msg: 'Transaksi tidak ditemukan' }), /Transaksi tidak ditemukan/)
  assert.throws(() => mapTransactionDetail({ status: 'success' }), /Format detail transaksi/)
  await assert.rejects(fetchTransactionDetail('OTHER-ID'), /tidak sesuai/)
  assert.throws(() => mapTransactionDetail({}), /Format detail transaksi/)
  useAuthStore.getState().clearSession()
})

test('cash sessions follow server mode and submit opening, handover and closing fields', async () => {
  const { fetchCurrentCashSession, openCashSession, closeCashSession, handoverCashSession } = await import('../src/features/cash-session/cash-session-api.ts')
  const { cashSessionAllowsSales } = await import('../src/features/cash-session/cash-session-query.ts')
  const session = { session_id: 'SES-1', status: 'open', opening_cash: '200000', cash_in: '450000', expected_cash: '650000', omzet: '720000' }
  let payload = { mode: 'none', use_session: false }
  let sent
  api.defaults.adapter = async (config) => {
    sent = config
    if (config.params.action === 'close_session') {
      throw new AxiosError('Bad Request', 'ERR_BAD_REQUEST', config, undefined, {
        config, status: 400, headers: {}, data: { status: 'error', msg: 'Pesanan belum dibayar', pending_ids: ['TRX-1'] },
      })
    }
    return { config, headers: {}, status: 200, data: { status: 'success', data: payload, warning: 'Sesi kas dibuka di luar jadwal' } }
  }
  const current = await fetchCurrentCashSession()
  assert.equal(sent.url, '/transaction/shift.php')
  assert.deepEqual(sent.params, { action: 'current_session' })
  assert.equal(cashSessionAllowsSales(current), true)
  payload = { mode: 'shift', use_session: true, session: null }
  assert.equal(cashSessionAllowsSales(await fetchCurrentCashSession()), false)
  payload = { mode: 'shift', use_session: true, session }
  assert.equal(cashSessionAllowsSales(await fetchCurrentCashSession()), true)

  payload = session
  const opened = await openCashSession({ shift_code: 'pagi', opening_cash: '200000', notes: '', handover_session_id: 'SES-0' })
  assert.equal(opened.data.opening_cash, 200000)
  assert.equal(opened.warning, 'Shift dibuka di luar jadwal')
  assert.equal(sent.params.action, 'open_session')
  assert.deepEqual(Object.fromEntries(new URLSearchParams(sent.data)), { shift_code: 'pagi', opening_cash: '200000', notes: '', handover_session_id: 'SES-0' })

  payload = { carry_over_note: '1 pesanan ikut dipindah' }
  assert.equal((await handoverCashSession({ session_id: 'SES-1', to_user: '3', amount: '150000', notes: '' })).data.carry_over_note, '1 pesanan ikut dipindah')
  assert.equal(sent.params.action, 'handover')
  await assert.rejects(closeCashSession({ session_id: 'SES-1', closing_cash: '645000', close_notes: 'Selisih kas' }),
    (error) => error.status === 400 && error.pendingIds[0] === 'TRX-1')
  assert.equal(new URLSearchParams(sent.data).get('close_notes'), 'Selisih kas')

  payload = { ...session, status: 'closed' }
  await closeCashSession({ session_id: 'SES-1', closing_cash: '', close_notes: 'Kasir absen' }, true)
  assert.equal(sent.params.action, 'force_close_session')
  assert.equal(new URLSearchParams(sent.data).get('closing_cash'), '')
})

test('percentage fees use the adjusted amount and settled details preserve the recorded fee', async () => {
  const { paymentTotals, pendingPaymentDetails, recordedPaymentTotals } = await import('../src/features/orders/payment-details.ts')
  const order = { id: 'TRX-1', items: [{ quantity: 1, unitPrice: 100000 }] }
  const additionalPrices = [{ title: 'Kemasan', value: 10000 }]
  const discounts = [{ title: 'Voucher', type: 'fixed', value: 20000 }]
  const method = { code: 'qris', kind: 'qris', fee: { type: 'percent', amount: 1 }, feeBearer: 'customer' }
  assert.deepEqual(paymentTotals(order, additionalPrices, discounts, method), {
    subtotal: 100000, methodFeeAmount: 900, discountAmount: 20000, discountAmounts: [20000], taxAmount: 0, total: 90900,
  })
  assert.deepEqual(paymentTotals(order, additionalPrices, discounts, method, 10), {
    subtotal: 100000, methodFeeAmount: 990, discountAmount: 20000, discountAmounts: [20000], taxAmount: 9000, total: 99990,
  })
  assert.equal(paymentTotals(order, additionalPrices, [{ ...discounts[0], value: 200000 }], method).methodFeeAmount, 0)
  const sale = { status: 'complete', paymentFee: 1, additionalPrices, discounts, total: 90900 }
  assert.equal(recordedPaymentTotals(sale, 100000).methodFeeAmount, 900)
  assert.equal(recordedPaymentTotals({ ...sale, total: 91000 }, 100000).methodFeeAmount, 1000)
  const legacy = recordedPaymentTotals({ ...sale, tax: 11, total: 102010 }, 100000)
  assert.equal(legacy.methodFeeAmount, 1010)
  assert.equal(legacy.taxAmount, 11000)
  const pending = pendingPaymentDetails(order, { ...sale, status: 'pending', tax: 11 }, method, method)
  assert.equal(pending.totals.taxAmount, 9900)
  assert.equal(pending.totals.methodFeeAmount, 999)
  assert.equal(pending.updates.total, 100899)
  const existing = { ...sale, status: 'pending', tax: 11, total: 102010 }
  const currentPpn = pendingPaymentDetails(order, existing, method, method, {}, 10)
  assert.equal(currentPpn.totals.taxAmount, 9000)
  assert.deepEqual(currentPpn.updates, { ppn: 10, total: 99990 })
  const inactivePpn = pendingPaymentDetails(order, existing, method, method, {}, 0)
  assert.equal(inactivePpn.totals.taxAmount, 0)
  assert.deepEqual(inactivePpn.updates, { ppn: 0, total: 90900 })
})

test('cash checkout recalculates pending PPN after additional costs and discounts', async () => {
  const { paymentTotals, pendingPaymentDetails, recordedPaymentTotals } = await import('../src/features/orders/payment-details.ts')
  const order = { id: 'TRX-1', items: [{ quantity: 1, unitPrice: 35000 }] }
  const additionalPrices = [{ title: 'Kantong plastik', value: 2000 }]
  const discounts = [{ title: 'Diskon', type: 'fixed', value: 10000 }]
  const cash = { code: 'cash', kind: 'cash' }
  const sale = { status: 'pending', tax: 10, additionalPrices, discounts, total: 30500 }
  const totals = paymentTotals(order, additionalPrices, discounts, cash, 10)

  assert.equal(totals.taxAmount, 2700)
  assert.equal(totals.total, 29700)
  assert.deepEqual(pendingPaymentDetails(order, sale, cash, cash, {}, 10).updates, { total: 29700 })
  assert.equal(recordedPaymentTotals({ ...sale, status: 'complete' }, 35000).taxAmount, 3500)
  assert.equal(recordedPaymentTotals({ ...sale, status: 'complete', total: 29700 }, 35000).taxAmount, 2700)
  assert.equal(recordedPaymentTotals({ ...sale, status: 'complete', tax: undefined, total: 27000 }, 35000).taxAmount, 0)

  const card = { code: 'card', kind: 'edc', fee: { type: 'fixed', amount: 1000 }, feeBearer: 'customer' }
  const cardTotals = paymentTotals(order, additionalPrices, discounts, card, 10)
  assert.equal(cardTotals.taxAmount, 2700)
  assert.equal(cardTotals.total, 30700)
  const recordedCard = { ...sale, status: 'complete', total: 30700, additionalPrices: [...additionalPrices, { title: 'Biaya pembayaran', value: 1000 }] }
  assert.equal(recordedPaymentTotals(recordedCard, 35000).taxAmount, 2700)
})

test('settling a pending transaction posts pay_trx for the existing ID without resending products', async () => {
  const { payPendingTransaction, pendingPaymentDetails, resolvePendingTransaction } = await import('../src/features/orders/payment-details.ts')
  const { fetchPaymentMethods, findRecordedPaymentMethod } = await import('../src/features/orders/payment-methods.ts')
  let sent
  api.defaults.adapter = async (config) => {
    sent = config
    if (config.method === 'get') {
      assert.equal(config.url, '/transaction/trx')
      assert.deepEqual(config.params, { action: 'list_payment' })
      return { config, headers: {}, status: 200, data: { status: 'success', data: [
        { payment_code: 'cash', payment_method: 'Tunai', payment_type: 'cash', is_active: true, fee_active: false },
        { payment_code: 'qris_cabang', payment_method: 'QRIS Cabang', payment_type: 'qris', is_active: true,
          fee: 0.7, fee_type: 'percent', fee_bearer: 'customer', fee_active: true },
      ] } }
    }
    return { config, headers: {}, status: 200, data: {
      status: 'success', msg: 'Pembayaran berhasil, transaksi selesai', trx_id: 'TRX-1', trx_status: 'completed',
    } }
  }
  await resolvePendingTransaction('TRX-1', { methodCode: 'cash', paid: 20000, change: 5000 })
  assert.equal(sent.url, '/transaction/trx')
  assert.equal(sent.method, 'post')
  assert.equal(sent.params, undefined)
  assert.deepEqual(Object.fromEntries(sent.data), {
    action: 'pay_trx', trx_id: 'TRX-1', payment_methods: 'cash', payment_cash_nominal: '20000', payment_cash_change: '5000',
  })

  await resolvePendingTransaction('TRX-1', {})
  assert.deepEqual(Object.fromEntries(sent.data), { action: 'pay_trx', trx_id: 'TRX-1' })

  await resolvePendingTransaction('TRX-1', {
    methodCode: 'qris_edc', paymentFee: 0, ppn: 11, subtotal: 15000, total: 16500,
    additionalPrices: [{ name: 'Kemasan', amount: 500 }],
    discounts: [{ title: 'Promo', type: 'fixed', value: 650 }],
  })
  assert.deepEqual(Object.fromEntries(sent.data), {
    action: 'pay_trx', trx_id: 'TRX-1', payment_methods: 'qris_edc', payment_fee: '0',
    payment_ppn: '11', payment_subtotal: '15000', payment_total_price: '16500',
    'payment_additional_price[0][title]': 'Kemasan', 'payment_additional_price[0][value]': '500',
    'discounts[0][title]': 'Promo', 'discounts[0][type]': 'fixed', 'discounts[0][value]': '650',
  })

  const { payments: methods, ppnRate } = await fetchPaymentMethods()
  assert.equal(ppnRate, undefined)
  const recorded = findRecordedPaymentMethod(methods, 'TUNAI')
  const qris = methods.find(({ kind }) => kind === 'qris')
  const sale = { subtotal: 15000, total: 15500, paymentFee: 0, additionalPrices: [{ title: 'Kemasan', value: 500 }] }
  const order = { id: 'TRX-1', items: [] }
  assert.deepEqual(pendingPaymentDetails(order, sale, recorded, recorded).updates, {})
  const changed = pendingPaymentDetails(order, sale, qris, recorded)
  assert.equal(changed.totals.total, 15609)
  await resolvePendingTransaction(order.id, { ...changed.updates, methodCode: qris.code })
  assert.deepEqual(Object.fromEntries(sent.data), {
    action: 'pay_trx', trx_id: 'TRX-1', payment_methods: 'qris_cabang', payment_fee: '0.7', payment_total_price: '15609',
  })

  const storeQris = { ...qris, feeBearer: 'store' }
  const savedPending = { ...sale, status: 'pending', total: 15605, paymentFee: 0.7 }
  const sameMethod = pendingPaymentDetails(order, savedPending, qris, qris)
  assert.equal(sameMethod.totals.methodFeeAmount, 109)
  assert.deepEqual(sameMethod.updates, { total: 15609 })
  const absorbed = pendingPaymentDetails(order, savedPending, storeQris, storeQris)
  assert.equal(absorbed.totals.methodFeeAmount, 0)
  assert.equal(absorbed.totals.total, 15500)
  assert.deepEqual(absorbed.updates, { paymentFee: 0, total: 15500 })
  await payPendingTransaction({ ...absorbed.totals, order, method: storeQris, ppn: 0, paid: 15500, change: 0 }, absorbed.updates)
  assert.deepEqual(Object.fromEntries(sent.data), {
    action: 'pay_trx', trx_id: 'TRX-1', payment_methods: 'qris_cabang', payment_fee: '0.7',
    payment_ppn: '0', payment_subtotal: '15000', payment_total_price: '15500',
  })
  const settled = pendingPaymentDetails(order, { ...savedPending, status: 'complete' }, storeQris, storeQris)
  assert.equal(settled.totals.total, 15605)
  assert.equal(settled.totals.methodFeeAmount, 105)
  assert.deepEqual(settled.updates, {})

  const withFixedFee = { ...sale, additionalPrices: [...sale.additionalPrices, { title: 'Biaya pembayaran', value: 1000 }] }
  const fixedMethod = { ...recorded, fee: { type: 'fixed', amount: 1000 } }
  assert.deepEqual(pendingPaymentDetails(order, withFixedFee, qris, fixedMethod).updates.additionalPrices, [
    { name: 'Kemasan', amount: 500 },
  ])
  const storeFixed = { ...storeQris, fee: { type: 'flat', amount: 1200 } }
  const savedFixed = { ...withFixedFee, status: 'pending', total: 16500 }
  const absorbedFixed = pendingPaymentDetails(order, savedFixed, storeFixed, storeFixed)
  assert.equal(absorbedFixed.totals.total, 15500)
  assert.deepEqual(absorbedFixed.fees, sale.additionalPrices)
  assert.deepEqual(absorbedFixed.updates, { total: 15500, additionalPrices: [{ name: 'Kemasan', amount: 500 }] })
  const adjustments = pendingPaymentDetails(order, sale, recorded, recorded, {
    additionalPrices: [{ title: 'Kemasan', value: 100 }, { title: 'Layanan', value: 200 }],
    discounts: [{ title: 'Promo', type: 'percent', value: 5 }, { title: 'Voucher', type: 'fixed', value: 200 }],
  })
  await resolvePendingTransaction(order.id, { ...adjustments.updates, methodCode: recorded.code, paid: 15000, change: 665 })
  assert.equal(sent.data.get('payment_total_price'), '14335')
  assert.equal(sent.data.get('payment_additional_price[1][value]'), '200')
  assert.equal(sent.data.get('discounts[1][value]'), '200')

  const cleared = pendingPaymentDetails(order, {
    ...sale, status: 'pending', tax: 11, discounts: [{ title: 'Promo lama', type: 'fixed', value: 500 }],
  }, recorded, recorded, { additionalPrices: [], discounts: [] }, 0)
  await payPendingTransaction({ ...cleared.totals, order, method: recorded, ppn: 0, paid: 20000, change: 5000 }, cleared.updates)
  assert.deepEqual(Object.fromEntries(sent.data), {
    action: 'pay_trx', trx_id: 'TRX-1', payment_methods: 'cash', payment_fee: '0',
    payment_cash_nominal: '20000', payment_cash_change: '5000', payment_ppn: '0',
    payment_subtotal: '15000', payment_total_price: '15000',
    'payment_additional_price[0][title]': 'Kemasan', 'payment_additional_price[0][value]': '0',
    'discounts[0][title]': 'Promo lama', 'discounts[0][type]': 'fixed', 'discounts[0][value]': '0',
  })

  await resolvePendingTransaction('TRX-2')
  assert.equal(sent.params, undefined)
  assert.deepEqual(Object.fromEntries(sent.data), { action: 'cancel_trx', trx_id: 'TRX-2' })

  await assert.rejects(resolvePendingTransaction(' ', {}), /ID transaksi wajib diisi/)
  api.defaults.adapter = async (config) => {
    throw new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, undefined, {
      config, headers: {}, status: 409, data: { status: 'error', msg: 'Status transaksi: completed' },
    })
  }
  await assert.rejects(resolvePendingTransaction('TRX-1', {}), /Status transaksi: completed/)
})

test('sales can edit payment adjustments and cash without transmitting products', async () => {
  const { editSalePayment } = await import('../src/features/orders/payment-details.ts')
  const sale = {
    id: 'TRX-1', status: 'complete', subtotal: 15000, total: 14500, paid: 20000, paymentFee: 0,
    salesId: 'U-0012', items: [{ productId: 'P1', quantity: 1, lineTotal: 15000 }],
    additionalPrices: [{ title: 'Kemasan', value: 500 }], discounts: [{ title: 'Promo', value: 1000, type: 'fixed' }],
  }
  const cash = { code: 'cash', title: 'Tunai', kind: 'cash' }
  const changes = { method: cash, recordedMethod: cash, paid: 20000, additionalPrices: [], discounts: [] }
  const requests = []
  api.defaults.adapter = async (config) => {
    requests.push(config)
    return { config, headers: {}, status: 200, data: { status: 'success' } }
  }
  await editSalePayment(sale, changes)
  assert.equal(requests[0].method, 'post')
  assert.equal(requests[0].url, '/transaction/trx')
  assert.deepEqual(Object.fromEntries(requests[0].data), {
    action: 'edit_trx', trx_id: 'TRX-1', payment_methods: 'cash', payment_total_price: '15000',
    payment_cash_nominal: '20000', payment_cash_change: '5000',
    'payment_additional_price[0][title]': 'Kemasan', 'payment_additional_price[0][value]': '0',
    'discounts[0][title]': 'Promo', 'discounts[0][value]': '0', 'discounts[0][type]': 'fixed',
  })
  await editSalePayment(sale, { method: { code: 'qris_edc', kind: 'noncash', fee: { type: 'percent', amount: 1 }, feeBearer: 'customer' }, recordedMethod: cash })
  assert.deepEqual(Object.fromEntries(requests[1].data), {
    action: 'edit_trx', trx_id: 'TRX-1', payment_methods: 'qris_edc', payment_total_price: '14645',
    payment_fee: '1', payment_cash_nominal: '0', payment_cash_change: '0',
  })
  const qris = { code: 'qris_cabang', kind: 'qris', paymentType: 'qris' }
  const proof = new File(['bukti-baru'], 'qris-baru.png', { type: 'image/png' })
  await editSalePayment(sale, { method: qris, recordedMethod: qris, proof })
  const proofPayload = requests[2].data
  assert.equal(proofPayload.get('action'), 'edit_trx')
  assert.equal(proofPayload.get('trx_id'), 'TRX-1')
  assert.equal(proofPayload.get('payment_methods'), 'qris_cabang')
  assert.equal(proofPayload.get('payment_upload_file').name, 'qris-baru.png')
  assert.equal(await proofPayload.get('payment_upload_file').text(), 'bukti-baru')
  await editSalePayment(sale, { method: qris, recordedMethod: qris })
  assert.equal(requests[3].data.has('payment_upload_file'), false)
  await assert.rejects(editSalePayment(sale, { method: { ...qris, code: 'qris', paymentType: 'edc' }, proof }), /hanya tersedia untuk metode QRIS/)
  const oversizedProof = new File([new Uint8Array(100_000)], 'besar.png', { type: 'image/png' })
  await assert.rejects(editSalePayment(sale, { method: qris, recordedMethod: qris, proof: oversizedProof }), /di bawah 100 KB/)
  await assert.rejects(editSalePayment(sale, { ...changes, paid: 10000 }), /Nominal tunai/)
  await assert.rejects(editSalePayment({ ...sale, status: 'delete' }, changes), /tidak dapat diedit/)
  assert.equal(requests.length, 4)
})

test('refunds use edit_trx and return the cash amount and net revenue confirmed by the server', async () => {
  const { refundSale } = await import('../src/features/orders/payment-details.ts')
  const sale = { id: 'TRX-1', status: 'complete', total: 19980, paid: 20000 }
  const partialSale = { ...sale, id: 'TRX-2' }
  const full = { isPartial: false, reason: '  Barang kosong  ' }
  const partial = { isPartial: true, nominal: 7250.5, reason: '  Harga dikoreksi\nPelanggan setuju  ' }
  const fullResponse = { status: 'success', trx_id: sale.id, trx_status: 'refund_full',
    refund: { amount: 19980, method: 'cash', reason: 'Barang kosong' }, omzet: 0, restored: 2 }
  const partialResponse = { status: 'success', trx_id: partialSale.id, trx_status: 'refund_partial',
    refund: { amount: 7250.5, method: 'cash', reason: 'Harga dikoreksi\nPelanggan setuju' }, omzet: 12729.5 }
  const requests = []
  useAuthStore.getState().setSession({ account: { account_username: 'tester' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  try {
    api.defaults.adapter = async (config) => {
      assert.equal(config.url, '/transaction/trx')
      assert.equal(config.method, 'post')
      assert.equal(config.headers.get('Authorization'), 'Bearer test-token-only')
      requests.push(Object.fromEntries(config.data))
      const data = config.data.get('trx_id') === sale.id ? fullResponse : partialResponse
      return { config, status: 200, headers: {}, data }
    }
    assert.deepEqual(await refundSale(sale, full), {
      id: sale.id, status: 'refund_full', refund: { ...fullResponse.refund, restored: 2 }, netRevenue: 0,
    })
    assert.deepEqual(await refundSale(partialSale, partial), {
      id: partialSale.id, status: 'refund_partial', refund: { ...partialResponse.refund, restored: undefined }, netRevenue: 12729.5,
    })
    for (const status of ['pending', 'delete', 'refund_full', 'refund_partial']) {
      await assert.rejects(refundSale({ ...sale, status }, full), /transaksi lunas/)
    }
    for (const option of [full, partial]) {
      await assert.rejects(refundSale(sale, { ...option, reason: ' \n ' }), /Alasan refund wajib/)
    }
    for (const nominal of [0, -10, NaN, Infinity, sale.total, sale.total + 1]) {
      await assert.rejects(refundSale(sale, { ...partial, nominal }), /Nominal refund parsial/)
    }
    assert.deepEqual(requests, [
      { action: 'edit_trx', trx_id: sale.id, refund_status: 'refund_full', refund_reason: 'Barang kosong' },
      { action: 'edit_trx', trx_id: partialSale.id, refund_status: 'refund_partial', refund_amount: '7250.5', refund_reason: 'Harga dikoreksi\nPelanggan setuju' },
    ])

    let release
    const pending = new Promise((resolve) => { release = resolve })
    api.defaults.adapter = async (config) => {
      await pending
      return { config, status: 200, headers: {}, data: fullResponse }
    }
    const first = refundSale(sale, full)
    await assert.rejects(refundSale(sale, full), /sedang diproses/)
    release()
    await first

    api.defaults.adapter = async (config) => {
      throw new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, undefined, {
        config, headers: {}, status: 409, data: { status: 'error', msg: 'Status sekarang: refund_full' },
      })
    }
    await assert.rejects(refundSale(sale, full), /Status sekarang: refund_full/)

    api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: {
      status: 'success', trx_id: sale.id, trx_status: 'completed',
    } })
    await assert.rejects(refundSale(sale, full), /belum mengonfirmasi refund/)
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('sales keep the original receipt total and use the reported refund revenue', async () => {
  const { mapTransactionDetail, mapTransactionList } = await import('../src/features/sales/sales-api.ts')
  const sale = { trx_kasir: 'Kasir', trx_location: 'Toko', trx_date: '23/11/2026 11:41',
    trx_total: '19980', trx_payment: 'qris', trx_total_items: 2, trx_change: '0' }
  const partial = { ...sale, trx_id: 'TRXEC6SZD', trx_total: '35000', trx_total_items: 1,
    trx_status: 'refund_partial', trx_net_total: 30000,
    trx_refund: { status: 'refund_partial', is_refund: true, amount: 5000, method: 'cash', reason: 'test',
      refunded_at: '2026-11-25 18:47:32', refunded_by: '13' } }
  const { sales, summary } = mapTransactionList({ summary: [], data_trx: [
    partial,
    { ...sale, trx_id: 'TRX-2', trx_status: 'refund_full', omzet: 0, restored: 2,
      refund_amount: '19980', refund_method: 'cash', refund_note: 'Barang kosong' },
  ] })
  assert.deepEqual(sales.map(({ status, total, netRevenue }) => ({ status, total, netRevenue })), [
    { status: 'refund_partial', total: 35000, netRevenue: 30000 },
    { status: 'refund_full', total: 19980, netRevenue: 0 },
  ])
  assert.deepEqual(sales[0].refund, { amount: 5000, method: 'cash', reason: 'test', restored: undefined })
  const detail = mapTransactionDetail({ ...partial, trx_products: [], trx_nominal: '35000' })
  assert.deepEqual(detail.refund, sales[0].refund)
  assert.equal(detail.netRevenue, 30000)
  assert.deepEqual(sales[1].refund, { amount: 19980, method: 'cash', reason: 'Barang kosong', restored: 2 })
  assert.equal(summary.total, 30000)
  assert.equal(summary.productsSold, 1)
})

test('editing pending products recalculates the total and preserves stored payment fields', async () => {
  const { editPendingOrder } = await import('../src/features/orders/payment-details.ts')
  const { mapTransactionDetail } = await import('../src/features/sales/sales-api.ts')
  const { pendingOrderDraft } = await import('../src/features/orders/order-store.ts')
  const { changePendingQuantity } = await import('../src/features/orders/pending-order-edit.ts')
  const response = {
    trx_id: 'TRX-1', trx_kasir: 'Kasir', trx_location: 'Toko', trx_branch: 'BC-001',
    trx_date: '23/11/2026 11:41', trx_total: '19906', trx_ppn: '11', trx_payment: 'qris_edc', trx_payment_fee: '0.7%',
    trx_change: '0', trx_nominal: '0', trx_sales: { id: 'U-0012', name: 'Sales' },
    trx_additional_price: [{ title: 'Kemasan', value: '1200' }, { title: 'Layanan', value: '700' }],
    trx_discount: [{ title: 'Promo', value: '5', type: 'percent' }, { title: 'Voucher', value: '1000', type: 'fixed' }],
    trx_total_items: 2, trx_status: 'pending', trx_upload_file: '',
    trx_products: [{ product_id: 'P1', name: 'Kopi', price: '10000', qty: 2, price_total: '18000',
      img: '', category: 'minuman', discount_type: 'percent', discount: 10 }],
  }
  const transaction = mapTransactionDetail(response)
  const original = pendingOrderDraft(transaction)
  const existing = { ...original.items[0].product, price: 12000, stock: 1 }
  const product = { ...existing, id: 'P2', title: 'Teh', price: 6000, discountType: 'Tanpa diskon' }
  assert.equal(changePendingQuantity(original, original, 'P1', 4, existing), original)
  assert.equal(changePendingQuantity(original, original, 'P1', 4, { ...existing, useStock: false, stock: 0 }).items[0].quantity, 4)
  const adjusted = changePendingQuantity(original, original, 'P1', 3, existing)
  const order = changePendingQuantity(adjusted, original, 'P2', 1, product)
  assert.equal(order.items[0].unitPrice, 9000)
  const requests = []
  let saved = response
  api.defaults.adapter = async (config) => {
    requests.push(config)
    if (config.method === 'get') return { config, headers: {}, status: 200, data: { status: 'success', data: saved } }
    const products = [{ ...response.trx_products[0], qty: Number(config.data.get('product[0][product_qty]')),
      price_total: config.data.get('product[0][product_price_total]') }]
    if (config.data.has('product[1][product_id]')) {
      products.push({ product_id: 'P2', name: 'Teh', price: '6000', qty: 1, price_total: '6000', img: '' })
    }
    saved = { ...response, trx_total: config.data.get('payment_total_price'), trx_products: products }
    return { config, headers: {}, status: 200, data: { status: 'success' } }
  }
  await editPendingOrder(order, transaction)
  assert.deepEqual(requests.map(({ method }) => method), ['post', 'get'])
  assert.equal(requests[0].url, '/transaction/trx')
  assert.equal(requests[0].params, undefined)
  assert.deepEqual(requests[1].params, { action: 'detail_trx', trx_id: 'TRX-1' })
  assert.deepEqual(Object.fromEntries(requests[0].data), {
    action: 'edit_trx', trx_id: 'TRX-1', sales: 'U-0012', payment_subtotal: '33000', payment_total_price: '35942',
    payment_methods: 'qris_edc', payment_fee: '0.7', payment_cash_nominal: '0', payment_cash_change: '0',
    'payment_additional_price[0][title]': 'Kemasan', 'payment_additional_price[0][value]': '1200',
    'payment_additional_price[1][title]': 'Layanan', 'payment_additional_price[1][value]': '700',
    'discounts[0][title]': 'Promo', 'discounts[0][value]': '5', 'discounts[0][type]': 'percent',
    'discounts[1][title]': 'Voucher', 'discounts[1][value]': '1000', 'discounts[1][type]': 'fixed',
    'product[0][product_id]': 'P1', 'product[0][product_name]': 'Kopi', 'product[0][product_qty]': '3',
    'product[0][product_price]': '10000', 'product[0][product_price_total]': '27000', 'product[0][product_category]': 'minuman',
    'product[0][product_discount_type]': 'percent', 'product[0][product_discount]': '10',
    'product[1][product_id]': 'P2', 'product[1][product_name]': 'Teh', 'product[1][product_qty]': '1',
    'product[1][product_price]': '6000', 'product[1][product_price_total]': '6000', 'product[1][product_category]': 'minuman',
    'product[1][product_discount_type]': 'none', 'product[1][product_discount]': '0',
  })
  const reduced = changePendingQuantity(original, original, 'P1', 1, existing)
  await editPendingOrder(reduced, transaction)
  assert.equal(requests[2].data.get('payment_subtotal'), '9000')
  assert.equal(requests[2].data.get('payment_total_price'), '10457')
  await assert.rejects(editPendingOrder({ ...order, items: [] }, transaction), /Tambahkan produk/)
  assert.equal(requests.length, 4)

  api.defaults.adapter = async (config) => {
    requests.push(config)
    throw new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, undefined, {
      config, headers: {}, status: 409, data: { status: 'error', msg: 'Pesanan sudah dibayar' },
    })
  }
  await assert.rejects(editPendingOrder(order, transaction), /Pesanan sudah dibayar/)
  assert.deepEqual(requests.map(({ method }) => method), ['post', 'get', 'post', 'get', 'post'])
})

test('profile changes upload binary images and preserve authentication and remember preference', async () => {
  const { saveProfile } = await import('../src/features/profile/profile-api.ts')
  const { profileImageUrl } = await import('../src/features/profile/profile-image.ts')
  const expiresAt = Date.now() + 60_000
  const session = { account: { account_username: 'old', account_id: '07251010040', event_id: 'store-0328' }, token: 'test-token-only', expiresAt }
  const profile = { id: session.account.account_id, username: 'admin', fullname: 'Jimmy Hermanto',
    img: '../../data-assets/upload/users/2/profile-2.jpg?v=14', email: 'admin@example.com',
    phone: '', address: '', store_id: 'store-0328', branch_id: 'BC-001' }
  let sent
  api.defaults.adapter = async (config) => {
    sent = config
    return { config, status: 200, headers: {}, data: { status: 'success', msg: 'Profile saved', data: profile } }
  }
  const image = new File(['profile-image'], 'avatar.png', { type: 'image/png' })
  useAuthStore.getState().setSession(session, true)
  const result = await saveProfile({ image, username: ' admin ', fullname: ' Jimmy Hermanto ', phone: '' })
  assert.deepEqual(result, { profile, message: 'Profile saved' })
  assert.equal(sent.url, '/profile/profile')
  assert.equal(sent.method, 'post')
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token-only')
  assert.equal(sent.data.get('action'), 'edit_profile')
  assert.equal(sent.data.has('user_id'), false)
  assert.equal(sent.data.get('username'), 'admin')
  assert.equal(sent.data.get('fullname'), 'Jimmy Hermanto')
  assert.equal(sent.data.has('email'), false)
  assert.equal(sent.data.get('phone'), '')
  assert.equal(sent.data.has('address'), false)
  assert.equal(sent.data.get('img').name, 'avatar.png')
  assert.equal(await sent.data.get('img').text(), 'profile-image')
  const version = Date.now() + 60_000
  const freshPhoto = new URL(profileImageUrl(profile.img, version))
  assert.equal(freshPhoto.searchParams.get('v'), '14')
  assert.equal(freshPhoto.searchParams.get('profile_v'), String(version))
  assert.notEqual(freshPhoto.href, profileImageUrl(profile.img))
  useAuthStore.getState().updateAccount({ account_username: 'admin', account_fullname: 'Jimmy Hermanto', account_img: profile.img, account_img_version: version })
  assert.equal(getAuthSession().token, 'test-token-only')
  assert.equal(getAuthSession().expiresAt, expiresAt)
  assert.equal(getAuthSession().account.event_id, 'store-0328')
  assert.equal(sessionStorage.getItem('kasirv2.auth'), null)
  assert.equal(JSON.parse(localStorage.getItem('kasirv2.auth')).account.account_fullname, 'Jimmy Hermanto')
  assert.equal(JSON.parse(localStorage.getItem('kasirv2.auth')).account.account_img_version, version)
  const { account_img_version, ...serverAccount } = getAuthSession().account
  useAuthStore.getState().replaceSessionTokens('test-token-only', { token: 'next-token', expiresAt }, serverAccount)
  assert.equal(getAuthSession().account.account_img_version, account_img_version)
  useAuthStore.getState().setSession(session, false)
  useAuthStore.getState().updateAccount({ account_email: 'admin@example.com' })
  assert.equal(localStorage.getItem('kasirv2.auth'), null)
  assert.equal(JSON.parse(sessionStorage.getItem('kasirv2.auth')).account.account_email, 'admin@example.com')
  await saveProfile({ fullname: 'Jimmy' })
  assert.deepEqual(Object.fromEntries(sent.data), { fullname: 'Jimmy', action: 'edit_profile' })
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { status: 'error', msg: 'Update denied' } })
  await assert.rejects(saveProfile({ username: 'admin' }), /Update denied/)
  useAuthStore.getState().clearSession()
})

test('opening a restored profile refreshes its account and photo once per page load', async () => {
  const { refreshStoredProfile } = await import('../src/features/profile/profile-api.ts')
  const now = Date.now()
  const account = { account_id: '2', account_username: 'kasir', account_img: '/old.jpg' }
  useAuthStore.getState().setSession({ account, token: 'old-access', expiresAt: now + 60_000,
    sessionId: 'session-profile', refresh: { token: 'old-refresh', expiresAt: now + 120_000 } }, false)
  assert.equal(refreshStoredProfile(), undefined)
  useAuthStore.setState({ sessionVersion: 0 })
  let requests = 0
  api.defaults.adapter = async (config) => {
    requests++
    assert.equal(config.url, '/login.php')
    assert.deepEqual(Object.fromEntries(config.data), { action: 'refresh', refresh_token: 'old-refresh' })
    return { config, status: 200, headers: {}, data: { status: 'success', data: {
      user: { id: '2', username: 'kasir', img: '/baru.jpg' }, store: { id: 'EVT-001' },
      access: { token: 'new-access', expires_in: 60, session_id: 'session-profile' },
      refresh: { token: 'new-refresh', expires_in: 120 },
    } } }
  }
  try {
    await refreshStoredProfile()
    assert.equal(getAuthSession().account.account_img, '/baru.jpg')
    assert.equal(JSON.parse(sessionStorage.getItem('kasirv2.auth')).account.account_img, '/baru.jpg')
    assert.equal(refreshStoredProfile(), undefined)
    assert.equal(requests, 1)
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('own password verification and rotation use the profile endpoint and replace both tokens', async () => {
  const { verifyCurrentPassword, changePassword } = await import('../src/features/profile/profile-api.ts')
  const account = { account_id: '2', account_username: 'kasir01', account_role: 'kasir' }
  const session = { account, token: 'old-access', expiresAt: Date.now() + 60_000,
    refresh: { token: 'old-refresh', expiresAt: Date.now() + 120_000 } }
  const payload = {
    token: 'legacy-access', expired: 30,
    access: { token: 'new-access', expires_in: 900, session_id: 'next-session' },
    refresh: { token: 'new-refresh', expires_in: 86400 },
  }
  let sent
  api.defaults.adapter = async (config) => {
    sent = config
    if (config.data?.get('pass') === 'wrong') {
      throw new AxiosError('Bad request', 'ERR_BAD_REQUEST', config, undefined,
        { config, status: 400, headers: {}, data: { status: 'error', msg: 'Wrong old password' } })
    }
    return { config, status: 200, headers: {}, data: { status: 'success', data: payload } }
  }
  for (const remember of [true, false]) {
    useAuthStore.getState().setSession(session, remember)
    await assert.rejects(verifyCurrentPassword('wrong'), (error) => error.response?.data?.msg === 'Wrong old password')
    assert.equal(getAuthSession().token, 'old-access')
    await verifyCurrentPassword(' old password ')
    assert.equal(sent.method, 'post')
    assert.equal(sent.url, '/profile/profile')
    assert.deepEqual(Object.fromEntries(sent.data), { pass: ' old password ', action: 'old_pass' })
    await changePassword(' new password ')
    assert.equal(sent.url, '/profile/profile')
    assert.equal(sent.headers.get('Authorization'), 'Bearer old-access')
    assert.deepEqual(Object.fromEntries(sent.data), { pass: ' new password ', action: 'new_pass' })
    const updated = getAuthSession()
    assert.deepEqual(updated.account, account)
    assert.equal(updated.token, 'new-access')
    assert.equal(updated.sessionId, 'next-session')
    assert.equal(updated.refresh.token, 'new-refresh')
    assert.equal(updated.refresh.expiresAt - updated.expiresAt, 85_500_000)
    const storage = remember ? localStorage : sessionStorage
    assert.deepEqual(JSON.parse(storage.getItem('kasirv2.auth')), updated)
    assert.equal((remember ? sessionStorage : localStorage).getItem('kasirv2.auth'), null)
    await api.get('/protected-test')
    assert.equal(sent.headers.get('Authorization'), 'Bearer new-access')
  }

  const updatedSession = getAuthSession()
  useAuthStore.getState().setSession(session, false)
  api.defaults.adapter = async (config) => {
    useAuthStore.getState().setSession(updatedSession, false)
    throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined,
      { config, status: 401, headers: {}, data: {} })
  }
  await assert.rejects(api.get('/protected-test'))
  assert.equal(getAuthSession().token, 'new-access')

  useAuthStore.getState().setSession(session, false)
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { status: 'success' } })
  await assert.rejects(changePassword('new password'), /Silakan login kembali/)
  assert.equal(getAuthSession(), null)
})

test('admin demo reset posts only the action, preserves the session and replaces stale branches and drafts', async () => {
  const { resetDemoData } = await import('../src/features/profile/demo-reset-api.ts')
  const { useOrderStore } = await import('../src/features/orders/order-store.ts')
  const store = { id: 'EVT-002', name: 'Demo', branch_id: 'BC-004', branches: [{ id: 'BC-004', name: 'Cabang lama' }] }
  const account = { account_id: 'admin', account_username: 'admin', account_role: 'admin', store }
  const session = { account, adminBranchId: 'BC-004', token: 'demo-test-token', expiresAt: Date.now() + 60_000 }
  let calls = 0
  let body = { status: 'error', msg: 'Reset gagal' }
  api.defaults.adapter = async (config) => {
    calls++
    assert.equal(config.url, '/admin/reset.php')
    assert.equal(config.method, 'post')
    assert.equal(config.headers.get('Authorization'), 'Bearer demo-test-token')
    assert.deepEqual(Object.fromEntries(config.data.entries()), { action: 'reset_demo' })
    return { config, status: 200, headers: {}, data: body }
  }
  useAuthStore.getState().setSession({ ...session, account: { ...account, account_role: 'kasir' } }, false)
  try {
    await assert.rejects(resetDemoData(), /mode admin/)
    assert.equal(calls, 0)
    useAuthStore.getState().setSession(session, false)
    useOrderStore.getState().initialize(account.account_id)
    const draft = useOrderStore.getState().createOrder()
    await assert.rejects(resetDemoData(), /Reset gagal/)
    assert.equal(useOrderStore.getState().activeId, draft)
    assert.deepEqual(useAuthStore.getState().session, session)
    body = { status: 'success', data: { branch_reset: [
      { store_id: 'EVT-001', branch_id: 'BC-001', branch_name: 'Cabang Pusat' },
      { store_id: 'EVT-002', branch_id: 'BC-002', branch_name: 'Cabang Pusat' },
    ] } }
    assert.equal(await resetDemoData(), true)
    assert.equal(calls, 2)
    assert.deepEqual(useAuthStore.getState().session, {
      ...session,
      adminBranchId: 'BC-002',
      account: { ...account, store: { ...store, branch_id: 'BC-002', branches: [{ id: 'BC-002', name: 'Cabang Pusat' }] } },
    })
    assert.deepEqual(useOrderStore.getState().orders, [])
  } finally {
    useAuthStore.getState().clearSession()
  }
})

test('queued orders remain independent, editable and stock-limited across customer drafts', async () => {
  const { useOrderStore, orderTotal } = await import('../src/features/orders/order-store.ts')
  const { sampleProducts } = await import('../src/features/products/sample-products.ts')
  const product = { ...sampleProducts[0], stock: 5, price: 100000, discount: 10, discountType: 'Persentase (%)' }
  const store = () => useOrderStore.getState()
  store().initialize('cashier-A')
  assert.equal(store().orders.length, 0)
  assert.equal(store().addItem(product, 2), null)
  const firstId = store().activeId
  assert.equal(store().orders[0].name, 'Antrian #1')
  assert.equal(orderTotal(store().orders[0]), 180000)
  const secondId = store().createOrder()
  assert.equal(store().orders[1].name, 'Antrian #2')
  assert.equal(store().addItem(product, 3), null)
  assert.ok(store().addItem(product, 1), 'Drafts cannot reserve more units than stock')
  assert.equal(store().orders[0].items[0].quantity, 2)
  assert.equal(store().orders[1].items[0].quantity, 3)
  store().selectOrder(firstId)
  assert.equal(store().setQuantity(product, 1), null)
  store().selectOrder(secondId)
  assert.equal(store().addItem(product, 1), null)
  assert.equal(store().orders[1].items[0].quantity, 4)
  assert.ok(store().addItem({ ...product, active: false }, 1))
  assert.ok(store().addItem({ ...product, stock: 0 }, 1))
  assert.ok(store().addItem(product, 1.5))
  assert.ok(store().addItem(product, -1))
  assert.ok(store().setQuantity(product, Number.NaN))
  assert.equal(store().setQuantity({ ...product, stock: 0, active: false }, 3), null)
  assert.equal(store().setQuantity(product, 0), null)
  assert.equal(store().orders[1].items.length, 0)
  const saved = JSON.parse(sessionStorage.getItem('kasirv2.order-drafts'))
  assert.equal(saved.state.orders[0].name, 'Antrian #1')
  assert.equal(saved.state.activeId, secondId)
  store().removeOrder(secondId)
  assert.equal(store().activeId, firstId)
  store().removeOrder(firstId)
  assert.equal(store().orders.length, 0)
  assert.equal(store().activeId, null)
  assert.equal(store().nextNumber, 1)
  store().initialize('cashier-A')
  assert.equal(store().orders.length, 0)
  assert.ok(store().addItem(product, 6))
  assert.equal(store().orders.length, 0)
  store().createOrder()
  assert.equal(store().orders[0].name, 'Antrian #1')
  store().initialize('cashier-B')
  assert.equal(store().owner, 'cashier-B')
  assert.equal(store().orders.length, 0)
  const untracked = { ...product, useStock: false, stock: 0 }
  assert.equal(store().addItem(untracked, 6), null)
  store().createOrder()
  assert.equal(store().addItem(untracked, 9), null)
  useAuthStore.getState().setSession({ account: { account_id: 'cashier-B', account_username: 'tester' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  useAuthStore.getState().clearSession()
  assert.equal(store().orders.length, 0)
})
