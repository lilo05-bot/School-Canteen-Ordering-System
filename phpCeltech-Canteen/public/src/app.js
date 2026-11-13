const schoolLogo = new URL("./imports/OIP__1_.png", import.meta.url).href

const state = {
  account: null,
  checking: true,
  busy: false,
  uploading: false,
  tab: "Login",
  role: "Student",
  category: "All items",
  queue: "Active",
  activityFilter: "All",
  products: [],
  orders: [],
  students: [],
  owners: [],
  activity: [],
  cart: {},
  stock: {},
  cash: {},
  login: { username: "", password: "" },
  student: { number: "", password: "", confirm: "" },
  ownerDraft: { username: "", password: "", confirm: "" },
  product: { name: "", price: "", category: "Food", photo: "" },
  showPassword: false,
  message: "",
  error: "",
  connectionError: "",
  pending: null,
  receipt: null,
  generation: 0,
  uploadVersion: 0,
}
const content = document.querySelector("#content")
const dialog = document.querySelector("#receipt")
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  )
const money = (value) => `₱${Number(value).toFixed(2)}`
const date = (value) => new Date(value).toLocaleString()
const disabled = (condition) => (condition ? " disabled" : "")
const pathId = (id) => encodeURIComponent(id)
const photoUrl = (photo) =>
  photo.startsWith("data:image/")
    ? photo
    : `https://images.unsplash.com/photo-${photo}?auto=format&fit=crop&w=700&q=85`
const errorText = (error) =>
  error instanceof Error ? error.message : "Please try again."

export async function api(path, method = "GET", body) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Celtech-Request": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new Error(
      "Cannot reach the PHP server. Check that the backend is running.",
    )
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.detail
    const failure = new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg).join(". ")
          : "Server request failed. Please try again.",
    )
    failure.status = response.status
    throw failure
  }
  if (data === null)
    throw new Error("Invalid API response. Check the backend connection.")
  return data
}

function resetSession() {
  state.generation++
  state.uploadVersion++
  Object.assign(state, {
    account: null,
    products: [],
    orders: [],
    students: [],
    owners: [],
    activity: [],
    cart: {},
    stock: {},
    cash: {},
    pending: null,
    receipt: null,
    tab: "Login",
    showPassword: false,
    uploading: false,
    login: { username: "", password: "" },
    student: { number: "", password: "", confirm: "" },
    ownerDraft: { username: "", password: "", confirm: "" },
    product: { name: "", price: "", category: "Food", photo: "" },
  })
  if (dialog.open) dialog.close()
}

function report(error) {
  if (error.status === 401) resetSession()
  state.error = errorText(error)
}

async function refresh() {
  const account = state.account
  const generation = state.generation
  if (!account) return
  try {
    const actual = await api("/auth/me")
    if (generation !== state.generation) return
    if (actual.name !== account.name || actual.owner !== account.owner) {
      resetSession()
      state.error = "The account changed in another tab. Please log in again."
      return
    }
    const [products, orders, students, activity, owners] = await Promise.all([
      api("/products"),
      api("/orders"),
      account.owner ? api("/students") : [],
      account.owner ? api("/activity") : [],
      account.owner ? api("/owners") : [],
    ])
    if (generation !== state.generation) return
    Object.assign(state, {
      products,
      orders,
      students,
      activity,
      owners,
      connectionError: "",
    })
  } catch (error) {
    if (generation !== state.generation) return
    if (error.status === 401) report(error)
    else state.connectionError = errorText(error)
  }
}

