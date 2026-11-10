/* PACK Ground Tracker — Firebase Authentication migration
 * This app expects firebase-app, firebase-firestore, and firebase-auth compat SDKs
 * to load before this file. Staff roles live at userRoles/{Firebase Auth UID}.
 */

const firebaseConfig = {
  apiKey: "AIzaSyBwLjWo5yY4YRY5noKQZqhTiNLB8PYcTLo",
  authDomain: "pack-ground-tracker.firebaseapp.com",
  projectId: "pack-ground-tracker",
  storageBucket: "pack-ground-tracker.appspot.com",
  messagingSenderId: "199008755535",
  appId: "1:199008755535:web:50b0064769705d254caf3a"
};

let db = null;
let auth = null;
let currentUser = null;
let inquiries = [];
let quotations = [];
let invoices = [];
let dataUnsubscribers = [];
let authCheckSequence = 0;

window.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
  const today = new Date().toISOString().slice(0, 10);
  const quoteDate = document.getElementById('quoteDate');
  const followUp = document.getElementById('custFollowUp');
  if (quoteDate) quoteDate.value = today;
  if (followUp) followUp.value = today;

  generateQuoteRef();
  initializeDefaultAppState();
  disableLegacyUserManagementForm();
  hideHardcodedPrintTerms();
  initializeFirebase();
}

function initializeFirebase() {
  if (typeof firebase === 'undefined' || !firebase.apps) {
    window.setTimeout(initializeFirebase, 150);
    return;
  }

  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    auth.onAuthStateChanged(handleAuthStateChanged);
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    alert('Firebase could not start. Check the Firebase SDK script tags and configuration.');
  }
}

function initializeDefaultAppState() {
  const terms = document.getElementById('paymentTermsText');
  if (terms && !terms.value) {
    terms.value = '40% deposit, balance due upon completion and prior to installation';
  }
  const preset = document.getElementById('quoteTermsPreset');
  if (preset) preset.value = 'custom';
}

function disableLegacyUserManagementForm() {
  // The old UI stored passwords in Firestore. Account provisioning must be done
  // in Firebase Console until a trusted Admin SDK backend is implemented.
  const form = document.getElementById('addUserForm');
  if (form) form.hidden = true;
  const heading = document.querySelector('#userModal h4');
  if (heading) heading.textContent = 'Account provisioning';
  const list = document.getElementById('userList');
  if (list) {
    list.textContent = 'For now, create staff accounts in Firebase Console → Authentication → Users, then add userRoles/{UID} with role "Staff". Do not enter or store passwords in this app.';
  }
}

function hideHardcodedPrintTerms() {
  const printable = document.getElementById('printableDocument');
  if (!printable) return;
  const heading = Array.from(printable.querySelectorAll('p')).find(p =>
    p.textContent.trim() === 'Payment Terms & Instructions:'
  );
  if (heading && heading.parentElement) heading.parentElement.hidden = true;
}

async function handleAuthStateChanged(firebaseUser) {
  const sequence = ++authCheckSequence;
  clearDataListeners();
  currentUser = null;
  hideDashboard();

  if (!firebaseUser) return;
  if (!db) return;

  try {
    const roleSnapshot = await db.collection('userRoles').doc(firebaseUser.uid).get();
    if (sequence !== authCheckSequence) return;

    if (!roleSnapshot.exists) {
      await auth.signOut();
      alert('This Firebase account has no staff role. An administrator must assign role "Admin" or "Staff" to userRoles/' + firebaseUser.uid + '.');
      return;
    }

    const role = roleSnapshot.data().role;
    if (role !== 'Admin' && role !== 'Staff') {
      await auth.signOut();
      alert('The role assigned to this account is not permitted.');
      return;
    }

    currentUser = { uid: firebaseUser.uid, email: firebaseUser.email || '', role };
    showDashboard();
    loadRealtimeData();
  } catch (error) {
    console.error('Could not verify the staff role:', error);
    if (auth.currentUser) await auth.signOut();
    alert('Could not verify your staff role. Firestore must allow a signed-in user to read their own userRoles/{UID} document.');
  }
}

