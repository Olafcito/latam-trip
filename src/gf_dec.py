import base64,sys,re
def dec(s):
    b=base64.urlsafe_b64decode(s+'='*(-len(s)%4))
    out=[]
    for m in re.finditer(rb'\x22[\x00-\x7f]\x0a\x03([A-Z]{3})\x12\x0a(\d{4}-\d\d-\d\d)\x1a\x03([A-Z]{3})\x2a[\x01-\x03]([A-Z0-9]{2})\x32[\x01-\x05](\d+)',b):
        out.append('%s-%s %s%s %s'%(m.group(1).decode(),m.group(3).decode(),m.group(4).decode(),m.group(5).decode(),m.group(2).decode()))
    return out
for s in sys.argv[1:]: print(dec(s))
