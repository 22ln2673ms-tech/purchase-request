const firebaseConfig = window.firebaseConfig || null;
if (!firebaseConfig) {
  console.warn('Firebase config not loaded. Run `node generate-config.js` to generate firebase-config.js from .env.');
}

const userRoleMatrix = {
  'admin.pro1@gov.ph': {
    role: 'admin',
    office: 'PhilHealth Regional Office 1 (PRO 1)',
    header: 'assets/header.png',
    displayName: 'PRO 1 Global Admin'
  },
  'lhio.ilocossur@gov.ph': {
    role: 'user',
    office: 'LHIO Ilocos Sur',
    header: 'assets/Ilocos Sur Header.png',
    displayName: 'LHIO Ilocos Sur Staff'
  },
  'lhio.ilocosnorte@gov.ph': {
    role: 'user',
    office: 'LHIO Ilocos Norte',
    header: 'assets/Ilocos Norte header.png',
    displayName: 'LHIO Ilocos Norte Staff'
  },
  'lhio.launion@gov.ph': {
    role: 'user',
    office: 'LHIO La Union',
    header: 'assets/La Union.png',
    displayName: 'LHIO La Union Staff'
  },
  'lhio.westpang@gov.ph': {
    role: 'user',
    office: 'LHIO Western Pangasinan',
    header: 'assets/Western Pangasinan Header.png',
    displayName: 'LHIO Western Pangasinan Staff'
  },
  'lhio.eastpang@gov.ph': {
    role: 'user',
    office: 'LHIO Eastern Pangasinan',
    header: 'assets/Eastern Pangasinan Header.png',
    displayName: 'LHIO Eastern Pangasinan Staff'
  },
  'lhio.cenpang@gov.ph': {
    role: 'user',
    office: 'LHIO Central Pangasinan',
    header: 'assets/Central Pangasinan Header.png',
    displayName: 'LHIO Central Pangasinan Staff'
  }
};

const OFFICE_SELECT_VALUE_MAP = {
  'PhilHealth Regional Office': 'table1.html?area=PhilHealth%20Regional%20Office',
  'LHIO Ilocos Norte': 'table1.html?area=LHIO%20Ilocos%20Norte',
  'LHIO Ilocos Sur': 'table1.html?area=LHIO%20Ilocos%20Sur',
  'LHIO La Union': 'table1.html?area=LHIO%20La%20Union',
  'LHIO Eastern Pangasinan': 'table1.html?area=LHIO%20Eastern%20Pangasinan',
  'LHIO Western Pangasinan': 'table1.html?area=LHIO%20Western%20Pangasinan',
  'LHIO Central Pangasinan': 'table1.html?area=LHIO%20Central%20Pangasinan'
};

const officeHeaderImageMap = {
  'PhilHealth Regional Office': 'assets/header.png',
  'LHIO Ilocos Norte': 'assets/Ilocos Norte header.png',
  'LHIO Ilocos Sur': 'assets/Ilocos Sur Header.png',
  'LHIO La Union': 'assets/La Union.png',
  'LHIO Eastern Pangasinan': 'assets/Eastern Pangasinan Header.png',
  'LHIO Western Pangasinan': 'assets/Western Pangasinan Header.png',
  'LHIO Central Pangasinan': 'assets/Central Pangasinan Header.png'
};

let currentAuthUser = null;
let currentUserProfile = null;
let firebaseAuth = null;
let firestoreDb = null;
let purchaseRequestsUnsubscribe = null;
let userAccountsCache = [];
let userAccountsPage = 1;
let userAccountsSearch = '';
let pendingPasswordResetEmail = '';
let firestoreRecordsCache = [];
let firestoreRecordsLoaded = false;
let archiveRecordsCache = [];
let archiveRecordsLoaded = false;
let notificationsCache = [];
let notificationsLoaded = false;
const USER_ACCOUNTS_PER_PAGE = 15;

function initializeFirebaseAuth() {
  if (!window.firebase || !firebase.initializeApp || !firebase.auth) {
    console.warn('Firebase SDK not loaded. Firebase Auth is disabled.');
    showLoginOverlay();
    return;
  }

  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  firebaseAuth = firebase.auth();
  // initialize firestore correctly (fix typo)
  try {
    firestoreDb = firebase.firestore();
  } catch (e) {
    console.warn('Unable to initialize Firestore instance:', e);
    firestoreDb = null;
  }
  firebaseAuth.onAuthStateChanged(handleAuthStateChanged);
}

function getAuthInstance() {
  if (!firebaseAuth && window.firebase && firebase.auth) {
    firebaseAuth = firebase.auth();
  }
  return firebaseAuth;
}

function getFirestoreInstance() {
  if (!firestoreDb && window.firebase && firebase.firestore) {
    firestoreDb = firebase.firestore();
  }
  return firestoreDb;
}

// ==================== FIRESTORE OPERATIONS ====================

/**
 * Saves user profile to Firestore when user first signs in
 * This creates a permanent record of the user in the database
 */
async function getStoredUserProfile(user) {
  if (!user || !user.uid || !user.email) return null;
  const db = getFirestoreInstance();
  if (!db) return null;

  try {
    let doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) {
      const snapshot = await db.collection('users')
        .where('email', '==', user.email.toLowerCase())
        .limit(1)
        .get();
      if (!snapshot.empty) {
        doc = snapshot.docs[0];
      }
    }

    if (!doc || !doc.exists) return null;
    const data = doc.data() || {};
    const office = data.office || 'PhilHealth Regional Office 1 (PRO 1)';
    return {
      uid: user.uid,
      email: user.email,
      displayName: data.displayName || user.displayName || user.email,
      role: data.role || 'user',
      office: office,
      headerImage: data.headerImage || officeHeaderImageMap[office] || officeHeaderImageMap['PhilHealth Regional Office'] || 'assets/header.png'
    };
  } catch (error) {
    console.error('Error fetching stored user profile:', error);
    return null;
  }
}

async function saveUserProfileToFirestore(user) {
  if (!user || !user.email) return;
  
  const db = getFirestoreInstance();
  if (!db) return;

  try {
    let userProfile = await getStoredUserProfile(user);
    if (!userProfile) {
      userProfile = await resolveUserProfile(user);
    }
    if (!userProfile) return;

    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      email: user.email?.toLowerCase(),
      displayName: userProfile.displayName,
      role: userProfile.role,
      office: userProfile.office,
      headerImage: userProfile.headerImage,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
      isActive: true
    }, { merge: true });

    console.log('User profile saved to Firestore');
  } catch (error) {
    console.error('Error saving user profile:', error);
  }
}

/**
 * Saves a purchase request to Firestore
 */
async function savePurchaseRequestToFirestore(requestData) {
  if (!currentAuthUser) {
    console.error('No authenticated user');
    return null;
  }
  const db = getFirestoreInstance();
  if (!db) {
    console.error('Firestore not available');
    return null;
  }

  try {
    // sanitize requestData before sending to Firestore
    const clean = cleanForFirestore(requestData || {});
    const payload = {
      ...clean,
      createdBy: {
        uid: currentAuthUser.uid,
        email: currentAuthUser.email,
        name: currentUserProfile?.displayName,
        role: currentUserProfile?.role,
        office: currentUserProfile?.office
      },
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: clean.status || requestData.status || requestData.approvalStatus || 'pending'
    };

    const docRef = await db.collection('purchaseRequests').add(payload);
    payload.id = docRef.id;

    if (currentUserProfile?.role !== 'admin') {
      await notifyAdminsOfNewPurchaseRequest(payload);
    }

    console.log('Purchase request saved:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error saving purchase request:', error);
    alert('Failed to save purchase request: ' + error.message);
    return null;
  }
}

