# Lets the tests import backend files. Run from the backend folder: python -m pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
