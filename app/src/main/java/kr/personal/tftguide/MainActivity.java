package kr.personal.tftguide;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.widget.Toast;
import java.io.OutputStream;
import java.net.URI;

public class MainActivity extends Activity {
    private WebView web;
    private View splash;
    private TextView splashSubtitle;
    private ProgressBar splashProgress;
    private boolean loadFailed;
    private ValueCallback<Uri[]> pendingFiles;
    private static final int FILE_PICKER = 1001;
    private final String host = URI.create(BuildConfig.APP_URL).getHost();

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        boolean matto = "matto".equals(BuildConfig.FLAVOR);
        int background = Color.parseColor(matto ? "#F7F4F1" : "#090D18");
        int foreground = Color.parseColor(matto ? "#2B2029" : "#F6F8FF");
        int accent = Color.parseColor(matto ? "#A24C70" : "#89A9FF");
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        getWindow().getDecorView().setSystemUiVisibility(matto ? View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(background);
        web = new WebView(this);
        web.setBackgroundColor(background);
        web.setVisibility(View.INVISIBLE);
        frame.addView(web, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout content = new LinearLayout(this);
        content.setGravity(Gravity.CENTER);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(32), dp(24), dp(32));
        content.setBackgroundColor(background);
        TextView mark = new TextView(this);
        mark.setText(matto ? "✦  MATTO" : "◆  TFT");
        mark.setTextColor(accent);
        mark.setTextSize(18);
        mark.setLetterSpacing(.12f);
        mark.setGravity(Gravity.CENTER);
        content.addView(mark);
        TextView title = new TextView(this);
        title.setText(matto ? "마또 배치툴" : "TFT 도우미");
        title.setTextColor(foreground);
        title.setTextSize(30);
        title.setTypeface(null, 1);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(-1, -2);
        titleParams.topMargin = dp(20);
        content.addView(title, titleParams);
        splashSubtitle = new TextView(this);
        splashSubtitle.setText(matto ? "오늘의 덱을 차분히 준비하는 중" : "나만의 배치를 준비하는 중");
        splashSubtitle.setTextColor(matto ? Color.parseColor("#70616B") : Color.parseColor("#ACBAD8"));
        splashSubtitle.setTextSize(15);
        splashSubtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(-1, -2);
        subtitleParams.topMargin = dp(10);
        content.addView(splashSubtitle, subtitleParams);
        splashProgress = new ProgressBar(this);
        splashProgress.setIndeterminateTintList(ColorStateList.valueOf(accent));
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(dp(32), dp(32));
        progressParams.topMargin = dp(28);
        content.addView(splashProgress, progressParams);
        splash = content;
        frame.addView(splash, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("https".equals(url.getScheme()) && host.equalsIgnoreCase(url.getHost())) return false;
                if (request.isForMainFrame()) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, url)); }
                    catch (ActivityNotFoundException ignored) { Toast.makeText(MainActivity.this, "링크를 열 수 없습니다", Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
            @Override public void onPageCommitVisible(WebView view, String url) {
                if (!loadFailed && host.equalsIgnoreCase(Uri.parse(url).getHost())) showPage();
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (url.startsWith(BuildConfig.APP_URL)) {
                    view.evaluateJavascript(DOWNLOAD_BRIDGE, null);
                    if (!loadFailed) showPage();
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) {
                    loadFailed = true;
                    splashSubtitle.setText("연결을 확인한 뒤 앱을 다시 열어 주세요");
                    splashProgress.setVisibility(View.GONE);
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                try { startActivityForResult(params.createIntent(), FILE_PICKER); }
                catch (ActivityNotFoundException ex) { pendingFiles = null; callback.onReceiveValue(null); return false; }
                return true;
            }
        });
        web.addJavascriptInterface(new Downloads(), "NativeDownloads");
        web.loadUrl(BuildConfig.APP_URL);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void showPage() {
        web.setVisibility(View.VISIBLE);
        splash.setVisibility(View.GONE);
    }

    // The site creates PNG and JSON downloads from data/blob URLs. Save them in Downloads on Android.
    private static final String DOWNLOAD_BRIDGE = "(function(){if(window.__nativeSaveInstalled)return;window.__nativeSaveInstalled=true;" +
        "const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){" +
        "if(this.download&&(this.href.startsWith('data:')||this.href.startsWith('blob:'))){" +
        "const name=this.download,href=this.href;fetch(href).then(r=>r.blob()).then(blob=>{" +
        "const reader=new FileReader();reader.onload=()=>NativeDownloads.save(name,reader.result);reader.readAsDataURL(blob);" +
        "}).catch(()=>click.call(this));return;}return click.call(this);};})();";

    private class Downloads {
        @JavascriptInterface public void save(String fileName, String dataUrl) {
            try {
                String safeName = fileName.replaceAll("[^a-zA-Z0-9가-힣._-]", "_");
                if (safeName.isEmpty()) safeName = "TFT-guide.png";
                int comma = dataUrl.indexOf(',');
                if (comma < 0) throw new IllegalArgumentException("Invalid data URL");
                byte[] data = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                values.put(MediaStore.Downloads.MIME_TYPE, safeName.endsWith(".json") ? "application/json" : "image/png");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri destination = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (destination == null) throw new IllegalStateException("No destination");
                try (OutputStream out = getContentResolver().openOutputStream(destination)) {
                    if (out == null) throw new IllegalStateException("No output stream");
                    out.write(data);
                }
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "다운로드 폴더에 저장했습니다", Toast.LENGTH_SHORT).show());
            } catch (Exception ex) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "저장하지 못했습니다", Toast.LENGTH_SHORT).show());
            }
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_PICKER && pendingFiles != null) {
            pendingFiles.onReceiveValue(resultCode == RESULT_OK ? WebChromeClient.FileChooserParams.parseResult(resultCode, data) : null);
            pendingFiles = null;
        }
    }
    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