function showDashboard() {
  document.getElementById('loginModal')?.classList.add('hidden');
  document.getElementById('appContent')?.classList.remove('hidden');
  const banner = document.getElementById('welcomeUserBanner');
  if (banner && currentUser) banner.textContent = `Welcome, ${currentUser.role} - ${currentUser.email}`;
  const usersButton = document.getElementById('userManagementBtn');
  if (usersButton) usersButton.style.display = currentUser?.role === 'Admin' ? '' : 'none';
}

function hideDashboard() {
  document.getElementById('appContent')?.classList.add('hidden');
  document.getElementById('loginModal')?.classList.remove('hidden');
  const usersButton = document.getElementById('userManagementBtn');
  if (usersButton) usersButton.style.display = 'none';
}

function clearDataListeners() {
  dataUnsubscribers.forEach(unsubscribe => {
    try { unsubscribe(); } catch (error) { console.warn('Listener cleanup failed:', error); }
  });
  dataUnsubscribers = [];
  inquiries = [];
  quotations = [];
  invoices = [];
  renderTable();
  renderQuotationsTable();
  renderInvoicesTable();
  updateStats();
}

function loadRealtimeData() {
  if (!db || !currentUser) return;
  clearDataListeners();

  dataUnsubscribers.push(db.collection('inquiries').orderBy('id', 'desc').onSnapshot(snapshot => {
    inquiries = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
    renderTable();
    updateStats();
    populateInquirySelector();
  }, handleFirestoreError));

  dataUnsubscribers.push(db.collection('quotations').onSnapshot(snapshot => {
    quotations = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
    renderQuotationsTable();
  }, handleFirestoreError));

  dataUnsubscribers.push(db.collection('invoices').onSnapshot(snapshot => {
    invoices = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
    renderInvoicesTable();
  }, handleFirestoreError));
}

function handleFirestoreError(error) {
  console.error('Firestore request failed:', error);
  if (error?.code === 'permission-denied') {
    alert('Firestore denied this action. Check the published Firestore rules and ensure you are signed in with the required staff role.');
  }
}

function requireStaff() {
  if (!currentUser || !auth?.currentUser) {
    alert('Please sign in with an authorized staff account first.');
    return false;
  }
  return true;
}

