import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit

import verify


class VerifyTests(unittest.TestCase):
    def run_check(self, retry):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for page in ('', 'reg', 'reg-01'):
                folder = root / page
                folder.mkdir(exist_ok=True)
                (folder / 'index.html').write_text('<html>' + page + '</html>')
            attempts = {}

            def curl(command, **kwargs):
                url = command[-1]
                parsed = urlsplit(url)
                path = parsed.path.rstrip('/') + '/'
                attempts[url] = attempts.get(url, 0) + 1
                stale = url == 'https://2.tvaity.ru/reg/' and attempts[url] == 1
                body = b'old worker: not found' if stale else (root / path.lstrip('/') / 'index.html').read_bytes()
                Path(command[command.index('--output') + 1]).write_bytes(body)
                info = {'http_code': 404 if stale else 200, 'content_type': 'text/html',
                        'url_effective': 'https://2.tvaity.ru' + path + ('?' + parsed.query if parsed.query else '')}
                return subprocess.CompletedProcess(command, 0, json.dumps(info))

            args = ['verify.py', '--legacy-only', '--legacy-root', str(root), '--release', str(root / 'absent'),
                    '--wait-seconds', '1' if retry else '0']
            with patch('sys.argv', args), patch('verify.subprocess.run', side_effect=curl), patch('verify.time.sleep'):
                verify.main()
            return attempts['https://2.tvaity.ru/reg/']

    def test_graceful_reload_retries_old_worker_response(self):
        self.assertEqual(self.run_check(retry=True), 2)

    def test_normal_check_still_rejects_404(self):
        with self.assertRaisesRegex(RuntimeError, 'HTTP 404'):
            self.run_check(retry=False)
