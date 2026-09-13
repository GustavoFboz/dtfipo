package br.com.dentalflow.mobile;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Native entry point: recovery must remain accessible even if the WebView cannot start. */
public class StartupActivity extends Activity {
    private static final String PREFS = "dentalflow-startup-diagnostics";

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void record(Context context, String reason) {
        // No exception messages, URLs, tokens, patient data or database contents.
        String report = "DentalFlow Android\n";
        try {
            report += "Versão: " + context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName + "\n";
        } catch (Exception ignored) {}
        report += "Dispositivo: " + Build.MANUFACTURER + " " + Build.MODEL + "\nAndroid: " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")\n";
        report += "Horário: " + System.currentTimeMillis() + "\n" + reason;
        preferences(context).edit().putString("report", report.substring(0, Math.min(report.length(), 12000))).commit();
    }

    static void installCrashRecorder(Context context) {
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        if (!(previous instanceof CrashRecorder)) {
            Thread.setDefaultUncaughtExceptionHandler(new CrashRecorder(context.getApplicationContext(), previous));
        }
    }

    private static final class CrashRecorder implements Thread.UncaughtExceptionHandler {
        private final Context context;
        private final Thread.UncaughtExceptionHandler previous;
        CrashRecorder(Context context, Thread.UncaughtExceptionHandler previous) {
            this.context = context;
            this.previous = previous;
        }
        @Override public void uncaughtException(Thread thread, Throwable error) {
            try {
                StringBuilder details = new StringBuilder("Falha nativa:\n");
                Throwable cause = error;
                for (int depth = 0; cause != null && depth < 4; depth++, cause = cause.getCause()) {
                    details.append(cause.getClass().getName()).append('\n');
                    StackTraceElement[] frames = cause.getStackTrace();
                    for (int i = 0; i < Math.min(frames.length, 16); i++) details.append("  ").append(frames[i]).append('\n');
                }
                record(context, details.toString());
            } catch (Throwable ignored) {
                // Recording must not replace Android's original crash handling.
            } finally {
                if (previous != null) previous.uncaughtException(thread, error);
                else {
                    android.os.Process.killProcess(android.os.Process.myPid());
                    System.exit(10);
                }
            }
        }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        installCrashRecorder(this);
        capturePreviousNativeExit();
        String report = preferences(this).getString("report", null);
        if (report == null) { openApp(); return; }

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        content.setPadding(padding, padding * 2, padding, padding);
        TextView title = new TextView(this);
        title.setText("Vamos reabrir o DentalFlow");
        title.setTextSize(24);
        content.addView(title);
        TextView explanation = new TextView(this);
        explanation.setText("A abertura anterior foi interrompida. Você pode tentar novamente ou compartilhar o diagnóstico, sem conectar o celular ao computador.");
        explanation.setTextSize(16);
        explanation.setPadding(0, padding, 0, padding);
        content.addView(explanation);

        Button retry = new Button(this);
        retry.setText("Tentar novamente");
        retry.setOnClickListener(view -> {
            preferences(this).edit().remove("report").commit();
            openApp();
        });
        content.addView(retry);
        Button share = new Button(this);
        share.setText("Compartilhar diagnóstico");
        share.setOnClickListener(view -> {
            Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, report);
            startActivity(Intent.createChooser(send, "Diagnóstico do DentalFlow"));
        });
        content.addView(share);
        TextView details = new TextView(this);
        details.setText(report);
        details.setTextSize(12);
        details.setTextIsSelectable(true);
        details.setPadding(0, padding, 0, 0);
        content.addView(details);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(content);
        setContentView(scroll);
    }

    private void openApp() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }

    private void capturePreviousNativeExit() {
        if (Build.VERSION.SDK_INT < 30) return;
        try {
            ActivityManager manager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
            for (ApplicationExitInfo exit : manager.getHistoricalProcessExitReasons(getPackageName(), 0, 1)) {
                long checked = preferences(this).getLong("checked-exit", 0);
                if (exit.getTimestamp() <= checked) return;
                preferences(this).edit().putLong("checked-exit", exit.getTimestamp()).apply();
                int reason = exit.getReason();
                if (preferences(this).getString("report", null) == null &&
                    (reason == ApplicationExitInfo.REASON_CRASH || reason == ApplicationExitInfo.REASON_CRASH_NATIVE || reason == ApplicationExitInfo.REASON_ANR)) {
                    record(this, "Encerramento registrado pelo Android: " + reason + "\nStatus: " + exit.getStatus());
                }
            }
        } catch (Exception ignored) {}
    }
}
