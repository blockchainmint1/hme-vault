package money.honest.seedvault;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.nfc.NfcAdapter;
import android.os.BatteryManager;
import android.os.Build;
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
    private void putSetting(JSObject result, ContentResolver resolver, String key, String setting) {
        try {
            int value = Settings.Global.getInt(resolver, setting, -1);
            result.put(key, value == -1 ? JSObject.NULL : value != 0);
        } catch (Exception e) {
            result.put(key, JSObject.NULL);
        }
    }

    @PluginMethod public void status(PluginCall call) {
        Context ctx = getContext();
        ContentResolver cr = ctx.getContentResolver();
        JSObject r = new JSObject();
        putSetting(r, cr, "airplane", Settings.Global.AIRPLANE_MODE_ON);
        putSetting(r, cr, "wifi", "wifi_on");
        putSetting(r, cr, "mobileData", "mobile_data");
        putSetting(r, cr, "bluetooth", "bluetooth_on");
        putSetting(r, cr, "adb", Settings.Global.ADB_ENABLED);
        try { NfcAdapter n = NfcAdapter.getDefaultAdapter(ctx); r.put("nfc", n != null && n.isEnabled()); } catch (Exception e) { r.put("nfc", JSObject.NULL); }
        try {
            // Every SIM slot (physical + eSIM): a present, enabled profile counts.
            TelephonyManager t = (TelephonyManager) ctx.getSystemService(Context.TELEPHONY_SERVICE);
            boolean sim = false;
            if (t != null) {
                int slots = Build.VERSION.SDK_INT >= 30 ? t.getActiveModemCount() : t.getPhoneCount();
                for (int i = 0; i < slots; i++) {
                    int s = t.getSimState(i);
                    if (s != TelephonyManager.SIM_STATE_ABSENT && s != TelephonyManager.SIM_STATE_UNKNOWN) { sim = true; break; }
                }
            }
            r.put("sim", sim);
        } catch (Throwable e) { r.put("sim", JSObject.NULL); }
        try {
            // Phone plugged into a computer over USB (the real exfil path).
            Intent bat = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            int plugged = bat == null ? 0 : bat.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
            r.put("usbHost", plugged == BatteryManager.BATTERY_PLUGGED_USB);
        } catch (Exception e) { r.put("usbHost", JSObject.NULL); }
        call.resolve(r);
    }
}
