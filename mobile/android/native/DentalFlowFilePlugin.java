package br.com.dentalflow.mobile;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "DentalFlowFile")
public class DentalFlowFilePlugin extends Plugin {
    @PluginMethod
    public void savePdf(PluginCall call) {
        String base64 = call.getString("base64");
        String fileName = sanitize(call.getString("fileName", "DentalFlow.pdf"));
        if (base64 == null || base64.isEmpty()) {
            call.reject("PDF vazio");
            return;
        }
        if (!fileName.toLowerCase().endsWith(".pdf")) fileName += ".pdf";

        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            if (bytes.length == 0) {
                call.reject("PDF vazio");
                return;
            }
            if (bytes.length > 32 * 1024 * 1024) {
                call.reject("PDF excede o limite permitido");
                return;
            }

            String uriText;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/DentalFlow");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("Não foi possível criar o arquivo em Downloads.");
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("Não foi possível abrir o arquivo para gravação.");
                    out.write(bytes);
                    out.flush();
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(uri, done, null, null);
                uriText = uri.toString();
            } else {
                File dir = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "DentalFlow");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Não foi possível criar a pasta de downloads.");
                File file = new File(dir, fileName);
                try (OutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                    out.flush();
                }
                uriText = file.toURI().toString();
            }

            JSObject result = new JSObject();
            result.put("saved", true);
            result.put("uri", uriText);
            result.put("fileName", fileName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Falha ao salvar o PDF no dispositivo", error);
        }
    }

    private String sanitize(String value) {
        String safe = value == null ? "DentalFlow.pdf" : value.replaceAll("[\\\\/:*?\"<>|]+", "_").trim();
        return safe.isEmpty() ? "DentalFlow.pdf" : safe;
    }
}

// Validation branch: exercise the Android A4/PDF packaging workflow.
