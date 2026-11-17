import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="e1357670-cd0e-4675-895e-5e38ada80370",
    name="Verify Quotes Endpoint Health and Calls",
    tc_id="TC-12",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"quotes_status_badge_healthy": "true", "calls_served_total_number": "5"},
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to http://localhost:3030/', instruction_id='56f9f768-73a5-4ca2-ada7-9ff06fde048f'):
        await page.goto("http://localhost:3030/")
    
    async with testmu.step('Waiting for the Endpoints list to load', instruction_id='a0ee195f-828e-4d7e-b1a0-8d483e8fbedf'):
        await page.wait_for_timeout(1000)
    
    async with testmu.step("whether the status badge next to the name 'quotes' containing the text 'healthy' is present (in the Endpoints section)", instruction_id='d12f005c-e530-498d-aee4-c700f4976486'):
        set_var('quotes_status_badge_healthy', await testmu.vision_query(page, "whether the status badge next to the name 'quotes' containing the text 'healthy' is present (in the Endpoints section)", ""))
    
    async with testmu.step("the 'Calls served' total shows a number.", instruction_id='bdafba33-76de-4f32-aee3-f60a507ae102'):
        set_var('calls_served_total_number', await testmu.vision_query(page, "the 'Calls served' total shows a number.", ""))
    
    async with testmu.step('Assertion check', instruction_id='fa5ce1df-e310-4e64-b07e-8d9b02d7b067'):
        await testmu.verify_assertion(page, 'Assertion check', {'operator': ['equals'], 'assertion_operands': [], 'left_operand': None, 'right_operand': None, 'operands': [], 'sub_results': [{'description': "the status badge next to the name 'quotes' contains the text 'healthy'.", 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{quotes_status_badge_healthy}}', 'store_key': 'quotes_status_badge_healthy', 'variable_refs': {'{{quotes_status_badge_healthy}}': 'true'}}], 'sub_checks': [{'description': "the status badge next to the name 'quotes' contains the text 'healthy'.", 'store_key': 'quotes_status_badge_healthy', 'expected_value': 'true', 'extracted_value': '{{quotes_status_badge_healthy}}', 'operator': 'equals', 'transforms': []}], 'composite_operator': 'and', 'claim': "the status badge next to the name 'quotes' contains the text 'healthy'."})
    
    async with testmu.step('Assertion check', instruction_id='14088db5-d97b-413e-b5a2-bb2f2661fc19'):
        await testmu.verify_assertion(page, 'Assertion check', {'operator': ['equals'], 'assertion_operands': [], 'left_operand': None, 'right_operand': None, 'operands': [], 'sub_results': [{'description': "the 'Calls served' total shows a number.", 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': '5', 'extracted_value': '{{calls_served_total_number}}', 'store_key': 'calls_served_total_number', 'variable_refs': {'{{calls_served_total_number}}': '5'}}], 'sub_checks': [{'description': "the 'Calls served' total shows a number.", 'store_key': 'calls_served_total_number', 'expected_value': '5', 'extracted_value': '{{calls_served_total_number}}', 'operator': 'equals', 'transforms': []}], 'composite_operator': 'and', 'claim': "the 'Calls served' total shows a number."})


if __name__ == "__main__":
    testmu.run(test)