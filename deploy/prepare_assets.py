#!/usr/bin/env python3
"""Version local JS/CSS URLs so cached scripts cannot break updated page markup."""
import argparse
import hashlib
import html
from pathlib import Path
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def prepare(release):
    release = release.resolve()
    for route in ('reg-short', 'sps'):
        page = release / route / 'index.html'

        def replace(match):
            url = urlsplit(html.unescape(match['url']))
            if url.scheme or url.netloc or Path(url.path).suffix not in {'.js', '.css'}:
                return match[0]
            file = (release / url.path.lstrip('/') if url.path.startswith('/') else page.parent / url.path).resolve()
            if release not in file.parents:
                raise RuntimeError(f'Asset outside release: {url.path}')
            version = hashlib.sha256(file.read_bytes()).hexdigest()[:16]
            query = [(name, value) for name, value in parse_qsl(url.query, keep_blank_values=True) if name != 'v']
            query.append(('v', version))
            value = html.escape(urlunsplit(url._replace(query=urlencode(query))), quote=True)
            return match['attr'] + match['quote'] + value + match['quote']

        source = page.read_text(encoding='utf-8')
        source = re.sub(r'''(?P<attr>\b(?:src|href)=)(?P<quote>["'])(?P<url>[^"']+)(?P=quote)''', replace, source)
        page.write_text(source, encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release', type=Path, required=True)
    prepare(parser.parse_args().release)
