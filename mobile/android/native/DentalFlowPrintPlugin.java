package br.com.dentalflow.mobile;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DentalFlowPrint")
public class DentalFlowPrintPlugin extends Plugin {
    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        String jobName = call.getString("jobName", "DentalFlow - Nota do caso");
        String paper = call.getString("paper");
        Boolean landscape = call.getBoolean("landscape", false);
        if (html == null || html.isEmpty()) {
            call.reject("HTML de impressão vazio");
            return;
        }

        getActivity().runOnUiThread(() -> {
            WebView printView = new WebView(getContext());
            printView.getSettings().setJavaScriptEnabled(false);
            printView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    try {
                        PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                        PrintAttributes.Builder builder = new PrintAttributes.Builder()
                                .setColorMode(PrintAttributes.COLOR_MODE_COLOR);
                        if ("a4".equalsIgnoreCase(paper)) {
                            PrintAttributes.MediaSize media = PrintAttributes.MediaSize.ISO_A4;
                            if (Boolean.TRUE.equals(landscape)) media = media.asLandscape();
                            builder.setMediaSize(media);
                        }
                        PrintAttributes attributes = builder.build();
                        printManager.print(jobName, adapter, attributes);
                        JSObject result = new JSObject();
                        result.put("started", true);
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("Falha ao abrir a impressão nativa do Android", error);
                    }
                }
            });
            printView.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
        });
    }
}
