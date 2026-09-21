import { describe, expect, test } from 'vitest';
import { highlightBlock, type CodeLine, type CodeSeg } from './index.js';

const one = (line: string, lang: string): CodeSeg[] => highlightBlock([line], lang)[0]!.segs;
const seg = (segs: CodeSeg[], text: string): CodeSeg | undefined => segs.find((s) => s.text === text);
const styleOf = (segs: CodeSeg[], text: string): CodeSeg => {
  const found = seg(segs, text);
  if (!found) throw new Error(`no segment ${JSON.stringify(text)} in ${JSON.stringify(segs)}`);
  return found;
};
const joined = (lines: CodeLine[]): string[] => lines.map((l) => l.segs.map((s) => s.text).join(''));

describe('javascript / typescript', () => {
  test('keywords, strings, numbers and comments', () => {
    const segs = one("const x = 'hi'; // note", 'ts');
    expect(styleOf(segs, 'const').color).toBe('magenta');
    expect(styleOf(segs, "'hi'").color).toBe('green');
    expect(styleOf(segs, '// note').dim).toBe(true);
    expect(styleOf(one('let n = 42;', 'js'), '42').color).toBe('yellow');
  });

  test('a block comment spans lines', () => {
    const out = highlightBlock(['/* one', 'still comment', 'end */ const x = 1;'], 'js');
    expect(out[1]!.segs).toEqual([{ text: 'still comment', dim: true }]);
    expect(styleOf(out[2]!.segs, 'end */').dim).toBe(true);
    expect(styleOf(out[2]!.segs, 'const').color).toBe('magenta');
  });

  test('a template literal spans lines', () => {
    const out = highlightBlock(['const t = `one', 'two`;'], 'ts');
    expect(styleOf(out[0]!.segs, '`one').color).toBe('green');
    expect(styleOf(out[1]!.segs, 'two`').color).toBe('green');
  });
});

describe('jsx markup', () => {
  test('tags, components and attributes reuse the html colors', () => {
    const segs = one('return <div className="x">', 'tsx');
    expect(styleOf(segs, '<div').color).toBe('blue');
    expect(styleOf(segs, 'className').color).toBe('yellow');
    expect(styleOf(segs, '"x"').color).toBe('green');
    expect(styleOf(one('const a = <Box.Inner flex />;', 'jsx'), 'Box.Inner').color).toBe('cyan');
  });

  test('a `{…}` attribute value goes back to the JavaScript highlighter', () => {
    const segs = one('<Item value={typeof x} />', 'tsx');
    expect(styleOf(segs, 'typeof').color).toBe('magenta');
    expect(styleOf(segs, 'Item').color).toBe('cyan');
  });

  test('the `<` heuristic', () => {
    // Not markup: a comparison, or a type argument.
    expect(one('if (a < b) return;', 'ts').some((s) => s.color === 'blue')).toBe(false);
    expect(one('const [s] = useState<string>();', 'ts').some((s) => s.color === 'blue')).toBe(false);
    // Markup: after a keyword, after `(`, after an operator.
    expect(styleOf(one('return <div>;', 'tsx'), '<div>').color).toBe('blue');
    expect(styleOf(one('render(<Box />);', 'tsx'), 'Box').color).toBe('cyan');
    expect(styleOf(one('ok && <X />', 'tsx'), 'X').color).toBe('cyan');
  });

  test('a tag that spans lines keeps its markup colors', () => {
    const out = highlightBlock(['return (', '  <Box', '    flex', '  />', ');'], 'tsx');
    expect(styleOf(out[1]!.segs, 'Box').color).toBe('cyan');
    expect(styleOf(out[2]!.segs, 'flex').color).toBe('yellow');
    expect(joined(out)).toEqual(['return (', '  <Box', '    flex', '  />', ');']);
  });
});

describe('json', () => {
  test('keys, strings, numbers and literals', () => {
    const segs = one('{ "k": "v", "n": 1.5, "b": true }', 'json');
    expect(styleOf(segs, '"k"').color).toBe('cyan');
    expect(styleOf(segs, '"v"').color).toBe('green');
    expect(styleOf(segs, '1.5').color).toBe('yellow');
    expect(styleOf(segs, 'true').color).toBe('magenta');
  });
});

