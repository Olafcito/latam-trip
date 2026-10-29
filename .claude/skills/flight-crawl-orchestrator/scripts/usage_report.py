"""Summarise worker token usage from data/sources/agent_usage.csv (round, agent, model, tool, searches, tokens, tool_uses, seconds, rows).
Usage: python3 -I usage_report.py [--root DIR]"""
import csv, os, sys
args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
rows = list(csv.DictReader(open(os.path.join(ROOT, "data", "sources", "agent_usage.csv"))))
tot = {}
print(f"{'round':<6}{'agent':<12}{'model':<8}{'tool':<16}{'srch':>5}{'tokens':>9}{'tok/srch':>9}{'rows':>6}")
for r in rows:
    s, t = int(r["searches"] or 0), int(r["tokens"] or 0)
    print(f"{r['round']:<6}{r['agent']:<12}{r['model']:<8}{r['tool']:<16}{s:>5}{t:>9}{(t // s if s else 0):>9}{r['rows']:>6}")
    k = (r["round"], r["tool"]); a = tot.setdefault(k, [0, 0, 0]); a[0] += s; a[1] += t; a[2] += int(r["rows"] or 0)
print("\nPer round and tool: searches, tokens, tokens per search, rows")
for (rd, tool), (s, t, n) in sorted(tot.items()):
    print(f"  r{rd} {tool:<16} {s:>3} {t:>8} {t // max(s, 1):>7} {n:>4}")
print("Total tokens:", sum(int(r["tokens"] or 0) for r in rows))
