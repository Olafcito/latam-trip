// Live canary for the Momondo parser, run in a browser worker's Momondo tab.
// 1. Open a known search in a fresh tab, for example
//    https://www.momondo.dk/flight-search/CPH-MAD/2026-12-03/2026-12-10?sort=price_a
//    (use dates at least two weeks ahead) and wait 8 s. Reject cookies with "Afvis alle" if asked.
// 2. Run momondo_crawler.js in the tab, then this file, in javascript_tool calls.
// 3. Start it in the background with one date per leg and poll window.__canary (null means still running):
//    window.__canary=null; canaryLive(['2026-12-03','2026-12-10']).then(v=>window.__canary=v).catch(e=>window.__canary='FAIL '+e); location.href
// It opens the first result with crawl(), which uses parseDlg, and checks that every leg and the price came back.
window.canaryLive=async function(dates){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  for(let w=0;w<30;w++){if(/Færdig/.test(document.body.innerText)&&document.querySelectorAll('[role="group"]').length>3)break;await sleep(2000);}
  const R=await crawl(0,1,dates);const p=R[0]||{err:'noresult'};
  const v='parser '+(window.PARSER_VERSION||'?');
  if(p.err)return 'FAIL '+v+': '+p.err;
  const bad=[];
  if(!p.legs||p.legs.length!==dates.length)bad.push('legs '+(p.legs?p.legs.length:0)+' of '+dates.length);
  (p.legs||[]).forEach((l,i)=>{if(!l.flights.length||/undefined/.test(l.dep+l.arr)||!l.hours)bad.push('leg '+(i+1)+' empty')});
  if(!(p.cardPrice||p.price))bad.push('no price');
  if(bad.length)return 'FAIL '+v+': '+bad.join(', ')+'\n'+(window.__dlg0||'').slice(0,3000);
  return 'PASS '+v+': '+p.legs.length+' legs, price '+(p.cardPrice||p.price)+', '+p.legs.map(l=>l.flights.join('+')).join(' / ');
};
