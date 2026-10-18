"""M3/M5 clearly synthetic OCR smoke evidence, never a quality corpus."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[1]
image=Image.new('RGB',(800,650),'white');draw=ImageDraw.Draw(image);font=ImageFont.load_default(size=32)
for i,line in enumerate(['SYNTHETIC GROCERY','MILK           3.49','BREAD          2.00','TAX            0.51','TOTAL          6.00','CASH          10.00','CHANGE         4.00']):draw.text((40,35+i*75),line,font=font,fill='black')
(root/'tests/fixtures').mkdir(exist_ok=True)
image.save(root/'tests/fixtures/synthetic-receipt.png')