function formatNotificationTimestamp(timestamp) {
  if (!timestamp) return '';
  try {
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch (error) {
    return '';
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function createNotification(notification) {
  const db = getFirestoreInstance();
  if (!db) return null;

  try {
    const payload = {
      recipientUid: notification.recipientUid || null,
      recipientEmail: notification.recipientEmail ? String(notification.recipientEmail).toLowerCase() : null,
      senderUid: notification.senderUid || null,
      senderName: notification.senderName || '',
      title: notification.title || '',
      message: notification.message || '',
      type: notification.type || 'general',
      relatedRecordId: notification.relatedRecordId || null,
      relatedPrNumber: notification.relatedPrNumber || null,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await db.collection('notifications').add(payload);
    return docRef.id;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

async function getAdminUsers() {
  const db = getFirestoreInstance();
  if (!db) return [];

  try {
    const snapshot = await db.collection('users').where('role', '==', 'admin').get();
    if (!snapshot.empty) {
      return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    }
  } catch (error) {
    console.warn('Unable to load admin users for notifications:', error);
  }

  return Object.entries(userRoleMatrix)
    .filter(([, meta]) => meta.role === 'admin')
    .map(([email, meta]) => ({ uid: null, email, displayName: meta.displayName }));
}

async function notifyAdminsOfNewPurchaseRequest(record) {
  if (!record || !currentAuthUser) return;
  const admins = await getAdminUsers();
  if (!admins.length) return;

  const title = 'New purchase request submitted';
  const message = `${currentUserProfile?.displayName || currentAuthUser.email} submitted a new purchase request${record.prNumber ? ` (${record.prNumber})` : ''}.`;

  await Promise.all(admins.map(admin => createNotification({
    recipientUid: admin.uid,
    recipientEmail: admin.email,
    senderUid: currentAuthUser.uid,
    senderName: currentUserProfile?.displayName || currentAuthUser.email,
    title,
    message,
    type: 'record_created',
    relatedRecordId: record.id,
    relatedPrNumber: record.prNumber
  })));
}

async function notifyUserOfRequestDecision(record, action) {
  if (!record || !record.createdBy) return;

  const recipientUid = record.createdBy.uid || null;
  const recipientEmail = record.createdBy.email ? String(record.createdBy.email).toLowerCase() : null;
  if (!recipientUid && !recipientEmail) return;

  const currentUserEmail = currentAuthUser?.email ? String(currentAuthUser.email).toLowerCase() : null;
  if (currentUserProfile?.uid && recipientUid === currentUserProfile.uid) return;
  if (currentUserEmail && recipientEmail === currentUserEmail) return;

  const actionLabel = action === 'approved' ? 'approved' : 'rejected';
  const title = `Your purchase request was ${actionLabel}`;
  const message = `${currentUserProfile?.displayName || 'Admin'} ${actionLabel} your purchase request${record.prNumber ? ` (${record.prNumber})` : ''}.`;

  await createNotification({
    recipientUid,
    recipientEmail,
    senderUid: currentAuthUser?.uid || null,
    senderName: currentUserProfile?.displayName || currentAuthUser?.email || 'Admin',
    title,
    message,
    type: 'record_status_changed',
    relatedRecordId: record.id,
    relatedPrNumber: record.prNumber
  });
}

async function loadNotifications() {
  const db = getFirestoreInstance();
  if (!db || !currentUserProfile) {
    notificationsCache = [];
    notificationsLoaded = true;
    renderNotifications([]);
    updateNotificationBadge();
    return;
  }

  try {
    const queries = [];
    if (currentUserProfile.uid) {
      queries.push(db.collection('notifications').where('recipientUid', '==', currentUserProfile.uid).limit(100));
    }
    if (currentUserProfile.email) {
      queries.push(db.collection('notifications').where('recipientEmail', '==', String(currentUserProfile.email).toLowerCase()).limit(100));
    }

    const notifications = [];
    for (const query of queries) {
      const snapshot = await query.get();
      snapshot.forEach(doc => notifications.push({ id: doc.id, ...doc.data() }));
    }

    const uniqueNotifications = [];
    const seen = new Set();
    notifications.forEach(notification => {
      if (!seen.has(notification.id)) {
        seen.add(notification.id);
        uniqueNotifications.push(notification);
      }
    });

    notificationsCache = uniqueNotifications.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime();
      const bTime = b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
    notificationsLoaded = true;
    renderNotifications(notificationsCache);
    updateNotificationBadge();
  } catch (error) {
    console.error('Error loading notifications:', error);
    notificationsCache = [];
    renderNotifications([]);
    updateNotificationBadge();
  }
}

function renderNotifications(notifications) {
  const list = document.getElementById('notificationsList');
  if (!list) return;

  if (!Array.isArray(notifications) || notifications.length === 0) {
    list.innerHTML = '<div class="empty-state">No notifications yet.</div>';
    return;
  }

  list.innerHTML = notifications.map(notification => {
    const statusLabel = notification.isRead ? 'Read' : 'Unread';
    return `
      <div class="notification-card ${notification.isRead ? 'read' : 'unread'}">
        <div class="notification-card-top">
          <div>
            <div class="notification-title">${escapeHtml(notification.title)}</div>
            <div class="notification-message">${escapeHtml(notification.message)}</div>
          </div>
          <button type="button" class="button button--secondary notification-action-btn" onclick="markNotificationAsRead('${notification.id}')">${notification.isRead ? 'Read' : 'Mark read'}</button>
        </div>
        <div class="notification-meta">
          <span>${escapeHtml(statusLabel)}</span>
          <span>${escapeHtml(formatNotificationTimestamp(notification.createdAt))}</span>
        </div>
      </div>
    `;
  }).join('');
}

function updateNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  const notificationLink = document.querySelector('.sidebar-link[href="#notifications"]');
  if (!badge) return;
  const unreadCount = notificationsCache.filter(notification => !notification.isRead).length;
  if (notificationLink) {
    if (unreadCount > 0) {
      notificationLink.classList.add('has-unread');
    } else {
      notificationLink.classList.remove('has-unread');
    }
  }
  if (unreadCount > 0) {
    badge.textContent = String(unreadCount);
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

async function markNotificationAsRead(notificationId) {
  if (!notificationId || !getFirestoreInstance()) return;
  const db = getFirestoreInstance();

  try {
    await db.collection('notifications').doc(notificationId).update({
      isRead: true,
      readAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }

  await loadNotifications();
}

async function markAllNotificationsRead() {
  if (!getFirestoreInstance() || !notificationsCache.length) return;
  const db = getFirestoreInstance();

  try {
    const batch = db.batch();
    notificationsCache.forEach(notification => {
      if (!notification.isRead) {
        const ref = db.collection('notifications').doc(notification.id);
        batch.update(ref, { isRead: true, readAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
    });
    await batch.commit();
  } catch (error) {
    console.error('Error marking all notifications read:', error);
  }

  await loadNotifications();
}

async function deleteAllNotifications() {
  if (!getFirestoreInstance() || !notificationsCache.length) return;
  if (!confirm('⚠️ Delete all notifications?\n\nThis will permanently remove all notifications visible to you and cannot be undone.')) return;

  const db = getFirestoreInstance();

  try {
    const batch = db.batch();
    notificationsCache.forEach(notification => {
      if (notification.id) {
        const ref = db.collection('notifications').doc(notification.id);
        batch.delete(ref);
      }
    });
    await batch.commit();
  } catch (error) {
    console.error('Error deleting all notifications:', error);
    alert('Failed to delete notifications. Check the console for details.');
  }

  await loadNotifications();
}

/**
 * Updates an existing purchase request in Firestore
 */
/**
 * Clean an object for Firestore by removing undefined values and
 * internal metadata keys (properties that start with __).
 */
function cleanForFirestore(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(v => cleanForFirestore(v));
  if (typeof obj !== 'object') return obj;

  const out = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (k && k.startsWith('__')) return; // skip internal metadata
    if (v === undefined) return; // skip undefined
    if (v === null) {
      out[k] = null;
      return;
    }
    if (Array.isArray(v)) {
      out[k] = v.map(item => cleanForFirestore(item));
      return;
    }
    if (typeof v === 'object') {
      out[k] = cleanForFirestore(v);
      return;
    }
    out[k] = v;
  });
  return out;
}

async function updatePurchaseRequestInFirestore(requestId, updates) {
  if (!currentAuthUser) {
    console.error('No authenticated user');
    return false;
  }

  const db = getFirestoreInstance();
  if (!db) return false;

  try {
    const clean = cleanForFirestore(updates || {});
    const payload = {
      ...clean,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: {
        uid: currentAuthUser.uid,
        email: currentAuthUser.email,
        name: currentUserProfile?.displayName
      }
    };

    const docRef = db.collection('purchaseRequests').doc(requestId);
      // Use set with merge to ensure we don't accidentally overwrite fields
      // when applying partial updates (safer than update in environments
      // where network/proxy may interfere with update operations).
      await docRef.set(payload, { merge: true });

    console.log('Purchase request updated:', requestId);
    return true;
  } catch (error) {
    console.error('Error updating purchase request:', error);
    alert('Failed to update purchase request: ' + error.message);
    return false;
  }
}

/**
 * Retrieves purchase requests based on user role
 * Admins see all, standard users see only their own office
 */
async function getPurchaseRequestsForUser() {
  const db = getFirestoreInstance();
  if (!db || !currentAuthUser) return [];

  try {
    // Build a simple query: filter by office for standard users but do not
    // apply server-side ordering to avoid requiring composite indexes.
    let query = db.collection('purchaseRequests');
    if (isStandardUser()) {
      query = query.where('createdBy.office', '==', currentUserProfile.office);
    }

    const snapshot = await query.get();
    const requests = [];
    snapshot.forEach(doc => {
      const record = { id: doc.id, ...doc.data() };
      if (isVisibleRecord(record)) requests.push(record);
    });

    // Order results client-side by `createdAt` (if present) so Firestore
    // doesn't require a composite index for where+orderBy.
    requests.sort((a, b) => {
      const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tb - ta;
    });

    return requests;
  } catch (error) {
    console.error('Error fetching purchase requests:', error);
    return [];
  }
}

/**
 * Start a realtime listener for purchaseRequests. Admins listen for all
 * requests; standard users listen for requests matching their office.
 * Updates `firestoreRecordsCache` and UI on changes.
 */
function startPurchaseRequestsListener() {
  const db = getFirestoreInstance();
  if (!db || !currentAuthUser) return;
  // Stop existing listener if any
  stopPurchaseRequestsListener();

  let query = db.collection('purchaseRequests');
  if (isStandardUser()) {
    query = query.where('createdBy.office', '==', currentUserProfile.office);
  }

  purchaseRequestsUnsubscribe = query.onSnapshot(snapshot => {
    const requests = [];
    snapshot.forEach(doc => {
      const record = { id: doc.id, ...doc.data() };
      if (isVisibleRecord(record)) requests.push(record);
    });

    // Merge server snapshot with localStorage records so local-only changes
    // (e.g., archived/deleted markers) are not clobbered by an older server
    // snapshot. Read local storage records and include them in the merge.
    let localRaw = [];
    try { localRaw = JSON.parse(localStorage.getItem('purchaseRequestDatabase') || '[]'); } catch (e) { localRaw = []; }
    const localRecords = Array.isArray(localRaw) ? localRaw.map(r => normalizeRecordStatus({
      ...r,
      prNumber: (r.prNumber ? String(r.prNumber).replace(/^AUTO-/, '') : r.prNumber)
    })) : [];

    // Combine local + server and dedupe preferring newest lastModified/timestamp
    const combined = [...localRecords, ...requests];
    // client-side sort by createdAt desc after dedupe
    const deduped = dedupeRecords(combined);
    deduped.sort((a, b) => {
      const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tb - ta;
    });
    firestoreRecordsCache = deduped.map(r => ({ ...r }));
    firestoreRecordsLoaded = true;
    setDatabaseRecords(firestoreRecordsCache);
    // refresh UI
    updateSummaryCards(getDatabaseRecords());
    renderRecordsTable(getDatabaseRecords());
  }, error => {
    console.error('Realtime listener error:', error);
  });
}

function stopPurchaseRequestsListener() {
  if (purchaseRequestsUnsubscribe) {
    try { purchaseRequestsUnsubscribe(); } catch (e) {}
    purchaseRequestsUnsubscribe = null;
  }
}

async function syncFirestoreRecords() {
  if (!currentAuthUser || !getFirestoreInstance()) {
    firestoreRecordsCache = [];
    firestoreRecordsLoaded = false;
    return;
  }

  try {
    const records = await getPurchaseRequestsForUser();
    firestoreRecordsCache = dedupeRecords(records).map(record => ({
      ...record,
      id: record.id || (record.prNumber ? String(record.prNumber) : generateRecordId())
    }));
    firestoreRecordsLoaded = true;
    setDatabaseRecords(firestoreRecordsCache);
  } catch (error) {
    console.error('Error syncing Firestore records:', error);
    firestoreRecordsCache = [];
    firestoreRecordsLoaded = false;
  }
}

/**
 * Retrieves a single purchase request by ID
 */
async function getPurchaseRequestById(requestId) {
  const db = getFirestoreInstance();
  if (!db) return null;

  try {
    const doc = await db.collection('purchaseRequests').doc(requestId).get();
    
    if (!doc.exists) {
      console.warn('Purchase request not found:', requestId);
      return null;
    }

    return {
      id: doc.id,
      ...doc.data()
    };
  } catch (error) {
    console.error('Error fetching purchase request:', error);
    return null;
  }
}

/**
 * Logs user actions for audit trail
 */
async function logAuditEvent(action, details) {
  const db = getFirestoreInstance();
  if (!db || !currentAuthUser) return;

  try {
    const cleanDetails = typeof details === 'object' && details !== null
      ? cleanForFirestore(details)
      : details;

    const payload = {
      action: action,
      details: cleanDetails,
      userId: currentAuthUser.uid,
      userEmail: currentAuthUser.email,
      userRole: currentUserProfile?.role,
      userOffice: currentUserProfile?.office,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    const docRef = db.collection('auditLog').doc();
    await docRef.set(payload);
  } catch (error) {
    if (error?.code === 'already-exists') {
      console.warn('Audit event already exists, skipping duplicate:', action, details);
      return;
    }
    console.error('Error logging audit event:', error);
  }
}

async function resolveUserProfile(user) {
  if (!user || !user.email) return null;

  const storedProfile = await getStoredUserProfile(user);
  if (storedProfile) {
    return storedProfile;
  }

  const email = user.email.toLowerCase();
  const profile = userRoleMatrix[email];
  if (!profile) return null;

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || profile.displayName || user.email,
    role: profile.role,
    office: profile.office,
    headerImage: profile.header || officeHeaderImageMap[profile.office] || 'assets/header.png'
  };
}

function isAdminUser() {
  return currentUserProfile?.role === 'admin';
}

function isStandardUser() {
  return currentUserProfile?.role === 'user';
}

function getAssignedOfficeValue() {
  return OFFICE_SELECT_VALUE_MAP[currentUserProfile?.office] || OFFICE_SELECT_VALUE_MAP['PhilHealth Regional Office'];
}

function getAssignedOfficeLabel() {
  return currentUserProfile?.office || 'PhilHealth Regional Office';
}

function getAssignedOfficeHeader() {
  return currentUserProfile?.headerImage || officeHeaderImageMap[getAssignedOfficeLabel()] || 'assets/header.png';
}

async function handleAuthStateChanged(user) {
  currentAuthUser = user;
  currentUserProfile = user ? await resolveUserProfile(user) : null;

  if (user && !currentUserProfile) {
    alert('Your account is not configured for this system. Please sign in with an approved office account.');
    const auth = getAuthInstance();
    auth?.signOut();
    return;
  }

  // Save user profile to Firestore when they successfully authenticate
  if (user && currentUserProfile) {
    await saveUserProfileToFirestore(user);
    await logAuditEvent('user_signin', { email: user.email });
    // Migrate any localStorage-only records to Firestore before syncing
    try {
      await migrateLocalRecordsToFirestore();
    } catch (e) {
      console.warn('Local-to-Firestore migration failed:', e);
    }
    // start realtime listener for purchaseRequests (admins see all, users see office)
    startPurchaseRequestsListener();
    await syncFirestoreRecords();
  } else {
    firestoreRecordsCache = [];
    firestoreRecordsLoaded = false;
  }
  
  await applyAuthState();
}

function signInWithFirebase() {
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');
  if (!emailInput || !passwordInput) return;
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    alert('Please enter both email and password.');
    return;
  }
  const auth = getAuthInstance();
  if (!auth) {
    alert('Firebase Auth is not available.');
    return;
  }
  auth.signInWithEmailAndPassword(email, password)
    .catch(error => {
      console.error('Firebase sign in error', error);
      alert('Sign in failed: ' + error.message);
    });
}

function signOutFirebase() {
  const auth = getAuthInstance();
  if (!auth) return;
  
  // Log the sign out event before signing out
  const email = currentAuthUser?.email;
  logAuditEvent('user_signout', { email: email });
  // stop realtime listeners
  stopPurchaseRequestsListener();
  
  auth.signOut().catch(error => {
    console.error('Sign out failed', error);
    alert('Sign out failed: ' + error.message);
  })
  .finally(() => {
    closeSignOutConfirm();
  });
}

function openSignOutConfirm() {
  const modal = document.getElementById('signOutConfirmModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeSignOutConfirm() {
  const modal = document.getElementById('signOutConfirmModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

function openPasswordResetConfirm(email) {
  const modal = document.getElementById('passwordResetConfirmModal');
  if (!modal) return;
  document.getElementById('resetConfirmEmail').textContent = `Are you sure you want to reset the password for ${email}? A reset email will be sent to this address.`;
  modal.classList.remove('hidden');
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closePasswordResetConfirm() {
  const modal = document.getElementById('passwordResetConfirmModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

function openPasswordResetSuccess() {
  const modal = document.getElementById('passwordResetSuccessModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closePasswordResetSuccess() {
  const modal = document.getElementById('passwordResetSuccessModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

function openAccountCreatedSuccess(email) {
  const modal = document.getElementById('accountCreatedModal');
  if (!modal) return;
  document.getElementById('accountCreatedEmail').textContent = `A new officer account has been created for ${email}. Login instructions have been sent to this email address.`;
  modal.classList.remove('hidden');
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeAccountCreatedSuccess() {
  const modal = document.getElementById('accountCreatedModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

function applyRBACRules() {
  const isAdmin = isAdminUser();
  const officeSelect = document.getElementById('selectArea');
  const saveReportBtn = document.getElementById('saveReportBtn');
  const printBtn = document.getElementById('printBtn');

  if (officeSelect) {
    if (isStandardUser()) {
      officeSelect.value = getAssignedOfficeValue();
      officeSelect.disabled = true;
    } else {
      officeSelect.disabled = false;
    }
  }

  if (saveReportBtn) {
    saveReportBtn.style.display = isAdmin ? '' : 'none';
  }
  if (printBtn) {
    printBtn.style.display = currentUserProfile ? '' : 'none';
  }

  document.querySelectorAll('.admin-only').forEach(el => {
    if (isAdmin) {
      el.classList.remove('hidden');
      try { el.style.display = ''; } catch (e) {}
    } else {
      el.classList.add('hidden');
      try { el.style.display = 'none'; } catch (e) {}
    }
  });

  setUserLockedOffice();
  updateRecordsFiltersForUser();
  applyDashboardAuthorization();
}

function initUserManagement() {
  if (!isAdminUser()) {
    return;
  }
  loadOfficerAccounts();
}

async function loadOfficerAccounts() {
  const db = getFirestoreInstance();
  const tbody = document.getElementById('userAccountsTableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="empty-state">
        <div class="empty-state-icon"></div>
        <p>Loading officer accounts...</p>
      </td>
    </tr>
  `;

  if (!db) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <div class="empty-state-icon"></div>
          <p>Firestore is not available.</p>
        </td>
      </tr>
    `;
    return;
  }
  userAccountsSearch = '';

  try {
    const snapshot = await db.collection('users').orderBy('displayName').get();
    const users = [];
    snapshot.forEach(doc => users.push({ uid: doc.id, ...doc.data() }));
    renderUserAccounts(users);
  } catch (error) {
    console.error('Failed to load officer accounts:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <div class="empty-state-icon"></div>
          <p>Unable to load accounts. Check your connection.</p>
        </td>
      </tr>
    `;
  }
}

function renderUserAccounts(users) {
  userAccountsCache = Array.isArray(users) ? users : [];
  userAccountsPage = 1;
  renderUserAccountsPage();
}

function getFilteredUserAccounts() {
  if (!userAccountsSearch) {
    return userAccountsCache;
  }

  const searchTerm = userAccountsSearch.toLowerCase();
  return userAccountsCache.filter(user => {
    const name = (user.displayName || '').toLowerCase();
    const email = (user.email || '').toLowerCase();
    return name.includes(searchTerm) || email.includes(searchTerm);
  });
}

function renderUserAccountsPage() {
  const tbody = document.getElementById('userAccountsTableBody');
  const pageInfo = document.getElementById('userPaginationInfo');
  const prevBtn = document.getElementById('userPrevPageBtn');
  const nextBtn = document.getElementById('userNextPageBtn');
  const countInfo = document.getElementById('userCountInfo');
  if (!tbody || !pageInfo || !prevBtn || !nextBtn || !countInfo) return;

  const filteredAccounts = getFilteredUserAccounts();
  const totalItems = filteredAccounts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / USER_ACCOUNTS_PER_PAGE));
  if (userAccountsPage > totalPages) userAccountsPage = totalPages;

  const startIdx = (userAccountsPage - 1) * USER_ACCOUNTS_PER_PAGE;
  const pageItems = filteredAccounts.slice(startIdx, startIdx + USER_ACCOUNTS_PER_PAGE);

  if (!pageItems.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <div class="empty-state-icon"></div>
          <p>No officer accounts found.</p>
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = pageItems.map(user => {
      const roleLabel = user.role || 'user';
      return `
        <tr>
          <td>${user.displayName || '-'}</td>
          <td>${user.email || '-'}</td>
          <td><span class="role-badge ${roleLabel}">${roleLabel}</span></td>
          <td>${user.office || '-'}</td>
          <td class="action-cell user-actions">
            <button class="button button--secondary" type="button" onclick="initiatePasswordReset('${user.email}')">Reset Password</button>
            <button class="button button--danger" type="button" onclick="deleteOfficerAccount('${user.uid || ''}')">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  countInfo.textContent = `${totalItems} officer${totalItems === 1 ? '' : 's'}`;
  pageInfo.textContent = `Page ${userAccountsPage} of ${totalPages}`;
  prevBtn.disabled = userAccountsPage <= 1;
  nextBtn.disabled = userAccountsPage >= totalPages;
}

function changeUserAccountsPage(direction) {
  const totalPages = Math.max(1, Math.ceil(getFilteredUserAccounts().length / USER_ACCOUNTS_PER_PAGE));
  userAccountsPage = Math.min(totalPages, Math.max(1, userAccountsPage + direction));
  renderUserAccountsPage();
}

function showUserManagementMessage(message, type = 'success') {
  const messageEl = document.getElementById('userManagementMessage');
  if (!messageEl) return;
  messageEl.textContent = message;
  messageEl.className = `user-message ${type}`;
  messageEl.classList.remove('hidden');
}

function clearUserManagementMessage() {
  const messageEl = document.getElementById('userManagementMessage');
  if (!messageEl) return;
  messageEl.textContent = '';
  messageEl.className = 'user-message hidden';
}

async function createOfficerAccount() {
  const name = document.getElementById('newUserName')?.value.trim();
  const email = document.getElementById('newUserEmail')?.value.trim();
  const normalizedEmail = email?.toLowerCase();
  const password = document.getElementById('newUserPassword')?.value || '';
  const role = document.getElementById('newUserRole')?.value || 'user';
  const office = document.getElementById('newUserOffice')?.value || 'PhilHealth Regional Office 1 (PRO 1)';

  clearUserManagementMessage();

  if (!name || !email || password.length < 6) {
    showUserManagementMessage('Please provide a valid name, email, and password with at least 6 characters.', 'error');
    return;
  }

  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password, returnSecureToken: true })
    });
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || 'Unable to create account');
    }

    const db = getFirestoreInstance();
    if (db) {
      await db.collection('users').doc(data.localId).set({
        uid: data.localId,
        email: normalizedEmail,
        displayName: name,
        role,
        office,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        isActive: true
      }, { merge: true });
    }

    document.getElementById('newUserName').value = '';
    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserPassword').value = '';
    document.getElementById('newUserRole').value = 'user';
    document.getElementById('newUserOffice').value = 'PhilHealth Regional Office 1 (PRO 1)';

    clearUserManagementMessage();
    openAccountCreatedSuccess(email);
    loadOfficerAccounts();
  } catch (error) {
    console.error('Create officer account error:', error);
    showUserManagementMessage(`Failed to create officer account: ${error.message}`, 'error');
  }
}

function initiatePasswordReset(email) {
  if (!email) return;
  openPasswordResetConfirm(email);
  pendingPasswordResetEmail = email;
}

async function confirmPasswordReset() {
  if (!pendingPasswordResetEmail) return;
  clearUserManagementMessage();
  try {
    const auth = getAuthInstance();
    if (!auth) {
      throw new Error('Firebase Auth is not available.');
    }
    await auth.sendPasswordResetEmail(pendingPasswordResetEmail);
    closePasswordResetConfirm();
    openPasswordResetSuccess();
    pendingPasswordResetEmail = '';
  } catch (error) {
    console.error('Password reset error:', error);
    closePasswordResetConfirm();
    showUserManagementMessage(`Unable to send reset email: ${error.message}`, 'error');
    pendingPasswordResetEmail = '';
  }
}

async function resetOfficerPassword(email) {
  if (!email) return;
  clearUserManagementMessage();
  try {
    const auth = getAuthInstance();
    if (!auth) {
      throw new Error('Firebase Auth is not available.');
    }
    await auth.sendPasswordResetEmail(email);
    showUserManagementMessage(`Password reset email sent to ${email}.`, 'success');
  } catch (error) {
    console.error('Password reset error:', error);
    showUserManagementMessage(`Unable to send reset email: ${error.message}`, 'error');
  }
}

async function deleteOfficerAccount(uid) {
  if (!uid) {
    showUserManagementMessage('Unable to delete this account.', 'error');
    return;
  }

  if (!confirm('Are you sure you want to delete this officer account? This will remove the user from the system.')) {
    return;
  }

  const db = getFirestoreInstance();
  if (!db) {
    showUserManagementMessage('Firestore is not available.', 'error');
    return;
  }

  try {
    await db.collection('users').doc(uid).delete();
    showUserManagementMessage('Officer account removed successfully.', 'success');
    loadOfficerAccounts();
  } catch (error) {
    console.error('Delete officer account error:', error);
    showUserManagementMessage(`Unable to delete officer account: ${error.message}`, 'error');
  }
}

function showLoginOverlay() {
  resetRequestForm();
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  document.getElementById('authOverlay')?.classList.remove('hidden');
  document.querySelectorAll('section.container, .sidebar .sidebar-nav, .sidebar-label, .sidebar-auth, .sidebar-brand').forEach(el => {
    if (el) el.classList.add('hidden');
  });
}

function hideLoginOverlay() {
  document.getElementById('authOverlay')?.classList.add('hidden');
  document.querySelectorAll('section.container, .sidebar .sidebar-nav, .sidebar-label, .sidebar-auth, .sidebar-brand').forEach(el => {
    if (el) el.classList.remove('hidden');
  });
}

function updateAuthUI() {
  const authUserName = document.getElementById('authUserName');
  const authUserEmail = document.getElementById('authUserEmail');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginBtn = document.getElementById('authSignInBtn');
  if (currentUserProfile) {
    if (authUserName) authUserName.textContent = `${currentUserProfile.displayName} (${currentUserProfile.office})`;
    if (authUserEmail) authUserEmail.textContent = currentUserProfile.email;
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (loginBtn) loginBtn.classList.add('hidden');
  } else {
    if (authUserName) authUserName.textContent = '';
    if (authUserEmail) authUserEmail.textContent = 'Please sign in';
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (loginBtn) loginBtn.classList.remove('hidden');
  }
}

async function applyAuthState() {
  updateAuthUI();
  if (!currentUserProfile) {
    showLoginOverlay();
    return;
  }
  hideLoginOverlay();
  applyRBACRules();
  updateHeaderImage();
  updateSectionDefaultsForLhio();
  updateRecordsTableSchema();
  await loadNotifications();
  routeApp(window.location.hash || '#new');
}

function isLhioUser() {
  return /^LHIO\s/.test(currentUserProfile?.office || '');
}

function isSelectedHeaderLhio() {
  const selectArea = document.getElementById('selectArea');
  if (!selectArea) return false;
  const selectedLabel = selectArea.options[selectArea.selectedIndex]?.text || '';
  return /^LHIO\s/i.test(selectedLabel.trim());
}

function updateSectionDefaultsForLhio() {
  if (!departmentSelect || !sectionSelect) return;
  if (isLhioUser() || isSelectedHeaderLhio()) {
    departmentSelect.value = 'FOD';
    departmentSelect.disabled = true;
    sectionSelect.innerHTML = '<option value=""></option>';
    sectionSelect.value = '';
    sectionSelect.disabled = true;
    return;
  }
  departmentSelect.disabled = false;
  updateSectionOptions();
}

function setUserLockedOffice() {
  const selectArea = document.getElementById('selectArea');
  if (!selectArea) return;
  if (isStandardUser()) {
    const lockedValue = getAssignedOfficeValue();
    selectArea.value = lockedValue;
    selectArea.disabled = true;
  } else {
    selectArea.disabled = false;
  }
}

function updateHeaderImage() {
  const headerImg = document.querySelector('.header-image-main');
  if (!headerImg) return;
  headerImg.src = getAssignedOfficeHeader();
}

function applyDashboardAuthorization() {
  const saveReportBtn = document.getElementById('saveReportBtn');
  if (saveReportBtn) {
    saveReportBtn.style.display = isAdminUser() ? '' : 'none';
  }
  const dashboardHeaders = document.querySelectorAll('#dashboardRecordsTable thead th');
  if (dashboardHeaders.length > 0) {
    const actionHeader = dashboardHeaders[dashboardHeaders.length - 1];
    if (actionHeader) actionHeader.style.display = isAdminUser() ? '' : 'none';
  }
}

function updateRecordsFiltersForUser() {
  const recordsBranchFilter = document.getElementById('recordsBranchFilter');
  if (!recordsBranchFilter) return;
  recordsBranchFilter.disabled = false;
}

const departmentSelect = document.getElementById('department');

const DEPARTMENT_LABELS = {
  ORVP: 'ORVP – Office of the Regional Vice President',
  HCDMD: 'Health Care Delivery Management Division',
  MSD: 'Management Services Division',
  FOD: 'Field Operations Division'
};

function resolveDepartmentLabel(value) {
  if (!value) return '';
  if (DEPARTMENT_LABELS[value]) return DEPARTMENT_LABELS[value];
  const codeEntry = Object.entries(DEPARTMENT_LABELS).find(([, label]) => label === value);
  return codeEntry ? codeEntry[1] : value;
}

function resolveDepartmentCode(value) {
  if (!value) return '';
  if (DEPARTMENT_LABELS[value]) return value;
  const entry = Object.entries(DEPARTMENT_LABELS).find(([, label]) => label === value);
  return entry ? entry[0] : value;
}

// Normalize PR number display: strip leading AUTO- prefix if present
function cleanPrNumber(pr) {
  if (!pr) return '';
  try {
    return String(pr).replace(/^AUTO-/, '');
  } catch (e) {
    return String(pr);
  }
}

function getRecordIdentifier(record) {
  if (!record || typeof record !== 'object') return '';
  if (record.prNumber) return String(cleanPrNumber(record.prNumber));
  if (record.id) return String(record.id);
  if (record.timestamp) return String(record.timestamp);
  return String(generateRecordId());
}

function dedupeRecords(records) {
  if (!Array.isArray(records)) return [];
  const recordMap = new Map();
  records.forEach(record => {
    const normalized = normalizeRecordStatus(record || {});
    const key = getRecordIdentifier(normalized);
    if (!key) return;
    const existing = recordMap.get(key);
    if (!existing) {
      recordMap.set(key, normalized);
      return;
    }
    // Use lastModified if available (tracks status/approval changes), otherwise use timestamp (creation time)
    const currentTs = new Date(normalized.lastModified || normalized.timestamp || 0).getTime();
    const existingTs = new Date(existing.lastModified || existing.timestamp || 0).getTime();
    if (currentTs >= existingTs) {
      // Merge existing and normalized so that partial updates (e.g. status
      // changes) do not wipe other fields. Normalized takes precedence.
      const merged = { ...existing, ...normalized };
      recordMap.set(key, merged);
    }
  });
  return Array.from(recordMap.values());
}

const sectionSelect = document.getElementById('section');
const prNumberInput = document.getElementById('prNumber');
const saiNumberInput = document.getElementById('saiNumber');
const prDateInput = document.getElementById('prDate');
const pricePerSqFtInput = document.getElementById('pricePerSqFt');
const grandTotalOutput = document.getElementById('grandTotal');
const itemsTableBody = document.getElementById('itemsTableBody');
const addItemBtn = document.getElementById('addItemBtn');

const sections = {
  ORVP: [
    { label: 'Leave as blank', value: '' },
    { label: 'Planning Unit', value: 'Planning Unit' },
    { label: 'Public Affairs Unit', value: 'Public Affairs Unit' },
    { label: 'Information Technology Management Section', value: 'Information Technology Management Section' },
    { label: 'Legal Service Unit', value: 'Legal Service Unit' }
  ],
  HCDMD: [
    { label: 'Leave as blank', value: '' },
    { label: 'Accreditation and Quality Assurance Section', value: 'Accreditation and Quality Assurance Section' },
    { label: 'Benefit Administration Section', value: 'Benefit Administration Section' },
    { label: 'P-CARES', value: 'P-CARES' }
  ],
  MSD: [
    { label: 'Leave as blank', value: '' },
    { label: 'Administrative Services Section', value: 'Administrative Services Section' },
    { label: 'General Services Unit', value: 'General Services Unit' },
    { label: 'Human Resource Unit', value: 'Human Resource Unit' },
    { label: 'Fund Management Section', value: 'Fund Management Section' },
    { label: 'Comptrollership Unit', value: 'Comptrollership Unit' },
    { label: 'Cash Management Unit', value: 'Cash Management Unit' }
  ],
  FOD: [
    { label: 'Leave as blank', value: '' },
    { label: 'Membership Section', value: 'Membership Section' },
    { label: 'Collection Section', value: 'Collection Section' },
    { label: 'LHIO Ilocos Norte', value: 'LHIO Ilocos Norte' },
    { label: 'LHIO Ilocos Sur', value: 'LHIO Ilocos Sur' },
    { label: 'LHIO La Union', value: 'LHIO La Union' },
    { label: 'LHIO Eastern Pangasinan', value: 'LHIO Eastern Pangasinan' },
    { label: 'LHIO Western Pangasinan', value: 'LHIO Western Pangasinan' },
    { label: 'LHIO Central Pangasinan', value: 'LHIO Central Pangasinan' },
    { label: 'PSO Candon City', value: 'PSO Candon City' },
    { label: 'PSO Agoo', value: 'PSO Agoo' },
    { label: 'PSO Mangatarem', value: 'PSO Mangatarem' },
    { label: 'PSO San Carlos City', value: 'PSO San Carlos City' }
  ]
};

function formatCurrency(value) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value);
}

// Convert various stored date strings (e.g. "MM/DD/YYYY", ISO) to long textual format: "May 05, 2026"
function parseDateString(dateStr) {
  if (!dateStr) return null;
  dateStr = String(dateStr).replace(/\s*\n\s*/g, ' ').trim();
  // If already looks like "Month dd, yyyy", parse directly.
  if (/^[A-Za-z]+\s+\d{1,2},\s*\d{4}$/.test(dateStr)) {
    const parsed = Date.parse(dateStr);
    return isNaN(parsed) ? null : new Date(parsed);
  }
  // Try MM/DD/YYYY
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = parseInt(m[1], 10) - 1;
    const dd = parseInt(m[2], 10);
    const yy = parseInt(m[3], 10);
    const d = new Date(yy, mm, dd);
    return isNaN(d.getTime()) ? null : d;
  }
  // Try ISO or other parseable formats
  const parsed = Date.parse(dateStr);
  return isNaN(parsed) ? null : new Date(parsed);
}

function formatDateToLong(dateStr) {
  if (!dateStr) return dateStr;
  const d = parseDateString(dateStr);
  if (!d) return String(dateStr).trim();
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function generateRecordId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getSectionInitials(section) {
  if (!section) return '';
  const words = String(section).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const normalizedLastWord = words[words.length - 1].toLowerCase();
  if (words.length === 2 && normalizedLastWord === 'unit') {
    return `${words[0][0].toUpperCase()}${words[1][0].toUpperCase()}`;
  }

  return words[0][0].toUpperCase();
}

function getRecordControlPrefix(officeLabel, departmentCode, section) {
  const normalizedOffice = String(officeLabel || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const deptInitial = String(departmentCode || '').trim()[0]?.toUpperCase() || '';
  const sectionInitials = getSectionInitials(section);
  const lhioOfficeCodes = {
    'LHIO ILOCOS NORTE': 'IN',
    'LHIO ILOCOS SUR': 'IS',
    'LHIO LA UNION': 'LU',
    'LHIO EASTERN PANGASINAN': 'EP',
    'LHIO WESTERN PANGASINAN': 'WP',
    'LHIO CENTRAL PANGASINAN': 'CP'
  };
  if (/^LHIO\s+/i.test(normalizedOffice)) {
    const locationCode = lhioOfficeCodes[normalizedOffice] || normalizedOffice.split(/\s+/).slice(1).map(word => word[0]?.toUpperCase()).join('').substring(0, 2);
    return `L${locationCode}${deptInitial}${sectionInitials}`;
  }

  if (/PHILHEALTH REGIONAL OFFICE/i.test(normalizedOffice) || /^PRO\s*1/i.test(normalizedOffice) || normalizedOffice === 'PRO1' || normalizedOffice === 'PRO') {
    return `PRO${deptInitial}${sectionInitials}`;
  }

  return `CTR${deptInitial}${sectionInitials}`;
}

function getAllRecordsForControlCount() {
  return [...getDatabaseRecords(), ...getArchiveRecords()];
}

function generateControlNumber(formData) {
  const areaLabel = formData.selectedAreaLabel || formData.selectedArea || currentUserProfile?.office || 'PhilHealth Regional Office';
  const prefix = getRecordControlPrefix(areaLabel, formData.departmentCode, formData.section);
  const allRecords = getAllRecordsForControlCount();
  const existingCount = allRecords.reduce((count, record) => {
    return count + (String(record.controlNumber || '').startsWith(prefix) ? 1 : 0);
  }, 0);
  return `${prefix}${String(existingCount + 1).padStart(2, '0')}`;
}

function formatRecordSize(record) {
  if (record.size) {
    const sizeText = String(record.size).trim();
    if (/^W\s*\d+/i.test(sizeText) || /^H\s*\d+/i.test(sizeText)) {
      return sizeText;
    }
    const match = sizeText.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*(\w+))?$/i);
    if (match) {
      return `W ${match[1]} x H ${match[2]} ${match[3] || ''}`.trim();
    }
    return sizeText;
  }
  if (record.items && record.items[0]) {
    return formatDimensionLabel(record.items[0].width, record.items[0].height, record.items[0].unitMeasure);
  }
  return '-';
}

function getInchesPerUnit(unit) {
  switch (unit) {
    case 'ft': return 12;
    case 'in': return 1;
    case 'cm': return 1 / 2.54;
    case 'm': return 1 / 0.0254;
    default: return 1;
  }
}

function toInches(value, unit) {
  const v = parseFloat(value) || 0;
  return v * getInchesPerUnit(unit);
}

function fromInches(value, unit) {
  switch (unit) {
    case 'ft': return value / 12;
    case 'in': return value;
    case 'cm': return value * 2.54;
    case 'm': return value * 0.0254;
    default: return value;
  }
}

function convertToSquareFeet(width, height, unit) {
  const w = parseFloat(width) || 0;
  const h = parseFloat(height) || 0;
  const widthInches = toInches(w, unit);
  const heightInches = toInches(h, unit);
  return (widthInches * heightInches) / 144;
}

function convertAreaToDimensions(areaSqFt, unit) {
  const areaInSquareInches = areaSqFt * 144;
  const sideInches = Math.sqrt(areaInSquareInches);
  return {
    width: fromInches(sideInches, unit),
    height: fromInches(sideInches, unit)
  };
}

function convertLinear(value, fromUnit, toUnit) {
  const inches = toInches(value, fromUnit);
  return fromInches(inches, toUnit);
}

function updateSectionOptions() {
  const dept = departmentSelect.value;
  sectionSelect.innerHTML = '';
  if (!dept || !sections[dept]) {
    sectionSelect.disabled = true;
    sectionSelect.innerHTML = '<option value="">Select section</option>';
    return;
  }
  sections[dept].forEach(item => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    sectionSelect.appendChild(option);
  });
  sectionSelect.disabled = false;
}

function updateItemCosts(row) {
  const widthInput = row.querySelector('.width-input');
  const heightInput = row.querySelector('.height-input');
  const unitSelect = row.querySelector('.unitMeasure-select');
  const pricePerSqFt = parseFloat(pricePerSqFtInput.value) || 0;
  const quantity = parseFloat(row.querySelector('.quantity-input').value) || 0;

  // Handle unit conversion - adjust width/height to maintain same area
  if (row.dataset.previousUnit && row.dataset.previousUnit !== unitSelect.value) {
    const currentWidth = parseFloat(widthInput.value) || 0;
    const currentHeight = parseFloat(heightInput.value) || 0;
    const previousUnit = row.dataset.previousUnit;
    const newUnit = unitSelect.value;

    // Convert linear dimensions from previous unit to new unit, preserving aspect ratio
    const newWidth = convertLinear(currentWidth, previousUnit, newUnit);
    const newHeight = convertLinear(currentHeight, previousUnit, newUnit);

    // Update the width and height inputs to the converted values without truncation
    widthInput.value = Math.max(0, newWidth).toFixed(4);
    heightInput.value = Math.max(0, newHeight).toFixed(4);
  }

  // Store current unit for next change detection
  row.dataset.previousUnit = unitSelect.value;

  const width = widthInput.value;
  const height = heightInput.value;
  const unit = unitSelect.value;

  const area = convertToSquareFeet(width, height, unit);
  const unitCost = area * pricePerSqFt;
  const totalCost = unitCost * quantity;

  row.querySelector('.unitCost-input').value = formatCurrency(unitCost);
  row.querySelector('.totalCost-input').value = formatCurrency(totalCost);
  updateGrandTotal();
}

function updateGrandTotal() {
  let grand = 0;
  const rows = itemsTableBody.querySelectorAll('.item-row');
  rows.forEach(row => {
    const totalCostText = row.querySelector('.totalCost-input').value;
    const totalCost = parseFloat(totalCostText.replace(/[₱,]/g, '')) || 0;
    grand += totalCost;
  });
  grandTotalOutput.textContent = formatCurrency(grand);
}

function attachItemEventListeners(row) {
  row.querySelector('.width-input').addEventListener('input', () => updateItemCosts(row));
  row.querySelector('.height-input').addEventListener('input', () => updateItemCosts(row));
  row.querySelector('.unitMeasure-select').addEventListener('change', () => updateItemCosts(row));
  row.querySelector('.quantity-input').addEventListener('input', () => updateItemCosts(row));
  const deleteBtn = row.querySelector('.delete-item-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => deleteItem(row));
  }
}

function deleteItem(row) {
  if (itemsTableBody.querySelectorAll('.item-row').length <= 1) {
    alert('You must have at least one item in the purchase request.');
    return;
  }
  if (confirm('Are you sure you want to delete this item?')) {
    row.remove();
    updateGrandTotal();
  }
}

function addNewItem() {
  const newRow = document.createElement('tr');
  newRow.className = 'item-row';
  newRow.innerHTML = `
    <td class="center">-</td>
    <td>
      <input type="text" class="unit-input" value="pc" />
    </td>
    <td colspan="2">
      <div class="details-row">
        <div>
          <label>Item Description</label>
          <input type="text" class="itemDescription" placeholder="Enter item description" />
        </div>
        <div>
          <label>Width</label>
          <input type="number" class="width-input" value="2" min="1" max="99" step="any" />
        </div>
        <div>
          <label>Height</label>
          <input type="number" class="height-input" value="2" min="1" max="99" step="any" />
        </div>
        <div>
          <label>Unit of Measure</label>
          <select class="unitMeasure-select">
            <option value="ft">Feet</option>
            <option value="in">Inches</option>
            <option value="cm">Centimeter</option>
            <option value="m">Meter</option>
          </select>
        </div>
      </div>
    </td>
    <td>
      <input type="number" class="quantity-input" value="1" min="1" step="1" />
    </td>
    <td>
      <input type="text" class="unitCost-input" readonly />
    </td>
    <td>
      <input type="text" class="totalCost-input" readonly />
    </td>
    <td class="center">
      <button type="button" class="delete-item-btn">Delete</button>
    </td>
  `;
  itemsTableBody.appendChild(newRow);
  attachItemEventListeners(newRow);
  updateItemCosts(newRow);
}

function setDate() {
  const now = new Date();
  const formatted = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  prDateInput.value = formatted;
}

function clearAllData() {
  if (confirm('⚠️ CLEAR ALL DATA?\n\nThis will delete ALL saved Purchase Requests from your browser.\n\nThis action CANNOT be undone!\n\nAre you sure?')) {
    localStorage.removeItem('purchaseRequestDatabase');
    sessionStorage.clear();
    alert('✓ All data has been cleared.\n\nThe page will refresh now.');
    window.location.reload();
  }
}

// Footer toggle function
function toggleFooter() {
  const footerContainer = document.getElementById('footerContainer');
  const addFooterBtn = document.getElementById('addFooterBtn');
  
  if (footerContainer.classList.contains('hidden')) {
    // Show footer
    footerContainer.classList.remove('hidden');
    addFooterBtn.textContent = 'Remove Footer';
    addFooterBtn.style.background = 'linear-gradient(135deg, #d63031 0%, #a22a2b 100%)';
    // Store footer state in session storage (per form instance)
    sessionStorage.setItem('footerVisible', 'true');
  } else {
    // Hide footer
    footerContainer.classList.add('hidden');
    addFooterBtn.textContent = 'Add Footer';
    addFooterBtn.style.background = 'linear-gradient(135deg, #6c757d 0%, #495057 100%)';
    // Store footer state in session storage
    sessionStorage.setItem('footerVisible', 'false');
  }
}

// Restore footer state on page load
function restoreFooterState() {
  const footerContainer = document.getElementById('footerContainer');
  const addFooterBtn = document.getElementById('addFooterBtn');
  if (!footerContainer || !addFooterBtn) return;

  // Reset footer state on every page load so the UI defaults to "Add Footer"
  sessionStorage.setItem('footerVisible', 'false');
  footerContainer.classList.add('hidden');
  addFooterBtn.textContent = 'Add Footer';
  addFooterBtn.style.background = 'linear-gradient(135deg, #6c757d 0%, #495057 100%)';
}

function resetRequestForm() {
  const form = document.getElementById('purchaseForm');
  if (!form) return;

  resetEditMode();
  form.reset();
  setDate();

  const selectArea = document.getElementById('selectArea');
  if (selectArea) selectArea.value = '';

  const section = document.getElementById('section');
  if (section) section.value = '';

  const grandTotalOutput = document.getElementById('grandTotal');
  if (grandTotalOutput) grandTotalOutput.textContent = '₱0.00';

  const purpose = document.getElementById('purpose');
  if (purpose) purpose.value = 'To be used as tarpaulin backdrop/banner stand for PhilHealth marketing activities/events.';

  sessionStorage.setItem('footerVisible', 'false');
  const footerContainer = document.getElementById('footerContainer');
  if (footerContainer) footerContainer.classList.add('hidden');
  const addFooterBtn = document.getElementById('addFooterBtn');
  if (addFooterBtn) {
    addFooterBtn.textContent = 'Add Footer';
    addFooterBtn.style.background = 'linear-gradient(135deg, #6c757d 0%, #495057 100%)';
  }

  if (itemsTableBody) {
    itemsTableBody.innerHTML = '';
    addNewItem();
    updateGrandTotal();
  }
}

departmentSelect.addEventListener('change', updateSectionOptions);
pricePerSqFtInput.addEventListener('input', () => {
  itemsTableBody.querySelectorAll('.item-row').forEach(row => updateItemCosts(row));
});
addItemBtn.addEventListener('click', addNewItem);

document.addEventListener('DOMContentLoaded', () => {
  // Check if coming from dashboard or records list to edit/view a record
  const sessionEditRecord = sessionStorage.getItem('editRecord');
  const params = new URLSearchParams(window.location.search);
  const queryEditPrNumber = params.get('edit');
  let record = null;
  let editAction = null;

  if (sessionEditRecord) {
    record = JSON.parse(sessionEditRecord);
    editAction = sessionStorage.getItem('editAction') || 'view';
  } else if (queryEditPrNumber) {
    record = getDatabaseRecords().find(r => r.prNumber === queryEditPrNumber);
    editAction = 'edit';
  }

  if (record) {
    prNumberInput.value = '';
    // Ensure any previously auto-generated PR IDs are cleared on new forms
    clearAutoGeneratedPr();
    if (editAction === 'view') {
      // Disable most form fields for view mode, but keep width and height editable
      document.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.classList.contains('width-input') || el.classList.contains('height-input')) {
          return;
        }
        el.disabled = true;
      });
      document.getElementById('saveBtn').style.display = 'none';
      document.getElementById('printBtn').style.display = 'inline-block';
    } else if (editAction === 'edit') {
      document.body.dataset.editPrNumber = record.prNumber;
      document.body.dataset.editRecordId = record.id || record.timestamp || '';
      document.body.dataset.editMode = 'true';
      document.getElementById('cancelEditBtn').style.display = 'inline-block';
      // Load the record data into the form
      loadRecordIntoForm(record);
    }
  }

  if (sessionEditRecord) {
    sessionStorage.removeItem('editRecord');
    sessionStorage.removeItem('editAction');
  }

  if (!record) {
    prNumberInput.value = '';
    setDate();
  }
  
  if (record && editAction === 'edit') {
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.textContent = 'Update Record';
    saveBtn.style.background = 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)';

    const formTitle = document.querySelector('.header h1');
    if (formTitle) {
      formTitle.textContent = 'Edit Purchase Request';
      formTitle.style.color = '#ff6b35';
    }
  }
  
  // Attach listeners to initial item row
  const initialRow = itemsTableBody.querySelector('.item-row');
  if (initialRow) {
    attachItemEventListeners(initialRow);
    updateItemCosts(initialRow);
  }

  document.getElementById('authSignInBtn')?.addEventListener('click', signInWithFirebase);
  document.getElementById('logoutBtn')?.addEventListener('click', openSignOutConfirm);
  document.getElementById('cancelSignOutBtn')?.addEventListener('click', closeSignOutConfirm);
  document.getElementById('confirmSignOutBtn')?.addEventListener('click', signOutFirebase);

  // Password reset modal listeners
  document.getElementById('cancelPasswordResetBtn')?.addEventListener('click', closePasswordResetConfirm);
  document.getElementById('confirmPasswordResetBtn')?.addEventListener('click', confirmPasswordReset);
  document.getElementById('closePasswordResetSuccessBtn')?.addEventListener('click', () => {
    closePasswordResetSuccess();
    loadOfficerAccounts();
  });

  // Account created modal listeners
  document.getElementById('closeAccountCreatedBtn')?.addEventListener('click', closeAccountCreatedSuccess);

  const authEmailInput = document.getElementById('authEmail');
  const authPasswordInput = document.getElementById('authPassword');
  [authEmailInput, authPasswordInput].forEach(input => {
    input?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        signInWithFirebase();
      }
    });
  });

  initializeFirebaseAuth();

  // Action buttons
    document.getElementById('saveBtn').addEventListener('click', saveForm);
  document.getElementById('cancelEditBtn').addEventListener('click', resetEditMode);
  document.getElementById('printBtn').addEventListener('click', checkPreview);
  
  // Footer toggle button
  const addFooterBtn = document.getElementById('addFooterBtn');
  if (addFooterBtn) {
    addFooterBtn.addEventListener('click', toggleFooter);
  }

  const branchFilter = document.getElementById('branchFilter');
  if (branchFilter) branchFilter.addEventListener('change', applyDashboardFilters);

  const dashboardSearchBox = document.getElementById('dashboardSearchBox');
  if (dashboardSearchBox) dashboardSearchBox.addEventListener('input', applyDashboardFilters);

  const dashboardMonthFilter = document.getElementById('dashboardMonthFilter');
  if (dashboardMonthFilter) dashboardMonthFilter.addEventListener('change', applyDashboardFilters);

  const dashboardYearFilter = document.getElementById('dashboardYearFilter');
  if (dashboardYearFilter) dashboardYearFilter.addEventListener('change', applyDashboardFilters);

  const saveReportBtn = document.getElementById('saveReportBtn');
  if (saveReportBtn) saveReportBtn.addEventListener('click', openReportModal);

  const reportCloseFooterBtn = document.getElementById('reportCloseFooterBtn');
  if (reportCloseFooterBtn) reportCloseFooterBtn.addEventListener('click', closeReportModal);

  const reportFilterType = document.getElementById('reportFilterType');
  if (reportFilterType) {
    reportFilterType.addEventListener('change', () => {
      const monthContainer = document.getElementById('monthFilterContainer');
      if (monthContainer) {
        monthContainer.style.display = reportFilterType.value === 'month' ? 'block' : 'none';
      }
      generateReportTable();
    });
  }

  const reportYearFilter = document.getElementById('reportYearFilter');
  if (reportYearFilter) {
    reportYearFilter.addEventListener('change', generateReportTable);
  }

  const selectArea = document.getElementById('selectArea');
  if (selectArea) {
    selectArea.addEventListener('change', updateSectionDefaultsForLhio);
  }

  const reportMonthFilter = document.getElementById('reportMonthFilter');
  if (reportMonthFilter) {
    reportMonthFilter.addEventListener('change', generateReportTable);
  }

  const reportCopyTableBtn = document.getElementById('reportCopyTableBtn');
  if (reportCopyTableBtn) reportCopyTableBtn.addEventListener('click', copyReportTableToClipboard);

  const recordsSearchBox = document.getElementById('recordsSearchBox');
  if (recordsSearchBox) recordsSearchBox.addEventListener('input', filterRecords);

  const recordsBranchFilter = document.getElementById('recordsBranchFilter');
  if (recordsBranchFilter) recordsBranchFilter.addEventListener('change', filterRecords);

  const recordsYearFilter = document.getElementById('recordsYearFilter');
  if (recordsYearFilter) recordsYearFilter.addEventListener('change', filterRecords);

  const markAllNotificationsReadBtn = document.getElementById('markAllNotificationsReadBtn');
  if (markAllNotificationsReadBtn) markAllNotificationsReadBtn.addEventListener('click', markAllNotificationsRead);

  const deleteAllNotificationsBtn = document.getElementById('deleteAllNotificationsBtn');
  if (deleteAllNotificationsBtn) deleteAllNotificationsBtn.addEventListener('click', deleteAllNotifications);

  const archiveSearchBox = document.getElementById('archiveSearchBox');
  if (archiveSearchBox) archiveSearchBox.addEventListener('input', filterArchive);

  const archiveBranchFilter = document.getElementById('archiveBranchFilter');
  if (archiveBranchFilter) archiveBranchFilter.addEventListener('change', filterArchive);

  const archiveYearFilter = document.getElementById('archiveYearFilter');
  if (archiveYearFilter) archiveYearFilter.addEventListener('change', filterArchive);

  const deleteAllArchivedBtn = document.getElementById('deleteAllArchivedBtn');
  if (deleteAllArchivedBtn) deleteAllArchivedBtn.addEventListener('click', deleteAllArchivedRecords);

  const createUserBtn = document.getElementById('createUserBtn');
  if (createUserBtn) createUserBtn.addEventListener('click', createOfficerAccount);

  const refreshUsersBtn = document.getElementById('refreshUsersBtn');
  if (refreshUsersBtn) refreshUsersBtn.addEventListener('click', loadOfficerAccounts);

  const userSearchBox = document.getElementById('userSearchBox');
  if (userSearchBox) {
    userSearchBox.addEventListener('input', event => {
      userAccountsSearch = event.target.value.trim();
      userAccountsPage = 1;
      renderUserAccountsPage();
    });
  }

  const prevPageBtn = document.getElementById('userPrevPageBtn');
  if (prevPageBtn) prevPageBtn.addEventListener('click', () => changeUserAccountsPage(-1));

  const nextPageBtn = document.getElementById('userNextPageBtn');
  if (nextPageBtn) nextPageBtn.addEventListener('click', () => changeUserAccountsPage(1));

  const reportModal = document.getElementById('reportModal');
  if (reportModal) {
    reportModal.addEventListener('click', (e) => {
      if (e.target === reportModal) closeReportModal();
    });
  }

  window.addEventListener('hashchange', () => routeApp(window.location.hash));
  routeApp(window.location.hash || '#new');

  // Warn when navigating away while in edit mode
  function promptIfEditing(e) {
    if (document.body.dataset.editMode === 'true') {
      const proceed = confirm('You have an unfinished edit. Do you want to cancel the edit and navigate away?');
      if (!proceed) {
        if (e && e.preventDefault) e.preventDefault();
        return false;
      }
      // If user confirms, reset edit mode and allow navigation
      resetEditMode();
    }
    return true;
  }

  // Intercept sidebar navigation clicks
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', function(e) {
      if (!promptIfEditing(e)) return;
      // allow normal navigation
    });
  });
  // Intercept other internal navigation links (hash links)
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', function(e) {
      if (!promptIfEditing(e)) return;
    });
  });

  // Warn on browser/tab close or refresh
  window.addEventListener('beforeunload', function(e) {
    if (document.body.dataset.editMode === 'true') {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  loadDatabaseRecords();
  
  // Restore footer state if it was previously shown
  restoreFooterState();
});

// Clear common auto-generated PR patterns (timestamp-random) so field stays blank
function isAutoGeneratedPr(val) {
  if (!val) return false;
  // Example patterns: long numeric timestamp + '-' + random, or containing 'AUTO-'
  const trimmed = String(val).trim();
  if (/^AUTO-/i.test(trimmed)) return true;
  if (/^[0-9]{10,}-[a-z0-9_-]{4,}$/i.test(trimmed)) return true;
  return false;
}

function clearAutoGeneratedPr() {
  try {
    if (isAutoGeneratedPr(prNumberInput.value)) {
      prNumberInput.value = '';
    }
    // keep placeholder empty like SAI No.
    prNumberInput.placeholder = '';
  } catch (e) {
    // ignore
  }
}

function validateAndBuildFormData() {
  // Reuse the same validation rules from previous saveForm implementation
  const selectedArea = document.getElementById('selectArea').value;
  if (!selectedArea) {
    alert('⚠️ VALIDATION ERROR\n\nPlease select an LHIO (area) first!');
    return null;
  }

  if (isStandardUser()) {
    const lockedValue = getAssignedOfficeValue();
    if (selectedArea !== lockedValue) {
      document.getElementById('selectArea').value = lockedValue;
      alert('Your account is locked to ' + getAssignedOfficeLabel() + '. The form has been corrected to your assigned office.');
      return null;
    }
  }

  const department = departmentSelect.value;
  if (!department) {
    alert('⚠️ VALIDATION ERROR\n\nPlease select a Department!');
    return null;
  }

  const isEditMode = document.body.dataset.editMode === 'true';
  const editPrNumber = document.body.dataset.editPrNumber;
  const editRecordId = document.body.dataset.editRecordId;

  const pricePerSqFt = parseFloat(pricePerSqFtInput.value);
  if (!pricePerSqFt || pricePerSqFt <= 0) {
    alert('⚠️ VALIDATION ERROR\n\nPrice per sq. ft. must be greater than 0!');
    return null;
  }

  const rows = itemsTableBody.querySelectorAll('.item-row');
  if (rows.length === 0) {
    alert('⚠️ VALIDATION ERROR\n\nPlease add at least one item to the Purchase Request!');
    return null;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const itemDesc = row.querySelector('.itemDescription').value.trim();
    const width = parseFloat(row.querySelector('.width-input').value);
    const height = parseFloat(row.querySelector('.height-input').value);
    const unitMeasure = row.querySelector('.unitMeasure-select').value;
    const quantity = parseFloat(row.querySelector('.quantity-input').value);

    if (!itemDesc) { alert(`⚠️ VALIDATION ERROR\n\nItem #${i + 1}: Item Description is required!`); return null; }
    if (!width || width <= 0) { alert(`⚠️ VALIDATION ERROR\n\nItem #${i + 1}: Width must be greater than 0!`); return null; }
    if (!height || height <= 0) { alert(`⚠️ VALIDATION ERROR\n\nItem #${i + 1}: Height must be greater than 0!`); return null; }
    if (!unitMeasure) { alert(`⚠️ VALIDATION ERROR\n\nItem #${i + 1}: Unit of Measure is required!`); return null; }
    if (!quantity || quantity <= 0) { alert(`⚠️ VALIDATION ERROR\n\nItem #${i + 1}: Quantity must be greater than 0!`); return null; }
  }

  const purpose = document.getElementById('purpose').value.trim();
  if (!purpose) { alert('⚠️ VALIDATION ERROR\n\nPurpose field is required!'); return null; }

  const requestedByName = document.getElementById('requestedByName').value.trim();
  const recommendedByName = document.getElementById('recommendedByName').value.trim();
  const approvedByName = document.getElementById('approvedByName').value.trim();
  if (!requestedByName) { alert('⚠️ VALIDATION ERROR\n\n"Requested by" - Printed Name is required!'); return null; }
  if (!recommendedByName) { alert('⚠️ VALIDATION ERROR\n\n"Recommended by" - Printed Name is required!'); return null; }
  if (!approvedByName) { alert('⚠️ VALIDATION ERROR\n\n"Approved by" - Printed Name is required!'); return null; }

  const requestedByDesignation = document.getElementById('requestedByDesignation').value.trim();
  const recommendedByDesignation = document.getElementById('recommendedByDesignation').value.trim();
  const approvedByDesignation = document.getElementById('approvedByDesignation').value.trim();
  if (!requestedByDesignation) { alert('⚠️ VALIDATION ERROR\n\n"Requested by" - Designation is required!'); return null; }
  if (!recommendedByDesignation) { alert('⚠️ VALIDATION ERROR\n\n"Recommended by" - Designation is required!'); return null; }
  if (!approvedByDesignation) { alert('⚠️ VALIDATION ERROR\n\n"Approved by" - Designation is required!'); return null; }

  // Collect items
  const items = [];
  rows.forEach(row => {
    items.push({
      itemDescription: row.querySelector('.itemDescription').value,
      width: row.querySelector('.width-input').value,
      height: row.querySelector('.height-input').value,
      unitMeasure: row.querySelector('.unitMeasure-select').value,
      quantity: row.querySelector('.quantity-input').value,
      unitCost: row.querySelector('.unitCost-input').value,
      totalCost: row.querySelector('.totalCost-input').value
    });
  });

  let grandTotalAmount = 0;
  items.forEach(item => { grandTotalAmount += parseFloat(String(item.totalCost || '').replace(/[₱,]/g, '')) || 0; });
  const calculatedGrandTotal = formatCurrency(grandTotalAmount);

  const firstItemUnit = rows[0]?.querySelector('.unit-input')?.value || 'pc';
  const recordId = isEditMode ? (editRecordId || generateRecordId()) : generateRecordId();

  const formData = {
    id: recordId,
    prNumber: isEditMode ? cleanPrNumber(editPrNumber) : cleanPrNumber(prNumberInput.value),
    prDate: prDateInput.value,
    departmentCode: departmentSelect.value,
    department: departmentSelect.options[departmentSelect.selectedIndex]?.text || departmentSelect.value,
    section: sectionSelect.value,
    agency: document.getElementById('agency').value,
    saiNumber: document.getElementById('saiNumber').value,
    unit: firstItemUnit,
    pricePerSqFt: pricePerSqFtInput.value,
    items: items,
    grandTotal: calculatedGrandTotal,
    purpose: document.getElementById('purpose').value,
    requestedBySignature: document.getElementById('requestedBySignature').value,
    requestedByName: document.getElementById('requestedByName').value,
    requestedByDesignation: document.getElementById('requestedByDesignation').value,
    recommendedBySignature: document.getElementById('recommendedBySignature').value,
    recommendedByName: document.getElementById('recommendedByName').value,
    recommendedByDesignation: document.getElementById('recommendedByDesignation').value,
    approvedBySignature: document.getElementById('approvedBySignature').value,
    approvedByName: document.getElementById('approvedByName').value,
    approvedByDesignation: document.getElementById('approvedByDesignation').value,
    selectedArea: document.getElementById('selectArea').value,
    selectedAreaLabel: document.getElementById('selectArea').options[document.getElementById('selectArea').selectedIndex].text,
    footerVisible: sessionStorage.getItem('footerVisible') === 'true',
    timestamp: new Date().toISOString(),
    approvalStatus: document.body.dataset.approvalStatus || 'pending',
    controlNumber: document.body.dataset.controlNumber || '',
    isNew: !isEditMode,
    __meta: { isEditMode, editPrNumber, editRecordId }
  };

  return formData;
}

async function persistFormData(formData) {
  const controlNumber = formData.controlNumber || generateControlNumber(formData);
  const isEditMode = formData.__meta?.isEditMode;
  const editPrNumber = formData.__meta?.editPrNumber;
  const editRecordId = formData.__meta?.editRecordId;

  if (isEditMode) {
    let records = getDatabaseRecords();
    records = records.filter(r => {
      if (editRecordId) return r.id !== editRecordId;
      if (editPrNumber) return cleanPrNumber(r.prNumber) !== editPrNumber;
      return true;
    });

    const updatedRecord = {
      ...formData,
      controlNumber,
      nature: formData.items && formData.items[0]?.itemDescription || '',
      size: formData.size || '',
      quantity: formData.quantity || '',
      cost: formData.grandTotal,
      timestamp: new Date().toISOString()
    };

    if (currentAuthUser && getFirestoreInstance() && updatedRecord.id) {
      await updatePurchaseRequestInFirestore(updatedRecord.id, updatedRecord);
    }

    records.unshift(updatedRecord);
    setDatabaseRecords(records);
    alert('Record updated successfully!');
    // Update UI lists
    updateSummaryCards(getDatabaseRecords());
    renderRecordsTable(getDatabaseRecords());
    // Exit edit mode
    resetEditMode();
    // Preview the updated saved record
    showPreviewModal(updatedRecord);
    resetRequestForm();
    return;
  }

  // New record: save and then preview the saved version
  await saveRecordToDatabase(formData);
  // Ensure UI updated
  updateSummaryCards(getDatabaseRecords());
  renderRecordsTable(getDatabaseRecords());
  resetEditMode();
  // Find saved record by id and preview it
  const saved = getDatabaseRecords().find(r => r.id === formData.id) || getDatabaseRecords()[0];
  if (saved) {
    alert('Record saved successfully!');
    showPreviewModal(saved);
    resetRequestForm();
  } else {
    alert('Record saved, but unable to locate the saved entry for preview.');
  }
}

function checkPreview() {
  const formData = validateAndBuildFormData();
  if (!formData) return;
  // Only preview the current input (do not save)
  showPreviewModal(formData);
}

async function saveForm() {
  const formData = validateAndBuildFormData();
  if (!formData) return;
  if (!confirm('Please confirm: Are the details you entered correct? Click OK to save and preview.')) return;
  // Persist then preview the saved record
  await persistFormData(formData);
}

function normalizeRecordStatus(record) {
  if (!record || typeof record !== 'object') return record;
  const normalized = { ...record };
  const status = String(normalized.approvalStatus || normalized.status || '').toLowerCase().trim();
  if (status) {
    normalized.approvalStatus = status;
    normalized.status = status;
  }
  return normalized;
}

function isVisibleRecord(record) {
  if (!record || typeof record !== 'object') return false;
  const status = String(record.approvalStatus || record.status || '').toLowerCase().trim();
  // Keep rejected records visible on the records page so admins can archive them.
  return status !== 'deleted';
}

function getDatabaseRecords() {
  if (currentAuthUser && firestoreRecordsLoaded) {
    return firestoreRecordsCache
      .map(normalizeRecordStatus)
      .filter(isVisibleRecord)
      .map(record => ({ ...record }));
  }

  const raw = JSON.parse(localStorage.getItem('purchaseRequestDatabase') || '[]');
  if (!Array.isArray(raw)) return [];

  let updated = false;
  const records = raw.map(r => {
    const record = normalizeRecordStatus({
      ...r,
      prNumber: (r.prNumber ? String(r.prNumber).replace(/^AUTO-/, '') : r.prNumber)
    });
    if (!record.id) {
      record.id = record.timestamp || generateRecordId();
      updated = true;
    }
    if (!record.approvalStatus && record.status) {
      record.approvalStatus = String(record.status).toLowerCase().trim();
    }
    if (!record.status && record.approvalStatus) {
      record.status = String(record.approvalStatus).toLowerCase().trim();
    }
    return record;
  });

  if (updated) {
    setDatabaseRecords(records);
  }

  return dedupeRecords(records);
}

function setDatabaseRecords(records) {
  if (currentAuthUser && firestoreRecordsLoaded) {
    firestoreRecordsCache = dedupeRecords(records).map(record => ({ ...record }));
  }
  // Clean records of internal metadata (keys starting with __) and
  // undefined values before persisting to localStorage. This prevents
  // fields like `__meta.editPrNumber` from being stored and later
  // causing Firestore update errors.
  try {
    const cleaned = Array.isArray(records) ? dedupeRecords(records).map(r => cleanForFirestore(r || {})) : [];
    localStorage.setItem('purchaseRequestDatabase', JSON.stringify(cleaned));
  } catch (e) {
    console.warn('Failed to write database records to localStorage:', e);
    // Fallback to raw write
    try { localStorage.setItem('purchaseRequestDatabase', JSON.stringify(records)); } catch (e2) {}
  }
}

function formatDimensionLabel(width, height, unit) {
  const unitMap = { 'ft': 'ft', 'in': 'in', 'cm': 'cm', 'm': 'm' };
  const unitLabel = unitMap[unit] || unit;
  return `W ${width} x H ${height} ${unitLabel}`.trim();
}

function getItemSummary(item) {
  return {
    nature: item.itemDescription || '',
    size: formatDimensionLabel(item.width, item.height, item.unitMeasure),
    quantity: item.quantity || '',
    cost: item.totalCost || ''
  };
}

async function saveRecordToDatabase(formData) {
  const records = getDatabaseRecords();
  const summary = getItemSummary(formData.items[0] || {});
  const parsedDate = parseDateString(formData.prDate);
  const record = {
    ...formData,
    controlNumber: formData.controlNumber || generateControlNumber(formData),
    approvalStatus: formData.approvalStatus || 'pending',
    status: formData.status || formData.approvalStatus || 'pending',
    nature: summary.nature,
    size: summary.size,
    quantity: summary.quantity,
    cost: formData.grandTotal,
    month: parsedDate ? String(parsedDate.getMonth() + 1).padStart(2, '0') : '',
    year: parsedDate ? String(parsedDate.getFullYear()) : '',
    timestamp: formData.timestamp || new Date().toISOString()
  };

  const isEditMode = formData.__meta?.isEditMode;

  if (currentAuthUser && getFirestoreInstance()) {
    try {
      if (isEditMode && record.id) {
        await updatePurchaseRequestInFirestore(record.id, record);
      } else {
        const savedId = await savePurchaseRequestToFirestore(record);
        if (savedId) {
          record.id = savedId;
        }
      }

      const index = record.id
        ? records.findIndex(r => r.id === record.id)
        : record.prNumber
          ? records.findIndex(r => r.prNumber === record.prNumber)
          : -1;
      if (index >= 0) {
        records[index] = record;
      } else {
        records.unshift(record);
      }
      firestoreRecordsCache = records.map(rec => ({ ...rec }));
      firestoreRecordsLoaded = true;
      setDatabaseRecords(records);
      loadDatabaseRecords();
      return;
    } catch (error) {
      console.error('Error saving record to Firestore:', error);
    }
  }

  const index = record.id
    ? records.findIndex(r => r.id === record.id)
    : record.prNumber
      ? records.findIndex(r => r.prNumber === record.prNumber)
      : -1;
  if (index >= 0) {
    records[index] = record;
  } else {
    records.unshift(record); // Add new records to the top
  }
  setDatabaseRecords(records);
  loadDatabaseRecords();
}

/**
 * Migrate records stored in localStorage (`purchaseRequestDatabase`) to Firestore.
 * Skips records that already exist in Firestore (by id, prNumber, or timestamp).
 */
async function migrateLocalRecordsToFirestore() {
  const db = getFirestoreInstance();
  if (!db || !currentAuthUser) return;

  let local = JSON.parse(localStorage.getItem('purchaseRequestDatabase') || '[]');
  if (!Array.isArray(local) || local.length === 0) return;

  try {
    // Fetch existing purchase requests for this user (to avoid duplicates)
    const snapshot = await db.collection('purchaseRequests')
      .where('createdBy.uid', '==', currentAuthUser.uid)
      .get();

    const existing = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const existingIds = new Set(existing.map(e => String(e.id)));
    const existingPrNumbers = new Set(existing.map(e => String(e.prNumber || '').trim()));
    const existingTimestamps = new Set(existing.map(e => String(e.timestamp || '').trim()));

    let migrated = 0;

    for (let i = 0; i < local.length; i++) {
      const rec = local[i];
      const recId = rec.id ? String(rec.id) : '';
      const prNum = rec.prNumber ? String(rec.prNumber).trim() : '';
      const ts = rec.timestamp ? String(rec.timestamp).trim() : '';

      if (recId && existingIds.has(recId)) continue;
      if (prNum && existingPrNumbers.has(prNum)) continue;
      if (ts && existingTimestamps.has(ts)) continue;

      // Prepare record for Firestore
      const cleanRec = cleanForFirestore(rec || {});
      const upload = {
        ...cleanRec,
        createdBy: {
          uid: currentAuthUser.uid,
          email: currentAuthUser.email,
          name: currentUserProfile?.displayName,
          role: currentUserProfile?.role,
          office: currentUserProfile?.office
        },
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: cleanRec.status || rec.status || rec.approvalStatus || 'draft'
      };

      try {
        const added = await db.collection('purchaseRequests').add(upload);
        // update local copy id so it maps to Firestore
        rec.id = added.id;
        migrated++;
      } catch (err) {
        console.warn('Failed migrating record to Firestore', err, rec);
      }
    }

    if (migrated > 0) {
      // Save updated local storage (now containing Firestore ids)
      localStorage.setItem('purchaseRequestDatabase', JSON.stringify(local));
      await logAuditEvent('migrate_local_records', { migrated });
      console.log(`Migrated ${migrated} local record(s) to Firestore`);
    }
  } catch (error) {
    console.error('Migration error:', error);
  }
}

function loadDatabaseRecords() {
  // Database records are now managed in the dashboard
  // This function is kept for backward compatibility
}

function routeApp(hash) {
  const view = (hash || '#new').replace('#', '') || 'new';
  setActiveView(view);
}

function setActiveView(view) {
  const newSection = document.getElementById('newRequestSection');
  const dashboardSection = document.getElementById('dashboardSection');
  const notificationsSection = document.getElementById('notificationsSection');
  const recordsSection = document.getElementById('recordsSection');
  const archiveSection = document.getElementById('archiveSection');
  const usersSection = document.getElementById('usersSection');
  const helpSection = document.getElementById('helpSection');

  const sections = [newSection, dashboardSection, notificationsSection, recordsSection, archiveSection, usersSection, helpSection];
  sections.forEach(section => {
    if (!section) return;
    section.classList.add('hidden');
  });

  let activeView = view;
  if (view === 'users' && !isAdminUser()) {
    activeView = 'new';
  }

  if (activeView === 'dashboard') {
    dashboardSection?.classList.remove('hidden');
    initDashboard();
  } else if (activeView === 'notifications') {
    notificationsSection?.classList.remove('hidden');
    initNotifications();
  } else if (activeView === 'records') {
    recordsSection?.classList.remove('hidden');
    initRecords();
  } else if (activeView === 'archive') {
    archiveSection?.classList.remove('hidden');
    initArchive();
  } else if (activeView === 'users') {
    usersSection?.classList.remove('hidden');
    initUserManagement();
  } else if (activeView === 'help') {
    helpSection?.classList.remove('hidden');
  } else {
    newSection?.classList.remove('hidden');
  }

  document.querySelectorAll('.sidebar-link').forEach(link => {
    const target = link.getAttribute('href');
    link.classList.toggle('active', target === `#${activeView}`);
  });

  if (view === 'users' && !isAdminUser()) {
    window.location.hash = '#new';
  }
}

function initDashboard() {
  const allRecords = getDatabaseRecords();
  updateDashboardYearFilter(allRecords);
  updateSummaryCards(allRecords);
  applyDashboardFilters();
}

function initNotifications() {
  loadNotifications();
}

function initRecords() {
  const allRecords = getDatabaseRecords();
  let filteredRecords = allRecords;

  // Restrict standard users to only see records for their assigned office
  if (isStandardUser() && currentUserProfile && currentUserProfile.office) {
    const userOffice = String(currentUserProfile.office).toLowerCase().trim();
    filteredRecords = allRecords.filter(record => {
      const branch = (getRecordBranch(record) || '').toLowerCase().trim();
      return branch === userOffice;
    });
  }

  updateRecordsYearFilter(filteredRecords);
  updateRecordsFiltersForUser();
  renderRecordsTable(filteredRecords);
}

async function initArchive() {
  await loadArchiveRecordsFromFirestore();
  const archivedRecords = getArchiveRecords();
  updateArchiveYearFilter(archivedRecords);
  renderArchiveTable(archivedRecords);
}

function getArchiveRecords() {
  const raw = JSON.parse(localStorage.getItem('purchaseRequestArchive') || '[]');
  const localRecords = Array.isArray(raw) ? raw.map(r => {
    const record = { ...r, prNumber: (r.prNumber ? String(r.prNumber).replace(/^AUTO-/, '') : r.prNumber) };
    if (!record.id) {
      record.id = record.archivedAt || record.timestamp || generateRecordId();
    }
    return normalizeRecordStatus(record);
  }) : [];

  if (!archiveRecordsLoaded || !Array.isArray(archiveRecordsCache) || archiveRecordsCache.length === 0) {
    return localRecords;
  }

  const merged = [...localRecords];
  archiveRecordsCache.forEach(firestoreRecord => {
    const existingIndex = merged.findIndex(r => r.id && firestoreRecord.id && r.id === firestoreRecord.id);
    if (existingIndex >= 0) {
      merged[existingIndex] = firestoreRecord;
    } else {
      merged.push(normalizeRecordStatus(firestoreRecord));
    }
  });

  return merged;
}

async function loadArchiveRecordsFromFirestore() {
  const db = getFirestoreInstance();
  if (!db || !currentAuthUser) {
    archiveRecordsCache = [];
    archiveRecordsLoaded = true;
    return;
  }

  try {
    let query = db.collection('purchaseRequests').where('status', '==', 'deleted');
    if (!isAdminUser()) {
      query = query.where('createdBy.uid', '==', currentAuthUser.uid);
    }

    const snapshot = await query.get();
    archiveRecordsCache = snapshot.docs.map(doc => normalizeRecordStatus({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn('Failed to load archived records from Firestore:', error);
    archiveRecordsCache = [];
  } finally {
    archiveRecordsLoaded = true;
  }
}

function updateRecordsYearFilter(records) {
  const yearFilter = document.getElementById('recordsYearFilter');
  if (!yearFilter) return;
  const years = new Set();
  records.forEach(record => {
    if (record.prDate) {
      try {
        years.add(new Date(record.prDate).getFullYear().toString());
      } catch (e) {}
    }
  });
  const sortedYears = Array.from(years).sort().reverse();
  yearFilter.innerHTML = '<option value="">All Years</option>' + sortedYears.map(year => `<option value="${year}">${year}</option>`).join('');
}

function renderRecordsTable(records) {
  const tbody = document.getElementById('recordsTableBody');
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">
          <div class="empty-state-icon"></div>
          <p>No records to show</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(record => {
    const recordId = getRecordIdentifier(record);
    const amountString = record.grandTotal || record.cost || '₱0.00';
    const amount = parseFloat(amountString.replace(/[₱,]/g, '') || '0') || 0;
    const branch = getRecordBranch(record) || '-';
    const departmentLabel = resolveDepartmentLabel(record.department || record.departmentCode) || '-';
    const sizeLabel = formatRecordSize(record);
    const itemTitle = (record.items && record.items[0]?.itemDescription) || record.purpose || '-';
    const dateText = formatDateToLong(record.prDate) || record.prDate || '-';
    const controlNumber = record.controlNumber || 'TBD';
    const status = String(record.approvalStatus || record.status || 'pending').toLowerCase().trim();
    const statusLabel = status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending';
    const statusColor = status === 'approved' ? '#0b7c47' : status === 'rejected' ? '#d63031' : '#f39c12';
    let actions = `<button class="record-action-btn" onclick="openRecord('${recordId}', 'view')">View</button>`;
    if (isAdminUser() && status === 'pending') {
      actions += ` <button class="record-action-btn" onclick="approveRecord('${recordId}')">Approve</button> <button class="record-action-btn delete" onclick="rejectRecord('${recordId}')">Reject</button>`;
    }
    if (isAdminUser() && status === 'rejected') {
      actions += ` <button class="record-action-btn delete" onclick="deleteRecord('${recordId}')">Archive</button>`;
    }

    return `
      <tr>
        <td>${controlNumber}</td>
        <td class="date-cell">${dateText}</td>
        <td>${departmentLabel}</td>
        <td>${branch}</td>
        <td>${itemTitle}</td>
        <td style="text-align:center">${sizeLabel}</td>
        <td>₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        <td><span style="color: ${statusColor}; font-weight: 700;">${statusLabel}</span></td>
        <td class="action-cell">${actions}</td>
      </tr>
    `;
  }).join('');
}

function updateRecordsTableSchema() {
  const table = document.getElementById('recordsTable');
  if (!table) return;
  const headerCells = table.querySelectorAll('thead th');
  if (headerCells.length >= 9) {
    headerCells[0].textContent = 'Control No.';
    headerCells[1].textContent = 'Date';
    headerCells[2].textContent = 'Department';
    headerCells[3].textContent = 'Branch';
    headerCells[4].textContent = 'Item';
    headerCells[5].textContent = 'Size';
    headerCells[6].textContent = 'Amount (₱)';
    headerCells[7].textContent = 'Status';
    if (headerCells[8]) headerCells[8].textContent = 'Actions';
  }
}

function filterRecords() {
  const searchValue = document.getElementById('recordsSearchBox')?.value.toLowerCase().trim() || '';
  const branchValue = document.getElementById('recordsBranchFilter')?.value.toLowerCase() || '';
  const yearValue = document.getElementById('recordsYearFilter')?.value || '';

  let records = getDatabaseRecords();

  // If standard user, limit records to their assigned office only
  if (isStandardUser() && currentUserProfile && currentUserProfile.office) {
    const userOffice = String(currentUserProfile.office).toLowerCase().trim();
    records = records.filter(record => {
      const branch = (getRecordBranch(record) || '').toLowerCase().trim();
      return branch === userOffice;
    });
  }

  if (branchValue) {
    records = records.filter(record => getRecordBranch(record).toLowerCase().includes(branchValue));
  }

  if (yearValue) {
    records = records.filter(record => {
      if (!record.prDate) return false;
      try {
        return new Date(record.prDate).getFullYear().toString() === yearValue;
      } catch (e) {
        return false;
      }
    });
  }

  if (searchValue) {
    records = records.filter(record => {
      const controlNumberText = String(record.controlNumber || '').toLowerCase();
      return controlNumberText.includes(searchValue);
    });
  }

  renderRecordsTable(records);
}

function updateArchiveYearFilter(records) {
  const yearFilter = document.getElementById('archiveYearFilter');
  if (!yearFilter) return;
  const years = new Set();
  records.forEach(record => {
    if (record.archivedAt) {
      try {
        years.add(new Date(record.archivedAt).getFullYear().toString());
      } catch (e) {}
    }
  });
  const sortedYears = Array.from(years).sort().reverse();
  yearFilter.innerHTML = '<option value="">All Years</option>' + sortedYears.map(year => `<option value="${year}">${year}</option>`).join('');
}

function renderArchiveTable(records) {
  const tbody = document.getElementById('archiveTableBody');
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <div class="empty-state-icon"></div>
          <p>No records to show</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(record => {
    const recordId = getRecordIdentifier(record);
    const controlNumber = record.controlNumber || record.prNumber || 'TBD';
    const amountString = record.grandTotal || record.cost || '₱0.00';
    const amount = parseFloat(amountString.replace(/[₱,]/g, '') || '0') || 0;
    const branch = getRecordBranch(record) || '-';
    const archivedAt = record.archivedAt ? new Date(record.archivedAt).toLocaleDateString('en-PH') : '-';
    const itemSize = formatRecordSize(record);
    const status = String(record.approvalStatus || record.status || 'pending').toLowerCase().trim();
    const statusLabel = status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending';
    const statusColor = status === 'approved' ? '#0b7c47' : status === 'rejected' ? '#d63031' : '#f39c12';
    return `
      <tr>
        <td class="date-cell">${archivedAt}</td>
        <td>${controlNumber}</td>
        <td>${branch}</td>
        <td>${(record.items && record.items[0]?.itemDescription) || record.purpose || '-'}</td>
        <td>${itemSize || '-'}</td>
        <td>₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        <td><span style="color: ${statusColor}; font-weight:700">${statusLabel}</span></td>
        <td class="action-cell">
          <button class="record-action-btn" onclick="restoreArchivedRecord('${recordId}')">Restore</button>
          <button class="record-action-btn delete" onclick="permanentlyDeleteArchived('${recordId}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterArchive() {
  const searchValue = document.getElementById('archiveSearchBox')?.value.toLowerCase().trim() || '';
  const branchValue = document.getElementById('archiveBranchFilter')?.value.toLowerCase() || '';
  const yearValue = document.getElementById('archiveYearFilter')?.value || '';

  let records = getArchiveRecords();

  if (searchValue) {
    records = records.filter(record =>
      getRecordBranch(record).toLowerCase().includes(searchValue) ||
      (record.items && record.items[0]?.itemDescription || '').toLowerCase().includes(searchValue) ||
      (record.purpose || '').toLowerCase().includes(searchValue)
    );
  }

  if (branchValue) {
    records = records.filter(record => getRecordBranch(record).toLowerCase().includes(branchValue));
  }

  if (yearValue) {
    records = records.filter(record => {
      if (!record.archivedAt) return false;
      try {
        return new Date(record.archivedAt).getFullYear().toString() === yearValue;
      } catch (e) {
        return false;
      }
    });
  }

  renderArchiveTable(records);
}

async function restoreArchivedRecord(recordId) {
  const archived = getArchiveRecords();
  const index = archived.findIndex(record => record.id === recordId || cleanPrNumber(record.prNumber) === recordId);
  if (index === -1) return;

  const [record] = archived.splice(index, 1);
  const restoredRecord = normalizeRecordStatus({
    ...record,
    archivedAt: undefined,
    deletedBy: undefined,
    deletedAt: undefined,
    status: 'rejected',
    approvalStatus: 'rejected'
  });

  localStorage.setItem('purchaseRequestArchive', JSON.stringify(archived));
  archiveRecordsCache = archiveRecordsCache.filter(r => r.id !== restoredRecord.id);

  const activeRecords = getDatabaseRecords();
  activeRecords.unshift(restoredRecord);
  setDatabaseRecords(activeRecords);

  if (restoredRecord.id && getFirestoreInstance()) {
    await updatePurchaseRequestInFirestore(restoredRecord.id, {
      status: restoredRecord.status,
      approvalStatus: restoredRecord.approvalStatus,
      deletedBy: null,
      deletedAt: null
    }).catch(error => console.warn('Failed to restore archived record in Firestore:', error));
  }

  alert('Record restored successfully.');
  initRecords();
  initArchive();
}

async function permanentlyDeleteArchived(recordId) {
  if (!confirm('⚠️ PERMANENT DELETE\n\nThis will permanently delete this archived record and cannot be undone.\n\nAre you sure?')) {
    return;
  }
  const archived = getArchiveRecords();
  const index = archived.findIndex(record => record.id === recordId || cleanPrNumber(record.prNumber) === recordId);
  if (index === -1) return;

  const [record] = archived.splice(index, 1);
  localStorage.setItem('purchaseRequestArchive', JSON.stringify(archived));
  archiveRecordsCache = archiveRecordsCache.filter(r => r.id !== recordId);

  const db = getFirestoreInstance();
  if (db && record.id) {
    try {
      await db.collection('purchaseRequests').doc(record.id).delete();
    } catch (error) {
      console.warn('Failed to delete archived Firestore record:', error);
    }
  }

  alert('✓ Record permanently deleted.');
  initArchive();
}

async function deleteAllArchivedRecords() {
  await loadArchiveRecordsFromFirestore();
  const archived = getArchiveRecords();
  if (!archived.length) {
    alert('There are no archived records to delete.');
    return;
  }

  if (!confirm('⚠️ Delete all archived records? This will permanently remove all archived forms and cannot be undone.')) {
    return;
  }

  const db = getFirestoreInstance();
  if (db) {
    try {
      const batch = db.batch();
      archived.forEach(record => {
        if (record.id) {
          batch.delete(db.collection('purchaseRequests').doc(record.id));
        }
      });
      await batch.commit();
    } catch (error) {
      console.warn('Failed to delete archived records from Firestore:', error);
    }
  }

  localStorage.setItem('purchaseRequestArchive', JSON.stringify([]));
  archiveRecordsCache = [];
  archiveRecordsLoaded = false;
  initArchive();
  applyDashboardFilters();
  alert('All archived records have been deleted.');
}

function updateSummaryCards(records = []) {
  const totalValue = records.reduce((sum, record) => {
    if (String(record.approvalStatus || '').toLowerCase() !== 'approved') return sum;
    const amountString = record.grandTotal || record.cost || '₱0.00';
    const grandTotal = parseFloat(amountString.replace(/[₱,]/g, '') || '0') || 0;
    return sum + grandTotal;
  }, 0);
  const departments = new Set(records.map(r => resolveDepartmentLabel(r.department || r.departmentCode || 'Unknown')));
  const total = records.length;

  document.getElementById('totalValue').textContent = '₱' + totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 });
  document.getElementById('totalCount').textContent = total;
  document.getElementById('departmentCount').textContent = departments.size;
  renderMonthlyChart(records);
}

function renderMonthlyChart(records) {
  const monthlyData = {};
  records.forEach(record => {
    if (!record.prDate) return;
    try {
      const date = new Date(record.prDate);
      const monthKey = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
    } catch (e) {
      // ignore invalid dates
    }
  });

  const now = new Date();
  const months = [];
  const data = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    months.push(monthKey);
    data.push(monthlyData[monthKey] || 0);
  }

  if (window.monthlyChartInstance) {
    window.monthlyChartInstance.destroy();
  }

  const ctx = document.getElementById('monthlyChart');
  if (!ctx) return;

  window.monthlyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'Purchase Requests',
        data,
        borderColor: '#0b7c47',
        backgroundColor: 'rgba(11, 124, 71, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 5,
        pointBackgroundColor: '#0b7c47',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { font: { size: 12 }, color: '#1a1a1a' }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#5a5a5a' },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: {
          ticks: { color: '#5a5a5a' },
          grid: { color: 'rgba(0,0,0,0.05)' }
        }
      }
    }
  });
}

function getRecordBranch(record) {
  if (!record) return '';
  if (record.selectedAreaLabel) return record.selectedAreaLabel;

  const selectedArea = record.selectedArea;
  if (selectedArea) {
    try {
      const url = new URL(selectedArea, window.location.origin);
      const areaParam = url.searchParams.get('area');
      if (areaParam) {
        return decodeURIComponent(areaParam);
      }
    } catch (e) {
      // selectedArea may not be a full URL; attempt to extract area manually
      const match = selectedArea.match(/[?&]area=([^&]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  }

  return record.area || '';
}

function renderSavedRecordsTable(records) {
  const tbody = document.getElementById('dashboardRecordsTableBody');
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <div class="empty-state-icon"></div>
          <p>No records found</p>
        </td>
      </tr>
    `;
    return;
  }

  const latestTimestamp = Math.max(...records.map(record => new Date(record.timestamp || 0).getTime()));
  tbody.innerHTML = records.map(record => {
    const timestamp = new Date(record.timestamp);
    const timeString = isNaN(timestamp.getTime()) ? '-' : timestamp.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const amount = parseFloat(record.grandTotal?.replace(/[₱,]/g, '') || '0') || 0;
    const isLatest = new Date(record.timestamp || 0).getTime() === latestTimestamp;
    const item = (record.items && record.items[0]) || {};
    const itemSize = formatRecordSize(record);
    const quantity = record.quantity || item.quantity || '-';
    const recordId = getRecordIdentifier(record);
    const actions = `<button class="record-action-btn" onclick="openRecord('${recordId}', 'view')">View</button>`;

    return `
      <tr class="${isLatest ? 'latest-record' : ''}">
        <td>${timeString}${isLatest ? '<span class="latest-tag">Latest</span>' : ''}</td>
        <td>${record.prDate || '-'}</td>
        <td>${(record.items && record.items[0]?.itemDescription) || record.purpose || record.selectedAreaLabel || '-'}</td>
        <td>${itemSize || '-'}</td>
        <td>${quantity}</td>
        <td>₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        <td class="action-cell">${actions}</td>
      </tr>
    `;
  }).join('');
}

async function deleteRecord(recordId) {
  if (!confirm('Are you sure you want to archive this record? It can be restored within 30 days.')) return;
  const records = getDatabaseRecords();
  const recordIndex = records.findIndex(r => getRecordIdentifier(r) === recordId);
  if (recordIndex === -1) {
    console.warn('Archive action could not find record for id:', recordId, records.map(getRecordIdentifier));
    return;
  }
  const [recordToArchive] = records.splice(recordIndex, 1);
  recordToArchive.archivedAt = new Date().toISOString();
  recordToArchive.status = 'deleted';
  recordToArchive.approvalStatus = 'deleted';
  recordToArchive.deletedBy = currentUserProfile?.displayName || currentAuthUser?.email || 'Admin';
  recordToArchive.deletedAt = new Date().toISOString();
  recordToArchive.lastModified = new Date().toISOString();
  const archived = JSON.parse(localStorage.getItem('purchaseRequestArchive') || '[]');
  archived.push(recordToArchive);
  // Persist archive locally first
  localStorage.setItem('purchaseRequestArchive', JSON.stringify(archived));

  // If record has a Firestore id and Firestore is available, persist the
  // deleted state to Firestore and only remove the active record if the
  // server update succeeds. This avoids a race where a failed server
  // update leaves the server copy in 'pending' which would later reappear
  // via the realtime listener.
  let persisted = true;
  if (recordToArchive.id && getFirestoreInstance()) {
    try {
      // Persist full record so server has the same fields as the client.
      const payload = { ...recordToArchive };
      persisted = await updatePurchaseRequestInFirestore(recordToArchive.id, payload);
    } catch (err) {
      persisted = false;
      console.warn('Failed to persist archive/delete status to Firestore:', err);
    }
  }

  if (!persisted && recordToArchive.id && getFirestoreInstance()) {
    // Revert local removal so UI matches server state and inform the user.
    records.splice(recordIndex, 0, recordToArchive);
    setDatabaseRecords(records);
    initRecords();
    applyDashboardFilters();
    alert('Failed to archive record on server. Check your connection and try again.');
    return;
  }

  // At this point either Firestore update succeeded, or the record was
  // a purely local record; remove it from active records and refresh UI.
  setDatabaseRecords(records);
  initRecords();
  initArchive();
  applyDashboardFilters();
  alert('Record archived successfully! It can be restored within 30 days from the Archive menu.');

  // Show the Archive view so the user sees the archived record immediately.
  try {
    window.location.hash = '#archive';
  } catch (e) {
    // ignore navigation errors
  }
}

async function approveRecord(recordId) {
  if (!confirm('Are you sure you want to approve this record?')) return;
  const records = getDatabaseRecords();
  const recordIndex = records.findIndex(r => getRecordIdentifier(r) === recordId);
  if (recordIndex === -1) {
    console.warn('Approve action could not find record for id:', recordId, records.map(getRecordIdentifier));
    return;
  }
  const record = records[recordIndex];
  console.log('Approving record (before):', record);
  
  const updatedRecord = normalizeRecordStatus({
    ...record,
    approvalStatus: 'approved',
    status: 'approved',
    approvalBy: currentUserProfile?.displayName || 'Admin',
    approvalAt: new Date().toISOString(),
    lastModified: new Date().toISOString()
  });
  
  console.log('Approving record (after):', updatedRecord);

  records[recordIndex] = updatedRecord;
  setDatabaseRecords(records);

    if (updatedRecord.id && getFirestoreInstance()) {
      // Persist the full record to ensure no fields are lost due to
      // partial updates or client/server merge ordering.
      try {
        await updatePurchaseRequestInFirestore(updatedRecord.id, updatedRecord);
        await notifyUserOfRequestDecision(updatedRecord, 'approved');
      } catch (err) {
        console.warn('Failed to persist full approved record to Firestore:', err);
      }
    }

  await loadNotifications();
  initRecords();
  applyDashboardFilters();
  alert('Record approved successfully. Total purchase value is updated for approved requests.');
}

async function rejectRecord(recordId) {
  if (!confirm('Are you sure you want to reject this record?')) return;
  const records = getDatabaseRecords();
  const recordIndex = records.findIndex(r => getRecordIdentifier(r) === recordId);
  if (recordIndex === -1) {
    console.warn('Reject action could not find record for id:', recordId, records.map(getRecordIdentifier));
    return;
  }
  const record = records[recordIndex];
  console.log('Rejecting record (before):', record);
  
  const updatedRecord = normalizeRecordStatus({
    ...record,
    approvalStatus: 'rejected',
    status: 'rejected',
    approvalBy: currentUserProfile?.displayName || 'Admin',
    approvalAt: new Date().toISOString(),
    lastModified: new Date().toISOString()
  });
  
  console.log('Rejecting record (after):', updatedRecord);

  records[recordIndex] = updatedRecord;
  setDatabaseRecords(records);

  if (updatedRecord.id && getFirestoreInstance()) {
    try {
      await updatePurchaseRequestInFirestore(updatedRecord.id, updatedRecord);
      await notifyUserOfRequestDecision(updatedRecord, 'rejected');
    } catch (error) {
      console.error('Error rejecting request in Firestore:', error);
    }
  }

  await loadNotifications();
  initRecords();
  applyDashboardFilters();
  alert('Record rejected successfully. It will no longer be counted as approved.');
}

function updateDashboardYearFilter(records) {
  const yearFilter = document.getElementById('dashboardYearFilter');
  if (!yearFilter) return;
  const years = new Set();
  records.forEach(record => {
    if (record.prDate) {
      try {
        years.add(new Date(record.prDate).getFullYear().toString());
      } catch (e) {}
    }
  });
  const sortedYears = Array.from(years).sort().reverse();
  yearFilter.innerHTML = '<option value="">All Years</option>' + sortedYears.map(year => `<option value="${year}">${year}</option>`).join('');
}

function applyDashboardFilters() {
  const searchValue = document.getElementById('dashboardSearchBox')?.value.toLowerCase().trim() || '';
  const monthValue = document.getElementById('dashboardMonthFilter')?.value;
  const yearValue = document.getElementById('dashboardYearFilter')?.value;
  const branchValue = document.getElementById('branchFilter')?.value.toLowerCase() || '';

  let records = getDatabaseRecords();

  // Only show approved records in "Saved PR Records" on the dashboard
  records = records.filter(record => String(record.approvalStatus || '').toLowerCase() === 'approved');

  if (branchValue) {
    records = records.filter(record => getRecordBranch(record).toLowerCase().includes(branchValue));
  }

  if (monthValue) {
    records = records.filter(record => {
      if (!record.prDate) return false;
      try {
        return (new Date(record.prDate).getMonth() + 1).toString().padStart(2, '0') === monthValue;
      } catch (e) {
        return false;
      }
    });
  }

  if (yearValue) {
    records = records.filter(record => {
      if (!record.prDate) return false;
      try {
        return new Date(record.prDate).getFullYear().toString() === yearValue;
      } catch (e) {
        return false;
      }
    });
  }

  if (searchValue) {
    records = records.filter(record => {
      const items = Array.isArray(record.items) ? record.items : [];
      const itemDescriptionMatch = items.some(item => (item.itemDescription || '').toLowerCase().includes(searchValue));
      return itemDescriptionMatch;
    });
  }

  records.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  renderSavedRecordsTable(records);
  updateSummaryCards(getDatabaseRecords());
  updateDashboardYearFilter(getDatabaseRecords());
}

function openRecord(recordId, action) {
  const record = getDatabaseRecords().find(r => getRecordIdentifier(r) === recordId);
  if (!record) return;
  if (action === 'view') {
    showPreviewModal(record);
    return;
  }

  // Open the edit form in-page without reloading to avoid re-triggering auth UI
  document.body.dataset.editPrNumber = record.prNumber;
  document.body.dataset.editRecordId = record.id || record.timestamp || '';
  document.body.dataset.editMode = 'true';
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.style.display = 'inline-block';

  // Load record data into the form and update UI to edit mode
  loadRecordIntoForm(record);
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.textContent = 'Update Record';
    saveBtn.style.background = 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)';
  }
  const formTitle = document.querySelector('.header h1');
  if (formTitle) { formTitle.textContent = 'Edit Purchase Request'; formTitle.style.color = '#ff6b35'; }

  // Navigate to the New Request section
  window.location.hash = '#new';
}

function openReportModal() {
  const modal = document.getElementById('reportModal');
  if (!modal) return;
  modal.classList.add('active');
  populateReportYearFilter();
  generateReportTable();
}

function closeReportModal() {
  const modal = document.getElementById('reportModal');
  if (!modal) return;
  modal.classList.remove('active');
}

function populateReportYearFilter() {
  let records = getDatabaseRecords();
  records = records.filter(record => String(record.approvalStatus || '').toLowerCase() === 'approved');
  const yearFilter = document.getElementById('reportYearFilter');
  if (!yearFilter) return;
  const years = new Set();
  records.forEach(record => {
    if (record.prDate) {
      try {
        years.add(new Date(record.prDate).getFullYear().toString());
      } catch (e) {}
    }
  });
  const sortedYears = Array.from(years).sort().reverse();
  yearFilter.innerHTML = '<option value="">All Years</option>' + sortedYears.map(year => `<option value="${year}">${year}</option>`).join('');
}

function generateReportTable() {
  const filterType = document.getElementById('reportFilterType')?.value;
  const yearValue = document.getElementById('reportYearFilter')?.value;
  const monthValue = document.getElementById('reportMonthFilter')?.value;
  let records = getDatabaseRecords();
  records = records.filter(record => String(record.approvalStatus || '').toLowerCase() === 'approved');

  if (yearValue) {
    records = records.filter(record => {
      if (!record.prDate) return false;
      try {
        return new Date(record.prDate).getFullYear().toString() === yearValue;
      } catch (e) {
        return false;
      }
    });
  }

  if (filterType === 'month' && monthValue) {
    records = records.filter(record => {
      if (!record.prDate) return false;
      try {
        return (new Date(record.prDate).getMonth() + 1).toString().padStart(2, '0') === monthValue;
      } catch (e) {
        return false;
      }
    });
  }

  records.sort((a, b) => new Date(a.prDate || 0) - new Date(b.prDate || 0));
  const tbody = document.getElementById('reportTableBody');
  if (!tbody) return;
  let totalAmount = 0;

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <div class="empty-state-icon"></div>
          <p>No records to show</p>
        </td>
      </tr>
    `;
    document.getElementById('reportTotal').textContent = '₱0.00';
    return;
  }

  const rows = [];
  records.forEach(record => {
    const recordDate = formatDateToLong(record.prDate) || '-';
    const items = Array.isArray(record.items) && record.items.length > 0 ? record.items : [{
      itemDescription: record.purpose || '-',
      width: record.width || '',
      height: record.height || '',
      unitMeasure: record.unitMeasure || '',
      quantity: record.quantity || '',
      totalCost: record.grandTotal || record.cost || '₱0.00'
    }];

    items.forEach(item => {
      const amount = parseFloat(String(item.totalCost || '').replace(/[₱,]/g, '')) || 0;
      totalAmount += amount;
      const itemSize = item.width && item.height && item.unitMeasure
        ? formatDimensionLabel(item.width, item.height, item.unitMeasure)
        : formatRecordSize(record);
      const quantity = item.quantity || record.quantity || '-';

      rows.push(`
        <tr style="border-bottom: 1px solid #c5d3cc;">
          <td style="padding: 10px; text-align: left; border: 1px solid #c5d3cc;">${recordDate}</td>
          <td style="padding: 10px; text-align: left; border: 1px solid #c5d3cc;">${item.itemDescription || '-'}</td>
          <td style="padding: 10px; text-align: center; border: 1px solid #c5d3cc;">${itemSize || '-'}</td>
          <td style="padding: 10px; text-align: center; border: 1px solid #c5d3cc;">${quantity}</td>
          <td style="padding: 10px; text-align: right; border: 1px solid #c5d3cc;">₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        </tr>
      `);
    });
  });

  tbody.innerHTML = rows.join('');
  document.getElementById('reportTotal').textContent = '₱' + totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

function copyReportTableToClipboard() {
  const table = document.querySelector('#reportTableContainer table');
  if (!table) {
    alert('No report table available to copy.');
    return;
  }

  const html = buildStyledReportTableHtml(table);
  const rows = Array.from(table.rows);
  const text = rows.map(row => Array.from(row.cells).map(cell => cell.innerText.trim()).join('\t')).join('\n');

  if (navigator.clipboard && window.ClipboardItem) {
    const blobHtml = new Blob([html], { type: 'text/html' });
    const blobText = new Blob([text], { type: 'text/plain' });
    const item = new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText });

    navigator.clipboard.write([item])
      .then(() => alert('Report table copied to clipboard with table formatting.'))
      .catch(() => fallbackCopy(html));
  } else {
    fallbackCopy(html);
  }
}

function buildStyledReportTableHtml(table) {
  const tableStyle = [
    'width:100%',
    'border-collapse:collapse',
    'font-family: Arial, sans-serif',
    'font-size:12px',
    'color:#1a1a1a'
  ].join(';');

  const thStyle = [
    'padding:12px 10px',
    'border:1px solid #999',
    'background:#f5f5f5',
    'color:#111',
    'font-weight:700',
    'text-transform:uppercase',
    'letter-spacing:0.03em',
    'font-size:11px',
    'text-align:center'
  ].join(';');

  const tdStyle = [
    'padding:10px',
    'border:1px solid #999',
    'vertical-align:top',
    'font-size:12px'
  ].join(';');

  const textAlignRight = 'text-align:right';
  const textAlignCenter = 'text-align:center';

  const headerCells = Array.from(table.tHead ? table.tHead.rows[0].cells : []);
  const headerTexts = headerCells.map(cell => cell.innerText.trim());
  const headings = headerTexts
    .map(text => text.toUpperCase())
    .map(text => `<th style="${thStyle}">${text}</th>`)
    .join('');

  const bodyRows = Array.from(table.tBodies[0]?.rows || [])
    .map(row => {
      const cells = Array.from(row.cells)
        .map((cell, index) => {
          let style = tdStyle;
          const header = (headerTexts[index] || '').toUpperCase();
          if (header.includes('COST') || header.includes('AMOUNT') || header.includes('₱')) {
            style += ';' + textAlignRight;
          } else if (header.includes('SIZE') || header.includes('QUANTITY')) {
            style += ';' + textAlignCenter;
          } else if (header.includes('DATE') || header.includes('NATURE') || header.includes('ITEM')) {
            style += ';text-align:left';
          }
          return `<td style="${style}">${cell.innerText.trim()}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const footerRow = table.tFoot ? Array.from(table.tFoot.rows).map(row => {
    const cells = Array.from(row.cells)
      .map((cell, index) => {
        const style = tdStyle + ';background:#f3f3f3;font-weight:700;' + (index === row.cells.length - 1 ? ';' + textAlignRight : (index < row.cells.length - 1 ? ';text-align:right' : ''));
        return `<td style="${style}">${cell.innerText.trim()}</td>`;
      })
      .join('');
    return `<tr>${cells}</tr>`;
  }).join('') : '';

  return `<table style="${tableStyle}"><thead><tr>${headings}</tr></thead><tbody>${bodyRows}</tbody>${footerRow ? `<tfoot>${footerRow}</tfoot>` : ''}</table>`;
}

function fallbackCopy(html) {
  const container = document.createElement('div');
  container.contentEditable = 'true';
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.innerHTML = html;
  document.body.appendChild(container);

  const range = document.createRange();
  range.selectNodeContents(container);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  try {
    document.execCommand('copy');
    alert('Report table copied to clipboard with table formatting.');
  } catch (err) {
    alert('Unable to copy the report table. Please try again.');
  }

  selection.removeAllRanges();
  document.body.removeChild(container);
}

// --- Prevent zooming (pinch / ctrl+wheel / keyboard) inside the left dashboard/sidebar only ---
(function disableSidebarZoom(){
  try {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Ensure touch-action is set (helps on modern touch browsers)
    sidebar.style.touchAction = sidebar.style.touchAction || 'pan-y';

    // Prevent multi-touch pinch-zoom on sidebar
    sidebar.addEventListener('touchmove', function(e){
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    }, { passive: false });

    // Prevent ctrl/cmd + wheel zoom when wheel happens over sidebar
    sidebar.addEventListener('wheel', function(e){
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    }, { passive: false });

    // Prevent keyboard zoom shortcuts when focus is inside sidebar
    document.addEventListener('keydown', function(e){
      const active = document.activeElement;
      const zoomKeys = ['+','-','=','0'];
      if (sidebar.contains(active) && (e.ctrlKey || e.metaKey) && zoomKeys.includes(e.key)) {
        e.preventDefault();
      }
    }, { passive: false });

    // iOS Safari gesture events (best-effort)
    window.addEventListener('gesturestart', function(e){
      if (e.target && sidebar.contains(e.target)) e.preventDefault();
    });
  } catch (err) {
    // fail quietly
    console.warn('disableSidebarZoom error', err);
  }
})();



function getUnifiedTemplateUrl(areaValue, areaLabel) {
  const normalizedValue = String(areaValue || areaLabel || '').trim();
  const mapping = {
    'table.html': 'table1.html?area=PhilHealth%20Regional%20Office',
    'table2.html': 'table1.html?area=LHIO%20Eastern%20Pangasinan',
    'table3.html': 'table1.html?area=LHIO%20La%20Union',
    'table4.html': 'table1.html?area=LHIO%20Ilocos%20Norte',
    'table5.html': 'table1.html?area=LHIO%20Ilocos%20Sur',
    'table6.html': 'table1.html?area=LHIO%20Western%20Pangasinan',
    'table1.html': 'table1.html?area=LHIO%20Central%20Pangasinan',
    'PhilHealth Regional Office': 'table1.html?area=PhilHealth%20Regional%20Office',
    'LHIO Eastern Pangasinan': 'table1.html?area=LHIO%20Eastern%20Pangasinan',
    'LHIO La Union': 'table1.html?area=LHIO%20La%20Union',
    'LHIO Ilocos Norte': 'table1.html?area=LHIO%20Ilocos%20Norte',
    'LHIO Ilocos Sur': 'table1.html?area=LHIO%20Ilocos%20Sur',
    'LHIO Western Pangasinan': 'table1.html?area=LHIO%20Western%20Pangasinan',
    'LHIO Central Pangasinan': 'table1.html?area=LHIO%20Central%20Pangasinan'
  };
  if (normalizedValue.includes('table1.html?area=')) {
    return normalizedValue;
  }
  if (mapping[normalizedValue]) {
    return mapping[normalizedValue];
  }
  if (normalizedValue.startsWith('table1.html')) {
    return 'table1.html?area=' + encodeURIComponent(areaLabel || 'LHIO Central Pangasinan');
  }
  return areaValue || 'view.html';
}

// Embedded HTML template for `table1.html` so preview/print works without a separate file
// This version references the workspace `style.css` and preserves input fields so
// the existing `populateViewWindow` / `printForm` code continues to work.
const TABLE1_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PR</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

<div class="document-container">
  <div class="header-image">
    <img src="assets/header.png" alt="PhilHealth Header">
  </div>
  <div class="control-number-row">
    <span id="controlNumberDisplay"></span>
  </div>
  <div class="meta-container">
    <div class="meta-content-area">
      <h1>PURCHASE REQUEST</h1>
      <div class="office-name">PhilHealth Regional Office 1</div>
      <div class="agency-tag">AGENCY</div>
      <div class="meta-row-layout">
        <div class="meta-left">
          Department: <span class="underline-input"><input type="text"></span><br>
          Section: <span class="underline-input"><input type="text"></span>
        </div>
        <div class="meta-right">
          <div class="meta-right-row">
            PR NO. <span class="underline-input compact"><span id="prNumberDisplay" class="underline-text"></span></span>
            Date: <span class="date-text compact"><span id="prDateDisplay" class="underline-text"></span></span>
          </div>
          <div class="meta-right-row">
            SAI No. <span class="underline-input compact"><span id="saiNumberDisplay" class="underline-text"></span></span>
            Date: <span class="date-text compact"><span id="saiDateDisplay" class="underline-text"></span></span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <table class="main-table">
    <thead>
      <tr>
        <th class="col-stock">Stock No.</th>
        <th class="col-unit">Unit</th>
        <th class="col-desc">Item Description</th>
        <th class="col-qty">Qty</th>
        <th class="col-ucost">Unit Cost</th>
        <th class="col-tcost">Total Cost</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td></td>
        <td style="vertical-align: top; padding-top: 8px;">pc </td>
        <td style="vertical-align: top; padding: 0;">
          <div class="description-cell">
            <div style="font-size: 9.5pt; font-weight: bold; margin: 0; padding: 8px 8px 0;" id="itemDescDisplay"></div>
            <div style="flex: 1;"></div>
            <div style="font-size: 9pt; line-height: 1.8;">
              <strong>C.O.B.:</strong> <br>
              <strong>Expense Code/s:</strong> <br>
              <strong>Charge to:</strong> <br>
              <strong>Budget Limit:</strong> <br>
              <strong>Remarks:</strong> <br>
              <div style="text-align: center; margin-top: 30px; margin-left: 15%;">
                <strong style="display: block; text-decoration: none;">Jose A. Mones</strong>
                <span>FC III/B.O. Designate</span>
              </div>
            </div>
          </div>
        </td>
        <td style="vertical-align: top; padding: 8px; border-bottom: none;"><div id="qtyDisplay" style="text-align: center; font-size: 9pt; line-height: 1.6;"></div></td>
        <td style="vertical-align: top; padding: 8px; border-bottom: none;"><div id="unitCostDisplay" style="text-align: right; font-size: 9pt; line-height: 1.6;"></div></td>
        <td style="vertical-align: top; padding: 8px; border-bottom: none;">
          <div class="total-cell-content">
            <div id="totalCostDisplay" style="text-align: right; font-size: 9pt; line-height: 1.6;"></div>
            <div style="text-align: right; padding: 8px; font-weight: bold; font-size: 9.5pt;"><div id="grandTotalDisplay">₱0.00</div></div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="4" class="purpose-cell">
          Purpose: To be used as tarpaulin backdrop/banner stand for PhilHealth marketing activities/events.<br>
          To be used for: PRO 1 Advocacies and Marketing Activities
        </td>
        <td colspan="2" class="on-cell">
          <span id="onDateDisplay" style="margin-left: 0;">May 19, 2026</span>
        </td>
      </tr>
    </tbody>
  </table>

  <table class="sig-table">
    <tr>
      <td class="sig-label"></td>
      <td>Requested by:</td>
      <td>Recommended by:</td>
      <td>Approved by:</td>
    </tr>
    <tr class="sig-height">
      <td class="sig-label">Signature</td>
      <td></td>
      <td></td>
      <td></td>
    </tr>
    <tr class="name-row">
      <td class="sig-label">Printed Name</td>
      <td>JOSEPH A. MANUEL</td>
      <td>CHESTER JOSEPH C. CANTO</td>
      <td>CYNTHIA S. SANTOS, DPA</td>
    </tr>
    <tr class="designation-row">
      <td class="sig-label">Designation</td>
      <td>PRO III/Head, Public Affairs Unit</td>
      <td>Head, GSU</td>
      <td>Head, MSD</td>
    </tr>
  </table>

  <div class="footer-metadata">
    Delivery Period:<br>
    Reference Number:<br>
    Posting Period:
  </div>
</div>

<!-- Header image changer script - runs before main script.js -->
<script>
  (function() {
  const params = new URLSearchParams(window.location.search);
  const area = window.PR_OFFICE || params.get('area') || '';
  const headerMap = {
    'PhilHealth Regional Office': 'assets/header.png',
    'LHIO Central Pangasinan': 'assets/Central Pangasinan Header.png',
    'LHIO Eastern Pangasinan': 'assets/Eastern Pangasinan Header.png',
    'LHIO Western Pangasinan': 'assets/Western Pangasinan Header.png',
    'LHIO Ilocos Norte': 'assets/Ilocos Norte header.png',
    'LHIO Ilocos Sur': 'assets/Ilocos Sur Header.png',
    'LHIO La Union': 'assets/La Union.png'
  };
  const headerImg = document.querySelector('.header-image img');
  if (headerImg && headerMap[area]) {
    headerImg.src = headerMap[area];
  }
  })();
</script>
</body>
</html>`;

function showPreviewModal(record) {
  // Open the selected LHIO template; fallback to embedded template when table1.html is requested.
  const targetTemplate = getUnifiedTemplateUrl(record.selectedArea, record.selectedAreaLabel || record.area);
  // If the target is the old table1 template, write the embedded HTML into the new window so no separate file is required.
  if (targetTemplate && targetTemplate.includes('table1.html')) {
    const viewWindow = window.open('', 'PRPreview', 'width=1000,height=800,scrollbars=yes');
    if (!viewWindow) {
      alert('Unable to open preview window. Please allow popups for this site and try again.');
      return;
    }
    try {
      viewWindow.document.open();
      const previewOffice = record.selectedAreaLabel || getRecordBranch(record) || currentUserProfile?.office || 'PhilHealth Regional Office';
      const injectedHeaderScript = `\n  <script>window.PR_OFFICE = ${JSON.stringify(previewOffice)};</script>`;
      viewWindow.document.write(TABLE1_HTML.replace('<!-- Header image changer script - runs before main script.js -->', injectedHeaderScript));
      viewWindow.document.close();

      let checkCount = 0;
      const checkInterval = setInterval(function() {
        try {
          if (viewWindow && viewWindow.document && viewWindow.document.body) {
            clearInterval(checkInterval);
            populateViewWindow(viewWindow, record);
          }
          checkCount++;
          if (checkCount > 50) clearInterval(checkInterval);
        } catch (e) {
          // Window might not be accessible yet
        }
      }, 100);
    } catch (err) {
      console.error('Preview open error', err);
      alert('Unable to open preview window.');
    }
    return;
  }

  // Default behavior for other templates
  const viewWindow = window.open(targetTemplate, 'PRPreview', 'width=1000,height=800,scrollbars=yes');
  if (!viewWindow) {
    alert('Unable to open preview window. Please allow popups for this site and try again.');
    return;
  }
  
  // Wait for the window document to be ready
  let checkCount = 0;
  const checkInterval = setInterval(function() {
    try {
      if (viewWindow && viewWindow.document && viewWindow.document.body) {
        clearInterval(checkInterval);
        populateViewWindow(viewWindow, record);
      }
      checkCount++;
      if (checkCount > 50) clearInterval(checkInterval);
    } catch (e) {
      // Window might not be accessible yet
    }
  }, 100);
}

function populateViewWindow(viewWindow, record) {
  const doc = viewWindow.document;
  
  // Populate metadata fields
  const departmentInputs = doc.querySelectorAll('.underline-input input');
  if (departmentInputs[0]) departmentInputs[0].value = resolveDepartmentLabel(record.department || record.departmentCode) || '';
  if (departmentInputs[1]) departmentInputs[1].value = record.section || '';
  
  // Populate PR and SAI display fields
  const prNumberEl = doc.getElementById('prNumberDisplay');
  const saiNumberEl = doc.getElementById('saiNumberDisplay');
  const prDateEl = doc.getElementById('prDateDisplay');
  const saiDateEl = doc.getElementById('saiDateDisplay');
  if (prNumberEl) prNumberEl.textContent = record.prNumber || '';
  if (saiNumberEl) saiNumberEl.textContent = record.saiNumber || '';
  if (prDateEl) prDateEl.textContent = record.prDate || '';
  if (saiDateEl) saiDateEl.textContent = '';
  
  // Populate items
  let itemDescDisplay = '';
  let qtyDisplay = '';
  let unitCostDisplay = '';
  let totalCostDisplay = '';
  let totalAmount = 0;
  
  if (record.items && Array.isArray(record.items)) {
    record.items.forEach(item => {
      const itemTotal = parseFloat(item.totalCost.replace(/[₱,]/g, '')) || 0;
      totalAmount += itemTotal;
      itemDescDisplay += `${item.itemDescription || ''} (${formatDimensionLabel(item.width, item.height, item.unitMeasure)})<br>`;
      qtyDisplay += `${item.quantity || ''}<br>`;
      unitCostDisplay += `${item.unitCost || ''}<br>`;
      totalCostDisplay += `${item.totalCost || ''}<br>`;
    });
  }
  
  const itemDescEl = doc.getElementById('itemDescDisplay');
  const qtyEl = doc.getElementById('qtyDisplay');
  const unitCostEl = doc.getElementById('unitCostDisplay');
  const totalCostEl = doc.getElementById('totalCostDisplay');
  const grandTotalEl = doc.getElementById('grandTotalDisplay');
  const controlNumberEl = doc.getElementById('controlNumberDisplay');
  const onDateEl = doc.getElementById('onDateDisplay');
  
  if (itemDescEl) itemDescEl.innerHTML = itemDescDisplay;
  if (qtyEl) qtyEl.innerHTML = qtyDisplay;
  if (unitCostEl) unitCostEl.innerHTML = unitCostDisplay;
  if (totalCostEl) totalCostEl.innerHTML = totalCostDisplay;
  if (grandTotalEl) grandTotalEl.textContent = formatCurrency(totalAmount);
  if (controlNumberEl) controlNumberEl.textContent = record.controlNumber || '';
  if (onDateEl) onDateEl.textContent = record.prDate || '';
  
  if (record.footerVisible) {
    const footerDiv = doc.createElement('div');
    footerDiv.className = 'footer-container';
    footerDiv.setAttribute('style', 'display: block !important; position: absolute !important; bottom: 0.25in !important; left: 0.25in !important; width: auto !important; max-width: 300px !important; height: auto !important; background: transparent !important;');
    footerDiv.innerHTML = '<img src="assets/footer.png" alt="Footer" class="footer-image" style="display: block !important; max-width: 300px !important; height: auto !important; margin: 0 !important;" />';
    
    const docContainer = doc.querySelector('.document-container');
    if (docContainer) {
      docContainer.appendChild(footerDiv);
    } else {
      doc.body.appendChild(footerDiv);
    }
  }
  
  // Populate purpose
  const purposeCell = doc.querySelector('.purpose-cell');
  if (purposeCell) {
    purposeCell.innerHTML = `
      Purpose: ${record.purpose || 'To be used as tarpaulin backdrop/banner stand for PhilHealth marketing activities/events.'}<br>
      To be used for: PhilHealth Activities
    `;
  }
  
  // Populate signature section
  const sigTable = doc.querySelector('.sig-table');
  if (sigTable) {
    const rows = sigTable.querySelectorAll('tr');
    
    // Row 0: Header row - ensure "Requested by:" is there
    if (rows[0]) {
      const headerCells = rows[0].querySelectorAll('td');
      if (headerCells[1]) headerCells[1].textContent = 'Requested by:';
      if (headerCells[2]) headerCells[2].textContent = 'Recommended by:';
      if (headerCells[3]) headerCells[3].textContent = 'Approved by:';
    }
    
    // Row 2: Printed Name row
    if (rows[2]) {
      const nameCells = rows[2].querySelectorAll('td');
      if (nameCells[1]) nameCells[1].textContent = record.requestedByName || '';
      if (nameCells[2]) nameCells[2].textContent = record.recommendedByName || '';
      if (nameCells[3]) nameCells[3].textContent = record.approvedByName || '';
    }
    
    // Row 3: Designation row
    if (rows[3]) {
      const desCells = rows[3].querySelectorAll('td');
      if (desCells[1]) desCells[1].textContent = record.requestedByDesignation || '';
      if (desCells[2]) desCells[2].textContent = record.recommendedByDesignation || '';
      if (desCells[3]) desCells[3].textContent = record.approvedByDesignation || '';
    }
  }
}

async function exportForm() {
  try {
    // Validate area selection
    const selectedArea = getUnifiedTemplateUrl(
      document.getElementById('selectArea').value,
      document.getElementById('selectArea').options[document.getElementById('selectArea').selectedIndex].text
    );
    if (!selectedArea) {
      alert('Please select an area first!');
      return;
    }

    const items = [];
    const rows = itemsTableBody.querySelectorAll('.item-row');
    rows.forEach(row => {
      const itemDesc = row.querySelector('.itemDescription').value;
      const width = row.querySelector('.width-input').value;
      const height = row.querySelector('.height-input').value;
      const unit = row.querySelector('.unitMeasure-select').value;
      const unitMap = { 'ft': 'feet', 'in': 'inches', 'cm': 'cm', 'm': 'meters' };
      const unitLabel = unitMap[unit] || 'feet';
      const formattedDescription = `${itemDesc} (W ${width} x H ${height} ${unitLabel})`;
      
      items.push({
        description: formattedDescription,
        quantity: row.querySelector('.quantity-input').value,
        unitCost: row.querySelector('.unitCost-input').value,
        totalCost: row.querySelector('.totalCost-input').value
      });
    });

    // Calculate grand total directly from items
    let grandTotalAmount = 0;
    items.forEach(item => {
      const totalCostValue = parseFloat(item.totalCost.replace(/[₱,]/g, '')) || 0;
      grandTotalAmount += totalCostValue;
    });
    const calculatedGrandTotal = formatCurrency(grandTotalAmount);

    const formData = {
      prNumber: cleanPrNumber(prNumberInput.value),
      prDate: prDateInput.value,
      department: departmentSelect.options[departmentSelect.selectedIndex]?.text || departmentSelect.value,
      section: sectionSelect.value,
      saiNumber: document.getElementById('saiNumber').value,
      items: items,
      purpose: document.getElementById('purpose').value,
      requestedByName: document.getElementById('requestedByName').value,
      requestedByDesignation: document.getElementById('requestedByDesignation').value,
      recommendedByName: document.getElementById('recommendedByName').value,
      recommendedByDesignation: document.getElementById('recommendedByDesignation').value,
      approvedByName: document.getElementById('approvedByName').value,
      approvedByDesignation: document.getElementById('approvedByDesignation').value,
      grandTotal: calculatedGrandTotal
    };

    const docxBlob = await generateProfessionalDocx(formData);
    
    // Download DOCX file using FileSaver
    const safePr = cleanPrNumber(prNumberInput.value).trim();
    const fileName = safePr ? `PR-${safePr}.docx` : 'PR.docx';
    saveAs(docxBlob, fileName);
    
    alert('Document exported successfully!');
  } catch (err) {
    console.error(err);
    alert('Unable to export document: ' + err.message);
  }
}

async function generateProfessionalDocx(data) {
  const docxContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing">
  <w:body>
    <!-- Title -->
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:line="240"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
        <w:t>PURCHASE REQUEST</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:line="240"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:u w:val="single"/></w:rPr>
        <w:t>PhilHealth Regional Office 1</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:line="240" w:after="240"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/></w:rPr>
        <w:t>AGENCY</w:t>
      </w:r>
    </w:p>

    <!-- Metadata Section -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9144" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="none"/>
          <w:left w:val="none"/>
          <w:bottom w:val="none"/>
          <w:right w:val="none"/>
          <w:insideH w:val="none"/>
          <w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4572" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>Department: ${data.department}</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4572" w:type="dxa"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>PR No. ${data.prNumber}     Date: ${data.prDate}</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="4572" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>Section: ${data.section}</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:tcPr><w:tcW w:w="4572" w:type="dxa"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>SAI No. ${data.saiNumber}</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>

    <!-- Main Items Table -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9144" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>
        <w:trPr><w:trHeight w:val="400" w:type="atLeast"/></w:trPr>
        <w:tc><w:tcPr><w:tcW w:w="1220" w:type="dxa"/><w:shd w:fill="E8E8E8"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Stock No.</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="820" w:type="dxa"/><w:shd w:fill="E8E8E8"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Unit</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3650" w:type="dxa"/><w:shd w:fill="E8E8E8"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Item Description</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="820" w:type="dxa"/><w:shd w:fill="E8E8E8"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Qty</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1220" w:type="dxa"/><w:shd w:fill="E8E8E8"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Unit Cost</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1414" w:type="dxa"/><w:shd w:fill="E8E8E8"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Total Cost</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:trPr><w:trHeight w:val="2000" w:type="atLeast"/></w:trPr>
        <w:tc><w:tcPr><w:tcW w:w="1220" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="820" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr><w:p><w:r><w:t>pc</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3650" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr><w:p><w:r><w:t>${data.items && data.items.length > 0 ? data.items.map(item => item.description).join('<w:br/>') : ''}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="820" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${data.items && data.items.length > 0 ? data.items.map(item => item.quantity).join('<w:br/>') : ''}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1220" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>${data.items && data.items.length > 0 ? data.items.map(item => item.unitCost).join('<w:br/>') : ''}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1414" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>${data.items && data.items.length > 0 ? data.items.map(item => item.totalCost).join('<w:br/>') : ''}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="5690" w:type="dxa"/><w:gridSpan w:val="3"/></w:tcPr>
          <w:p><w:r><w:t></w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:tcPr><w:tcW w:w="820" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t></w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1414" w:type="dxa"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${data.grandTotal}</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="5690" w:type="dxa"/><w:gridSpan w:val="3"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Purpose: </w:t></w:r><w:r><w:t>${data.purpose}</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3454" w:type="dxa"/><w:gridSpan w:val="3"/></w:tcPr>
          <w:p><w:r><w:t></w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>

    <!-- Signature Section -->
    <w:p><w:pPr><w:spacing w:line="240" w:before="240"/></w:pPr></w:p>
    
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9144" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="12" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="12" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="1828" w:type="dxa"/></w:tcPr><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2439" w:type="dxa"/><w:shd w:fill="E8E8E8"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Requested by</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2439" w:type="dxa"/><w:shd w:fill="E8E8E8"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Recommended by</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2438" w:type="dxa"/><w:shd w:fill="E8E8E8"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Approved by</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:trPr><w:trHeight w:val="1200" w:type="atLeast"/></w:trPr>
        <w:tc><w:tcPr><w:tcW w:w="1828" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr><w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Signature</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2439" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2439" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2438" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="1828" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Printed Name</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2439" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${data.requestedByName}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2439" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${data.recommendedByName}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2438" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${data.approvedByName}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="1828" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Designation</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2439" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${data.requestedByDesignation}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2439" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${data.recommendedByDesignation}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2438" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${data.approvedByDesignation}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

  const zip = new JSZip();
  
  // Create DOCX structure
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/document.xml', docxContent);
  
  return zip.generateAsync({type: 'blob'});
}

function convertToFeet(value, unit) {
  switch (unit) {
    case 'ft':
      return value;
    case 'in':
      return (value / 12).toFixed(2);
    case 'cm':
      return (value / 30.48).toFixed(2);
    case 'm':
      return (value * 3.28084).toFixed(2);
    default:
      return value;
  }
}

async function printForm() {
  try {
    const selectedArea = getUnifiedTemplateUrl(
      document.getElementById('selectArea').value,
      document.getElementById('selectArea').options[document.getElementById('selectArea').selectedIndex].text
    );
    if (!selectedArea) {
      alert('Please select an area first!');
      return;
    }

    // Show conversion confirmation dialog
    const confirmConversion = confirm('All measurements will be automatically converted to feet in the final output. Do you want to proceed?');
    if (!confirmConversion) return;

    let template = '';
    if (selectedArea && selectedArea.includes('table1.html')) {
      const previewOffice = isAdminUser()
        ? document.getElementById('selectArea').options[document.getElementById('selectArea').selectedIndex].text
        : getAssignedOfficeLabel();
      template = TABLE1_HTML.replace(
        '<!-- Header image changer script - runs before main script.js -->',
        `\n  <script>window.PR_OFFICE = ${JSON.stringify(previewOffice)};</script>`
      );
    } else {
      const res = await fetch(selectedArea);
      if (!res.ok) throw new Error('Failed to load print template');
      template = await res.text();
    }

    // If the footer was enabled on the main form, inject it into the print template
    try {
      if (sessionStorage.getItem('footerVisible') === 'true') {
        const footerHtml = `\n  <div class="footer-container">\n    <img src="assets/footer.png" alt="Footer" class="footer-image" />\n  </div>\n`;
        if (template.includes('</div>\n\n<!-- Header image changer script - runs before main script.js -->')) {
          template = template.replace('</div>\n\n<!-- Header image changer script - runs before main script.js -->', footerHtml + '</div>\n\n<!-- Header image changer script - runs before main script.js -->');
        } else if (template.includes('</body>')) {
          template = template.replace('</body>', footerHtml + '\n</body>');
        } else {
          template += footerHtml;
        }
      }
    } catch (e) {
      console.error('Footer injection failed', e);
    }

    // Collect all items with conversion to feet
    const items = [];
    const rows = itemsTableBody.querySelectorAll('.item-row');
    rows.forEach(row => {
      const itemDesc = row.querySelector('.itemDescription').value;
      const width = row.querySelector('.width-input').value;
      const height = row.querySelector('.height-input').value;
      const unit = row.querySelector('.unitMeasure-select').value;

      // Convert dimensions to feet for display
      const widthInFeet = convertToFeet(Number(width), unit);
      const heightInFeet = convertToFeet(Number(height), unit);

      const formattedDescription = `${itemDesc} (W ${widthInFeet} x H ${heightInFeet} feet)`;

      items.push({
        description: formattedDescription,
        quantity: row.querySelector('.quantity-input').value,
        unitCost: row.querySelector('.unitCost-input').value,
        totalCost: row.querySelector('.totalCost-input').value
      });
    });

    // Build all items display with properly aligned horizontal line separators
    const allItemsDisplay = items.map((item) => {
      return `<div style="margin-bottom: 4px; line-height: 1.4;">${item.description}</div>`;
    }).join('');
    
    const allQtyDisplay = items.map((item) => {
      return `<div style="margin-bottom: 4px; line-height: 1.4;">${item.quantity}</div>`;
    }).join('');
    
    const allUnitCostDisplay = items.map((item) => {
      return `<div style="margin-bottom: 4px; line-height: 1.4;">${item.unitCost}</div>`;
    }).join('');
    
    const allTotalCostDisplay = items.map((item) => {
      return `<div style="margin-bottom: 4px; line-height: 1.4;">${item.totalCost}</div>`;
    }).join('');

    // Calculate grand total directly from items to ensure accuracy
    let grandTotalAmount = 0;
    items.forEach((item, idx) => {
      // Parse the total cost more robustly
      let costStr = String(item.totalCost || '0').trim();
      // Remove currency symbol, commas, and other non-numeric characters except decimal point
      costStr = costStr.replace(/[^\d.]/g, '');
      const totalCostValue = parseFloat(costStr) || 0;
      console.log(`Item ${idx}: "${item.totalCost}" -> "${costStr}" -> ${totalCostValue}`);
      grandTotalAmount += totalCostValue;
    });
    console.log('Grand Total Amount:', grandTotalAmount);
    const calculatedGrandTotal = formatCurrency(grandTotalAmount);
    console.log('Calculated Grand Total:', calculatedGrandTotal);

    const formData = {
      prNumber: cleanPrNumber(prNumberInput.value),
      prDate: formatDateToLong(prDateInput.value),
      department: departmentSelect.options[departmentSelect.selectedIndex]?.text || departmentSelect.value,
      section: sectionSelect.value,
      saiNumber: document.getElementById('saiNumber').value,
      items: items,
      allItemsDisplay: allItemsDisplay,
      allQtyDisplay: allQtyDisplay,
      allUnitCostDisplay: allUnitCostDisplay,
      allTotalCostDisplay: allTotalCostDisplay,
      purpose: document.getElementById('purpose').value,
      requestedByName: document.getElementById('requestedByName').value,
      recommendedByName: document.getElementById('recommendedByName').value,
      approvedByName: document.getElementById('approvedByName').value,
      grandTotal: calculatedGrandTotal
    };

    const newWin = window.open('', '_blank');
    const dataScript = `<script>\n(function(){\n  const data = ${JSON.stringify(formData)};\n  console.log('Print window data:', data);\n  console.log('Grand Total in print:', data.grandTotal);\n  function applyData(){\n    try{\n      const metaLeft = document.querySelectorAll('.meta-left input');\n      if(metaLeft[0]) metaLeft[0].value = data.department || '';\n      if(metaLeft[1]) metaLeft[1].value = data.section || '';\n\n      const prDateSpan = document.getElementById('prDateDisplay');\n      const saiDateSpan = document.getElementById('saiDateDisplay');\n      if(prDateSpan) prDateSpan.textContent = data.prDate || '';\n      if(saiDateSpan) saiDateSpan.textContent = '';\n\n      if(data.items && data.items.length > 0) {\n        const itemDescDisplay = document.getElementById('itemDescDisplay');\n        if(itemDescDisplay) itemDescDisplay.innerHTML = data.allItemsDisplay || '';\n        \n        const qtyDisplay = document.getElementById('qtyDisplay');\n        if(qtyDisplay) qtyDisplay.innerHTML = data.allQtyDisplay || '';\n        \n        const unitCostDisplay = document.getElementById('unitCostDisplay');\n        if(unitCostDisplay) unitCostDisplay.innerHTML = data.allUnitCostDisplay || '';\n        \n        const totalCostDisplay = document.getElementById('totalCostDisplay');\n        if(totalCostDisplay) totalCostDisplay.innerHTML = data.allTotalCostDisplay || '';\n      }\n      \n      const grandTotalDisplay = document.getElementById('grandTotalDisplay');\n      if(grandTotalDisplay) {\n        console.log('Setting grandTotalDisplay to:', data.grandTotal);\n        grandTotalDisplay.textContent = data.grandTotal || '₱0.00';\n      }\n      \n      const onDateDisplay = document.getElementById('onDateDisplay');\n      if(onDateDisplay) onDateDisplay.textContent = data.prDate || '';\n\n      const purposeCell = document.querySelector('.purpose-cell');\n      if(purposeCell) purposeCell.innerHTML = 'Purpose: ' + (data.purpose || '');\n\n      const nameRow = document.querySelectorAll('.sig-table .name-row td');\n      if(nameRow[1]) nameRow[1].textContent = data.requestedByName || nameRow[1].textContent;\n      if(nameRow[2]) nameRow[2].textContent = data.recommendedByName || nameRow[2].textContent;\n      if(nameRow[3]) nameRow[3].textContent = data.approvedByName || nameRow[3].textContent;\n    }catch(e){console.error('Error:', e);};\n  }\n  if(document.readyState === 'complete') applyData(); else window.addEventListener('load', applyData);\n  window.addEventListener('load', function(){ setTimeout(function(){ window.focus(); window.print(); }, 300); });\n})();<\/script>`;

    const extraScript = `<script>
(function(){
  function applyExtra(){
    try{
      const prEl = document.getElementById('prNumberDisplay');
      const saiEl = document.getElementById('saiNumberDisplay');
      const prDateSpan = document.getElementById('prDateDisplay');
      const saiDateSpan = document.getElementById('saiDateDisplay');
      if(prEl) prEl.textContent = ${JSON.stringify(formData.prNumber)} || '';
      if(saiEl) saiEl.textContent = ${JSON.stringify(formData.saiNumber)} || '';
      if(prDateSpan) prDateSpan.textContent = ${JSON.stringify(formData.prDate)} || '';
      if(saiDateSpan) saiDateSpan.textContent = '';
    }catch(e){console.error(e);} 
  }
  if(document.readyState === 'complete') applyExtra(); else window.addEventListener('load', applyExtra);
})();
<\/script>`;

    newWin.document.open();
    newWin.document.write(template + dataScript + extraScript);
    newWin.document.close();
  } catch (err) {
    console.error(err);
    alert('Unable to open print template: ' + err.message);
  }
}

function handleRecordAction(event) {
  // This function is deprecated. Record actions are now handled in the dashboard.
  // Kept for backward compatibility.
  return;
}

function editRecord(recordId) {
  const records = getDatabaseRecords();
  const record = records.find(r => getRecordIdentifier(r) === recordId);
  if (!record) {
    alert('Record not found!');
    return;
  }

  // Load the record into the form
  loadRecordIntoForm(record);

  // Set edit mode flag
  document.body.dataset.editMode = 'true';
  document.body.dataset.editPrNumber = record.prNumber;
  document.body.dataset.editRecordId = record.id || record.timestamp || '';

  // Change save button text to indicate editing
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.textContent = 'Update Record';
  saveBtn.style.background = 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)';

  // Show cancel edit button
  const cancelBtn = document.getElementById('cancelEditBtn');
  cancelBtn.style.display = 'inline-block';

  // Scroll to top of form
  document.querySelector('.container').scrollIntoView({ behavior: 'smooth' });

  // Add visual indicator that we're in edit mode
  const formTitle = document.querySelector('.header h1');
  if (formTitle) {
    formTitle.textContent = 'Edit Purchase Request';
    formTitle.style.color = '#ff6b35';
  }
}

function resetEditMode() {
  // Reset edit mode flags
  delete document.body.dataset.editMode;
  delete document.body.dataset.editPrNumber;
  delete document.body.dataset.controlNumber;
  delete document.body.dataset.approvalStatus;

  // Reset save button
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.textContent = 'Save';
  saveBtn.style.background = '';

  // Hide cancel edit button
  const cancelBtn = document.getElementById('cancelEditBtn');
  cancelBtn.style.display = 'none';

  // Reset form title
  const formTitle = document.querySelector('.header h1');
  if (formTitle) {
    formTitle.textContent = 'Purchase Request Form';
    formTitle.style.color = '';
  }

  // Clear PR number field for next entry
  prNumberInput.value = '';
}

function loadRecordIntoForm(record) {
  // Load basic form fields
  document.getElementById('prNumber').value = '';
  document.getElementById('prDate').value = record.prDate || '';
  let departmentCode = record.departmentCode || record.department || '';
  if (departmentCode && !DEPARTMENT_LABELS[departmentCode]) {
    departmentCode = resolveDepartmentCode(departmentCode);
  }

  const departmentSelectEl = document.getElementById('department');
  document.getElementById('department').value = departmentCode;
  if (departmentCode && departmentSelectEl && !Array.from(departmentSelectEl.options).some(opt => opt.value === departmentCode)) {
    const customOption = document.createElement('option');
    customOption.value = departmentCode;
    customOption.textContent = resolveDepartmentLabel(record.department || departmentCode);
    departmentSelectEl.appendChild(customOption);
  }
  updateSectionOptions();
  document.getElementById('section').value = record.section || '';
  document.getElementById('agency').value = record.agency || '';
  document.getElementById('saiNumber').value = record.saiNumber || '';
  document.getElementById('purpose').value = record.purpose || '';
  document.getElementById('requestedBySignature').value = record.requestedBySignature || '';
  document.getElementById('requestedByName').value = record.requestedByName || '';
  document.getElementById('requestedByDesignation').value = record.requestedByDesignation || '';
  document.getElementById('recommendedBySignature').value = record.recommendedBySignature || '';
  document.getElementById('recommendedByName').value = record.recommendedByName || '';
  document.getElementById('recommendedByDesignation').value = record.recommendedByDesignation || '';
  document.getElementById('approvedBySignature').value = record.approvedBySignature || '';
  document.getElementById('approvedByName').value = record.approvedByName || '';
  document.getElementById('approvedByDesignation').value = record.approvedByDesignation || '';
  document.getElementById('selectArea').value = record.selectedArea || record.area || '';
  document.body.dataset.controlNumber = record.controlNumber || '';
  document.body.dataset.approvalStatus = record.approvalStatus || 'pending';

  // Ensure the saved LHIO selection is visible to the user when editing.
  // If the saved value isn't present in the select options (older records or custom values),
  // add it so the user can see and optionally change it.
  const selectAreaEl = document.getElementById('selectArea');
  const desiredValue = record.selectedArea || record.area || '';
  const desiredLabel = record.selectedAreaLabel || record.area || '';
  if (desiredValue) {
    let found = false;
    for (let i = 0; i < selectAreaEl.options.length; i++) {
      if (selectAreaEl.options[i].value === desiredValue) {
        found = true;
        break;
      }
    }
    if (!found) {
      const opt = document.createElement('option');
      opt.value = desiredValue;
      opt.textContent = desiredLabel || desiredValue;
      // Append so it shows in the dropdown and select it
      selectAreaEl.appendChild(opt);
    }
    selectAreaEl.value = desiredValue;
    // Make sure area select is enabled in edit mode so user may change it
    selectAreaEl.disabled = false;
  }

  // Load price per sq ft first so edit loads with the stored rate
  document.getElementById('pricePerSqFt').value = record.pricePerSqFt || '15';

  // Load items
  const itemsContainer = document.getElementById('itemsTableBody');
  itemsContainer.innerHTML = '';
  if (record.items && record.items.length > 0) {
    record.items.forEach((item, index) => {
      const row = document.createElement('tr');
      row.className = 'item-row';
      row.innerHTML = `
        <td class="center">-</td>
        <td>
          <input type="text" class="unit-input" value="${item.unit || 'pc'}" />
        </td>
        <td colspan="2">
          <div class="details-row">
            <div>
              <label>Item Description</label>
              <input type="text" class="itemDescription" value="${item.itemDescription || ''}" />
            </div>
            <div>
              <label>Width</label>
              <input type="number" class="width-input" value="${item.width || 2}" min="1" max="99" step="any" />
            </div>
            <div>
              <label>Height</label>
              <input type="number" class="height-input" value="${item.height || 2}" min="1" max="99" step="any" />
            </div>
            <div>
              <label>Unit of Measure</label>
              <select class="unitMeasure-select">
                <option value="ft" ${item.unitMeasure === 'ft' ? 'selected' : ''}>Feet</option>
                <option value="in" ${item.unitMeasure === 'in' ? 'selected' : ''}>Inches</option>
                <option value="cm" ${item.unitMeasure === 'cm' ? 'selected' : ''}>Centimeter</option>
                <option value="m" ${item.unitMeasure === 'm' ? 'selected' : ''}>Meter</option>
              </select>
            </div>
          </div>
        </td>
        <td>
          <input type="number" class="quantity-input" value="${item.quantity || 1}" min="1" step="1" />
        </td>
        <td>
          <input type="text" class="unitCost-input" readonly value="${item.unitCost || ''}" />
        </td>
        <td>
          <input type="text" class="totalCost-input" readonly value="${item.totalCost || ''}" />
        </td>
        <td class="center">
          <button type="button" class="delete-item-btn" style="padding: 5px 10px; background-color: #d63031; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Delete</button>
        </td>
      `;
      itemsContainer.appendChild(row);
      attachItemEventListeners(row);

      const unitSelect = row.querySelector('.unitMeasure-select');
      row.dataset.previousUnit = unitSelect.value;

      // Recompute costs for loaded items so price and size remain intact in edit mode.
      updateItemCosts(row);
    });
  }

  // Recompute totals using existing saved or derived values.
  updateGrandTotal();

  // Clear any existing preview
  const previewModal = document.getElementById('previewModal');
  if (previewModal) {
    previewModal.style.display = 'none';
  }
}

// ====== TABLE1.HTML PRINT TEMPLATE JAVASCRIPT ======
(function() {
  const params = new URLSearchParams(window.location.search);
  const area = params.get('area') || '';
  const headerMap = {
    'PhilHealth Regional Office': 'assets/header.png',
    'LHIO Central Pangasinan': 'assets/Central Pangasinan Header.png',
    'LHIO Eastern Pangasinan': 'assets/Eastern Pangasinan Header.png',
    'LHIO Western Pangasinan': 'assets/Western Pangasinan Header.png',
    'LHIO Ilocos Norte': 'assets/Ilocos Norte header.png',
    'LHIO Ilocos Sur': 'assets/Ilocos Sur Header.png',
    'LHIO La Union': 'assets/La Union.png'
  };
  const headerImg = document.querySelector('.header-image img');
  if (headerImg && headerMap[area]) {
    headerImg.src = headerMap[area];
  }
})();
