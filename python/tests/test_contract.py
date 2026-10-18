import unittest
class FoundationTest(unittest.TestCase):
    def test_python_runtime(self):
        import sys
        self.assertGreaterEqual(sys.version_info[:2], (3, 11))
