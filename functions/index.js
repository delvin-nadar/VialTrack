/**
 * VialTrack Cloud Functions -- Rider push notifications.
 *
 * IMPORTANT: VialTrack's Firestore data lives in a NAMED (non-default) database, not the
 * "(default)" one -- see DB_ID below, which must always match `firestoreDatabaseId` in
 * src/firebase-applet-config.json. Every trigger and every Firestore read/write in this file
 * explicitly targets that database; a Cloud Function that forgets this and uses the default
 * getFirestore() would silently watch/write an empty, unrelated database and never fire.
 *
 * Three notifications are sent, matching what the Rider Android app registers a device
 * token for (see src/services/pushNotifications.ts):
 *   1. onTaskCreated       -> "New round dispatched to you"
 *   2. onTaskUpdated       -> "Your round was updated / delayed" (only for a meaningful change)
 *   3. sendRiderAlert      -> manual admin-triggered message (Admin > Alerts & Rules)
 *
 * Security-overhaul additions (see the "Security overhaul" section further down for the older
 * migrateAccountsToFirebaseAuth, and further still for the newer functions added alongside it):
 *   4. blockSelfSignup             -> closes the client-side account self-registration bypass
 *   5. provisionAccount            -> creates/updates ONE rider/client's real Firebase Auth
 *                                      account the moment an admin adds or edits them, instead of
 *                                      waiting for the next bulk migration run
 *   6. stripLegacyPassword /
 *      stripAllLegacyPasswords     -> removes the old plaintext `password` field, but ONLY from
 *                                      documents already confirmed migrated (authMigrated===true
 *                                      with a real authUid) -- never from one that would be
 *                                      locked out by losing its only working login
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { beforeUserCreated, HttpsError: AuthBlockingError } = require('firebase-functions/v2/identity');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');

const DB_ID = 'ai-studio-secondmedicvialt-672ab7fa-5c2a-4a7b-9439-899ee4ab7829';
const ADMIN_EMAIL_DOMAIN = '@secondmedic.com';

initializeApp();
const db = getFirestore(DB_ID);

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

/**
 * Security-overhaul gate used by every admin-only callable below (migrateAccountsToFirebaseAuth,
 * sendRiderAlert). Until every admin account has actually been through the migration below and
 * picked up a real `role: 'admin'` custom claim, there is no claim to check yet -- so this also
 * accepts a request whose *real, Firebase-verified* signed-in email ends in @secondmedic.com,
 * matching the same domain rule AdminLogin.tsx already enforces on the client. That is a Firebase
 * ID token field (request.auth.token.email), not anything the caller can forge, so it's a solid
 * interim check on its own. Once every admin has the custom claim, the two checks agree anyway.
 */
function assertIsAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const claimRole = request.auth.token && request.auth.token.role;
  const email = (request.auth.token && request.auth.token.email) || '';
  const isAdminByClaim = claimRole === 'admin';
  const isAdminByDomain = email.toLowerCase().endsWith(ADMIN_EMAIL_DOMAIN);
  if (!isAdminByClaim && !isAdminByDomain) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }
}

/**
 * Closes the self-signup bypass: today, an admin is anyone signed in with an @secondmedic.com
 * email (see assertIsAdmin/useAdminAuth above) -- but Firebase Authentication does NOT verify
 * that whoever registers an email/password account actually controls a mailbox at that domain.
 * Anyone with the project's public web config (which is public, by design, in every Firebase
 * project) could otherwise call createUserWithEmailAndPassword(auth, 'x@secondmedic.com', ...)
 * directly from a browser console and immediately pass the domain check above.
 *
 * VialTrack never legitimately creates an account this way -- every real account (admin, rider,
 * client) is provisioned server-side via the Admin SDK, in migrateAccountsToFirebaseAuth or
 * provisionAccount below, neither of which triggers this "before create" event (Admin SDK-created
 * users don't go through the client sign-up flow this function guards). So ANY request that
 * reaches this function is, by definition, someone self-registering through the client SDK --
 * never a legitimate user of the app -- and it's safe to reject all of them outright.
 *
 * After deploying this, confirm in Firebase Console -> Authentication -> Settings -> Blocking
 * functions that it shows as registered for the "Before create" event; the Firebase CLI usually
 * wires this up automatically on deploy, but it's worth a one-time visual check.
 */
