"""
Rebuilds assets/forms/ulas-annex-b.pdf from the Supreme Court's scanned Annex "B" PDF (4.6 MB) as a light file:
each page is re-rendered at 300 dpi, straightened (the scan is a fraction of a degree crooked, which would
throw the filled-in text off the lines) and stored as a 1-bit CCITT G4 image. The wording and layout of the
form are untouched; nothing is added or removed.

Run:  python tools/optimize-annex-b.py "C:/path/to/Annex-B-QB-Declaration-and-Certification.pdf"
Needs: pip install pypdfium2 pillow numpy
"""
import sys, os
import numpy as np
import pypdfium2 as pdfium

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'forms', 'ulas-annex-b.pdf')
DPI = 300
THRESHOLD = 160

def skew_angle(gray):
    """Angle (degrees) that makes the text lines and table rules most horizontal."""
    small = gray.resize((gray.width // 2, gray.height // 2))
    best, best_score = 0.0, -1
    for a in np.arange(-1.5, 1.5001, 0.02):
        # Long straight rules pile up on single rows once the page is level: reward the tallest row sums.
        rows = (np.array(small.rotate(a, resample=2, fillcolor=255)) < 128).sum(axis=1).astype(float)
        score = np.square(rows).sum()
        if score > best_score:
            best, best_score = a, score
    return best

doc = pdfium.PdfDocument(SRC)
pages = []
for i in range(len(doc)):
    page = doc[i]
    w_pt, h_pt = page.get_size()
    gray = page.render(scale=DPI / 72).to_pil().convert('L')
    angle = skew_angle(gray)
    print(f'page {i + 1}: straightening by {angle:+.2f} degrees')
    gray = gray.rotate(angle, resample=3, fillcolor=255)  # bicubic, then back to pure black and white
    pages.append(gray.point(lambda v: 255 if v > THRESHOLD else 0).convert('1'))
    size_pt = (w_pt, h_pt)

pages[0].save(OUT, save_all=True, append_images=pages[1:], resolution=pages[0].width / size_pt[0] * 72)
print(f'{OUT}: {os.path.getsize(OUT) / 1024:.0f} KB (was {os.path.getsize(SRC) / 1024:.0f} KB)')
