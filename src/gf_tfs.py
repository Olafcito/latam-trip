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