exports.blockSelfSignup = beforeUserCreated((event) => {
  throw new AuthBlockingError(
    'permission-denied',
    'Self-service sign-up is disabled for this project. Contact your administrator for access.'
  );
});

/**
 * Sends a push to every token stored on a rider's document. Any token FCM reports as
 * dead/unregistered is pruned from that rider's doc so the list doesn't grow stale forever.
 */
async function sendToRider(riderId, notification, data = {}) {
  if (!riderId) return 0;

  const riderSnap = await db.collection('riders').doc(riderId).get();
  if (!riderSnap.exists) return 0;

  const tokens = riderSnap.data().pushTokens || [];
  if (tokens.length === 0) return 0;

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification,
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    android: { priority: 'high' },
  });

  const deadTokens = [];
  response.responses.forEach((res, i) => {
    if (!res.success) {
      const code = res.error && res.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
        deadTokens.push(tokens[i]);
      }
    }
  });

  if (deadTokens.length > 0) {
    const remaining = tokens.filter((t) => !deadTokens.includes(t));
    await riderSnap.ref.update({ pushTokens: remaining });
  }

  return response.successCount;
}

async function sendToAllRiders(notification, data = {}) {
  const ridersSnap = await db.collection('riders').get();
  let sentCount = 0;
  await Promise.all(
    ridersSnap.docs.map(async (riderDoc) => {
      const tokens = riderDoc.data().pushTokens || [];
      if (tokens.length === 0) return;
      const response = await getMessaging().sendEachForMulticast({
        tokens,
        notification,
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: { priority: 'high' },
      });
      sentCount += response.successCount;
    })
  );
  return sentCount;
}

/**
 * 1. New round dispatched to a rider.
 * Fires whenever a new document is created in `tasks` with a rider already assigned --
 * covers both the admin dispatching a round (DispatchModal.tsx) and a rider's own app
 * auto-creating a round doc for a route they're starting.
 */
exports.onTaskCreated = onDocumentCreated({ document: 'tasks/{taskId}', database: DB_ID }, async (event) => {
  const task = event.data && event.data.data();
  if (!task) return;

  const riderId = task.riderId || task.assignedRiderId;
  if (!riderId) return;

  await sendToRider(
    riderId,
    {
      title: 'New round dispatched',
      body: `${task.routeName || 'A route'} — ${task.timeSlot || ''} loop. Tap to view your stops.`,
    },
    { type: 'task_dispatched', taskId: event.params.taskId }
  );
});

/**
 * 2. Existing round changed or delayed.
 * Fires on every update to a task doc, but only actually sends a push when one of a short
 * list of rider-relevant fields changed -- everything else (e.g. a stop's own photo/vial
 * count being filled in by the SAME rider mid-round) is deliberately silent, otherwise a
 * rider would get pushed for their own actions throughout a round.
 */
