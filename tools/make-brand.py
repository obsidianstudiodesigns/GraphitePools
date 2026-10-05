# Builds favicons, app icons and the link-preview image from the extracted logo.
#   python tools/make-brand.py   (needs Pillow)
from PIL import Image, ImageDraw, ImageFilter

B = 'assets/brand/'
GRAPHITE = (43, 48, 54, 255)
logo = Image.open(B + 'logo.png').convert('RGBA')
mark = Image.open(B + 'logo-mark.png').convert('RGBA')


def icon(size, art, pad=0.12, radius=0.2):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], int(size * radius), fill=255)
    bg = Image.new('RGBA', (size, size), GRAPHITE)
    im.paste(bg, (0, 0), mask)
    a = art.copy()
    a.thumbnail((int(size * (1 - 2 * pad)), int(size * (1 - 2 * pad))), Image.LANCZOS)
    im.alpha_composite(a, ((size - a.width) // 2, (size - a.height) // 2))
    return im

# small sizes use the roof-and-splash mark, larger ones the full lockup
icon(32, mark, pad=0.06, radius=0.18).save(B + 'favicon-32.png')
icon(180, logo, pad=0.1, radius=0).convert('RGB').save(B + 'apple-touch-icon.png')
icon(192, logo, pad=0.1).save(B + 'icon-192.png')
icon(512, logo, pad=0.1).save(B + 'icon-512.png')

# link preview: job photo on the right, logo on graphite on the left
og = Image.new('RGBA', (1200, 630), GRAPHITE)
photo = Image.open('assets/work/new-pool-grey-paving.jpg').convert('RGBA')
pw = 700
photo = photo.resize((int(photo.width * 630 / photo.height), 630), Image.LANCZOS)
photo = photo.crop((60, 0, 60 + pw, 630))
og.alpha_composite(photo, (1200 - pw, 0))
fade = Image.new('L', (220, 630))
for x in range(220):
    ImageDraw.Draw(fade).line([(x, 0), (x, 630)], fill=int(255 * (1 - x / 219)))
band = Image.new('RGBA', (220, 630), GRAPHITE)
og.paste(band, (1200 - pw, 0), fade)
l = logo.copy(); l.thumbnail((470, 420), Image.LANCZOS)
og.alpha_composite(l, (60, (630 - l.height) // 2))
og.convert('RGB').save(B + 'og-image.jpg', quality=88, optimize=True)
print('brand images written')
