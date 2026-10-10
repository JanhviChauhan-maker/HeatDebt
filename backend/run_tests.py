import subprocess
try:
    subprocess.run([r".\venv\Scripts\pytest", "app/tests/"], capture_output=True, text=True, check=True)
    print("ALL TESTS PASSED")
except subprocess.CalledProcessError as e:
    lines = e.stdout.split('\n')
    fail_idx = [i for i, line in enumerate(lines) if "FAILED app/tests/" in line]
    for idx in fail_idx:
        print("=== FAILURE ===")
        print('\n'.join(lines[idx:idx+25]))
