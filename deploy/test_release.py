#!/usr/bin/env python3
"""Exercise the actual release script in disposable directories with fake services.

Run as root on Linux: python3 -m unittest discover -s deploy -p 'test_*.py' -v
No production paths, network requests or real nginx reloads are used.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


@unittest.skipUnless(hasattr(os, "geteuid") and os.geteuid() == 0, "requires Linux/root")
class ReleaseTests(unittest.TestCase):
    def exercise(self, failure="", previous=True, config_changed=True):
        with tempfile.TemporaryDirectory(prefix="tvaity2-release-test-") as directory:
            base = Path(directory)
            repo = base / "repo"
            state = base / "state"
            legacy = base / "legacy"
            config = base / "nginx.conf"
            enabled = base / "enabled"
            backups = base / "backups"
            bin_dir = base / "bin"
            for folder in (repo / "deploy", state, legacy, bin_dir):
                folder.mkdir(parents=True, exist_ok=True)
            for root, names in ((repo, ("short-land", "sps")), (legacy, ("reg", "reg-01"))):
                for name in names:
                    (root / name).mkdir()
                    (root / name / "index.html").write_text(name)
            (repo / "deploy/nginx.conf").write_text("candidate")
            old_config = "previous" if config_changed else "candidate"
            config.write_text(old_config)
            enabled.symlink_to(config)
            old_release = state / "old"
            if previous:
                old_release.mkdir()
                (old_release / "marker").write_text("original release")
                (state / "current").symlink_to(old_release)

            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
            subprocess.run(["git", "-C", str(repo), "-c", "user.name=Test", "-c",
                            "user.email=test@example.invalid", "commit", "-qm", "fixture"], check=True)
            # Simulate failures at distinct points, not the implementation's data operations.
            stubs = {
                "nginx": '[[ "$FAILURE" != nginx || "$(cat "$TEST_CONFIG")" != candidate ]]',
                "systemctl": 'echo "$*" >> "$TEST_RELOADS"',
                "runuser": 'shift 3; exec "$@"',
                "python3": '''
case "$*" in
  *--legacy-only*) [[ "$FAILURE" != preflight ]] ;;
  *--connect-address*) [[ "$FAILURE" != origin ]] ;;
  *) [[ "$FAILURE" != public ]] ;;
esac
''',
            }
            for name, content in stubs.items():
                script = bin_dir / name
                script.write_text("#!/usr/bin/env bash\nset -eu\n" + content + "\n")
                script.chmod(0o755)
            script = Path(__file__).with_name("release.sh").read_text()
            replacements = {
                "/var/www/tvaity2.0-deploy": state,
                "/var/www/tvaity2.0": repo,
                "/var/www/2.tvaity.ru": legacy,
                "/etc/nginx/sites-available/tvaity2": config,
                "/etc/nginx/sites-enabled/tvaity2": enabled,
                "/var/backups/tvaity2-deploy": backups,
            }
            for source, destination in replacements.items():
                script = script.replace(source, str(destination))
            runner = base / "release.sh"
            runner.write_text(script)
            env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ["PATH"],
                       FAILURE=failure, TEST_CONFIG=str(config), TEST_RELOADS=str(base / "reloads"))
            result = subprocess.run(["bash", "-c", 'exec 9>"$1"; exec bash "$2"', "test",
                                     str(base / "lock"), str(runner)], env=env,
                                    capture_output=True, text=True)
            output = result.stdout + result.stderr
            self.assertEqual(result.returncode == 0, not failure, output)
            for name in ("reg", "reg-01"):
                self.assertEqual((legacy / name / "index.html").read_text(), name)
            if failure:
                self.assertEqual(config.read_text(), old_config, output)
                if previous:
                    self.assertEqual((state / "current").resolve(), old_release, output)
                    self.assertEqual((state / "current/marker").read_text(), "original release")
                else:
                    self.assertFalse((state / "current").is_symlink(), output)
                self.assertFalse((state / "deployed-commit").exists(), output)
            else:
                self.assertEqual(config.read_text(), "candidate")
                self.assertEqual((state / "current/reg-short/index.html").read_text(), "short-land")
                self.assertTrue((state / "deployed-commit").is_file())
                self.assertTrue((state / "last-backup").is_file())
                self.assertEqual((base / "reloads").exists(), config_changed)

    def test_successful_first_deploy(self):
        self.exercise(previous=False)

    def test_content_update_needs_no_reload(self):
        self.exercise(config_changed=False)

    def test_legacy_failure_never_switches_release(self):
        self.exercise(failure="preflight")

    def test_invalid_nginx_restores_previous_config_and_release(self):
        self.exercise(failure="nginx")

    def test_failed_origin_check_rolls_back(self):
        self.exercise(failure="origin")

    def test_failed_public_check_rolls_back_without_reload(self):
        self.exercise(failure="public", config_changed=False)

    def test_first_deploy_failure_removes_new_symlink(self):
        self.exercise(failure="public", previous=False)


if __name__ == "__main__":
    unittest.main()
