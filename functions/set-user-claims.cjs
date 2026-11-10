
const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();

async function assignClaims() {
  try {
    let nextPageToken;

    do {
      const result = await auth.listUsers(1000, nextPageToken);

      for (const user of result.users) {
        const existingClaims = user.customClaims || {};

        await auth.setCustomUserClaims(user.uid, {
          ...existingClaims,
          role: "authenticated",
        });

        console.log(`Updated: ${user.email || user.uid}`);
      }

      nextPageToken = result.pageToken;
    } while (nextPageToken);

    console.log("All existing users updated successfully.");
  } catch (error) {
    console.error("Error updating users:", error);
    process.exitCode = 1;
  }
}

assignClaims();
