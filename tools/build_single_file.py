"""Bundle the prototype into one self-contained HTML file (styles and scripts
inlined, no service worker) for hosting as a single web page.

Usage: python3 tools/build_single_file.py OUTPUT.html
The output has no <html>/<head>/<body> wrapper; hosts that add a document
skeleton (such as claude.ai artifacts) expect this. Browsers open it as-is.
"""
import os
import re
import sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'prototype')
out = sys.argv[1] if len(sys.argv) > 1 else 'bdbv-prototype.html'


def read(name):
    with open(os.path.join(root, name), encoding='utf-8') as f:
        return f.read()


html = read('index.html')
body = html.split('<body>')[1].split('</body>')[0]
body = re.sub(r'<script src="[^"]+"></script>\n?', '', body)
body = re.sub(r"<script>\s*if \('serviceWorker'.*?</script>\n?", '', body, flags=re.S)

js = ''
for f in ['rules.js', 'geo.js', 'i18n.js', 'scoring.js', 'app.js']:
    s = read(f)
    if '</script' in s.lower():
        sys.exit(f + ' contains </script>; cannot inline')
    js += '\n/* ---- %s ---- */\n' % f + s

page = ('<title>BDBV Triage et Surveillance</title>\n'
        '<meta name="theme-color" content="#0f3d5e">\n'
        '<style>\n' + read('styles.css') + '</style>\n' + body +
        '<script>\n' + js + '\n</script>\n')
with open(out, 'w', encoding='utf-8') as f:
    f.write(page)
print('%s written (%d bytes)' % (out, len(page)))
