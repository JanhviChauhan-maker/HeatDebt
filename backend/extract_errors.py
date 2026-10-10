import codecs
lines = codecs.open('test_out.txt', encoding='utf-16').readlines()
errs = []
record = False
for l in lines:
    if "___ test_" in l:
        record = ("test_tiebreaking" in l or "test_unsafe_afternoon" in l)
    if record:
        errs.append(l)
open('err.txt', 'w', encoding='utf-8').write("".join(errs))
