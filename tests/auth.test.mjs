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

    useAuthStore.getState().setSession({ ...session, account: { ...session.account, event_level: 'administrator' } }, false)
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
    useAuthStore.getState().setSession({ ...session, account: { ...session.account, event_level: 'administrator' } }, false)
    assert.doesNotThrow(() => Route.options.beforeLoad())
  } finally {
    useAuthStore.getState().clearSession()
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
    await changeUser({ action: 'status_user', userId: '4', status: 'noactive' })
    await changeUser({ action: 'status_user', userId: '4', status: 'active' })
    assert.deepEqual(calls, [
      { action: 'add_user', username: 'kasir04', fullname: 'Kasir', is_cashier: '1', password: ' test password ', branch_id: 'BC-001' },
      { action: 'add_user', username: 'admin04', level_user: 'Administrator' },
      { action: 'edit_user', user_id: '4', address: '', is_cashier: '0' },
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
  const { savePayment } = await import('../src/features/orders/payment-details.ts')
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
      subtotal: 6300, methodFeeAmount: 44, discountAmount: 322, total: 6122, paid: 6122, change: 0,
      fee: { name: 'Kemasan', amount: 100 }, discount: { name: 'Promo', type: 'percent', value: 5 }, method: card,
    }
    await savePayment(receipt, cashier)
    assert.equal(sent.url, '/transaksi/trx')
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

    await savePayment({ ...receipt, method: qris, methodFeeAmount: 0, proof: new File(['proof'], 'qris.png', { type: 'image/png' }) }, cashier)
    assert.equal(sent.data.get('payment_methods'), 'qris_cabang')
    assert.equal(sent.data.get('payment_upload_file').name, 'qris.png')

    await savePayment({ ...receipt, method: cash, methodFeeAmount: 0, paid: 8000, change: 1878 }, {
      ...cashier, account_role: 'admin', store: { all_branches: true, branches: [{ id: 'branch-1', name: 'Cabang 1' }] },
    })
    assert.equal(sent.data.get('payment_methods'), 'cash')
    assert.equal(sent.data.get('payment_cash_nominal'), '8000')
    assert.equal(sent.data.get('payment_cash_change'), '1878')
    assert.equal(sent.data.get('branch_id'), 'branch-1')
    await savePayment({ ...receipt, method: cash, methodFeeAmount: 0, paid: 8000, change: 1878 }, cashier, 'pending_trx')
    assert.equal(sent.data.get('action'), 'pending_trx')
    assert.equal(sent.data.get('payment_methods'), 'cash')
    assert.equal(sent.data.get('product[0][product_id]'), 'SKU-1')
    assert.equal(sent.data.get('note'), 'Tanpa es')
    assert.equal(sent.data.has('payment_cash_nominal'), false)
    assert.equal(sent.data.has('payment_cash_change'), false)
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

test('transaction queries preserve branch IDs, payment codes and local calendar dates', async () => {
  const { transactionListParams, fetchTransactions } = await import('../src/features/sales/sales-api.ts')
  const filters = { store: 'branch-0328', paymentMethod: 'cash', cashier: 'all', product: 'ignored',
    dateRange: { from: new Date(2026, 10, 1), to: new Date(2026, 10, 17) } }
  assert.deepEqual(transactionListParams(filters, ' test '), {
    action: 'list_trx', kasir: 'all', sales: 'all', search: 'test', shift: 'all', payment: 'cash',
    branch_id: 'branch-0328', startDate: '2026-11-01', endDate: '2026-11-17', sku: 'all',
  })
  const empty = transactionListParams({ ...filters, store: 'all', paymentMethod: 'all', dateRange: undefined }, '')
  assert.equal(empty.startDate, '')
  assert.equal(empty.endDate, '')
  assert.equal(empty.branch_id, 'all')
  assert.equal(empty.payment, 'all')
  assert.equal(transactionListParams({ ...filters, paymentMethod: 'qris' }, '').payment, 'qris')
  let sent
  api.defaults.adapter = async (config) => { sent = config; return { config, status: 200, headers: {}, data: {
    status: 'success', msg: 'Successfully Get Transaction',
    data: { summary: { transaction: [], summary: [], payments: [], 'sales-promotion': [] }, data_trx: [] },
  } } }
  useAuthStore.getState().setSession({ account: { account_username: 'tester' }, token: 'test-token-only', expiresAt: Date.now() + 60_000 }, false)
  assert.deepEqual((await fetchTransactions(filters, '')).sales, [])
  assert.equal(sent.url, '/transaksi/trx')
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token-only')
  assert.equal(sent.params.sku, 'all')
  await fetchTransactions({ ...filters, cashier: 'U-0011' }, 'test')
  assert.equal(sent.params.kasir, 'U-0011')
  assert.equal(sent.params.branch_id, 'branch-0328')
  assert.equal(sent.params.payment, 'cash')
  assert.equal(sent.params.search, 'test')
  await fetchTransactions({ ...filters, status: 'pending' }, '')
  assert.equal(sent.params.status, 'pending')
  assert.equal(sent.params.branch_id, 'branch-0328')
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
  assert.throws(() => mapTransactionList([]), /Format daftar transaksi/)
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
  assert.equal(sent.url, '/transaksi/trx')
  assert.deepEqual(sent.params, { action: 'detail_trx', trx_id: 'TRXWHSMEY' })
  assert.equal(sent.headers.get('Authorization'), 'Bearer test-token-only')
  assert.equal(detail.status, 'complete')
  assert.equal(detail.total, 31500)
  assert.deepEqual(detail.salesperson, { id: '1', name: 'Owner Bazar Kemang1' })
  assert.equal(detail.note, 'Tanpa es')
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

test('settling or cancelling a pending transaction uses its existing transaction ID', async () => {
  const { resolvePendingTransaction } = await import('../src/features/orders/payment-details.ts')
  let sent
  api.defaults.adapter = async (config) => {
    sent = config
    return { config, headers: {}, status: 200, data: { status: 'success' } }
  }
  await resolvePendingTransaction('TRX-1', { method: { kind: 'cash' }, paid: 20000, change: 5000 })
  assert.equal(sent.url, '/transaction/trx.php')
  assert.deepEqual(sent.params, { action: 'pay_trx' })
  assert.deepEqual(Object.fromEntries(sent.data), {
    trx_id: 'TRX-1', payment_cash_nominal: '20000', payment_cash_change: '5000',
  })
  await resolvePendingTransaction('TRX-2')
  assert.deepEqual(sent.params, { action: 'cancel_trx' })
  assert.deepEqual(Object.fromEntries(sent.data), { trx_id: 'TRX-2' })
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
