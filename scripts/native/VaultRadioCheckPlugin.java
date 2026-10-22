package money.honest.seedvault;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.nfc.NfcAdapter;
import android.os.BatteryManager;
import android.provider.Settings;
import android.telephony.TelephonyManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Read-only radio and connection status for the pre-unlock checklist.
 * Everything here is read without any Android permission: Settings.Global
 * values are world-readable, and the battery intent carries the USB plug state.
 * The APK ships with zero network permissions, so this plugin cannot connect
 * to anything. Each value is null when Android refuses to tell us.
 */
@CapacitorPlugin(name = "VaultRadioCheck")
public class VaultRadioCheckPlugin extends Plugin {
    @PluginMethod public void status(PluginCall call) {
        Context ctx = getContext();
        ContentResolver cr = ctx.getContentResolver();
        JSObject r = new JSObject();
        try { r.put("airplane", Settings.Global.getInt(cr, Settings.Global.AIRPLANE_MODE_ON, 0) == 1); } catch (Exception e) { r.put("airplane", JSObject.NULL); }
        try { r.put("wifi", Settings.Global.getInt(cr, "wifi_on", 0) != 0); } catch (Exception e) { r.put("wifi", JSObject.NULL); }
        try { r.put("mobileData", Settings.Global.getInt(cr, "mobile_data", 0) != 0); } catch (Exception e) { r.put("mobileData", JSObject.NULL); }
        try { r.put("bluetooth", Settings.Global.getInt(cr, "bluetooth_on", 0) != 0); } catch (Exception e) { r.put("bluetooth", JSObject.NULL); }
        try { r.put("adb", Settings.Global.getInt(cr, Settings.Global.ADB_ENABLED, 0) != 0); } catch (Exception e) { r.put("adb", JSObject.NULL); }
        try { NfcAdapter n = NfcAdapter.getDefaultAdapter(ctx); r.put("nfc", n != null && n.isEnabled()); } catch (Exception e) { r.put("nfc", JSObject.NULL); }
        try {
            // Every SIM slot (physical + eSIM): a present, enabled profile counts.
            TelephonyManager t = (TelephonyManager) ctx.getSystemService(Context.TELEPHONY_SERVICE);
            boolean sim = false;
            if (t != null) {
                int slots = t.getActiveModemCount();
                for (int i = 0; i < slots; i++) {
                    int s = t.getSimState(i);
                    if (s != TelephonyManager.SIM_STATE_ABSENT && s != TelephonyManager.SIM_STATE_UNKNOWN) { sim = true; break; }
                }
            }
            r.put("sim", sim);
        } catch (Exception e) { r.put("sim", JSObject.NULL); }
        try {
            // Phone plugged into a computer over USB (the real exfil path).
            Intent bat = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            int plugged = bat == null ? 0 : bat.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
            r.put("usbHost", plugged == BatteryManager.BATTERY_PLUGGED_USB);
        } catch (Exception e) { r.put("usbHost", JSObject.NULL); }
        call.resolve(r);
    }
}
