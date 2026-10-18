"""M5/P-01 synthetic browser camera input; no real camera/accuracy claim."""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]
image=np.array(Image.open(root/'tests/fixtures/synthetic-receipt.png').convert('RGB'))
yuv=cv2.cvtColor(image,cv2.COLOR_RGB2YUV_I420)
(root/'.data').mkdir(exist_ok=True)
with (root/'.data/camera.y4m').open('wb') as output:
    output.write(f'YUV4MPEG2 W{image.shape[1]} H{image.shape[0]} F30:1 Ip A1:1 C420jpeg\n'.encode())
    for _ in range(2):output.write(b'FRAME\n'+yuv.tobytes())
