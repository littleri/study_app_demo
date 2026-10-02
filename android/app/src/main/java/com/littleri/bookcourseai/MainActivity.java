package com.littleri.bookcourseai;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final long MINIMUM_SPLASH_DURATION_MS = 1_000L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        final long splashStartedAt = SystemClock.uptimeMillis();
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(
            () -> SystemClock.uptimeMillis() - splashStartedAt < MINIMUM_SPLASH_DURATION_MS
        );
        super.onCreate(savedInstanceState);
        configureWebViewTextScale();
        configureSystemBars();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        configureWebViewTextScale();
    }

    private void configureWebViewTextScale() {
        if (bridge != null) {
            // Match the shared CSS typography used by the desktop device preview.
            bridge.getWebView().getSettings().setTextZoom(100);
        }
    }

    @SuppressWarnings("deprecation")
    private void configureSystemBars() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Let the web sidebar paint through the navigation area without a system scrim.
            window.setNavigationBarContrastEnforced(false);
        }
    }
}
