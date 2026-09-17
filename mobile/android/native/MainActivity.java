package br.com.dentalflow.mobile;

import android.os.Bundle;
import android.content.Intent;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        StartupActivity.installCrashRecorder(this);
        registerPlugin(DentalFlowPrintPlugin.class);
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                StartupActivity.record(MainActivity.this, "Renderizador WebView interrompido. Crash: " + detail.didCrash());
                if (bridge != null) { bridge.onDestroy(); bridge = null; }
                if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
                view.destroy();
                startActivity(new Intent(MainActivity.this, StartupActivity.class));
                finish();
                return true;
            }
        });
        super.onCreate(savedInstanceState);
    }
}
