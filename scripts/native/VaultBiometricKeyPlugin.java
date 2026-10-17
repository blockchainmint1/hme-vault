package money.honest.seedvault;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.security.keystore.StrongBoxUnavailableException;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Hardware-bound fingerprint unlock.
 *
 * An AES-256 key is generated inside the Android Keystore (StrongBox / Titan M2
 * when present). The key never leaves the secure hardware, can only be used for
 * one operation right after a strong biometric match, and is permanently
 * invalidated by the OS when a new fingerprint is enrolled or the screen lock is
 * removed. Only the AES-GCM ciphertext of the unlock secret is kept in app
 * preferences; without the hardware key and a live fingerprint it is useless.
 */
@CapacitorPlugin(name = "VaultBiometricKey")
public class VaultBiometricKeyPlugin extends Plugin {
    private static final String ALIAS = "hmv.bio.key.v2";
    private static final String PREFS = "hmv.bio.v2";
    private static final String KS = "AndroidKeyStore";
    private static final int STRONG = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void status(PluginCall call) {
        int can = BiometricManager.from(getContext()).canAuthenticate(STRONG);
        JSObject r = new JSObject();
        r.put("available", can == BiometricManager.BIOMETRIC_SUCCESS);
        r.put("enrolled", prefs().contains("ct") && hasKey());
        r.put("strongBox", prefs().getBoolean("strongBox", false));
        call.resolve(r);
    }

    @PluginMethod
    public void enroll(PluginCall call) {
        String secret = call.getString("secret");
        if (secret == null || secret.isEmpty()) { call.reject("Missing secret."); return; }
        try {
            deleteAll();
            boolean strongBox = generateKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getKey());
            prompt(call, cipher, "Turn on fingerprint unlock", "Touch the sensor to seal your unlock key", result -> {
                try {
                    Cipher c = result.getCryptoObject().getCipher();
                    byte[] ct = c.doFinal(secret.getBytes(StandardCharsets.UTF_8));
                    prefs().edit()
                        .putString("ct", Base64.encodeToString(ct, Base64.NO_WRAP))
                        .putString("iv", Base64.encodeToString(c.getIV(), Base64.NO_WRAP))
                        .putBoolean("strongBox", strongBox)
                        .apply();
                    JSObject r = new JSObject();
                    r.put("strongBox", strongBox);
                    call.resolve(r);
                } catch (Exception e) { deleteAll(); call.reject("Could not seal the unlock key.", "FAILED", e); }
            }, this::deleteAll);
        } catch (Exception e) {
            deleteAll();
            call.reject("Fingerprint unlock could not be set up on this phone.", "FAILED", e);
        }
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        String ct = prefs().getString("ct", null);
        String iv = prefs().getString("iv", null);
        if (ct == null || iv == null || !hasKey()) { deleteAll(); call.reject("Fingerprint unlock is off.", "NOT_ENROLLED"); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getKey(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            prompt(call, cipher, "Unlock HME Vault", "Confirm your fingerprint", result -> {
                try {
                    byte[] pt = result.getCryptoObject().getCipher().doFinal(Base64.decode(ct, Base64.NO_WRAP));
                    JSObject r = new JSObject();
                    r.put("secret", new String(pt, StandardCharsets.UTF_8));
                    call.resolve(r);
                } catch (Exception e) { call.reject("Fingerprint unlock failed.", "FAILED", e); }
            }, null);
        } catch (KeyPermanentlyInvalidatedException e) {
            deleteAll();
            call.reject("Your phone's fingerprints or screen lock changed, so fingerprint unlock was switched off. Unlock with your password or coin, then turn it on again in Settings.", "INVALIDATED");
        } catch (Exception e) {
            call.reject("Fingerprint unlock failed.", "FAILED", e);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        deleteAll();
        call.resolve();
    }

    private interface Success { void run(BiometricPrompt.AuthenticationResult r); }

    private void prompt(PluginCall call, Cipher cipher, String title, String subtitle, Success ok, Runnable onFail) {
        FragmentActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            BiometricPrompt bp = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) { ok.run(result); }
                @Override public void onAuthenticationError(int code, @NonNull CharSequence msg) {
                    if (onFail != null) onFail.run();
                    call.reject(msg.toString(), "CANCELLED");
                }
            });
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title).setSubtitle(subtitle)
                .setNegativeButtonText("Use password")
                .setAllowedAuthenticators(STRONG)
                .setConfirmationRequired(false)
                .build();
            bp.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
        });
    }

    private boolean generateKey() throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try { generate(true); return true; } catch (StrongBoxUnavailableException e) { /* fall back to TEE */ }
        }
        generate(false);
        return false;
    }

    private void generate(boolean strongBox) throws Exception {
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        }
        if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) b.setIsStrongBoxBacked(true);
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KS);
        kg.init(b.build());
        kg.generateKey();
    }

    private SecretKey getKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(KS);
        ks.load(null);
        return (SecretKey) ks.getKey(ALIAS, null);
    }

    private boolean hasKey() {
        try { KeyStore ks = KeyStore.getInstance(KS); ks.load(null); return ks.containsAlias(ALIAS); } catch (Exception e) { return false; }
    }

    private void deleteAll() {
        try { KeyStore ks = KeyStore.getInstance(KS); ks.load(null); ks.deleteEntry(ALIAS); } catch (Exception e) { /* ignore */ }
        prefs().edit().clear().apply();
    }
}
