package money.honest.seedvault;

import android.content.ContentResolver;
import android.content.Context;
import android.hardware.usb.UsbManager;
import android.net.ConnectivityManager;
import android.net.wifi.WifiManager;
import android.nfc.NfcAdapter;
import android.provider.Settings;
import android.telephony.TelephonyManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Read-only radio and connection status for the pre-unlock checklist.
 * Only reads on/off state; it cannot connect to anything (INTERNET stays removed).
 * Each value is null when Android refuses to tell us.
 */
@CapacitorPlugin(name = "VaultRadioCheck")
public class VaultRadioCheckPlugin extends Plugin {
    @PluginMethod public void status(PluginCall call) {
        Context ctx = getContext();
        ContentResolver cr = ctx.getContentResolver();
        JSObject r = new JSObject();
        try { r.put("airplane", Settings.Global.getInt(cr, Settings.Global.AIRPLANE_MODE_ON, 0) == 1); } catch (Exception e) { r.put("airplane", JSObject.NULL); }
        try { WifiManager w = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE); r.put("wifi", w != null && w.isWifiEnabled()); } catch (Exception e) { r.put("wifi", JSObject.NULL); }
        try { r.put("bluetooth", Settings.Global.getInt(cr, "bluetooth_on", 0) != 0); } catch (Exception e) { r.put("bluetooth", JSObject.NULL); }
        try { NfcAdapter n = NfcAdapter.getDefaultAdapter(ctx); r.put("nfc", n != null && n.isEnabled()); } catch (Exception e) { r.put("nfc", JSObject.NULL); }
        try {
            TelephonyManager t = (TelephonyManager) ctx.getSystemService(Context.TELEPHONY_SERVICE);
            int s = t == null ? TelephonyManager.SIM_STATE_ABSENT : t.getSimState();
            r.put("sim", s != TelephonyManager.SIM_STATE_ABSENT && s != TelephonyManager.SIM_STATE_UNKNOWN);
        } catch (Exception e) { r.put("sim", JSObject.NULL); }
        try { ConnectivityManager c = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE); r.put("network", c != null && c.getActiveNetwork() != null); } catch (Exception e) { r.put("network", JSObject.NULL); }
        try { UsbManager u = (UsbManager) ctx.getSystemService(Context.USB_SERVICE); r.put("usb", u == null ? 0 : u.getDeviceList().size()); } catch (Exception e) { r.put("usb", JSObject.NULL); }
        call.resolve(r);
    }
}
