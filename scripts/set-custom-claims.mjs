/**
 * One-time setup script to provision demo Firebase Auth accounts and assign Custom Claims.
 *
 * Usage:
 *   1. Download your service account key JSON from Firebase Console -> Project Settings -> Service Accounts
 *   2. Set GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"
 *   3. Run: npm run set-claims
 */

import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      projectId: 'secondmedic-vialtrack'
    });
    console.log('✅ Initialized Firebase Admin with project secondmedic-vialtrack');
  } catch (e) {
    console.error('❌ Error initializing Firebase Admin:', e);
  }
}

const DEMO_USERS = [
  {
    email: 'admin-demo@secondmedic.com',
    password: 'DemoPassword@2026',
    displayName: 'SecondMedic Admin Lead',
    claims: {
      role: 'admin'
    }
  },
  {
    email: 'lifecare-demo@secondmedic.com',
    password: 'DemoPassword@2026',
    displayName: 'Lifecare Diagnostics (Lab Ops)',
    claims: {
      role: 'client',
      clientId: 'client-lifecare'
    }
  },
  {
    email: 'rahul-demo@secondmedic.com',
    password: 'DemoPassword@2026',
    displayName: 'Rahul Sharma (Pickup Boy)',
    claims: {
      role: 'rider',
      riderId: 'rider-rahul'
    }
  }
];

async function setupDemoAccounts() {
  console.log('🚀 Setting up demo accounts and assigning custom claims in Firebase Auth...\n');

  for (const userConfig of DEMO_USERS) {
    try {
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(userConfig.email);
        console.log(`Found existing user: ${userConfig.email} (UID: ${userRecord.uid})`);
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          userRecord = await admin.auth().createUser({
            email: userConfig.email,
            password: userConfig.password,
            displayName: userConfig.displayName
          });
          console.log(`✨ Created new user: ${userConfig.email} (UID: ${userRecord.uid})`);
        } else {
          throw err;
        }
      }

      // Assign custom claims
      await admin.auth().setCustomUserClaims(userRecord.uid, userConfig.claims);
      console.log(`✅ Set custom claims on ${userConfig.email}:`, JSON.stringify(userConfig.claims));

      // Verify custom claims
      const updatedUser = await admin.auth().getUser(userRecord.uid);
      console.log(`🔒 Verified claims for ${userConfig.email}:`, updatedUser.customClaims);
      console.log('--------------------------------------------------');
    } catch (error) {
      console.error(`❌ Failed to configure ${userConfig.email}:`, error);
    }
  }

  console.log('\n🎉 Demo account provisioning finished.');
}

setupDemoAccounts().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error setting up accounts:', err);
  process.exit(1);
});