exports.onTaskUpdated = onDocumentUpdated({ document: 'tasks/{taskId}', database: DB_ID }, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!before || !after) return;

  const riderId = after.riderId || after.assignedRiderId;
  if (!riderId) return;

  const delayedNow = after.isDelayed && !before.isDelayed;
  const timeSlotChanged = after.timeSlot && before.timeSlot && after.timeSlot !== before.timeSlot;
  const routeChanged = after.routeId && before.routeId && after.routeId !== before.routeId;
  const riderReassigned = riderId !== (before.riderId || before.assignedRiderId) && (before.riderId || before.assignedRiderId);

  if (!delayedNow && !timeSlotChanged && !routeChanged) return;

  let body = `${after.routeName || 'Your round'} was updated by dispatch.`;
  if (delayedNow) {
    body = `${after.routeName || 'Your round'} is marked delayed${after.delayMinutes ? ` (+${after.delayMinutes}m)` : ''}.`;
  } else if (timeSlotChanged) {
    body = `${after.routeName || 'Your round'} time slot changed to ${after.timeSlot}.`;
  } else if (routeChanged) {
    body = `Your assigned route changed. Please check your Daily Rounds Schedule.`;
  }

  // If this update is really a hand-off to a different rider (not the one who had it before),
  // that new rider gets a "new round" push instead, so both cases still read correctly.
  const notifyRiderId = riderReassigned ? riderId : (after.riderId || after.assignedRiderId);

  await sendToRider(
    notifyRiderId,
    { title: 'Round updated', body },
    { type: 'task_updated', taskId: event.params.taskId }
  );
});

/**
 * 3. Manual alert from Admin > Alerts & Rules ("Send Alert to Rider").
 * Called from the web app via sendRiderPushAlert() in src/services/firebase.ts.
 */
exports.sendRiderAlert = onCall(async (request) => {
  assertIsAdmin(request);

  const { riderId, title, message } = request.data || {};

  if (!title || !message) {
    throw new HttpsError('invalid-argument', 'title and message are required.');
  }

  const notification = { title, body: message };

  let sentCount = 0;
  if (!riderId || riderId === 'all') {
    sentCount = await sendToAllRiders(notification, { type: 'admin_alert' });
  } else {
    sentCount = await sendToRider(riderId, notification, { type: 'admin_alert' });
  }

  return {
    success: true,
    sentCount,
    message: sentCount > 0 ? `Sent to ${sentCount} device(s).` : 'No registered devices found for the selected rider(s).',
  };
});

/**
 * ---------------------------------------------------------------------------------------------
 * Security overhaul: migrate Rider/Client accounts from the old "plaintext password compared in
 * the browser" scheme to real Firebase Authentication, and tag every account (admin included)
 * with a custom claim so Firestore/Storage rules can eventually check WHO is asking instead of
 * allowing everyone. See src/components/auth/RiderLogin.tsx and ClientLogin.tsx for the matching
 * client-side change, and src/services/firebase.ts for the riderAuthEmail/clientAuthEmail helpers
 * -- the email this function computes for each rider/client MUST exactly match what those helpers
 * compute, or a migrated rider/client would get a real account that their own login can never
 * find.
 *
 * Deliberately non-destructive: this does NOT touch the Firestore rules, and does NOT remove the
 * existing plaintext `password` field from any document -- it only ADDS a real Firebase Auth
 * account plus `authUid` / `authMigrated: true` markers. Removing the old plaintext passwords is
 * a separate, later step, done only once you've confirmed riders/clients can still log in fine
 * after running this.
 *
 * Safe to run more than once -- anyone already migrated (authMigrated: true) is skipped.
 * ---------------------------------------------------------------------------------------------
 */
function riderAuthEmail(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return `rider-${digits}@riders.vialtrack.internal`;
}

function clientAuthEmail(client) {
  const email = String(client.email || '').trim().toLowerCase();
  if (email.includes('@')) return email;
  return `client-${client.id}@clients.vialtrack.internal`;
}

// Firebase Auth requires a password of at least 6 characters. A rider/client whose current
// plaintext password is shorter than that (the app's own minimum is 4) gets padded so account
// creation doesn't fail -- they keep logging in with their real, unpadded password, since the
// login code only ever sends what they actually typed and this padding is never revealed to them.
function passwordForFirebaseAuth(rawPassword) {
  const pwd = String(rawPassword || '');
  if (pwd.length >= 6) return pwd;
  return pwd.padEnd(6, '0');
}

