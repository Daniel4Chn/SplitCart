"""M0 private, project-local PostgreSQL. Never touches an existing cluster."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
data=root/'.data/postgres'
data.parent.mkdir(exist_ok=True)
if not data.exists():
    subprocess.run(['initdb','-D',str(data),'-U','splitcart','--auth=trust','--encoding=UTF8','--no-locale'],check=True,stdout=subprocess.DEVNULL)
if subprocess.run(['pg_ctl','-D',str(data),'status'],stdout=subprocess.DEVNULL).returncode:
    subprocess.run(['pg_ctl','-D',str(data),'-l',str(data.parent/'postgres.log'),'-o','-h 127.0.0.1 -p 55432','start'],check=True)
check=subprocess.run(['psql','-h','127.0.0.1','-p','55432','-U','splitcart','-d','postgres','-tAc',"SELECT 1 FROM pg_database WHERE datname='splitcart'"],capture_output=True,text=True,check=True)
if check.stdout.strip()!='1':
    subprocess.run(['createdb','-h','127.0.0.1','-p','55432','-U','splitcart','splitcart'],check=True)
print('Project database ready at 127.0.0.1:55432 (loopback only).')
