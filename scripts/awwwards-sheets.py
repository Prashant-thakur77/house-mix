import sys, os, glob
from PIL import Image, ImageDraw
# one contact sheet per site: intro frames + hero + up to 10 scroll frames + hover, 4 columns, plus a mobile strip
for d in sorted(glob.glob("frames/*")):
    slug = os.path.basename(d)
    files = [f"{d}/intro-{i}.jpg" for i in range(3)] + [f"{d}/hero.jpg"] + sorted(glob.glob(f"{d}/scroll-*.jpg"))[:11] + [f"{d}/hover.jpg"]
    files = [f for f in files if os.path.exists(f)]
    mob = [f for f in sorted(glob.glob(f"{d}/m-*.jpg"))]
    if not files: continue
    W, H, cols = 480, 300, 4
    rows = (len(files) + cols - 1) // cols
    mh = 330 if mob else 0
    sheet = Image.new("RGB", (W * cols, H * rows + mh + 30), "white")
    dr = ImageDraw.Draw(sheet)
    dr.text((8, 8), slug, fill="black")
    for i, f in enumerate(files):
        im = Image.open(f).convert("RGB").resize((W - 4, H - 4))
        x, y = (i % cols) * W + 2, 30 + (i // cols) * H + 2
        sheet.paste(im, (x, y)); dr.text((x + 4, y + 4), os.path.basename(f)[:-4], fill="red")
    for j, f in enumerate(mob):
        im = Image.open(f).convert("RGB"); im = im.resize((int(im.width * 320 / im.height), 320))
        sheet.paste(im, (2 + j * (im.width + 6), 30 + H * rows + 5))
    os.makedirs("sheets", exist_ok=True)
    sheet.save(f"sheets/{slug}.jpg", quality=72)
    print(slug, len(files), len(mob))
