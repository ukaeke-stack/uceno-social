# UCENO Android release and push notifications

## Important behavior

- Android package ID: `com.ukaeke.uceno`. Keep this unchanged for all future APKs.
- Web UI changes deployed to Render are fetched by the installed app when it opens, because the Capacitor shell points to the production web app.
- Native Android changes require a new signed APK. It can update the existing installation without uninstalling only when the package ID and signing key remain identical and the version code increases.
- Android does not permit silent sideloaded APK installation. A new APK can be offered/downloaded, but the user must approve Android's installer. Google Play in-app updates are a separate option once published through Play.
- Firebase/FCM credentials and the Android signing keystore must never be committed to Git.

## Firebase setup

1. Open https://console.firebase.google.com/ and create/select the UCENO Firebase project.
2. In Project settings, add an Android app with package ID `com.ukaeke.uceno`.
3. Download its `google-services.json` file. Do not share it in chat or commit it to the repository.
4. In GitHub repository Settings → Secrets and variables → Actions, add secret `FIREBASE_GOOGLE_SERVICES_JSON` with the complete contents of that file.
5. Create a Firebase service account for server-side Firebase Admin SDK use. Store its complete JSON as Render environment variable `FIREBASE_SERVICE_ACCOUNT_JSON`; keep it server-side only.
6. In Android settings, allow UCENO notifications. On Android 13+, accept the notification permission prompt.

## Android signing (required for in-place updates)

Create one Android release keystore and keep a secure offline backup. Do not generate a new keystore for each release. Add these GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`: base64-encoded keystore file
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The workflow will fail early if required secrets are absent. Do not put secret values in workflow files, issues, or logs.

## Build a release APK

1. Configure the Firebase and signing secrets above.
2. Open Actions → **UCENO Android Release** → Run workflow.
3. Enter a version name and a version code greater than the last published code.
4. Download the signed APK from the workflow artifact.
5. Install the first release manually. For future APK releases, download and open the new APK; Android should offer an update, not require uninstalling, if the signing key/package ID match.

## Push delivery requirements

FCM can deliver while UCENO is backgrounded or closed only after the native app has registered its FCM token, the server has saved that token against the authenticated account, and the server sends an FCM message when a notification is created. Android battery optimization and notification permission settings can still affect delivery. Verify with two real accounts and a physical Android device before announcing push as production-ready.
