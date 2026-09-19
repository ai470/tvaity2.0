from pathlib import Path
import tempfile
import unittest

from prepare_assets import prepare


class AssetCacheTests(unittest.TestCase):
    def test_asset_change_gets_new_url_and_repeated_preparation_is_stable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for route in ('reg-short', 'sps'):
                (root / route).mkdir()
                (root / route / 'app.js').write_text('first version')
                (root / route / 'index.html').write_text(
                    '<script src="app.js"></script><script src="https://example.com/external.js"></script>')
            prepare(root)
            first = (root / 'reg-short/index.html').read_text()
            self.assertIn('app.js?v=', first)
            self.assertIn('src="https://example.com/external.js"', first)
            prepare(root)
            self.assertEqual(first, (root / 'reg-short/index.html').read_text())
            (root / 'reg-short/app.js').write_text('updated version')
            prepare(root)
            self.assertNotEqual(first, (root / 'reg-short/index.html').read_text())
