const firebaseConfig = {
  apiKey: "AIzaSyBwLjWo5yY4YRY5noKQZqhTiNLB8PYcTLo",
  authDomain: "pack-ground-tracker.firebaseapp.com",
  projectId: "pack-ground-tracker",
  storageBucket: "pack-ground-tracker.appspot.com",
  messagingSenderId: "199008755535",
  appId: "1:199008755535:web:50b0064769705d254caf3a"
};

const fallbackUsers = [
  { email: 'admin@packground.co.zw', pass: 'packground2026', role: 'Admin', status: 'Active' },
  { email: 'Elton', pass: 'packground2026', role: 'Staff', status: 'Active' },
  { email: 'Ziyambi', pass: 'packground2026', role: 'Staff', status: 'Active' },
  { email: 'Chiedza', pass: 'packground2026', role: 'Staff', status: 'Active' }
];

let users = [];
let inquiries = [];
let quotations = [];
let invoices = [];
let currentUser = null;
let db = null;

function getFallbackUser(email, pass) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPass = String(pass || '').trim();
  return fallbackUsers.find(u => {
    const uEmail = String(u.email || '').trim().toLowerCase();
    return uEmail === normalizedEmail && String(u.pass || '').trim() === normalizedPass;
  });
}

function setupFirebaseApp() {
  if (typeof firebase !== 'undefined' && firebase.apps) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    initDatabase();
  } else {
    setTimeout(setupFirebaseApp, 150);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setupFirebaseApp();

  const today = new Date().toISOString().split('T')[0];
  const quoteDate = document.getElementById('quoteDate');
  const custFollowUp = document.getElementById('custFollowUp');

  if (quoteDate) quoteDate.value = today;
  if (custFollowUp) custFollowUp.value = today;

  generateQuoteRef();
  initializeDefaultAppState();
});

function initializeDefaultAppState() {
  const input = document.getElementById('paymentTermsText');
  if (input) {
    input.value = '40% deposit, balance due upon completion and prior to installation';
  }
}

async function initDatabase() {
  if (!db) return;
  try {
    const usersSnap = await db.collection('users').get();
    if (usersSnap.empty) {
      const defaults = fallbackUsers.map(u => ({ ...u }));
      for (const u of defaults) {
        await db.collection('users').add(u);
      }
    }
    loadRealtimeData();
  } catch (e) {
    console.warn('Firebase connection notice:', e);
    loadRealtimeData();
  }
}

function loadRealtimeData() {
  if (!db) return;

  db.collection('users').onSnapshot(snapshot => {
    users = [];
    snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
    if (document.getElementById('userModal') && !document.getElementById('userModal').classList.contains('hidden')) {
      renderUsers();
    }
  });

  db.collection('inquiries').orderBy('id', 'desc').onSnapshot(snapshot => {
    inquiries = [];
    snapshot.forEach(doc => inquiries.push({ docId: doc.id, ...doc.data() }));
    renderTable();
    updateStats();
    populateInquirySelector();
  });

  db.collection('quotations').onSnapshot(snapshot => {
    quotations = [];
    snapshot.forEach(doc => quotations.push({ docId: doc.id, ...doc.data() }));
    renderQuotationsTable();
  });

  db.collection('invoices').onSnapshot(snapshot => {
    invoices = [];
    snapshot.forEach(doc => invoices.push({ docId: doc.id, ...doc.data() }));
    renderInvoicesTable();
  });
}

