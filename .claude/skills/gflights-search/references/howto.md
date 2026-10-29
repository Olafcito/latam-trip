# Google Flights how-to (gflights-1, 28 Oct 2026). Everything below was run and worked.
Browser: built-in browser pane. Create OWN tab (tabs_create AFTER the pane is open; before that use preview_start once), act only on that tabId.
Use browser_batch [navigate, javascript_tool] to load a search and read it in one call.

## 0. Consent and settling
- First load redirects to consent.google.com. find "Reject all", click it (privacy-preserving). Page then returns to Flights.
- Typing into the form fields did NOT work (clicks do not focus the inputs). Build the URL instead (section 1).
- Results load progressively: wait until aria-label rows exist, then sleep 6 s more, click "View more flights" if present, sleep 2.5 s.
  Reading earlier gave wrong/unsettled prices (BOG showed 13813, settled value was 9492).
- Opening /flights/search?tfs=... directly shows the form page ("Find Cheap Flights..."); the JS below clicks the "Search" button if no rows exist.

## 1. Build search URLs from tfs (protobuf, urlsafe base64, no padding)
Structure: f1=28, f2=1 (economy), f3 repeated segment {f2=date string, f13=origin {f1=1 (airport), f2=IATA}, f14=dest}, f8=1,f9=1,f14=1 adult, f19=3 (multi-city).
Use type 1 + IATA airport code (type 2 + /m/ id is city). For one-way/return change f19 (1=return,2=one way; not tested, multi-city only was used).
tfs.py (verbatim):
```python
import base64,sys
def ld(f,b): 
    return bytes([(f<<3)|2,len(b)])+b
def place(code,t=1): return bytes([0x08,t])+ld(2,code.encode())
def seg(date,o,d):
    return ld(2,date.encode())+ld(13,place(o))+ld(14,place(d))
def tfs(legs):
    out=bytes([0x08,0x1c,0x10,0x01])
    for l in legs: out+=ld(3,seg(*l))
    out+=bytes([0x40,0x01,0x48,0x01,0x70,0x01])+b'\x82\x01\x0b\x08'+b'\xff'*9+b'\x01'+bytes([0x98,0x01,0x03])
    return base64.urlsafe_b64encode(out).decode().rstrip('=')
def url(x,out='2026-12-03',home='2027-02-02',o='CPH',h='VVI'):
    return "https://www.google.com/travel/flights?tfs=%s&tfu=KgIIAw&hl=en&curr=DKK"%tfs([(out,o,x),(home,h,'CPH')])
if __name__=='__main__':
    print(url(sys.argv[1]))
```
Usage: python3 -c "from tfs import tfs; print('https://www.google.com/travel/flights/search?tfs=%s&hl=en&curr=DKK'%tfs([('2026-12-03','CPH','GUA'),('2027-02-03','VVI','CPH')]))"
Complete working example, CPH->GUA 2026-12-03 + VVI->CPH 2027-02-03:
https://www.google.com/travel/flights/search?tfs=CBwQARoeEgoyMDI2LTEyLTAzagcIARIDQ1BIcgcIARIDR1VBGh4SCjIwMjctMDItMDNqBwgBEgNWVklyBwgBEgNDUEhAAUgBcAGCAQsI____________AZgBAw&hl=en&curr=DKK
(to see the real tfs of any search, read the "Sign in" link href: it holds the url-encoded tfs.)

## 2. Reading results and revealing leg 2 (JS, run via javascript_tool)
Each result row is a DIV with aria-label "From 9808 Danish kroner total. 2 stops flight with KLM and COPA. Leaves Copenhagen Airport at 6:00 AM on Thursday, December 3 and arrives at ... Total duration 20 hr. Layover (1 of 2) is a 3 hr 50 min layover at ... in Amsterdam. ... Select flight".
Price on the first-leg list is the TOTAL of the whole trip with the cheapest second leg. Clicking a row (el.click()) shows leg 2 with totals; clicking a leg-2 row opens /flights/booking (bags, "Book with X", "Separate tickets" labels, final price).
history.go(-1) goes back one level. The routine below stores in localStorage so later calls only need: eval(localStorage.r)
Store it once: localStorage.r = "<the source below as a JSON string>"  (I generated the string with python json.dumps).
Output: compact lines "price|stops|airlines{operated by}|dep time>arr time arr date|duration|city layover; ..." for top 10 first-leg rows, then for 2 picks (cheapest, then cheapest with different airlines) the leg-2 rows, the booking tfs and booking page text.
routine (verbatim, final version):
```js
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
```
Light version (first leg only, top 4) was stored in localStorage.l; same helpers (wait, click Search, 6 s settle, View more flights, sort by price), no clicking.
Pitfalls: list contains many duplicates (use a Map keyed by label); first-leg "From" price can differ from the booking page price (BOG LH+AC row: label 10765, leg-2 14827, booking 10615); trust the booking page price. Absurd rows appear (58155 DKK); ignore.

## 3. Decode flight numbers from booking URL tfs
The booking/search-after-selection URL carries every chosen flight as a segment: f4 = {f1 origin, f2 date, f3 dest, f5 airline code, f6 flight number}. Get it with new URL(location.href).searchParams.get('tfs') (the routine returns it as BOOK).
dec.py (verbatim), run: python3 dec.py <tfs> ... -> ['CPH-AMS KL1266 2026-12-03', ...]
```python
import base64,sys,re
def dec(s):
    b=base64.urlsafe_b64decode(s+'='*(-len(s)%4))
    out=[]
    for m in re.finditer(rb'\x22[\x00-\x7f]\x0a\x03([A-Z]{3})\x12\x0a(\d{4}-\d\d-\d\d)\x1a\x03([A-Z]{3})\x2a[\x01-\x03]([A-Z0-9]{2})\x32[\x01-\x05](\d+)',b):
        out.append('%s-%s %s%s %s'%(m.group(1).decode(),m.group(3).decode(),m.group(4).decode(),m.group(5).decode(),m.group(2).decode()))
    return out
for s in sys.argv[1:]: print(dec(s))
```
Note: only legs the user selected are present; leg-2 flight numbers need a leg-2 click (the routine does this for the cheapest leg-2 row).
Home-leg facts seen: VVI-GRU G37639 11:55, then GRU-CDG AF459/AF1050 or GRU-AMS KL792 + AMS-CPH KL1273.
