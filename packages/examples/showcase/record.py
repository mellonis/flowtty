#!/usr/bin/env python3
"""Record the self-playing showcase to an asciicast (.cast) file.

The showcase drives itself, so recording is: run it in a pseudo-terminal of a
known size, and write down every chunk it prints with its timestamp. No browser,
no screen capture — the .cast is an exact replay of the bytes a terminal got.

    python3 packages/examples/showcase/record.py            # → docs/showcase.cast
    agg --theme dracula --renderer resvg --line-height 1.2 \\
        docs/showcase.cast docs/showcase.gif                 # brew install agg

`--renderer resvg` is what makes the borders clean. agg's default renderer
rasterizes each glyph into its cell and leaves box-drawing lines short of the
cell edge — corners don't close and T-junctions sag, with every font tried
(built-in, Menlo, SF Mono, PT Mono, Andale Mono). resvg draws them joined, and
with agg's BUILT-IN font, so the GIF does not depend on what is installed.

`npm run showcase:record` does both. Extra arguments go to the showcase
(e.g. `--speed 1.5`).
"""
import fcntl, json, os, pty, select, struct, sys, termios, time

COLS, ROWS = 104, 32          # the showcase frame is 100x30; leave a small margin
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'showcase.cast')
TIMEOUT = 300                 # seconds; a full run is about a minute

def main() -> int:
    extra = sys.argv[1:]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(os.path.join(ROOT, 'packages', 'examples'))
        os.environ['TERM'] = 'xterm-256color'
        os.environ['COLORTERM'] = 'truecolor'
        # tsx directly, not through npx: npx draws its own spinner into the recording.
        tsx = os.path.join(ROOT, 'node_modules', '.bin', 'tsx')
        os.execv(tsx, [tsx, 'showcase/index.tsx', '--exit', *extra])
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', ROWS, COLS, 0, 0))

    start = time.time()
    events = []
    while time.time() - start < TIMEOUT:
        ready, _, _ = select.select([fd], [], [], 0.5)
        if fd in ready:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                break
            if not chunk:
                break
            events.append((time.time() - start, chunk))
        elif os.waitpid(pid, os.WNOHANG)[0]:
            break
    try:
        status = os.waitpid(pid, 0)[1]
    except ChildProcessError:
        status = 0
    code = os.waitstatus_to_exitcode(status)

    # Decode across chunk boundaries: a multi-byte character can be split between reads.
    import codecs
    decoder = codecs.getincrementaldecoder('utf-8')('replace')
    with open(OUT, 'w', encoding='utf-8') as f:
        header = {'version': 2, 'width': COLS, 'height': ROWS, 'timestamp': int(start),
                  'env': {'TERM': 'xterm-256color', 'SHELL': '/bin/sh'}, 'title': 'flowtty showcase'}
        f.write(json.dumps(header) + '\n')
        for t, chunk in events:
            text = decoder.decode(chunk)
            if text:
                f.write(json.dumps([round(t, 4), 'o', text], ensure_ascii=False) + '\n')

    seconds = events[-1][0] if events else 0
    size = sum(len(c) for _, c in events)
    print(f'{os.path.relpath(OUT, ROOT)}: {seconds:.1f}s, {len(events)} chunks, {size / 1024:.0f} kB of terminal output (exit {code})')
    return code

if __name__ == '__main__':
    sys.exit(main())