// Login is now exclusively Firebase Authentication. No fallback passwords or
// password comparisons against Firestore are used.
async function handleLogin(event) {
  event.preventDefault();
  if (!auth) {
    alert('Authentication is not ready yet. Refresh the page and try again.');
    return;
  }

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const submitButton = document.querySelector('#loginForm button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    await auth.signInWithEmailAndPassword(email, password);
    // onAuthStateChanged verifies the user's role and opens the dashboard.
  } catch (error) {
    console.error('Sign-in failed:', error);
    alert(error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password'
      ? 'Email or password is incorrect.'
      : 'Sign-in failed. Check your email, password, and Firebase Authentication settings.');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function handleLogout() {
  try {
    if (auth) await auth.signOut();
  } catch (error) {
    console.error('Sign-out failed:', error);
  }
  clearDataListeners();
  currentUser = null;
  document.getElementById('loginForm')?.reset();
  hideDashboard();
}

function openClientForm() {
  document.getElementById('clientModal')?.classList.remove('hidden');
  document.getElementById('publicInquiryForm')?.classList.remove('hidden');
  document.getElementById('clientSuccessMsg')?.classList.add('hidden');
}

function closeClientForm() {
  document.getElementById('clientModal')?.classList.add('hidden');
}

async function submitClientInquiry(event) {
  event.preventDefault();
  if (!db) {
    alert('The inquiry service is not ready. Please try again later.');
    return;
  }

  const payload = {
    id: Date.now(),
    name: document.getElementById('publicName').value.trim(),
    phone: document.getElementById('publicPhone').value.trim(),
    source: 'Client Portal Web',
    details: document.getElementById('publicDetails').value.trim(),
    followUp: new Date().toISOString().slice(0, 10),
    status: 'New'
  };

  try {
    await db.collection('inquiries').add(payload);
    document.getElementById('publicInquiryForm').reset();
    document.getElementById('publicInquiryForm').classList.add('hidden');
    document.getElementById('clientSuccessMsg').classList.remove('hidden');
  } catch (error) {
    console.error('Public inquiry submission failed:', error);
    alert('Your inquiry could not be submitted. Please try again later.');
  }
}

async function saveInquiry(event) {
  event.preventDefault();
  if (!requireStaff()) return;

  const inquiry = {
    id: Date.now(),
    name: document.getElementById('custName').value.trim(),
    phone: document.getElementById('custPhone').value.trim(),
    source: document.getElementById('custSource').value,
    details: document.getElementById('custDetails').value.trim(),
    followUp: document.getElementById('custFollowUp').value,
    status: 'New'
  };

  try {
    await db.collection('inquiries').add(inquiry);
    document.getElementById('inquiryForm').reset();
    document.getElementById('custFollowUp').value = new Date().toISOString().slice(0, 10);
  } catch (error) {
    handleFirestoreError(error);
    alert('Could not save the inquiry. Please try again.');
  }
}

function renderTable() {
  const tbody = document.getElementById('inquiryTableBody');
  if (!tbody) return;
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
  tbody.replaceChildren();

  inquiries.filter(item => [item.name, item.phone, item.details, item.source]
    .some(value => String(value || '').toLowerCase().includes(search)))
    .forEach(item => {
      const row = document.createElement('tr');
      row.className = 'border-b border-slate-700/50 hover:bg-slate-700/30';
      const overdue = item.followUp && new Date(`${item.followUp}T00:00:00`) < new Date(new Date().toDateString());
      row.innerHTML = `
        <td class="p-3 font-semibold text-white">${escapeHtml(item.name)}<br><span class="text-xs font-normal text-slate-400">${escapeHtml(item.phone)}</span></td>
        <td class="p-3"><span class="px-2 py-1 bg-slate-700 rounded text-xs">${escapeHtml(item.source)}</span></td>
        <td class="p-3 max-w-xs truncate">${escapeHtml(item.details)}</td>
        <td class="p-3"><span class="text-xs font-mono ${overdue ? 'text-rose-400 font-bold' : 'text-slate-300'}">${escapeHtml(item.followUp)}</span></td>
        <td class="p-3"><select onchange="updateStatus('${escapeHtml(item.docId)}', this.value)" class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200">
          ${['New', 'Quote Sent', 'Followed Up', 'Won', 'Lost'].map(status => `<option value="${status}" ${item.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select></td>
        <td class="p-3 text-right"><button onclick="deleteInquiry('${escapeHtml(item.docId)}')" class="text-rose-400 hover:text-rose-300 text-xs">Delete</button></td>`;
      tbody.appendChild(row);
    });
}

async function updateStatus(docId, newStatus) {
  if (!requireStaff()) return;
  try { await db.collection('inquiries').doc(docId).update({ status: newStatus }); }
  catch (error) { handleFirestoreError(error); }
}

async function deleteInquiry(docId) {
  if (!requireStaff() || !confirm('Delete this inquiry? This cannot be undone.')) return;
  try { await db.collection('inquiries').doc(docId).delete(); }
  catch (error) { handleFirestoreError(error); }
}

function updateStats() {
  const total = document.getElementById('statTotal');
  if (!total) return;
  total.textContent = inquiries.length;
  document.getElementById('statPending').textContent = inquiries.filter(i => i.status === 'New' || i.status === 'Followed Up').length;
  document.getElementById('statQuotes').textContent = inquiries.filter(i => i.status === 'Quote Sent').length;
  document.getElementById('statWon').textContent = inquiries.filter(i => i.status === 'Won').length;
}

function switchAppTab(tabId) {
  document.querySelectorAll('.app-tab-page').forEach(page => page.classList.add('hidden'));
  document.querySelectorAll('.nav-tab-btn').forEach(button => button.classList.remove('active-tab'));
  document.getElementById(tabId)?.classList.remove('hidden');
  document.getElementById(`tabBtn-${tabId}`)?.classList.add('active-tab');

  const body = document.getElementById('quoteLineItemsBody');
  if (tabId === 'quotationsTab' && body && body.children.length === 0) {
    addQuoteRow('Mild Steel RHS Tubing (Custom Size)', '6m Length', 45);
    addQuoteRow('Structural MIG/TIG Welding Labor', 'Hours', 25);
  }
}

function generateQuoteRef() {
  const input = document.getElementById('quoteRef');
  if (input) input.value = 'PGI-QT-' + Math.floor(1000 + Math.random() * 9000);
}

function populateInquirySelector() {
  const select = document.getElementById('quoteInquirySelector');
  if (!select) return;
  const selected = select.value;
  select.replaceChildren(new Option('-- Select Registered Client --', ''));
  inquiries.forEach(item => {
    const option = new Option(`${item.name || ''} (${item.phone || ''}) - ${item.details || ''}`, item.docId);
    select.add(option);
  });
  if (inquiries.some(item => item.docId === selected)) select.value = selected;
}

function toggleClientTypeMode() {
  const mode = document.querySelector('input[name="clientType"]:checked')?.value || 'existing';
  const existing = document.getElementById('existingClientContainer');
  const newName = document.getElementById('newClientNameContainer');
  const phone = document.getElementById('quoteClientPhone');
  const selector = document.getElementById('quoteInquirySelector');
  const nameInput = document.getElementById('quoteClientName');
  if (mode === 'existing') {
    existing?.classList.remove('hidden');
    newName?.classList.add('hidden');
    if (nameInput) nameInput.required = false;
    if (phone) phone.readOnly = true;
  } else {
    existing?.classList.add('hidden');
    newName?.classList.remove('hidden');
    if (selector) selector.value = '';
    if (nameInput) nameInput.required = true;
    if (phone) { phone.readOnly = false; phone.value = ''; }
  }
}

function autoFillFromInquiry() {
  const selected = inquiries.find(item => item.docId === document.getElementById('quoteInquirySelector')?.value);
  if (!selected) return;
  document.getElementById('quoteClientPhone').value = selected.phone || '';
  document.getElementById('quoteSubject').value = selected.details || '';
}

function handlePaymentTermsPreset() {
  const preset = document.getElementById('quoteTermsPreset')?.value;
  const output = document.getElementById('paymentTermsText');
  if (!output) return;
  const terms = {
    deposit_20: '20% deposit; remaining 80% payable on completion.',
    deposit_30: '30% deposit; remaining 70% payable on completion.',
    deposit_40: '40% deposit; remaining 60% payable on completion.',
    deposit_50: '50% deposit; remaining 50% payable on completion.',
    deposit_60: '60% deposit; remaining 40% payable on completion.',
    deposit_75: '75% deposit; remaining 25% payable on completion.',
    payment_delivery: 'Full payment due on delivery or completion.',
    credit_7: 'Payment due within 7 days of invoice date.',
    credit_14: 'Payment due within 14 days of invoice date.',
    credit_30: 'Payment due within 30 days of invoice date.',
    credit_45: 'Payment due within 45 days of invoice date.',
    credit_60: 'Payment due within 60 days of invoice date.',
    custom: ''
  };
  output.value = terms[preset] ?? '';
}

function addQuoteRow(description = '', unit = 'Item', price = 0, qty = 1) {
  const body = document.getElementById('quoteLineItemsBody');
  if (!body) return;
  const row = document.createElement('tr');
  row.id = `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  row.className = 'hover:bg-slate-800/40';
  row.innerHTML = `
    <td class="p-2"><input type="text" value="${escapeHtml(description)}" placeholder="Enter product description" class="row-desc w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"></td>
    <td class="p-2"><input type="text" value="${escapeHtml(unit)}" placeholder="Unit" class="row-unit w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"></td>
    <td class="p-2"><input type="number" value="${Number(qty) || 1}" min="1" oninput="calculateQuoteTotals()" class="row-qty w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-center text-slate-200"></td>
    <td class="p-2"><input type="number" value="${Number(price) || 0}" step="0.01" min="0" oninput="calculateQuoteTotals()" class="row-price w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-right text-slate-200"></td>
    <td class="p-2 text-right font-mono font-bold text-slate-200 row-total">$0.00</td>
    <td class="p-2 text-center"><button type="button" onclick="removeQuoteRow('${row.id}')" class="text-rose-400 hover:text-rose-300 font-bold">&times;</button></td>`;
  body.appendChild(row);
  calculateQuoteTotals();
}

function removeQuoteRow(rowId) {
  document.getElementById(rowId)?.remove();
  calculateQuoteTotals();
}

function calculateQuoteTotals() {
  let subtotal = 0;
  document.querySelectorAll('#quoteLineItemsBody tr').forEach(row => {
    const qty = Math.max(0, Number(row.querySelector('.row-qty')?.value) || 0);
    const price = Math.max(0, Number(row.querySelector('.row-price')?.value) || 0);
    const total = qty * price;
    row.querySelector('.row-total').textContent = `$${total.toFixed(2)}`;
    subtotal += total;
  });
  const vat = subtotal * 0.15;
  document.getElementById('quoteSubtotal').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('quoteVat').textContent = `$${vat.toFixed(2)}`;
  document.getElementById('quoteGrandTotal').textContent = `$${(subtotal + vat).toFixed(2)}`;
}

async function handleSaveQuote(event) {
  event.preventDefault();
  if (!requireStaff()) return;
  const mode = document.querySelector('input[name="clientType"]:checked')?.value || 'existing';
  let clientName = '';
  const clientPhone = document.getElementById('quoteClientPhone').value.trim();
  const subject = document.getElementById('quoteSubject').value.trim();
  const paymentTerms = document.getElementById('paymentTermsText').value.trim();

  if (!paymentTerms) { alert('Enter the payment terms for this quotation.'); return; }
  if (!clientPhone || !subject) { alert('Enter the client phone and quotation subject.'); return; }

  if (mode === 'existing') {
    const selected = inquiries.find(item => item.docId === document.getElementById('quoteInquirySelector').value);
    if (!selected) { alert('Please select a client from the inquiry list.'); return; }
    clientName = selected.name || '';
  } else {
    clientName = document.getElementById('quoteClientName').value.trim();
    if (!clientName) { alert('Please enter the name of the new client.'); return; }
  }

  const items = Array.from(document.querySelectorAll('#quoteLineItemsBody tr')).map(row => ({
    desc: row.querySelector('.row-desc').value.trim() || 'Custom Metal Fabrication Work',
    unit: row.querySelector('.row-unit').value.trim() || 'Item',
    qty: Math.max(1, Number(row.querySelector('.row-qty').value) || 1),
    price: Math.max(0, Number(row.querySelector('.row-price').value) || 0)
  }));
  if (!items.length) { alert('Add at least one quotation line item.'); return; }

  const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const vat = subtotal * 0.15;
  const quote = {
    ref: document.getElementById('quoteRef').value,
    clientName,
    clientPhone,
    subject,
    date: document.getElementById('quoteDate').value,
    paymentTerms,
    items,
    subtotal,
    vat,
    grandTotal: subtotal + vat,
    status: 'Sent'
  };

  try {
    if (mode === 'new') {
      await db.collection('inquiries').add({
        id: Date.now(), name: clientName, phone: clientPhone,
        source: 'Quotation Direct Entry', details: subject,
        followUp: new Date().toISOString().slice(0, 10), status: 'Quote Sent'
      });
    }
    await db.collection('quotations').add(quote);
    alert(`Quotation ${quote.ref} saved successfully.`);
    document.getElementById('quoteForm').reset();
    document.getElementById('quoteLineItemsBody').replaceChildren();
    generateQuoteRef();
    document.getElementById('quoteDate').value = new Date().toISOString().slice(0, 10);
    initializeDefaultAppState();
    const existingRadio = document.querySelector('input[name="clientType"][value="existing"]');
    if (existingRadio) existingRadio.checked = true;
    toggleClientTypeMode();
    calculateQuoteTotals();
  } catch (error) {
    handleFirestoreError(error);
    alert('Could not save the quotation. Please check the connection and Firestore rules.');
  }
}

function renderQuotationsTable() {
  const body = document.getElementById('quotationsTableBody');
  if (!body) return;
  body.replaceChildren();
  quotations.forEach(quote => {
    const row = document.createElement('tr');
    row.className = 'border-b border-slate-700/50 hover:bg-slate-700/30';
    row.innerHTML = `
      <td class="p-3 font-mono font-bold text-rose-400">${escapeHtml(quote.ref)}</td>
      <td class="p-3 font-semibold text-white">${escapeHtml(quote.clientName)}<br><span class="text-xs font-normal text-slate-400">${escapeHtml(quote.clientPhone)}</span></td>
      <td class="p-3 text-xs max-w-xs truncate">${escapeHtml(quote.subject)}</td>
      <td class="p-3 font-bold text-emerald-400">$${money(quote.grandTotal)}</td>
      <td class="p-3"><span class="px-2 py-1 rounded text-xs font-semibold">${escapeHtml(quote.status)}</span></td>
      <td class="p-3 text-right space-x-2">
        <button onclick="previewDocument('quote', '${escapeHtml(quote.docId)}')" class="px-2.5 py-1 bg-slate-700 text-white rounded text-xs font-semibold">Preview / Print</button>
        ${quote.status !== 'Confirmed Order' ? `<button onclick="confirmOrderFromQuote('${escapeHtml(quote.docId)}')" class="px-2.5 py-1 bg-emerald-700 text-white rounded text-xs font-semibold">Confirm Order</button>` : ''}
      </td>`;
    body.appendChild(row);
  });
}

async function confirmOrderFromQuote(quoteDocId) {
  if (!requireStaff()) return;
  const quote = quotations.find(item => item.docId === quoteDocId);
  if (!quote) return;
  if (!confirm(`Confirm order ${quote.ref} and create its invoice?`)) return;

  try {
    const existingInvoice = invoices.some(invoice => invoice.quoteRef === quote.ref);
    await db.collection('quotations').doc(quoteDocId).update({ status: 'Confirmed Order' });
    const matchingInquiry = inquiries.find(item => item.phone === quote.clientPhone);
    if (matchingInquiry) await db.collection('inquiries').doc(matchingInquiry.docId).update({ status: 'Won' });
    if (!existingInvoice) {
      await db.collection('invoices').add({
        invoiceNo: 'INV-' + String(quote.ref).replace('PGI-QT-', ''),
        quoteRef: quote.ref,
        clientName: quote.clientName,
        clientPhone: quote.clientPhone,
        subject: quote.subject,
        paymentTerms: quote.paymentTerms || '',
        items: quote.items || [],
        subtotal: Number(quote.subtotal) || 0,
        vat: Number(quote.vat) || 0,
        grandTotal: Number(quote.grandTotal) || 0,
        paymentStatus: 'Unpaid',
        date: new Date().toISOString().slice(0, 10)
      });
    }
    alert('Order confirmed and invoice created.');
    switchAppTab('invoicesTab');
  } catch (error) {
    handleFirestoreError(error);
    alert('Could not confirm the order.');
  }
}

function renderInvoicesTable() {
  const body = document.getElementById('invoicesTableBody');
  if (!body) return;
  body.replaceChildren();
  invoices.forEach(invoice => {
    const row = document.createElement('tr');
    row.className = 'border-b border-slate-700/50 hover:bg-slate-700/30';
    row.innerHTML = `
      <td class="p-3 font-mono font-bold text-rose-400">${escapeHtml(invoice.invoiceNo)}</td>
      <td class="p-3 font-semibold text-white">${escapeHtml(invoice.clientName)}<br><span class="text-xs font-normal text-slate-400">${escapeHtml(invoice.clientPhone)}</span></td>
      <td class="p-3 font-bold text-emerald-400">$${money(invoice.grandTotal)}</td>
      <td class="p-3"><select onchange="updateInvoicePaymentStatus('${escapeHtml(invoice.docId)}', this.value)" class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
        ${['Unpaid', '50% Deposit Paid', 'Fully Paid'].map(status => `<option value="${status}" ${invoice.paymentStatus === status ? 'selected' : ''}>${status}</option>`).join('')}
      </select></td>
      <td class="p-3 text-right"><button onclick="previewDocument('invoice', '${escapeHtml(invoice.docId)}')" class="px-2.5 py-1 bg-slate-700 text-white rounded text-xs font-semibold">Preview / Print</button></td>`;
    body.appendChild(row);
  });
}

async function updateInvoicePaymentStatus(docId, newStatus) {
  if (!requireStaff()) return;
  if (!['Unpaid', '50% Deposit Paid', 'Fully Paid'].includes(newStatus)) return;
  try { await db.collection('invoices').doc(docId).update({ paymentStatus: newStatus }); }
  catch (error) { handleFirestoreError(error); }
}

function previewDocument(type, docId) {
  const data = type === 'quote'
    ? quotations.find(item => item.docId === docId)
    : invoices.find(item => item.docId === docId);
  if (!data) return;

  document.getElementById('docTypeLabel').textContent = type === 'quote' ? 'QUOTATION' : 'TAX INVOICE';
  document.getElementById('docNumberText').textContent = type === 'quote' ? data.ref : data.invoiceNo;
  document.getElementById('docClientName').textContent = data.clientName || '';
  document.getElementById('docClientPhone').textContent = data.clientPhone || '';
  document.getElementById('docSubjectText').textContent = data.subject || '';
  document.getElementById('docDateText').textContent = `Date: ${data.date || ''}`;
  document.getElementById('docPaymentTerms').textContent = data.paymentTerms || 'Payment terms to be agreed.';

  const body = document.getElementById('docItemsBody');
  body.replaceChildren();
  (data.items || []).forEach(item => {
    const row = document.createElement('tr');
    const values = [item.desc || '', item.unit || '', String(item.qty ?? 0), `$${money(item.price)}`, `$${money((Number(item.qty) || 0) * (Number(item.price) || 0))}`];
    values.forEach((value, index) => {
      const cell = document.createElement('td');
      cell.className = `p-2.5 ${index === 2 ? 'text-center' : ''} ${index >= 3 ? 'text-right' : ''}`;
      cell.textContent = value;
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
  document.getElementById('docSubtotal').textContent = `$${money(data.subtotal)}`;
  document.getElementById('docVat').textContent = `$${money(data.vat)}`;
  document.getElementById('docGrandTotal').textContent = `$${money(data.grandTotal)}`;
  document.getElementById('printDocModal').classList.remove('hidden');
}

function closePrintModal() { document.getElementById('printDocModal')?.classList.add('hidden'); }

function openAnalyticsModal() {
  if (!requireStaff()) return;
  document.getElementById('analyticsModal')?.classList.remove('hidden');
  renderGraphicalAnalytics();
}
function closeAnalyticsModal() { document.getElementById('analyticsModal')?.classList.add('hidden'); }

function renderGraphicalAnalytics() {
  const statusCounts = {
    New: inquiries.filter(i => i.status === 'New').length,
    'Quote Sent': inquiries.filter(i => i.status === 'Quote Sent').length,
    'Followed Up': inquiries.filter(i => i.status === 'Followed Up').length,
    Won: inquiries.filter(i => i.status === 'Won').length,
    Lost: inquiries.filter(i => i.status === 'Lost').length
  };
  const colors = { New: '#fbbf24', 'Quote Sent': '#818cf8', 'Followed Up': '#38bdf8', Won: '#34d399', Lost: '#f87171' };
  const max = Math.max(...Object.values(statusCounts), 1);
  let x = 15;
  let statusSvg = '<svg class="w-full h-full" viewBox="0 0 240 160">';
  Object.entries(statusCounts).forEach(([key, count]) => {
    const height = count / max * 100;
    statusSvg += `<rect x="${x}" y="${130 - height}" width="28" height="${height}" fill="${colors[key]}" rx="4"/><text x="${x + 14}" y="${125 - height}" font-size="9" fill="#fff" text-anchor="middle">${count}</text><text x="${x + 14}" y="148" font-size="8" fill="#94a3b8" text-anchor="middle">${key.split(' ')[0]}</text>`;
    x += 44;
  });
  document.getElementById('chartStatusContainer').innerHTML = statusSvg + '</svg>';

  const sources = {};
  inquiries.forEach(item => { const key = item.source || 'Other'; sources[key] = (sources[key] || 0) + 1; });
  const palette = ['#e11d48', '#0284c7', '#059669', '#d97706', '#7c3aed', '#475569'];
  let sourceSvg = '<svg class="w-full h-full" viewBox="0 0 200 160">';
  const entries = Object.entries(sources);
  let angle = 0;
  if (!entries.length) sourceSvg += '<text x="100" y="80" font-size="10" fill="#64748b" text-anchor="middle">No Lead Data Available</text>';
  entries.forEach(([label, count], index) => {
    const slice = count / inquiries.length * 360;
    const x1 = 100 + 50 * Math.cos(Math.PI * angle / 180);
    const y1 = 70 + 50 * Math.sin(Math.PI * angle / 180);
    const end = angle + slice;
    const x2 = 100 + 50 * Math.cos(Math.PI * end / 180);
    const y2 = 70 + 50 * Math.sin(Math.PI * end / 180);
    sourceSvg += `<path d="M100,70 L${x1},${y1} A50,50 0 ${slice > 180 ? 1 : 0},1 ${x2},${y2} Z" fill="${palette[index % palette.length]}"/>`;
    angle = end;
  });
  document.getElementById('chartSourceContainer').innerHTML = sourceSvg + '</svg>';

  const quoted = quotations.reduce((sum, item) => sum + (Number(item.grandTotal) || 0), 0);
  const billed = invoices.reduce((sum, item) => sum + (Number(item.grandTotal) || 0), 0);
  const maxRevenue = Math.max(quoted, billed, 1);
  const quoteHeight = quoted / maxRevenue * 100;
  const invoiceHeight = billed / maxRevenue * 100;
  document.getElementById('chartFinancialContainer').innerHTML = `<svg class="w-full h-full" viewBox="0 0 200 160"><rect x="40" y="${130 - quoteHeight}" width="40" height="${quoteHeight}" fill="#818cf8" rx="4"/><text x="60" y="${120 - quoteHeight}" font-size="9" fill="#fff" text-anchor="middle">$${quoted.toFixed(0)}</text><text x="60" y="148" font-size="9" fill="#94a3b8" text-anchor="middle">Quotes</text><rect x="120" y="${130 - invoiceHeight}" width="40" height="${invoiceHeight}" fill="#34d399" rx="4"/><text x="140" y="${120 - invoiceHeight}" font-size="9" fill="#fff" text-anchor="middle">$${billed.toFixed(0)}</text><text x="140" y="148" font-size="9" fill="#94a3b8" text-anchor="middle">Invoices</text></svg>`;
}

function openUserModal() {
  if (!currentUser || currentUser.role !== 'Admin') {
    alert('Only an administrator can access account instructions.');
    return;
  }
  disableLegacyUserManagementForm();
  document.getElementById('userModal')?.classList.remove('hidden');
}
function closeUserModal() { document.getElementById('userModal')?.classList.add('hidden'); }
function handleAddUser(event) {
  event.preventDefault();
  alert('Account creation in this browser has been disabled. Create accounts in Firebase Console → Authentication → Users, then assign a role in userRoles/{UID}.');
}
function updateUserRole() { alert('Change roles only through Firebase Console or a trusted backend.'); }
function updateUserPassword() { alert('Password changes must use Firebase Authentication, never a Firestore field.'); }
function toggleUserArchive() { alert('Account disabling must be performed through Firebase Authentication or a trusted backend.'); }
function renderUsers() { disableLegacyUserManagementForm(); }

function exportToCSV() {
  if (!requireStaff()) return;
  if (!inquiries.length) { alert('No inquiries to export.'); return; }
  const cells = [['Customer Name', 'Phone', 'Source', 'Details', 'Follow-up Date', 'Status'], ...inquiries.map(i => [i.name, i.phone, i.source, i.details, i.followUp, i.status])];
  const csv = cells.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'PACK_Ground_Inquiries.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
function money(value) { return (Number(value) || 0).toFixed(2); }
