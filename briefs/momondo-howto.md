# Momondo.dk crawl how-to (worked 28 Oct 2026, built-in browser pane, tab "seed")

## 1. URL patterns (DKK, 1 adult, economy by default)
- Multi-city / open jaw (USED, works): https://www.momondo.dk/flight-search/CPH-GUA/2026-12-03/VVI-CPH/2027-02-03?sort=price_a
- Cheapest first: ?sort=price_a   Fastest first: ?sort=duration_a   (both USED and verified)
- "Best" (Bedste) sort: NOT tested by me. Untested guess: ?sort=bestflight_a. Verify before relying on it.
- Return trip pattern (NOT tested by me): https://www.momondo.dk/flight-search/CPH-GUA/2026-12-03/2027-02-03?sort=price_a
- Result page title shows the first route only ("CPH til VVI, 3.12. - 3.2."), ignore it.
- The mobile layout is used (narrow pane): each result is div[role="group"][aria-label="Resultat nr. N"] (N from 0). Opening a card (click) shows a dialog (URL gets #dialog; #default when closed).

## 2. Workflow per search (one block of tool calls)
1. navigate (tabId "seed") to the search URL.
2. wait 5 s (computer wait), then ONE javascript_tool call that evals the stored crawler and starts it in the background:
   eval(localStorage.getItem('crawlsrc')); window.__out=null; run(9,['2026-12-03','2027-02-03'],8).then(v=>window.__out=v).catch(e=>window.__out='ERR '+e); location.href
   (run(nCardsToOpen, [outDate, homeDate], maxRowsReturned). Use run(5,...,5) for fastest-sort queries.)
3. wait 4 x 10 s (computer wait), then poll: javascript_tool text `window.__out` (null = still running; wait 10 s more and poll again).
4. __out is: "count=<results> done=<bool> title=..." then one line per itinerary (format below), dups removed.
First time only: install the crawler into localStorage (origin momondo.dk): paste section 4 into a javascript_tool call, then
   localStorage.setItem('crawlsrc','window.parseDlg='+parseDlg.toString()+';window.crawl='+crawl.toString()+';window.lines='+lines.toString()+';window.run='+run.toString())
After a page navigation window.* is lost, so each search re-evals localStorage.crawlsrc (step 2). localStorage survives between searches on momondo.dk.

Line format (fields separated by ';', legs by '~'):
 rank;cardPrice;bookingSite;selfTransfer(0/1);fareBrand;cabinBag;checkedBag;changeable;otherOffers(+offerprice);selfTransferProtection(0/1) ~ OUT ~ HOME
 leg = depMM-DDTHH:MM,arrMM-DDTHH:MM(local, +days applied),hours,stops,viaAirports(space),layoverHours(space),flights(Airline NNN joined by +),overnight(0/1),airportChange(0/1)
- cardPrice = the price on the result card (cheapest real offer). bookingSite is the cheapest non-ad offer. otherOffers lists the other providers incl. "Annonce 10320" (= ad offers, usually 200-2000 DKK dearer; ignore them). "Egentransfer" = self-transfer (separate tickets); selfNote=1 if the dialog says so.
- Rows with no flights/via (empty fields) = dialog was not fully expanded; re-run or ignore (flag incomplete).
- Carriers are airline names only (no IATA codes). Dups = same flights+dep+price are skipped.

## 3. "Search finished" detection, cookie banner, pitfalls
- Finished = page text contains "Færdig" (Danish for done; in progress it shows "Sammenligner flysider...") AND more than 3 [role="group"] cards. run() polls every 2 s up to 120 s, then sleeps 1.5 s. Result count text: "1153 resultater" (sometimes missing, count=undefined, harmless).
- Cookie banner (momondo privacy dialog): click the "Afvis alle" (reject all) button once: find query "Afvis alle" then computer left_click on the ref. It stays dismissed afterwards. Never click "Acceptér alle".
- javascript_tool has a hard 45 s timeout (error: "timed out after 45s", script may keep running). Workaround: never await the whole crawl; start with .then(v=>window.__out=v) and poll window.__out in later calls (see step 2/3). A crawl of 9 cards takes about 30 s, plus up to 60 s of waiting for the search.
- history.back pitfall: closing the dialog with history.back() when the dialog did not open walks back to the PREVIOUS page (an earlier search URL), wiping window.* and the results (happened twice). Fix (in the code below): only call history.back() if location.hash==='#dialog' or a [role="dialog"] exists. Also start the crawl only after navigate + 5 s wait, and do not run two crawls at once in one tab.
- Do not start a second crawl while the first one is still running (timed-out call keeps running): wait 20-30 s first.
- Detail dialog text (innerText) contains legs "Fly 1 • ...", "Fly 2 • ...", segment lines "HH:MM - HH:MM(duration)", airports "Name (XXX) - Name (YYY)", "Airline NNN • aircraft", layover lines "<h> t. <m> min.•Skift fly i <City> (XXX)", "Lang mellemlanding", "Egentransfer", "Afgang <weekday> D. mon" (next-day departure), then "Bookingmuligheder" with one block per provider: site, labels (Laveste pris / Egentransfer-beskyttelse / Annonce), fare brand, price "8.408 kr.", baggage lines ("1 x håndbagage", "Gebyr for indtjekket bagage"...). Legs are expanded by clicking .E69K-leg-dropdown-header[role="button"] (class name may change; re-inspect if "nodialog"/empty legs).

## 4. The crawler JavaScript (verbatim, from localStorage.crawlsrc; the older rows() JSON helper is omitted)
```js
window.parseDlg=function(txt, legDates){
  const MON={jan:'01',feb:'02',mar:'03',apr:'04',maj:'05',jun:'06',jul:'07',aug:'08',sep:'09',okt:'10',nov:'11',dec:'12'};
  const dur=s=>{const h=/(\d+)\s*t\./.exec(s),m=/(\d+)\s*min\./.exec(s);return (h?+h[1]:0)+(m?+m[1]:0)/60};
  const addDays=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
  const k=txt.indexOf('Bookingmuligheder');
  const head=txt.slice(0,k>0?k:txt.length), book=k>0?txt.slice(k):'';
  const lines=head.split('\n').map(s=>s.trim()).filter(Boolean);
  const legIdx=[];lines.forEach((l,i)=>{if(/^Fly [12] •/.test(l))legIdx.push(i)});
  const legs=legIdx.map((s,n)=>lines.slice(s,legIdx[n+1]||lines.length));
  const extra=[];
  const res=legs.map((L,n)=>{
    const date=legDates[n]; let cur=date;
    const sm=L.find(l=>/^\d\d:\d\d [–-] \d\d:\d\d(\+\d)?\(/.test(l))||'';
    const m=/^(\d\d:\d\d) [–-] (\d\d:\d\d)(?:\+(\d))?\((.*)\)$/.exec(sm)||[];
    const stopsLine=L.find(l=>/(^|\s)(\d+ stop|Direkte)/i.test(l))||'';
    const sn=/(\d+) stop/.exec(stopsLine);
    const segs=[],lay=[],layCodes=[],flags=[];let overnight=false,selfx=false,aptChange=false;
    for(let i=0;i<L.length;i++){
      const l=L[i];
      const af=/^Afgang \S+ (\d+)\. (\w+)/.exec(l); if(af){const y=(['jan','feb'].includes(af[2]))?'2027':'2026';cur=y+'-'+MON[af[2]]+'-'+String(af[1]).padStart(2,'0');continue}
      const sg=/^(\d\d:\d\d) - (\d\d:\d\d)\((.*)\)$/.exec(l);
      if(sg){const codes=(L[i+1]||'').match(/\(([A-Z]{3})\)/g)||[];const al=(L[i+2]||'').split(' • ')[0];
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
  const real=offers.filter(o=>o.site!=='Annonce');const best=(real.length?real:offers).slice().sort((x,y)=>x.price-y.price)[0]||{};
  const alt=offers.filter(o=>o!==best).slice(0,3).map(o=>o.site+' '+o.price).join(' / ');
  const bagSeg=best.txt||'';const site=best.site||null;const brand=best.brand||null;const prices=offers.map(o=>o.price);
  return {price:best.price||null,allPrices:prices,alt,prot:best.prot,site,brand,selfNote:/egentransfer/i.test(head),bagSeg,extra,legs:res};
};
window.crawl=async (start,end,legDates)=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));const out=[];const seen=new Set();
  for(let i=start;i<end;i++){
    const card=[...document.querySelectorAll('[role="group"]')].find(e=>e.getAttribute('aria-label')==='Resultat nr. '+i);
    if(!card){out.push({rank:i+1,err:'nocard'});continue}
    card.scrollIntoView();card.click();await sleep(900);
    let d=document.querySelector('[role="dialog"]');
    if(!d){out.push({rank:i+1,err:'nodialog'});continue}
    d.querySelectorAll('.E69K-leg-dropdown-header[role="button"]').forEach(b=>b.click());for(let w=0;w<8;w++){await sleep(400);if((d.innerText.match(/Skift fly|\d\d:\d\d - \d\d:\d\d\(/g)||[]).length>=2&&/Fly 2[\s\S]*\d\d:\d\d - \d\d:\d\d\(/.test(d.innerText))break;}
    const p=parseDlg(d.innerText,legDates);p.rank=i+1;p.cardPrice=+(((card.innerText.match(/([\d.]+)\s*kr\./g)||[]).pop()||'').replace(/\D/g,''))||null;
    const sig=p.legs.map(l=>l.flights.join('+')+l.dep).join('/');
    p.dup=seen.has(sig+p.price);seen.add(sig+p.price);
    out.push(p);
    if(location.hash==='#dialog'||document.querySelector('[role="dialog"]')){history.back();await sleep(800);}
  }
  return out;
};
window.lines=function(res,max){const o=[];for(const p of res){if(p.err||p.dup)continue;if(o.length>=max)break;
const leg=l=>[l.dep.slice(5),l.arr.slice(5),l.hours,l.stops,l.via.join(' '),l.layover_h.join(' '),l.flights.join('+'),l.overnight_layover?1:0,l._apt?1:0].join(',');
const cab=(/(\d) x håndbagage/.exec(p.bagSeg)||[])[0]||(/Gebyr for håndbagage/.test(p.bagSeg)?'fee':'');const chk=/Gebyr for indtjekket/.test(p.bagSeg)?'paid':(/(\d) x indtjekket/.test(p.bagSeg)?'incl':'');
o.push([p.rank,p.cardPrice||p.price,p.site,p.selfNote?1:0,p.brand,cab,chk,/Ændring af billet mod gebyr/.test(p.bagSeg)?'fee':'',(p.alt+(p.cardPrice&&p.price!==p.cardPrice?' | offerprice '+p.price:'')),p.prot?1:0].join(';')+'~'+leg(p.legs[0])+'~'+leg(p.legs[1]));}
return o.join('\n');};
window.run=async(n,dates,max)=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(let w=0;w<60;w++){const t=document.body.innerText;if(/Færdig/.test(t)&&document.querySelectorAll('[role="group"]').length>3)break;await sleep(2000);}
await sleep(1500);const t=document.body.innerText;const cnt=(/([\d.]+) resultater/.exec(t)||[])[1];
const fin=/Færdig/.test(t);
const R=await crawl(0,n,dates);window.R=R;return 'count='+cnt+' done='+fin+' title='+document.title+'\n'+lines(R,max);};
```
Then persist: localStorage.setItem('crawlsrc','window.parseDlg='+parseDlg.toString()+';window.crawl='+crawl.toString()+';window.lines='+lines.toString()+';window.run='+run.toString())
Note: parseDlg hard-codes years (jan/feb = 2027, else 2026) and Danish UI strings; adapt MON/years for other dates.
Converting the lines to the JSONL schema was done with a small Python expander (not stored here); fields map 1:1 (price=cardPrice, flags from selfTransfer/basic in fareBrand/overnight/airport change/over_30h/us_transit via airport list).
