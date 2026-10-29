(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));
const price=a=>+a.match(/^From (\d+)/)[1];
const els=()=>[...document.querySelectorAll('[aria-label^="From "]')].filter(e=>e.getAttribute('aria-label').includes('Select flight'));
const uniq=()=>{const m=new Map();for(const e of els()){const a=e.getAttribute('aria-label').replace(' Select flight','');if(!m.has(a))m.set(a,e)}return m};
const cp=a=>{const g=(r)=>{const m=a.match(r);return m?m[1]:'?'};const lay=[...a.matchAll(/is an? (.+?) layover at (.+?) in ([^.]+)\./g)].map(m=>m[3]+' '+m[1].replace(' hr ','h').replace(' min','m')+(/overnight/i.test(m[0])?'(ON)':''));
return price(a)+'|'+g(/\. (\d+ stops?|Nonstop) flight/)+'|'+g(/flight with (.+?)\. (?:Operated|Leaves)/)+(/Operated by ([^.]+)\./.test(a)?'{'+g(/Operated by ([^.]+)\./)+'}':'')+'|'+g(/Leaves (.+?) at /).slice(0,14)+' '+g(/ at (\d+:\d+ [AP]M) on/)+'>'+g(/arrives at .+? at (\d+:\d+ [AP]M) on/)+' '+g(/arrives at .+? on (\w+, \w+ \d+)/)+'|'+g(/Total duration (.+?)\./)+'|'+lay.join('; ')+(/overnight/i.test(a)?' [OVERNIGHT]':'')};
if(els().length==0){const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()=='Search');if(b)b.click()}
for(let i=0;i<25&&els().length==0;i++)await sl(1000);
await sl(6000);
const ex=async()=>{const b=[...document.querySelectorAll('button')].find(b=>/View more flights/.test(b.innerText));if(b){b.click();await sl(2500)}};
await ex();
const m1=uniq();const l1=[...m1.keys()].sort((a,b)=>price(a)-price(b));
const res=['N1='+l1.length,...l1.slice(0,10).map(cp)];
for(const k of [0,1]){
 await ex();const cur=uniq();const sorted=[...cur.keys()].sort((a,b)=>price(a)-price(b));const air=x=>(x.match(/flight with (.+?)\. (?:Operated|Leaves)/)||[])[1];const lab=k==0?sorted[0]:sorted.find(x=>air(x)!=air(sorted[0]));if(!lab)break;
 cur.get(lab).click();await sl(4000);
 await ex();const m2=uniq();const l2=[...m2.keys()].sort((a,b)=>price(a)-price(b));
 res.push('--PICK'+k+' '+cp(lab).slice(0,60)+' LEG2 n='+l2.length);
 l2.slice(0,5).forEach(x=>res.push('  L2 '+cp(x)));
 if(l2.length){m2.get(l2[0]).click();await sl(4500);const t=document.body.innerText;const i=t.indexOf('Selected flights');const j=t.indexOf('Booking options');res.push('  BOOK '+new URL(location.href).searchParams.get('tfs'));res.push('  TXT '+t.slice(i,j+450).replace(/\n/g,' / '));history.go(-1);await sl(3000);}
 history.go(-1);await sl(3500);
}
return res.join('\n')})()
