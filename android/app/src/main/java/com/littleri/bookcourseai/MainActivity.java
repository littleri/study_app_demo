package com.littleri.bookcourseai;

import android.os.Bundle;
import android.os.SystemClock;

import androidx.core.splashscreen.SplashScreen;

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
    }
}
