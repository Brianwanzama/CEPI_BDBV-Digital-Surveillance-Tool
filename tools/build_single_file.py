"""Bundle the prototype into one self-contained HTML file for hosting as a single
web page (e.g. a claude.ai artifact).

Usage: python3 tools/build_single_file.py OUTPUT.html

- Scripts are taken from prototype/index.html in order. Project scripts and styles
  are inlined; vendored libraries (prototype/vendor/) are replaced by the same exact
  versions from the jsDelivr CDN, because hosts that add a document skeleton usually
  only allow scripts from approved CDNs.
- The service worker is dropped (not available in embedded viewers).
- The output has no <html>/<head>/<body> wrapper; browsers open it as-is.
"""
import os
import re
import sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'prototype')
out = sys.argv[1] if len(sys.argv) > 1 else 'bdbv-prototype.html'
CDN = {
    'vendor/xlsx.full.min.js': 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'vendor/jspdf.umd.min.js': 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'vendor/jspdf.plugin.autotable.min.js': 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
}


def read(name):
    with open(os.path.join(root, name), encoding='utf-8') as f:
        return f.read()


html = read('index.html')
body = html.split('<body>')[1].split('</body>')[0]
srcs = re.findall(r'<script src="([^"]+)"></script>', body)
body = re.sub(r'<script src="[^"]+"></script>\n?', '', body)
body = re.sub(r"<script>\s*if \('serviceWorker'.*?</script>\n?", '', body, flags=re.S)

cdn_tags, js = '', ''
for src in srcs:
    if src in ('register-sw.js', 'config.js', 'api.js'):
        continue
    if src in CDN:
        cdn_tags += '<script src="%s"></script>\n' % CDN[src]
        continue
    s = read(src)
    if '</script' in s.lower():
        sys.exit(src + ' contains </script>; cannot inline')
    js += '\n/* ---- %s ---- */\n' % src + s

page = ('<title>BDBV Triage et Surveillance</title>\n'
        '<meta name="theme-color" content="#0f3d5e">\n'
        '<style>\n' + read('styles.css') + '</style>\n' + body + cdn_tags +
        '<script>\n' + js + '\n</script>\n')
with open(out, 'w', encoding='utf-8') as f:
    f.write(page)
print('%s written (%d bytes, %d scripts inlined, %d from CDN)' % (out, len(page), len(srcs) - len(cdn_tags.splitlines()), len(cdn_tags.splitlines())))
