import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import uuid
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
class ImageTests(unittest.TestCase):
    def validate(self,content,mime='image/png'):
        (ROOT/'.data').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT/'.data') as directory:
            path=Path(directory);(path/'input').write_bytes(content);attempt=str(uuid.uuid4());(path/'request').write_text(json.dumps({'schemaVersion':1,'attemptId':attempt,'language':'eng','mode':'validate','mime':mime}))
            result=subprocess.run([sys.executable,'-m','splitcart.cli','--input',str(path/'input'),'--request',str(path/'request')],env={**os.environ,'PYTHONPATH':str(ROOT/'python'),'OMP_THREAD_LIMIT':'1','OPENBLAS_NUM_THREADS':'1'},capture_output=True,timeout=10)
            value=json.loads(result.stdout)
            if value['status']=='validated':
                with Image.open(path/'display.png') as display:self.assertEqual(len(display.getexif()),0)
            self.assertEqual(value['attemptId'],attempt);self.assertNotIn(b'Traceback',result.stderr);return value,result.returncode
    def encode(self,image,**kwargs):
        import io
        data=io.BytesIO();image.save(data,format='PNG',**kwargs);return data.getvalue()
    def test_M3_IMG_valid_and_mime_mismatch(self):
        content=self.encode(Image.new('RGB',(20,30),'white'));value,code=self.validate(content);self.assertEqual(code,0);self.assertEqual(value['image']['width'],20)
        self.assertEqual(self.validate(content,'image/jpeg')[1],2)
    def test_M3_IMG_truncated_large_and_multiframe(self):
        self.assertEqual(self.validate(b'\x89PNG\r\n\x1a\ntruncated')[1],2)
        self.assertEqual(self.validate(b'x'*(10*1024*1024+1))[1],2)
        self.assertEqual(self.validate(self.encode(Image.new('RGB',(12001,1),'white')))[1],2)
        a=Image.new('RGB',(20,20),'white');b=Image.new('RGB',(20,20),'black');content=self.encode(a,save_all=True,append_images=[b],duration=100,loop=0)
        self.assertEqual(self.validate(content)[1],2)

    def test_M3_IMG_orientation_and_metadata_removed(self):
        import io
        image=Image.new('RGB',(20,30),'white');exif=Image.Exif();exif[274]=6;exif[315]='Synthetic metadata must not reach display'
        encoded=io.BytesIO();image.save(encoded,format='JPEG',exif=exif)
        value,code=self.validate(encoded.getvalue(),'image/jpeg');self.assertEqual(code,0);self.assertEqual((value['image']['width'],value['image']['height']),(30,20))
