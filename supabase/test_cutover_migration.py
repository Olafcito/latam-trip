import pathlib
import re
import unittest


class CutoverMigrationTest(unittest.TestCase):
    def test_cutover_migration_drops_the_test_reset_function(self):
        migration = pathlib.Path(__file__).parent / "migrations" / "0012_cutover.sql"
        self.assertTrue(migration.is_file(), "the cutover migration must exist")
        sql = re.sub(r"--[^\n]*", "", migration.read_text(encoding="utf-8")).strip()
        self.assertRegex(sql, r"(?is)^drop\s+function\s+if\s+exists\s+public\.test_reset\s*\(\s*\)\s*;?$")


if __name__ == "__main__":
    unittest.main()
