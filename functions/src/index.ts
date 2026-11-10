
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { setGlobalOptions } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";

initializeApp();

setGlobalOptions({ maxInstances: 10 });

export const setAuthenticatedRole = onCall(async (request) => {
  // Siguraduhing naka-login ang tumatawag.
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be logged in."
    );
  }

  // User can only update their own account.
  const uid = request.auth.uid;

  try {
    const user = await getAuth().getUser(uid);

    // Preserve existing custom claims.
    const existingClaims = user.customClaims || {};

    await getAuth().setCustomUserClaims(uid, {
      ...existingClaims,
      role: "authenticated",
    });

    return {
      success: true,
      message: "Authenticated role assigned successfully.",
    };
  } catch (error) {
    console.error("Error assigning custom claim:", error);

    throw new HttpsError(
      "internal",
      "Unable to assign authenticated role."
    );
  }
});
