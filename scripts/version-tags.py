# Points every "file?v=tag" reference in dist at the file's current contents
# (first 10 hex digits of its SHA-1). Files are cached for a year, so a tag
# must change whenever its file does. Repeats until nothing changes, since a
# file's own tag changes when the tags inside it do.
import hashlib, pathlib, re

dist = pathlib.Path(__file__).resolve().parent.parent / 'dist'
texts = [p for p in dist.iterdir() if p.suffix in ('.html', '.js', '.css')]
pattern = re.compile(r'([\w.-]+\.(?:js|css|png|webp|mp3))\?v=([0-9a-f]+)')
while True:
    changed = False
    for page in texts:
        text = page.read_text()
        def tag(match):
            name = match.group(1)
            return f'{name}?v={hashlib.sha1((dist / name).read_bytes()).hexdigest()[:10]}'
        updated = pattern.sub(tag, text)
        if updated != text:
            page.write_text(updated); changed = True
            print('updated', page.name)
    if not changed:
        break
