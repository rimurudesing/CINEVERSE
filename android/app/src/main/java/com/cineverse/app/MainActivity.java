package com.cineverse.app;

import android.app.UiModeManager;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                // Aceleración por hardware explícita para máxima fluidez en TV y móviles
                webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

                WebSettings settings = webView.getSettings();
                settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
                settings.setEnableSmoothTransition(true);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);

                // Detección de TV para optimización automática
                UiModeManager uiModeManager = (UiModeManager) getSystemService(UI_MODE_SERVICE);
                boolean isTV = (uiModeManager != null && uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                        || getPackageManager().hasSystemFeature("android.software.leanback")
                        || getPackageManager().hasSystemFeature("android.hardware.type.television");

                String currentUA = settings.getUserAgentString();
                if (isTV || getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE) {
                    settings.setUserAgentString(currentUA + " CineVerseTV");
                }
            }
        } catch (Exception e) {
            // Silencioso
        }
    }
}
