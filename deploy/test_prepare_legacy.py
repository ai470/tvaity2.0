import hashlib
from pathlib import Path
import tempfile
import unittest

from prepare_legacy import BUNDLE, OLD_BUILDER, NEW_BUILDER, prepare


class LegacyPatchTests(unittest.TestCase):
    def test_new_bundle_and_page_references_leave_original_export_untouched(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'original'
            release = Path(directory) / 'release'
            (root / BUNDLE.parent).mkdir(parents=True)
            (root / BUNDLE).write_text(OLD_BUILDER)
            for route in ('reg', 'reg-01'):
                (root / route).mkdir()
                for filename in ('index.html', 'index.txt'):
                    (root / route / filename).write_text(BUNDLE.as_posix())
            helper = Path(directory) / 'helper.js'
            helper.write_text('window.GcTracking = {};')
            prepare(root, release, helper, hashlib.sha256(OLD_BUILDER.encode()).hexdigest())
            self.assertEqual((root / BUNDLE).read_text(), OLD_BUILDER)
            generated = list((release / 'legacy' / BUNDLE.parent).glob('*.js'))
            self.assertEqual(len(generated), 1)
            self.assertIn(NEW_BUILDER, generated[0].read_text())
            self.assertTrue(generated[0].read_text().startswith(helper.read_text()))
            for route in ('reg', 'reg-01'):
                for filename in ('index.html', 'index.txt'):
                    self.assertIn(generated[0].name, (release / 'legacy' / route / filename).read_text())
                    self.assertIn(BUNDLE.name, (root / route / filename).read_text())

    def test_unknown_bundle_stops_before_creating_overlay(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / BUNDLE.parent).mkdir(parents=True)
            (root / BUNDLE).write_text('changed upstream bundle')
            with self.assertRaisesRegex(RuntimeError, 'bundle changed'):
                prepare(root, root / 'release', root / 'helper.js')
            self.assertFalse((root / 'release').exists())
