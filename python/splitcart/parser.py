"""M4 PAR-01..07. Conservative deterministic proposals; unknowns remain evidence."""
import re
import uuid
VERSION = 'conservative-v1'
PRICE = re.compile(r'(?<![\d.,])(-?\$?(?:0|[1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)\.\d{2})(?![\d.,])')
TENDER = re.compile(r'\b(?:cash|change|visa|mastercard|debit|credit|tender|balance|payment|savings|loyalty|card)\b', re.I)
TOTAL = re.compile(r'^(?:(?:grand|amount due)\s+)?total\b',re.I)

def cents(text):
    text=text.replace('$','').replace(',','')
    if not re.fullmatch(r'-?(?:0|[1-9]\d*)\.\d{2}',text): return None
    sign=-1 if text.startswith('-') else 1
    whole,part=text.lstrip('-').split('.')
    value=sign*(int(whole)*100+int(part))
    return str(value) if abs(value)<=100000000 else None

def parse(lines, attempt_id):
    result={'currency':'USD','merchant':None,'purchasedOn':None,'items':[],'subtotalCents':None,'totalCents':None,'adjustments':[],'unparsedLineIds':[]}
    totals=[]; warnings=[]; pending=None
    def stable(kind,line): return str(uuid.uuid5(uuid.UUID(attempt_id),kind+':'+line))
    for line in lines:
        text=line['text'].strip(); line_id=line['id']; matches=list(PRICE.finditer(text))
        if not text: continue
        if TENDER.search(text):
            result['unparsedLineIds'].append(line_id); pending=None;continue
        if TOTAL.match(text):
            if len(matches)==1 and not matches[0].group().startswith('-'): totals.append(cents(matches[0].group()))
            else: totals.append(None)
            pending=None;continue
        if re.match(r'^sub\s*total\b',text,re.I):
            if len(matches)==1: result['subtotalCents']=cents(matches[0].group())
            else: result['unparsedLineIds'].append(line_id)
            pending=None;continue
        if re.match(r'^(?:tax\b|sales tax\b|fee\b|coupon\b|discount\b)',text,re.I) or (matches and matches[-1].group().startswith('-')):
            kind='tax' if re.match(r'^(?:sales )?tax\b',text,re.I) else 'fee' if re.match(r'^fee\b',text,re.I) else 'receipt_discount'
            value=cents(matches[-1].group()) if len(matches)==1 else None
            result['adjustments'].append({'id':stable('adjustment',line_id),'kind':kind,'label':text[:120],'amountCents':str(abs(int(value))) if value is not None else None,'targetItemIds':None,'sourceLineIds':[line_id],'warnings':['ELIGIBILITY_REVIEW_REQUIRED']})
            pending=None;continue
        if matches and matches[-1].end()==len(text):
            price=cents(matches[-1].group()); name=text[:matches[-1].start()].strip(); sources=[line_id]; quantity=None; unit=None
            q=re.search(r'\b(\d+(?:\.\d{1,3})?)\s*(?:@|x)\s*\$?(\d+\.\d{2})',name,re.I)
            if q:
                quantity=q.group(1) if int(q.group(1).replace('.',''))>0 else None;unit=cents(q.group(2));name=name[:q.start()].strip()
            if not name and pending:
                name=pending['text'].strip();sources.insert(0,pending['id']);result['unparsedLineIds'].remove(pending['id'])
            flags=[]
            if not name or price is None or int(price)<0: result['unparsedLineIds'].append(line_id);pending=None;continue
            if len(matches)>1 and not q: flags.append('MULTIPLE_PRICES')
            if quantity and unit:
                parts=quantity.split('.');scale=10**len(parts[1]) if len(parts)>1 else 1;n=int(''.join(parts))
                if int(unit)*n!=int(price)*scale: flags.append('QUANTITY_PRICE_CONFLICT')
            if re.search(r'\b(?:lb|kg|oz)\b',text,re.I):flags.append('WEIGHTED_ITEM_REVIEW')
            result['items'].append({'id':stable('item',line_id),'description':name[:240],'quantity':quantity,'unitPriceCents':unit,'lineTotalCents':price,'sourceLineIds':sources,'warnings':flags})
            pending=None;continue
        result['unparsedLineIds'].append(line_id)
        pending=line if not matches and not re.search(r'\d[.,]\d|\d',text) else None
    if len(totals)==1 and totals[0] is not None: result['totalCents']=totals[0]
    else: warnings.append({'code':'TOTAL_MISSING_OR_AMBIGUOUS','lineIds':[]})
    warnings.append({'code':'REVIEW_REQUIRED','lineIds':[x['id'] for x in lines]})
    return result,warnings
