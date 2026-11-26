package br.com.dentalflow.mobile;

import android.webkit.CookieManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DentalFlowPrivacy")
public class DentalFlowPrivacyPlugin extends Plugin {
    @PluginMethod
    public void clearPrivateCache(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getBridge().getWebView().clearCache(true);
                getBridge().getWebView().clearHistory();
                getBridge().getWebView().clearFormData();
                CookieManager.getInstance().removeAllCookies(ignored -> {
                    CookieManager.getInstance().flush();
                    call.resolve();
                });
            } catch (Exception error) {
                call.reject("Não foi possível concluir a limpeza privada do aplicativo.", error);
            }
        });
    }
}