function field(label, name, value, attributes = "") {
  return `<label>${escape(label)}<input name="${name}" value="${escape(value)}" ${attributes}${disabled(state.busy)}></label>`
}
function buttons(values, action, selected) {
  return `<div class="filters">${values.map((value) => `<button type="button" data-action="${action}" data-value="${escape(value)}" class="pill ${selected === value ? "active" : ""}" aria-pressed="${selected === value}">${escape(value)}</button>`).join("")}</div>`
}
function loginView() {
  return `<section class="card auth-card"><h2>Login</h2>
    <div class="role-switch">${["Student", "Canteen owner"].map((role) => `<button type="button" data-action="role" data-value="${role}" class="${state.role === role ? "selected" : ""}" aria-pressed="${state.role === role}"${disabled(state.busy)}>${role}</button>`).join("")}</div>
    <form data-form="login" class="stack">
      ${field(state.role === "Student" ? "Student number" : "Username", "username", state.login.username, 'required maxlength="30" autocomplete="username"')}
      ${field("Password", "password", state.login.password, `required maxlength="128" autocomplete="current-password" type="${state.showPassword ? "text" : "password"}"`)}
      <label class="check"><input type="checkbox" name="showPassword"${
        state.showPassword ? " checked" : ""
      }>Show password</label>
      <button class="primary full"${disabled(state.busy)}>${
        state.busy ? "Logging in…" : "Log in"
      }</button>
    </form>
    ${
      state.role === "Student"
        ? '<p class="center muted">New student? <button class="link" data-action="register">Create account</button></p>'
        : ""
    }
    <p class="hint">${
      state.role === "Student"
        ? "Use your saved student account or create one above."
        : "Use your owner username and password. Initial owner username: merza."
    }</p>
  </section>`
}
function studentForm(selfRegistration) {
  return `<form data-form="${
    selfRegistration ? "register" : "student"
  }" class="stack">
    ${field("Student number", "number", state.student.number, 'required minlength="3" maxlength="30" autocomplete="username" placeholder="e.g. 2024-0002"')}
    ${field("Password", "password", state.student.password, 'required type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="At least 8 characters"')}
    ${
      selfRegistration
        ? field(
            "Confirm password",
            "confirm",
            state.student.confirm,
            'required type="password" minlength="8" maxlength="128" autocomplete="new-password"',
          )
        : ""
    }
    <button class="primary"${disabled(state.busy)}>${
      state.busy
        ? "Saving account…"
        : selfRegistration
          ? "Create account"
          : "Add student account"
    }</button>
  </form>`
}
function registerView() {
  return `<section class="card auth-card"><h2>Create student account</h2>
    <p class="muted">Use your student number. No email needed.</p>${studentForm(true)}
    <p class="center muted">Already registered? <button class="link" data-action="login-view">Log in</button></p>
    <p class="hint">Accounts are stored on the PHP server. Student-number registration is not verified enrollment; use a unique password.</p></section>`
}
function cartItems() {
  return state.products.filter((item) => state.cart[item.id] > 0)
}
function menuView() {
  const products = state.products.filter(
    (item) =>
      state.category === "All items" || item.category === state.category,
  )
  const items = cartItems()
  const total = items.reduce(
    (sum, item) => sum + item.price * state.cart[item.id],
    0,
  )
  return `<div class="menu-layout"><section><h2>Choose your food</h2>
    ${buttons(["All items", "Food", "Beverages"], "category", state.category)}
    <div class="product-grid">${products
      .map(
        (item) => `<article class="card product">
      <div class="product-image">${
        item.photo
          ? `<img src="${escape(photoUrl(item.photo))}" alt="${escape(item.name)}" loading="lazy">`
          : `<span>${escape(item.category)}</span>`
      }</div>
      <div class="product-body"><h3>${escape(item.name)}</h3><div class="row"><strong>${money(item.price)}</strong>
      <button class="soft" data-action="add" data-id="${item.id}"${disabled(!item.stock || (state.cart[item.id] || 0) >= item.stock)}>${
        item.stock ? "+ Add" : "Sold out"
      }</button></div></div></article>`,
      )
      .join("")}</div>
    ${
      products.length ? "" : '<p class="empty">No items in this category.</p>'
    }</section>
    <aside class="card cart"><div class="row"><h2>Your order</h2>${
      items.length
        ? '<button class="link muted" data-action="clear-cart">Clear</button>'
        : ""
    }</div>
      <div class="stack cart-items">${
        items.length
          ? items
              .map(
                (
                  item,
                ) => `<div><div class="row"><span>${escape(item.name)}</span><span>${money(item.price * state.cart[item.id])}</span></div>
        <div class="quantity"><button data-action="subtract" data-id="${item.id}" aria-label="Remove one ${escape(item.name)}">−</button><span>${state.cart[item.id]}</span><button data-action="add" data-id="${item.id}" aria-label="Add one ${escape(item.name)}"${disabled(state.cart[item.id] >= item.stock)}>+</button></div></div>`,
              )
              .join("")
          : '<p class="empty">Add items from the menu.</p>'
      }</div>
      <div class="row total"><strong>Total</strong><strong>${money(total)}</strong></div>
      <button class="primary full" data-action="order"${disabled(!items.length || state.busy || state.connectionError)}>${
        state.busy ? "Saving…" : "Place order"
      }</button>
      <p class="hint center">Cash at counter before pickup.</p></aside></div>`
}
function paymentChange(cash, total) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(cash).trim())) return null
  const cents = Math.round(Number(cash) * 100),
    cost = Math.round(total * 100)
  return Number.isSafeInteger(cents) && cents >= cost
    ? (cents - cost) / 100
    : null
}
function hasPayment(order) {
  return (
    order.payment &&
    Number.isFinite(order.payment.cash) &&
    Number.isFinite(order.payment.change)
  )
}
function ordersView() {
  const history = state.tab !== "Orders"
  const orders = state.orders
    .filter((order) =>
      history
        ? order.status === "Collected"
        : order.status !== "Collected" &&
          (state.queue === "Active" || state.queue === order.status),
    )
    .sort((a, b) =>
      history
        ? Date.parse(b.createdAt) - Date.parse(a.createdAt)
        : Date.parse(a.createdAt) - Date.parse(b.createdAt),
    )
  return `<section class="narrow"><h2>${
    history ? state.tab : state.account.owner ? "Pending orders" : "My orders"
  }</h2>
    <p class="muted">${
      history
        ? "Completed purchases, newest first. View items, payments, and saved receipts."
        : "Track current orders. Pay cash at the counter before pickup."
    }</p>
    ${
      history
        ? ""
        : buttons(["Active", "Pending", "Ready"], "queue", state.queue)
    }
    <div class="stack">${
      orders
        .map(
          (order) => `<article class="card order">
      <div class="row"><div><h3>${escape(order.number)}</h3><p>${escape(order.student)}</p><time class="hint">${escape(date(order.createdAt))}</time></div><span class="badge ${order.status.toLowerCase()}">${
        order.status === "Ready" ? "Ready for pickup" : order.status
      }</span></div>
      <ul class="order-items">${order.items.map((item) => `<li class="row"><span>${item.quantity} × ${escape(item.name)}</span><span>${money(item.price * item.quantity)}</span></li>`).join("")}</ul>
      <div class="row"><strong>Total: ${money(order.total)}</strong><span class="hint">${
        order.status === "Collected"
          ? "Cash received · Collected"
          : "Cash at counter · Unpaid"
      }</span></div>
      ${
        order.status === "Ready"
          ? `<p class="notice">Food is ready. Collect at the counter and pay ${money(order.total)} in cash before receiving your order.</p>`
          : ""
      }
      ${
        state.account.owner && order.status === "Pending"
          ? `<button class="primary full" data-action="ready" data-id="${escape(order.id)}"${disabled(state.busy)}>Ready for pickup — notify student</button>`
          : ""
      }
      ${
        state.account.owner && order.status === "Ready"
          ? `<form data-form="collect" data-id="${escape(order.id)}" class="payment stack">
        ${field("Cash received (₱)", "cash", state.cash[order.id] || "", `required type="number" min="${order.total}" step="0.01" placeholder="Student payment"`)}
        <p>Change: <strong data-change="${escape(order.id)}">${
          paymentChange(state.cash[order.id] || "", order.total) === null
            ? "—"
            : money(paymentChange(state.cash[order.id], order.total))
        }</strong></p>
        <button class="primary full"${disabled(state.busy)}>Confirm payment & make receipt</button></form>`
          : ""
      }
      ${
        order.status === "Collected" && hasPayment(order)
          ? `<button class="outline full" data-action="receipt" data-id="${escape(order.id)}">View receipt</button>`
          : ""
      }
    </article>`,
        )
        .join("") ||
      `<p class="card empty">${
        history ? "No completed purchases yet." : "No orders in this queue."
      }</p>`
    }</div></section>`
}
function stocksView() {
  return `<section class="narrow"><h2>Product stocks</h2><p class="muted">Update available quantities. Stock is reduced when students order. New products start with zero.</p>
    <form data-form="product" class="card form-grid">
      ${field("Item name", "name", state.product.name, 'required maxlength="60"')}
      ${field("Price (₱)", "price", state.product.price, 'required type="number" min="0.01" step="0.01"')}
      <label>Category<select name="category"><option${
        state.product.category === "Food" ? " selected" : ""
      }>Food</option><option${
        state.product.category === "Beverages" ? " selected" : ""
      }>Beverages</option></select></label>
      <div class="span-all"><label>Product picture (optional)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"${disabled(state.busy || state.uploading)}></label>
      <p class="hint">JPG, PNG or WebP · up to 5 MB. Photos are resized to save space.</p>
      ${state.uploading ? '<p role="status">Preparing picture…</p>' : ""}
      ${
        state.product.photo
          ? `<div class="photo-preview"><img src="${escape(state.product.photo)}" alt="New product preview"><button type="button" class="danger" data-action="remove-photo">Remove picture</button></div>`
          : ""
      }</div>
      <button class="primary span-all"${disabled(state.busy || state.uploading)}>${
        state.uploading ? "Preparing picture…" : "Add item"
      }</button>
    </form>
    <div class="card list">${
      state.products
        .map(
          (item) => `<div class="stock-row"><div class="product-summary">${
            item.photo
              ? `<img src="${escape(photoUrl(item.photo))}" alt="${escape(item.name)}">`
              : ""
          }<div><h3>${escape(item.name)}</h3><p class="hint">${escape(item.category)} · ${money(item.price)}</p></div></div>
      <form data-form="stock" data-id="${item.id}" class="stock-controls"><label>In stock<input name="stock" aria-label="Stock for ${escape(item.name)}" type="number" required min="0" max="1000000" step="1" value="${escape(state.stock[item.id] ?? item.stock)}"></label><button class="primary"${disabled(state.busy)}>Save stock</button>
      <span class="stock-status ${item.stock === 0 ? "out" : ""}">${
        item.stock === 0
          ? "Out of stock"
          : item.stock <= 5
            ? "Low stock"
            : "Available"
      }</span><button type="button" class="danger" data-action="remove-product" data-id="${item.id}"${disabled(state.busy)}>Remove</button></form></div>`,
        )
        .join("") || '<p class="empty">No items yet. Add one above.</p>'
    }</div></section>`
}
function studentsView() {
  return `<section class="narrow"><h2>Student accounts</h2><p class="muted">Create a login with a student number and password. No email needed.</p>
    <div class="card account-form">${studentForm(false)}</div>
    <div class="card list"><h3 class="list-heading">Registered students (${state.students.length})</h3>
    ${state.students.map((student) => `<div class="list-row row"><strong>${escape(student.number)}</strong><span class="hint">Added ${escape(date(student.createdAt))}</span></div>`).join("") || '<p class="empty">No student accounts yet.</p>'}</div>
    <p class="hint">Accounts are saved in the server database. Passwords are salted and hashed; they are never listed here.</p></section>`
}
function ownersView() {
  return `<section class="narrow"><h2>Owner accounts</h2>
    <p class="muted">Add another owner with a separate username and password. Each owner has full management access.</p>
    <div class="card account-form"><form data-form="owner" class="stack">
      ${field("Owner username", "username", state.ownerDraft.username, 'required minlength="3" maxlength="30" pattern="[A-Za-z0-9_.\\-]{3,30}" autocomplete="off" placeholder="e.g. canteen.manager"')}
      ${field("Password", "password", state.ownerDraft.password, 'required type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="At least 8 characters"')}
      ${field("Confirm password", "confirm", state.ownerDraft.confirm, 'required type="password" minlength="8" maxlength="128" autocomplete="new-password"')}
      <p class="hint">Usernames are case-sensitive. Use letters, numbers, dots, underscores, or hyphens. Only add trusted canteen staff.</p>
      <button class="primary"${disabled(state.busy)}>Add owner account</button>
    </form></div>
    <div class="card list"><h3 class="list-heading">Registered owners (${state.owners.length})</h3>
      ${state.owners.map((owner) => `<div class="list-row row"><strong>${escape(owner.username)}</strong><span class="hint">Added ${escape(date(owner.createdAt))}</span></div>`).join("") || '<p class="empty">No owner accounts found.</p>'}
    </div><p class="hint">Passwords are securely hashed and never displayed. The new owner can select Canteen owner on the login page.</p>
  </section>`
}
function activityView() {
  const entries = state.activity.filter(
    (entry) =>
      state.activityFilter === "All" || entry.category === state.activityFilter,
  )
  return `<section class="narrow"><h2>Activity log</h2><p class="muted">Recent orders and product changes, newest first. Entries include who made the change and when.</p>
    ${buttons(["All", "Orders", "Stock", "Products", "Accounts"], "activity-filter", state.activityFilter)}
    <div class="card list">${entries.map((entry) => `<article class="list-row"><div class="row"><span class="badge">${escape(entry.category)}</span><time class="hint">${escape(date(entry.createdAt))}</time></div><p>${escape(entry.detail)}</p><p class="hint">By ${escape(entry.actor)}</p></article>`).join("") || '<p class="empty">No activity yet. New actions will appear here.</p>'}</div>
    <p class="hint">Server-recorded activity (up to 1,000 recent entries). Completed orders remain in Order history.</p></section>`
}
function render() {
  // Preserve focus and drafts across five-second refreshes.
  const active = document.activeElement
  const activeForm = active?.closest("form")
  const focus =
    activeForm && content.contains(active)
      ? {
          form: activeForm.dataset.form,
          id: activeForm.dataset.id,
          name: active.name,
          start: active.selectionStart,
          end: active.selectionEnd,
        }
      : null
  const nav = document.querySelector("#navigation")
  nav.hidden = !state.account
  const tabs = state.account?.owner
    ? [
        "Orders",
        "Order history",
        "Product stocks",
        "Students",
        "Owners",
        "Activity log",
      ]
    : ["Menu", "Orders", "Purchase history"]
  nav.innerHTML = state.account
    ? tabs
        .map(
          (tab) =>
            `<button data-action="tab" data-value="${tab}" class="${
              tab === state.tab ? "active" : ""
            }"${
              tab === state.tab ? ' aria-current="page"' : ""
            }>${tab}</button>`,
        )
        .join("")
    : ""
  document.querySelector("#account").textContent = state.account?.name || ""
  document.querySelector("#logout").hidden = !state.account
  document.querySelector("#logout").disabled = state.busy
  document.querySelector("#alerts").innerHTML = [
    state.connectionError
      ? `<div role="alert" class="alert error">${escape(state.connectionError)} <button class="link" data-action="retry">Retry connection</button></div>`
      : "",
    state.error
      ? `<div role="alert" class="alert error">${escape(state.error)}</div>`
      : "",
    state.message
      ? `<div role="status" class="alert success row"><span>${escape(state.message)}</span><button data-action="dismiss" aria-label="Dismiss message">×</button></div>`
      : "",
  ].join("")
  const ready =
    state.account && !state.account.owner
      ? state.orders.filter((order) => order.status === "Ready")
      : []
  const notice = document.querySelector("#pickup-notice")
  const noticeText = ready.map((order) => order.number).join(", ")
  // Avoid re-announcing unchanged pickup notices on every poll.
  if (notice.dataset.orders !== noticeText) {
    notice.dataset.orders = noticeText
    notice.innerHTML = ready.length
      ? `<div class="alert success"><strong>Your food is ready!</strong><p>${escape(noticeText)} — Please go to the canteen counter. Pay cash before collecting your food.</p><button class="link" data-action="ready-orders">View ready orders</button></div>`
      : ""
  }
  let view = '<p class="empty" role="status">Connecting to the server…</p>'
  if (!state.checking) {
    if (!state.account)
      view = state.tab === "Create account" ? registerView() : loginView()
    else if (state.tab === "Menu" && !state.account.owner) view = menuView()
    else if (state.tab === "Product stocks" && state.account.owner)
      view = stocksView()
    else if (state.tab === "Students" && state.account.owner)
      view = studentsView()
    else if (state.tab === "Owners" && state.account.owner) view = ownersView()
    else if (state.tab === "Activity log" && state.account.owner)
      view = activityView()
    else view = ordersView()
  }
  content.innerHTML = view
  if (focus) {
    const form = [...content.querySelectorAll("form")].find(
      (form) =>
        form.dataset.form === focus.form && form.dataset.id === focus.id,
    )
    const input = form?.elements.namedItem(focus.name)
    if (input) {
      input.focus({ preventScroll: true })
      if (
        focus.start !== null &&
        typeof input.setSelectionRange === "function"
      ) {
        try {
          input.setSelectionRange(focus.start, focus.end)
        } catch {
          /* Number inputs have no selection range. */
        }
      }
    }
  }
}
function showReceipt(order) {
  if (!hasPayment(order)) return
  state.receipt = order
  document.querySelector("#receipt-content").innerHTML = `
    <div class="receipt-heading"><h2 id="receipt-heading">CELTECH CANTEEN</h2><p class="hint">Cash payment receipt</p><p>${escape(order.number)}</p></div>
    <div class="receipt-details"><p>Student: <strong>${escape(order.student)}</strong></p><p>Paid: ${escape(date(order.payment.paidAt))}</p><p>Cashier: ${escape(order.payment.cashier)}</p></div>
    <table><thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Price</th><th scope="col">Amount</th></tr></thead><tbody>${order.items.map((item) => `<tr><td>${escape(item.name)}</td><td>${item.quantity}</td><td>${money(item.price)}</td><td>${money(item.quantity * item.price)}</td></tr>`).join("")}</tbody></table>
    <dl><div class="row"><dt>Total cost</dt><dd>${money(order.total)}</dd></div><div class="row"><dt>Student cash payment</dt><dd>${money(order.payment.cash)}</dd></div><div class="row"><dt>Change</dt><dd>${money(order.payment.change)}</dd></div></dl>
    <p class="hint center">Paid in cash · Food collected<br>Thank you! This receipt is not a tax invoice.</p>`
  if (!dialog.open) dialog.showModal()
}
async function mutate(operation) {
  if (state.busy) return
  state.busy = true
  state.error = ""
  render()
  try {
    await operation()
  } catch (error) {
    report(error)
  } finally {
    state.busy = false
    render()
  }
}
async function uploadPhoto(file) {
  if (!file || !state.account?.owner) return
  const version = ++state.uploadVersion
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  ) {
    state.error = "Choose a JPG, PNG, or WebP image under 5 MB."
    render()
    return
  }
  state.uploading = true
  state.error = ""
  render()
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Image processing unavailable.")
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      if (version === state.uploadVersion)
        state.product.photo = canvas.toDataURL("image/jpeg", 0.8)
    } finally {
      bitmap.close()
    }
  } catch {
    if (version === state.uploadVersion)
      state.error = "Could not read that picture. Please choose another image."
  } finally {
    if (version === state.uploadVersion) {
      state.uploading = false
      render()
    }
  }
}
document.querySelector("#root").addEventListener("input", (event) => {
  const input = event.target,
    form = input.closest("form")
  if (!form || !input.name || input.type === "file") return
  const kind = form.dataset.form
  if (input.name === "showPassword") {
    state.showPassword = input.checked
    form.elements.password.type = input.checked ? "text" : "password"
  } else if (kind === "login") state.login[input.name] = input.value
  else if (kind === "student" || kind === "register")
    state.student[input.name] = input.value
  else if (kind === "owner") state.ownerDraft[input.name] = input.value
  else if (kind === "product") state.product[input.name] = input.value
  else if (kind === "stock") state.stock[form.dataset.id] = input.value
  else if (kind === "collect") {
    state.cash[form.dataset.id] = input.value
    const order = state.orders.find((order) => order.id === form.dataset.id)
    const change = paymentChange(input.value, order.total)
    form.querySelector("[data-change]").textContent =
      change === null ? "—" : money(change)
  }
})
document.querySelector("#root").addEventListener("change", (event) => {
  if (event.target.type === "file") void uploadPhoto(event.target.files?.[0])
})
document.querySelector("#root").addEventListener("submit", (event) => {
  const form = event.target
  if (!form.dataset.form) return
  event.preventDefault()
  // Read native form values too, so autofill and password managers work.
  const data = Object.fromEntries(new FormData(form))
  void mutate(async () => {
    switch (form.dataset.form) {
      case "login": {
        const account = await api("/auth/login", "POST", {
          username: data.username,
          password: data.password,
          role: state.role,
        })
        state.generation++
        state.account = account
        state.login.password = ""
        state.tab = account.owner ? "Orders" : "Menu"
        state.queue = account.owner ? "Pending" : "Active"
        state.cart = {}
        state.message = ""
        await refresh()
        break
      }
      case "register":
      case "student": {
        const self = form.dataset.form === "register"
        if (self && data.password !== data.confirm)
          throw new Error("Passwords do not match.")
        const saved = await api(self ? "/auth/register" : "/students", "POST", {
          number: data.number,
          password: data.password,
        })
        state.student = { number: "", password: "", confirm: "" }
        if (self) {
          state.tab = "Login"
          state.role = "Student"
          state.login = { username: saved.number, password: "" }
        } else await refresh()
        state.message = `Account ${saved.number} saved. Log in with your student number and password.`
        break
      }
      case "owner": {
        if (!state.account?.owner)
          throw new Error("Canteen owner access required.")
        if (data.password !== data.confirm)
          throw new Error("Passwords do not match.")
        const saved = await api("/owners", "POST", {
          username: data.username,
          password: data.password,
        })
        state.ownerDraft = { username: "", password: "", confirm: "" }
        await refresh()
        state.message = `Owner account ${saved.username} created. They can now log in as Canteen owner.`
        break
      }
      case "product":
        if (state.uploading) return
        await api("/products", "POST", {
          name: data.name,
          price: data.price,
          category: data.category,
          photo: state.product.photo,
        })
        state.product = { name: "", price: "", category: "Food", photo: "" }
        state.message =
          "Product saved. Set its stock before students can order."
        await refresh()
        break
      case "stock": {
        const stock = Number(data.stock)
        if (
          data.stock === "" ||
          !Number.isSafeInteger(stock) ||
          stock < 0 ||
          stock > 1000000
        )
          throw new Error(
            "Enter a whole stock quantity from zero to 1,000,000.",
          )
        await api(`/products/${pathId(form.dataset.id)}/stock`, "PATCH", {
          stock,
        })
        delete state.stock[form.dataset.id]
        state.message = "Stock saved."
        await refresh()
        break
      }
      case "collect": {
        const order = state.orders.find((order) => order.id === form.dataset.id)
        if (paymentChange(data.cash, order.total) === null)
          throw new Error("Enter cash equal to or greater than the total.")
        const receipt = await api(
          `/orders/${pathId(order.id)}/collect`,
          "POST",
          { cash: data.cash },
        )
        delete state.cash[order.id]
        await refresh()
        showReceipt(receipt)
        break
      }
    }
  })
})
document.querySelector("#root").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]")
  if (!button || button.disabled) return
  const { action, value, id } = button.dataset
  if (state.busy && !["close-receipt", "print"].includes(action)) return
  switch (action) {
    case "role":
      state.role = value
      state.login = { username: "", password: "" }
      state.showPassword = false
      state.error = ""
      break
    case "tab":
      state.tab = value
      state.error = ""
      break
    case "register":
      state.tab = "Create account"
      state.student = { number: "", password: "", confirm: "" }
      state.error = ""
      break
    case "login-view":
      state.tab = "Login"
      state.role = "Student"
      state.student = { number: "", password: "", confirm: "" }
      state.error = ""
      break
    case "category":
      state.category = value
      break
    case "queue":
      state.queue = value
      break
    case "activity-filter":
      state.activityFilter = value
      break
    case "dismiss":
      state.message = ""
      break
    case "retry":
      window.location.reload()
      return
    case "clear-cart":
      state.cart = {}
      break
    case "add":
    case "subtract": {
      const product = state.products.find((item) => String(item.id) === id)
      if (product)
        state.cart[id] = Math.min(
          product.stock,
          Math.max(0, (state.cart[id] || 0) + (action === "add" ? 1 : -1)),
        )
      break
    }
    case "ready-orders":
      state.tab = "Orders"
      state.queue = "Ready"
      break
    case "remove-photo":
      state.uploadVersion++
      state.product.photo = ""
      state.uploading = false
      break
    case "receipt":
      showReceipt(state.orders.find((order) => order.id === id))
      return
    case "close-receipt":
      dialog.close()
      return
    case "print":
      window.print()
      return
    case "logout":
      void mutate(async () => {
        await api("/auth/logout", "POST")
        resetSession()
        state.message = ""
      })
      return
    case "ready":
      void mutate(async () => {
        await api(`/orders/${pathId(id)}/ready`, "POST")
        await refresh()
      })
      return
    case "remove-product":
      void mutate(async () => {
        await api(`/products/${pathId(id)}`, "DELETE")
        await refresh()
      })
      return
    case "order":
      if (state.account?.owner || !cartItems().length || state.connectionError)
        return
      void mutate(async () => {
        const items = cartItems().map((item) => ({
          id: item.id,
          quantity: state.cart[item.id],
        }))
        const signature = JSON.stringify(items)
        if (state.pending?.signature !== signature)
          state.pending = {
            signature,
            id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join(""),
          }
        try {
          const order = await api("/orders", "POST", {
            items,
            request_id: state.pending.id,
          })
          state.pending = null
          state.cart = {}
          state.tab = "Orders"
          state.queue = "Active"
          state.message = `Order ${order.number} is pending. Pay cash at the counter before collecting your food.`
        } finally {
          await refresh()
        }
      })
      return
  }
  render()
})
dialog.addEventListener("close", () => {
  state.receipt = null
})
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect()
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close()
  }
})
async function poll() {
  await refresh()
  if (state.account && !state.busy && !state.uploading) render()
  else if (!state.account && !state.checking && state.error) render()
  window.setTimeout(poll, 5000)
}
document.querySelector("#school-logo").src = schoolLogo
render()
api("/auth/me")
  .then((account) => {
    state.account = account
    state.tab = account.owner ? "Orders" : "Menu"
    state.queue = account.owner ? "Pending" : "Active"
  })
  .catch((error) => {
    if (error.status !== 401) state.connectionError = errorText(error)
  })
  .finally(async () => {
    state.checking = false
    await refresh()
    render()
    window.setTimeout(poll, 5000)
  })