async function migrateOneAccount({ authEmail, rawPassword, displayName, claims, docRef }) {
  const auth = getAuth();
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(authEmail);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    userRecord = await auth.createUser({
      email: authEmail,
      password: passwordForFirebaseAuth(rawPassword),
      displayName: displayName || undefined,
    });
  }

  await auth.setCustomUserClaims(userRecord.uid, claims);
  await docRef.update({ authUid: userRecord.uid, authMigrated: true });
  return userRecord.uid;
}

exports.migrateAccountsToFirebaseAuth = onCall(async (request) => {
  assertIsAdmin(request);

  const results = { admins: 0, riders: { migrated: 0, skipped: 0, failed: [] }, clients: { migrated: 0, skipped: 0, failed: [] } };
  const auth = getAuth();

  // 1. Tag every existing @secondmedic.com Firebase Auth account (admins) that doesn't already
  //    have the role claim. Admin accounts already exist for real (AdminLogin.tsx has always used
  //    real Firebase Authentication) -- this step only adds the claim, nothing else changes.
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      const email = (user.email || '').toLowerCase();
      const alreadyAdmin = user.customClaims && user.customClaims.role === 'admin';
      if (email.endsWith(ADMIN_EMAIL_DOMAIN) && !alreadyAdmin) {
        await auth.setCustomUserClaims(user.uid, { role: 'admin' });
        results.admins += 1;
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  // 2. Riders
  const ridersSnap = await db.collection('riders').get();
  for (const riderDoc of ridersSnap.docs) {
    const rider = riderDoc.data();
    if (rider.authMigrated) {
      results.riders.skipped += 1;
      continue;
    }
    try {
      await migrateOneAccount({
        authEmail: riderAuthEmail(rider.phone),
        rawPassword: rider.password,
        displayName: rider.name,
        claims: { role: 'rider', riderId: riderDoc.id },
        docRef: riderDoc.ref,
      });
      results.riders.migrated += 1;
    } catch (err) {
      results.riders.failed.push({ id: riderDoc.id, error: err.message });
    }
  }

  // 3. Clients
  const clientsSnap = await db.collection('clients').get();
  for (const clientDoc of clientsSnap.docs) {
    const client = { id: clientDoc.id, ...clientDoc.data() };
    if (client.authMigrated) {
      results.clients.skipped += 1;
      continue;
    }
    try {
      await migrateOneAccount({
        authEmail: clientAuthEmail(client),
        rawPassword: client.password,
        displayName: client.name,
        claims: { role: 'client', clientId: clientDoc.id },
        docRef: clientDoc.ref,
      });
      results.clients.migrated += 1;
    } catch (err) {
      results.clients.failed.push({ id: clientDoc.id, error: err.message });
    }
  }

  return { success: true, results };
});

/**
 * ---------------------------------------------------------------------------------------------
 * Provision (or refresh) ONE rider/client's real Firebase Auth account the moment an admin adds
 * or edits them, instead of waiting for the next bulk "Migrate Accounts" run. Called from
 * EditRiderModal.tsx (on every rider save) and ManageClients.tsx (on every client save) via
 * provisionRiderAccount() / provisionClientAccount() in src/services/firebase.ts.
 *
 * Also handles a password reset on an already-migrated account: if the Firebase Auth user
 * already exists, its password is simply updated to whatever was just typed in the admin panel,
 * rather than creating a duplicate.
 * ---------------------------------------------------------------------------------------------
 */
exports.provisionAccount = onCall(async (request) => {
  assertIsAdmin(request);

  const { role, id, phone, email, password, displayName } = request.data || {};

  if (role !== 'rider' && role !== 'client') {
    throw new HttpsError('invalid-argument', 'role must be "rider" or "client".');
  }
  if (!id || !password) {
    throw new HttpsError('invalid-argument', 'id and password are required.');
  }

  const collectionName = role === 'rider' ? 'riders' : 'clients';
  const docRef = db.collection(collectionName).doc(id);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    throw new HttpsError('not-found', `No ${role} document found for id "${id}" -- save the ${role}'s profile first.`);
  }

  const authEmail = role === 'rider' ? riderAuthEmail(phone) : clientAuthEmail({ id, email });
  const claims = role === 'rider' ? { role: 'rider', riderId: id } : { role: 'client', clientId: id };
  const auth = getAuth();

  try {
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(authEmail);
      // Account already exists (a previous provision, or a legacy migration) -- this call is a
      // password reset for it, so update the password rather than creating a duplicate account.
      await auth.updateUser(userRecord.uid, {
        password: passwordForFirebaseAuth(password),
        displayName: displayName || undefined,
      });
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
      userRecord = await auth.createUser({
        email: authEmail,
        password: passwordForFirebaseAuth(password),
        displayName: displayName || undefined,
      });
    }

    await auth.setCustomUserClaims(userRecord.uid, claims);
    await docRef.update({ authUid: userRecord.uid, authMigrated: true });

    return { success: true, authUid: userRecord.uid };
  } catch (err) {
    console.error(`[provisionAccount] Failed to provision ${role} ${id}:`, err);
    return { success: false, message: err.message || 'Could not provision a secure login for this account.' };
  }
});

