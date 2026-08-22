import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native container configuration for the local Android build.
 *
 * `appId` only needs to be stable and valid for a debug APK. Change it before
 * publishing or distributing the application outside this device.
 */
const config: CapacitorConfig = {
  appId: "com.studyappdemo.bookcourse",
  appName: "BookCourse AI",
  webDir: "dist",
  plugins: {
    App: {
      // The React navigation machine owns Android back-button behaviour.
      disableBackButtonHandler: true
    },
    Keyboard: {
      // Keeps Android's WebView resize workaround available when a device
      // chooses an edge-to-edge/full-screen system-bar implementation.
      resizeOnFullScreen: true
    },
    StatusBar: {
      backgroundColor: "#F6F8FB",
      overlaysWebView: false,
      style: "LIGHT"
    }
  }
};

export default config;