// APP NAVIGATION
function switchAppTab(tabId) {
  document.querySelectorAll('.app-tab-page').forEach(page => page.classList.add('hidden'));
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.classList.remove('active-tab');
  });

  document.getElementById(tabId).classList.remove('hidden');

  const activeBtn = document.getElementById(`tabBtn-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add('active-tab');
  }

  if (tabId === 'quotationsTab' && document.getElementById('quoteLineItemsBody').children.length === 0) {
    addQuoteRow('Mild Steel RHS Tubing (Custom Size)', '6m Length', 45);
    addQuoteRow('Structural MIG/TIG Welding Labor', 'Hours', 25);
  }
}

// LOGIN
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value.trim();

  const fallbackUser = getFallbackUser(email, pass);
  if (fallbackUser) {
    currentUser = fallbackUser;
    openDashboard();
    return;
  }

  if (users.length) {
    const found = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase() && u.pass === pass);

    if (!found) {
      alert('Invalid Staff Credentials. Please check your username and password.');
      return;
    }

    if (found.status === 'Archived') {
      alert('Access Denied: Account archived. Contact an administrator.');
      return;
    }

    currentUser = found;
    openDashboard();
    return;
  }

  alert('Unable to verify credentials yet. Please wait a moment and try again.');
}

function openDashboard() {
  document.getElementById('loginModal').classList.add('hidden');
  document.getElementById('appContent').classList.remove('hidden');
  document.getElementById('welcomeUserBanner').innerText = `Welcome, ${currentUser.role} - ${currentUser.email}`;

  if (currentUser.role !== 'Admin') {
    document.getElementById('userManagementBtn').style.display = 'none';
  } else {
    document.getElementById('userManagementBtn').style.display = 'block';
  }
}

function handleLogout() {
  currentUser = null;
  document.getElementById('appContent').classList.add('hidden');
  document.getElementById('loginModal').classList.remove('hidden');
  document.getElementById('loginForm').reset();
}

// CLIENT INQUIRY MODAL
function openClientForm() {
  document.getElementById('clientModal').classList.remove('hidden');
  document.getElementById('publicInquiryForm').classList.remove('hidden');
  document.getElementById('clientSuccessMsg').classList.add('hidden');
}

function closeClientForm() {
  document.getElementById('clientModal').classList.add('hidden');
}

async function submitClientInquiry(e) {
  e.preventDefault();

  const payload = {
    id: Date.now(),
    name: document.getElementById('publicName').value.trim(),
    phone: document.getElementById('publicPhone').value.trim(),
    source: 'Client Portal Web',
    details: document.getElementById('publicDetails').value.trim(),
    followUp: new Date().toISOString().split('T')[0],
    status: 'New'
  };

  if (db) {
    await db.collection('inquiries').add(payload);
  }

  document.getElementById('publicInquiryForm').reset();
  document.getElementById('publicInquiryForm').classList.add('hidden');
  document.getElementById('clientSuccessMsg').classList.remove('hidden');
}

// INQUIRIES
async function saveInquiry(e) {
  e.preventDefault();

  const newInquiry = {
    id: Date.now(),
    name: document.getElementById('custName').value.trim(),
    phone: document.getElementById('custPhone').value.trim(),
    source: document.getElementById('custSource').value,
    details: document.getElementById('custDetails').value.trim(),
    followUp: document.getElementById('custFollowUp').value,
    status: 'New'
  };

  if (db) await db.collection('inquiries').add(newInquiry);

  document.getElementById('inquiryForm').reset();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('custFollowUp').value = today;
}

function renderTable() {
  const tbody = document.getElementById('inquiryTableBody');
  if (!tbody) return;

  const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
  tbody.innerHTML = '';

  const filtered = inquiries.filter(i => {
    const name = (i.name || '').toLowerCase();
    const phone = (i.phone || '').toLowerCase();
    const details = (i.details || '').toLowerCase();
    return name.includes(search) || phone.includes(search) || details.includes(search);
  });

  filtered.forEach(i => {
    const row = document.createElement('tr');
    row.className = 'border-b border-slate-700/50 hover:bg-slate-700/30';
    row.innerHTML = `
      <td class="p-3 font-semibold text-white">${i.name || ''}<br><span class="text-xs font-normal text-slate-400">${i.phone || ''}</span></td>
      <td class="p-3"><span class="px-2 py-1 bg-slate-700 rounded text-xs">${i.source || ''}</span></td>
      <td class="p-3 max-w-xs truncate">${i.details || ''}</td>
      <td class="p-3"><span class="text-xs font-mono ${new Date(i.followUp) < new Date() ? 'text-rose-400 font-bold' : 'text-slate-300'}">${i.followUp || ''}</span></td>
      <td class="p-3">
        <select onchange="updateStatus('${i.docId}', this.value)" class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200">
          <option value="New" ${i.status === 'New' ? 'selected' : ''}>New</option>
          <option value="Quote Sent" ${i.status === 'Quote Sent' ? 'selected' : ''}>Quote Sent</option>
          <option value="Followed Up" ${i.status === 'Followed Up' ? 'selected' : ''}>Followed Up</option>
          <option value="Won" ${i.status === 'Won' ? 'selected' : ''}>Won</option>
          <option value="Lost" ${i.status === 'Lost' ? 'selected' : ''}>Lost</option>
        </select>
      </td>
      <td class="p-3 text-right">
        <button onclick="deleteInquiry('${i.docId}')" class="text-rose-400 hover:text-rose-300 text-xs">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function updateStatus(docId, newStatus) {
  if (db) await db.collection('inquiries').doc(docId).update({ status: newStatus });
}

async function deleteInquiry(docId) {
  if (db) await db.collection('inquiries').doc(docId).delete();
}

function updateStats() {
  if (!document.getElementById('statTotal')) return;

  document.getElementById('statTotal').innerText = inquiries.length;
  document.getElementById('statPending').innerText = inquiries.filter(i => i.status === 'New' || i.status === 'Followed Up').length;
  document.getElementById('statQuotes').innerText = inquiries.filter(i => i.status === 'Quote Sent').length;
  document.getElementById('statWon').innerText = inquiries.filter(i => i.status === 'Won').length;
}

// QUOTATIONS
function generateQuoteRef() {
  const ref = 'PGI-QT-' + Math.floor(1000 + Math.random() * 9000);
  const field = document.getElementById('quoteRef');
  if (field) field.value = ref;
}

function populateInquirySelector() {
  const select = document.getElementById('quoteInquirySelector');
  if (!select) return;
  select.innerHTML = '<option value="">-- Select Registered Client --</option>';

  inquiries.forEach(i => {
    const opt = document.createElement('option');
    opt.value = i.docId;
    opt.textContent = `${i.name} (${i.phone}) - ${i.details}`;
    select.appendChild(opt);
  });
}

function toggleClientTypeMode() {
  const mode = document.querySelector('input[name="clientType"]:checked')?.value || 'existing';

  if (mode === 'existing') {
    document.getElementById('existingClientContainer').classList.remove('hidden');
    document.getElementById('newClientNameContainer').classList.add('hidden');
    document.getElementById('quoteClientPhone').readOnly = true;
  } else {
    document.getElementById('existingClientContainer').classList.add('hidden');
    document.getElementById('newClientNameContainer').classList.remove('hidden');
    document.getElementById('quoteClientPhone').readOnly = false;
    document.getElementById('quoteClientName').value = '';
    document.getElementById('quoteClientPhone').value = '';
  }
}

function autoFillFromInquiry() {
  const docId = document.getElementById('quoteInquirySelector').value;
  const inquiry = inquiries.find(i => i.docId === docId);

  if (inquiry) {
    document.getElementById('quoteClientPhone').value = inquiry.phone || '';
    document.getElementById('quoteSubject').value = inquiry.details || '';
  }
}

// PAYMENT TERMS
function handlePaymentTermsPreset() {
  const select = document.getElementById('quoteTermsPreset');
  const output = document.getElementById('paymentTermsText');
  if (!select || !output) return;

  const preset = select.value;

  const paymentMap = {
    deposit_20: '20% deposit, balance due 80% on completion.',
    deposit_30: '30% deposit, balance due 70% on completion.',
    deposit_40: '40% deposit, balance due 60% on completion.',
    deposit_50: '50% deposit, balance due 50% on completion.',
    deposit_60: '60% deposit, balance due 40% on completion.',
    deposit_75: '75% deposit, balance due 25% on completion.',
    payment_delivery: 'Payment due on delivery / completion.',
    credit_7: 'Credit terms: 7 days from invoice date.',
    credit_14: 'Credit terms: 14 days from invoice date.',
    credit_30: 'Credit terms: 30 days from invoice date.',
    credit_45: 'Credit terms: 45 days from invoice date.',
    credit_60: 'Credit terms: 60 days from invoice date.',
    custom: ''
  };

  output.value = paymentMap[preset] || '';
}

function addQuoteRow(description = '', unit = 'Item', price = 0, qty = 1) {
  const tbody = document.getElementById('quoteLineItemsBody');
  if (!tbody) return;

  const rowId = Date.now() + Math.random();
  const tr = document.createElement('tr');
  tr.id = `row-${rowId}`;
  tr.className = 'hover:bg-slate-800/40';

  tr.innerHTML = `
    <td class="p-2">
      <input type="text" value="${description}" placeholder="Enter product description" class="row-desc w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200">
    </td>
    <td class="p-2">
      <input type="text" value="${unit}" placeholder="Unit" class="row-unit w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200">
    </td>
    <td class="p-2">
      <input type="number" value="${qty}" min="1" onchange="calculateQuoteTotals()" onkeyup="calculateQuoteTotals()" class="row-qty w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-center text-slate-200">
    </td>
    <td class="p-2">
      <input type="number" value="${price}" step="0.01" min="0" onchange="calculateQuoteTotals()" onkeyup="calculateQuoteTotals()" class="row-price w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-right text-slate-200">
    </td>
    <td class="p-2 text-right font-mono font-bold text-slate-200 row-total">$0.00</td>
    <td class="p-2 text-center">
      <button type="button" onclick="removeQuoteRow('${tr.id}')" class="text-rose-400 hover:text-rose-300 font-bold">&times;</button>
    </td>
  `;

  tbody.appendChild(tr);
  calculateQuoteTotals();
}

function removeQuoteRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
  calculateQuoteTotals();
}