describe('html / xml', () => {
  test('tags, attributes and entities', () => {
    const segs = one('<a href="/x" data-y=\'1\'>&amp;</a>', 'html');
    expect(styleOf(segs, '<a').color).toBe('blue');
    expect(styleOf(segs, '</a>').color).toBe('blue');
    expect(styleOf(segs, 'href').color).toBe('yellow');
    expect(styleOf(segs, '"/x"').color).toBe('green');
    expect(styleOf(segs, '&amp;').color).toBe('magenta');
  });

  test('a comment spans lines', () => {
    const out = highlightBlock(['<p><!-- one', 'two --><b>x</b>'], 'html');
    expect(out[1]!.segs[0]).toEqual({ text: 'two -->', dim: true });
    expect(styleOf(out[1]!.segs, '<b>').color).toBe('blue');
  });

  test('the xml declaration, DOCTYPE and namespaced names', () => {
    expect(one('<?xml version="1.0"?>', 'xml')[0]).toEqual({
      text: '<?xml version="1.0"?>', color: 'magenta',
    });
    expect(one('<!DOCTYPE html>', 'xml')[0]!.color).toBe('magenta');
    const ns = one('<xs:element android:layout_width="1" />', 'xsd');
    expect(styleOf(ns, '<xs:element').color).toBe('blue');
    expect(styleOf(ns, 'android:layout_width').color).toBe('yellow');
  });

  test('CDATA spans lines and its content is plain', () => {
    const out = highlightBlock(['<x><![CDATA[ a < b', 'still & raw ]]></x>'], 'xml');
    expect(styleOf(out[0]!.segs, '<![CDATA[').color).toBe('magenta');
    expect(out[0]!.segs[out[0]!.segs.length - 1]).toEqual({ text: ' a < b' });
    expect(out[1]!.segs[0]).toEqual({ text: 'still & raw ' });
    expect(joined(out)).toEqual(['<x><![CDATA[ a < b', 'still & raw ]]></x>']);
  });
});

describe('css', () => {
  test('selectors, properties, values and at-rules', () => {
    const out = highlightBlock(['@media (min-width: 40rem) {', '.a > b:hover {', '  color: #fff;', '  margin: 0 1px;', '}', '}'], 'css');
    expect(styleOf(out[0]!.segs, '@media').color).toBe('magenta');
    expect(styleOf(out[1]!.segs, '.a').color).toBe('yellow');
    expect(styleOf(out[2]!.segs, 'color').color).toBe('cyan');
    expect(styleOf(out[2]!.segs, '#fff').color).toBe('yellow');
    expect(styleOf(out[3]!.segs, '1px').color).toBe('yellow');
  });

  test('a comment spans lines and a url() is not a comment', () => {
    const out = highlightBlock(['/* a', 'b */ .c { background: url(http://x/y.png); }'], 'scss');
    expect(out[0]!.segs).toEqual([{ text: '/* a', dim: true }]);
    expect(styleOf(out[1]!.segs, 'url(http://x/y.png)').color).toBe('green');
  });
});

describe('shell and console', () => {
  test('the command word, variables, strings and comments', () => {
    const segs = one('npm run build --flag # go', 'bash');
    expect(styleOf(segs, 'npm').color).toBe('blue');
    expect(styleOf(segs, '# go').dim).toBe(true);
    expect(styleOf(one('echo "$HOME/x"', 'zsh'), '"$HOME/x"').color).toBe('green');
    expect(styleOf(one('cd $HOME', 'sh'), '$HOME').color).toBe('cyan');
  });

  test('a console transcript: prompt lines are code, output is dim', () => {
    const out = highlightBlock(['$ npm test', 'ok, 3 passed', '# whoami'], 'console');
    expect(out[0]!.segs[0]).toEqual({ text: '$', dim: true });
    expect(styleOf(out[0]!.segs, 'npm').color).toBe('blue');
    expect(out[1]!.segs).toEqual([{ text: 'ok, 3 passed', dim: true }]);
    expect(out[2]!.segs[0]!.dim).toBe(true);
  });

  test('a `>` output line is output, not a prompt', () => {
    const [line] = highlightBlock(['> flowtty@1.0.0 test'], 'shell-session');
    expect(line!.segs).toEqual([{ text: '> flowtty@1.0.0 test', dim: true }]);
  });

  test('a `user@host:~$` prompt is recognised', () => {
    const [line] = highlightBlock(['user@host:~/dev$ ls -la'], 'console');
    expect(line!.segs[0]).toEqual({ text: 'user@host:~/dev$', dim: true });
    expect(line!.segs.find((s) => s.text === 'ls')?.color).toBe('blue');
  });
});

