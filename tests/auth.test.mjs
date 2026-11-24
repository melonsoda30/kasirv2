import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
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
  const session = await login(' tester ', 'test-password', false)
  assert.equal(sent.url, '/login')
  assert.equal(sent.method, 'post')
  assert.equal(sent.baseURL, 'https://kasirv2.dhcsupplement.co.id/API')
  assert.deepEqual(Object.fromEntries(sent.data.entries()), {
    action: 'login', username: 'tester', password: 'test-password', rememberme: '0',
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
  const updatedSession = await login('tester', 'test-password', false)
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
  await login('tester', 'test-password', true)
  assert.equal(sent.data.get('rememberme'), '1')
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
  await assert.rejects(login('tester', 'incorrect', false))
  assert.ok(getAuthSession(), 'A failed login must not clear an existing session')
  await assert.rejects(api.get('/protected-test'))
  assert.equal(getAuthSession(), null)
  assert.equal(localStorage.values.size, 0)

  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { message: 'Invalid credentials' } })
  await assert.rejects(login('tester', 'incorrect', false), /Invalid credentials/)
  assert.equal(getAuthSession(), null)
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
    await changeUser({ action: 'edit_user', userId: '4', fields: { address: '', is_cashier: false } })
    await changeUser({ action: 'edit_user', userId: '4', fields: { branch_id: ' BC-002 ' } })
    await changeUser({ action: 'status_user', userId: '4', status: 'noactive' })
    await changeUser({ action: 'status_user', userId: '4', status: 'active' })
    assert.deepEqual(calls, [
      { action: 'add_user', username: 'kasir04', fullname: 'Kasir', is_cashier: '1', password: ' test password ', branch_id: 'BC-001' },
      { action: 'add_user', username: 'admin04', level_user: 'Administrator' },
      { action: 'edit_user', user_id: '4', address: '', is_cashier: '0' },
      { action: 'edit_user', user_id: '4', branch_id: 'BC-002' },
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

test('dashboard requests all five GET actions in the current session scope without extra parameters', async () => {
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
    total_earning: { ...chart, today_earning: 0, yesterday_earning: 19980, grow: '-100 %' },
    profit_statistic: { ...chart, datasets: [{ label: 'Profit ', data: [-500, 0] }] },
    best_sales: [{ sales_nip: '2', sales_foto: null, sales_name: 'Kasir Demo', sales_earning: '19980' }],
    trending_product: { days: ['1', '2', '3'], data: [
      { product_img: 'photo.png', product_name: 'Paket Hemat', qtyPerDays: ['0', '2', '0'] },
    ] },
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
      assert.equal(config.url, '/admin/dashboard')
      assert.equal(config.method, 'get')
      assert.equal(config.headers.get('Authorization'), 'Bearer test-token-only')
      assert.equal(config.signal, signal)
      const { action } = config.params
      assert.deepEqual(config.params, { action })
      calls.push(action)
      const payload = responses[action]
      return { config, status: 200, headers: {}, data: action === 'best_sales' ? payload : { status: 'success', data: payload } }
    }
    assert.deepEqual(await fetchDashboard('total_earning', signal), responses.total_earning)
    assert.deepEqual(await fetchDashboard('profit_statistic', signal), responses.profit_statistic)
    assert.deepEqual(await fetchDashboard('best_sales', signal), [{ ...responses.best_sales[0], sales_earning: 19980 }])
    assert.deepEqual((await fetchDashboard('trending_product', signal)).data[0].qtyPerDays, [0, 2, 0])
    assert.deepEqual(await fetchDashboard('session_summary', signal), summary)
    assert.deepEqual(calls, Object.keys(responses))
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

test('product catalog maps API records and sends fixed all-branch params with bearer authorization', async () => {
  const { fetchProducts, mapProductRecord } = await import('../src/features/products/product-api.ts')
  const { useProductStore } = await import('../src/features/products/product-store.ts')
  const menu = {
    status: 'active', product_sku: 'PE00048', store_id: 'store-0328',
    branch_id: 'BC-001', stock_quantity: 900,
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
  assert.deepEqual(sent.params, { action: 'list_product', category: 'all', search: '', status: 'all', menu_id: 'all', branch_id: 'all' })
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token-only')
  assert.deepEqual(products[0], {
    id: 'PE00048', title: 'DHC Perfect UV Milk', price: 295000, category: 'satuan', categoryName: 'Satuan',
    store: 'store-0328', storeId: 'store-0328', branchId: 'BC-001',
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
  assert.equal(useProductStore.getState().products.length, 0)
  useProductStore.getState().setProducts(products)
  assert.equal(useProductStore.getState().products.length, 1)
  useAuthStore.getState().clearSession()
  assert.equal(useProductStore.getState().products.length, 0)
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: [menu] })
  assert.deepEqual(await fetchProducts(), products)
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { status: 'error', msg: 'Menu unavailable', data: [] } })
  await assert.rejects(fetchProducts(), /Menu unavailable/)
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { message: 'Invalid response' } })
  await assert.rejects(fetchProducts(), /Format daftar produk/)
})

