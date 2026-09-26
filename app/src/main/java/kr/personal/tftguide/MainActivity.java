package kr.personal.tftguide;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
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
    private ValueCallback<Uri[]> pendingFiles;
    private static final int FILE_PICKER = 1001;
    private final String host = URI.create(BuildConfig.APP_URL).getHost();

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);
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
            @Override public void onPageFinished(WebView view, String url) {
                if (url.startsWith(BuildConfig.APP_URL)) view.evaluateJavascript(DOWNLOAD_BRIDGE, null);
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
