# Android app (Google Play)

The Android app is a [Capacitor](https://capacitorjs.com) shell around the live site at
`https://home.localservicepro.com.au`.

- **Instant updates.** Every web deploy reaches the app straight away. You only need a new Play Store release when something native changes: the icon, the splash screen, permissions or plugins.
- **App ID:** `au.com.localservicepro.home`
- **Name:** Home Service Ops

| What | Where |
| --- | --- |
| App config (live URL, app ID) | `capacitor.config.ts` |
| Android Studio project | `android/` |
| Offline screen | `native/www/offline.html` |
| Icon and splash sources | `assets/` (regenerate with `npx @capacitor/assets generate --android`) |
| Play listing graphics | `docs/play-store/` |
| Build | `.github/workflows/android.yml` |

## How the app differs from the website

- **Google sign-in** opens in the phone's browser, because Google blocks sign-in inside apps. The flow is:
  1. Google sends the user back to `/auth/app`.
  2. That page redirects to `au.com.localservicepro.home://auth/callback`.
  3. The app opens and finishes sign-in.

  Email and password sign-in works as normal.
- **Connecting integrations** (Google Calendar, LeadConnector, Stripe, Xero, SMS Gateway and others) needs a sign-in pop-up, which apps can't open. In the app, those buttons explain that this has to be done from a web browser. Once connected, everything works in the app.
- **Plan purchases are hidden.** Google Play doesn't allow buying a subscription through Stripe inside an app. The plan and usage are still shown.
- **Delete my account** is in Settings, and in Profile for crew; Google Play requires this. The public page `/delete-account` explains it for the Play listing.
- **Offline:** the app shows a branded "You're offline" screen and reloads by itself when the connection returns.
- **Push notifications** (Firebase Cloud Messaging; setup below). The app asks for permission after the first sign-in. Alerts:

  | Who | Alert |
  | --- | --- |
  | Owners and office admins | New website enquiries |
  | Owners and office admins | New LeadConnector leads (live webhook only, not the background catch-up) |
  | Owners and office admins | Quote accepted or declined |
  | Owners and office admins | Invoice paid online (Stripe, Square, GoCardless or Xero) |
  | Crew | A job assigned to them |

  Tapping an alert opens the right page. Each person turns alert types on or off under **Settings → Notifications** (crew: **Profile**), and **Send a test** checks their phone. Signing out stops alerts to that phone.

## Build the APK and AAB

The Android SDK can't be installed in Claude's sandbox, so GitHub builds the app. The workflow runs:

- on pull requests that touch `android/`;
- by hand: **Actions → Android app → Run workflow**. This only works once the workflow is on `main`;
- when you push a tag such as `android-v1.0.1`.

Download the files from the run page under **Artifacts**:

- **`.apk`**: install this straight on a phone to test. You may need to allow "Install unknown apps".
- **`.aab`**: upload this to Google Play.

Without signing secrets, the APK is a debug build and the AAB is unsigned. That's fine for testing, but Play only accepts a signed AAB.

## One-time: create the upload key

Run this on your computer once. It needs Java (for example Android Studio's JDK, or `brew install openjdk`):

```bash
keytool -genkeypair -v -keystore upload-keystore.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Local Service Pro, O=Local Service Pro, C=AU"
base64 -i upload-keystore.jks | tr -d '\n' > upload-keystore.b64   # macOS
# Linux: base64 -w0 upload-keystore.jks > upload-keystore.b64
```

Keep `upload-keystore.jks` and its password somewhere safe, such as a password manager. Google Play App Signing holds the real app signing key, so if this upload key is ever lost it can be reset in Play Console.

Add these four GitHub repository secrets under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | contents of `upload-keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password (same as the keystore password unless you set a different one) |

Then run the workflow again. The AAB is now signed and ready for Play.

## One-time: Firebase (push notifications)

Firebase is Google's free notification service.

1. Go to <https://console.firebase.google.com>, choose **Create a project** and name it "Home Service Ops". Google Analytics isn't needed.
2. Click **Add app → Android**, enter the package name `au.com.localservicepro.home` and register the app. Download **`google-services.json`** and skip the remaining steps of that wizard.
3. Add a GitHub repository secret **`GOOGLE_SERVICES_JSON`** and paste the whole contents of that file.
4. In Firebase, open ⚙ **Project settings → Service accounts** and click **Generate new private key**. A `.json` file downloads.
5. In Supabase, open **Edge Functions → Secrets** and add **`FCM_SERVICE_ACCOUNT`**. Paste the whole contents of the service account file. Keep this file private: it can send notifications as your app.
6. Run the **Android app** workflow again and install the new build. Phones on an older build have no push until they update.

If either secret is missing, everything else still works and push simply stays off.

## One-time: Google Play Console

1. **Create a developer account** at <https://play.google.com/console>. It costs US$25 once.
   - Choose **Organisation** if you can. It needs a D-U-N-S number for Local Service Pro, which is free and takes a few days.
   - Choose **Personal** only as a fallback. New personal accounts must run a **closed test with at least 12 testers for 14 days** before they're allowed to publish to production.
2. **Create app:**
   - Name: Home Service Ops
   - Default language: English (Australia)
   - App, Free
3. **Store listing:**
   - Short description, for example: "Quotes, jobs, scheduling and invoices for home service businesses."
   - Full description
   - App icon: `docs/play-store/icon-512.png`
   - Feature graphic: `docs/play-store/feature-graphic.png`
   - At least two phone screenshots. Take them in the app, or with Chrome's phone view at home.localservicepro.com.au.
   - Category: Business
   - Contact email: info@localservicepro.com.au
4. **App content:**
   - **Privacy policy:** `https://home.localservicepro.com.au/privacy`
   - **App access:** "All or some functionality is restricted". Give the reviewers the demo login: `support@localservicepro.com.au` and its password.
   - **Ads:** No.
   - **Content rating:** fill in the questionnaire. Choose Business/Utility; there's no user-generated public content.
   - **Target audience:** 18 and over.
   - **Data safety.** The app collects:
     - name, email and phone (account management, app functionality);
     - photos (app functionality);
     - device or other IDs: the push notification token (app functionality);
     - customers' names, addresses, phones and emails entered by the business (app functionality).

     Answer the remaining questions as follows:
     - Data is encrypted in transit.
     - Users can request deletion.
     - Delete account URL: `https://home.localservicepro.com.au/delete-account`
     - No data is shared with third parties for advertising.
   - **Financial features:** none. Payments go to the business through Stripe, Square or GoCardless, and the app doesn't take payments itself.
5. **Testing → Internal testing → Create release:**
   - Upload the signed `.aab`.
   - Accept **Play App Signing**.
   - Add your own Google account as a tester.
   - Install from the opt-in link.
6. Once it works, promote the release to **Closed testing** (personal accounts: 12 testers for 14 days), then **Production**.

## One-time: Supabase

Google sign-in in the app returns through `https://home.localservicepro.com.au/auth/app`. This is already allowed if the Supabase Auth Redirect URLs list includes `https://home.localservicepro.com.au/**`.

If Google sign-in in the app lands on the website instead of reopening the app, check:

**Supabase → Authentication → URL Configuration → Redirect URLs.**

## New releases

Web changes don't need a release. For native changes, do one of the following:

- Run the workflow with a higher **version name**.
- Push a tag: `git tag android-v1.0.1 && git push origin android-v1.0.1`.

Then upload the new `.aab` in Play Console. The version code goes up automatically with every run.

## Local build (optional, needs Android Studio)

```bash
npm ci
npx cap sync android
npx cap open android        # or: cd android && ./gradlew assembleDebug
```
