import copy
import unittest
from app.analysis import extract_rules, compare, compatibility, validate_ai, item


class ExtractionTests(unittest.TestCase):
    def test_cpu_cores_not_threads_and_memory_totals(self):
        quote=extract_rules('CPU : 인텔 제온 골드 5415+ 2.9G, 8C/16T * 2EA\nMEM : 32GB RDIMM, 4800MT/s * 4EA','quote')
        req=extract_rules('CPU : 2.8Ghz이상 16코어이상 / 메모리 : 128G이상','requirement')
        self.assertEqual(req['items'][0]['clock_ghz'],2.8)
        self.assertEqual(quote['items'][0]['cores'],8)
        default=compare(req,quote)
        self.assertEqual(default['status'],'unknown')
        total=compare(req,quote,{'cpu_core_scope':'total','memory_scope':'total'})
        self.assertEqual(total['status'],'pass')
        per_cpu=compare(req,quote,{'cpu_core_scope':'per_cpu','memory_scope':'total'})
        self.assertEqual(per_cpu['status'],'fail')

    def test_no_cals_does_not_hide_separate_cal_pack(self):
        req=extract_rules('OS : Windows Server 2022 Stn. 16core, w/5Cals','requirement')
        quote=extract_rules('SW : Windows 서버 2022 표준,16코어,No CAL\n5-팩 of Windows 서버 2022/2019 User CALs (표준 또는 데이터 센터)','quote')
        self.assertEqual([i['category'] for i in quote['items']],['os','cal'])
        self.assertEqual(quote['items'][1]['cal_count'],5)
        rows=compare(req,quote)['rows']
        self.assertEqual(next(r['status'] for r in rows if r['title']=='CAL 수량'),'pass')

    def test_disk_count_does_not_imply_raid(self):
        req=extract_rules('SSD : 960GB SSD SATA * 2EA(RAID1)','requirement')
        quote=extract_rules('SSD : 960GB SSD SATA * 2EA','quote')
        rows=compare(req,quote)['rows']
        self.assertEqual(next(r['status'] for r in rows if 'RAID' in r['title']),'unknown')

    def test_sas_is_not_automatically_nearline_sas(self):
        req=extract_rules('HDD : 4TB 7.2K RPM NLSAS * 6EA','requirement')
        quote=extract_rules('HDD : 4TB SAS ISE 12Gbps 7.2K 512n 3.5in Hard Drive * 6EA','quote')
        self.assertEqual(quote['items'][0]['rpm'],7200)
        self.assertEqual(compare(req,quote)['status'],'unknown')

    def test_absent_quote_model_not_inherited(self):
        req=extract_rules('PowerEdge R760 Server','requirement')
        quote=extract_rules('CPU : 8C/16T * 2EA','quote')
        self.assertEqual(compare(req,quote)['status'],'unknown')
        self.assertEqual(compatibility(quote)['status'],'unknown')

    def test_adapter_not_reused_for_two_independent_requirements(self):
        req=extract_rules('NIC : QP 10GbE / DP 1GbE','requirement')
        quote=extract_rules('NIC : Broadcom 57504 Quad Port 10/25GbE OCP NIC 3.0','quote')
        self.assertEqual(compare(req,quote)['status'],'fail')

    def test_pcie_in_ocp_fails_even_without_verified_catalog(self):
        quote=extract_rules('HBA : QLogic 2772 Dual Port 32Gb HBA, PCIe Full Height','quote')
        result=compatibility(quote,{'slots':[{'slot':'OCP1','component_mount':'PCIe','slot_mount':'OCP'}]})
        self.assertEqual(result['status'],'fail')

    def test_reject_ai_invented_evidence_and_numbers(self):
        raw='CPU : 8C/16T * 2EA'; it=item('cpu',raw);it['cores']=8;it['quantity']=2
        self.assertEqual(len(validate_ai({'items':[it],'unparsed':[]},raw,'quote')['items']),1)
        bad=copy.deepcopy(it);bad['cores']=64
        with self.assertRaises(ValueError): validate_ai({'items':[bad],'unparsed':[]},raw,'quote')
        bad=copy.deepcopy(it);bad['evidence']='CPU : 64C'
        with self.assertRaises(ValueError): validate_ai({'items':[bad],'unparsed':[]},raw,'quote')

    def test_missing_documents_never_pass(self):
        empty=extract_rules('','requirement')
        self.assertEqual(compare(empty,extract_rules('','quote'))['status'],'unknown')


if __name__=='__main__': unittest.main()
