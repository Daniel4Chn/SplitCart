import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import unittest
from splitcart.parser import parse,cents
ID='00000000-0000-4000-8000-000000000001'
def run(*texts):return parse([{'id':'l'+str(i),'text':text,'tokenIds':[]} for i,text in enumerate(texts)],ID)
class ParserTests(unittest.TestCase):
    def test_M4_PAR_prices_exact_and_unknown(self):
        self.assertEqual(cents('$1,234.56'),'123456')
        for value in ['1.234','1,23','1e3','1.2']:self.assertIsNone(cents(value))
        value,_=run('MILK 1.234','TOTAL 3.00')
        self.assertEqual(value['items'],[]);self.assertEqual(value['unparsedLineIds'],['l0'])
    def test_M4_PAR_wrapped_duplicates_tender(self):
        value,_=run('ORGANIC MILK','3.49','MILK 3.49','MILK 3.49','CASH 20.00','CHANGE 9.53','TOTAL 10.47')
        self.assertEqual([i['lineTotalCents'] for i in value['items']],['349']*3)
        self.assertEqual(value['items'][0]['sourceLineIds'],['l0','l1'])
        self.assertEqual(value['unparsedLineIds'],['l5','l6'] if False else ['l4','l5'])
        self.assertEqual(value['totalCents'],'1047')
    def test_M4_PAR_quantities_coupons_tax_missing_total(self):
        value,flags=run('APPLE 2 @ 1.00 2.50','BANANA 1.25 lb @ 0.80 1.00','COUPON -0.50','TAX 0.10','TAX 0.05','UNKNOWN 1.234')
        self.assertEqual(value['items'][0]['quantity'],'2')
        self.assertIn('QUANTITY_PRICE_CONFLICT',value['items'][0]['warnings'])
        self.assertEqual([a['kind'] for a in value['adjustments']],['receipt_discount','tax','tax'])
        self.assertIsNone(value['adjustments'][0]['targetItemIds']);self.assertIsNone(value['totalCents'])
        self.assertEqual(value['unparsedLineIds'],['l5'])
        self.assertIn('TOTAL_MISSING_OR_AMBIGUOUS',[f['code'] for f in flags])
    def test_M4_PAR_ambiguous_totals_determinism(self):
        a=run('ITEM 1.00','TOTAL 1.00','TOTAL 2.00');self.assertIsNone(a[0]['totalCents']);self.assertEqual(a,run('ITEM 1.00','TOTAL 1.00','TOTAL 2.00'))
