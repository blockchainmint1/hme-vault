package money.honest.seedvault;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/** Uses only Android's document picker; no storage or network permissions. */
@CapacitorPlugin(name = "VaultDocuments")
public class VaultDocumentsPlugin extends Plugin {
    @PluginMethod public void save(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "text/plain"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "vault-backup.txt"));
        startActivityForResult(call, intent, "saved");
    }
    @ActivityCallback private void saved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.reject("Save cancelled."); return; }
        Uri uri = result.getData().getData();
        if (uri == null) { call.reject("No file selected."); return; }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (out == null) throw new Exception("Drive unavailable");
            String content = call.getString("data", "");
            byte[] bytes = Boolean.TRUE.equals(call.getBoolean("base64", false)) ? Base64.decode(content, Base64.DEFAULT) : content.getBytes(StandardCharsets.UTF_8);
            out.write(bytes); out.flush();
            JSObject reply = new JSObject(); reply.put("name", call.getString("name")); call.resolve(reply);
        } catch (Exception e) { call.reject("Could not save the file. Check the drive and try again."); }
    }
    @PluginMethod public void open(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/plain");
        startActivityForResult(call, intent, "opened");
    }
    @ActivityCallback private void opened(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.resolve(new JSObject()); return; }
        Uri uri = result.getData().getData();
        if (uri == null) { call.reject("No file selected."); return; }
        try (InputStream in = getContext().getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) throw new Exception("Drive unavailable");
            byte[] buffer = new byte[8192]; int n;
            while ((n = in.read(buffer)) != -1) { if (out.size() + n > 3 * 1024 * 1024) throw new Exception("Too large"); out.write(buffer, 0, n); }
            JSObject reply = new JSObject(); reply.put("text", out.toString("UTF-8")); call.resolve(reply);
        } catch (Exception e) { call.reject("Could not open the backup. It must be under 3 MB."); }
    }
}