#!/usr/bin/env python3
"""Build a reversible tracking fix for the source-less legacy Next.js export.

Never modifies the original export. Fail closed if its known bundle has changed.
The same URL helper is embedded in both the short landing and legacy widget code.
"""
import argparse
import hashlib
from pathlib import Path
import shutil

BUNDLE = Path('_next/static/chunks/055pf6nnbiglo.js')
EXPECTED_SHA256 = '558377f17f747f6b238871edbc0795f5d1306afca5bf48f430aaff4c16d51f02'
OLD_BUILDER = ('function r(t){let e=new URL("https://my.tvaity.ru/pl/lite/widget/widget");'
               'e.searchParams.set("id",t),e.searchParams.set("ref",window.location.href),'
               'e.searchParams.set("_t",Date.now().toString());'
               'let i=new URLSearchParams(window.location.search);'
               'for(let t of["utm_source","utm_medium","utm_campaign","utm_term","utm_content",'
               '"partner_code","fromPartnerCode"]){let n=i.get(t);n&&e.searchParams.set(t,n)}'
               'return e.toString()}')
NEW_BUILDER = ('function r(t){let e=new URL("https://my.tvaity.ru/pl/lite/widget/widget");'
               'e.searchParams.set("id",t);e.searchParams.set("_t",Date.now().toString());'
               'let i=new URLSearchParams(window.location.search);'
               'for(let t of["partner_code","fromPartnerCode"]){let n=i.get(t);'
               'n&&e.searchParams.set(t,n)}return window.GcTracking.withTrackingParams(e.toString())}')


def prepare(root, release, helper, expected_sha256=EXPECTED_SHA256):
    original = (root / BUNDLE).read_bytes()
    if hashlib.sha256(original).hexdigest() != expected_sha256:
        raise RuntimeError('Legacy Next.js bundle changed; review/update the tracking patch before deploying.')
    source = original.decode('utf-8')
    if source.count(OLD_BUILDER) != 1:
        raise RuntimeError('Expected exactly one legacy widget URL builder.')
    patched = helper.read_text(encoding='utf-8') + '\n' + source.replace(OLD_BUILDER, NEW_BUILDER)
    version = hashlib.sha256(patched.encode('utf-8')).hexdigest()[:16]
    bundle_name = f'055pf6nnbiglo-tracking-{version}.js'
    overlay = release / 'legacy'
    target = overlay / BUNDLE.parent / bundle_name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(patched, encoding='utf-8')
    changed = 0
    for route in ('reg', 'reg-01'):
        shutil.copytree(root / route, overlay / route)
        for file in (overlay / route).rglob('*'):
            if file.suffix in {'.html', '.txt'}:
                text = file.read_text(encoding='utf-8')
                if BUNDLE.name in text:
                    file.write_text(text.replace(BUNDLE.name, bundle_name), encoding='utf-8')
                    changed += 1
        if bundle_name not in (overlay / route / 'index.html').read_text(encoding='utf-8'):
            raise RuntimeError(f'Widget script missing from {route}/index.html')
    print(f'Prepared legacy tracking overlay: {bundle_name}; {changed} HTML/RSC files updated.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--release', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.root, args.release, args.release / 'reg-short/gc-tracking.js')
