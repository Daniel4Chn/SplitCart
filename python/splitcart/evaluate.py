"""M4/M7 A-PAR-3, A-REL-3: raw-count evaluation of saved, source-aligned predictions.

Run: PYTHONPATH=python .venv/bin/python -m splitcart.evaluate MANIFEST [--holdout]
Manifest receipts reference groundTruth and predictions (baseline/threshold/selected).
This never invents consent, ground truth, review time or targets.
"""
import argparse
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def local(value):
    path=(ROOT/value).resolve()
    if not path.is_relative_to(ROOT):raise ValueError('Evaluation paths must stay inside project')
    return path

def evaluate(candidate,truth):
    # Ground truth sourceLineIds are independently checked alignment annotations for this saved OCR run.
    actual=truth['items'];predicted=candidate['items'];used=set();cursor=0;matched=[]
    for item in predicted:
        index=next((i for i in range(cursor,len(actual)) if set(item['sourceLineIds']) & set(actual[i]['sourceLineIds'])),None)
        if index is not None:used.add(index);cursor=index+1;matched.append((item,actual[index]))
    readable_prices=[x for x in actual if x['lineTotalCents'] is not None]
    matched_prices=[(a,b) for a,b in matched if b['lineTotalCents'] is not None]
    correct=sum(a['lineTotalCents']==b['lineTotalCents'] for a,b in matched_prices)
    quantities=[(a,b) for a,b in matched if b.get('quantity') is not None]
    known_quantities=sum(x.get('quantity') is not None for x in actual)
    financial=[x['lineTotalCents'] for x in predicted]+[x['amountCents'] for x in candidate['adjustments']]
    total=None
    if all(x is not None for x in financial):
        total=sum(int(x['lineTotalCents']) for x in predicted)+sum((-1 if a['kind'] in ['line_discount','receipt_discount'] else 1)*int(a['amountCents']) for a in candidate['adjustments'])
    counts={'predictedLines':len(predicted),'groundTruthLines':len(actual),'matchedLines':len(matched),'readablePrices':len(readable_prices),'matchedReadablePrices':len(matched_prices),'correctPrices':correct,'readableTotals':int(truth['totalCents'] is not None),'correctTotals':int(truth['totalCents'] is not None and candidate['totalCents']==truth['totalCents']),'readableQuantities':known_quantities,'correctQuantities':sum(a.get('quantity')==b['quantity'] for a,b in quantities),'receipts':1,'reconciled':int(truth['totalCents'] is not None and total==int(truth['totalCents']))}
    failures=[{'sourceLineIds':b['sourceLineIds'],'expectedPrice':b['lineTotalCents'],'predictedPrice':a['lineTotalCents']} for a,b in matched if a['lineTotalCents']!=b['lineTotalCents']]
    failures.extend({'missedGroundTruthItem':actual[i]['id']} for i in range(len(actual)) if i not in used)
    return counts,failures

def main():
    parser=argparse.ArgumentParser();parser.add_argument('manifest');parser.add_argument('--holdout',action='store_true');a=parser.parse_args()
    manifest_path=local(a.manifest);manifest=json.loads(manifest_path.read_text());receipts=manifest.get('receipts',[])
    if manifest.get('schemaVersion')!=1 or not receipts:raise ValueError('No real receipts available; evaluation is blocked, not passed')
    groups={};buckets={};details=[]
    for receipt in receipts:
        group=receipt['receiptGroupId'];split=receipt['split']
        if group in groups and groups[group]!=split:raise ValueError('Receipt group leaks across holdout/development')
        groups[group]=split
    for receipt in receipts:
        if receipt['split']!=('holdout' if a.holdout else 'development'):continue
        if receipt['consent'] is not True or receipt.get('independentlyChecked') is not True:raise ValueError('Consent and independent ground truth check required')
        truth=json.loads(local(receipt['groundTruth']).read_text())
        for variant,path in receipt['predictions'].items():
            saved=json.loads(local(path).read_text());counts,failures=evaluate(saved['candidate'],truth)
            key='|'.join([variant,receipt['store'],receipt['quality']]);bucket=buckets.setdefault(key,{k:0 for k in counts})
            for name,count in counts.items():bucket[name]+=count
            details.append({'receiptId':receipt['id'],'variant':variant,'counts':counts,'failures':failures,'engine':saved['engine'],'predictionSha256':hashlib.sha256(local(path).read_bytes()).hexdigest(),'durationMs':receipt.get('durationMs'),'timedOut':receipt.get('timedOut')})
    if not details:raise ValueError('No receipts in requested split')
    print(json.dumps({'schemaVersion':1,'split':'holdout' if a.holdout else 'development','manifestSha256':hashlib.sha256(manifest_path.read_bytes()).hexdigest(),'buckets':buckets,'details':details,'reviewBurden':'Requires observed user study; not inferred from extraction'},indent=2))
if __name__=='__main__':main()
