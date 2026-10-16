/** A single self-contained HTML file that unlocks a Seed Vault code with no internet and no app. */
export const STANDALONE_UNLOCKER = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seed Vault Unlocker (offline)</title>
<style>body{font:16px system-ui,sans-serif;max-width:560px;margin:2rem auto;padding:0 1rem}textarea,input{width:100%;box-sizing:border-box;padding:.6rem;margin:.3rem 0 1rem;font:inherit}button{padding:.7rem 1.2rem;font:inherit}#out{font-family:monospace;white-space:pre-wrap;padding:1rem;border:1px solid #888;margin-top:1rem}</style></head>
<body><h1>Seed Vault Unlocker</h1>
<p>Works fully offline. Turn off Wi-Fi first. Format: HMVAULT1 (PBKDF2-SHA512 + AES-256-GCM), documented at mobile.honest.money.</p>
<label>Vault code<textarea id="v" rows="4"></textarea></label>
<label>Password<input id="p" type="password"></label>
<button id="go">Unlock</button><div id="out" hidden></div>
<script>
const e=new TextEncoder();
function u(s){s=s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4);return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
document.getElementById('go').onclick=async()=>{const o=document.getElementById('out');o.hidden=false;o.textContent='Unlocking…';
try{const p=document.getElementById('v').value.trim().replace(/\\s+/g,'').split('.');if(p.length!==5||p[0]!=='HMVAULT1')throw new Error("That isn't a Seed Vault code.");
const b=await crypto.subtle.importKey('raw',e.encode(document.getElementById('p').value.normalize('NFKD')),'PBKDF2',false,['deriveKey']);
const k=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-512',salt:u(p[2]),iterations:Number(p[1])},b,{name:'AES-GCM',length:256},false,['decrypt']);
let t;try{t=await crypto.subtle.decrypt({name:'AES-GCM',iv:u(p[3]),additionalData:e.encode('HMVAULT1')},k,u(p[4]))}catch(_){throw new Error('Wrong password, or the code was damaged.')}
const txt=new TextDecoder().decode(t);if(txt[0]==='{'){const j=JSON.parse(txt);o.textContent=j.seeds.map(s=>s.name+(s.passphrase?' (passphrase: '+s.passphrase+')':'')+'\\n'+s.words.split(' ').map((w,i)=>(i+1)+'. '+w).join('\\n')).join('\\n\\n')}else o.textContent=txt.split(' ').map((w,i)=>(i+1)+'. '+w).join('\\n')}catch(x){o.textContent=x.message}};
</script></body></html>`;
