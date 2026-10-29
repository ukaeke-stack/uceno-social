package com.ukaeke.uceno;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String target = intent.getStringExtra("url");
        if (target != null && getBridge() != null) {
            final String safeTarget = target.startsWith("/") && !target.startsWith("//") ? target : "/";
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.location.assign(" + org.json.JSONObject.quote(safeTarget) + ")", null));
        }
    }
}
