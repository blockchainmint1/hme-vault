/** A single self-contained HTML file that unlocks a Seed Vault code with no internet and no app. */
export const STANDALONE_UNLOCKER = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vault Unlocker (offline)</title>
<style>body{font:16px system-ui,sans-serif;max-width:560px;margin:2rem auto;padding:0 1rem}textarea,input{width:100%;box-sizing:border-box;padding:.6rem;margin:.3rem 0 1rem;font:inherit}button{padding:.7rem 1.2rem;font:inherit}#out{font-family:monospace;white-space:pre-wrap;padding:1rem;border:1px solid #888;margin-top:1rem}</style></head>
<body><h1>Vault Unlocker</h1>
<p>Works fully offline. Disconnect first. HMVAULT1: PBKDF2-SHA512 + AES-256-GCM. Recovered files are NOT encrypted. Close this page when finished.</p>
<label>Open backup file<input id="file" type="file" accept=".txt,text/plain"></label>
<label>Vault code<textarea id="v" rows="4"></textarea></label>
<label>Password<input id="p" type="password"></label>
<button id="go">Unlock</button><button id="hide">Hide and clear</button><div id="out" hidden></div><div id="files"></div>
<script>
const e=new TextEncoder();
let urls=[];function clear(){urls.forEach(URL.revokeObjectURL);urls=[];document.getElementById('files').replaceChildren();document.getElementById('out').textContent='';document.getElementById('out').hidden=true;document.getElementById('p').value=''}
document.getElementById('hide').onclick=clear;
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear()});
document.getElementById('file').onchange=async x=>{const f=x.target.files[0];if(f){if(f.size>3*1024*1024){alert('Backup is too large.');return}document.getElementById('v').value=await f.text()}};
function u(s){s=s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4);return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
document.getElementById('go').onclick=async()=>{const password=document.getElementById('p').value;clear();const o=document.getElementById('out');o.hidden=false;o.textContent='Unlocking…';
try{const p=document.getElementById('v').value.trim().replace(/\\s+/g,'').split('.');if(p.length!==5||p[0]!=='HMVAULT1')throw new Error("That isn't a Seed Vault code.");
const iterations=Number(p[1]);if(!Number.isInteger(iterations)||iterations<1000||iterations>10000000)throw new Error('Invalid iteration count.');
const b=await crypto.subtle.importKey('raw',e.encode(password.normalize('NFKD')),'PBKDF2',false,['deriveKey']);
const k=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-512',salt:u(p[2]),iterations:Number(p[1])},b,{name:'AES-GCM',length:256},false,['decrypt']);
let t;try{t=await crypto.subtle.decrypt({name:'AES-GCM',iv:u(p[3]),additionalData:e.encode('HMVAULT1')},k,u(p[4]))}catch(_){throw new Error('Wrong password, or the code was damaged.')}
const txt=new TextDecoder().decode(t);if(txt[0]==='{'){const j=JSON.parse(txt);if(j.v!==1||j.kind!=='hm-seed-vault'||!Array.isArray(j.seeds))throw new Error('Unsupported Vault payload.');const lines=j.seeds.map(s=>s.name+(s.passphrase?' (passphrase: '+s.passphrase+')':'')+'\\n'+s.words.split(' ').map((w,i)=>(i+1)+'. '+w).join('\\n'));for(const s of j.secrets||[]){if(s.type==='file'){const a=document.createElement('a');const bytes=Uint8Array.from(atob(s.content),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));urls.push(url);a.href=url;a.download=(s.filename||'secret.bin').replace(/[\\\\/]/g,'_');a.textContent='Save '+s.name+' ('+s.filename+') — unencrypted';const row=document.createElement('p');row.append(a);document.getElementById('files').append(row)}else lines.push(s.name+' ('+s.type+')\\n'+s.content)}o.textContent=lines.join('\\n\\n')||'No text secrets. Use the file links below.'}else o.textContent=txt.split(' ').map((w,i)=>(i+1)+'. '+w).join('\\n')}catch(x){o.textContent=x.message}};
</script></body></html>`;
