"""M3 IMG-01..08: internal-path-only bounded worker. stdout is one JSON result."""
import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import warnings

# Apply before importing native decoders. Linux address-space guard; macOS uses CPU/file bounds.
resource.setrlimit(resource.RLIMIT_CPU,(65,65))
resource.setrlimit(resource.RLIMIT_FSIZE,(16*1024*1024,16*1024*1024))
resource.setrlimit(resource.RLIMIT_NOFILE,(64,64))
if sys.platform.startswith('linux'): resource.setrlimit(resource.RLIMIT_AS,(2*1024**3,2*1024**3))
os.environ['OMP_THREAD_LIMIT']='1'
import cv2
import numpy as np
from PIL import Image,ImageOps,UnidentifiedImageError
from splitcart.parser import parse, VERSION
from splitcart.preprocess import deskew, display_box
Image.MAX_IMAGE_PIXELS=25_000_000
warnings.simplefilter('error',Image.DecompressionBombWarning)

def decode(path, mime):
    size=Path(path).stat().st_size
    if size==0 or size>10*1024*1024: raise ValueError('IMAGE_UNREADABLE')
    with Image.open(path) as im:
        actual={'JPEG':'image/jpeg','PNG':'image/png'}.get(im.format)
        if actual is None or actual!=mime or getattr(im,'n_frames',1)!=1: raise ValueError('IMAGE_UNREADABLE')
        w,h=im.size
        if w*h>25_000_000 or min(w,h)<1 or max(w,h)>12000:raise ValueError('IMAGE_UNREADABLE')
        im.verify()
    with Image.open(path) as im:
        normalized=ImageOps.exif_transpose(im).convert('RGB')
        normalized.info.clear()
        return normalized

def tsv(image,path):
    cv2.imwrite(str(path),image)
    output=subprocess.run(['tesseract',str(path),'stdout','-l','eng','--psm','6','tsv'],capture_output=True,timeout=25,check=True)
    if len(output.stdout)>2*1024*1024 or len(output.stderr)>65536:raise ValueError('OCR_FAILED')
    tokens=[]; groups={}
    for row in csv.DictReader(io.StringIO(output.stdout.decode('utf8')),delimiter='\t'):
        if row['level']!='5' or not row['text'].strip():continue
        line='l'+':'.join(row[k] for k in ['page_num','block_num','par_num','line_num'])
        conf=float(row['conf']);token={'id':'t'+str(len(tokens)+1),'text':row['text'][:500],'confidence':max(0,min(100,round(conf))) if conf>=0 else None,'box':[int(row[k]) for k in ['left','top','width','height']],'lineId':line}
        tokens.append(token);groups.setdefault(line,[]).append(token)
        if len(tokens)>15000:raise ValueError('OCR_FAILED')
    lines=[{'id':line,'text':' '.join(t['text'] for t in ts),'tokenIds':[t['id'] for t in ts]} for line,ts in groups.items()]
    score=sum(t['confidence'] or 0 for t in tokens)//max(1,len(tokens))
    return tokens,lines,score

def main():
    args=argparse.ArgumentParser();args.add_argument('--input',required=True);args.add_argument('--request',required=True);a=args.parse_args()
    request=json.loads(Path(a.request).read_text());attempt=request['attemptId']
    try:
        if set(request)!={'schemaVersion','attemptId','language','mode','mime'} or request['schemaVersion']!=1 or request['language']!='eng' or request['mode'] not in ['validate','ocr']:raise ValueError('OCR_FAILED')
        image=decode(a.input,request['mime']);w,h=image.size
        display=Path(a.input).parent/'display.png';image.save(display,format='PNG')
        info={'width':w,'height':h,'coordinateSpace':'normalized-display','transform':[1,0,0,0,1,0,0,0,1]}
        if request['mode']=='validate':
            return {'schemaVersion':1,'attemptId':attempt,'status':'validated','image':info}
        gray=cv2.cvtColor(np.array(image),cv2.COLOR_RGB2GRAY)
        gray,inverse,skew_warning=deskew(gray)
        info['transform']=inverse.flatten().tolist()
        base=tsv(gray,Path(a.input).parent/'baseline.png')
        threshold=cv2.adaptiveThreshold(gray,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY,31,11)
        alternate=tsv(threshold,Path(a.input).parent/'threshold.png')
        selected=alternate if alternate[2]>base[2] else base;which='threshold' if selected is alternate else 'baseline'
        tokens,lines,_=selected
        for token in tokens:token['box']=display_box(token['box'],inverse,w,h)
        candidate,flags=parse(lines,attempt)
        flags.append({'code':skew_warning,'lineIds':[]})
        if not tokens:flags.append({'code':'EMPTY_OCR','lineIds':[]})
        if any((t['confidence'] or 0)<60 for t in tokens):flags.append({'code':'LOW_CONFIDENCE','lineIds':[]})
        engine=subprocess.run(['tesseract','--version'],capture_output=True,text=True,timeout=5,check=True).stdout.splitlines()[0]
        lang=subprocess.run(['tesseract','--list-langs'],capture_output=True,text=True,timeout=5,check=True).stdout.splitlines()[0]
        # Locate eng traineddata through the engine's own data directory, not user input.
        import re
        found=re.search(r'"([^"]+)"',lang)
        data=Path(found.group(1))/'eng.traineddata' if found else None
        data_version=hashlib.sha256(data.read_bytes()).hexdigest() if data and data.is_file() else 'unverified'
        return {'schemaVersion':1,'attemptId':attempt,'status':'ok','image':info,'tokens':tokens,'lines':lines,'candidate':candidate,'warnings':flags,'engine':{'processorVersion':'opencv-v1','parserVersion':VERSION,'tesseractVersion':engine,'languageDataVersion':data_version,'candidate':which,'selectionReason':'higher mean token confidence; baseline wins ties'}}
    except (ValueError,UnidentifiedImageError,OSError,subprocess.SubprocessError,Image.DecompressionBombError,Image.DecompressionBombWarning):
        return {'schemaVersion':1,'attemptId':attempt,'status':'error','error':{'code':'IMAGE_UNREADABLE' if request['mode']=='validate' else 'OCR_FAILED','message':'Retake the image or enter the receipt manually.'},'warnings':[]}

if __name__=='__main__':
    value=main();sys.stdout.write(json.dumps(value,separators=(',',':')));sys.exit(2 if value['status']=='error' else 0)
