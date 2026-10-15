package kr.personal.tftguide;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Downloads a complete, commit-pinned web snapshot before making it available. */
final class WebUpdates {
    private static final String API = "https://api.github.com/repos/ddoing2dang/-/git/trees/main?recursive=1";
    private final Context context;
    private final File root;
    WebUpdates(Context context) {
        this.context = context;
        root = new File(context.getFilesDir(), "web-updates");
        root.mkdirs();
    }
    File current() {
        String version = context.getSharedPreferences("web-updates", 0).getString("version", "");
        if (!version.matches("[a-f0-9]{40}")) return null;
        File dir = new File(root, version);
        return new File(dir, ".complete").isFile() ? dir : null;
    }
    boolean refresh() throws Exception {
        JSONObject tree = new JSONObject(new String(get(API, 4 * 1024 * 1024), StandardCharsets.UTF_8));
        if (tree.optBoolean("truncated")) throw new IOException("Incomplete tree");
        JSONArray entries = tree.getJSONArray("tree");
        String revision = tree.getString("sha"), version = "";
        if (!revision.matches("[a-f0-9]{40}")) throw new IOException("Invalid revision");
        for (int i=0;i<entries.length();i++) {
            JSONObject entry=entries.getJSONObject(i);
            if ("web".equals(entry.getString("path")) && "tree".equals(entry.getString("type"))) version=entry.getString("sha");
        }
        if (!version.matches("[a-f0-9]{40}")) throw new IOException("Missing web tree");
        File previous=current(), destination=new File(root, version);
        if (previous!=null && previous.equals(destination)) return false;
        File staging=new File(root, "pending");
        erase(staging);
        if (!staging.mkdirs()) throw new IOException("Cannot prepare update");
        try {
            long total=0; int files=0;
            for (int i=0;i<entries.length();i++) {
                JSONObject entry=entries.getJSONObject(i);
                String path=entry.getString("path");
                if (!path.startsWith("web/") || !"blob".equals(entry.getString("type"))) continue;
                String relative=path.substring(4);
                if (!relative.matches("[a-zA-Z0-9_./-]+") || relative.contains("..") || relative.startsWith("/")) throw new IOException("Invalid path");
                if (++files>200) throw new IOException("Too many files");
                byte[] bytes=get("https://raw.githubusercontent.com/ddoing2dang/-/"+revision+"/"+path,12*1024*1024);
                total+=bytes.length;
                if (total>40*1024*1024) throw new IOException("Update too large");
                MessageDigest digest=MessageDigest.getInstance("SHA-1");
                digest.update(("blob "+bytes.length+"\0").getBytes(StandardCharsets.UTF_8));
                byte[] hash=digest.digest(bytes);StringBuilder hex=new StringBuilder();
                for(byte b:hash) hex.append(String.format("%02x",b&255));
                if (!hex.toString().equals(entry.getString("sha"))) throw new IOException("File mismatch");
                File file=new File(staging,relative);file.getParentFile().mkdirs();
                try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);}
            }
            for(String required:new String[]{"index.html","app.js","engine.js","data.js","items.js","codes.js","board-data.js","style.css"})
                if (!new File(staging,required).isFile()) throw new IOException("Missing entry point");
            try(FileOutputStream out=new FileOutputStream(new File(staging,"config.js"))){
                out.write("window.APP_CONFIG={theme:'matto',platform:'mobile'};".getBytes(StandardCharsets.UTF_8));
            }
            new File(staging,".complete").createNewFile();
            erase(destination);
            if (!staging.renameTo(destination)) throw new IOException("Cannot activate snapshot");
            if (!context.getSharedPreferences("web-updates",0).edit().putString("version",version).commit()) throw new IOException("Cannot save version");
            // Keep the previous snapshot: an already running WebView may still be reading it.
            File[] dirs=root.listFiles();
            if(dirs!=null)for(File dir:dirs)if(!dir.equals(destination)&&!dir.equals(previous))erase(dir);
            return true;
        } finally { erase(staging); }
    }
    private static byte[] get(String address,int limit) throws IOException {
        HttpURLConnection connection=(HttpURLConnection)new URL(address).openConnection();
        connection.setConnectTimeout(4000);connection.setReadTimeout(6000);
        connection.setRequestProperty("User-Agent","Matto-Helper-Android");
        connection.setRequestProperty("Cache-Control","no-cache");
        try {
            if(connection.getResponseCode()!=200)throw new IOException("Update unavailable");
            try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[8192];int count;
                while((count=in.read(buffer))!=-1){if(out.size()+count>limit)throw new IOException("File too large");out.write(buffer,0,count);}
                return out.toByteArray();
            }
        } finally {connection.disconnect();}
    }
    private static void erase(File file) {
        if(file.isDirectory()){File[] children=file.listFiles();if(children!=null)for(File child:children)erase(child);}
        file.delete();
    }
}