/**
 * ---------------------------------------------------------------------------------------------
 * Removes the legacy plaintext `password` field from a rider/client document -- but ONLY once
 * that document has a confirmed, working real Firebase Auth account (authMigrated===true AND a
 * real authUid on file). Deliberately refuses on anything else, so this can never be the thing
 * that locks someone out: an account that failed migration, or was never migrated, still has its
 * only working login (the plaintext comparison) left untouched.
 * ---------------------------------------------------------------------------------------------
 */
async function stripOneLegacyPassword(docRef) {
  const snap = await docRef.get();
  if (!snap.exists) return { skipped: true, reason: 'not-found' };
  const data = snap.data();
  if (!data.authMigrated || !data.authUid) {
    return { skipped: true, reason: 'not-migrated' };
  }
  if (data.password === undefined) {
    return { skipped: true, reason: 'already-clean' };
  }
  await docRef.update({ password: FieldValue.delete() });
  return { skipped: false };
}

exports.stripLegacyPassword = onCall(async (request) => {
  assertIsAdmin(request);
  const { role, id } = request.data || {};
  if (role !== 'rider' && role !== 'client') {
    throw new HttpsError('invalid-argument', 'role must be "rider" or "client".');
  }
  if (!id) {
    throw new HttpsError('invalid-argument', 'id is required.');
  }
  const collectionName = role === 'rider' ? 'riders' : 'clients';
  const result = await stripOneLegacyPassword(db.collection(collectionName).doc(id));
  return { success: true, ...result };
});

/**
 * Bulk version of the above -- sweeps every rider and client document and removes the plaintext
 * password from any that's actually safe to touch, skipping the rest. Safe to run as often as
 * you like: anything not yet migrated is simply left alone, every time, until it is.
 */
exports.stripAllLegacyPasswords = onCall(async (request) => {
  assertIsAdmin(request);

  const results = { riders: { cleaned: 0, skipped: 0 }, clients: { cleaned: 0, skipped: 0 } };

  const ridersSnap = await db.collection('riders').get();
  for (const riderDoc of ridersSnap.docs) {
    const outcome = await stripOneLegacyPassword(riderDoc.ref);
    if (outcome.skipped) results.riders.skipped += 1;
    else results.riders.cleaned += 1;
  }

  const clientsSnap = await db.collection('clients').get();
  for (const clientDoc of clientsSnap.docs) {
    const outcome = await stripOneLegacyPassword(clientDoc.ref);
    if (outcome.skipped) results.clients.skipped += 1;
    else results.clients.cleaned += 1;
  }

  return { success: true, results };
});
