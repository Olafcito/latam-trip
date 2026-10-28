# price, cabin add-on, checked add-on per component; flags for rating
LH = {  # long-haul in/home: (price incl cabin fees & hub nights, checked add-on, in:{h,night,sep,us}, home:{...})
 "A": dict(price=985+150+800+6494, chk=600+972, inn=dict(h=17.9,night=1,sep=1,us=0), home=dict(h=17.9,night=1,sep=1,us=0)),
 "B": dict(price=9071, chk=560+350, inn=dict(h=18.5,night=0,sep=0,us=0), home=dict(h=23.8,night=0,sep=0,us=0)),
 "C": dict(price=6681, chk=1096, inn=dict(h=20.7,night=0,sep=0,us=1), home=dict(h=20.2,night=0,sep=0,us=1)),
 "D": dict(price=985+150+800+8384, chk=600+560+290, inn=dict(h=23.4,night=1,sep=1,us=0), home=dict(h=22.1,night=1,sep=1,us=0)),
 "E": dict(price=5932+3645+150+450, chk=560+486+300, inn=dict(h=18.6,night=0,sep=0,us=0), home=dict(h=17.9,night=1,sep=1,us=0)),
 "E2":dict(price=5932+5259+412, chk=560+0+300, inn=dict(h=18.6,night=0,sep=0,us=0), home=dict(h=14.1,night=0,sep=1,us=0)),
 "F": dict(price=8112, chk=560+290, inn=dict(h=20.6,night=0,sep=0,us=0), home=dict(h=18.0,night=0,sep=0,us=0)),
 "G": dict(price=3482+150+300+3645+150+450, chk=300+500+486+300, inn=dict(h=17.4,night=0,sep=1,us=0), home=dict(h=17.9,night=1,sep=1,us=0)),
 "H": dict(price=186+180+450+4007+2796+288+180, chk=300+486+500+300, inn=dict(h=17.9,night=1,sep=1,us=0), home=dict(h=13.5,night=0,sep=1,us=0)),
}
MID = {  # in-between flights: price incl cabin fee, checked add-on, n hops (excl BoA internal), night-hour flights
 "CA>CO>BO": dict(price=1696+2384+659, chk=245+516, hops=2, night=1),
 "CA>BO>CO": dict(price=3201+659+1755+250, chk=516+500, hops=2, night=1),
 "BO>CO>CA>MX": dict(price=659+1755+250+1960+1939, chk=500+516+290, hops=3, night=0),
 "CA>BO>CO>MX": dict(price=3201+659+1755+250+1639+770, chk=516+500+670, hops=3, night=1),
 "MX>CA>CO>BO": dict(price=1393+1696+2384+659, chk=290+245+516, hops=3, night=1),
}
SC = [("A","CA>CO>BO"),("B","CA>CO>BO"),("C","CA>BO>CO"),("D","BO>CO>CA>MX"),("E","CA>CO>BO"),("E2","CA>CO>BO"),
      ("F","CA>BO>CO>MX"),("G","MX>CA>CO>BO"),("H","CA>BO>CO>MX")]
def leg_score(d):
    s = 5 - d["night"] - d["sep"] - d["us"] - (d["h"] > 20) - (d["h"] > 23)
    return max(1, s)
clip = lambda x: max(1.0, min(5.0, x))
rows=[]
for k, m in SC:
    l, r = LH[k], MID[m]
    tot = l["price"] + r["price"]; chk = tot + l["chk"] + r["chk"]
    P = clip(5 - (tot - 12500) / 1000)
    I = leg_score(l["inn"]); H = leg_score(l["home"])
    B = max(1, 5 - max(0, r["hops"] - 2) - r["night"])
    score = round((0.35*P + 0.30*H + 0.15*I + 0.20*B) * 2, 1)
    rows.append((score, k, m, l["price"], r["price"], tot, chk, round(P,1), I, H, B))
for x in sorted(rows, reverse=True): print(x)
