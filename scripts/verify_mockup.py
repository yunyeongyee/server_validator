"""Exercise the React UI and FastAPI workflow against an isolated local server."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def main():
    from playwright.sync_api import sync_playwright
    screenshots=ROOT/'docs/mockup';screenshots.mkdir(parents=True,exist_ok=True)
    browser_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome')
    with tempfile.TemporaryDirectory(prefix='sv-react-test-') as temp:
        environment=dict(os.environ,SERVER_VALIDATOR_DATA_DIR=temp)
        environment.pop('OPENAI_API_KEY',None);environment.pop('SV_OPENAI_API_KEY',None)
        process=subprocess.Popen([sys.executable,'-m','app.server','--port','8002'],cwd=ROOT,env=environment,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                try:
                    with urllib.request.urlopen('http://127.0.0.1:8002/api/health',timeout=1) as response:
                        assert json.load(response)['stack'].startswith('FastAPI')
                    break
                except OSError:time.sleep(.1)
            else:raise RuntimeError('API did not start')
            with sync_playwright() as p:
                options={'headless':True,'args':['--no-sandbox']}
                if browser_path:options['executable_path']=browser_path
                browser=p.chromium.launch(**options)
                page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto('http://127.0.0.1:8002');page.wait_for_selector('#analyze')
                page.click('[data-step="1"]');assert page.locator('#analyze').is_visible()
                page.click('#analyze');assert page.locator('#analyze').is_visible()
                page.wait_for_timeout(3300);page.screenshot(path=str(screenshots/'01-input.png'))
                page.click('#load-example');page.click('#analyze');page.wait_for_selector('#go-results')
                assert page.locator('.spec-cell').count()==24
                assert '16' in page.locator('.metric').nth(1).inner_text()
                assert '128' in page.locator('.metric').nth(2).inner_text()
                assert '5 CAL' in page.locator('table').inner_text()
                page.wait_for_timeout(3300);page.screenshot(path=str(screenshots/'02-review.png'))
                with page.expect_response('**/api/compare'):page.select_option('#cpu-scope','per_cpu')
                page.click('#go-results');page.click('#confirm-action');page.wait_for_selector('#export-report')
                cpu=page.locator('.result-row').filter(has=page.get_by_role('heading',name='CPU 코어 수 (CPU당)',exact=True))
                assert '미충족' in cpu.inner_text()
                page.click('[data-step="1"]')
                with page.expect_response('**/api/compare'):page.select_option('#cpu-scope','total')
                with page.expect_response('**/api/compare'):page.select_option('#memory-scope','total')
                page.click('[data-edit="quote:0"]');page.check('#reviewed-check');page.click('#save-item');page.wait_for_selector('#modal',state='hidden')
                assert '1 / 24' in page.locator('.metric').nth(3).inner_text()
                page.click('[data-edit="quote:0"]');page.fill('#field-quantity','1');page.click('#save-item');assert page.locator('.form-error').is_visible()
                page.fill('#edit-reason','목업 재판정 검증');page.click('#save-item');page.wait_for_selector('#modal',state='hidden')
                assert '8' in page.locator('.metric').nth(1).inner_text()
                page.click('[data-edit="quote:0"]');page.fill('#field-quantity','2');page.fill('#edit-reason','원문 2EA 복원');page.click('#save-item');page.wait_for_selector('#modal',state='hidden')
                page.click('#go-results');page.click('#confirm-action');page.wait_for_selector('#export-report')
                cpu=page.locator('.result-row').filter(has=page.get_by_role('heading',name='CPU 코어 수 (서버 전체)',exact=True))
                assert '충족' in cpu.inner_text() and '미충족' not in cpu.inner_text()
                raid=page.locator('.result-row').filter(has=page.get_by_role('heading',name='SSD RAID',exact=True))
                assert '확인 필요' in raid.inner_text()
                page.wait_for_timeout(3300);page.screenshot(path=str(screenshots/'03-results.png'))
                page.locator('[data-research]').first.click();page.click('#save-research');page.wait_for_selector('#modal',state='hidden')
                page.click('[data-tab="research"]');assert page.locator('[data-research-view]').count()==1
                page.click('[data-research-view]');assert '미실행' in page.locator('#modal').inner_text();page.get_by_role('button',name='닫기',exact=True).last.click()
                page.click('[data-next="3"]');assert page.locator('#png-export').is_disabled()
                page.click('#base-image');assert page.locator('.asset-card:not([disabled])').count()==0;page.get_by_role('button',name='닫기',exact=True).last.click()
                page.click('#practice-start');page.wait_for_selector('#server-canvas');assert 'XR' in page.locator('.practice-label').inner_text()
                page.click('#detect-bays');page.click('#detect-manual');page.fill('#new-box-name','베이 1');page.fill('#new-box-size','2.5');page.click('#create-box')
                assert page.locator('[data-place-part]').first.is_disabled()
                for field,value in [('x','610'),('y','130'),('w','130'),('h','35')]:page.fill('#coord-'+field,value)
                page.click('#confirm-coordinates');assert not page.locator('[data-place-part]').first.is_disabled()
                page.click('[data-part-image="2"]');page.locator('.asset-card:not([disabled])').first.click();page.wait_for_selector('#modal',state='hidden')
                page.click('[data-place-part="2"]');page.click('#apply-placement');page.wait_for_selector('#modal',state='hidden')
                assert 'SSD' in page.locator('#server-canvas').text_content()
                page.click('#bold-label');page.focus('#canvas-wrap');page.keyboard.press('ArrowRight')
                assert page.locator('#confirm-coordinates').inner_text()=='좌표 확정'
                page.click('#confirm-coordinates');page.click('#auto-layout');page.wait_for_timeout(3300);page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(screenshots/'04-composition.png'))
                with page.expect_download() as download:page.click('#png-export')
                png=Path(temp)/'composition.png';download.value.save_as(png);assert png.read_bytes().startswith(b'\x89PNG') and png.stat().st_size>10000
                with page.expect_download() as download:page.click('#calibration-export')
                calibration=Path(temp)/'server.calibration.json';download.value.save_as(calibration)
                values=json.loads(calibration.read_text());assert values['composition']['practice'] is True
                page.set_input_files('#calibration-upload',str(calibration));page.click('#confirm-action');assert page.locator('#confirm-coordinates').inner_text()=='좌표 확정'
                values['composition']['boxes']['front'][0]['x']=99999
                invalid=Path(temp)/'invalid.calibration.json';invalid.write_text(json.dumps(values));page.set_input_files('#calibration-upload',str(invalid));page.wait_for_timeout(200);assert not page.locator('#modal').count()
                page.click('[data-view="rear"]');page.click('#practice-start');page.click('#add-box');page.select_option('#new-box-kind','PSU');page.fill('#new-box-name','PSU 1');page.click('#create-box');assert 'EMPTY' in page.locator('#server-canvas').text_content()
                page.click('#base-image');page.locator('.asset-card:not([disabled])').first.click();page.click('#confirm-action');assert page.locator('#server-canvas [data-box]').count()==0
                page.click('#review-summary');assert '최종 승인' in page.locator('#modal').inner_text();page.get_by_role('button',name='계속 검토',exact=True).click()
                page.click('#save-draft');page.reload();page.wait_for_selector('#review-summary')
                page.click('#library-open');image_file=next((ROOT/'static/assets/dell').glob('*.png'))
                page.set_input_files('#image-upload',str(image_file));page.wait_for_selector('#asset-save');page.select_option('#asset-category','disk');page.fill('#asset-name','실제 내장 이미지 저장 검증');page.check('#real-image-check');page.click('#asset-save');page.wait_for_selector('#asset-search')
                assert page.locator('.asset-card').count()==70
                page.get_by_role('button',name='닫기',exact=True).last.click();page.reload();page.wait_for_selector('#review-summary');page.click('#library-open');assert page.locator('.asset-card').count()==70
                stencil=Path(temp)/'embedded-image.vssx'
                with zipfile.ZipFile(stencil,'w') as archive:archive.write(image_file,'visio/media/image1.png')
                page.set_input_files('#stencil-upload',str(stencil));page.wait_for_selector('#asset-search');page.get_by_role('button',name='닫기',exact=True).last.click()
                assert not errors,errors
                mobile=browser.new_page(viewport={'width':390,'height':844});mobile.goto('http://127.0.0.1:8002');mobile.wait_for_selector('#analyze');assert mobile.evaluate('document.documentElement.scrollWidth')<=390;mobile.screenshot(path=str(screenshots/'05-mobile.png'))
                browser.close();print('PASS: React input/review/correction/scopes/verdicts/research/real artwork/calibration/placement/Pillow PNG/uploads/persistence/mobile; 0 browser errors')
        finally:
            process.terminate()
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.kill();process.wait()


if __name__=='__main__':main()
