from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"


def fixture_bytes(name: str) -> bytes:
    """A recorded response from tests/fixtures, byte for byte."""
    return (FIXTURES / name).read_bytes()
