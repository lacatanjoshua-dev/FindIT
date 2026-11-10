const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function assignAdminClaim() {
  try {
    const auth = admin.auth();
    const user = await auth.getUserByEmail("admin@gmail.com");
    const existingClaims = user.customClaims || {};

    await auth.setCustomUserClaims(user.uid, {
      ...existingClaims,
      role: "authenticated",
      admin: true,
    });

    console.log(`Admin permission assigned to: ${user.email}`);
  } catch (error) {
    console.error("Error assigning admin permission:", error);
    process.exitCode = 1;
  }
}

assignAdminClaim();
