#!/usr/bin/env python3
"""Check real HTTP bodies, TLS, redirects and local page assets; never submit forms."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import unquote, urljoin, urlsplit

HOST = "2.tvaity.ru"
ORIGIN = "https://" + HOST


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag in {"script", "img", "source", "video", "audio", "input"}:
            self.urls.add(attrs.get("src", ""))
            self.urls.add(attrs.get("poster", ""))
        if tag in {"img", "source"}:
            for candidate in attrs.get("srcset", "").split(","):
                if candidate.strip():
                    self.urls.add(candidate.strip().split()[0])
        if tag == "link" and set(attrs.get("rel", "").split()) & {
            "stylesheet", "icon", "preload", "modulepreload", "apple-touch-icon"
        }:
            self.urls.add(attrs.get("href", ""))
        if tag == "a" and urlsplit(attrs.get("href", "")).path.endswith(".pdf"):
            self.urls.add(attrs["href"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", type=Path, default=Path("/var/www/tvaity2.0-deploy/current"))
    parser.add_argument("--legacy-root", type=Path, default=Path("/var/www/2.tvaity.ru"))
    parser.add_argument("--connect-address", help="Pin the connection IP while still validating TLS/SNI")
    parser.add_argument("--legacy-only", action="store_true")
    args = parser.parse_args()

    def request(url):
        with tempfile.TemporaryDirectory() as folder:
            body = Path(folder) / "body"
            command = [
                "curl", "--silent", "--show-error", "--location", "--max-redirs", "5",
                "--connect-timeout", "10", "--max-time", "30", "--noproxy", "*",
                "--proto", "=http,https", "--proto-redir", "=https",
                "--output", str(body), "--write-out", "%{json}",
            ]
            if args.connect_address:
                for port in (80, 443):
                    command.extend(["--resolve", f"{HOST}:{port}:{args.connect_address}"])
            result = subprocess.run(command + [url], check=True, capture_output=True, text=True)
            return json.loads(result.stdout), body.read_bytes()

    def expected_file(url):
        path = unquote(urlsplit(url).path)
        overlay = args.release / "legacy" / path.lstrip("/")
        if path.startswith(("/reg-short/", "/sps/")):
            root = args.release.resolve()
        elif overlay.is_file() or (overlay / "index.html").is_file():
            root = (args.release / "legacy").resolve()
        else:
            root = args.legacy_root.resolve()
        file = (root / path.lstrip("/")).resolve()
        if root not in file.parents and file != root:
            raise RuntimeError(f"Asset escapes site root: {url}")
        if file.is_dir():
            file = file / "index.html"
        return file

    def check(url):
        info, body = request(url)
        if info["http_code"] != 200:
            raise RuntimeError(f"HTTP {info['http_code']}: {url}")
        file = expected_file(info["url_effective"])
        if body != file.read_bytes():
            raise RuntimeError(f"Unexpected response body (wrong route/fallback): {url}")
        mime = (info.get("content_type") or "").split(";")[0]
        types = {".html": {"text/html"}, ".css": {"text/css"},
                 ".js": {"application/javascript", "text/javascript"}, ".pdf": {"application/pdf"}}
        if file.suffix in types and mime not in types[file.suffix]:
            raise RuntimeError(f"Wrong Content-Type {mime}: {url}")
        references = set()
        if file.suffix == ".html":
            assets = Assets()
            assets.feed(body.decode("utf-8"))
            references = assets.urls
        elif file.suffix == ".css":
            references = set(re.findall(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", body.decode("utf-8")))
        local = set()
        for reference in references:
            if not reference or reference.startswith(("#", "data:")):
                continue
            absolute = urljoin(info["url_effective"], reference.strip())
            parsed = urlsplit(absolute)
            if parsed.hostname == HOST and parsed.scheme == "https":
                local.add(parsed._replace(fragment="").geturl())
        return local

    routes = ["/reg", "/reg-01"]
    if not args.legacy_only:
        routes += ["/reg-short", "/sps"]
    pending = {ORIGIN + "/"} | {ORIGIN + route + "/" for route in routes}
    if not args.legacy_only:
        for route in ("reg-short", "sps"):
            for file in (args.release / route).rglob("*"):
                if file.is_file():
                    pending.add(ORIGIN + "/" + file.relative_to(args.release).as_posix())
        for file in (args.release / "legacy").rglob("*"):
            if file.is_file():
                pending.add(ORIGIN + "/" + file.relative_to(args.release / "legacy").as_posix())
    checked = set()
    with ThreadPoolExecutor(max_workers=6) as pool:
        while pending:
            batch = sorted(pending - checked)
            if not batch:
                break
            checked.update(batch)
            pending = set().union(*pool.map(check, batch))

    for route in routes:
        # UTM parameters must survive both HTTP->HTTPS and trailing-slash redirects.
        suffix = "?utm_source=deploy-check&ref=smoke"
        for scheme in ("http", "https"):
            url = f"{scheme}://{HOST}{route}{suffix}"
            info, body = request(url)
            target = ORIGIN + route + "/" + suffix
            if info["http_code"] != 200 or info["url_effective"] != target:
                raise RuntimeError(f"Broken canonical redirect: {url} -> {info['url_effective']}")
            if body != expected_file(target).read_bytes():
                raise RuntimeError(f"Wrong page after redirect: {url}")
        print(f"OK {ORIGIN}{route}/ (body, assets, HTTPS, redirects)")

    if not args.legacy_only:
        for route in routes + ["/reg-not-a-page", "/sps-not-a-page"]:
            missing = route + "/__deploy_missing__.css"
            info, _ = request(ORIGIN + missing)
            if info["http_code"] != 404:
                raise RuntimeError(f"Missing asset must return 404: {missing} (got {info['http_code']})")
    print(f"PASS: {len(checked)} pages/assets checked against disk; certificate verification enabled.")


if __name__ == "__main__":
    main()
