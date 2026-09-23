from runner.app.models import VerificationRequest


def test_verification_requires_at_least_one_check():
    try:
        VerificationRequest(run_id="r", plan_id="p", repo_url="https://example.com/x.git", checks=[])
    except Exception:
        pass
    else:
        raise AssertionError("verification without proof checks must fail")