describe('yaml, toml', () => {
  test('yaml keys, values and comments', () => {
    const segs = one('name: "flowtty"  # a string', 'yaml');
    expect(styleOf(segs, 'name').color).toBe('cyan');
    expect(styleOf(segs, '"flowtty"').color).toBe('green');
    expect(styleOf(segs, '# a string').dim).toBe(true);
    expect(styleOf(one('  enabled: true', 'yml'), 'true').color).toBe('magenta');
  });

  test('toml sections, keys and multi-line strings', () => {
    const out = highlightBlock(['[tool.x]', 'name = "a"', 'text = """one', 'two"""'], 'toml');
    expect(styleOf(out[0]!.segs, '[tool.x]').color).toBe('cyan');
    expect(styleOf(out[1]!.segs, 'name').color).toBe('cyan');
    expect(out[3]!.segs[0]).toEqual({ text: 'two"""', color: 'green' });
  });
});

describe('sql', () => {
  test('keywords are case-insensitive', () => {
    const segs = one("SELECT id FROM t WHERE a = 'x' -- note", 'sql');
    expect(styleOf(segs, 'SELECT').color).toBe('magenta');
    expect(styleOf(segs, 'FROM').color).toBe('magenta');
    expect(styleOf(segs, "'x'").color).toBe('green');
    expect(styleOf(segs, '-- note').dim).toBe(true);
    expect(styleOf(one('select 1', 'mysql'), 'select').color).toBe('magenta');
  });
});

describe('python, go, rust', () => {
  test('python keywords, decorators and triple-quoted strings', () => {
    const out = highlightBlock(['@cache', 'def f(x):', '    """doc', '    more"""', '    return 1  # ok'], 'py');
    expect(styleOf(out[0]!.segs, '@cache').color).toBe('cyan');
    expect(styleOf(out[1]!.segs, 'def').color).toBe('magenta');
    expect(styleOf(out[2]!.segs, '"""doc').color).toBe('green');
    expect(out[3]!.segs[0]).toEqual({ text: '    more"""', color: 'green' });
    expect(styleOf(out[4]!.segs, '# ok').dim).toBe(true);
  });

  test('go raw strings span lines', () => {
    const out = highlightBlock(['q := `one', 'two`', 'func main() {}'], 'go');
    expect(styleOf(out[1]!.segs, 'two`').color).toBe('green');
    expect(styleOf(out[2]!.segs, 'func').color).toBe('magenta');
  });

  test('rust lifetimes, macros and char literals', () => {
    const segs = one("fn f<'a>(s: &'a str) { println!(\"{}\", 'c'); }", 'rs');
    expect(styleOf(segs, 'fn').color).toBe('magenta');
    expect(styleOf(segs, "'a").color).toBe('blue');
    expect(styleOf(segs, 'println!').color).toBe('magenta');
    expect(styleOf(segs, "'c'").color).toBe('green');
  });
});

describe('c family', () => {
  test('a preprocessor line is a directive and `#` is not a comment', () => {
    const segs = one('#include <stdio.h>', 'c');
    expect(styleOf(segs, '#include').color).toBe('magenta');
    expect(styleOf(segs, '<stdio.h>').color).toBe('green');
    const def = one('  #define N 4  // four', 'cpp');
    expect(styleOf(def, '#define').color).toBe('magenta');
    expect(styleOf(def, '4').color).toBe('yellow');
    expect(styleOf(def, '// four').dim).toBe(true);
  });

  test('keywords of each dialect', () => {
    expect(styleOf(one('static int x = 0;', 'h'), 'static').color).toBe('magenta');
    expect(styleOf(one('constexpr auto v = 1;', 'c++'), 'constexpr').color).toBe('magenta');
  });
});

