"""
Simple test runner for E2E tests.
Runs all test files sequentially and prints pass/fail summary.
Saves screenshots to tests/screenshots/ on failure.

Usage:
    cd E:/shared/workplace/ADD_new/tests
    python run_all.py
"""
import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path


# Test files to run (in order)
TEST_FILES = [
    "test_login.py",
    "test_dashboard.py",
    "test_artifacts.py",
    "test_graph.py",
    "test_chat.py",
]

# Colors for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"
BOLD = "\033[1m"


def run_test_file(test_file: str, tests_dir: Path) -> dict:
    """
    Run a single test file and return results.

    Returns:
        dict with keys: 'file', 'passed', 'failed', 'errors', 'output'
    """
    test_path = tests_dir / test_file

    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}Running: {test_file}{RESET}")
    print(f"{BOLD}{'='*60}{RESET}\n")

    result = {
        "file": test_file,
        "passed": 0,
        "failed": 0,
        "errors": [],
        "output": ""
    }

    try:
        # Run pytest with verbose output
        completed = subprocess.run(
            [
                sys.executable, "-m", "pytest",
                str(test_path),
                "-v",
                "--tb=short",
                "-W", "ignore::DeprecationWarning"
            ],
            cwd=str(tests_dir),
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes per file
        )

        output = completed.stdout + completed.stderr
        result["output"] = output

        # Parse output for pass/fail counts
        lines = output.split("\n")

        for line in lines:
            # Look for test result lines
            if "PASSED" in line:
                result["passed"] += 1
            elif "FAILED" in line:
                result["failed"] += 1
                result["errors"].append(f"Failed test in {test_file}")

        # Also check return code
        if completed.returncode == 0:
            # All tests passed
            pass
        else:
            # Some tests failed
            pass

    except subprocess.TimeoutExpired:
        result["errors"].append(f"Test file {test_file} timed out after 300 seconds")
        result["failed"] += 1
    except Exception as e:
        result["errors"].append(f"Error running {test_file}: {str(e)}")
        result["failed"] += 1

    return result


def main():
    """Main test runner."""
    print(f"\n{BOLD}{'#'*60}{RESET}")
    print(f"{BOLD}  E2E Test Suite for Cultural Heritage Platform{RESET}")
    print(f"{BOLD}  Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")
    print(f"{BOLD}{'#'*60}{RESET}\n")

    # Get tests directory
    tests_dir = Path(__file__).parent

    # Ensure screenshots directory exists
    screenshots_dir = tests_dir / "screenshots"
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    # Run all tests
    results = []
    total_passed = 0
    total_failed = 0

    for test_file in TEST_FILES:
        result = run_test_file(test_file, tests_dir)
        results.append(result)
        total_passed += result["passed"]
        total_failed += result["failed"]

        # Print immediate feedback
        if result["errors"]:
            print(f"\n{RED}Errors in {test_file}:{RESET}")
            for error in result["errors"]:
                print(f"  {RED}* {error}{RESET}")

    # Print summary
    print(f"\n\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}  TEST SUMMARY{RESET}")
    print(f"{BOLD}{'='*60}{RESET}\n")

    print(f"{'File':<25} {'Passed':>10} {'Failed':>10} {'Status':>15}")
    print("-" * 60)

    for result in results:
        status = f"{GREEN}PASSED{RESET}" if result["failed"] == 0 else f"{RED}FAILED{RESET}"
        print(f"{result['file']:<25} {result['passed']:>10} {result['failed']:>10} {status:>15}")

    print("-" * 60)
    total_status = f"{GREEN}ALL PASSED{RESET}" if total_failed == 0 else f"{RED}SOME FAILED{RESET}"
    print(f"{'TOTAL':<25} {total_passed:>10} {total_failed:>10} {total_status:>15}")

    print(f"\n{BOLD}Screenshots saved to: {screenshots_dir}{RESET}")

    # Print any error details
    if total_failed > 0:
        print(f"\n{BOLD}{RED}Failed Test Details:{RESET}")
        for result in results:
            if result["errors"] or result["failed"] > 0:
                print(f"\n{YELLOW}--- {result['file']} ---{RESET}")
                if result["output"]:
                    # Print last 50 lines of output for failed tests
                    lines = result["output"].split("\n")
                    for line in lines[-50:]:
                        print(line)

    # Exit with appropriate code
    exit_code = 0 if total_failed == 0 else 1
    print(f"\n{BOLD}Exit code: {exit_code}{RESET}\n")

    return exit_code


if __name__ == "__main__":
    sys.exit(main())