"""Regression coverage for GitHub Code → Download ZIP without Node.js."""
import re
import subprocess
import unittest
from pathlib import Path

from app.analysis import ROOT


class SourceDistributionTests(unittest.TestCase):
    def test_react_entrypoint_and_referenced_files_are_in_git(self):
        tracked = None
        if (ROOT / '.git').exists():
            tracked = set(subprocess.check_output(
                ['git', 'ls-files', '--cached'], cwd=ROOT, text=True,
            ).splitlines())
            self.assertIn('web/index.html', tracked,
                          'GitHub source ZIP must include the built React entrypoint.')
        html = (ROOT / 'web/index.html').read_text(encoding='utf-8')
        references = re.findall(r'(?:src|href)="(/ui-assets/[^\"]+)"', html)
        self.assertTrue(references, 'React entrypoint must reference built JS/CSS.')
        for reference in references:
            with self.subTest(reference=reference):
                relative = 'web/' + reference.lstrip('/')
                if tracked is not None: self.assertIn(relative, tracked)
                self.assertTrue((ROOT / relative).is_file())


if __name__ == '__main__': unittest.main()
