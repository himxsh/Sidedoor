import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="7f2061c6-7e15-4312-9aaa-e813a4c727d4",
    name="Web || 23uec549 || TC-20",
    tc_id="TC-20",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"quotes_status_badge_healthy": "true", "calls_served_total_number": "true"},
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to http://localhost:3030/', instruction_id='56ecf43d-dc4f-44fa-adf6-133250a846c2'):
        await page.goto("http://localhost:3030/")
    
    async with testmu.step('PRIMARY: Scroll down the Endpoints list until the card whose name is \'quotes\' is visible; role=text; text="quotes" | HINTS: container=Endpoints list', instruction_id='f3b5a8bb-b7e7-49fd-bc31-54555444f803'):
        element_0 = page.locator("internal:testid=[data-testid=\"endpoint-list\"s] >> internal:text=\"quotes\"s")
        await element_0.evaluate("el => el.scrollIntoView({block: 'center'})")
    
    async with testmu.step("whether the text 'healthy' in the status badge next to the name 'quotes' is present (in the quotes endpoint card)", instruction_id='acf750db-e7d1-4c1c-8923-027f32c1056c'):
        set_var('quotes_status_badge_healthy', await testmu.vision_query(page, "whether the text 'healthy' in the status badge next to the name 'quotes' is present (in the quotes endpoint card)", ""))
    
    async with testmu.step('Assertion check', instruction_id='f6ae5ad6-80c3-4012-83f3-b9388e37e334'):
        await testmu.verify_assertion(page, 'Assertion check', {'operator': ['equals'], 'assertion_operands': [], 'left_operand': None, 'right_operand': None, 'operands': [], 'sub_results': [{'description': "the status badge next to the name 'quotes' contains the text 'healthy'", 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{quotes_status_badge_healthy}}', 'store_key': 'quotes_status_badge_healthy', 'variable_refs': {'{{quotes_status_badge_healthy}}': 'true'}}], 'sub_checks': [{'description': "the status badge next to the name 'quotes' contains the text 'healthy'", 'store_key': 'quotes_status_badge_healthy', 'expected_value': 'true', 'extracted_value': '{{quotes_status_badge_healthy}}', 'operator': 'equals', 'transforms': []}], 'composite_operator': 'and', 'claim': "the status badge next to the name 'quotes' contains the text 'healthy'"})
    
    async with testmu.step("whether a number in the 'Calls served' total is present (in the top totals row)", instruction_id='8186e8d1-2acc-45ad-9655-c3ec099072fc'):
        set_var('calls_served_total_number', await testmu.vision_query(page, "whether a number in the 'Calls served' total is present (in the top totals row)", ""))
    
    async with testmu.step('Assertion check', instruction_id='3550d555-3d3e-4ed5-9038-ab277100d74a'):
        await testmu.verify_assertion(page, 'Assertion check', {'operator': ['equals'], 'assertion_operands': [], 'left_operand': None, 'right_operand': None, 'operands': [], 'sub_results': [{'description': "the 'Calls served' total shows a number", 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{calls_served_total_number}}', 'store_key': 'calls_served_total_number', 'variable_refs': {'{{calls_served_total_number}}': 'true'}}], 'sub_checks': [{'description': "the 'Calls served' total shows a number", 'store_key': 'calls_served_total_number', 'expected_value': 'true', 'extracted_value': '{{calls_served_total_number}}', 'operator': 'equals', 'transforms': []}], 'composite_operator': 'and', 'claim': "the 'Calls served' total shows a number"})


if __name__ == "__main__":
    testmu.run(test)