describe('java, kotlin, swift, csharp', () => {
  test('annotations get their own color', () => {
    expect(styleOf(one('@Override public void run() {}', 'java'), '@Override').color).toBe('cyan');
    expect(styleOf(one('@Composable fun A() {}', 'kt'), '@Composable').color).toBe('cyan');
    expect(styleOf(one('@MainActor func go() {}', 'swift'), '@MainActor').color).toBe('cyan');
  });

  test('triple-quoted strings span lines', () => {
    const out = highlightBlock(['val s = """one', 'two"""', 'val n = 1'], 'kotlin');
    expect(styleOf(out[1]!.segs, 'two"""').color).toBe('green');
    expect(styleOf(out[2]!.segs, 'val').color).toBe('magenta');
  });

  test('swift interpolation stays inside the string', () => {
    const segs = one('let s = "hi \\(name)"', 'swift');
    expect(styleOf(segs, '"hi \\(name)"').color).toBe('green');
  });

  test('csharp keywords and attributes', () => {
    const segs = one('public async Task Run() // go', 'cs');
    expect(styleOf(segs, 'public').color).toBe('magenta');
    expect(styleOf(segs, '// go').dim).toBe(true);
  });
});

describe('tape-machine toolchains', () => {
  test('pmc: step labels, calls, commands and the `!` terminator', () => {
    const out = highlightBlock([
      '// adds two unary numbers',
      'use std::goToEnd, std::goToBegin;',
      'main() {',
      '     1: @goToEnd();',
      '     2: right;',
      '    13: @goToBegin(!);',
      '}',
    ], 'pmc');
    expect(out[0]!.segs[0]!.dim).toBe(true);
    expect(styleOf(out[1]!.segs, 'use').color).toBe('magenta');
    expect(styleOf(out[3]!.segs, '1:').color).toBe('cyan');
    expect(styleOf(out[3]!.segs, '@goToEnd').color).toBe('blue');
    expect(styleOf(out[4]!.segs, 'right').color).toBe('magenta');
    expect(styleOf(out[5]!.segs, '!').color).toBe('magenta');
    // `::` is a namespace separator, never a label.
    expect(seg(out[1]!.segs, '::')?.color).toBeUndefined();
  });

  test('pma: directives, mnemonics (dotted forms included) and labels', () => {
    const out = highlightBlock([
      '; a comment',
      '.func right9 local',
      '        rgt',
      'L0018:  jm.s    L0018',
      '        call    std::goToEnd',
      '        wr      0',
      '        ret',
    ], 'pma');
    expect(out[0]!.segs[0]!.dim).toBe(true);
    expect(styleOf(out[1]!.segs, '.func').color).toBe('magenta');
    expect(styleOf(out[1]!.segs, 'local').color).toBe('magenta');
    expect(styleOf(out[2]!.segs, 'rgt').color).toBe('magenta');
    expect(styleOf(out[3]!.segs, 'L0018:').color).toBe('cyan');
    expect(styleOf(out[3]!.segs, 'jm.s').color).toBe('magenta');
    expect(styleOf(out[4]!.segs, 'call').color).toBe('magenta');
    expect(styleOf(out[5]!.segs, '0').color).toBe('yellow');
  });

  test('tmc: keywords, symbol literals and `?` doc comments', () => {
    const out = highlightBlock([
      '? The delimited binary representation.',
      '! watch the head convention',
      "alphabet bin { '_', '^', '$', '0', '1' }",
      'routine step { goto next; }',
      '/* block',
      '   comment */',
    ], 'tmc');
    expect(out[0]!.segs).toEqual([{ text: '? The delimited binary representation.', dim: true }]);
    expect(out[1]!.segs[0]!.dim).toBe(true);
    expect(styleOf(out[2]!.segs, 'alphabet').color).toBe('magenta');
    expect(styleOf(out[2]!.segs, "'_'").color).toBe('green');
    expect(styleOf(out[3]!.segs, 'routine').color).toBe('magenta');
    expect(out[5]!.segs[0]!.dim).toBe(true);
  });

  test('tma: section directives, match rows and mnemonics', () => {
    const out = highlightBlock([
      '; brainfuck UTM',
      '.section tables',
      'Tfetch: .row    [1,*,*,*]       ; +',
      '        rd',
      '        mtc     Tfetch',
      '        wrmv    [-,-,-,-]',
    ], 'tma');
    expect(styleOf(out[1]!.segs, '.section').color).toBe('magenta');
    expect(styleOf(out[2]!.segs, 'Tfetch:').color).toBe('cyan');
    expect(styleOf(out[2]!.segs, '.row').color).toBe('magenta');
    expect(styleOf(out[2]!.segs, '; +').dim).toBe(true);
    expect(styleOf(out[3]!.segs, 'rd').color).toBe('magenta');
    expect(styleOf(out[5]!.segs, 'wrmv').color).toBe('magenta');
  });
});
