import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import unittest
from splitcart.evaluate import evaluate
class EvaluationTests(unittest.TestCase):
    def test_M4_PAR3_raw_denominators_include_missed_lines(self):
        truth={'items':[{'id':'a','sourceLineIds':['l1'],'lineTotalCents':'100','quantity':None},{'id':'b','sourceLineIds':['l2'],'lineTotalCents':'200','quantity':'2'}],'totalCents':'300'}
        candidate={'items':[{'sourceLineIds':['l1'],'lineTotalCents':'100','quantity':None}],'adjustments':[],'totalCents':None}
        counts,failures=evaluate(candidate,truth)
        self.assertEqual(counts['matchedLines'],1);self.assertEqual(counts['readablePrices'],2);self.assertEqual(counts['correctPrices'],1);self.assertEqual(counts['correctTotals'],0);self.assertEqual(counts['readableQuantities'],1);self.assertEqual(counts['correctQuantities'],0);self.assertEqual(counts['reconciled'],0);self.assertEqual(failures,[{'missedGroundTruthItem':'b'}])
