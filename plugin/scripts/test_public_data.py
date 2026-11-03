"""The public paths stay clean of what is owner only. Run from the repo root:
python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_public_data.py"
The repo and the web bucket are public. Booking references, prices paid, names and attachments live only in owner only
tables, so no column of bookings, lodgings, lodging_rooms or lodging_prices, and no booking task text, may reach a file
build_web_data writes. The rows here are made up, every value a marker that is looked for in the output."""
import json, os, re, sqlite3, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tripdb  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(REPO, "plugin", "skills", "flight-crawl-orchestrator", "scripts", "build_web_data.py")
MIGRATIONS = {"bookings": "0013_bookings.sql", "lodgings": "0014_lodgings.sql", "lodging_rooms": "0014_lodgings.sql",
              "lodging_prices": "0014_lodgings.sql"}
# column names the public data uses for its own fields too, such as a place's name or a stay quote's check_in
SHARED = {"id", "kind", "status", "name", "place_id", "check_in", "check_out", "url", "price_dkk", "price", "currency",
          "source", "notes", "summary", "tags", "links", "photos", "rating", "lat", "lon", "observed_at", "created_at",
          "updated_at", "depart", "arrive", "address", "reviews", "site", "hidden"}


def columns(table):
    """The columns of a table, read from its create table in the migration."""
    with open(os.path.join(REPO, "supabase", "migrations", MIGRATIONS[table]), encoding="utf-8") as f:
        sql = f.read()
    body = re.search(rf"create table public\.{table} \((.*?)\n\);", sql, re.S).group(1)
    return [m.group(1) for m in re.finditer(r"^\s{2}([a-z_]+) ", body, re.M) if m.group(1) != "check"]


def marked(table):
    """One row of the table with a marker of its own in every column."""
    return {c: f"LEAK{table.upper()}{c.upper()}" for c in columns(table)}


def keys(x, out):
    if isinstance(x, dict):
        for k, v in x.items():
            out.add(k)
            keys(v, out)
    elif isinstance(x, list):
        for v in x:
            keys(v, out)
    return out


class PublicData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = cls.tmp.name
        src, built = os.path.join(root, "data", "sources"), os.path.join(root, "data", "built")
        os.makedirs(src)
        os.makedirs(built)
        node = {"id": "CTG", "name": "Cartagena", "country": "CO", "lat": 10.4, "lon": -75.5, "type": "city", "popularity": 1,
                "iata": "CTG", "profile": {"tagline": "Walled old town"}}
        with open(os.path.join(built, "map.json"), "w", encoding="utf-8") as f:
            json.dump({"nodes": [node, dict(node, id="SMR", name="Santa Marta", iata="SMR")], "edges": []}, f)
        cls.rows = {t: marked(t) for t in MIGRATIONS}
        # as if an owner only table had been dumped beside the public sources
        for t, r in cls.rows.items():
            with open(os.path.join(src, f"{t}.jsonl"), "w", encoding="utf-8") as f:
                f.write(json.dumps(r) + "\n")
        cls.leg = {"kind": "flight", "from": "CTG", "to": "SMR", "day": "2026-12-08"}
        task = {"type": "booking", "leg": cls.leg, "text": "LEAKTASKTEXT ref TEST01 for Simon and Ana", "note": "LEAKTASKNOTE",
                "reference": "LEAKTASKREF", "price_dkk": 987654, "from": "app"}
        with open(os.path.join(src, "task_log.jsonl"), "w", encoding="utf-8") as f:
            f.write(json.dumps({"issue": 7, "type": "booking", "task": task, "done_at": "2026-11-03T10:00+00:00",
                                "summary": "Booked CTG to SMR", "outputs": []}) + "\n")
        # and as if they had reached trip.db
        db = sqlite3.connect(os.path.join(built, "trip.db"))
        db.execute("CREATE TABLE quotes (quote_id, pattern_id, ok, price_dkk, out_hours, out_via, out_carriers, self_transfer,"
                   " fare_brand, flags, link, observed_at, out_date, home_date, home_hours, home_via, home_carriers, raw)")
        for t, r in cls.rows.items():
            cols = list(r)
            db.execute(f"CREATE TABLE {t} ({', '.join(cols)})")
            db.execute(f"INSERT INTO {t} VALUES ({', '.join('?' for _ in cols)})", [r[c] for c in cols])
        db.commit()
        db.close()
        subprocess.run([sys.executable, "-I", "-X", "utf8", BUILD, "--root", root], check=True, capture_output=True)
        out = os.path.join(root, "data", "web")
        cls.files = {}
        for n in sorted(os.listdir(out)):
            with open(os.path.join(out, n), encoding="utf-8") as f:
                cls.files[n] = f.read()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_the_build_wrote_its_files(self):
        self.assertIn("places.json", self.files)
        self.assertIn("task_log.json", self.files)

    def test_no_owner_only_value_reaches_a_built_file(self):
        for name, text in self.files.items():
            self.assertNotIn("LEAK", text, name)

    def test_no_owner_only_column_is_a_key_in_a_built_file(self):
        own = {c for t in MIGRATIONS for c in columns(t)} - SHARED
        self.assertIn("reference", own)
        for name, text in self.files.items():
            self.assertEqual(sorted(keys(json.loads(text), set()) & own), [], name)

    def test_a_booking_task_keeps_only_its_type_and_leg(self):
        log = json.loads(self.files["task_log.json"])
        self.assertEqual([r["task"] for r in log], [{"type": "booking", "leg": self.leg}])
        for name, text in self.files.items():
            for word in ("TEST01", "987654", "Ana"):
                self.assertNotIn(word, text, name)

    def test_no_owner_only_table_is_built_into_trip_db(self):
        for t in MIGRATIONS:
            self.assertNotIn(t, tripdb.TABLES)
            self.assertNotIn(t, [d[0] for d in tripdb.DUMP_TABLES])


if __name__ == "__main__":
    unittest.main()