test('Order reads the product endpoint and maps branch stock, discounts, and category labels from list_product', async () => {
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
    let body = { status: 'success', msg: 'Successfully Get Products', data: [
      product,
      { ...product, branch: 'BC-002', status: 'noactive', stock: 0, img: 'photo.png', discount_type: 'percent', discount: '10' },
    ] }
    api.defaults.adapter = async (config) => {
      assert.equal(config.url, '/product/product')
      assert.equal(config.method, 'get')
      assert.deepEqual(config.params, { action: 'list_product' })
      assert.equal(config.signal, signal)
      assert.equal(config.headers.get('Authorization'), 'Bearer test-token-only')
      return { config, status: 200, headers: {}, data: body }
    }
    const [available, inactive] = await fetchOrderProducts(signal)
    assert.deepEqual(available, {
      id: 'PE00004', title: 'Air Mineral 600ml', store: 'EVT-001', storeId: 'EVT-001', branchId: 'BC-001',
      category: 'satuan', categoryName: 'Satuan', price: 3500, photo: '', image: '',
      description: 'Air mineral dalam kemasan 600ml', discount: 0, discountType: 'Tanpa diskon', active: true, stock: 100,
    })
    assert.equal(inactive.stock, 0)
    assert.equal(inactive.active, false)
    assert.equal(inactive.discount, 10)
    assert.equal(inactive.discountType, 'Persentase (%)')
    assert.equal(inactive.photo, 'https://kasirv2.dhcsupplement.co.id/API/product/photo.png')
    assert.notEqual(productKey(available), productKey(inactive))
    body = []
    assert.deepEqual(await fetchOrderProducts(signal), [])
    body = { status: 'error', msg: 'Produk tidak tersedia' }
    await assert.rejects(fetchOrderProducts(signal), /Produk tidak tersedia/)
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

test('POS payment methods preserve custom codes and handle inactive and missing fees', async () => {
  const { fetchPaymentMethods } = await import('../src/features/orders/payment-methods.ts')
  const { paymentTotals, savePayment } = await import('../src/features/orders/payment-details.ts')
  const edc = {
    payment_code: 'qris_edc', payment_method: 'EDC QRIS', payment_type: 'edc',
    fee_code: 'qris_edc', fee: 0.7, fee_type: 'percent', image: '',
    is_active: true, fee_active: true, fee_found: true,
  }
  const signal = new AbortController().signal
  const cashier = { account_id: '2', account_username: 'kasir', event_level: 'kasir' }
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
      return { config, status: 200, headers: {}, data: { status: 'success', data: [
        edc,
        { ...edc, payment_code: 'debit_off_us', fee_active: false },
        { ...edc, payment_code: 'credit_on_us', fee_found: false, fee_active: false },
        { ...edc, payment_code: 'disabled', is_active: false },
        { ...edc, payment_code: 'cash', payment_type: 'cash', fee_code: null, fee_active: false, fee_found: false },
        { ...edc, payment_code: 'qris_cabang', payment_type: 'qris', fee_code: null, image: '../../data-assets/qris.png' },
      ] } }
    }
    const [card, missingFee, cash, qris] = await fetchPaymentMethods(signal)
    assert.deepEqual(card.fee, { amount: 0.7, type: 'percent' })
    assert.equal(card.kind, 'noncash')
    assert.equal(missingFee.code, 'credit_on_us')
    assert.equal(missingFee.missingFee, true)
    assert.equal(missingFee.fee, undefined)
    assert.equal(cash.kind, 'cash')
    assert.equal(cash.missingFee, false)
    assert.equal(qris.kind, 'qris')
    assert.equal(qris.image, 'https://kasirv2.dhcsupplement.co.id/data-assets/qris.png')
    const historicalMethods = await fetchPaymentMethods(signal, 'all')
    assert.deepEqual(historicalMethods.map(({ code }) => code), [
      'qris_edc', 'debit_off_us', 'credit_on_us', 'disabled', 'cash', 'qris_cabang',
    ])
    const { defaultSalesFilters, salesFilterChips } = await import('../src/features/sales/sales-filters.ts')
    const options = historicalMethods.map(({ code, title }) => ({ value: code, label: title }))
    assert.deepEqual(salesFilterChips({ ...defaultSalesFilters, paymentMethod: 'qris_edc' }, [], [], [], options), [
      { key: 'paymentMethod', label: edc.payment_method },
    ])

    let sent
    api.defaults.adapter = async (config) => {
      sent = config
      return { config, status: 200, headers: {}, data: { status: 'success' } }
    }
    const receipt = {
      order: { id: 'order-test', name: 'Pesanan', note: '  Tanpa es  ', items: [{
        product: { id: 'SKU-1', title: 'Air Mineral', price: 3500, branchId: 'branch-1', discountType: 'Persentase (%)', discount: 10 },
        unitPrice: 3150, quantity: 2,
      }] },
      subtotal: 6300, methodFeeAmount: 44, discountAmount: 322, discountAmounts: [322], total: 6122, paid: 6122, change: 0,
      additionalPrices: [{ title: 'Kemasan', value: 100 }], discounts: [{ title: 'Promo', type: 'percent', value: 5 }], method: card,
    }
    await savePayment(receipt, cashier)
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
    const totals = paymentTotals(receipt.order, additionalPrices, discounts, card.fee)
    assert.equal(totals.total, 6062)
    assert.deepEqual(totals.discountAmounts, [332, 250])
    await savePayment({ ...receipt, ...totals, additionalPrices, discounts }, cashier)
    assert.equal(sent.data.get('payment_total_price'), '6062')
    assert.equal(sent.data.get('payment_additional_price[1][title]'), 'Layanan')
    assert.equal(sent.data.get('payment_additional_price[1][value]'), '200')
    assert.equal(sent.data.get('discounts[1][title]'), 'Voucher')
    assert.equal(sent.data.get('discounts[1][type]'), 'fixed')
    assert.equal(sent.data.get('discounts[1][value]'), '250')
    const capped = paymentTotals(receipt.order, [], [discounts[0], { ...discounts[1], value: 9000 }])
    assert.equal(capped.total, 0)
    assert.deepEqual(capped.discountAmounts, [315, 5985])

    await savePayment({ ...receipt, method: qris, methodFeeAmount: 0, proof: new File(['proof'], 'qris.png', { type: 'image/png' }) }, cashier)
    assert.equal(sent.data.get('payment_methods'), 'qris_cabang')
    assert.equal(sent.data.get('payment_upload_file').name, 'qris.png')

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
    await assert.rejects(savePayment({ ...receipt, proof: new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'bukti.png') }, cashier, 'pending_trx'), /maksimal 5 MB/)
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

test('add and edit products send store IDs, discount codes and binary images', async () => {
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
    description: 'Test description', discount: '10', discountType: 'Persentase (%)',
  }
  assert.equal(await saveProduct(input), 'Saved')
  assert.equal(sent.url, '/admin/product')
  assert.equal(sent.method, 'post')
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token-only')
  assert.deepEqual(Object.fromEntries(sent.data.entries()), {
    action: 'add_product', branch_id: 'store-0328', category: 'satuan', img: '', name: 'Test',
    price: '100000', description: 'Test description', discount: '10', discount_type: 'percent',
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
  const menu = { product_sku: '1', product_name: 'Test', status: 'active', product_price: 100, discount: 10 }
  assert.equal(mapProductRecord({ ...menu, discount_type: 'percent' }).discountType, 'Persentase (%)')
  assert.equal(mapProductRecord({ ...menu, discount_type: 'fixed' }).discountType, 'Nominal')
  assert.equal(mapProductRecord({ ...menu, discount_type: 'none' }).discountType, 'Tanpa diskon')
  assert.ok(productSchema.safeParse({ store: 'store-0328', category: 'satuan', title: 'Test', price: '100000', photo: '', discount: '10', discountType: 'Persentase (%)', description: '' }).success)
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: { status: 'error', msg: 'Save denied' } })
  await assert.rejects(saveProduct(input), /Save denied/)
  useAuthStore.getState().clearSession()
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
  for (const status of ['pending', 'completed', 'cancelled']) {
    assert.deepEqual(transactionListParams({ status }, ''), { action: 'list_trx', status })
  }
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

test('transaction mapping uses server aggregates, Jakarta dates, payment names and actual change', async () => {
  const { mapTransactionList } = await import('../src/features/sales/sales-api.ts')
  const mapped = mapTransactionList({
    summary: {
      transaction: [{ title: 'transaction', value: 129 }, { title: 'variants', value: 265 }, { title: 'items', value: 364 }],
      summary: [{ title: 'sellings', value: 20363000 }, { title: 'changes', value: 150000 }],
      payments: [{ title: 'qris', value: 19358000 }, { title: 'cash', value: 1005000 }],
    },
    data_trx: [{ trx_id: 'TRXWHSMEY', trx_kasir: 'Muhammad Idris Iswardana', trx_location: 'Jak Japan Matsuri 2026',
      trx_date: '01/11/2026 20:22', trx_total: '165000', trx_payment: 'cash', trx_change: '35000', trx_total_items: 2, trx_status: 'completed' }],
  })
  assert.deepEqual(mapped.summary, {
    transactions: 129, productsSold: 364, total: 20363000, change: 150000,
    paymentTotals: { QRIS: 19358000, Tunai: 1005000 },
  })
  assert.equal(mapped.sales[0].occurredAt, '2026-11-01T20:22:00+07:00')
  assert.equal(mapped.sales[0].status, 'complete')
  assert.equal(mapped.sales[0].paymentMethod, 'Tunai')
  assert.equal(mapped.sales[0].total, 165000)
  assert.equal(mapped.sales[0].change, 35000)
  assert.equal(mapped.sales[0].totalItems, 2)
  assert.deepEqual(mapped.sales[0].items, [])
  assert.equal(mapped.sales[0].paymentProof, undefined)
  assert.deepEqual(mapTransactionList([]), {
    sales: [], summary: { transactions: 0, productsSold: 0, total: 0, change: 0, paymentTotals: {} },
  })
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
    fetchStore, fetchUsers, fetchPaymentMethods, fetchHandoverCandidates, fetchPendingHandovers]
  const emptyTransactions = { sales: [], summary: { transactions: 0, productsSold: 0, total: 0, change: 0, paymentTotals: {} } }
  let payload
  api.defaults.adapter = async (config) => ({ config, status: 200, headers: {}, data: payload })

  for (const empty of [[], { status: 'success', data: [] }, { status: 'error', msg: 'No Data yet', data: [] }]) {
    payload = empty
    for (const fetchList of listRequests) assert.deepEqual(await fetchList(signal), [])
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
  await assert.rejects(fetchTransactions({}, ''), /Akses ditolak/)
  await assert.rejects(fetchCashSessions({}), /Akses ditolak/)
  await assert.rejects(fetchDashboard('trending_product'), /Akses ditolak/)
  await assert.rejects(fetchStoreSettings(), /Akses ditolak/)
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
        trx_location: 'Bazar Kemang 2026', trx_date: '19/11/2026 12:30', trx_total: '11655',
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
  const [, pending] = mapped.sales
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
  const response = {
    trx_id: 'TRXWHSMEY', trx_kasir: 'Muhammad Idris Iswardana', trx_location: 'Jak Japan Matsuri 2026',
    trx_sales: { id: 1, name: 'Owner Bazar Kemang1' }, trx_note: 'Tanpa es',
    trx_date: '01/11/2026 20:22', trx_status: 'completed', trx_payment: 'qris', trx_total: '31500',
    trx_nominal: '0', trx_change: '0', trx_total_items: 1,
    trx_products: [{ menu_id: 'PE00001', name: 'DHC Vitamin C ', img: '../../data-assets/upload/menu/PE00001/PE00001.png?v=19?v=11',
      price: '35000', qty: '1', price_total: '31500' }],
    trx_upload_file: '../../data-assets/upload/transaction/TRXWHSMEY/bukti_pembayaran_TRXWHSMEY.jpg',
  }
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
  assert.equal(detail.total, 31500)
  assert.deepEqual(detail.salesperson, { id: '1', name: 'Owner Bazar Kemang1' })
  assert.equal(detail.note, 'Tanpa es')
  assert.equal(detail.items[0].productId, 'PE00001')
  assert.equal(detail.items[0].title, 'DHC Vitamin C')
  assert.equal(detail.items[0].quantity, 1)
  assert.equal(detail.items[0].unitPrice, 35000)
  assert.equal(detail.items[0].lineTotal, 31500)
  assert.equal(detail.items[0].image, 'https://kasirv2.dhcsupplement.co.id/data-assets/upload/menu/PE00001/PE00001.png?v=19?v=11')
  assert.equal(detail.paymentProof.url, 'https://kasirv2.dhcsupplement.co.id/data-assets/upload/transaction/TRXWHSMEY/bukti_pembayaran_TRXWHSMEY.jpg')
  assert.equal(detail.paymentProof.type, 'image')
  assert.equal(mapTransactionDetail({ ...response, trx_payment: 'cash' }).paymentProof, undefined)
  assert.equal(mapTransactionDetail({ ...response, trx_upload_file: '' }).paymentProof, undefined)
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

test('settling a pending transaction posts pay_trx for the existing ID without resending products', async () => {
  const { pendingPaymentDetails, resolvePendingTransaction } = await import('../src/features/orders/payment-details.ts')
  const { fetchPaymentMethods, findRecordedPaymentMethod } = await import('../src/features/orders/payment-methods.ts')
  let sent
  api.defaults.adapter = async (config) => {
    sent = config
    if (config.method === 'get') {
      assert.equal(config.url, '/transaction/trx')
      assert.deepEqual(config.params, { action: 'list_payment' })
      return { config, headers: {}, status: 200, data: { status: 'success', data: [
        { payment_code: 'cash', payment_method: 'Tunai', payment_type: 'cash', is_active: true, fee_active: false, fee_found: false },
        { payment_code: 'qris_cabang', payment_method: 'QRIS Cabang', payment_type: 'qris', is_active: true,
          fee_code: 'qris', fee: 0.7, fee_type: 'percent', fee_active: true, fee_found: true },
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

  const methods = await fetchPaymentMethods()
  const recorded = findRecordedPaymentMethod(methods, 'TUNAI')
  const qris = methods.find(({ kind }) => kind === 'qris')
  const sale = { subtotal: 15000, total: 15500, paymentFee: 0, additionalPrices: [{ title: 'Kemasan', value: 500 }] }
  const order = { id: 'TRX-1', items: [] }
  assert.deepEqual(pendingPaymentDetails(order, sale, recorded, recorded).updates, {})
  const changed = pendingPaymentDetails(order, sale, qris, recorded)
  assert.equal(changed.totals.total, 15605)
  await resolvePendingTransaction(order.id, { ...changed.updates, methodCode: qris.code })
  assert.deepEqual(Object.fromEntries(sent.data), {
    action: 'pay_trx', trx_id: 'TRX-1', payment_methods: 'qris_cabang', payment_fee: '0.7', payment_total_price: '15605',
  })

  const withFixedFee = { ...sale, additionalPrices: [...sale.additionalPrices, { title: 'Biaya pembayaran', value: 1000 }] }
  const fixedMethod = { ...recorded, fee: { type: 'fixed', amount: 1000 } }
  assert.deepEqual(pendingPaymentDetails(order, withFixedFee, qris, fixedMethod).updates.additionalPrices, [
    { name: 'Kemasan', amount: 500 },
  ])
  const adjustments = pendingPaymentDetails(order, sale, recorded, recorded, {
    additionalPrices: [{ title: 'Kemasan', value: 100 }, { title: 'Layanan', value: 200 }],
    discounts: [{ title: 'Promo', type: 'percent', value: 5 }, { title: 'Voucher', type: 'fixed', value: 200 }],
  })
  await resolvePendingTransaction(order.id, { ...adjustments.updates, methodCode: recorded.code, paid: 15000, change: 665 })
  assert.equal(sent.data.get('payment_total_price'), '14335')
  assert.equal(sent.data.get('payment_additional_price[1][value]'), '200')
  assert.equal(sent.data.get('discounts[1][value]'), '200')

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
  await editSalePayment(sale, { method: { code: 'qris_edc', kind: 'noncash', fee: { type: 'percent', amount: 1 } }, recordedMethod: cash })
  assert.deepEqual(Object.fromEntries(requests[1].data), {
    action: 'edit_trx', trx_id: 'TRX-1', payment_methods: 'qris_edc', payment_total_price: '14650',
    payment_fee: '1', payment_cash_nominal: '0', payment_cash_change: '0',
  })
  await assert.rejects(editSalePayment(sale, { ...changes, paid: 10000 }), /Nominal tunai/)
  await assert.rejects(editSalePayment({ ...sale, status: 'delete' }, changes), /tidak dapat diedit/)
  assert.equal(requests.length, 2)
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
    action: 'edit_trx', trx_id: 'TRX-1', sales: 'U-0012', payment_total_price: '35823',
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
  assert.equal(requests[2].data.get('payment_total_price'), '10355')
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
  useAuthStore.getState().updateAccount({ account_username: 'admin', account_fullname: 'Jimmy Hermanto' })
  assert.equal(getAuthSession().token, 'test-token-only')
  assert.equal(getAuthSession().expiresAt, expiresAt)
  assert.equal(getAuthSession().account.event_id, 'store-0328')
  assert.equal(sessionStorage.getItem('kasirv2.auth'), null)
  assert.equal(JSON.parse(localStorage.getItem('kasirv2.auth')).account.account_fullname, 'Jimmy Hermanto')
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
  useAuthStore.getState().setSession({ account: { account_id: 'cashier-B', account_username: 'tester' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  useAuthStore.getState().clearSession()
  assert.equal(store().orders.length, 0)
})
