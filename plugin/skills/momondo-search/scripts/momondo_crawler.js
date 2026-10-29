// Momondo dialog parser and crawler. Workers paste this file into the page. Node and the userscript build load it too.
if(typeof window==='undefined')globalThis.window={};
window.PARSER_VERSION='6.0';
// Layout from Oct 2026: booking offers first (site, labels, brand, price, Book, then bags), then legs as
// "CPH → GDL" / "tor. 3. dec." / "3 stop • 59 t. 13 min." with segments "13:40 - 15:35(1 t. 55 min.)",
// an optional "Afgang fre. 4. dec." right after the time line, then airports and flight number.
// Layout v6 (29 Oct 2026): "Fly 1 • ons. 2. dec." above the leg, "06:10 – 10:50+1(35 t. 40 min.)" as the leg's
// total time, then "3 stop • 6 t. 45 min. i Madrid ...", and the offers after "Trin 2" below the legs.
window.parseDlgV5=function(txt, legDates){
  const MON={jan:'01',feb:'02',mar:'03',apr:'04',maj:'05',jun:'06',jul:'07',aug:'08',sep:'09',okt:'10',nov:'11',dec:'12'};
  const dur=s=>{const h=/(\d+)\s*t\./.exec(s),m=/(\d+)\s*min\./.exec(s);return (h?+h[1]:0)+(m?+m[1]:0)/60};
  const addDays=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
  const mins=t=>{const [h,m]=t.split(':').map(Number);return h*60+m};
  // Day and month to a date, in the year that puts it closest to the requested leg date.
  const ymd=(d,mo,ref)=>{const y0=+(ref||legDates[0]||'2026').slice(0,4);const c=[y0-1,y0,y0+1].map(y=>y+'-'+MON[mo]+'-'+String(d).padStart(2,'0'));
    return ref?c.sort((a,b)=>Math.abs(new Date(a)-new Date(ref))-Math.abs(new Date(b)-new Date(ref)))[0]:c[1]};
  const LEG=/^[A-Z]{3} → [A-Z]{3}$/;
  const all=txt.split('\n').map(s=>s.trim()).filter(Boolean);
  const AF=/^Afgang (?:\S+ )?(\d+)\. ([a-zæø]+)/i, SUM=/^(\d\d:\d\d) [–-] (\d\d:\d\d)(?:\+(\d))?\((.*)\)$/, APT=/\([A-Z]{3}\) - .*\([A-Z]{3}\)$/;
  const first=all.findIndex(l=>LEG.test(l));const endBook=all.findIndex(l=>/^Alle priser er endelige/.test(l));
  const trin1=all.findIndex((l,i)=>i>first&&/^Trin 1:/.test(l)), trin2=all.findIndex((l,i)=>i>first&&/^Trin 2:/.test(l));
  const bl=all.slice(0,endBook>0&&endBook<first?endBook:first).concat(trin2>0?all.slice(trin2,endBook>trin2?endBook:all.length):[]);
  const lines=all.slice(first,trin1>first?trin1:all.length);
  const legIdx=[];lines.forEach((l,i)=>{if(LEG.test(l))legIdx.push(i)});
  const extra=[];
  const res=legIdx.map((s,n)=>lines.slice(s,legIdx[n+1]||lines.length)).map((L,n)=>{
    const ref=legDates[n];const above=all[first+legIdx[n]-1]||'';
    const hd=/^\S+\s+(\d+)\.\s*([a-zæø]+)/i.exec(L[1]||'')||/^Fly \d+ • \S+ (\d+)\. ([a-zæø]+)/i.exec(above);const mo=hd&&hd[2].slice(0,3).toLowerCase();
    const date=hd&&MON[mo]?ymd(hd[1],mo,ref):ref;let cur=date;
    const stopsLine=L.find(l=>/^(\d+ stop|Direkte)/i.test(l))||'';const sum=SUM.exec(L[1]||'');
    const total=sum&&!APT.test(L[2]||'')?dur(sum[4]):dur(stopsLine.split('•')[1]||'');const sn=/^(\d+) stop/.exec(stopsLine);
    const segs=[],lay=[],layCodes=[],flags=[];let overnight=false,selfx=false,aptChange=false,dated=false;
    for(let i=sum?2:1;i<L.length;i++){
      const l=L[i];
      const sg=/^(\d\d:\d\d) [–-] (\d\d:\d\d)(?:\+(\d))?\((.*)\)$/.exec(l);
      if(sg){let j=i+1,afd=false;
        while(j<L.length&&j<=i+3&&!APT.test(L[j])){const af=AF.exec(L[j]);if(af){cur=ymd(af[1],af[2].slice(0,3).toLowerCase(),cur);afd=true}j++}
        if(!APT.test(L[j]||''))j=i+1;
        if(!afd&&segs.length&&!dated){const p=segs[segs.length-1];const t=mins(p.arr)+60*(lay[segs.length-1]||0);cur=addDays(p.arrDate,Math.floor(t/1440))}
        dated=false;
        const codes=(L[j]||'').match(/\(([A-Z]{3})\)/g)||[];let fl=(L[j+1]||'').split(' • ')[0];
        if(/Betjenes af|Service mellem|godkendelse/i.test(fl))fl=(L[j+2]||'').split(' • ')[0];
        if(!/\d+$/.test(fl)||APT.test(fl)||/^\d\d:\d\d/.test(fl))fl='?';
        const plus=sg[3]!=null?+sg[3]:(mins(sg[2])<mins(sg[1])?1:0);
        segs.push({dep:sg[1],arr:sg[2],dur:sg[4],date:cur,arrDate:addDays(cur,plus),from:(codes[0]||'').replace(/[()]/g,''),to:(codes[1]||'').replace(/[()]/g,''),fl});
        i=j+1;continue}
      const lv=/^(.*?)•Skift (fly|lufthavn|terminal)/.exec(l);
      if(lv){lay.push(+dur(lv[1]).toFixed(2));const p=segs[segs.length-1]||{};layCodes.push((/\(([A-Z]{3})\)\s*$/.exec(l)||[])[1]||p.to||'');
        if(lv[2]==='lufthavn'){aptChange=true;extra.push(l)}continue}
      if(AF.test(l)){const af=AF.exec(l);cur=ymd(af[1],af[2].slice(0,3).toLowerCase(),cur);dated=true;continue}
      if(/^Egentransfer$/.test(l))selfx=true;
      if(/^Lang mellemlanding/.test(l))flags.push('long_layover');
      if(/overnat|visum|Natophold/i.test(l)&&!/^\d\d:\d\d/.test(l))extra.push(l);
    }
    if(!segs.length)return null;
    for(let i=0;i<segs.length-1;i++){
      if(lay[i]!=null&&mins(segs[i].arr)+lay[i]*60>=1440)overnight=true;
      if(segs[i].to!==segs[i+1].from)aptChange=true;
    }
    const a=segs[0],z=segs[segs.length-1];
    return {dep:a.date+'T'+a.dep,arr:z.arrDate+'T'+z.arr,hours:+total.toFixed(2),stops:sn?+sn[1]:0,via:layCodes,layover_h:lay,carriers:[...new Set(segs.filter(s=>s.fl!=='?').map(s=>s.fl.replace(/\s*\d+$/,'')))],flights:segs.map(s=>s.fl),overnight_layover:overnight,_self:selfx,_apt:aptChange,_segs:segs.map(s=>s.from+'-'+s.to+' '+s.dep+'-'+s.arr),_flags:flags};
  }).filter(Boolean);
  // Offers: a price line followed by "Book". The up to 4 lines above it are site, labels and fare brand.
  const LAB=/^(Laveste pris|Egentransfer-beskyttelse|Annonce|Sponsoreret|Bedste valg|Billigst|Hurtigst|Flyselskab)$/;
  const STOP=/:|^Book$|gebyr|refunderes|benplads|bagage|sædevalg|billetændring|ændring af billet|→|muligheder|bookingsiden|gennemført|^Trin \d|^Bestil /i;
  const offers=[];
  bl.forEach((l,j)=>{if(!/^[\d.]+\s*kr\.$/.test(l)||bl[j+1]!=='Book')return;let k=j-1;while(k>=0&&j-k<=4&&!STOP.test(bl[k]))k--;
    const grp=bl.slice(k+1,j),labs=grp.filter(x=>LAB.test(x)),names=grp.filter(x=>!LAB.test(x));
    offers.push({start:k+1,j,site:names[0]||null,brand:names.length>1?names[names.length-1]:null,price:+l.replace(/\D/g,''),prot:labs.includes('Egentransfer-beskyttelse'),ad:labs.includes('Annonce')||labs.includes('Sponsoreret')});});
  offers.forEach((o,i)=>{o.txt=bl.slice(o.j,offers[i+1]?offers[i+1].start:bl.length).join(' | ')});
  const real=offers.filter(o=>!o.ad);const best=(real.length?real:offers).slice().sort((x,y)=>x.price-y.price)[0]||{};
  const alt=offers.filter(o=>o!==best&&!o.ad).slice(0,3).map(o=>o.site+' '+o.price).join(' / ');
  return {price:best.price||null,allPrices:offers.map(o=>o.price),alt,prot:!!best.prot,site:best.site||null,brand:best.brand||null,selfNote:res.some(l=>l._self),bagSeg:best.txt||'',extra,legs:res};
};
window.parseDlg=function(txt, legDates){
  if(/^[A-Z]{3} → [A-Z]{3}$/m.test(txt))return window.parseDlgV5(txt,legDates);
  const MON={jan:'01',feb:'02',mar:'03',apr:'04',maj:'05',jun:'06',jul:'07',aug:'08',sep:'09',okt:'10',nov:'11',dec:'12'};
  const dur=s=>{const h=/(\d+)\s*t\./.exec(s),m=/(\d+)\s*min\./.exec(s);return (h?+h[1]:0)+(m?+m[1]:0)/60};
  const addDays=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
  const k=txt.indexOf('Bookingmuligheder');
  const head=txt.slice(0,k>0?k:txt.length), book=k>0?txt.slice(k):'';
  const lines=head.split('\n').map(s=>s.trim()).filter(Boolean);
  const legIdx=[];lines.forEach((l,i)=>{if(/^(Fly \d+|Afrejse|Udrejse|Hjemrejse) •/.test(l))legIdx.push(i)});if(legIdx.length<Math.min(legDates.length,2)){legIdx.length=0;const sums=[];lines.forEach((l,i)=>{if(/^\d\d:\d\d [–-] \d\d:\d\d(\+\d)?\(/.test(l)&&!/\([A-Z]{3}\)/.test(lines[i+1]||''))sums.push(i)});let prev=-1;sums.forEach(i=>{const st=Math.max(prev+1,i-2);legIdx.push(st);prev=i});if(!legIdx.length){const i0=lines.findIndex(l=>/^\d\d:\d\d [–-] \d\d:\d\d/.test(l));if(i0>=0)legIdx.push(Math.max(0,i0-2));}}
  const legs=legIdx.map((s,n)=>lines.slice(s,legIdx[n+1]||lines.length));
  const extra=[];
  const res=legs.map((L,n)=>{
    let date=legDates[n];const hd=/•\s*\S+\s+(\d+)\.\s*(\w+)\.?/.exec(L[0]||'');if(hd&&MON[hd[2].slice(0,3)]){const y=(['jan','feb'].includes(hd[2].slice(0,3)))?'2027':'2026';date=y+'-'+MON[hd[2].slice(0,3)]+'-'+String(hd[1]).padStart(2,'0');}let cur=date;
    const sm=L.find(l=>/^\d\d:\d\d [–-] \d\d:\d\d(\+\d)?\(/.test(l))||'';
    const m=/^(\d\d:\d\d) [–-] (\d\d:\d\d)(?:\+(\d))?\((.*)\)$/.exec(sm)||[];
    const stopsLine=L.find(l=>/(^|\s)(\d+ stop|Direkte)/i.test(l))||'';
    const sn=/(\d+) stop/.exec(stopsLine);
    const segs=[],lay=[],layCodes=[],flags=[];let overnight=false,selfx=false,aptChange=false;
    for(let i=0;i<L.length;i++){
      const l=L[i];
      const af=/^Afgang \S+ (\d+)\. (\w+)/.exec(l); if(af){const y=(['jan','feb'].includes(af[2]))?'2027':'2026';cur=y+'-'+MON[af[2]]+'-'+String(af[1]).padStart(2,'0');continue}
      const sg=/^(\d\d:\d\d) - (\d\d:\d\d)(?:\+\d)?\((.*)\)$/.exec(l);
      if(sg){const codes=(L[i+1]||'').match(/\(([A-Z]{3})\)/g)||[];let al=(L[i+2]||'').split(' • ')[0];if(/Service mellem|godkendelse|Betjenes af/i.test(al))al=(L[i+3]||'').split(' • ')[0];
        segs.push({dep:sg[1],arr:sg[2],dur:sg[3],date:cur,from:(codes[0]||'').replace(/[()]/g,''),to:(codes[1]||'').replace(/[()]/g,''),fl:al});continue}
      const lv=/^(.*?)•Skift (\S+)(?: \S+)? i (.*)\((\w{3})\)/.exec(l);
      if(lv){lay.push(+dur(lv[1]).toFixed(2));layCodes.push(lv[4]);if(/lufthavn/i.test(l))aptChange=true;continue}
      if(/^Egentransfer$/.test(l))selfx=true;
      if(/^Lang mellemlanding/.test(l))flags.push('long_layover');
      if(/lufthavn|overnat|visum|Skift terminal|Natophold/i.test(l)&&!/^\d\d:\d\d/.test(l)&&!/•Skift fly/.test(l))extra.push(l);
    }
    for(let i=0;i<segs.length-1;i++){
      const [h,mi]=segs[i].arr.split(':').map(Number);
      if(lay[i]!=null&&h*60+mi+lay[i]*60>=1440)overnight=true;
      if(segs[i].to!==segs[i+1].from)aptChange=true;
    }
    return {dep:date+'T'+m[1],arr:addDays(date,+(m[3]||0))+'T'+m[2],hours:+dur(m[4]||'').toFixed(2),stops:sn?+sn[1]:0,via:layCodes,layover_h:lay,carriers:[...new Set(segs.map(s=>s.fl.replace(/\s*\d+$/,'')))],flights:segs.map(s=>s.fl),overnight_layover:overnight,_self:selfx,_apt:aptChange,_segs:segs.map(s=>s.from+'-'+s.to+' '+s.dep+'-'+s.arr),_flags:flags};
  });
  const bl=book.split('\n').map(x=>x.trim()).filter(Boolean);
  const offers=[];const LAB=/^(Laveste pris|Egentransfer-beskyttelse|Annonce|Bedste valg|Billigst)$/;const pidx=[];bl.forEach((l,i)=>{if(/^[\d.]+\s*kr\.$/.test(l))pidx.push(i)});
  pidx.forEach((j,ix)=>{let k=j-2;const labs=[];while(k>0&&LAB.test(bl[k])&&bl[k]!=='Annonce'){labs.push(bl[k]);k--;}
    const site=bl[k];const end=(pidx[ix+1]!=null?pidx[ix+1]-3:bl.length);
    offers.push({site,price:+bl[j].replace(/\D/g,''),brand:bl[j-1],prot:labs.includes('Egentransfer-beskyttelse')||/Egentransfer-beskyttelse/.test(bl[j-2]||''),txt:bl.slice(j,end).join(' | ')});});
  const real=offers.filter(o=>o.site!=='Annonce'&&o.site!=='Sponsoreret');const best=(real.length?real:offers).slice().sort((x,y)=>x.price-y.price)[0]||{};
  const alt=offers.filter(o=>o!==best).slice(0,3).map(o=>o.site+' '+o.price).join(' / ');
  const bagSeg=best.txt||'';const site=best.site||null;const brand=best.brand||null;const prices=offers.map(o=>o.price);
  return {price:best.price||null,allPrices:prices,alt,prot:best.prot,site,brand,selfNote:res.some(l=>l._self),bagSeg,extra,legs:res};
};
window.crawl=async (start,end,legDates)=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));const out=[];const seen=new Set();
  const nums=[...document.querySelectorAll('[role="group"]')].map(e=>(/^Resultat nr\. (\d+)$/.exec(e.getAttribute('aria-label')||'')||[])[1]).filter(x=>x!=null).map(Number).sort((a,b)=>a-b);
  const pick=nums.slice(start,end);
  for(const i of pick){
    const card=[...document.querySelectorAll('[role="group"]')].find(e=>e.getAttribute('aria-label')==='Resultat nr. '+i);
    if(!card){out.push({rank:i+1,err:'nocard'});continue}
    card.scrollIntoView();const vb=[...card.querySelectorAll('button,a,[role="button"]')].find(b=>/^Vælg$/.test((b.innerText||'').trim()));(vb||card).click();let d=null;for(let w=0;w<10&&!d;w++){await sleep(400);d=[...document.querySelectorAll('[role="dialog"]')].find(x=>!/drawer/i.test(x.className)&&/(Fly \d+|Afrejse|Hjemrejse) •|\d\d:\d\d - \d\d:\d\d\(/.test(x.innerText));}
    if(!d){out.push({rank:i+1,err:'nodialog'});continue}
    d.querySelectorAll('.E69K-leg-dropdown-header[role="button"]').forEach(b=>b.click());const NL=legDates.length;for(let w=0;w<10;w++){await sleep(400);const tx=d.innerText;const hdr=(tx.match(/(Fly \d+|Afrejse|Udrejse|Hjemrejse) •|^[A-Z]{3} → [A-Z]{3}$/gm)||[]).length;const sg=(tx.match(/\d\d:\d\d - \d\d:\d\d(?:\+\d)?\(/g)||[]).length;if(sg>=Math.max(hdr,1)&&(hdr>=Math.min(NL,2)||NL==1||w>=4))break;}
    if(i===start)window.__dlg0=d.innerText;const p=parseDlg(d.innerText,legDates);p.rank=i+1;p.cardPrice=+(((card.innerText.match(/([\d.]+)\s*kr\./g)||[]).pop()||'').replace(/\D/g,''))||null;
    const sig=p.legs.map(l=>l.flights.join('+')+l.dep).join('/');
    p.dup=seen.has(sig+p.price);seen.add(sig+p.price);
    out.push(p);
    if(location.hash==='#dialog'||d&&document.body.contains(d)){history.back();await sleep(800);}
  }
  return out;
};
window.lines=function(res,max,nl){nl=nl||2;const o=[];for(const p of res){if(p.err||p.dup||p.site==='Sponsoreret'||p.site==='Annonce')continue;if(o.length>=max)break;
const leg=l=>[l.dep.slice(5),l.arr.slice(5),l.hours,l.stops,l.via.join(' '),l.layover_h.join(' '),l.flights.join('+'),l.overnight_layover?1:0,l._apt?1:0].join(',');
const cab=(/(\d) x håndbagage/.exec(p.bagSeg)||[])[0]||(/Gebyr for håndbagage/.test(p.bagSeg)?'fee':'');const chk=/Gebyr for indtjekket/.test(p.bagSeg)?'paid':(/(\d) x indtjekket/.test(p.bagSeg)?'incl':'');
o.push([p.rank,p.cardPrice||p.price,p.site,p.selfNote?1:0,p.brand,cab,chk,/Ændring af billet mod gebyr/.test(p.bagSeg)?'fee':'',(p.alt+(p.cardPrice&&p.price!==p.cardPrice?' | offerprice '+p.price:'')),p.prot?1:0].join(';')+'~'+Array.from({length:nl},(_,i)=>p.legs[i]?leg(p.legs[i]):'').join('~'));}
return o.join('\n');};
window.run=async(n,dates,max)=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Done when Momondo says so, or when the result list has not changed for 4 polls (the progress bar can stall at 50%).
const sig=()=>{const g=document.querySelectorAll('[role="group"][aria-label^="Resultat nr."]');return g.length+'|'+((g[0]&&g[0].innerText.match(/[\d.]+\s*kr\./g))||[]).pop()};
const DONE=/Færdig|Resultaterne er hentet/;let last='',same=0,fin=false;
for(let w=0;w<60;w++){const t=document.body.innerText,n=document.querySelectorAll('[role="group"]').length;if(DONE.test(t)&&n>3){fin=true;break}
const s=sig();same=s===last&&n>3?same+1:0;last=s;if(same>=4)break;await sleep(2000);}
await sleep(1500);const t=document.body.innerText;const cnt=(/([\d.]+) resultater/.exec(t)||[])[1]||document.querySelectorAll('[role="group"][aria-label^="Resultat nr."]').length;
fin=fin||DONE.test(t);
const R=await crawl(0,n,dates);window.R=R;return 'count='+cnt+' done='+fin+' title='+document.title+'\n'+lines(R,max,dates.length);};
if(typeof module!=='undefined'&&module.exports)module.exports={parseDlg:window.parseDlg,lines:window.lines,PARSER_VERSION:window.PARSER_VERSION};
