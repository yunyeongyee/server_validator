"""Exercise user-visible mockup flows in an isolated local browser/server."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))


def wait_value(page,expression):
    for _ in range(50):
        if page.evaluate(expression): return
        page.wait_for_timeout(100)
    raise AssertionError('Browser state did not become ready: '+expression)


def main():
    from playwright.sync_api import sync_playwright
    chromium=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome')
    screenshots=ROOT/'docs/mockup'
    screenshots.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='server-validator-test-') as temp:
        environment=dict(os.environ,SERVER_VALIDATOR_DATA_DIR=temp)
        process=subprocess.Popen([sys.executable,'-m','app.server','--port','8002'],cwd=ROOT,env=environment,stdout=subprocess.DEVNULL)
        try:
            for _ in range(100):
                try:
                    with urllib.request.urlopen('http://127.0.0.1:8002/api/health',timeout=1) as r:
                        assert json.load(r)['mode']=='mockup'
                    break
                except OSError: time.sleep(.1)
            else: raise RuntimeError('mockup server did not start')
            with sync_playwright() as p:
                kwargs={'headless':True,'args':['--no-sandbox']}
                if chromium: kwargs['executable_path']=chromium
                browser=p.chromium.launch(**kwargs)
                context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
                page=context.new_page(); errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto('http://127.0.0.1:8002');page.wait_for_selector('#analyze')
                page.click('[data-step="1"]');assert page.locator('#analyze').is_visible()
                page.click('#analyze');assert page.locator('#analyze').is_visible()
                page.wait_for_timeout(3300)
                page.screenshot(path=str(screenshots/'01-input.png'))
                page.click('#load-example');page.click('#analyze');page.wait_for_selector('#go-results')
                assert page.evaluate("state.data.requirement.items.find(i=>i.category==='cpu').clock_ghz") == 2.8
                assert page.evaluate("getTotals('cpu','cores')") == 16
                assert page.evaluate("getTotals('memory','capacity_gb')") == 128
                assert page.evaluate("state.data.quote.items.find(i=>i.category==='cal').cal_count") == 5
                page.wait_for_timeout(3300)
                page.screenshot(path=str(screenshots/'02-review.png'))
                with page.expect_response('**/api/compare'): page.select_option('#cpu-scope','per_cpu')
                wait_value(page,"state.data.comparison.rows.some(r=>r.title.includes('CPU 코어 수')&&r.status==='fail')")
                with page.expect_response('**/api/compare'): page.select_option('#cpu-scope','total')
                with page.expect_response('**/api/compare'): page.select_option('#memory-scope','total')
                wait_value(page,"state.data.comparison.rows.some(r=>r.title.includes('CPU 코어 수')&&r.status==='pass')")
                page.click('[data-edit="quote:0"]');page.check('#reviewed-check');page.click('#save-item');page.wait_for_selector('#save-item',state='hidden')
                assert page.evaluate('reviewCount()[0]') == 1
                page.click('[data-edit="quote:0"]');page.fill('#field-quantity','1');page.click('#save-item');assert page.locator('#save-item').is_visible()
                page.fill('#edit-reason','목업 수정·재판정 검증');page.click('#save-item');page.wait_for_selector('#save-item',state='hidden')
                assert page.evaluate("state.data.comparison.rows.find(r=>r.title.includes('CPU 코어 수')).status") == 'fail'
                page.click('[data-edit="quote:0"]');page.fill('#field-quantity','2');page.fill('#edit-reason','원문 2EA 복원');page.click('#save-item');page.wait_for_selector('#save-item',state='hidden')
                page.click('#go-results');page.click('#confirm-action');page.wait_for_selector('#export-report')
                assert page.evaluate("state.data.comparison.rows.find(r=>r.title==='SSD RAID').status") == 'unknown'
                page.wait_for_timeout(3300);page.screenshot(path=str(screenshots/'03-results.png'))
                page.locator('[data-research]').first.click();page.click('#save-research');page.click('[data-tab="research"]');assert page.locator('[data-research-view]').count()==1
                page.locator('[data-research-view]').click();assert '미실행' in page.locator('#modal-content').inner_text() or '목업에서는' in page.locator('#modal-content').inner_text();page.locator('#modal [data-close]').last.click()
                page.click('[data-next="3"]');assert page.locator('#png-export').is_disabled()
                page.click('#base-image');assert page.locator('.asset-card:not([disabled])').count()==0;page.locator('#modal [data-close]').last.click()
                page.click('#practice-start');page.wait_for_selector('#server-canvas');assert 'XR' in page.locator('.practice-label').inner_text()
                page.click('#detect-bays');page.click('#detect-manual');page.fill('#new-box-name','베이 1');page.fill('#new-box-size','2.5');page.click('#create-box')
                assert page.locator('[data-place-part]').first.is_disabled()
                for field,value in [('x','610'),('y','130'),('w','130'),('h','35')]:
                    page.fill('#coord-'+field,value);page.locator('#coord-'+field).blur()
                page.click('#confirm-coordinates');assert not page.locator('[data-place-part]').first.is_disabled()
                disk_index=page.evaluate("state.data.quote.items.findIndex(i=>i.category==='ssd')")
                page.click(f'[data-part-image="{disk_index}"]');page.locator('.asset-card:not([disabled])').first.click()
                page.click(f'[data-place-part="{disk_index}"]');page.click('#apply-placement');page.wait_for_selector('#apply-placement',state='hidden')
                assert page.evaluate('currentBoxes()[0].part')==disk_index
                page.click('#bold-label');assert page.evaluate('currentBoxes()[0].bold') is True
                page.focus('#canvas-wrap');page.keyboard.press('ArrowRight');assert page.evaluate('state.composition.confirmed.front') is False
                page.click('#confirm-coordinates');page.click('#auto-layout');page.wait_for_timeout(3300)
                page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(screenshots/'04-composition.png'))
                with page.expect_download() as download: page.click('#png-export')
                exported=Path(temp)/'composition.png';download.value.save_as(exported)
                assert exported.read_bytes().startswith(b'\x89PNG') and exported.stat().st_size>10000
                with page.expect_download() as download: page.click('#calibration-export')
                calibration=Path(temp)/'server.calibration.json';download.value.save_as(calibration)
                saved=json.loads(calibration.read_text());assert saved['composition']['practice'] is True
                page.set_input_files('#calibration-upload',str(calibration));page.click('#confirm-action');assert page.evaluate('state.composition.confirmed.front') is False
                invalid=Path(temp)/'invalid.calibration.json';saved['composition']['boxes']['front'][0]['x']=99999;invalid.write_text(json.dumps(saved))
                page.set_input_files('#calibration-upload',str(invalid));page.wait_for_timeout(300);assert not page.locator('#modal').is_visible()
                page.click('[data-view="rear"]');page.click('#practice-start');page.click('#add-box');page.select_option('#new-box-kind','PSU');page.fill('#new-box-name','PSU 1');page.click('#create-box')
                assert page.locator('#server-canvas').text_content().count('EMPTY')==1
                page.click('#base-image');page.locator('.asset-card:not([disabled])').first.click();page.click('#confirm-action');assert len(page.evaluate('currentBoxes()'))==0
                page.click('#review-summary');assert '최종 승인' in page.locator('#modal-content').inner_text();page.locator('#modal [data-close]').last.click()
                page.click('#save-draft');page.reload();page.wait_for_selector('#review-summary');assert page.evaluate('state.step')==3
                page.click('#library-open')
                image_file=next((ROOT/'static/assets/dell').glob('*.png'))
                page.set_input_files('#image-upload',str(image_file));page.wait_for_selector('#asset-save')
                page.select_option('#asset-category','disk');page.fill('#asset-name','실제 Dell 스텐실 내장 이미지 · 저장 검증');page.check('#real-image-check');page.click('#asset-save');page.wait_for_selector('#asset-save',state='hidden')
                assert page.evaluate('assets.length')==70
                page.locator('#modal [data-close]').last.click();page.reload();page.wait_for_selector('#review-summary');assert page.evaluate('assets.length')==70
                import zipfile
                stencil=Path(temp)/'embedded-image.vssx'
                with zipfile.ZipFile(stencil,'w') as archive: archive.write(image_file,'visio/media/image1.png')
                page.click('#library-open')
                with page.expect_response('**/api/stencil?*') as uploaded:
                    page.set_input_files('#stencil-upload',str(stencil))
                assert uploaded.value.status==200
                wait_value(page,"state.history.some(h=>h.action==='스텐실 가져오기'&&h.detail.includes('1개 추출'))")
                page.wait_for_selector('#asset-search');page.locator('#modal [data-close]').last.click()
                assert not errors,errors
                mobile=browser.new_page(viewport={'width':390,'height':844})
                mobile.goto('http://127.0.0.1:8002');mobile.wait_for_selector('#analyze')
                assert mobile.evaluate('document.documentElement.scrollWidth')<=390
                mobile.screenshot(path=str(screenshots/'05-mobile.png'))
                browser.close()
                print('PASS: document guards, extraction, source review, correction/recomparison, scope, research request, model filter, real stencil, calibration, placement, PNG, persistence and mobile; 0 browser errors')
        finally:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill();process.wait()


if __name__=='__main__': main()