function calculateQuoteTotals() {
  let subtotal = 0;
  const rows = document.querySelectorAll('#quoteLineItemsBody tr');

  rows.forEach(tr => {
    const qty = parseFloat(tr.querySelector('.row-qty').value) || 0;
    const price = parseFloat(tr.querySelector('.row-price').value) || 0;
    const total = qty * price;
    tr.querySelector('.row-total').textContent = `$${total.toFixed(2)}`;
    subtotal += total;
  });

  const vat = subtotal * 0.15;
  const grandTotal = subtotal + vat;

  document.getElementById('quoteSubtotal').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('quoteVat').textContent = `$${vat.toFixed(2)}`;
  document.getElementById('quoteGrandTotal').textContent = `$${grandTotal.toFixed(2)}`;
}

async function handleSaveQuote(e) {
  e.preventDefault();

  const mode = document.querySelector('input[name="clientType"]:checked')?.value || 'existing';
  let clientName = '';
  let clientPhone = document.getElementById('quoteClientPhone').value.trim();
  const paymentTerms = document.getElementById('paymentTermsText').value.trim();

  if (mode === 'existing') {
    const docId = document.getElementById('quoteInquirySelector').value;
    const selectedInquiry = inquiries.find(i => i.docId === docId);

    if (!selectedInquiry) {
      alert('Please select a client from the inquiry list.');
      return;
    }

    clientName = selectedInquiry.name;
  } else {
    clientName = document.getElementById('quoteClientName').value.trim();

    if (!clientName) {
      alert('Please enter the name of the new client.');
      return;
    }

    const newInquiryDoc = {
      id: Date.now(),
      name: clientName,
      phone: clientPhone,
      source: 'Quotation Direct Entry',
      details: document.getElementById('quoteSubject').value.trim(),
      followUp: new Date().toISOString().split('T')[0],
      status: 'Quote Sent'
    };

    if (db) await db.collection('inquiries').add(newInquiryDoc);
  }

  const items = [];
  const rows = document.querySelectorAll('#quoteLineItemsBody tr');

  rows.forEach(tr => {
    items.push({
      desc: tr.querySelector('.row-desc').value || 'Custom Metal Fabrication Work',
      unit: tr.querySelector('.row-unit').value || 'Item',
      qty: parseFloat(tr.querySelector('.row-qty').value) || 1,
      price: parseFloat(tr.querySelector('.row-price').value) || 0
    });
  });

  if (items.length === 0) {
    alert('Please add at least one line item to the quotation.');
    return;
  }

  const subtotal = parseFloat(document.getElementById('quoteSubtotal').textContent.replace('$', '')) || 0;
  const vat = parseFloat(document.getElementById('quoteVat').textContent.replace('$', '')) || 0;
  const grandTotal = parseFloat(document.getElementById('quoteGrandTotal').textContent.replace('$', '')) || 0;

  const quoteDoc = {
    ref: document.getElementById('quoteRef').value,
    clientName: clientName,
    clientPhone: clientPhone,
    subject: document.getElementById('quoteSubject').value.trim(),
    date: document.getElementById('quoteDate').value,
    paymentTerms: paymentTerms,
    items: items,
    subtotal: subtotal,
    vat: vat,
    grandTotal: grandTotal,
    status: 'Sent'
  };

  if (db) await db.collection('quotations').add(quoteDoc);

  alert(`Quotation ${quoteDoc.ref} generated successfully!`);
  document.getElementById('quoteForm').reset();
  document.getElementById('quoteLineItemsBody').innerHTML = '';
  generateQuoteRef();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('quoteDate').value = today;
  document.getElementById('paymentTermsText').value = '40% deposit, balance due upon completion and prior to installation';
  toggleClientTypeMode();
}

function renderQuotationsTable() {
  const tbody = document.getElementById('quotationsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  quotations.forEach(q => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-700/50 hover:bg-slate-700/30';
    tr.innerHTML = `
      <td class="p-3 font-mono font-bold text-rose-400">${q.ref}</td>
      <td class="p-3 font-semibold text-white">${q.clientName}<br><span class="text-xs font-normal text-slate-400">${q.clientPhone}</span></td>
      <td class="p-3 text-xs max-w-xs truncate">${q.subject}</td>
      <td class="p-3 font-bold text-emerald-400">$${(q.grandTotal || 0).toFixed(2)}</td>
      <td class="p-3"><span class="px-2 py-1 rounded text-xs font-semibold ${q.status === 'Confirmed Order' ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-700' : 'bg-indigo-900/80 text-indigo-200'}">${q.status}</span></td>
      <td class="p-3 text-right space-x-2">
        <button onclick="previewDocument('quote', '${q.docId}')" class="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-semibold">Preview / Print</button>
        ${q.status !== 'Confirmed Order' ? `<button onclick="confirmOrderFromQuote('${q.docId}')" class="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-semibold">Confirm Order</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function confirmOrderFromQuote(quoteDocId) {
  const q = quotations.find(item => item.docId === quoteDocId);
  if (!q) return;

  if (db) await db.collection('quotations').doc(quoteDocId).update({ status: 'Confirmed Order' });

  const matchingInquiry = inquiries.find(i => i.phone === q.clientPhone);
  if (matchingInquiry && db) {
    await db.collection('inquiries').doc(matchingInquiry.docId).update({ status: 'Won' });
  }

  const invoiceDoc = {
    invoiceNo: 'INV-' + q.ref.replace('PGI-QT-', ''),
    quoteRef: q.ref,
    clientName: q.clientName,
    clientPhone: q.clientPhone,
    subject: q.subject,
    items: q.items,
    subtotal: q.subtotal,
    vat: q.vat,
    grandTotal: q.grandTotal,
    paymentStatus: 'Unpaid',
    date: new Date().toISOString().split('T')[0]
  };

  if (db) await db.collection('invoices').add(invoiceDoc);

  alert(`Order Confirmed! Tax Invoice ${invoiceDoc.invoiceNo} has been generated.`);
  switchAppTab('invoicesTab');
}

function renderInvoicesTable() {
  const tbody = document.getElementById('invoicesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  invoices.forEach(inv => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-700/50 hover:bg-slate-700/30';
    tr.innerHTML = `
      <td class="p-3 font-mono font-bold text-rose-400">${inv.invoiceNo}</td>
      <td class="p-3 font-semibold text-white">${inv.clientName}<br><span class="text-xs font-normal text-slate-400">${inv.clientPhone}</span></td>
      <td class="p-3 font-bold text-emerald-400">$${(inv.grandTotal || 0).toFixed(2)}</td>
      <td class="p-3">
        <select onchange="updateInvoicePaymentStatus('${inv.docId}', this.value)" class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-semibold ${inv.paymentStatus === 'Fully Paid' ? 'text-emerald-400' : 'text-amber-400'}">
          <option value="Unpaid" ${inv.paymentStatus === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
          <option value="50% Deposit Paid" ${inv.paymentStatus === '50% Deposit Paid' ? 'selected' : ''}>50% Deposit Paid</option>
          <option value="Fully Paid" ${inv.paymentStatus === 'Fully Paid' ? 'selected' : ''}>Fully Paid</option>
        </select>
      </td>
      <td class="p-3 text-right">
        <button onclick="previewDocument('invoice', '${inv.docId}')" class="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-semibold">Preview / Print</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function updateInvoicePaymentStatus(docId, newStatus) {
  if (db) await db.collection('invoices').doc(docId).update({ paymentStatus: newStatus });
}

function previewDocument(type, docId) {
  let docData = null;

  if (type === 'quote') {
    docData = quotations.find(q => q.docId === docId);
    document.getElementById('docTypeLabel').textContent = 'QUOTATION';
    document.getElementById('docNumberText').textContent = docData ? docData.ref : '#';
  } else {
    docData = invoices.find(inv => inv.docId === docId);
    document.getElementById('docTypeLabel').textContent = 'TAX INVOICE';
    document.getElementById('docNumberText').textContent = docData ? docData.invoiceNo : '#';
  }

  if (!docData) return;

  document.getElementById('docClientName').textContent = docData.clientName || '';
  document.getElementById('docClientPhone').textContent = docData.clientPhone || '';
  document.getElementById('docSubjectText').textContent = docData.subject || '';
  document.getElementById('docDateText').textContent = `Date: ${docData.date || new Date().toISOString().split('T')[0]}`;

  const paymentText = docData.paymentTerms || 'Payment terms to be agreed.';
  document.getElementById('docPaymentTerms').textContent = paymentText;

  const tbody = document.getElementById('docItemsBody');
  tbody.innerHTML = '';

  (docData.items || []).forEach(item => {
    const total = (item.qty || 0) * (item.price || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-2.5 font-medium">${item.desc || ''}</td>
      <td class="p-2.5 text-slate-500">${item.unit || ''}</td>
      <td class="p-2.5 text-center font-bold">${item.qty || 0}</td>
      <td class="p-2.5 text-right">$${(item.price || 0).toFixed(2)}</td>
      <td class="p-2.5 text-right font-bold">$${total.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('docSubtotal').textContent = `$${(docData.subtotal || 0).toFixed(2)}`;
  document.getElementById('docVat').textContent = `$${(docData.vat || 0).toFixed(2)}`;
  document.getElementById('docGrandTotal').textContent = `$${(docData.grandTotal || 0).toFixed(2)}`;

  document.getElementById('printDocModal').classList.remove('hidden');
}

function closePrintModal() {
  document.getElementById('printDocModal').classList.add('hidden');
}

// ANALYTICS
function openAnalyticsModal() {
  document.getElementById('analyticsModal').classList.remove('hidden');
  renderGraphicalAnalytics();
}

function closeAnalyticsModal() {
  document.getElementById('analyticsModal').classList.add('hidden');
}

function renderGraphicalAnalytics() {
  const statusCounts = {
    New: inquiries.filter(i => i.status === 'New').length,
    'Quote Sent': inquiries.filter(i => i.status === 'Quote Sent').length,
    'Followed Up': inquiries.filter(i => i.status === 'Followed Up').length,
    Won: inquiries.filter(i => i.status === 'Won').length,
    Lost: inquiries.filter(i => i.status === 'Lost').length
  };

  const statusMax = Math.max(...Object.values(statusCounts), 1);
  let statusSvg = `<svg class="w-full h-full" viewBox="0 0 240 160">`;
  const colors = { New: '#fbbf24', 'Quote Sent': '#818cf8', 'Followed Up': '#38bdf8', Won: '#34d399', Lost: '#f87171' };
  let x = 15;

  Object.keys(statusCounts).forEach(key => {
    const val = statusCounts[key];
    const barH = (val / statusMax) * 100;
    statusSvg += `
      <rect x="${x}" y="${130 - barH}" width="28" height="${barH}" fill="${colors[key]}" rx="4" />
      <text x="${x + 14}" y="${125 - barH}" font-size="9" fill="#ffffff" text-anchor="middle" font-weight="bold">${val}</text>
      <text x="${x + 14}" y="148" font-size="8" fill="#94a3b8" text-anchor="middle">${key.split(' ')[0]}</text>
    `;
    x += 44;
  });

  statusSvg += `</svg>`;
  document.getElementById('chartStatusContainer').innerHTML = statusSvg;

  const sourceCounts = {};
  inquiries.forEach(i => {
    sourceCounts[i.source] = (sourceCounts[i.source] || 0) + 1;
  });

  let sourceSvg = `<svg class="w-full h-full" viewBox="0 0 200 160">`;
  const sourceKeys = Object.keys(sourceCounts);
  const totalInqs = inquiries.length || 1;
  let startAngle = 0;
  const palette = ['#e11d48', '#0284c7', '#059669', '#d97706', '#7c3aed', '#475569'];

  if (sourceKeys.length === 0) {
    sourceSvg += `<text x="100" y="80" font-size="10" fill="#64748b" text-anchor="middle">No Lead Data Available</text>`;
  } else {
    sourceKeys.forEach((src, idx) => {
      const sliceAngle = (sourceCounts[src] / totalInqs) * 360;
      const x1 = 100 + 50 * Math.cos(Math.PI * startAngle / 180);
      const y1 = 70 + 50 * Math.sin(Math.PI * startAngle / 180);
      const endAngle = startAngle + sliceAngle;
      const x2 = 100 + 50 * Math.cos(Math.PI * endAngle / 180);
      const y2 = 70 + 50 * Math.sin(Math.PI * endAngle / 180);
      const largeArc = sliceAngle > 180 ? 1 : 0;
      const pathData = `M100,70 L${x1},${y1} A50,50 0 ${largeArc},1 ${x2},${y2} Z`;

      sourceSvg += `<path d="${pathData}" fill="${palette[idx % palette.length]}" />`;
      startAngle = endAngle;
    });
  }

  sourceSvg += `</svg>`;
  document.getElementById('chartSourceContainer').innerHTML = sourceSvg;

  const quotedTotal = quotations.reduce((sum, q) => sum + (q.grandTotal || 0), 0);
  const invoicedTotal = invoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
  const maxRev = Math.max(quotedTotal, invoicedTotal, 1);
  const qBarH = (quotedTotal / maxRev) * 100;
  const invBarH = (invoicedTotal / maxRev) * 100;

  const finSvg = `<svg class="w-full h-full" viewBox="0 0 200 160">
    <rect x="40" y="${130 - qBarH}" width="40" height="${qBarH}" fill="#818cf8" rx="4"/>
    <text x="60" y="${120 - qBarH}" font-size="9" fill="#ffffff" text-anchor="middle" font-weight="bold">$${quotedTotal.toFixed(0)}</text>
    <text x="60" y="148" font-size="9" fill="#94a3b8" text-anchor="middle">Quotations</text>

    <rect x="120" y="${130 - invBarH}" width="40" height="${invBarH}" fill="#34d399" rx="4"/>
    <text x="140" y="${120 - invBarH}" font-size="9" fill="#ffffff" text-anchor="middle" font-weight="bold">$${invoicedTotal.toFixed(0)}</text>
    <text x="140" y="148" font-size="9" fill="#94a3b8" text-anchor="middle">Invoices</text>
  </svg>`;

  document.getElementById('chartFinancialContainer').innerHTML = finSvg;
}

// USER MANAGEMENT
function openUserModal() {
  if (!currentUser || currentUser.role !== 'Admin') {
    alert('Unauthorized: Only administrators can manage users.');
    return;
  }
  document.getElementById('userModal').classList.remove('hidden');
  renderUsers();
}

function closeUserModal() {
  document.getElementById('userModal').classList.add('hidden');
}

async function handleAddUser(e) {
  e.preventDefault();

  const email = document.getElementById('newUserEmail').value.trim();
  const pass = document.getElementById('newUserPassword').value.trim();
  const role = document.getElementById('newUserRole').value;

  if (users.some(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
    alert('An account with this username/email already exists.');
    return;
  }

  if (db) await db.collection('users').add({ email, pass, role, status: 'Active' });
  document.getElementById('addUserForm').reset();
}

async function updateUserRole(docId, newRole) {
  if (db) await db.collection('users').doc(docId).update({ role: newRole });
}

async function updateUserPassword(docId, index) {
  const newPass = document.getElementById(`passInput_${index}`).value.trim();
  if (!newPass) {
    alert('Please enter a new password.');
    return;
  }
  if (db) await db.collection('users').doc(docId).update({ pass: newPass });
  document.getElementById(`passInput_${index}`).value = '';
  alert('Password successfully updated.');
}

async function toggleUserArchive(docId, currentStatus, userEmail) {
  if (userEmail === currentUser.email) {
    alert('You cannot archive your own currently logged-in admin account.');
    return;
  }
  const newStatus = currentStatus === 'Archived' ? 'Active' : 'Archived';
  if (db) await db.collection('users').doc(docId).update({ status: newStatus });
}

function renderUsers() {
  const container = document.getElementById('userList');
  if (!container) return;

  container.innerHTML = users.map((u, index) => `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 p-3 rounded-lg border ${u.status === 'Archived' ? 'border-rose-900/50 opacity-60' : 'border-slate-700'} gap-3 text-xs">
      <div>
        <p class="font-semibold text-white text-sm">${u.email} ${u.status === 'Archived' ? '<span class="text-rose-400 text-[10px] uppercase font-bold">(Archived)</span>' : ''}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
        <input type="text" id="passInput_${index}" placeholder="New password" class="field-input w-28">
        <button onclick="updateUserPassword('${u.id}', ${index})" class="btn btn-slate text-[10px] px-2 py-1">Update Pwd</button>
        <select onchange="updateUserRole('${u.id}', this.value)" class="field-input w-28">
          <option value="Staff" ${u.role === 'Staff' ? 'selected' : ''}>Staff</option>
          <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
        </select>
        <button onclick="toggleUserArchive('${u.id}', '${u.status}', '${u.email}')" class="px-2.5 py-1 rounded text-xs font-semibold ${u.status === 'Archived' ? 'bg-emerald-800 hover:bg-emerald-700 text-white' : 'bg-rose-900/80 hover:bg-rose-800 text-rose-200'}">
          ${u.status === 'Archived' ? 'Restore' : 'Archive'}
        </button>
      </div>
    </div>
  `).join('');
}

function exportToCSV() {
  if (!inquiries.length) return alert('No inquiries to export');

  let csv = 'Customer Name,Phone,Source,Details,FollowUp Date,Status\n';
  inquiries.forEach(i => {
    csv += `"${i.name || ''}","${i.phone || ''}","${i.source || ''}","${i.details || ''}","${i.followUp || ''}","${i.status || ''}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'PACK_Ground_Inquiries.csv';
  a.click();
}